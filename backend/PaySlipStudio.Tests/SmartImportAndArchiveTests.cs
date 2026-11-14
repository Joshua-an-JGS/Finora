using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;
using PaySlipStudio.Api.Services;

namespace PaySlipStudio.Tests;

public class SmartImportAndArchiveTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public SmartImportAndArchiveTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string usernameOrEmail, string password)
    {
        var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, cfg) =>
            {
                cfg.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["BootstrapAdmin:ForceSeed"] = "true"
                });
            });
        });

        var client = factory.CreateClient();
        var loginResp = await client.PostAsJsonAsync("/api/auth/login", new
        {
            UsernameOrEmail = usernameOrEmail,
            Password = password
        });
        loginResp.EnsureSuccessStatusCode();

        var loginJson = await loginResp.Content.ReadFromJsonAsync<JsonElement>();
        var token = loginJson.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private byte[] CreateSampleExcelBytes(string sheetName, string monthName, int year)
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add(sheetName);

        // Header
        ws.Cell(1, 1).Value = "Employee ID";
        ws.Cell(1, 2).Value = "Employee Name";
        ws.Cell(1, 3).Value = "Email";
        ws.Cell(1, 4).Value = "Department";
        ws.Cell(1, 5).Value = "Designation";
        ws.Cell(1, 6).Value = "Payroll Month";
        ws.Cell(1, 7).Value = "Basic Salary";
        ws.Cell(1, 8).Value = "HRA";
        ws.Cell(1, 9).Value = "Gross Salary";
        ws.Cell(1, 10).Value = "PF";
        ws.Cell(1, 11).Value = "Total Deductions";
        ws.Cell(1, 12).Value = "Net Salary";

        // Row 1
        ws.Cell(2, 1).Value = "EMP_TEST_01";
        ws.Cell(2, 2).Value = "John Doe";
        ws.Cell(2, 3).Value = "john.doe@test.com";
        ws.Cell(2, 4).Value = "Engineering";
        ws.Cell(2, 5).Value = "Software Engineer";
        ws.Cell(2, 6).Value = $"{monthName} {year}";
        ws.Cell(2, 7).Value = 40000;
        ws.Cell(2, 8).Value = 10000;
        ws.Cell(2, 9).Value = 50000;
        ws.Cell(2, 10).Value = 4000;
        ws.Cell(2, 11).Value = 4000;
        ws.Cell(2, 12).Value = 46000;

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    [Fact]
    public async Task Test1_SingleMonthImport_StoresInYearWiseArchive_AndPersistsPeriod()
    {
        var client = await CreateAuthenticatedClientAsync("admin@amtdc.org", "Admin@12345!");
        var bytes = CreateSampleExcelBytes("November 2026", "November", 2026);

        using var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        content.Add(fileContent, "file", "Test_Payroll_Nov_2026.xlsx");
        content.Add(new StringContent("11"), "month");
        content.Add(new StringContent("2026"), "year");
        content.Add(new StringContent("SingleMonth"), "importMode");

        var uploadResp = await client.PostAsync("/api/payroll/import/upload", content);
        Assert.Equal(HttpStatusCode.OK, uploadResp.StatusCode);

        var uploadJson = await uploadResp.Content.ReadFromJsonAsync<JsonElement>();
        var batchId = uploadJson.GetProperty("importBatchId").GetGuid();

        // Commit batch
        var commitResp = await client.PostAsJsonAsync($"/api/payroll/import/{batchId}/commit", new { allowReplaceExisting = true });
        Assert.Equal(HttpStatusCode.OK, commitResp.StatusCode);

        // Verify batch in archive
        var archiveResp = await client.GetFromJsonAsync<List<ArchiveYearGroupDto>>("/api/payroll/import/archive?year=2026");
        Assert.NotNull(archiveResp);
        var year2026 = archiveResp.FirstOrDefault(y => y.Year == 2026);
        Assert.NotNull(year2026);

        var nov = year2026.Months.FirstOrDefault(m => m.Month == 11);
        Assert.NotNull(nov);
        Assert.True(nov.IsImported);
        Assert.True(nov.EmployeeCount > 0);

        var archivedFile = year2026.ArchivedFiles.FirstOrDefault(f => f.ImportBatchId == batchId);
        Assert.NotNull(archivedFile);
        Assert.Equal("Retained", archivedFile.SourceFileRetentionStatus);
        Assert.True(archivedFile.PhysicalFileExists);
    }

    [Fact]
    public async Task Test2_HistoricalYear2025_StoredUnder2025Directory()
    {
        var client = await CreateAuthenticatedClientAsync("admin@amtdc.org", "Admin@12345!");
        var bytes = CreateSampleExcelBytes("March 2025", "March", 2025);

        using var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        content.Add(fileContent, "file", "Historical_2025_Payroll.xlsx");
        content.Add(new StringContent("3"), "month");
        content.Add(new StringContent("2025"), "year");
        content.Add(new StringContent("SingleMonth"), "importMode");

        var uploadResp = await client.PostAsync("/api/payroll/import/upload", content);
        Assert.Equal(HttpStatusCode.OK, uploadResp.StatusCode);

        var uploadJson = await uploadResp.Content.ReadFromJsonAsync<JsonElement>();
        var batchId = uploadJson.GetProperty("importBatchId").GetGuid();

        var commitResp = await client.PostAsJsonAsync($"/api/payroll/import/{batchId}/commit", new { allowReplaceExisting = true });
        Assert.Equal(HttpStatusCode.OK, commitResp.StatusCode);

        // Check archive for 2025
        var archiveResp = await client.GetFromJsonAsync<List<ArchiveYearGroupDto>>("/api/payroll/import/archive?year=2025");
        Assert.NotNull(archiveResp);
        var year2025 = archiveResp.FirstOrDefault(y => y.Year == 2025);
        Assert.NotNull(year2025);

        var march = year2025.Months.FirstOrDefault(m => m.Month == 3);
        Assert.NotNull(march);
        Assert.True(march.IsImported);
    }

    [Fact]
    public async Task Test3_DeleteOriginalFile_RemovesPhysicalFile_KeepsPayrollRecordsIntact()
    {
        var client = await CreateAuthenticatedClientAsync("admin@amtdc.org", "Admin@12345!");
        var bytes = CreateSampleExcelBytes("August 2026", "August", 2026);

        using var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        content.Add(fileContent, "file", "Payroll_Aug_DeleteTest.xlsx");
        content.Add(new StringContent("8"), "month");
        content.Add(new StringContent("2026"), "year");

        var uploadResp = await client.PostAsync("/api/payroll/import/upload", content);
        var uploadJson = await uploadResp.Content.ReadFromJsonAsync<JsonElement>();
        var batchId = uploadJson.GetProperty("importBatchId").GetGuid();

        await client.PostAsJsonAsync($"/api/payroll/import/{batchId}/commit", new { allowReplaceExisting = true });

        // Delete the original Excel file only
        var delResp = await client.DeleteAsync($"/api/payroll/import/archive/{batchId}/file");
        Assert.Equal(HttpStatusCode.OK, delResp.StatusCode);

        // Verify physical file download returns 404
        var downloadResp = await client.GetAsync($"/api/payroll/import/archive/{batchId}/download");
        Assert.Equal(HttpStatusCode.NotFound, downloadResp.StatusCode);

        // Verify payroll records are STILL INTACT!
        var archiveResp = await client.GetFromJsonAsync<List<ArchiveYearGroupDto>>("/api/payroll/import/archive?year=2026");
        var aug = archiveResp!.Single(y => y.Year == 2026).Months.Single(m => m.Month == 8);
        Assert.True(aug.IsImported);
        Assert.True(aug.EmployeeCount > 0);

        var fileItem = archiveResp.Single(y => y.Year == 2026).ArchivedFiles.Single(f => f.ImportBatchId == batchId);
        Assert.Equal("Deleted", fileItem.SourceFileRetentionStatus);
        Assert.False(fileItem.PhysicalFileExists);
    }

    [Fact]
    public async Task Test4_DuplicateImport_DetectsSha256_AndIdentifiesPreviousImport()
    {
        var client = await CreateAuthenticatedClientAsync("admin@amtdc.org", "Admin@12345!");
        var bytes = CreateSampleExcelBytes("May 2026", "May", 2026);

        // First upload
        using var content1 = new MultipartFormDataContent();
        var file1 = new ByteArrayContent(bytes);
        file1.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        content1.Add(file1, "file", "Payroll_May_DuplicateTest.xlsx");
        content1.Add(new StringContent("5"), "month");
        content1.Add(new StringContent("2026"), "year");

        var uploadResp1 = await client.PostAsync("/api/payroll/import/upload", content1);
        var json1 = await uploadResp1.Content.ReadFromJsonAsync<JsonElement>();
        var batchId1 = json1.GetProperty("importBatchId").GetGuid();
        await client.PostAsJsonAsync($"/api/payroll/import/{batchId1}/commit", new { allowReplaceExisting = true });

        // Second upload of identical bytes
        using var content2 = new MultipartFormDataContent();
        var file2 = new ByteArrayContent(bytes);
        file2.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        content2.Add(file2, "file", "Payroll_May_DuplicateTest_Copy.xlsx");
        content2.Add(new StringContent("5"), "month");
        content2.Add(new StringContent("2026"), "year");

        var uploadResp2 = await client.PostAsync("/api/payroll/import/upload", content2);
        var json2 = await uploadResp2.Content.ReadFromJsonAsync<JsonElement>();

        Assert.True(json2.GetProperty("isDuplicateFile").GetBoolean());
        Assert.Equal(batchId1, json2.GetProperty("previousImportBatchId").GetGuid());
    }

    [Fact]
    public async Task Test5_ControlledReimportDiff_IdentifiesAddedUpdatedUnchangedRecords()
    {
        var client = await CreateAuthenticatedClientAsync("admin@amtdc.org", "Admin@12345!");
        var bytes1 = CreateSampleExcelBytes("June 2026", "June", 2026);

        // Upload and commit baseline
        using var content1 = new MultipartFormDataContent();
        var file1 = new ByteArrayContent(bytes1);
        file1.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        content1.Add(file1, "file", "Payroll_June_Diff1.xlsx");
        content1.Add(new StringContent("6"), "month");
        content1.Add(new StringContent("2026"), "year");

        var uploadResp1 = await client.PostAsync("/api/payroll/import/upload", content1);
        var json1 = await uploadResp1.Content.ReadFromJsonAsync<JsonElement>();
        var batchId1 = json1.GetProperty("importBatchId").GetGuid();
        await client.PostAsJsonAsync($"/api/payroll/import/{batchId1}/commit", new { allowReplaceExisting = true });

        // Create modified workbook: EMP_TEST_01 has higher Net Salary (50000 instead of 46000), plus new employee EMP_TEST_02
        using var wb2 = new XLWorkbook();
        var ws2 = wb2.Worksheets.Add("June 2026");
        ws2.Cell(1, 1).Value = "Employee ID";
        ws2.Cell(1, 2).Value = "Employee Name";
        ws2.Cell(1, 3).Value = "Email";
        ws2.Cell(1, 4).Value = "Department";
        ws2.Cell(1, 5).Value = "Designation";
        ws2.Cell(1, 6).Value = "Payroll Month";
        ws2.Cell(1, 7).Value = "Basic Salary";
        ws2.Cell(1, 8).Value = "HRA";
        ws2.Cell(1, 9).Value = "Gross Salary";
        ws2.Cell(1, 10).Value = "PF";
        ws2.Cell(1, 11).Value = "Total Deductions";
        ws2.Cell(1, 12).Value = "Net Salary";

        // Row 1: Modified EMP_TEST_01
        ws2.Cell(2, 1).Value = "EMP_TEST_01";
        ws2.Cell(2, 2).Value = "John Doe";
        ws2.Cell(2, 3).Value = "john.doe@test.com";
        ws2.Cell(2, 4).Value = "Engineering";
        ws2.Cell(2, 5).Value = "Software Engineer";
        ws2.Cell(2, 6).Value = "June 2026";
        ws2.Cell(2, 7).Value = 44000; // Increased
        ws2.Cell(2, 8).Value = 10000;
        ws2.Cell(2, 9).Value = 54000;
        ws2.Cell(2, 10).Value = 4000;
        ws2.Cell(2, 11).Value = 4000;
        ws2.Cell(2, 12).Value = 50000; // Changed from 46000

        // Row 2: Added EMP_TEST_02
        ws2.Cell(3, 1).Value = "EMP_TEST_02";
        ws2.Cell(3, 2).Value = "Jane Smith";
        ws2.Cell(3, 3).Value = "jane.smith@test.com";
        ws2.Cell(3, 4).Value = "Finance";
        ws2.Cell(3, 5).Value = "Accountant";
        ws2.Cell(3, 6).Value = "June 2026";
        ws2.Cell(3, 7).Value = 35000;
        ws2.Cell(3, 8).Value = 8000;
        ws2.Cell(3, 9).Value = 43000;
        ws2.Cell(3, 10).Value = 3000;
        ws2.Cell(3, 11).Value = 3000;
        ws2.Cell(3, 12).Value = 40000;

        using var ms2 = new MemoryStream();
        wb2.SaveAs(ms2);
        var bytes2 = ms2.ToArray();

        using var content2 = new MultipartFormDataContent();
        var file2 = new ByteArrayContent(bytes2);
        file2.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        content2.Add(file2, "file", "Payroll_June_Diff2.xlsx");
        content2.Add(new StringContent("6"), "month");
        content2.Add(new StringContent("2026"), "year");

        var uploadResp2 = await client.PostAsync("/api/payroll/import/upload", content2);
        var json2 = await uploadResp2.Content.ReadFromJsonAsync<JsonElement>();
        var batchId2 = json2.GetProperty("importBatchId").GetGuid();

        // Get diff
        var diffResp = await client.PostAsJsonAsync($"/api/payroll/import/{batchId2}/reimport-diff", new
        {
            month = 6,
            year = 2026,
            worksheetName = "June 2026"
        });
        Assert.Equal(HttpStatusCode.OK, diffResp.StatusCode);

        var diff = await diffResp.Content.ReadFromJsonAsync<ControlledReimportDiffDto>(new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        Assert.NotNull(diff);
        Assert.Equal(1, diff.AddedCount);
        Assert.Equal(1, diff.UpdatedCount);
        Assert.Equal(0, diff.UnchangedCount);

        var updatedEmp = diff.UpdatedRows.Single(r => r.EmployeeCode == "EMP_TEST_01");
        Assert.Contains(updatedEmp.ChangedFields!, f => f.Contains("Net Salary"));
    }

    [Fact]
    public async Task Test6_MultiPeriodCommit_PersistsMultiplePeriods_WithOneBatchAndNoFileDuplication()
    {
        var client = await CreateAuthenticatedClientAsync("admin@amtdc.org", "Admin@12345!");

        // Create workbook with two sheets: Jan 2027 and Feb 2027
        using var wb = new XLWorkbook();

        var ws1 = wb.Worksheets.Add("January 2027");
        ws1.Cell(1, 1).Value = "Employee ID"; ws1.Cell(1, 2).Value = "Employee Name"; ws1.Cell(1, 3).Value = "Gross Salary"; ws1.Cell(1, 4).Value = "Net Salary";
        ws1.Cell(2, 1).Value = "EMP_MULTI_01"; ws1.Cell(2, 2).Value = "Multi User"; ws1.Cell(2, 3).Value = 50000; ws1.Cell(2, 4).Value = 45000;

        var ws2 = wb.Worksheets.Add("February 2027");
        ws2.Cell(1, 1).Value = "Employee ID"; ws2.Cell(1, 2).Value = "Employee Name"; ws2.Cell(1, 3).Value = "Gross Salary"; ws2.Cell(1, 4).Value = "Net Salary";
        ws2.Cell(2, 1).Value = "EMP_MULTI_01"; ws2.Cell(2, 2).Value = "Multi User"; ws2.Cell(2, 3).Value = 52000; ws2.Cell(2, 4).Value = 47000;

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        var bytes = ms.ToArray();

        using var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        content.Add(fileContent, "file", "Payroll_Multi_2027.xlsx");
        content.Add(new StringContent("1"), "month");
        content.Add(new StringContent("2027"), "year");
        content.Add(new StringContent("AutoDetect"), "importMode");

        var uploadResp = await client.PostAsync("/api/payroll/import/upload", content);
        Assert.Equal(HttpStatusCode.OK, uploadResp.StatusCode);

        var uploadJson = await uploadResp.Content.ReadFromJsonAsync<JsonElement>();
        var batchId = uploadJson.GetProperty("importBatchId").GetGuid();

        // Commit both periods via commit-multi
        var commitMultiResp = await client.PostAsJsonAsync($"/api/payroll/import/{batchId}/commit-multi", new
        {
            SelectedPeriods = new[]
            {
                new { Month = 1, Year = 2027, WorksheetName = "January 2027" },
                new { Month = 2, Year = 2027, WorksheetName = "February 2027" }
            },
            AllowReplaceExisting = true
        });
        Assert.Equal(HttpStatusCode.OK, commitMultiResp.StatusCode);

        // Check archive: 2027 should now show BOTH January and February imported under one archived file!
        var archiveResp = await client.GetFromJsonAsync<List<ArchiveYearGroupDto>>("/api/payroll/import/archive?year=2027");
        var y2027 = archiveResp!.Single(y => y.Year == 2027);

        var jan = y2027.Months.Single(m => m.Month == 1);
        Assert.True(jan.IsImported);

        var feb = y2027.Months.Single(m => m.Month == 2);
        Assert.True(feb.IsImported);

        // Exactly one archived file for this batch
        var archivedFile = y2027.ArchivedFiles.Single(f => f.ImportBatchId == batchId);
        Assert.Equal("Retained", archivedFile.SourceFileRetentionStatus);
        Assert.True(archivedFile.PhysicalFileExists);
    }

    [Fact]
    public async Task Test7_BatchSafetyCheck_AndAdminRemoval()
    {
        var client = await CreateAuthenticatedClientAsync("admin@amtdc.org", "Admin@12345!");
        var bytes = CreateSampleExcelBytes("July 2026", "July", 2026);

        using var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        content.Add(fileContent, "file", "Payroll_July_SafetyTest.xlsx");
        content.Add(new StringContent("7"), "month");
        content.Add(new StringContent("2026"), "year");

        var uploadResp = await client.PostAsync("/api/payroll/import/upload", content);
        var uploadJson = await uploadResp.Content.ReadFromJsonAsync<JsonElement>();
        var batchId = uploadJson.GetProperty("importBatchId").GetGuid();

        await client.PostAsJsonAsync($"/api/payroll/import/{batchId}/commit", new { allowReplaceExisting = true });

        // Safety check endpoint
        var safetyResp = await client.GetFromJsonAsync<RemoveBatchSafetyCheckDto>($"/api/payroll/import/archive/{batchId}/safety");
        Assert.NotNull(safetyResp);
        Assert.True(safetyResp.CanRemove); // No payslip emails sent yet

        // Remove batch as admin
        var removeResp = await client.DeleteAsync($"/api/payroll/import/archive/{batchId}/batch?force=false");
        Assert.Equal(HttpStatusCode.OK, removeResp.StatusCode);

        // Verify batch removed from archive
        var archiveResp = await client.GetFromJsonAsync<List<ArchiveYearGroupDto>>("/api/payroll/import/archive?year=2026");
        var y2026 = archiveResp!.Single(y => y.Year == 2026);
        Assert.DoesNotContain(y2026.ArchivedFiles, f => f.ImportBatchId == batchId);
    }

    [Fact]
    public async Task Test8_DynamicPayrollYears_ReturnsDatabaseAndCandidateYears()
    {
        var client = await CreateAuthenticatedClientAsync("admin@amtdc.org", "Admin@12345!");
        var yearsResp = await client.GetFromJsonAsync<PayrollYearsDto>("/api/payroll/years");

        Assert.NotNull(yearsResp);
        Assert.True(yearsResp.AvailableYears.Contains(2026));
        Assert.True(yearsResp.AvailableYears.Contains(2027));
        Assert.True(yearsResp.AvailableYears.Contains(2025));
        // Verify candidate years cover future import candidates
        Assert.True(yearsResp.ImportCandidateYears.Contains(2029));
        Assert.True(yearsResp.ImportCandidateYears.Contains(2030));
        // Verify sorted descending
        var sorted = yearsResp.AvailableYears.OrderByDescending(y => y).ToList();
        Assert.Equal(sorted, yearsResp.AvailableYears);
    }

    [Fact]
    public async Task Test9_ImportingNewYear_DynamicallyExposesYearAcrossSystem()
    {
        var client = await CreateAuthenticatedClientAsync("admin@amtdc.org", "Admin@12345!");
        // Create sample workbook for year 2029
        var bytes = CreateSampleExcelBytes("January 2029", "January", 2029);

        using var content = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        content.Add(fileContent, "file", "Payroll_2029_Test.xlsx");
        content.Add(new StringContent("1"), "month");
        content.Add(new StringContent("2029"), "year");

        var uploadResp = await client.PostAsync("/api/payroll/import/upload", content);
        var uploadJson = await uploadResp.Content.ReadFromJsonAsync<JsonElement>();
        var batchId = uploadJson.GetProperty("importBatchId").GetGuid();

        // Commit import for 2029
        var commitResp = await client.PostAsJsonAsync($"/api/payroll/import/{batchId}/commit", new { allowReplaceExisting = true });
        commitResp.EnsureSuccessStatusCode();

        // 1. Verify dynamic years API now includes 2029
        var yearsResp = await client.GetFromJsonAsync<PayrollYearsDto>("/api/payroll/years?force=true");
        Assert.NotNull(yearsResp);
        Assert.Contains(2029, yearsResp.AvailableYears);

        // 2. Verify archive now includes year 2029 group with 1 month imported
        var archiveResp = await client.GetFromJsonAsync<List<ArchiveYearGroupDto>>("/api/payroll/import/archive?year=2029");
        Assert.NotNull(archiveResp);
        var y2029 = archiveResp.Single(y => y.Year == 2029);
        var jan2029 = y2029.Months.Single(m => m.Month == 1);
        Assert.True(jan2029.IsImported);
        Assert.True(jan2029.EmployeeCount > 0);
    }
}
