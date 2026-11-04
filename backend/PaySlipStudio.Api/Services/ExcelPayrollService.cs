using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using ExcelDataReader;
using Microsoft.EntityFrameworkCore;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;

namespace PaySlipStudio.Api.Services;

public class ExcelPayrollService
{
    private readonly ApplicationDbContext _db;
    private readonly AuditService _audit;
    private readonly string _storageRoot;

    public ExcelPayrollService(ApplicationDbContext db, AuditService audit, IConfiguration config, IWebHostEnvironment env)
    {
        _db = db;
        _audit = audit;
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

        var configuredPath = config["Storage:RootPath"] ?? "Storage/PrivateVault";
        _storageRoot = Path.IsPathRooted(configuredPath)
            ? configuredPath
            : Path.Combine(env.ContentRootPath, configuredPath);

        Directory.CreateDirectory(Path.Combine(_storageRoot, "Imports"));
        Directory.CreateDirectory(Path.Combine(_storageRoot, "Exports"));
    }

    public static string FormatPeriodLabel(int month, int year)
    {
        var dt = new DateTime(Math.Clamp(year, 2000, 2100), Math.Clamp(month, 1, 12), 1);
        return dt.ToString("MMMM yyyy", CultureInfo.InvariantCulture);
    }

    // ========================================================================
    // STEP 1-3: UPLOAD FILE & INSPECT WORKSHEETS
    // ========================================================================
    public async Task<ExcelUploadSummaryDto> StageUploadAsync(
        Stream fileStream,
        string originalFileName,
        int month,
        int year,
        string userId,
        string userName)
    {
        var ext = Path.GetExtension(originalFileName).ToLowerInvariant();
        if (ext is not (".xlsx" or ".xls" or ".csv"))
        {
            throw new InvalidOperationException("Unsupported file format. Please upload an .xlsx, .xls, or .csv file.");
        }

        using var ms = new MemoryStream();
        await fileStream.CopyToAsync(ms);
        var bytes = ms.ToArray();

        if (bytes.Length == 0)
        {
            throw new InvalidOperationException("The uploaded file is empty.");
        }

        if (bytes.Length > 20 * 1024 * 1024)
        {
            throw new InvalidOperationException("File exceeds maximum allowed size of 20 MB.");
        }

        var sha256 = Convert.ToHexStringLower(SHA256.HashData(bytes));
        var safeFileName = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}{ext}";
        var storedPath = Path.Combine(_storageRoot, "Imports", safeFileName);
        await File.WriteAllBytesAsync(storedPath, bytes);

        var periodLabel = FormatPeriodLabel(month, year);
        var period = await GetOrCreatePeriodAsync(month, year);

        var worksheets = InspectWorksheets(bytes, ext, originalFileName);
        if (worksheets.Count == 0)
        {
            throw new InvalidOperationException("No readable worksheets were found in the uploaded file.");
        }

        // Auto-select worksheet matching the period label if available
        var matchingSheet = worksheets.FirstOrDefault(w =>
            w.Name.Equals(periodLabel, StringComparison.OrdinalIgnoreCase) ||
            w.Name.Contains(periodLabel.Split(' ')[0], StringComparison.OrdinalIgnoreCase))
            ?? worksheets[0];

        var existingCount = await _db.PayrollRecords.CountAsync(r => r.PayrollPeriodId == period.Id);

        var batch = new ImportBatch
        {
            PayrollPeriodId = period.Id,
            SourceFileName = originalFileName,
            StoredFilePath = storedPath,
            FileSha256 = sha256,
            SelectedWorksheet = matchingSheet.Name,
            TotalRowsDetected = Math.Max(0, matchingSheet.RowCount - 1),
            Status = "Staged",
            UploadedByUserId = userId,
            UploadedByUserName = userName,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.ImportBatches.Add(batch);
        await _db.SaveChangesAsync();

        return new ExcelUploadSummaryDto
        {
            ImportBatchId = batch.Id,
            FileName = originalFileName,
            FileSizeBytes = bytes.Length,
            FileSha256 = sha256,
            Month = month,
            Year = year,
            PeriodLabel = periodLabel,
            Worksheets = worksheets,
            SelectedWorksheet = matchingSheet.Name,
            HasExistingRecordsForPeriod = existingCount > 0,
            ExistingRecordCountForPeriod = existingCount
        };
    }

