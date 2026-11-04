using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PaySlipStudio.Api.Models;
using PaySlipStudio.Api.Services;

namespace PaySlipStudio.Api.Data;

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var excelService = scope.ServiceProvider.GetRequiredService<ExcelPayrollService>();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var env = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();

        await db.Database.EnsureCreatedAsync();

        if (db.Database.IsNpgsql())
        {
            await db.Database.ExecuteSqlRawAsync(@"
                ALTER TABLE ""PayrollRecords"" ADD COLUMN IF NOT EXISTS ""OverrideEmployeeCode"" character varying(64);
                ALTER TABLE ""EmailDeliveryAttempts"" ALTER COLUMN ""IdempotencyKey"" TYPE character varying(512);
                ALTER TABLE ""EmailDeliveryAttempts"" ALTER COLUMN ""Subject"" TYPE character varying(512);
                ALTER TABLE ""EmailDeliveryAttempts"" ALTER COLUMN ""ProviderMessageId"" TYPE character varying(512);
                ALTER TABLE ""AuditLogEntries"" ALTER COLUMN ""Summary"" TYPE character varying(2000);
            ");
        }

        // 1. Seed Roles
        foreach (var role in AppRoles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole(role));
            }
        }

        // 2. Seed Users (Administrator, AccountsOperator, Viewer)
        await EnsureUserAsync(
            userManager,
            email: config["BootstrapAdmin:Email"] ?? "admin@amtdc.org",
            userName: config["BootstrapAdmin:Username"] ?? "admin",
            password: config["BootstrapAdmin:InitialPassword"] ?? "Admin@12345!",
            fullName: "System Administrator",
            department: "IT & Governance",
            role: AppRoles.Administrator,
            mfaRequired: false);

        await EnsureUserAsync(
            userManager,
            email: "operator@amtdc.org",
            userName: "operator",
            password: "Operator@12345!",
            fullName: "Priya Nair (Accounts Operator)",
            department: "Accounts & Finance",
            role: AppRoles.AccountsOperator,
            mfaRequired: false);

        await EnsureUserAsync(
            userManager,
            email: "viewer@amtdc.org",
            userName: "viewer",
            password: "Viewer@12345!",
            fullName: "Rajesh Verma (Audit Viewer)",
            department: "Internal Audit",
            role: AppRoles.Viewer,
            mfaRequired: false);

        // 3. Seed CompanySettings
        if (!await db.CompanySettings.AnyAsync())
        {
            db.CompanySettings.Add(new CompanySettings
            {
                Id = 1,
                CompanyName = "Advanced Manufacturing Technology Development Centre (AMTDC)",
                Subtitle = "Centre of Excellence in Advanced Manufacturing Technology",
                RegisteredAddress = "IIT Madras Research Park, Kanagam Road, Taramani, Chennai — 600113",
                ContactEmail = "accounts@amtdc.org",
                ContactPhone = "+91 (044) 2257-0000",
                WebsiteUrl = "https://amtdc.org/",
                AuthorizedIdentifiers = "Institutional Payroll Division",
                SignatoryName = "Authorized Signatory",
                SignatoryDesignation = "Head — Accounts & Finance",
                CurrencySymbol = "₹",
                CurrencyCode = "INR",
                ShowZeroValueComponentsByDefault = false,
                ShowAmountInWordsByDefault = true,
                ActivePayrollMonth = 10,
                ActivePayrollYear = 2026,
                EmailProviderMode = "Sandbox",
                SmtpFromEmail = "accounts@amtdc.org",
                SmtpFromName = "AMTDC Accounts Department",
                UpdatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        // 4. Seed Default Payslip Templates
        if (!await db.PayslipTemplates.AnyAsync())
        {
            var defaultConfig = new PayslipTemplateConfig
            {
                PrimaryAccentColor = "#F47721",
                HeadingNavyColor = "#071747",
                DocumentBackgroundColor = "#FFFFFF",
                SubtleAccentSurfaceColor = "#FFF4E8",
                BorderColor = "#E5E7EB",
                PrimaryTextColor = "#111827",
                SecondaryTextColor = "#6B7280",
                TableLayoutMode = "SideBySide",
                ShowZeroValueRows = false,
                ShowAmountInWords = true,
                HighlightNetSalaryBox = true,
                FontFamily = "Figtree",
                BaseFontSizePt = 10,
                RowVerticalPaddingPx = 7
            };
            var defaultJson = JsonSerializer.Serialize(defaultConfig);

            var stackedConfig = new PayslipTemplateConfig
            {
                PrimaryAccentColor = "#F47721",
                HeadingNavyColor = "#071747",
                DocumentBackgroundColor = "#FFFFFF",
                SubtleAccentSurfaceColor = "#FFF4E8",
                BorderColor = "#E5E7EB",
                TableLayoutMode = "Stacked",
                HeaderAlignment = "Center",
                EmployeeDetailsColumns = 3,
                ShowZeroValueRows = false,
                ShowAmountInWords = true,
                HighlightNetSalaryBox = true,
                FontFamily = "Figtree",
                BaseFontSizePt = 10,
                RowVerticalPaddingPx = 8
            };
            var stackedJson = JsonSerializer.Serialize(stackedConfig);

            var auditConfig = new PayslipTemplateConfig
            {
                PrimaryAccentColor = "#F47721",
                HeadingNavyColor = "#071747",
                DocumentBackgroundColor = "#FFFFFF",
                SubtleAccentSurfaceColor = "#FFF4E8",
                BorderColor = "#D1D5DB",
                TableLayoutMode = "SideBySide",
                ShowZeroValueRows = true,
                ShowAmountInWords = true,
                ShowLeftSignature = true,
                HighlightNetSalaryBox = true,
                FontFamily = "Figtree",
                BaseFontSizePt = 9,
                RowVerticalPaddingPx = 6
            };
            var auditJson = JsonSerializer.Serialize(auditConfig);

            db.PayslipTemplates.AddRange(
                new PayslipTemplate
                {
                    Name = "AMTDC Institutional Standard",
                    Description = "Official institutional two-column A4 payslip with AMTDC orange (#F47721) accents, deep navy (#071747) typography, and dynamic zero-row suppression.",
                    IsDefault = true,
                    IsSystemBuiltin = true,
                    Version = 1,
                    ConfigJson = defaultJson,
                    InitialConfigJson = defaultJson
                },
                new PayslipTemplate
                {
                    Name = "Executive Stacked Single-Column",
                    Description = "Full-width stacked Earnings and Deductions tables with 3-column employee metadata header, ideal for employees with many allowances.",
                    IsDefault = false,
                    IsSystemBuiltin = true,
                    Version = 1,
                    ConfigJson = stackedJson,
                    InitialConfigJson = stackedJson
                },
                new PayslipTemplate
                {
                    Name = "Comprehensive Audit View (Includes Zero Rows)",
                    Description = "Detailed verification layout configured to explicitly show numeric zero (0.00) components while still suppressing blank/unpopulated cells.",
                    IsDefault = false,
                    IsSystemBuiltin = false,
                    Version = 1,
                    ConfigJson = auditJson,
                    InitialConfigJson = auditJson
                }
            );
            await db.SaveChangesAsync();
        }

        // 5. Seed Default Email Templates
        if (!await db.EmailTemplates.AnyAsync())
        {
            db.EmailTemplates.AddRange(
                new EmailTemplate
                {
                    Name = "Standard Monthly Payslip Dispatch",
                    SubjectTemplate = "Your Payslip for {{PayrollMonth}} {{PayrollYear}}",
                    BodyTemplate =
@"Dear {{EmployeeName}},

Please find attached your payslip for {{PayrollMonth}} {{PayrollYear}}.

Please review the document and contact the Accounts Department if you have any questions regarding the details.

Regards,
Accounts Department
{{CompanyName}}",
                    IsDefault = true
                },
                new EmailTemplate
                {
                    Name = "Detailed Payslip Summary Notice",
                    SubjectTemplate = "Confidential: Salary Statement for {{PayrollMonth}} {{PayrollYear}} ({{EmployeeId}})",
                    BodyTemplate =
@"Dear {{EmployeeName}} ({{EmployeeId}}),

Your official salary statement for the period {{PayrollMonth}} {{PayrollYear}} has been processed, with a Net Payable amount of {{NetSalary}}.

Please find your password-free A4 PDF payslip attached for your records. If you notice any discrepancy, please reach out to the Accounts Department within 5 working days.

Warm regards,
Accounts & Finance Department
{{CompanyName}}",
                    IsDefault = false
                }
            );
            await db.SaveChangesAsync();
        }

        // 6. Auto-Import Mock Excel File on First Boot if Database Has No Payroll Records
        if (!await db.PayrollRecords.AnyAsync())
        {
            var baseDataDir = config["FINORA_BASE_DATA_DIR"]
                ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FINORA");

            var candidatePaths = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "PaySlip_Studio_Mock_Payroll_Test_Data.xlsx"),
                Path.Combine(AppContext.BaseDirectory, "Resources", "PaySlip_Studio_Mock_Payroll_Test_Data.xlsx"),
                Path.Combine(baseDataDir, "Imports", "PaySlip_Studio_Mock_Payroll_Test_Data.xlsx"),
                Path.Combine(env.ContentRootPath, "..", "..", "PaySlip_Studio_Mock_Payroll_Test_Data.xlsx"),
                Path.Combine(env.ContentRootPath, "PaySlip_Studio_Mock_Payroll_Test_Data.xlsx"),
                @"G:\UAV\PAY SLIP\PaySlip_Studio_Mock_Payroll_Test_Data.xlsx"
            };

            var mockFilePath = candidatePaths.FirstOrDefault(File.Exists);
            if (mockFilePath != null)
            {
                var adminUser = await userManager.FindByNameAsync("admin");
                string uid = adminUser?.Id ?? "system";
                string uname = adminUser?.UserName ?? "admin";

                var sheetsToSeed = new (string SheetName, int Month, int Year)[]
                {
                    ("September 2026", 9, 2026),
                    ("October 2026", 10, 2026),
                    ("November 2026", 11, 2026)
                };

                foreach (var (sheetName, month, year) in sheetsToSeed)
                {
                    await using var fs = new FileStream(mockFilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                    var stage = await excelService.StageUploadAsync(
                        fs,
                        "PaySlip_Studio_Mock_Payroll_Test_Data.xlsx",
                        month,
                        year,
                        uid,
                        uname);

                    await excelService.AnalyzeAndPreviewAsync(stage.ImportBatchId, sheetName, month, year);
                    await excelService.CommitImportBatchAsync(stage.ImportBatchId, true, uid, uname, AppRoles.Administrator);
                }

                // Set active month to October 2026 by default
                var settings = await db.CompanySettings.FirstOrDefaultAsync();
                if (settings != null)
                {
                    settings.ActivePayrollMonth = 10;
                    settings.ActivePayrollYear = 2026;
                    await db.SaveChangesAsync();
                }
            }
        }
    }

    private static async Task EnsureUserAsync(
        UserManager<ApplicationUser> userManager,
        string email,
        string userName,
        string password,
        string fullName,
        string department,
        string role,
        bool mfaRequired)
    {
        var user = await userManager.FindByEmailAsync(email) ?? await userManager.FindByNameAsync(userName);
        if (user == null)
        {
            user = new ApplicationUser
            {
                UserName = userName,
                Email = email,
                EmailConfirmed = true,
                FullName = fullName,
                Department = department,
                RoleName = role,
                IsActive = true,
                MfaRequired = mfaRequired,
                CreatedAtUtc = DateTime.UtcNow
            };
            var res = await userManager.CreateAsync(user, password);
            if (res.Succeeded)
            {
                await userManager.AddToRoleAsync(user, role);
            }
        }
        else if (!await userManager.IsInRoleAsync(user, role))
        {
            await userManager.AddToRoleAsync(user, role);
        }
    }
}

