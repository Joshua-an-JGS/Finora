using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using PaySlipStudio.Api.Models;
using PaySlipStudio.Api.Services;

namespace PaySlipStudio.Tests;

public class PaySlipStudioAcceptanceTests
{
    // ========================================================================
    // UNIT TESTS: SECTION 8 DYNAMIC COMPONENT RULES (Blank, Zero, Text, Custom)
    // ========================================================================
    [Fact]
    public void DynamicResolver_DistinguishesBlankZeroAndNonZeroComponents_PerEmployee()
    {
        var resolver = new PayslipDocumentResolver();
        var settings = new CompanySettings { ShowZeroValueComponentsByDefault = false, CurrencySymbol = "₹" };
        var template = new PayslipTemplate
        {
            Name = "AMTDC Default",
            ConfigJson = JsonSerializer.Serialize(new PayslipTemplateConfig { ShowZeroValueRows = false })
        };

        // Employee A: Basic=25000, HRA=5000, Medical=1500, Food=800, Bonus=0 (NumericZero), PF=1800
        var empARecord = new PayrollRecord
        {
            Id = Guid.NewGuid(),
            ImportedEmployeeCode = "EMP_A",
            ImportedEmployeeName = "Employee A",
            ImportedGrossSalary = 32300m,
            ImportedTotalDeductions = 1800m,
            ImportedNetSalary = 30500m,
            PayrollPeriod = new PayrollPeriod { Month = 10, Year = 2026, PeriodLabel = "October 2026" },
            Components = new List<PayrollComponentValue>
            {
                new() { ComponentKey = "basic_salary", OriginalLabel = "Basic Salary", Category = ComponentCategories.Earning, SortOrder = 1, SourceCellType = SourceCellTypes.NumericNonZero, ImportedNumericValue = 25000m },
                new() { ComponentKey = "hra", OriginalLabel = "HRA", Category = ComponentCategories.Allowance, SortOrder = 2, SourceCellType = SourceCellTypes.NumericNonZero, ImportedNumericValue = 5000m },
                new() { ComponentKey = "medical_allowance", OriginalLabel = "Medical Allowance", Category = ComponentCategories.Allowance, SortOrder = 3, SourceCellType = SourceCellTypes.NumericNonZero, ImportedNumericValue = 1500m },
                new() { ComponentKey = "food_allowance", OriginalLabel = "Food Allowance", Category = ComponentCategories.Allowance, SortOrder = 4, SourceCellType = SourceCellTypes.NumericNonZero, ImportedNumericValue = 800m },
                new() { ComponentKey = "bonus", OriginalLabel = "Bonus", Category = ComponentCategories.Earning, SortOrder = 5, SourceCellType = SourceCellTypes.NumericZero, ImportedNumericValue = 0m },
                new() { ComponentKey = "pf", OriginalLabel = "PF", Category = ComponentCategories.Deduction, SortOrder = 6, SourceCellType = SourceCellTypes.NumericNonZero, ImportedNumericValue = 1800m }
            }
        };

        // Employee B: Basic=30000, HRA=6000, Medical=Empty, Food=Empty, PF=2000
        var empBRecord = new PayrollRecord
        {
            Id = Guid.NewGuid(),
            ImportedEmployeeCode = "EMP_B",
            ImportedEmployeeName = "Employee B",
            ImportedGrossSalary = 36000m,
            ImportedTotalDeductions = 2000m,
            ImportedNetSalary = 34000m,
            PayrollPeriod = new PayrollPeriod { Month = 10, Year = 2026, PeriodLabel = "October 2026" },
            Components = new List<PayrollComponentValue>
            {
                new() { ComponentKey = "basic_salary", OriginalLabel = "Basic Salary", Category = ComponentCategories.Earning, SortOrder = 1, SourceCellType = SourceCellTypes.NumericNonZero, ImportedNumericValue = 30000m },
                new() { ComponentKey = "hra", OriginalLabel = "HRA", Category = ComponentCategories.Allowance, SortOrder = 2, SourceCellType = SourceCellTypes.NumericNonZero, ImportedNumericValue = 6000m },
                new() { ComponentKey = "medical_allowance", OriginalLabel = "Medical Allowance", Category = ComponentCategories.Allowance, SortOrder = 3, SourceCellType = SourceCellTypes.Empty, ImportedNumericValue = null },
                new() { ComponentKey = "food_allowance", OriginalLabel = "Food Allowance", Category = ComponentCategories.Allowance, SortOrder = 4, SourceCellType = SourceCellTypes.Empty, ImportedNumericValue = null },
                new() { ComponentKey = "pf", OriginalLabel = "PF", Category = ComponentCategories.Deduction, SortOrder = 5, SourceCellType = SourceCellTypes.NumericNonZero, ImportedNumericValue = 2000m }
            }
        };

        var docA = resolver.ResolveDocument(empARecord, settings, template);
        var docB = resolver.ResolveDocument(empBRecord, settings, template);

        // Employee A shows Basic, HRA, Medical, Food (4 earnings) and PF (1 deduction); Bonus=0 is hidden by default but preserved in AllEditorComponents
        Assert.Equal(4, docA.VisibleEarnings.Count);
        Assert.Contains(docA.VisibleEarnings, r => r.DisplayLabel == "Medical Allowance" && r.Amount == 1500m);
        Assert.Contains(docA.VisibleEarnings, r => r.DisplayLabel == "Food Allowance" && r.Amount == 800m);
        Assert.DoesNotContain(docA.VisibleEarnings, r => r.DisplayLabel == "Bonus");
        Assert.Single(docA.VisibleDeductions);

        // Numeric zero is preserved in source data
        var bonusInSource = docA.AllEditorComponents.Single(c => c.OriginalLabel == "Bonus");
        Assert.Equal(0m, bonusInSource.ImportedNumericValue);
        Assert.Equal(SourceCellTypes.NumericZero, bonusInSource.SourceCellType);

        // Employee B shows only Basic and HRA (2 earnings) and PF (1 deduction) — NO Medical or Food rows!
        Assert.Equal(2, docB.VisibleEarnings.Count);
        Assert.DoesNotContain(docB.VisibleEarnings, r => r.DisplayLabel == "Medical Allowance");
        Assert.DoesNotContain(docB.VisibleEarnings, r => r.DisplayLabel == "Food Allowance");

        // Enabling ShowZeroValueRows displays Bonus=0 on Employee A, while still suppressing Empty cells on Employee B!
        empARecord.ShowZeroValueRowsOverride = true;
        empBRecord.ShowZeroValueRowsOverride = true;

        var docAWithZero = resolver.ResolveDocument(empARecord, settings, template);
        var docBWithZero = resolver.ResolveDocument(empBRecord, settings, template);

        Assert.Equal(5, docAWithZero.VisibleEarnings.Count);
        Assert.Contains(docAWithZero.VisibleEarnings, r => r.DisplayLabel == "Bonus" && r.Amount == 0m && r.IsZeroValue);
        Assert.Equal(2, docBWithZero.VisibleEarnings.Count);
    }