    // ========================================================================
    // STEP 4 & 5: DETECT MAPPINGS, VALIDATE & PREVIEW
    // ========================================================================
    public async Task<ImportValidationPreviewDto> AnalyzeAndPreviewAsync(
        Guid importBatchId,
        string? worksheetName = null,
        int? overrideMonth = null,
        int? overrideYear = null,
        List<ColumnMappingDefinitionDto>? customMappings = null)
    {
        var batch = await _db.ImportBatches
            .Include(b => b.PayrollPeriod)
            .FirstOrDefaultAsync(b => b.Id == importBatchId)
            ?? throw new KeyNotFoundException("Import batch not found.");

        if (overrideMonth.HasValue && overrideYear.HasValue)
        {
            var newPeriod = await GetOrCreatePeriodAsync(overrideMonth.Value, overrideYear.Value);
            batch.PayrollPeriodId = newPeriod.Id;
            batch.PayrollPeriod = newPeriod;
        }

        var period = batch.PayrollPeriod!;
        var targetSheet = !string.IsNullOrWhiteSpace(worksheetName) ? worksheetName! : batch.SelectedWorksheet;
        batch.SelectedWorksheet = targetSheet;

        if (!File.Exists(batch.StoredFilePath))
        {
            throw new FileNotFoundException("Stored upload file is missing on server.");
        }

        var bytes = await File.ReadAllBytesAsync(batch.StoredFilePath);
        var ext = Path.GetExtension(batch.StoredFilePath).ToLowerInvariant();

        var parsedSheet = ReadSheetCells(bytes, ext, targetSheet);
        if (parsedSheet.Headers.Count == 0)
        {
            throw new InvalidOperationException($"Worksheet '{targetSheet}' contains no header columns.");
        }

        List<ColumnMappingDefinitionDto> mappings;
        if (customMappings != null && customMappings.Count > 0)
        {
            mappings = customMappings;
        }
        else
        {
            mappings = AutoDetectColumnMappings(parsedSheet);
        }

        var existingEmployeeCodes = await _db.PayrollRecords
            .Where(r => r.PayrollPeriodId == period.Id)
            .Select(r => r.ImportedEmployeeCode.ToUpper())
            .ToListAsync();
        var existingSet = new HashSet<string>(existingEmployeeCodes, StringComparer.OrdinalIgnoreCase);

        bool isDuplicateFileUpload = await _db.ImportBatches.AnyAsync(b =>
            b.Id != batch.Id &&
            b.PayrollPeriodId == period.Id &&
            b.FileSha256 == batch.FileSha256 &&
            b.SelectedWorksheet == targetSheet &&
            b.Status == "Committed");

        var preview = new ImportValidationPreviewDto
        {
            ImportBatchId = batch.Id,
            FileName = batch.SourceFileName,
            SelectedWorksheet = targetSheet,
            Month = period.Month,
            Year = period.Year,
            PeriodLabel = period.PeriodLabel,
            HasExistingRecordsForPeriod = existingSet.Count > 0,
            ExistingRecordCountForPeriod = existingSet.Count,
            IsDuplicateFileUpload = isDuplicateFileUpload,
            ColumnMappings = mappings
        };

        if (!mappings.Any(m => m.MappedRole == "EmployeeId"))
        {
            preview.GlobalIssues.Add("Missing required column mapping: 'Employee ID'. Please map a column to Employee ID.");
        }
        if (!mappings.Any(m => m.MappedRole == "EmployeeName"))
        {
            preview.GlobalIssues.Add("Missing required column mapping: 'Employee Name'. Please map a column to Employee Name.");
        }

        var seenIdsInSheet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var rawRow in parsedSheet.Rows)
        {
            // Skip completely blank trailing rows
            if (rawRow.Cells.All(c => c.CellType == SourceCellTypes.Empty))
            {
                continue;
            }

            var rowDto = new PreviewEmployeeRowDto
            {
                RowNumber = rawRow.RowNumber
            };

            foreach (var colMap in mappings)
            {
                var cell = rawRow.Cells.FirstOrDefault(c => c.ColumnIndex == colMap.ColumnIndex)
                    ?? new RawParsedCell { ColumnIndex = colMap.ColumnIndex, CellType = SourceCellTypes.Empty };

                var previewCell = new PreviewCellDto
                {
                    ColumnIndex = colMap.ColumnIndex,
                    HeaderText = colMap.HeaderText,
                    MappedRole = colMap.MappedRole,
                    SourceCellType = cell.CellType,
                    RawText = cell.RawText,
                    NumericValue = cell.NumericValue,
                    IsFormula = cell.IsFormula,
                    IsFormulaUncertain = cell.IsFormulaUncertain
                };

                if (cell.IsFormulaUncertain)
                {
                    rowDto.Warnings.Add($"Column '{colMap.HeaderText}' contains a formula with an unverified cached value.");
                }

                switch (colMap.MappedRole)
                {
                    case "EmployeeId":
                        rowDto.EmployeeCode = (cell.RawText ?? string.Empty).Trim();
                        break;
                    case "EmployeeName":
                        rowDto.EmployeeName = (cell.RawText ?? string.Empty).Trim();
                        break;
                    case "Email":
                        rowDto.Email = (cell.RawText ?? string.Empty).Trim();
                        break;
                    case "Department":
                        rowDto.Department = (cell.RawText ?? string.Empty).Trim();
                        break;
                    case "Designation":
                        rowDto.Designation = (cell.RawText ?? string.Empty).Trim();
                        break;
                    case "PayrollMonth":
                        rowDto.PayrollMonthCell = (cell.RawText ?? string.Empty).Trim();
                        break;
                    case "GrossSalary":
                        rowDto.GrossSalary = cell.NumericValue;
                        if (cell.CellType == SourceCellTypes.Text)
                            rowDto.Errors.Add($"Invalid numeric value '{cell.RawText}' in Gross Salary.");
                        break;
                    case "TotalDeductions":
                        rowDto.TotalDeductions = cell.NumericValue;
                        if (cell.CellType == SourceCellTypes.Text)
                            rowDto.Errors.Add($"Invalid numeric value '{cell.RawText}' in Total Deductions.");
                        break;
                    case "NetSalary":
                        rowDto.NetSalary = cell.NumericValue;
                        if (cell.CellType == SourceCellTypes.Text)
                            rowDto.Errors.Add($"Invalid numeric value '{cell.RawText}' in Net Salary.");
                        break;
                    case "Earning":
                    case "Allowance":
                    case "Deduction":
                    case "EmployerContribution":
                    case "CustomMonetary":
                        if (cell.CellType == SourceCellTypes.Text && !string.IsNullOrWhiteSpace(cell.RawText))
                        {
                            rowDto.Errors.Add($"Column '{colMap.HeaderText}' expects a monetary amount but found text '{cell.RawText}'.");
                        }
                        break;
                }

                rowDto.Cells.Add(previewCell);
            }

            if (string.IsNullOrWhiteSpace(rowDto.EmployeeCode))
            {
                rowDto.Errors.Add("Missing Employee ID.");
            }
            else
            {
                if (!seenIdsInSheet.Add(rowDto.EmployeeCode))
                {
                    rowDto.Errors.Add($"Duplicate Employee ID '{rowDto.EmployeeCode}' within this worksheet.");
                }
                if (existingSet.Contains(rowDto.EmployeeCode))
                {
                    rowDto.IsReplacementOfExisting = true;
                    rowDto.Warnings.Add($"Employee '{rowDto.EmployeeCode}' already has a record in {period.PeriodLabel} and will be updated if confirmed.");
                }
            }

            if (string.IsNullOrWhiteSpace(rowDto.EmployeeName))
            {
                rowDto.Errors.Add("Missing Employee Name.");
            }

            if (!string.IsNullOrWhiteSpace(rowDto.Email) && !IsValidEmail(rowDto.Email))
            {
                rowDto.Warnings.Add($"Email '{rowDto.Email}' is not a valid email format.");
            }
            else if (string.IsNullOrWhiteSpace(rowDto.Email))
            {
                rowDto.Warnings.Add("Employee email is empty (required before sending payslip by email).");
            }

            if (!string.IsNullOrWhiteSpace(rowDto.PayrollMonthCell) &&
                !rowDto.PayrollMonthCell.Equals(period.PeriodLabel, StringComparison.OrdinalIgnoreCase))
            {
                rowDto.Warnings.Add($"Row Payroll Month '{rowDto.PayrollMonthCell}' differs from selected period '{period.PeriodLabel}'.");
            }

            preview.Rows.Add(rowDto);
        }

