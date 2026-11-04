using System.Security.Claims;
using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;
using PaySlipStudio.Api.Services;

namespace PaySlipStudio.Api.Controllers;

[ApiController]
[Route("api/payroll")]
[Authorize]
public class PayrollController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly ExcelPayrollService _excelService;
    private readonly PayslipDocumentResolver _resolver;
    private readonly PdfRenderingService _pdfService;
    private readonly AuditService _audit;
    private readonly IWebHostEnvironment _env;

    public PayrollController(
        ApplicationDbContext db,
        ExcelPayrollService excelService,
        PayslipDocumentResolver resolver,
        PdfRenderingService pdfService,
        AuditService audit,
        IWebHostEnvironment env)
    {
        _db = db;
        _excelService = excelService;
        _resolver = resolver;
        _pdfService = pdfService;
        _audit = audit;
        _env = env;
    }

    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "system";
    private string CurrentUserName => User.Identity?.Name ?? "Operator";
    private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role) ?? AppRoles.Viewer;

    [HttpGet("periods")]
    public async Task<IActionResult> GetPeriods()
    {
        var settings = await _db.CompanySettings.AsNoTracking().FirstOrDefaultAsync() ?? new CompanySettings();
        var periods = await _db.PayrollPeriods
            .AsNoTracking()
            .OrderByDescending(p => p.Year)
            .ThenByDescending(p => p.Month)
            .Select(p => new
            {
                id = p.Id,
                month = p.Month,
                year = p.Year,
                periodLabel = p.PeriodLabel,
                isClosed = p.IsClosed,
                employeeCount = p.PayrollRecords.Count,
                pdfGeneratedCount = p.PayrollRecords.Count(r => r.GeneratedDocuments.Any() || r.Status == "PdfGenerated" || r.Status == "Sent"),
                sentCount = p.PayrollRecords.Count(r => r.Status == "Sent"),
                totalNetPayroll = p.PayrollRecords.Sum(r => (r.OverrideNetSalary ?? r.ImportedNetSalary) ?? 0m)
            })
            .ToListAsync();

        return Ok(new
        {
            activeMonth = settings.ActivePayrollMonth,
            activeYear = settings.ActivePayrollYear,
            periods
        });
    }

    public record SetActivePeriodRequest(int Month, int Year);

    [HttpPost("periods/active")]
    public async Task<IActionResult> SetActivePeriod([FromBody] SetActivePeriodRequest req)
    {
        var settings = await _db.CompanySettings.FirstOrDefaultAsync();
        if (settings != null)
        {
            settings.ActivePayrollMonth = Math.Clamp(req.Month, 1, 12);
            settings.ActivePayrollYear = Math.Clamp(req.Year, 2000, 2100);
            settings.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
        return Ok(new
        {
            activeMonth = req.Month,
            activeYear = req.Year,
            periodLabel = ExcelPayrollService.FormatPeriodLabel(req.Month, req.Year)
        });
    }

    // ========================================================================
    // EXCEL IMPORT WIZARD (Steps 1 - 6)
    // ========================================================================
    [HttpPost("import/upload")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> UploadExcelFile([FromForm] IFormFile file, [FromForm] int month, [FromForm] int year)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Please select a valid .xlsx, .xls, or .csv file to upload." });

        try
        {
            await using var stream = file.OpenReadStream();
            var summary = await _excelService.StageUploadAsync(
                stream,
                file.FileName,
                month,
                year,
                CurrentUserId,
                CurrentUserName);

            return Ok(summary);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    public record LoadWorkspaceMockRequest(int Month, int Year);

    [HttpPost("import/load-workspace-mock")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> LoadWorkspaceMockFile([FromBody] LoadWorkspaceMockRequest req)
    {
        var candidatePaths = new[]
        {
            Path.Combine(_env.ContentRootPath, "..", "..", "PaySlip_Studio_Mock_Payroll_Test_Data.xlsx"),
            Path.Combine(_env.ContentRootPath, "PaySlip_Studio_Mock_Payroll_Test_Data.xlsx"),
            @"G:\UAV\PAY SLIP\PaySlip_Studio_Mock_Payroll_Test_Data.xlsx"
        };

        var mockFilePath = candidatePaths.FirstOrDefault(System.IO.File.Exists);
        if (mockFilePath == null)
        {
            return NotFound(new { message = "PaySlip_Studio_Mock_Payroll_Test_Data.xlsx was not found in the workspace directory." });
        }

        await using var fs = new FileStream(mockFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        var summary = await _excelService.StageUploadAsync(
            fs,
            "PaySlip_Studio_Mock_Payroll_Test_Data.xlsx",
            req.Month,
            req.Year,
            CurrentUserId,
            CurrentUserName);

        return Ok(summary);
    }

    public class AnalyzeImportRequest
    {
        public string? WorksheetName { get; set; }
        public int? Month { get; set; }
        public int? Year { get; set; }
        public List<ColumnMappingDefinitionDto>? CustomMappings { get; set; }
    }

    [HttpPost("import/{batchId:guid}/preview")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> PreviewImport(Guid batchId, [FromBody] AnalyzeImportRequest req)
    {
        try
        {
            var preview = await _excelService.AnalyzeAndPreviewAsync(
                batchId,
                req.WorksheetName,
                req.Month,
                req.Year,
                req.CustomMappings);
            return Ok(preview);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    public record CommitImportRequest(bool AllowReplaceExisting);

    [HttpPost("import/{batchId:guid}/commit")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> CommitImport(Guid batchId, [FromBody] CommitImportRequest req)
    {
        try
        {
            var committed = await _excelService.CommitImportBatchAsync(
                batchId,
                req.AllowReplaceExisting,
                CurrentUserId,
                CurrentUserName,
                CurrentUserRole);

            return Ok(new
            {
                batchId = committed.Id,
                status = committed.Status,
                importedRows = committed.ValidRowsImported,
                worksheet = committed.SelectedWorksheet,
                committedAtUtc = committed.CommittedAtUtc
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    // ========================================================================
    // EMPLOYEE SEARCH & MONTHLY PAYROLL LISTING (Section 9 & 15)
    // ========================================================================
    [HttpGet("search")]
    public async Task<IActionResult> SearchEmployees(
        [FromQuery] string? q = null,
        [FromQuery] int? month = null,
        [FromQuery] int? year = null)
    {
        var settings = await _db.CompanySettings.AsNoTracking().FirstOrDefaultAsync() ?? new CompanySettings();
        int targetMonth = month ?? settings.ActivePayrollMonth;
        int targetYear = year ?? settings.ActivePayrollYear;

        var query = _db.PayrollRecords
            .AsNoTracking()
            .Include(r => r.PayrollPeriod)
            .Include(r => r.Employee)
            .Where(r => r.PayrollPeriod != null && r.PayrollPeriod.Month == targetMonth && r.PayrollPeriod.Year == targetYear);

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLower();
            query = query.Where(r =>
                r.ImportedEmployeeCode.ToLower().Contains(term) ||
                r.ImportedEmployeeName.ToLower().Contains(term) ||
                (r.OverrideEmployeeName != null && r.OverrideEmployeeName.ToLower().Contains(term)) ||
                r.ImportedDepartment.ToLower().Contains(term));
        }

        var results = await query
            .OrderBy(r => r.ImportedEmployeeCode)
            .Take(50)
            .Select(r => new
            {
                recordId = r.Id,
                employeeId = r.EmployeeId,
                employeeCode = !string.IsNullOrWhiteSpace(r.OverrideEmployeeCode) ? r.OverrideEmployeeCode : r.ImportedEmployeeCode,
                employeeName = !string.IsNullOrWhiteSpace(r.OverrideEmployeeName) ? r.OverrideEmployeeName : r.ImportedEmployeeName,
                email = r.OverrideEmail ?? r.ImportedEmail,
                department = r.OverrideDepartment ?? r.ImportedDepartment,
                designation = r.OverrideDesignation ?? r.ImportedDesignation,
                month = r.PayrollPeriod!.Month,
                year = r.PayrollPeriod!.Year,
                periodLabel = r.PayrollPeriod!.PeriodLabel,
                grossSalary = r.OverrideGrossSalary ?? r.ImportedGrossSalary,
                netSalary = r.OverrideNetSalary ?? r.ImportedNetSalary,
                status = r.Status
            })
            .ToListAsync();

        return Ok(results);
    }

    [HttpGet("records")]
    public async Task<IActionResult> GetPeriodRecords(
        [FromQuery] int? month = null,
        [FromQuery] int? year = null,
        [FromQuery] string? search = null)
    {
        var settings = await _db.CompanySettings.AsNoTracking().FirstOrDefaultAsync() ?? new CompanySettings();
        int targetMonth = month ?? settings.ActivePayrollMonth;
        int targetYear = year ?? settings.ActivePayrollYear;

        var period = await _db.PayrollPeriods
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Month == targetMonth && p.Year == targetYear);

        if (period == null)
        {
            return Ok(new
            {
                month = targetMonth,
                year = targetYear,
                periodLabel = ExcelPayrollService.FormatPeriodLabel(targetMonth, targetYear),
                records = Array.Empty<object>()
            });
        }

        var query = _db.PayrollRecords
            .AsNoTracking()
            .Include(r => r.Components)
            .Include(r => r.GeneratedDocuments)
            .Include(r => r.EmailAttempts)
            .Where(r => r.PayrollPeriodId == period.Id);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(r =>
                r.ImportedEmployeeCode.ToLower().Contains(term) ||
                r.ImportedEmployeeName.ToLower().Contains(term) ||
                (r.OverrideEmployeeName != null && r.OverrideEmployeeName.ToLower().Contains(term)) ||
                r.ImportedDepartment.ToLower().Contains(term) ||
                r.ImportedDesignation.ToLower().Contains(term));
        }

        var records = await query
            .OrderBy(r => r.ImportedEmployeeCode)
            .ToListAsync();

        var defaultTemplate = await _db.PayslipTemplates.AsNoTracking().FirstOrDefaultAsync(t => t.IsDefault && !t.IsArchived);

        var items = records.Select(r =>
        {
            var resolved = _resolver.ResolveDocument(r, settings, defaultTemplate);
            var latestDoc = r.GeneratedDocuments.OrderByDescending(d => d.GeneratedAtUtc).FirstOrDefault();
            var latestEmail = r.EmailAttempts.OrderByDescending(a => a.CreatedAtUtc).FirstOrDefault();

            return new
            {
                recordId = r.Id,
                employeeId = r.EmployeeId,
                employeeCode = resolved.EmployeeCode,
                employeeName = resolved.EmployeeName,
                email = resolved.EmployeeEmail,
                department = resolved.Department,
                designation = resolved.Designation,
                periodLabel = period.PeriodLabel,
                month = period.Month,
                year = period.Year,
                grossSalary = resolved.GrossSalary,
                totalDeductions = resolved.TotalDeductions,
                netSalary = resolved.NetSalary,
                visibleEarningsCount = resolved.VisibleEarnings.Count,
                visibleDeductionsCount = resolved.VisibleDeductions.Count,
                totalImportedComponentsCount = r.Components.Count,
                hasOverrides = r.Components.Any(c => c.HasManualOverride || c.IsManuallyAdded)
                    || r.OverrideGrossSalary.HasValue || r.OverrideTotalDeductions.HasValue || r.OverrideNetSalary.HasValue,
                status = r.Status,
                latestPdfId = latestDoc?.Id,
                latestPdfVersion = latestDoc?.DocumentVersionCode,
                latestEmailStatus = latestEmail?.Status,
                updatedAtUtc = r.UpdatedAtUtc
            };
        }).ToList();

        return Ok(new
        {
            periodId = period.Id,
            month = period.Month,
            year = period.Year,
            periodLabel = period.PeriodLabel,
            currencySymbol = settings.CurrencySymbol,
            records = items
        });
    }

    // ========================================================================
    // DYNAMIC PAYSLIP DOCUMENT RESOLUTION & VISUAL EDITOR
    // ========================================================================
    [HttpGet("records/{id:guid}/document")]
    public async Task<IActionResult> GetResolvedPayslipDocument(Guid id, [FromQuery] Guid? templateId = null)
    {
        var record = await _db.PayrollRecords
            .AsNoTracking()
            .Include(r => r.Employee)
            .Include(r => r.PayrollPeriod)
            .Include(r => r.Components)
            .Include(r => r.GeneratedDocuments)
            .Include(r => r.EmailAttempts)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (record == null)
            return NotFound(new { message = "Payroll record not found for the selected employee and period." });

        var settings = await _db.CompanySettings.AsNoTracking().FirstOrDefaultAsync() ?? new CompanySettings();
        Guid? effectiveTemplateId = templateId ?? record.SelectedTemplateId;
        PayslipTemplate? template = null;
        if (effectiveTemplateId.HasValue)
        {
            template = await _db.PayslipTemplates.AsNoTracking().FirstOrDefaultAsync(t => t.Id == effectiveTemplateId.Value);
        }
        template ??= await _db.PayslipTemplates.AsNoTracking().FirstOrDefaultAsync(t => t.IsDefault && !t.IsArchived);

        var model = _resolver.ResolveDocument(record, settings, template);
        var latestDoc = record.GeneratedDocuments.OrderByDescending(d => d.GeneratedAtUtc).FirstOrDefault();
        var latestEmail = record.EmailAttempts.OrderByDescending(a => a.CreatedAtUtc).FirstOrDefault();

        return Ok(new
        {
            document = model,
            sourceSnapshot = JsonSerializer.Deserialize<object>(record.SourceRowSnapshotJson),
            latestPdf = latestDoc == null ? null : new
            {
                id = latestDoc.Id,
                versionCode = latestDoc.DocumentVersionCode,
                fileName = latestDoc.FileName,
                fileSizeBytes = latestDoc.FileSizeBytes,
                generatedAtUtc = latestDoc.GeneratedAtUtc
            },
            latestEmail = latestEmail == null ? null : new
            {
                id = latestEmail.Id,
                status = latestEmail.Status,
                recipientEmail = latestEmail.RecipientEmail,
                createdAtUtc = latestEmail.CreatedAtUtc,
                errorDetails = latestEmail.ErrorDetails
            }
        });
    }

    [HttpGet("by-employee-code/{employeeCode}/document")]
    public async Task<IActionResult> GetDocumentByEmployeeCodeAndPeriod(
        string employeeCode,
        [FromQuery] int month,
        [FromQuery] int year)
    {
        var codeNorm = employeeCode.Trim().ToLower();
        var record = await _db.PayrollRecords
            .AsNoTracking()
            .Include(r => r.PayrollPeriod)
            .FirstOrDefaultAsync(r =>
                r.PayrollPeriod != null &&
                r.PayrollPeriod.Month == month &&
                r.PayrollPeriod.Year == year &&
                r.ImportedEmployeeCode.ToLower() == codeNorm);

        if (record == null)
        {
            return NotFound(new
            {
                message = $"No payroll record found for employee '{employeeCode}' in {ExcelPayrollService.FormatPeriodLabel(month, year)}."
            });
        }

        return await GetResolvedPayslipDocument(record.Id);
    }

    [HttpPut("records/{id:guid}/draft")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> SaveRecordDraft(Guid id, [FromBody] UpdatePayrollRecordDraftRequest req)
    {
        var record = await _db.PayrollRecords
            .Include(r => r.Employee)
            .Include(r => r.PayrollPeriod)
            .Include(r => r.Components)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (record == null)
            return NotFound(new { message = "Payroll record not found." });

        var beforeSummary = new
        {
            record.OverrideEmployeeName,
            record.OverrideEmail,
            record.OverrideDepartment,
            record.OverrideDesignation,
            record.OverrideGrossSalary,
            record.OverrideTotalDeductions,
            record.OverrideNetSalary,
            record.ShowZeroValueRowsOverride
        };

        // 1. Update Employee Metadata Overrides (preserving Imported values; empty string "" means explicitly cleared on slip)
        if (req.OverrideEmployeeCode != null)
        {
            var trimmed = req.OverrideEmployeeCode.Trim();
            record.OverrideEmployeeCode = trimmed == (record.ImportedEmployeeCode ?? string.Empty).Trim()
                ? null
                : trimmed;
        }

        if (req.OverrideEmployeeName != null)
        {
            var trimmed = req.OverrideEmployeeName.Trim();
            record.OverrideEmployeeName = trimmed == (record.ImportedEmployeeName ?? string.Empty).Trim()
                ? null
                : trimmed;
        }

        if (req.OverrideEmail != null)
        {
            var trimmed = req.OverrideEmail.Trim();
            record.OverrideEmail = trimmed == (record.ImportedEmail ?? string.Empty).Trim()
                ? null
                : trimmed;
        }

        if (req.OverrideDepartment != null)
        {
            var trimmed = req.OverrideDepartment.Trim();
            record.OverrideDepartment = trimmed == (record.ImportedDepartment ?? string.Empty).Trim()
                ? null
                : trimmed;
        }

        if (req.OverrideDesignation != null)
        {
            var trimmed = req.OverrideDesignation.Trim();
            record.OverrideDesignation = trimmed == (record.ImportedDesignation ?? string.Empty).Trim()
                ? null
                : trimmed;
        }

        // 2. Update Totals Overrides (never overwriting ImportedGrossSalary / ImportedTotalDeductions / ImportedNetSalary!)
        if (req.ClearGrossSalaryOverride)
            record.OverrideGrossSalary = null;
        else if (req.OverrideGrossSalary.HasValue)
            record.OverrideGrossSalary = req.OverrideGrossSalary.Value == record.ImportedGrossSalary ? null : req.OverrideGrossSalary.Value;

        if (req.ClearTotalDeductionsOverride)
            record.OverrideTotalDeductions = null;
        else if (req.OverrideTotalDeductions.HasValue)
            record.OverrideTotalDeductions = req.OverrideTotalDeductions.Value == record.ImportedTotalDeductions ? null : req.OverrideTotalDeductions.Value;

        if (req.ClearNetSalaryOverride)
            record.OverrideNetSalary = null;
        else if (req.OverrideNetSalary.HasValue)
            record.OverrideNetSalary = req.OverrideNetSalary.Value == record.ImportedNetSalary ? null : req.OverrideNetSalary.Value;

        // 3. Presentation & Template Settings
        record.SelectedTemplateId = req.SelectedTemplateId;
        record.ShowZeroValueRowsOverride = req.ShowZeroValueRowsOverride;
        record.CustomFooterNotes = req.CustomFooterNotes;

        if (req.PresentationOverrides != null)
        {
            record.PresentationOverridesJson = JsonSerializer.Serialize(req.PresentationOverrides);
        }

        // 4. Process Salary Component Updates (preserving ImportedNumericValue and SourceCellType intact!)
        if (req.ComponentUpdates != null)
        {
            // If the editor submitted the full component list, remove any previously saved manually-added components that were deleted in the UI
            int nonManualCount = record.Components.Count(c => !c.IsManuallyAdded);
            if (req.ComponentUpdates.Count >= nonManualCount && nonManualCount > 0)
            {
                var submittedIds = req.ComponentUpdates
                    .Where(u => u.Id.HasValue && u.Id.Value != Guid.Empty)
                    .Select(u => u.Id!.Value)
                    .ToHashSet();
                var submittedKeys = req.ComponentUpdates
                    .Where(u => !string.IsNullOrWhiteSpace(u.ComponentKey))
                    .Select(u => u.ComponentKey.ToLowerInvariant())
                    .ToHashSet();

                var deletedManuals = record.Components
                    .Where(c => c.IsManuallyAdded && !submittedIds.Contains(c.Id) && !submittedKeys.Contains(c.ComponentKey.ToLowerInvariant()))
                    .ToList();

                foreach (var del in deletedManuals)
                {
                    record.Components.Remove(del);
                    _db.PayrollComponentValues.Remove(del);
                }
            }

            foreach (var item in req.ComponentUpdates)
            {
                PayrollComponentValue? comp = null;
                if (item.Id.HasValue && item.Id.Value != Guid.Empty)
                {
                    comp = record.Components.FirstOrDefault(c => c.Id == item.Id.Value);
                }
                if (comp == null && !string.IsNullOrWhiteSpace(item.ComponentKey))
                {
                    comp = record.Components.FirstOrDefault(c =>
                        c.ComponentKey.Equals(item.ComponentKey, StringComparison.OrdinalIgnoreCase));
                }

                if (comp != null)
                {
                    if (item.RemoveManualComponent && comp.IsManuallyAdded)
                    {
                        record.Components.Remove(comp);
                        _db.PayrollComponentValues.Remove(comp);
                        continue;
                    }

                    if (item.ResetToImported)
                    {
                        comp.HasManualOverride = false;
                        comp.OverrideNumericValue = null;
                        comp.OverrideTextValue = null;
                        comp.OverrideLabel = null;
                        comp.ExplicitVisibilityOverride = null;
                        comp.UpdatedAtUtc = DateTime.UtcNow;
                        continue;
                    }

                    comp.OverrideLabel = string.IsNullOrWhiteSpace(item.OverrideLabel) || item.OverrideLabel.Trim() == comp.OriginalLabel
                        ? null
                        : item.OverrideLabel.Trim();

                    comp.Category = string.IsNullOrWhiteSpace(item.Category) ? comp.Category : item.Category;
                    if (item.SortOrder > 0) comp.SortOrder = item.SortOrder;
                    comp.ExplicitVisibilityOverride = item.ExplicitVisibilityOverride;

                    // Determine if value differs from imported value
                    if (comp.Category == ComponentCategories.CustomText || comp.Category == ComponentCategories.Metadata)
                    {
                        if (item.OverrideTextValue != comp.ImportedTextValue)
                        {
                            comp.HasManualOverride = true;
                            comp.OverrideTextValue = item.OverrideTextValue;
                        }
                        else
                        {
                            comp.HasManualOverride = false;
                            comp.OverrideTextValue = null;
                        }
                    }
                    else
                    {
                        if (item.OverrideNumericValue != comp.ImportedNumericValue)
                        {
                            comp.HasManualOverride = true;
                            comp.OverrideNumericValue = item.OverrideNumericValue;
                        }
                        else
                        {
                            comp.HasManualOverride = false;
                            comp.OverrideNumericValue = null;
                        }
                    }

                    comp.UpdatedAtUtc = DateTime.UtcNow;
                }
                else if (item.IsManuallyAdded && !item.RemoveManualComponent)
                {
                    string label = string.IsNullOrWhiteSpace(item.OverrideLabel)
                        ? item.OriginalLabel.Trim()
                        : item.OverrideLabel.Trim();

                    if (string.IsNullOrWhiteSpace(label))
                        continue;

                    var newComp = new PayrollComponentValue
                    {
                        PayrollRecordId = record.Id,
                        ComponentKey = ExcelPayrollService.NormalizeComponentKey(
                            string.IsNullOrWhiteSpace(item.ComponentKey) ? $"{label}_{Guid.NewGuid():N}" : item.ComponentKey),
                        OriginalLabel = label,
                        OverrideLabel = null,
                        Category = string.IsNullOrWhiteSpace(item.Category) ? ComponentCategories.Earning : item.Category,
                        SortOrder = item.SortOrder > 0 ? item.SortOrder : record.Components.Count + 1,
                        SourceCellType = SourceCellTypes.Empty,
                        ImportedNumericValue = item.OverrideNumericValue,
                        ImportedTextValue = item.OverrideTextValue,
                        IsManuallyAdded = true,
                        HasManualOverride = true,
                        OverrideNumericValue = item.OverrideNumericValue,
                        OverrideTextValue = item.OverrideTextValue,
                        ExplicitVisibilityOverride = item.ExplicitVisibilityOverride,
                        UpdatedAtUtc = DateTime.UtcNow
                    };
                    record.Components.Add(newComp);
                    _db.PayrollComponentValues.Add(newComp);
                }
            }
        }

        // 5. Backend Auto-Recalculation of Gross Salary, Total Deductions, and Net Salary based on active Earnings & Deductions
        var companySettings = await _db.CompanySettings.AsNoTracking().FirstOrDefaultAsync() ?? new CompanySettings();
        var styleCfg = PayslipDocumentResolver.ResolveEffectiveStyleConfig(record, companySettings, null);
        bool showZero = record.ShowZeroValueRowsOverride ?? styleCfg.ShowZeroValueRows;

        decimal calcEarnings = 0m;
        decimal calcDeductions = 0m;
        bool anyEarningEdited = false;
        bool anyDeductionEdited = false;

        foreach (var c in record.Components)
        {
            if (c.Category == ComponentCategories.CustomText || c.Category == ComponentCategories.Metadata)
                continue;

            decimal? effNum = c.HasManualOverride ? c.OverrideNumericValue : c.ImportedNumericValue;
            var (isVis, _) = PayslipDocumentResolver.EvaluateVisibility(c, effNum, null, showZero);

            bool isEdited = c.HasManualOverride || c.IsManuallyAdded || c.ExplicitVisibilityOverride.HasValue;

            if (c.Category == ComponentCategories.Deduction)
            {
                if (isEdited) anyDeductionEdited = true;
                if (isVis && effNum.HasValue) calcDeductions += effNum.Value;
            }
            else if (c.Category != ComponentCategories.EmployerContribution)
            {
                if (isEdited) anyEarningEdited = true;
                if (isVis && effNum.HasValue) calcEarnings += effNum.Value;
            }
        }

        if (anyEarningEdited && (!req.OverrideGrossSalary.HasValue || req.OverrideGrossSalary.Value == record.ImportedGrossSalary))
        {
            record.OverrideGrossSalary = calcEarnings == record.ImportedGrossSalary ? null : calcEarnings;
        }

        if (anyDeductionEdited && (!req.OverrideTotalDeductions.HasValue || req.OverrideTotalDeductions.Value == record.ImportedTotalDeductions))
        {
            record.OverrideTotalDeductions = calcDeductions == record.ImportedTotalDeductions ? null : calcDeductions;
        }

        decimal effectiveGrossTotal = record.OverrideGrossSalary ?? (anyEarningEdited ? calcEarnings : (record.ImportedGrossSalary ?? calcEarnings));
        decimal effectiveDeductionsTotal = record.OverrideTotalDeductions ?? (anyDeductionEdited ? calcDeductions : (record.ImportedTotalDeductions ?? calcDeductions));
        decimal calculatedNetTotal = effectiveGrossTotal - effectiveDeductionsTotal;

        if ((anyEarningEdited || anyDeductionEdited || record.OverrideGrossSalary.HasValue || record.OverrideTotalDeductions.HasValue) &&
            (!req.OverrideNetSalary.HasValue || req.OverrideNetSalary.Value == record.ImportedNetSalary || req.OverrideNetSalary.Value == calculatedNetTotal))
        {
            record.OverrideNetSalary = calculatedNetTotal == record.ImportedNetSalary ? null : calculatedNetTotal;
        }

        // 6. Update SourceRowSnapshotJson and synchronize imported baseline with newly added / edited earnings & deductions
        try
        {
            var snapshotDict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(record.SourceRowSnapshotJson))
            {
                var existingSnap = JsonSerializer.Deserialize<Dictionary<string, object?>>(record.SourceRowSnapshotJson);
                if (existingSnap != null)
                {
                    foreach (var kvp in existingSnap)
                        snapshotDict[kvp.Key] = kvp.Value;
                }
            }

            foreach (var c in record.Components)
            {
                if (c.Category == ComponentCategories.CustomText || c.Category == ComponentCategories.Metadata)
                {
                    var effText = c.HasManualOverride ? c.OverrideTextValue : c.ImportedTextValue;
                    if (!string.IsNullOrWhiteSpace(effText))
                    {
                        snapshotDict[c.OriginalLabel] = effText;
                    }
                }
                else
                {
                    var effNum = c.HasManualOverride ? c.OverrideNumericValue : c.ImportedNumericValue;
                    if (effNum.HasValue)
                    {
                        snapshotDict[c.OriginalLabel] = effNum.Value;
                    }
                }
            }

            snapshotDict["Gross Salary"] = effectiveGrossTotal;
            snapshotDict["Total Deductions"] = effectiveDeductionsTotal;
            snapshotDict["Net Salary"] = calculatedNetTotal;
            record.SourceRowSnapshotJson = JsonSerializer.Serialize(snapshotDict);

            if (anyEarningEdited || anyDeductionEdited)
            {
                record.ImportedGrossSalary = effectiveGrossTotal;
                record.ImportedTotalDeductions = effectiveDeductionsTotal;
                record.ImportedNetSalary = calculatedNetTotal;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DraftSave] Note: SourceRowSnapshotJson sync: {ex.Message}");
        }

        // 7. Update underlying physical imported Excel spreadsheet on disk if batch file is available
        if (record.ImportBatchId.HasValue)
        {
            try
            {
                var batch = await _db.ImportBatches.FindAsync(record.ImportBatchId.Value);
                if (batch != null && !string.IsNullOrWhiteSpace(batch.StoredFilePath) && System.IO.File.Exists(batch.StoredFilePath))
                {
                    using var wb = new XLWorkbook(batch.StoredFilePath);
                    var ws = !string.IsNullOrWhiteSpace(batch.SelectedWorksheet) && wb.Worksheets.Contains(batch.SelectedWorksheet)
                        ? wb.Worksheet(batch.SelectedWorksheet)
                        : wb.Worksheets.FirstOrDefault();

                    if (ws != null)
                    {
                        int lastRow = ws.LastRowUsed()?.RowNumber() ?? 0;
                        int lastCol = ws.LastColumnUsed()?.ColumnNumber() ?? 0;
                        int empRow = -1;

                        // Locate employee row by ID / Code in leading columns
                        for (int r = 2; r <= lastRow; r++)
                        {
                            for (int c = 1; c <= Math.Min(lastCol, 12); c++)
                            {
                                var cellStr = ws.Cell(r, c).GetString()?.Trim();
                                if (string.Equals(cellStr, record.ImportedEmployeeCode?.Trim(), StringComparison.OrdinalIgnoreCase))
                                {
                                    empRow = r;
                                    break;
                                }
                            }
                            if (empRow > 0) break;
                        }

                        if (empRow > 0)
                        {
                            foreach (var comp in record.Components)
                            {
                                if (comp.Category == ComponentCategories.CustomText || comp.Category == ComponentCategories.Metadata)
                                    continue;

                                string colName = comp.OriginalLabel?.Trim() ?? comp.ComponentKey;
                                int targetCol = -1;
                                for (int c = 1; c <= lastCol; c++)
                                {
                                    if (string.Equals(ws.Cell(1, c).GetString()?.Trim(), colName, StringComparison.OrdinalIgnoreCase))
                                    {
                                        targetCol = c;
                                        break;
                                    }
                                }

                                if (targetCol < 0)
                                {
                                    targetCol = ++lastCol;
                                    ws.Cell(1, targetCol).Value = colName;
                                    ws.Cell(1, targetCol).Style.Font.Bold = true;
                                }

                                decimal? effVal = comp.HasManualOverride ? comp.OverrideNumericValue : comp.ImportedNumericValue;
                                if (effVal.HasValue)
                                {
                                    ws.Cell(empRow, targetCol).Value = effVal.Value;
                                    ws.Cell(empRow, targetCol).Style.NumberFormat.Format = "#,##0.00";
                                }
                            }

                            // Also sync Gross Salary, Total Deductions, Net Salary columns in Excel if present
                            for (int c = 1; c <= lastCol; c++)
                            {
                                var header = ws.Cell(1, c).GetString()?.Trim().ToLowerInvariant();
                                if (header == "gross" || header == "gross salary" || header == "total earnings")
                                {
                                    ws.Cell(empRow, c).Value = effectiveGrossTotal;
                                    ws.Cell(empRow, c).Style.NumberFormat.Format = "#,##0.00";
                                }
                                else if (header == "total deductions" || header == "deductions")
                                {
                                    ws.Cell(empRow, c).Value = effectiveDeductionsTotal;
                                    ws.Cell(empRow, c).Style.NumberFormat.Format = "#,##0.00";
                                }
                                else if (header == "net" || header == "net salary" || header == "net pay" || header == "net amount")
                                {
                                    ws.Cell(empRow, c).Value = calculatedNetTotal;
                                    ws.Cell(empRow, c).Style.NumberFormat.Format = "#,##0.00";
                                }
                            }

                            wb.Save();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DraftSave] Note: Underlying excel update: {ex.Message}");
            }
        }

        record.Status = "DraftSaved";
        record.UpdatedAtUtc = DateTime.UtcNow;
        record.LastModifiedByUserName = CurrentUserName;

        await _db.SaveChangesAsync();

        await _audit.RecordAsync(
            CurrentUserId,
            CurrentUserName,
            CurrentUserRole,
            "Payslip.DraftSaved",
            "PayrollRecord",
            record.Id.ToString(),
            $"Saved draft overrides for {record.ImportedEmployeeName} ({record.ImportedEmployeeCode}) in {record.PayrollPeriod?.PeriodLabel}.",
            beforeSummary,
            new
            {
                record.OverrideEmployeeName,
                record.OverrideEmail,
                record.OverrideGrossSalary,
                record.OverrideTotalDeductions,
                record.OverrideNetSalary
            });

        return await GetResolvedPayslipDocument(record.Id);
    }

    [HttpPost("records/{id:guid}/reset-overrides")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> ResetRecordToImported(Guid id)
    {
        var record = await _db.PayrollRecords
            .Include(r => r.Components)
            .Include(r => r.PayrollPeriod)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (record == null)
            return NotFound(new { message = "Payroll record not found." });

        record.OverrideEmployeeCode = null;
        record.OverrideEmployeeName = null;
        record.OverrideEmail = null;
        record.OverrideDepartment = null;
        record.OverrideDesignation = null;
        record.OverrideGrossSalary = null;
        record.OverrideTotalDeductions = null;
        record.OverrideNetSalary = null;
        record.ShowZeroValueRowsOverride = null;
        record.PresentationOverridesJson = null;
        record.CustomFooterNotes = null;
        record.Status = "Imported";
        record.UpdatedAtUtc = DateTime.UtcNow;

        var manualComponents = record.Components.Where(c => c.IsManuallyAdded).ToList();
        if (manualComponents.Count > 0)
        {
            _db.PayrollComponentValues.RemoveRange(manualComponents);
        }

        foreach (var comp in record.Components.Where(c => !c.IsManuallyAdded))
        {
            comp.HasManualOverride = false;
            comp.OverrideNumericValue = null;
            comp.OverrideTextValue = null;
            comp.OverrideLabel = null;
            comp.ExplicitVisibilityOverride = null;
            comp.UpdatedAtUtc = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        await _audit.RecordAsync(
            CurrentUserId,
            CurrentUserName,
            CurrentUserRole,
            "Payslip.ResetToImported",
            "PayrollRecord",
            record.Id.ToString(),
            $"Reset all manual overrides back to original imported values for {record.ImportedEmployeeName} ({record.ImportedEmployeeCode}).");

        return await GetResolvedPayslipDocument(record.Id);
    }

    // ========================================================================
    // PDF GENERATION, PREVIEW & DOWNLOAD (Section 13)
    // ========================================================================
    [HttpPost("records/{id:guid}/pdf")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> GenerateRecordPdf(Guid id, [FromBody] PayslipTemplateConfig? directConfig = null)
    {
        var (docRecord, _) = await _pdfService.GenerateAndPersistPdfAsync(
            id,
            CurrentUserId,
            CurrentUserName,
            CurrentUserRole,
            directConfig);

        return Ok(new
        {
            documentId = docRecord.Id,
            versionCode = docRecord.DocumentVersionCode,
            fileName = docRecord.FileName,
            fileSizeBytes = docRecord.FileSizeBytes,
            sha256Hash = docRecord.Sha256Hash,
            generatedAtUtc = docRecord.GeneratedAtUtc
        });
    }

    [HttpGet("records/{id:guid}/pdf/preview")]
    public async Task<IActionResult> StreamRecordPdfPreview(Guid id)
    {
        var record = await _db.PayrollRecords
            .AsNoTracking()
            .Include(r => r.Employee)
            .Include(r => r.PayrollPeriod)
            .Include(r => r.Components)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (record == null)
            return NotFound(new { message = "Payroll record not found." });

        var settings = await _db.CompanySettings.AsNoTracking().FirstOrDefaultAsync() ?? new CompanySettings();
        PayslipTemplate? template = null;
        if (record.SelectedTemplateId.HasValue)
        {
            template = await _db.PayslipTemplates.AsNoTracking().FirstOrDefaultAsync(t => t.Id == record.SelectedTemplateId.Value);
        }
        template ??= await _db.PayslipTemplates.AsNoTracking().FirstOrDefaultAsync(t => t.IsDefault && !t.IsArchived);

        var model = _resolver.ResolveDocument(record, settings, template);
        var pdfBytes = _pdfService.RenderPdfBytes(model);
        var fileName = $"Payslip_{model.EmployeeCode}_{model.PeriodLabel.Replace(' ', '_')}.pdf";

        Response.Headers.Append("Content-Disposition", $"inline; filename=\"{fileName}\"");
        return File(pdfBytes, "application/pdf");
    }

    [HttpGet("documents/{docId:guid}/download")]
    public async Task<IActionResult> DownloadPersistedPdf(Guid docId)
    {
        var doc = await _db.GeneratedPayslipDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == docId);

        if (doc == null)
            return NotFound(new { message = "Generated PDF document not found." });

        byte[] bytes;
        if (System.IO.File.Exists(doc.StoredFilePath))
        {
            bytes = await System.IO.File.ReadAllBytesAsync(doc.StoredFilePath);
        }
        else
        {
            // Re-render from persisted snapshot if file was cleaned
            var model = JsonSerializer.Deserialize<PayslipDocumentModel>(doc.RenderedDocumentModelJson);
            if (model == null)
                return NotFound(new { message = "Stored PDF file is unavailable." });
            bytes = _pdfService.RenderPdfBytes(model);
        }

        await _audit.RecordAsync(
            CurrentUserId,
            CurrentUserName,
            CurrentUserRole,
            "Pdf.Download",
            "GeneratedPayslipDocument",
            doc.Id.ToString(),
            $"Downloaded PDF '{doc.FileName}' ({doc.DocumentVersionCode}).");

        return File(bytes, "application/pdf", doc.FileName);
    }

    public class ApplyTemplateToPeriodRequest
    {
        public Guid? TemplateId { get; set; }
        public PayslipTemplateConfig? Config { get; set; }
    }

    [HttpPost("periods/{periodId:guid}/apply-template")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> ApplyTemplateToPeriod(Guid periodId, [FromBody] ApplyTemplateToPeriodRequest req)
    {
        var records = await _db.PayrollRecords.Where(r => r.PayrollPeriodId == periodId).ToListAsync();
        if (records.Count == 0)
            return NotFound(new { message = "No records found for period." });

        string? configJson = req.Config != null ? JsonSerializer.Serialize(req.Config) : null;
        foreach (var r in records)
        {
            if (req.TemplateId.HasValue)
                r.SelectedTemplateId = req.TemplateId.Value;
            if (configJson != null)
                r.PresentationOverridesJson = configJson;
            r.UpdatedAtUtc = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        await _audit.RecordAsync(
            CurrentUserId,
            CurrentUserName,
            CurrentUserRole,
            "Template.AppliedToPeriod",
            "PayrollPeriod",
            periodId.ToString(),
            $"Applied template configuration to all {records.Count} payslips in period.");

        return Ok(new { count = records.Count, message = $"Applied template configuration to all {records.Count} employee payslips." });
    }

    // ========================================================================
    // MASTER MULTI-SHEET EXCEL WORKBOOK EXPORT (Section 15)
    // ========================================================================
    [HttpGet("export/master-workbook")]
    public async Task<IActionResult> ExportMasterWorkbook([FromQuery] bool includeOverridesComparison = true)
    {
        var (fileBytes, fileName) = await _excelService.ExportMasterWorkbookAsync(includeOverridesComparison);

        await _audit.RecordAsync(
            CurrentUserId,
            CurrentUserName,
            CurrentUserRole,
            "Payroll.ExportMasterWorkbook",
            "MasterWorkbook",
            fileName,
            $"Exported multi-sheet Master Payroll Archive Workbook ('{fileName}').");

        return File(
            fileBytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName);
    }
}