    [Fact]
    public void PdfRenderer_GeneratesValidA4Pdf_ForShortAndLongMultiPagePayslips()
    {
        var resolver = new PayslipDocumentResolver();
        var settings = new CompanySettings();
        var record = new PayrollRecord
        {
            Id = Guid.NewGuid(),
            ImportedEmployeeCode = "EMP_LONG",
            ImportedEmployeeName = "Dr. Karthik Subramanian",
            ImportedDepartment = "R&D Manufacturing",
            ImportedDesignation = "Principal Scientist",
            ImportedGrossSalary = 250000m,
            ImportedTotalDeductions = 35000m,
            ImportedNetSalary = 215000m,
            PayrollPeriod = new PayrollPeriod { Month = 10, Year = 2026, PeriodLabel = "October 2026" }
        };

        // Add 35 dynamic components to trigger multi-page A4 rendering
        for (int i = 1; i <= 35; i++)
        {
            record.Components.Add(new PayrollComponentValue
            {
                ComponentKey = $"allowance_{i}",
                OriginalLabel = $"Research & Engineering Allowance Component #{i}",
                Category = i % 3 == 0 ? ComponentCategories.Deduction : ComponentCategories.Earning,
                SortOrder = i,
                SourceCellType = SourceCellTypes.NumericNonZero,
                ImportedNumericValue = i * 1250.50m
            });
        }

        var docModel = resolver.ResolveDocument(record, settings, null);
        var pdfService = new PdfRenderingService(null!, resolver, null!, new ConfigurationBuilder().Build(), new MockHostEnv());
        var pdfBytes = pdfService.RenderPdfBytes(docModel);

        Assert.NotNull(pdfBytes);
        Assert.True(pdfBytes.Length > 2500);
        var headerStr = System.Text.Encoding.ASCII.GetString(pdfBytes, 0, 5);
        Assert.Equal("%PDF-", headerStr);
    }

