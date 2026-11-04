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
                ALTER TABLE ""CompanySettings"" ADD COLUMN IF NOT EXISTS ""AutoCheckUpdates"" boolean DEFAULT true;
                ALTER TABLE ""CompanySettings"" ADD COLUMN IF NOT EXISTS ""AutoDownloadUpdates"" boolean DEFAULT false;
                ALTER TABLE ""CompanySettings"" ADD COLUMN IF NOT EXISTS ""NotifyBeforeInstall"" boolean DEFAULT true;
                ALTER TABLE ""CompanySettings"" ADD COLUMN IF NOT EXISTS ""UpdateChannel"" character varying(50) DEFAULT 'Stable';
                ALTER TABLE ""CompanySettings"" ADD COLUMN IF NOT EXISTS ""UpdateServerUrl"" character varying(300) DEFAULT 'https://github.com/Joshua-an-JGS/Finora';
                ALTER TABLE ""CompanySettings"" ADD COLUMN IF NOT EXISTS ""LastUpdateCheckedAtUtc"" timestamp with time zone;
                ALTER TABLE ""CompanySettings"" ADD COLUMN IF NOT EXISTS ""LastUpdateInstalledAtUtc"" timestamp with time zone;
            ");
        }
        else if (db.Database.IsSqlite())
        {
            await EnsureSqliteSchemaAsync(db);
        }

        // 1. Seed Roles
        foreach (var role in AppRoles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole(role));
            }
        }

        // 2. Seed Initial Users Only if Explicitly Requested via Config (Fresh Production Installs Use First-Time Setup Wizard)
        if (string.Equals(config["BootstrapAdmin:ForceSeed"], "true", StringComparison.OrdinalIgnoreCase))
        {
            await EnsureUserAsync(
                userManager,
                email: config["BootstrapAdmin:Email"] ?? "admin@organization.org",
                userName: config["BootstrapAdmin:Username"] ?? "admin",
                password: config["BootstrapAdmin:InitialPassword"] ?? "Admin@12345!",
                fullName: "System Administrator",
                department: "IT & Governance",
                role: AppRoles.Administrator,
                mfaRequired: false);
        }

        // 3. Seed CompanySettings
        if (!await db.CompanySettings.AnyAsync())
        {
            db.CompanySettings.Add(new CompanySettings
            {
                Id = 1,
                CompanyName = "FINORA Enterprise",
                Subtitle = "Finance & Payroll Management Division",
                RegisteredAddress = "Institutional Campus / Registered Office Address",
                ContactEmail = "payroll@organization.org",
                ContactPhone = "+91 0000 000000",
                WebsiteUrl = "",
                AuthorizedIdentifiers = "Institutional Payroll Division",
                SignatoryName = "Authorized Signatory",
                SignatoryDesignation = "Head of Finance & Accounts",
                CurrencySymbol = "₹",
                CurrencyCode = "INR",
                ShowZeroValueComponentsByDefault = false,
                ShowAmountInWordsByDefault = true,
                ActivePayrollMonth = DateTime.UtcNow.Month,
                ActivePayrollYear = DateTime.UtcNow.Year,
                EmailProviderMode = "Sandbox",
                SmtpFromEmail = "payroll@organization.org",
                SmtpFromName = "FINORA Payroll Administration",
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
                    Name = "FINORA Institutional Standard",
                    Description = "Official institutional two-column A4 payslip with FINORA orange (#F47721) accents, deep navy (#071747) typography, and dynamic zero-row suppression.",
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

    private static async Task EnsureSqliteSchemaAsync(ApplicationDbContext db)
    {
        var existingCompanySettingsCols = await GetSqliteColumnNamesAsync(db, "CompanySettings");
        if (existingCompanySettingsCols.Count > 0)
        {
            var companySettingsCols = new (string Name, string TypeSql)[]
            {
                ("AutoCheckUpdates", "INTEGER NOT NULL DEFAULT 1"),
                ("AutoDownloadUpdates", "INTEGER NOT NULL DEFAULT 0"),
                ("NotifyBeforeInstall", "INTEGER NOT NULL DEFAULT 1"),
                ("UpdateChannel", "TEXT NOT NULL DEFAULT 'Stable'"),
                ("UpdateServerUrl", "TEXT NOT NULL DEFAULT 'https://github.com/Joshua-an-JGS/Finora'"),
                ("LastUpdateCheckedAtUtc", "TEXT NULL"),
                ("LastUpdateInstalledAtUtc", "TEXT NULL")
            };

            foreach (var (colName, colDef) in companySettingsCols)
            {
                if (!existingCompanySettingsCols.Contains(colName))
                {
                    await db.Database.ExecuteSqlRawAsync($"ALTER TABLE \"CompanySettings\" ADD COLUMN \"{colName}\" {colDef};");
                }
            }
        }

        var existingPayrollCols = await GetSqliteColumnNamesAsync(db, "PayrollRecords");
        if (existingPayrollCols.Count > 0 && !existingPayrollCols.Contains("OverrideEmployeeCode"))
        {
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"PayrollRecords\" ADD COLUMN \"OverrideEmployeeCode\" TEXT NULL;");
        }
    }

    private static async Task<HashSet<string>> GetSqliteColumnNamesAsync(ApplicationDbContext db, string tableName)
    {
        var cols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var conn = db.Database.GetDbConnection();
        bool wasOpen = conn.State == System.Data.ConnectionState.Open;
        if (!wasOpen)
        {
            await conn.OpenAsync();
        }

        try
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $"PRAGMA table_info(\"{tableName}\");";
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                cols.Add(reader.GetString(1));
            }
        }
        finally
        {
            if (!wasOpen && conn.State == System.Data.ConnectionState.Open)
            {
                await conn.CloseAsync();
            }
        }

        return cols;
    }
}

