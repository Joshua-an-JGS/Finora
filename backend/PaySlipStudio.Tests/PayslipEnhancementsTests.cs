using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;
using PaySlipStudio.Api.Services;

namespace PaySlipStudio.Tests;

public class PayslipEnhancementsTests
{
    // ========================================================================
    // 1. DYNAMIC EMAIL GENERATION & PLACEHOLDER REPLACEMENT TESTS
    // ========================================================================
    [Fact]
    public void DynamicEmail_ResolvesAllPlaceholders_FromDocumentModel()
    {
        var docModel = new PayslipDocumentModel
        {
            PayrollRecordId = Guid.NewGuid(),
            EmployeeCode = "EMP001",
            EmployeeName = "Arun Kumar",
            PayrollMonth = 11,
            PayrollYear = 2026,
            PeriodLabel = "November 2026",
            CompanyName = "Elkanah Equipments and Automation",
            NetSalary = 60000m,
            CurrencySymbol = "₹"
        };

        // Subject Template: Your Payslip for {{PayrollMonth}} {{PayrollYear}} — {{EmployeeName}} ({{EmployeeID}})
        string subjectTemplate = "Your Payslip for {{PayrollMonth}} {{PayrollYear}} — {{EmployeeName}} ({{EmployeeID}})";
        
        // Body Template:
        string bodyTemplate = 
            "Dear {{EmployeeName}},\n\n" +
            "Please find attached your payslip for {{PayrollMonth}} {{PayrollYear}}.\n\n" +
            "Please review the document and contact the Accounts Department if you have any questions regarding your salary details.\n\n" +
            "Regards,\n" +
            "Accounts Department\n" +
            "{{CompanyName}}";

        var (resolvedSubject, resolvedBody) = EmailDeliveryService.ResolvePlaceholders(
            subjectTemplate,
            bodyTemplate,
            docModel
        );

        Assert.Equal("Your Payslip for November 2026 — Arun Kumar (EMP001)", resolvedSubject);
        Assert.Contains("Dear Arun Kumar,", resolvedBody);
        Assert.Contains("payslip for November 2026.", resolvedBody);
        Assert.Contains("Accounts Department\nElkanah Equipments and Automation", resolvedBody);
        Assert.DoesNotContain("{{", resolvedSubject);
        Assert.DoesNotContain("}}", resolvedSubject);
        Assert.DoesNotContain("{{", resolvedBody);
        Assert.DoesNotContain("}}", resolvedBody);
    }

    // ========================================================================
    // 2. EMAIL VALIDATION TESTS
    // ========================================================================
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-an-email")]
    [InlineData("two@test.com, three@test.com")]
    [InlineData("two@test.com; three@test.com")]
    public async Task EmailDeliveryService_RejectsInvalidRecipientEmail(string invalidEmail)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        using var db = new ApplicationDbContext(options);