        preview.TotalRows = preview.Rows.Count;
        preview.RowsWithErrors = preview.Rows.Count(r => r.Errors.Count > 0);
        preview.RowsWithWarnings = preview.Rows.Count(r => r.Warnings.Count > 0);
        preview.ValidRows = preview.Rows.Count(r => r.Errors.Count == 0);

        batch.TotalRowsDetected = preview.TotalRows;
        batch.WarningCount = preview.RowsWithWarnings;
        batch.ErrorCount = preview.RowsWithErrors;
        batch.ColumnMappingsJson = JsonSerializer.Serialize(mappings);
        batch.StagedPreviewJson = JsonSerializer.Serialize(preview);

        await _db.SaveChangesAsync();
        return preview;
    }

    // ========================================================================
    // STEP 6: CONFIRM & COMMIT IMPORT BATCH
    // ========================================================================
    public async Task<ImportBatch> CommitImportBatchAsync(
        Guid importBatchId,
        bool allowReplaceExisting,
        string actorUserId,
        string actorUserName,
        string actorRole)
    {
        var batch = await _db.ImportBatches
            .Include(b => b.PayrollPeriod)
            .FirstOrDefaultAsync(b => b.Id == importBatchId)
            ?? throw new KeyNotFoundException("Import batch not found.");

        if (batch.Status == "Committed")
        {
            throw new InvalidOperationException("This import batch has already been committed.");
        }

        var preview = await AnalyzeAndPreviewAsync(
            importBatchId,
            batch.SelectedWorksheet,
            batch.PayrollPeriod?.Month,
            batch.PayrollPeriod?.Year,
            JsonSerializer.Deserialize<List<ColumnMappingDefinitionDto>>(batch.ColumnMappingsJson));

        if (preview.GlobalIssues.Count > 0)
        {
            throw new InvalidOperationException(string.Join(" ", preview.GlobalIssues));
        }

        if (preview.HasExistingRecordsForPeriod && !allowReplaceExisting)
        {
            throw new InvalidOperationException(
                $"Period '{preview.PeriodLabel}' already contains {preview.ExistingRecordCountForPeriod} records. Explicit confirmation is required to replace/update existing period records.");
        }

        var validRows = preview.Rows.Where(r => r.Errors.Count == 0).ToList();
        if (validRows.Count == 0)
        {
            throw new InvalidOperationException("No valid employee rows are available to import.");
        }

        var period = batch.PayrollPeriod!;
        var mappingsByCol = preview.ColumnMappings.ToDictionary(m => m.ColumnIndex);

        int importedCount = 0;

        foreach (var row in validRows)
        {
            var codeNormalized = row.EmployeeCode.Trim();
            var employee = await _db.Employees
                .FirstOrDefaultAsync(e => e.EmployeeCode.ToLower() == codeNormalized.ToLower());

            if (employee == null)
            {
                employee = new Employee
                {
                    EmployeeCode = codeNormalized,
                    FullName = row.EmployeeName,
                    Email = row.Email,
                    Department = row.Department,
                    Designation = row.Designation,
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow,
                    UpdatedAtUtc = DateTime.UtcNow
                };
                _db.Employees.Add(employee);
                await _db.SaveChangesAsync();
            }
            else
            {
                employee.FullName = row.EmployeeName;
                if (!string.IsNullOrWhiteSpace(row.Email)) employee.Email = row.Email;
                if (!string.IsNullOrWhiteSpace(row.Department)) employee.Department = row.Department;
                if (!string.IsNullOrWhiteSpace(row.Designation)) employee.Designation = row.Designation;
                employee.UpdatedAtUtc = DateTime.UtcNow;
            }

            // Build immutable snapshot dictionary of the entire row
            var rawSnapshot = new Dictionary<string, object?>();
            foreach (var cell in row.Cells)
            {
                rawSnapshot[cell.HeaderText] = new
                {
                    cell.SourceCellType,
                    cell.RawText,
                    cell.NumericValue,
                    cell.MappedRole,
                    cell.IsFormula,
                    cell.IsFormulaUncertain
                };
            }

            var existingRecord = await _db.PayrollRecords
                .Include(r => r.Components)
                .FirstOrDefaultAsync(r => r.PayrollPeriodId == period.Id && r.EmployeeId == employee.Id);

            if (existingRecord != null)
            {
                _db.PayrollComponentValues.RemoveRange(existingRecord.Components);
                existingRecord.ImportBatchId = batch.Id;
                existingRecord.ImportedEmployeeCode = codeNormalized;
                existingRecord.ImportedEmployeeName = row.EmployeeName;
                existingRecord.ImportedEmail = row.Email;
                existingRecord.ImportedDepartment = row.Department;
                existingRecord.ImportedDesignation = row.Designation;
                existingRecord.ImportedPayrollMonthText = !string.IsNullOrWhiteSpace(row.PayrollMonthCell)
                    ? row.PayrollMonthCell
                    : period.PeriodLabel;
                existingRecord.ImportedGrossSalary = row.GrossSalary;
                existingRecord.ImportedTotalDeductions = row.TotalDeductions;
                existingRecord.ImportedNetSalary = row.NetSalary;
                existingRecord.OverrideGrossSalary = null;
                existingRecord.OverrideTotalDeductions = null;
                existingRecord.OverrideNetSalary = null;
                existingRecord.OverrideEmployeeName = null;
                existingRecord.OverrideEmail = null;
                existingRecord.OverrideDepartment = null;
                existingRecord.OverrideDesignation = null;
                existingRecord.SourceRowSnapshotJson = JsonSerializer.Serialize(rawSnapshot);
                existingRecord.Status = "Imported";
                existingRecord.UpdatedAtUtc = DateTime.UtcNow;
                existingRecord.LastModifiedByUserName = actorUserName;
            }
            else
            {
                existingRecord = new PayrollRecord
                {
                    EmployeeId = employee.Id,
                    PayrollPeriodId = period.Id,
                    ImportBatchId = batch.Id,
                    ImportedEmployeeCode = codeNormalized,
                    ImportedEmployeeName = row.EmployeeName,
                    ImportedEmail = row.Email,
                    ImportedDepartment = row.Department,
                    ImportedDesignation = row.Designation,
                    ImportedPayrollMonthText = !string.IsNullOrWhiteSpace(row.PayrollMonthCell)
                        ? row.PayrollMonthCell
                        : period.PeriodLabel,
                    ImportedGrossSalary = row.GrossSalary,
                    ImportedTotalDeductions = row.TotalDeductions,
                    ImportedNetSalary = row.NetSalary,
                    SourceRowSnapshotJson = JsonSerializer.Serialize(rawSnapshot),
                    Status = "Imported",
                    CreatedAtUtc = DateTime.UtcNow,
                    UpdatedAtUtc = DateTime.UtcNow,
                    LastModifiedByUserName = actorUserName
                };
                _db.PayrollRecords.Add(existingRecord);
                await _db.SaveChangesAsync();
            }

            // Persist all salary components and custom fields for this employee's row
            int sortOrder = 1;
            foreach (var cell in row.Cells)
            {
                if (!mappingsByCol.TryGetValue(cell.ColumnIndex, out var mapDef))
                    continue;

                if (mapDef.MappedRole is "EmployeeId" or "EmployeeName" or "Email" or "Department" or "Designation" or "PayrollMonth"
                    or "GrossSalary" or "TotalDeductions" or "NetSalary" or "Ignore")
                {
                    continue;
                }

                string category = mapDef.MappedRole switch
                {
                    "Earning" => ComponentCategories.Earning,
                    "Allowance" => ComponentCategories.Allowance,
                    "Deduction" => ComponentCategories.Deduction,
                    "EmployerContribution" => ComponentCategories.EmployerContribution,
                    "CustomMonetary" => ComponentCategories.CustomMonetary,
                    "CustomText" => ComponentCategories.CustomText,
                    _ => ComponentCategories.CustomText
                };

                var compVal = new PayrollComponentValue
                {
                    PayrollRecordId = existingRecord.Id,
                    ComponentKey = NormalizeComponentKey(mapDef.HeaderText),
                    OriginalLabel = mapDef.HeaderText,
                    OverrideLabel = !string.IsNullOrWhiteSpace(mapDef.DisplayLabel) && mapDef.DisplayLabel != mapDef.HeaderText
                        ? mapDef.DisplayLabel
                        : null,
                    Category = category,
                    SortOrder = sortOrder++,
                    SourceCellType = cell.SourceCellType,
                    RawSourceText = cell.RawText,
                    // Note: Section 8 Rule 8 — numeric 0 is stored as 0m with SourceCellType=NumericZero,
                    // while blank cell is stored as null with SourceCellType=Empty!
                    ImportedNumericValue = cell.NumericValue,
                    ImportedTextValue = category == ComponentCategories.CustomText ? cell.RawText : null,
                    IsFormulaCell = cell.IsFormula,
                    IsFormulaUncertain = cell.IsFormulaUncertain,
                    IsManuallyAdded = false,
                    HasManualOverride = false,
                    UpdatedAtUtc = DateTime.UtcNow
                };

                _db.PayrollComponentValues.Add(compVal);
            }

            importedCount++;
        }

        batch.ValidRowsImported = importedCount;
        batch.Status = "Committed";
        batch.CommittedAtUtc = DateTime.UtcNow;

        // Also update active payroll period in CompanySettings so operator sees imported period immediately
        var settings = await _db.CompanySettings.FirstOrDefaultAsync();
        if (settings != null)
        {
            settings.ActivePayrollMonth = period.Month;
            settings.ActivePayrollYear = period.Year;
            settings.UpdatedAtUtc = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        await _audit.RecordAsync(
            actorUserId,
            actorUserName,
            actorRole,
            "Payroll.ImportCommitted",
            "ImportBatch",
            batch.Id.ToString(),
            $"Imported {importedCount} employee records from '{batch.SourceFileName}' (sheet '{batch.SelectedWorksheet}') into {period.PeriodLabel}.",
            null,
            new { batch.SourceFileName, batch.SelectedWorksheet, period.PeriodLabel, importedCount });

        return batch;
    }

    // ========================================================================
    // SECTION 15: EXPORT MASTER WORKBOOK (SEPARATE WORKSHEET PER MONTH)
    // ========================================================================
    public async Task<(byte[] FileBytes, string FileName)> ExportMasterWorkbookAsync(bool includeOverrideComparisonColumns = true)
    {
        var periods = await _db.PayrollPeriods
            .Include(p => p.PayrollRecords)
                .ThenInclude(r => r.Components)
            .Include(p => p.PayrollRecords)
                .ThenInclude(r => r.Employee)
            .Where(p => p.PayrollRecords.Any())
            .OrderBy(p => p.Year)
            .ThenBy(p => p.Month)
            .ToListAsync();

        using var wb = new XLWorkbook();

        if (periods.Count == 0)
        {
            var emptyWs = wb.Worksheets.Add("No Payroll Data");
            emptyWs.Cell(1, 1).Value = "FINORA — No payroll periods have been imported yet.";
        }
        else
        {
            var usedSheetNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var period in periods)
            {
                string sheetName = SanitizeWorksheetName(period.PeriodLabel, usedSheetNames);
                var ws = wb.Worksheets.Add(sheetName);

                var records = period.PayrollRecords
                    .OrderBy(r => r.ImportedEmployeeCode, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                // Build the union of dynamic component columns present in THIS month without forcing a fixed schema across all months
                var distinctComponents = records
                    .SelectMany(r => r.Components)
                    .GroupBy(c => c.ComponentKey, StringComparer.OrdinalIgnoreCase)
                    .Select(g =>
                    {
                        var first = g.OrderBy(x => x.SortOrder).First();
                        return new
                        {
                            Key = g.Key,
                            Label = !string.IsNullOrWhiteSpace(first.OverrideLabel) ? first.OverrideLabel! : first.OriginalLabel,
                            Category = first.Category,
                            MinSort = g.Min(x => x.SortOrder)
                        };
                    })
                    .OrderBy(c => CategorySortPriority(c.Category))
                    .ThenBy(c => c.MinSort)
                    .ToList();

                // Header Row
                var headers = new List<string>
                {
                    "Employee ID",
                    "Employee Name",
                    "Email",
                    "Department",
                    "Designation",
                    "Payroll Month"
                };

                foreach (var comp in distinctComponents)
                {
                    headers.Add(comp.Label);
                    if (includeOverrideComparisonColumns && records.Any(r =>
                        r.Components.Any(c => c.ComponentKey.Equals(comp.Key, StringComparison.OrdinalIgnoreCase) && c.HasManualOverride)))
                    {
                        headers.Add($"{comp.Label} (Source Imported)");
                    }
                }

                headers.Add("Gross Salary");
                headers.Add("Total Deductions");
                headers.Add("Net Salary");
                headers.Add("Record Status");
                headers.Add("Has Approved Overrides");

                for (int colIdx = 0; colIdx < headers.Count; colIdx++)
                {
                    var cell = ws.Cell(1, colIdx + 1);
                    cell.Value = headers[colIdx];
                    cell.Style.Font.Bold = true;
                    cell.Style.Font.FontColor = XLColor.White;
                    cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#071747");
                    cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                }

                int rowNum = 2;
                foreach (var rec in records)
                {
                    int c = 1;
                    ws.Cell(rowNum, c++).Value = rec.ImportedEmployeeCode;
                    ws.Cell(rowNum, c++).Value = rec.OverrideEmployeeName ?? rec.ImportedEmployeeName;
                    ws.Cell(rowNum, c++).Value = rec.OverrideEmail ?? rec.ImportedEmail;
                    ws.Cell(rowNum, c++).Value = rec.OverrideDepartment ?? rec.ImportedDepartment;
                    ws.Cell(rowNum, c++).Value = rec.OverrideDesignation ?? rec.ImportedDesignation;
                    ws.Cell(rowNum, c++).Value = period.PeriodLabel;

                    bool anyOverride = rec.OverrideGrossSalary.HasValue || rec.OverrideTotalDeductions.HasValue || rec.OverrideNetSalary.HasValue;

                    foreach (var compMeta in distinctComponents)
                    {
                        var compVal = rec.Components.FirstOrDefault(x =>
                            x.ComponentKey.Equals(compMeta.Key, StringComparison.OrdinalIgnoreCase));

                        var targetCell = ws.Cell(rowNum, c++);
                        if (compVal != null)
                        {
                            if (compVal.HasManualOverride) anyOverride = true;

                            if (compVal.Category == ComponentCategories.CustomText)
                            {
                                var textVal = compVal.HasManualOverride ? compVal.OverrideTextValue : compVal.ImportedTextValue;
                                if (!string.IsNullOrWhiteSpace(textVal))
                                {
                                    targetCell.Value = textVal;
                                }
                            }
                            else
                            {
                                var numVal = compVal.HasManualOverride ? compVal.OverrideNumericValue : compVal.ImportedNumericValue;
                                if (numVal.HasValue)
                                {
                                    targetCell.Value = numVal.Value;
                                    targetCell.Style.NumberFormat.Format = "#,##0.00";
                                }
                                // Note: if numVal is null (blank in source), leave cell genuinely blank!
                            }
                        }

                        // Optional source-imported comparison column if any employee in this month overrode this component
                        if (includeOverrideComparisonColumns && records.Any(r =>
                            r.Components.Any(x => x.ComponentKey.Equals(compMeta.Key, StringComparison.OrdinalIgnoreCase) && x.HasManualOverride)))
                        {
                            var srcCell = ws.Cell(rowNum, c++);
                            if (compVal?.ImportedNumericValue != null)
                            {
                                srcCell.Value = compVal.ImportedNumericValue.Value;
                                srcCell.Style.NumberFormat.Format = "#,##0.00";
                            }
                            else if (!string.IsNullOrWhiteSpace(compVal?.ImportedTextValue))
                            {
                                srcCell.Value = compVal.ImportedTextValue;
                            }
                        }
                    }

                    var grossCell = ws.Cell(rowNum, c++);
                    var effGross = rec.OverrideGrossSalary ?? rec.ImportedGrossSalary;
                    if (effGross.HasValue)
                    {
                        grossCell.Value = effGross.Value;
                        grossCell.Style.NumberFormat.Format = "#,##0.00";
                        grossCell.Style.Font.Bold = true;
                    }

                    var dedCell = ws.Cell(rowNum, c++);
                    var effDed = rec.OverrideTotalDeductions ?? rec.ImportedTotalDeductions;
                    if (effDed.HasValue)
                    {
                        dedCell.Value = effDed.Value;
                        dedCell.Style.NumberFormat.Format = "#,##0.00";
                    }

                    var netCell = ws.Cell(rowNum, c++);
                    var effNet = rec.OverrideNetSalary ?? rec.ImportedNetSalary;
                    if (effNet.HasValue)
                    {
                        netCell.Value = effNet.Value;
                        netCell.Style.NumberFormat.Format = "#,##0.00";
                        netCell.Style.Font.Bold = true;
                        netCell.Style.Fill.BackgroundColor = XLColor.FromHtml("#FFF4E8");
                    }

                    ws.Cell(rowNum, c++).Value = rec.Status;
                    ws.Cell(rowNum, c++).Value = anyOverride ? "Yes" : "No";

                    rowNum++;
                }

                ws.Columns().AdjustToContents(1, Math.Max(2, rowNum - 1), 10.0, 42.0);
                ws.SheetView.FreezeRows(1);
            }
        }

        using var outStream = new MemoryStream();
        wb.SaveAs(outStream);
        var fileBytes = outStream.ToArray();
        var fileName = $"PaySlip_Studio_Master_Payroll_Archive_{DateTime.UtcNow:yyyyMMdd}.xlsx";
        return (fileBytes, fileName);
    }

    // ========================================================================
    // INTERNAL HELPERS: WORKSHEET INSPECTION & AUTO-MAPPING
    // ========================================================================
    private async Task<PayrollPeriod> GetOrCreatePeriodAsync(int month, int year)
    {
        month = Math.Clamp(month, 1, 12);
        year = Math.Clamp(year, 2000, 2100);
        var period = await _db.PayrollPeriods.FirstOrDefaultAsync(p => p.Month == month && p.Year == year);
        if (period == null)
        {
            period = new PayrollPeriod
            {
                Month = month,
                Year = year,
                PeriodLabel = FormatPeriodLabel(month, year),
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };
            _db.PayrollPeriods.Add(period);
            await _db.SaveChangesAsync();
        }
        return period;
    }

    private List<WorksheetSummaryDto> InspectWorksheets(byte[] bytes, string ext, string originalFileName)
    {
        var list = new List<WorksheetSummaryDto>();

        if (ext == ".xlsx")
        {
            using var ms = new MemoryStream(bytes);
            using var wb = new XLWorkbook(ms);
            foreach (var ws in wb.Worksheets)
            {
                var used = ws.RangeUsed();
                var headers = new List<string>();
                int rowCount = used?.RowCount() ?? 0;
                int colCount = used?.ColumnCount() ?? 0;

                if (used != null)
                {
                    var firstRow = used.FirstRow();
                    for (int c = 1; c <= colCount; c++)
                    {
                        var text = firstRow.Cell(c).GetFormattedString().Trim();
                        if (!string.IsNullOrWhiteSpace(text))
                            headers.Add(text);
                    }
                }

                list.Add(new WorksheetSummaryDto
                {
                    Name = ws.Name,
                    RowCount = rowCount,
                    ColumnCount = colCount,
                    SampleHeaders = headers.Take(12).ToList()
                });
            }
            return list;
        }

        if (ext == ".xls")
        {
            using var ms = new MemoryStream(bytes);
            using var reader = ExcelReaderFactory.CreateReader(ms);
            var ds = reader.AsDataSet();
            foreach (DataTable table in ds.Tables)
            {
                var headers = new List<string>();
                if (table.Rows.Count > 0)
                {
                    for (int c = 0; c < table.Columns.Count; c++)
                    {
                        var val = Convert.ToString(table.Rows[0][c])?.Trim();
                        if (!string.IsNullOrWhiteSpace(val))
                            headers.Add(val!);
                    }
                }
                list.Add(new WorksheetSummaryDto
                {
                    Name = table.TableName,
                    RowCount = table.Rows.Count,
                    ColumnCount = table.Columns.Count,
                    SampleHeaders = headers.Take(12).ToList()
                });
            }
            return list;
        }

        // CSV
        var csvLines = Encoding.UTF8.GetString(bytes)
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries);
        var csvHeaders = csvLines.Length > 0 ? ParseCsvLine(csvLines[0]) : new List<string>();
        list.Add(new WorksheetSummaryDto
        {
            Name = Path.GetFileNameWithoutExtension(originalFileName),
            RowCount = csvLines.Length,
            ColumnCount = csvHeaders.Count,
            SampleHeaders = csvHeaders.Take(12).ToList()
        });
        return list;
    }

    private ParsedSheetData ReadSheetCells(byte[] bytes, string ext, string worksheetName)
    {
        var result = new ParsedSheetData();

        if (ext == ".xlsx")
        {
            using var ms = new MemoryStream(bytes);
            using var wb = new XLWorkbook(ms);
            var ws = wb.Worksheets.FirstOrDefault(w => w.Name.Equals(worksheetName, StringComparison.OrdinalIgnoreCase))
                ?? wb.Worksheets.First();

            var used = ws.RangeUsed();
            if (used == null) return result;

            int firstRowNum = used.FirstRow().RowNumber();
            int lastRowNum = used.LastRow().RowNumber();
            int firstColNum = used.FirstColumn().ColumnNumber();
            int lastColNum = used.LastColumn().ColumnNumber();

            for (int c = firstColNum; c <= lastColNum; c++)
            {
                var hText = ws.Cell(firstRowNum, c).GetFormattedString().Trim();
                if (string.IsNullOrWhiteSpace(hText))
                    hText = $"Column_{GetExcelColumnLetter(c)}";

                result.Headers.Add((c, GetExcelColumnLetter(c), hText));
            }

            for (int r = firstRowNum + 1; r <= lastRowNum; r++)
            {
                var parsedRow = new RawParsedRow { RowNumber = r };
                foreach (var (colIdx, _, _) in result.Headers)
                {
                    var xlCell = ws.Cell(r, colIdx);
                    parsedRow.Cells.Add(ExtractClosedXmlCell(xlCell, colIdx));
                }
                result.Rows.Add(parsedRow);
            }

            return result;
        }

        if (ext == ".xls")
        {
            using var ms = new MemoryStream(bytes);
            using var reader = ExcelReaderFactory.CreateReader(ms);
            var ds = reader.AsDataSet();
            DataTable? table = null;
            foreach (DataTable t in ds.Tables)
            {
                if (t.TableName.Equals(worksheetName, StringComparison.OrdinalIgnoreCase))
                {
                    table = t;
                    break;
                }
            }
            table ??= ds.Tables[0];

            if (table.Rows.Count == 0) return result;

            for (int c = 0; c < table.Columns.Count; c++)
            {
                var hText = Convert.ToString(table.Rows[0][c])?.Trim();
                if (string.IsNullOrWhiteSpace(hText))
                    hText = $"Column_{GetExcelColumnLetter(c + 1)}";
                result.Headers.Add((c + 1, GetExcelColumnLetter(c + 1), hText!));
            }

            for (int r = 1; r < table.Rows.Count; r++)
            {
                var parsedRow = new RawParsedRow { RowNumber = r + 1 };
                for (int c = 0; c < table.Columns.Count; c++)
                {
                    var rawObj = table.Rows[r][c];
                    parsedRow.Cells.Add(ParseRawObjectCell(rawObj, c + 1));
                }
                result.Rows.Add(parsedRow);
            }

            return result;
        }

        // CSV
        var lines = Encoding.UTF8.GetString(bytes)
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length == 0) return result;

        var headerCols = ParseCsvLine(lines[0]);
        for (int c = 0; c < headerCols.Count; c++)
        {
            var hText = string.IsNullOrWhiteSpace(headerCols[c]) ? $"Column_{GetExcelColumnLetter(c + 1)}" : headerCols[c].Trim();
            result.Headers.Add((c + 1, GetExcelColumnLetter(c + 1), hText));
        }

        for (int r = 1; r < lines.Length; r++)
        {
            var vals = ParseCsvLine(lines[r]);
            var parsedRow = new RawParsedRow { RowNumber = r + 1 };
            for (int c = 0; c < result.Headers.Count; c++)
            {
                string cellStr = c < vals.Count ? vals[c] : string.Empty;
                parsedRow.Cells.Add(ParseRawStringCell(cellStr, c + 1));
            }
            result.Rows.Add(parsedRow);
        }

        return result;
    }

    private static RawParsedCell ExtractClosedXmlCell(IXLCell xlCell, int colIdx)
    {
        bool hasFormula = xlCell.HasFormula;
        if (xlCell.IsEmpty() && !hasFormula)
        {
            return new RawParsedCell
            {
                ColumnIndex = colIdx,
                CellType = SourceCellTypes.Empty,
                RawText = null,
                NumericValue = null
            };
        }

        if (hasFormula)
        {
            try
            {
                if (xlCell.CachedValue.IsNumber)
                {
                    decimal num = Convert.ToDecimal(xlCell.CachedValue.GetNumber(), CultureInfo.InvariantCulture);
                    return new RawParsedCell
                    {
                        ColumnIndex = colIdx,
                        CellType = num == 0m ? SourceCellTypes.NumericZero : SourceCellTypes.FormulaVerified,
                        RawText = num.ToString(CultureInfo.InvariantCulture),
                        NumericValue = num,
                        IsFormula = true,
                        IsFormulaUncertain = false
                    };
                }
                if (xlCell.CachedValue.IsText)
                {
                    var txt = xlCell.CachedValue.GetText();
                    if (decimal.TryParse(txt, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsedNum))
                    {
                        return new RawParsedCell
                        {
                            ColumnIndex = colIdx,
                            CellType = parsedNum == 0m ? SourceCellTypes.NumericZero : SourceCellTypes.FormulaVerified,
                            RawText = txt,
                            NumericValue = parsedNum,
                            IsFormula = true,
                            IsFormulaUncertain = false
                        };
                    }
                    return new RawParsedCell
                    {
                        ColumnIndex = colIdx,
                        CellType = SourceCellTypes.FormulaUncertain,
                        RawText = txt,
                        NumericValue = null,
                        IsFormula = true,
                        IsFormulaUncertain = true
                    };
                }
            }
            catch
            {
                // Cached value could not be verified without executing formula
            }

            return new RawParsedCell
            {
                ColumnIndex = colIdx,
                CellType = SourceCellTypes.FormulaUncertain,
                RawText = xlCell.FormulaA1,
                NumericValue = null,
                IsFormula = true,
                IsFormulaUncertain = true
            };
        }

        if (xlCell.DataType == XLDataType.Number)
        {
            decimal num = Convert.ToDecimal(xlCell.GetDouble(), CultureInfo.InvariantCulture);
            return new RawParsedCell
            {
                ColumnIndex = colIdx,
                CellType = num == 0m ? SourceCellTypes.NumericZero : SourceCellTypes.NumericNonZero,
                RawText = num.ToString(CultureInfo.InvariantCulture),
                NumericValue = num
            };
        }

        string text = xlCell.GetString().Trim();
        return ParseRawStringCell(text, colIdx);
    }

    private static RawParsedCell ParseRawObjectCell(object? rawObj, int colIdx)
    {
        if (rawObj == null || rawObj == DBNull.Value)
        {
            return new RawParsedCell { ColumnIndex = colIdx, CellType = SourceCellTypes.Empty };
        }

        if (rawObj is double or float or decimal or int or long)
        {
            decimal num = Convert.ToDecimal(rawObj, CultureInfo.InvariantCulture);
            return new RawParsedCell
            {
                ColumnIndex = colIdx,
                CellType = num == 0m ? SourceCellTypes.NumericZero : SourceCellTypes.NumericNonZero,
                RawText = num.ToString(CultureInfo.InvariantCulture),
                NumericValue = num
            };
        }

        return ParseRawStringCell(Convert.ToString(rawObj) ?? string.Empty, colIdx);
    }

    private static RawParsedCell ParseRawStringCell(string raw, int colIdx)
    {
        var trimmed = raw.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return new RawParsedCell
            {
                ColumnIndex = colIdx,
                CellType = SourceCellTypes.Empty,
                RawText = null,
                NumericValue = null
            };
        }

        var cleanedNumericCandidate = trimmed.Replace(",", "").Replace("₹", "").Replace("$", "").Trim();
        if (decimal.TryParse(cleanedNumericCandidate, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out decimal num))
        {
            // Only treat as numeric if the raw string didn't start with leading zeros like an ID ("00123")
            bool isLeadingZeroId = cleanedNumericCandidate.Length > 1 && cleanedNumericCandidate.StartsWith('0') && !cleanedNumericCandidate.StartsWith("0.");
            if (!isLeadingZeroId)
            {
                return new RawParsedCell
                {
                    ColumnIndex = colIdx,
                    CellType = num == 0m ? SourceCellTypes.NumericZero : SourceCellTypes.NumericNonZero,
                    RawText = trimmed,
                    NumericValue = num
                };
            }
        }

        return new RawParsedCell
        {
            ColumnIndex = colIdx,
            CellType = SourceCellTypes.Text,
            RawText = trimmed,
            NumericValue = null
        };
    }

    public static List<ColumnMappingDefinitionDto> AutoDetectColumnMappings(ParsedSheetData sheet)
    {
        var list = new List<ColumnMappingDefinitionDto>();

        foreach (var (colIdx, colLetter, headerText) in sheet.Headers)
        {
            var sampleCell = sheet.Rows
                .Select(r => r.Cells.FirstOrDefault(c => c.ColumnIndex == colIdx))
                .FirstOrDefault(c => c != null && c.CellType != SourceCellTypes.Empty);

            bool hasMostlyNumbers = sheet.Rows
                .Select(r => r.Cells.FirstOrDefault(c => c.ColumnIndex == colIdx))
                .Where(c => c != null && c.CellType != SourceCellTypes.Empty)
                .All(c => c!.NumericValue.HasValue);

            string role = ClassifyColumnRole(headerText, hasMostlyNumbers);

            list.Add(new ColumnMappingDefinitionDto
            {
                ColumnIndex = colIdx,
                ColumnLetter = colLetter,
                HeaderText = headerText,
                MappedRole = role,
                DisplayLabel = headerText,
                SampleNonEmptyValue = sampleCell?.RawText ?? string.Empty,
                IsAutoDetected = true
            });
        }

        return list;
    }

    public static string ClassifyColumnRole(string header, bool hasMostlyNumbers)
    {
        string h = header.Trim().ToLowerInvariant();

        if (h is "employee id" or "emp id" or "empid" or "employee code" or "emp code" or "staff id" or "id")
            return "EmployeeId";

        if (h is "employee name" or "emp name" or "name" or "full name" or "staff name")
            return "EmployeeName";

        if (h.Contains("email") || h.Contains("e-mail"))
            return "Email";

        if (h is "department" or "dept" or "division" or "unit")
            return "Department";

        if (h is "designation" or "role" or "job title" or "title" or "position")
            return "Designation";

        if (h is "payroll month" or "month" or "pay period" or "period" or "salary month")
            return "PayrollMonth";

        if (h is "pan" or "pan number" or "pan no" or "pan card" or "income tax pan"
            or "location" or "work location" or "branch" or "city" or "office location" or "place of posting"
            or "date of joining" or "doj" or "joining date" or "date joined"
            or "bank account" or "account number" or "bank a/c" or "account no" or "bank account no" or "bank account number" or "a/c no"
            or "uan" or "uan no" or "uan number" or "pf no" or "pf number" or "esi no" or "esi number"
            or "days worked" or "paid days" or "working days" or "lop days")
            return "CustomText";

        if (h is "gross salary" or "gross pay" or "gross earnings" or "total earnings" or "gross")
            return "GrossSalary";

        if (h is "total deductions" or "total deduction" or "deductions total")
            return "TotalDeductions";

        if (h is "net salary" or "net pay" or "take home" or "net payable" or "net amount" or "net")
            return "NetSalary";

        if (h.Contains("employer"))
            return "EmployerContribution";

        if (h is "pf" or "provident fund" or "epf" or "esi" or "esic" or "professional tax" or "pt" or "tds" or "income tax"
            || h.Contains("deduction") || h.Contains("loan") || h.Contains("advance") || h.Contains("recovery") || h.Contains("tax"))
            return "Deduction";

        if (h is "hra" or "da" || h.Contains("allowance") || h.Contains("reimbursement") || h.Contains("conveyance") || h.Contains("medical") || h.Contains("food"))
            return "Allowance";

        if (h.Contains("basic") || h.Contains("overtime") || h.Contains("bonus") || h.Contains("incentive") || h.Contains("stipend") || h.Contains("arrears") || h.Contains("earning"))
            return "Earning";

        return hasMostlyNumbers ? "CustomMonetary" : "CustomText";
    }

    public static string NormalizeComponentKey(string label)
    {
        var cleaned = Regex.Replace(label.Trim().ToLowerInvariant(), @"[^a-z0-9]+", "_").Trim('_');
        return string.IsNullOrWhiteSpace(cleaned) ? "component" : cleaned;
    }

    private static string GetExcelColumnLetter(int colNumber)
    {
        string colLetter = string.Empty;
        while (colNumber > 0)
        {
            int mod = (colNumber - 1) % 26;
            colLetter = Convert.ToChar('A' + mod) + colLetter;
            colNumber = (colNumber - mod) / 26;
        }
        return colLetter;
    }

    private static string SanitizeWorksheetName(string desiredName, HashSet<string> existingNames)
    {
        var invalidChars = new[] { '\\', '/', '?', '*', ':', '[', ']' };
        var cleaned = new string(desiredName.Where(ch => !invalidChars.Contains(ch)).ToArray()).Trim();
        if (string.IsNullOrWhiteSpace(cleaned))
            cleaned = "Payroll_Month";
        if (cleaned.Length > 28)
            cleaned = cleaned[..28];

        string candidate = cleaned;
        int suffix = 2;
        while (!existingNames.Add(candidate))
        {
            candidate = $"{cleaned}_{suffix++}";
        }
        return candidate;
    }

    private static int CategorySortPriority(string category) => category switch
    {
        ComponentCategories.Earning => 1,
        ComponentCategories.Allowance => 2,
        ComponentCategories.CustomMonetary => 3,
        ComponentCategories.Deduction => 4,
        ComponentCategories.EmployerContribution => 5,
        ComponentCategories.CustomText => 6,
        _ => 7
    };

    private static bool IsValidEmail(string email)
    {
        return Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.IgnoreCase);
    }

    private static List<string> ParseCsvLine(string line)
    {
        var result = new List<string>();
        var current = new StringBuilder();
        bool inQuotes = false;

        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    current.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (c == ',' && !inQuotes)
            {
                result.Add(current.ToString());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }
        result.Add(current.ToString());
        return result;
    }
}

public class ParsedSheetData
{
    public List<(int ColumnIndex, string ColumnLetter, string HeaderText)> Headers { get; set; } = new();
    public List<RawParsedRow> Rows { get; set; } = new();
}

public class RawParsedRow
{
    public int RowNumber { get; set; }
    public List<RawParsedCell> Cells { get; set; } = new();
}

public class RawParsedCell
{
    public int ColumnIndex { get; set; }
    public string CellType { get; set; } = SourceCellTypes.Empty;
    public string? RawText { get; set; }
    public decimal? NumericValue { get; set; }
    public bool IsFormula { get; set; }
    public bool IsFormulaUncertain { get; set; }
}

