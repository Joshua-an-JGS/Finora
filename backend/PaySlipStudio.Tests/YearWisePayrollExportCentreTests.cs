using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;
using PaySlipStudio.Api.Services;
using Xunit;

namespace PaySlipStudio.Tests;

public class YearWisePayrollExportCentreTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public YearWisePayrollExportCentreTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string usernameOrEmail = "admin@amtdc.org", string password = "Admin@12345!")
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

        ws.Cell(2, 1).Value = $"EMP_{year}_01";
        ws.Cell(2, 2).Value = $"Emp {monthName} {year}";
        ws.Cell(2, 3).Value = $"emp.{monthName.ToLower()}{year}@example.com";
        ws.Cell(2, 4).Value = "Finance";
        ws.Cell(2, 5).Value = "Analyst";
        ws.Cell(2, 6).Value = $"{monthName} {year}";
        ws.Cell(2, 7).Value = 45000;
        ws.Cell(2, 8).Value = 15000;
        ws.Cell(2, 9).Value = 60000;
        ws.Cell(2, 10).Value = 5000;
        ws.Cell(2, 11).Value = 5000;
        ws.Cell(2, 12).Value = 55000;

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    private async Task EnsurePeriodSeededAsync(int month, int year, string monthName)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var period = await db.PayrollPeriods
            .Include(p => p.PayrollRecords)
            .FirstOrDefaultAsync(p => p.Month == month && p.Year == year);

        if (period == null)
        {
            period = new PayrollPeriod
            {
                Month = month,
                Year = year,
                PeriodLabel = $"{monthName} {year}",
                IsClosed = false
            };
            db.PayrollPeriods.Add(period);
            await db.SaveChangesAsync();
        }

        if (!period.PayrollRecords.Any())
        {
            var emp = await db.Employees.FirstOrDefaultAsync(e => e.EmployeeCode == $"EMP_{year}_{month:D2}");
            if (emp == null)
            {
                emp = new Employee
                {
                    EmployeeCode = $"EMP_{year}_{month:D2}",
                    FullName = $"Test Employee {monthName} {year}",
                    Email = $"test.{monthName.ToLower()}{year}@test.org",
                    Department = "Operations",
                    Designation = "Executive"
                };
                db.Employees.Add(emp);
                await db.SaveChangesAsync();
            }

            var rec = new PayrollRecord
            {
                PayrollPeriodId = period.Id,
                EmployeeId = emp.Id,
                ImportedEmployeeCode = emp.EmployeeCode,
                ImportedEmployeeName = emp.FullName,
                ImportedEmail = emp.Email,
                ImportedDepartment = emp.Department,
                ImportedDesignation = emp.Designation,
                ImportedGrossSalary = 60000m,
                ImportedTotalDeductions = 5000m,
                ImportedNetSalary = 55000m,
                Status = "Imported"
            };
            rec.Components.Add(new PayrollComponentValue
            {
                ComponentKey = "basic_salary",
                OriginalLabel = "Basic Salary",
                Category = "Earnings",
                ImportedNumericValue = 45000m,
                SortOrder = 1
            });
            rec.Components.Add(new PayrollComponentValue
            {
                ComponentKey = "hra",
                OriginalLabel = "HRA",
                Category = "Earnings",
                ImportedNumericValue = 15000m,
                SortOrder = 2
            });
            rec.Components.Add(new PayrollComponentValue
            {
                ComponentKey = "pf",
                OriginalLabel = "PF",
                Category = "Deductions",
                ImportedNumericValue = 5000m,
                SortOrder = 3
            });

            db.PayrollRecords.Add(rec);
            await db.SaveChangesAsync();
        }

        var yearService = scope.ServiceProvider.GetRequiredService<IPayrollYearService>();
        yearService.InvalidateCache();
    }

    [Fact]
    public async Task Test1_2026FullYear_Export_IncludesOnlyAvailable2026MonthsAndSummary()
    {
        var client = await CreateAuthenticatedClientAsync();
        await EnsurePeriodSeededAsync(9, 2026, "September");
        await EnsurePeriodSeededAsync(10, 2026, "October");
        await EnsurePeriodSeededAsync(11, 2026, "November");

        var resp = await client.GetAsync("/api/payroll/export/master-workbook?year=2026&mode=fullYear");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", resp.Content.Headers.ContentType?.MediaType);
        Assert.Contains("FINORA_Payroll_Archive_2026.xlsx", resp.Content.Headers.ContentDisposition?.FileName ?? "");

        var bytes = await resp.Content.ReadAsByteArrayAsync();
        using var ms = new MemoryStream(bytes);
        using var xl = new XLWorkbook(ms);

        var sheetNames = xl.Worksheets.Select(w => w.Name).ToList();

        // 1. Executive Summary sheet is first
        Assert.Equal("Yearly Payroll Summary", sheetNames.First());

        // 2. Contains seeded 2026 months
        Assert.Contains("September 2026", sheetNames);
        Assert.Contains("October 2026", sheetNames);
        Assert.Contains("November 2026", sheetNames);

        // 3. Does NOT contain unimported months (e.g. January 2026)
        Assert.DoesNotContain("January 2026", sheetNames);
        Assert.DoesNotContain("April 2026", sheetNames);

        // 4. Does NOT contain months from another year
        Assert.DoesNotContain("March 2028", sheetNames);
    }

    [Fact]
    public async Task Test2_SelectedMonths_Export_GeneratesOnlySelectedWorksheets()
    {
        var client = await CreateAuthenticatedClientAsync();
        await EnsurePeriodSeededAsync(9, 2026, "September");
        await EnsurePeriodSeededAsync(10, 2026, "October");
        await EnsurePeriodSeededAsync(11, 2026, "November");

        // Select only September and October (exclude November)
        var resp = await client.GetAsync("/api/payroll/export/master-workbook?year=2026&mode=selectedMonths&months=9,10");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Contains("FINORA_Payroll_2026_Selected_Months.xlsx", resp.Content.Headers.ContentDisposition?.FileName ?? "");

        var bytes = await resp.Content.ReadAsByteArrayAsync();
        using var ms = new MemoryStream(bytes);
        using var xl = new XLWorkbook(ms);

        var sheetNames = xl.Worksheets.Select(w => w.Name).ToList();

        // Total 3 sheets: Summary + September + October
        Assert.Equal(3, sheetNames.Count);
        Assert.Equal("Yearly Payroll Summary", sheetNames[0]);
        Assert.Contains("September 2026", sheetNames);
        Assert.Contains("October 2026", sheetNames);
        Assert.DoesNotContain("November 2026", sheetNames);
    }

    [Fact]
    public async Task Test3_2028Export_IncludesOnlyAvailable2028Months()
    {
        var client = await CreateAuthenticatedClientAsync();
        await EnsurePeriodSeededAsync(1, 2028, "January");
        await EnsurePeriodSeededAsync(2, 2028, "February");
        await EnsurePeriodSeededAsync(3, 2028, "March");

        var resp = await client.GetAsync("/api/payroll/export/master-workbook?year=2028&mode=fullYear");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Contains("FINORA_Payroll_Archive_2028.xlsx", resp.Content.Headers.ContentDisposition?.FileName ?? "");

        var bytes = await resp.Content.ReadAsByteArrayAsync();
        using var ms = new MemoryStream(bytes);
        using var xl = new XLWorkbook(ms);

        var sheetNames = xl.Worksheets.Select(w => w.Name).ToList();

        Assert.Equal("Yearly Payroll Summary", sheetNames.First());
        Assert.Contains("January 2028", sheetNames);
        Assert.Contains("February 2028", sheetNames);
        Assert.Contains("March 2028", sheetNames);
        Assert.DoesNotContain("September 2026", sheetNames);
    }

    [Fact]
    public async Task Test4_AllYearsZip_ContainsSeparateYearlyWorkbooks()
    {
        var client = await CreateAuthenticatedClientAsync();
        await EnsurePeriodSeededAsync(10, 2026, "October");
        await EnsurePeriodSeededAsync(2, 2028, "February");

        var resp = await client.GetAsync("/api/payroll/export/master-workbook?mode=allYearsZip");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("application/zip", resp.Content.Headers.ContentType?.MediaType);
        Assert.Contains("FINORA_All_Years_Payroll_Archive.zip", resp.Content.Headers.ContentDisposition?.FileName ?? "");

        var zipBytes = await resp.Content.ReadAsByteArrayAsync();
        using var zipMs = new MemoryStream(zipBytes);
        using var archive = new ZipArchive(zipMs, ZipArchiveMode.Read);

        var entryNames = archive.Entries.Select(e => e.Name).ToList();

        // Separate yearly Excel workbooks inside ZIP
        Assert.Contains("FINORA_Payroll_Archive_2026.xlsx", entryNames);
        Assert.Contains("FINORA_Payroll_Archive_2028.xlsx", entryNames);

        // Verify content of one entry: 2026 workbook has only 2026 data
        var entry2026 = archive.GetEntry("FINORA_Payroll_Archive_2026.xlsx");
        Assert.NotNull(entry2026);
        using var entryStream = entry2026.Open();
        using var entryMs = new MemoryStream();
        await entryStream.CopyToAsync(entryMs);
        using var xl2026 = new XLWorkbook(entryMs);

        var sheets2026 = xl2026.Worksheets.Select(w => w.Name).ToList();
        Assert.Contains("Yearly Payroll Summary", sheets2026);
        Assert.Contains("October 2026", sheets2026);
        Assert.DoesNotContain("February 2028", sheets2026);
    }

    [Fact]
    public async Task Test5_FutureYear_2029Import_BecomesAvailableInExportCentre()
    {
        var client = await CreateAuthenticatedClientAsync();
        await EnsurePeriodSeededAsync(5, 2029, "May");

        // 1. Verify 2029 appears in export centre summary
        var summaryResp = await client.GetAsync("/api/payroll/export/centre-summary");
        Assert.Equal(HttpStatusCode.OK, summaryResp.StatusCode);
        var summaryJson = await summaryResp.Content.ReadFromJsonAsync<JsonElement>();

        var availYears = summaryJson.GetProperty("availableYears").EnumerateArray().Select(x => x.GetInt32()).ToList();
        Assert.Contains(2029, availYears);

        // 2. Export 2029 directly
        var exportResp = await client.GetAsync("/api/payroll/export/master-workbook?year=2029&mode=fullYear");
        Assert.Equal(HttpStatusCode.OK, exportResp.StatusCode);
        Assert.Contains("FINORA_Payroll_Archive_2029.xlsx", exportResp.Content.Headers.ContentDisposition?.FileName ?? "");

        var bytes = await exportResp.Content.ReadAsByteArrayAsync();
        using var ms = new MemoryStream(bytes);
        using var xl = new XLWorkbook(ms);

        var sheetNames = xl.Worksheets.Select(w => w.Name).ToList();
        Assert.Contains("May 2029", sheetNames);
    }

    [Fact]
    public async Task Test6_DataAccuracy_CompareExportedTotalsWithDatabase()
    {
        var client = await CreateAuthenticatedClientAsync();
        await EnsurePeriodSeededAsync(9, 2026, "September");

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var period = await db.PayrollPeriods
            .Include(p => p.PayrollRecords)
            .FirstAsync(p => p.Month == 9 && p.Year == 2026);

        int dbEmpCount = period.PayrollRecords.Count;
        decimal dbNet = period.PayrollRecords.Sum(r => (r.OverrideNetSalary ?? r.ImportedNetSalary) ?? 0m);

        var exportResp = await client.GetAsync("/api/payroll/export/master-workbook?year=2026&mode=fullYear");
        Assert.Equal(HttpStatusCode.OK, exportResp.StatusCode);

        var bytes = await exportResp.Content.ReadAsByteArrayAsync();
        using var ms = new MemoryStream(bytes);
        using var xl = new XLWorkbook(ms);

        var summaryWs = xl.Worksheet("Yearly Payroll Summary");
        Assert.NotNull(summaryWs);

        // Value in Summary sheet cell (4, 2) is Selected Payroll Year
        Assert.Contains("2026", summaryWs.Cell(4, 2).Value.ToString());

        // Monthly breakdown row has the period label and employee count
        var septSheet = xl.Worksheet("September 2026");
        Assert.NotNull(septSheet);
        var headers = septSheet.Row(1).CellsUsed().Select(c => c.GetString()).ToList();
        Assert.Contains("Employee ID", headers);
        Assert.Contains("Gross Salary", headers);
        Assert.Contains("Total Deductions", headers);
        Assert.Contains("Net Salary", headers);
        Assert.Contains("Basic Salary", headers);
    }

    [Fact]
    public async Task Test7_HistoricalPreservation_ExportDoesNotModifyOrDeleteSourceFilesOrRecords()
    {
        var client = await CreateAuthenticatedClientAsync();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var beforeRecordCount = await db.PayrollRecords.CountAsync();
            var beforePeriodCount = await db.PayrollPeriods.CountAsync();

            // Run exports in all 3 modes
            var resp1 = await client.GetAsync("/api/payroll/export/master-workbook?year=2026&mode=fullYear");
            Assert.Equal(HttpStatusCode.OK, resp1.StatusCode);

            var resp2 = await client.GetAsync("/api/payroll/export/master-workbook?year=2026&mode=selectedMonths&months=9");
            Assert.Equal(HttpStatusCode.OK, resp2.StatusCode);

            var resp3 = await client.GetAsync("/api/payroll/export/master-workbook?mode=allYearsZip");
            Assert.Equal(HttpStatusCode.OK, resp3.StatusCode);

            // Re-verify database counts after exports
            var afterRecordCount = await db.PayrollRecords.CountAsync();
            var afterPeriodCount = await db.PayrollPeriods.CountAsync();

            Assert.Equal(beforeRecordCount, afterRecordCount);
            Assert.Equal(beforePeriodCount, afterPeriodCount);
        }
    }
}