        var deliveryService = new EmailDeliveryService(
            db,
            null!,
            null!,
            null!,
            new ConfigurationBuilder().Build(),
            new MockHostEnv());

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            deliveryService.SendIndividualPayslipEmailAsync(
                Guid.NewGuid(),
                invalidEmail,
                "Subject",
                "Body",
                false,
                null,
                null,
                "user1",
                "Admin",
                "Administrator"
            ));

        Assert.True(
            ex.Message.Contains("recipient", StringComparison.OrdinalIgnoreCase) ||
            ex.Message.Contains("recipients", StringComparison.OrdinalIgnoreCase)
        );
    }

    [Theory]
    [InlineData("", "Valid Body")]
    [InlineData("   ", "Valid Body")]
    [InlineData("Valid Subject", "")]
    [InlineData("Valid Subject", "   ")]
    public async Task EmailDeliveryService_RejectsEmptySubjectOrBody(string subject, string body)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        using var db = new ApplicationDbContext(options);

        var deliveryService = new EmailDeliveryService(
            db,
            null!,
            null!,
            null!,
            new ConfigurationBuilder().Build(),
            new MockHostEnv());

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            deliveryService.SendIndividualPayslipEmailAsync(
                Guid.NewGuid(),
                "test@example.com",
                subject,
                body,
                false,
                null,
                null,
                "user1",
                "Admin",
                "Administrator"
            ));

        Assert.True(
            ex.Message.Contains("subject", StringComparison.OrdinalIgnoreCase) ||
            ex.Message.Contains("body", StringComparison.OrdinalIgnoreCase)
        );
    }

    // ========================================================================
    // 3. PAYSLIP TEMPLATE CONFIG PERSISTENCE & BACKWARD COMPATIBILITY
    // ========================================================================
    [Fact]
    public void PayslipTemplateConfig_SerializesAndDeserializes_WithSensibleDefaults()
    {
        // 1. Old JSON without new properties
        string oldJson = "{\"Name\":\"Classic Clean\",\"ShowZeroValueRows\":false}";
        var deserializedOld = JsonSerializer.Deserialize<PayslipTemplateConfig>(oldJson);

        Assert.NotNull(deserializedOld);
        Assert.Equal("Left", deserializedOld.PayslipTitleAlignment);
        Assert.True(deserializedOld.ShowEmployeeDetailsHeading);
        Assert.Equal("EMPLOYEE DETAILS", deserializedOld.EmployeeDetailsSectionHeading);
        Assert.Equal("Left", deserializedOld.EmployeeDetailsHeadingAlignment);

        // 2. Full new configuration roundtrip
        var newConfig = new PayslipTemplateConfig
        {
            PayslipTitleAlignment = "Center",
            TitleBannerFontSizePt = 14f,
            TitleBannerFontWeight = "800",
            TitleBannerTopSpacingPx = 4,
            TitleBannerBottomSpacingPx = 12,
            ShowTitleBannerDivider = true,
            TitleBannerDividerThicknessPt = 1.5f,
            TitleBannerDividerColor = "#F47721",
            ShowEmployeeDetailsHeading = true,
            EmployeeDetailsSectionHeading = "EMPLOYEE PROFILE & SALARY DETAILS",
            EmployeeDetailsHeadingAlignment = "Center",
            EmployeeDetailsHeadingFontSizePt = 11f,
            EmployeeDetailsHeadingFontWeight = "700",
            EmployeeDetailsHeadingTextColor = "#071747",
            EmployeeDetailsHeadingBgColor = "#FFF4E8",
            EmployeeDetailsHeadingTopSpacingPx = 6,
            EmployeeDetailsHeadingBottomSpacingPx = 8,
            ShowEmployeeDetailsHeadingBorder = true,
            EmployeeDetailsHeadingBorderColor = "#F47721",
            EmployeeDetailsHeadingBorderThicknessPt = 1f,
            EmployeeDetailsSectionPaddingPx = 8
        };

        string json = JsonSerializer.Serialize(newConfig);
        var roundtripped = JsonSerializer.Deserialize<PayslipTemplateConfig>(json);

        Assert.NotNull(roundtripped);
        Assert.Equal("Center", roundtripped.PayslipTitleAlignment);
        Assert.Equal(14f, roundtripped.TitleBannerFontSizePt);
        Assert.Equal("EMPLOYEE PROFILE & SALARY DETAILS", roundtripped.EmployeeDetailsSectionHeading);
        Assert.Equal("Center", roundtripped.EmployeeDetailsHeadingAlignment);
        Assert.Equal("#FFF4E8", roundtripped.EmployeeDetailsHeadingBgColor);
        Assert.Equal("#F47721", roundtripped.EmployeeDetailsHeadingBorderColor);
    }

    // ========================================================================
    // 4. PDF RENDERING SERVICE: HEADING ALIGNMENTS & EMPLOYEE DETAILS SECTION
    // ========================================================================
    [Theory]
    [InlineData("Left", true)]
    [InlineData("Center", true)]
    [InlineData("Right", true)]
    [InlineData("Center", false)]
    public void PdfRenderingService_RendersWithoutErrors_ForDifferentHeadingAlignmentsAndToggles(string alignment, bool showEmpDetailsHeading)
    {
        var resolver = new PayslipDocumentResolver();
        var settings = new CompanySettings
        {
            CompanyName = "FINORA Tech Ltd",
            ShowZeroValueComponentsByDefault = false
        };

        var config = new PayslipTemplateConfig
        {
            PayslipTitleAlignment = alignment,
            ShowEmployeeDetailsHeading = showEmpDetailsHeading,
            EmployeeDetailsSectionHeading = "EMPLOYEE DETAILS",
            EmployeeDetailsHeadingAlignment = alignment,
            EmployeeDetailsHeadingBgColor = "#F9FAFB",
            ShowEmployeeDetailsHeadingBorder = true
        };

        var template = new PayslipTemplate
        {
            Name = "Alignment Test Template",
            ConfigJson = JsonSerializer.Serialize(config)
        };

        var record = new PayrollRecord
        {
            Id = Guid.NewGuid(),
            ImportedEmployeeCode = "EMP001",
            ImportedEmployeeName = "Arun Kumar",
            ImportedDepartment = "Engineering",
            ImportedDesignation = "Senior Systems Engineer",
            ImportedGrossSalary = 65000m,
            ImportedTotalDeductions = 5000m,
            ImportedNetSalary = 60000m,
            PayrollPeriod = new PayrollPeriod
            {
                Month = 11,
                Year = 2026,
                PeriodLabel = "November 2026"
            },
            Components = new List<PayrollComponentValue>
            {
                new() { ComponentKey = "basic", OriginalLabel = "Basic Pay", Category = ComponentCategories.Earning, SortOrder = 1, SourceCellType = SourceCellTypes.NumericNonZero, ImportedNumericValue = 40000m },
                new() { ComponentKey = "hra", OriginalLabel = "HRA", Category = ComponentCategories.Allowance, SortOrder = 2, SourceCellType = SourceCellTypes.NumericNonZero, ImportedNumericValue = 25000m },
                new() { ComponentKey = "pf", OriginalLabel = "PF", Category = ComponentCategories.Deduction, SortOrder = 3, SourceCellType = SourceCellTypes.NumericNonZero, ImportedNumericValue = 5000m }
            }
        };

        var docModel = resolver.ResolveDocument(record, settings, template);
        var pdfService = new PdfRenderingService(null!, resolver, null!, new ConfigurationBuilder().Build(), new MockHostEnv());

        var pdfBytes = pdfService.RenderPdfBytes(docModel);

        Assert.NotNull(pdfBytes);
        Assert.True(pdfBytes.Length > 2000);
        string header = System.Text.Encoding.ASCII.GetString(pdfBytes, 0, 5);
        Assert.Equal("%PDF-", header);
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