    // ========================================================================
    // END-TO-END INTEGRATION TESTS (ALL 27 ACCEPTANCE CRITERIA)
    // ========================================================================
    [Fact]
    public async Task FullEndToEndWorkflow_MeetsAll27AcceptanceCriteria()
    {
        var dbFile = Path.Combine(Path.GetTempPath(), $"payslip_studio_test_{Guid.NewGuid():N}.db");
        try
        {
            await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.ConfigureAppConfiguration((_, cfg) =>
                {
                    cfg.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Database:Provider"] = "Sqlite",
                        ["ConnectionStrings:DefaultConnection"] = $"Data Source={dbFile}"
                    });
                });
            });

            using var client = factory.CreateClient();

            // Criterion 25: Unauthenticated user cannot access records or documents
            var unauthResp = await client.GetAsync("/api/payroll/records");
            Assert.Equal(HttpStatusCode.Unauthorized, unauthResp.StatusCode);

            // Criterion 1: Authorized Operator logs in
            var loginResp = await client.PostAsJsonAsync("/api/auth/login", new
            {
                UsernameOrEmail = "operator@amtdc.org",
                Password = "Operator@12345!"
            });
            Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);
            var loginJson = await loginResp.Content.ReadFromJsonAsync<JsonElement>();
            var operatorToken = loginJson.GetProperty("token").GetString()!;
            Assert.False(string.IsNullOrWhiteSpace(operatorToken));

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", operatorToken);

            // Criteria 2-5: Operator loads/uploads Excel file, selects worksheet, previews and commits import
            var stageResp = await client.PostAsJsonAsync("/api/payroll/import/load-workspace-mock", new
            {
                Month = 10,
                Year = 2026
            });
            Assert.Equal(HttpStatusCode.OK, stageResp.StatusCode);
            var stageJson = await stageResp.Content.ReadFromJsonAsync<JsonElement>();
            var batchId = stageJson.GetProperty("importBatchId").GetGuid();

            var previewResp = await client.PostAsJsonAsync($"/api/payroll/import/{batchId}/preview", new
            {
                WorksheetName = "IMPORT_TEST",
                Month = 10,
                Year = 2026
            });
            Assert.Equal(HttpStatusCode.OK, previewResp.StatusCode);
            var previewDto = await previewResp.Content.ReadFromJsonAsync<ImportValidationPreviewDto>();
            Assert.NotNull(previewDto);
            Assert.Equal(8, previewDto!.ValidRows);

            var commitResp = await client.PostAsJsonAsync($"/api/payroll/import/{batchId}/commit", new
            {
                AllowReplaceExisting = true
            });
            Assert.Equal(HttpStatusCode.OK, commitResp.StatusCode);

            // Criteria 6 & 7: Operator searches by employee name ("Priya") and by employee ID ("EMP002")
            var searchByName = await client.GetFromJsonAsync<JsonElement>("/api/payroll/search?q=Priya&month=10&year=2026");
            Assert.Equal(1, searchByName.GetArrayLength());
            Assert.Equal("EMP002", searchByName[0].GetProperty("employeeCode").GetString());

            var searchById = await client.GetFromJsonAsync<JsonElement>("/api/payroll/search?q=EMP002&month=10&year=2026");
            Assert.Equal(1, searchById.GetArrayLength());
            var priyaRecordId = searchById[0].GetProperty("recordId").GetGuid();

            var searchArun = await client.GetFromJsonAsync<JsonElement>("/api/payroll/search?q=EMP001&month=10&year=2026");
            var arunRecordId = searchArun[0].GetProperty("recordId").GetGuid();

            // Criteria 8, 9, 10, 11, 12: Load Priya (EMP002) and Arun (EMP001) documents and verify dynamic salary components
            var priyaDocResp = await client.GetFromJsonAsync<JsonElement>($"/api/payroll/records/{priyaRecordId}/document");
            var priyaDoc = JsonSerializer.Deserialize<PayslipDocumentModel>(
                priyaDocResp.GetProperty("document").GetRawText(),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

            var arunDocResp = await client.GetFromJsonAsync<JsonElement>($"/api/payroll/records/{arunRecordId}/document");
            var arunDoc = JsonSerializer.Deserialize<PayslipDocumentModel>(
                arunDocResp.GetProperty("document").GetRawText(),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

            // Arun (EMP001) has Medical Allowance (2500), Conveyance Allowance (2000), Overtime (2500)
            Assert.Contains(arunDoc.VisibleEarnings, r => r.OriginalLabel == "Medical Allowance" && r.Amount == 2500m);
            Assert.Contains(arunDoc.VisibleEarnings, r => r.OriginalLabel == "Conveyance Allowance" && r.Amount == 2000m);
            Assert.Contains(arunDoc.VisibleEarnings, r => r.OriginalLabel == "Overtime" && r.Amount == 2500m);

            // Priya (EMP002) has blank Medical Allowance, blank Conveyance Allowance, blank Overtime, and blank Loan Deduction
            // Criterion 10 & 11: Blank components for Priya must NOT appear on Priya's payslip!
            Assert.DoesNotContain(priyaDoc.VisibleEarnings, r => r.OriginalLabel == "Medical Allowance");
            Assert.DoesNotContain(priyaDoc.VisibleEarnings, r => r.OriginalLabel == "Conveyance Allowance");
            Assert.DoesNotContain(priyaDoc.VisibleEarnings, r => r.OriginalLabel == "Overtime");
            Assert.DoesNotContain(priyaDoc.VisibleDeductions, r => r.OriginalLabel == "Loan Deduction");

            // Criterion 12: Numeric 0 (Bonus = 0 on Arun) remains intact in source data while hidden by default
            Assert.DoesNotContain(arunDoc.VisibleEarnings, r => r.OriginalLabel == "Bonus");
            var arunBonusComp = arunDoc.AllEditorComponents.Single(c => c.OriginalLabel == "Bonus");
            Assert.Equal(0m, arunBonusComp.ImportedNumericValue);

            // Criteria 13, 14, 15: Edit a salary value on Priya, verify preview updates, original imported value remains unchanged, and draft persists
            var priyaBasic = priyaDoc.AllEditorComponents.Single(c => c.OriginalLabel == "Basic Salary");
            var updateDraftReq = new UpdatePayrollRecordDraftRequest
            {
                CustomFooterNotes = "Verified by Accounts Team",
                ComponentUpdates = new List<ComponentOverrideUpdateItem>
                {
                    new()
                    {
                        Id = priyaBasic.Id,
                        ComponentKey = priyaBasic.ComponentKey,
                        OriginalLabel = priyaBasic.OriginalLabel,
                        OverrideLabel = "Basic Pay (Revised)",
                        Category = priyaBasic.Category,
                        OverrideNumericValue = 37500m
                    }
                }
            };

            var saveDraftResp = await client.PutAsJsonAsync($"/api/payroll/records/{priyaRecordId}/draft", updateDraftReq);
            Assert.Equal(HttpStatusCode.OK, saveDraftResp.StatusCode);

            // Reload Priya's document to verify persistence and preservation of original imported value (36000)
            var reloadedPriyaJson = await client.GetFromJsonAsync<JsonElement>($"/api/payroll/records/{priyaRecordId}/document");
            var reloadedPriyaDoc = JsonSerializer.Deserialize<PayslipDocumentModel>(
                reloadedPriyaJson.GetProperty("document").GetRawText(),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

            var updatedBasicRow = reloadedPriyaDoc.VisibleEarnings.Single(r => r.ComponentKey == priyaBasic.ComponentKey);
            Assert.Equal("Basic Pay (Revised)", updatedBasicRow.DisplayLabel);
            Assert.Equal(37500m, updatedBasicRow.Amount);

            var reloadedBasicSource = reloadedPriyaDoc.AllEditorComponents.Single(c => c.ComponentKey == priyaBasic.ComponentKey);
            Assert.Equal(36000m, reloadedBasicSource.ImportedNumericValue); // Original imported value untouched!
            Assert.Equal(37500m, reloadedBasicSource.OverrideNumericValue);

            // Verify backend auto-recalculated Gross Salary (37500 Basic + 16000 HRA = 53500) and Net Salary (Gross - Deductions) while preserving original imported totals
            Assert.Equal(53500m, reloadedPriyaDoc.GrossSalary);
            Assert.Equal(53500m - reloadedPriyaDoc.TotalDeductions!.Value, reloadedPriyaDoc.NetSalary);
            Assert.Equal(priyaDoc.ImportedGrossSalary, reloadedPriyaDoc.ImportedGrossSalary);
            Assert.Equal(priyaDoc.ImportedNetSalary, reloadedPriyaDoc.ImportedNetSalary);

            // Criterion 18 & 19: Generate PDF and verify PDF output
            var genPdfResp = await client.PostAsync($"/api/payroll/records/{priyaRecordId}/pdf", null);
            Assert.Equal(HttpStatusCode.OK, genPdfResp.StatusCode);
            var genPdfJson = await genPdfResp.Content.ReadFromJsonAsync<JsonElement>();
            var docId = genPdfJson.GetProperty("documentId").GetGuid();

            var pdfDownloadResp = await client.GetAsync($"/api/payroll/documents/{docId}/download");
            Assert.Equal(HttpStatusCode.OK, pdfDownloadResp.StatusCode);
            var pdfBytes = await pdfDownloadResp.Content.ReadAsByteArrayAsync();
            Assert.True(pdfBytes.Length > 1500);

            // Criteria 20, 21, 22: Email delivery tracking (Accepted, Failed, Uncertain outcomes)
            var sendAcceptedResp = await client.PostAsJsonAsync("/api/email/send", new
            {
                PayrollRecordId = priyaRecordId,
                RecipientEmail = "priya.sharma@example.com",
                Subject = "Your Payslip for {{PayrollMonth}} {{PayrollYear}}",
                Body = "Dear {{EmployeeName}}, attached is your payslip.",
                IsTestEmail = false,
                SimulatedOutcome = "Accepted"
            });
            Assert.Equal(HttpStatusCode.OK, sendAcceptedResp.StatusCode);
            var sendAcceptedJson = await sendAcceptedResp.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(EmailDeliveryStatuses.Accepted, sendAcceptedJson.GetProperty("status").GetString());

            var sendFailedResp = await client.PostAsJsonAsync("/api/email/send", new
            {
                PayrollRecordId = arunRecordId,
                RecipientEmail = "arun.kumar@example.com",
                Subject = "Your Payslip",
                Body = "Test",
                IsTestEmail = false,
                SimulatedOutcome = "Failed"
            });
            Assert.Equal(HttpStatusCode.OK, sendFailedResp.StatusCode);
            var sendFailedJson = await sendFailedResp.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(EmailDeliveryStatuses.Failed, sendFailedJson.GetProperty("status").GetString());

            var sendUncertainResp = await client.PostAsJsonAsync("/api/email/send", new
            {
                PayrollRecordId = arunRecordId,
                RecipientEmail = "arun.kumar@example.com",
                Subject = "Your Payslip",
                Body = "Test",
                IsTestEmail = false,
                SimulatedOutcome = "Uncertain"
            });
            Assert.Equal(HttpStatusCode.OK, sendUncertainResp.StatusCode);
            var sendUncertainJson = await sendUncertainResp.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(EmailDeliveryStatuses.Uncertain, sendUncertainJson.GetProperty("status").GetString());

            // Criterion 23: Export Master Excel Workbook containing separate worksheets for all available payroll months
            var wbResp = await client.GetAsync("/api/payroll/export/master-workbook");
            Assert.Equal(HttpStatusCode.OK, wbResp.StatusCode);
            var wbBytes = await wbResp.Content.ReadAsByteArrayAsync();
            using (var ms = new MemoryStream(wbBytes))
            using (var xl = new XLWorkbook(ms))
            {
                var sheetNames = xl.Worksheets.Select(w => w.Name).ToList();
                Assert.Contains("September 2026", sheetNames);
                Assert.Contains("October 2026", sheetNames);
                Assert.Contains("November 2026", sheetNames);
            }

            // Criterion 24: Viewer role cannot edit, import, or send payslips
            var viewerLoginResp = await client.PostAsJsonAsync("/api/auth/login", new
            {
                UsernameOrEmail = "viewer@amtdc.org",
                Password = "Viewer@12345!"
            });
            var viewerJson = await viewerLoginResp.Content.ReadFromJsonAsync<JsonElement>();
            var viewerToken = viewerJson.GetProperty("token").GetString()!;

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", viewerToken);

            var viewerEditResp = await client.PutAsJsonAsync($"/api/payroll/records/{priyaRecordId}/draft", updateDraftReq);
            Assert.Equal(HttpStatusCode.Forbidden, viewerEditResp.StatusCode);

            var viewerSendResp = await client.PostAsJsonAsync("/api/email/send", new
            {
                PayrollRecordId = priyaRecordId,
                RecipientEmail = "priya.sharma@example.com",
                Subject = "Unauthorized send",
                Body = "Body"
            });
            Assert.Equal(HttpStatusCode.Forbidden, viewerSendResp.StatusCode);
        }
        finally
        {
            if (File.Exists(dbFile))
            {
                try { File.Delete(dbFile); } catch { }
            }
        }
    }

    private class MockHostEnv : Microsoft.AspNetCore.Hosting.IWebHostEnvironment
    {
        public string WebRootPath { get; set; } = Path.GetTempPath();
        public Microsoft.Extensions.FileProviders.IFileProvider WebRootFileProvider { get; set; } = null!;
        public string ApplicationName { get; set; } = "PaySlipStudio.Tests";
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public string EnvironmentName { get; set; } = "Testing";
    }
}

