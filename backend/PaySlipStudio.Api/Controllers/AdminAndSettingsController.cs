using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;
using PaySlipStudio.Api.Services;

namespace PaySlipStudio.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class AdminAndSettingsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly AuditService _audit;

    public AdminAndSettingsController(
        ApplicationDbContext db,
        UserManager<ApplicationUser> userManager,
        AuditService audit)
    {
        _db = db;
        _userManager = userManager;
        _audit = audit;
    }

    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "system";
    private string CurrentUserName => User.Identity?.Name ?? "Operator";
    private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role) ?? AppRoles.Viewer;

    [HttpGet("health")]
    [AllowAnonymous]
    public async Task<IActionResult> HealthCheck()
    {
        bool dbConnected = await _db.Database.CanConnectAsync();
        return Ok(new
        {
            status = dbConnected ? "Healthy" : "Degraded",
            application = "FINORA — Finance & Payroll Management System API",
            product = "FINORA",
            version = "v1.0.0",
            developer = "Joshua Godson",
            credit = "Designed and Developed by Joshua Godson",
            framework = ".NET 10.0 LTS",
            databaseConnected = dbConnected,
            timestampUtc = DateTime.UtcNow
        });
    }

    // ========================================================================
    // EMPLOYEE DIRECTORY
    // ========================================================================
    [HttpGet("employees")]
    public async Task<IActionResult> GetEmployees([FromQuery] string? search = null)
    {
        var query = _db.Employees
            .AsNoTracking()
            .Include(e => e.PayrollRecords)
                .ThenInclude(r => r.PayrollPeriod)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(e =>
                e.EmployeeCode.ToLower().Contains(term) ||
                e.FullName.ToLower().Contains(term) ||
                e.Department.ToLower().Contains(term) ||
                e.Designation.ToLower().Contains(term) ||
                e.Email.ToLower().Contains(term));
        }

        var list = await query
            .OrderBy(e => e.EmployeeCode)
            .ToListAsync();

        var mapped = list.Select(e =>
        {
            var latestRecord = e.PayrollRecords
                .OrderByDescending(r => r.PayrollPeriod?.Year ?? 0)
                .ThenByDescending(r => r.PayrollPeriod?.Month ?? 0)
                .FirstOrDefault();

            return new
            {
                id = e.Id,
                employeeCode = e.EmployeeCode,
                fullName = e.FullName,
                email = e.Email,
                department = e.Department,
                designation = e.Designation,
                isActive = e.IsActive,
                periodsCount = e.PayrollRecords.Count,
                latestPeriodLabel = latestRecord?.PayrollPeriod?.PeriodLabel ?? "—",
                latestRecordId = latestRecord?.Id,
                latestNetSalary = latestRecord != null ? (latestRecord.OverrideNetSalary ?? latestRecord.ImportedNetSalary) : null,
                periods = e.PayrollRecords
                    .OrderByDescending(r => r.PayrollPeriod?.Year ?? 0)
                    .ThenByDescending(r => r.PayrollPeriod?.Month ?? 0)
                    .Select(r => new
                    {
                        recordId = r.Id,
                        month = r.PayrollPeriod?.Month ?? 0,
                        year = r.PayrollPeriod?.Year ?? 0,
                        periodLabel = r.PayrollPeriod?.PeriodLabel ?? "",
                        netSalary = r.OverrideNetSalary ?? r.ImportedNetSalary,
                        status = r.Status
                    })
            };
        });

        return Ok(mapped);
    }

    // ========================================================================
    // COMPANY & SYSTEM SETTINGS (Never expose SMTP Password to Frontend!)
    // ========================================================================
    [HttpGet("settings/company")]
    [AllowAnonymous]
    public async Task<IActionResult> GetCompanySettings()
    {
        var s = await _db.CompanySettings.AsNoTracking().FirstOrDefaultAsync() ?? new CompanySettings();
        return Ok(new
        {
            s.CompanyName,
            s.Subtitle,
            s.RegisteredAddress,
            s.ContactEmail,
            s.ContactPhone,
            s.WebsiteUrl,
            s.AuthorizedIdentifiers,
            s.SignatoryName,
            s.SignatoryDesignation,
            s.LogoDataUrl,
            s.CurrencySymbol,
            s.CurrencyCode,
            s.ShowZeroValueComponentsByDefault,
            s.ShowAmountInWordsByDefault,
            s.ActivePayrollMonth,
            s.ActivePayrollYear,
            s.EmailProviderMode,
            s.SmtpHost,
            s.SmtpPort,
            s.SmtpUseTls,
            s.SmtpUsername,
            hasSmtpPasswordConfigured = !string.IsNullOrWhiteSpace(s.SmtpPasswordEncrypted),
            s.SmtpFromEmail,
            s.SmtpFromName,
            s.DocumentRetentionDays,
            s.IsInitialized,
            s.CompanySetupCompleted,
            s.UpdatedAtUtc
        });
    }

    public class UpdateCompanySettingsRequest
    {
        public string CompanyName { get; set; } = string.Empty;
        public string Subtitle { get; set; } = string.Empty;
        public string RegisteredAddress { get; set; } = string.Empty;
        public string ContactEmail { get; set; } = string.Empty;
        public string ContactPhone { get; set; } = string.Empty;
        public string WebsiteUrl { get; set; } = string.Empty;
        public string AuthorizedIdentifiers { get; set; } = string.Empty;
        public string SignatoryName { get; set; } = string.Empty;
        public string SignatoryDesignation { get; set; } = string.Empty;
        public string? LogoDataUrl { get; set; }
        public string CurrencySymbol { get; set; } = "₹";
        public string CurrencyCode { get; set; } = "INR";
        public bool ShowZeroValueComponentsByDefault { get; set; }
        public bool ShowAmountInWordsByDefault { get; set; }
        public string EmailProviderMode { get; set; } = "Sandbox";
        public string SmtpHost { get; set; } = string.Empty;
        public int SmtpPort { get; set; } = 587;
        public bool SmtpUseTls { get; set; } = true;
        public string SmtpUsername { get; set; } = string.Empty;
        public string? NewSmtpPassword { get; set; }
        public string SmtpFromEmail { get; set; } = string.Empty;
        public string SmtpFromName { get; set; } = string.Empty;
        public int DocumentRetentionDays { get; set; } = 1095;
    }

    [HttpPut("settings/company")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> UpdateCompanySettings([FromBody] UpdateCompanySettingsRequest req)
    {
        var s = await _db.CompanySettings.FirstOrDefaultAsync();
        if (s == null)
        {
            s = new CompanySettings { Id = 1 };
            _db.CompanySettings.Add(s);
        }

        s.CompanyName = string.IsNullOrWhiteSpace(req.CompanyName) ? s.CompanyName : req.CompanyName.Trim();
        s.Subtitle = req.Subtitle?.Trim() ?? string.Empty;
        s.RegisteredAddress = req.RegisteredAddress?.Trim() ?? string.Empty;
        s.ContactEmail = req.ContactEmail?.Trim() ?? string.Empty;
        s.ContactPhone = req.ContactPhone?.Trim() ?? string.Empty;
        s.WebsiteUrl = req.WebsiteUrl?.Trim() ?? string.Empty;
        s.AuthorizedIdentifiers = req.AuthorizedIdentifiers?.Trim() ?? string.Empty;
        s.SignatoryName = req.SignatoryName?.Trim() ?? string.Empty;
        s.SignatoryDesignation = req.SignatoryDesignation?.Trim() ?? string.Empty;
        s.LogoDataUrl = req.LogoDataUrl;
        s.CurrencySymbol = string.IsNullOrWhiteSpace(req.CurrencySymbol) ? "₹" : req.CurrencySymbol.Trim();
        s.CurrencyCode = string.IsNullOrWhiteSpace(req.CurrencyCode) ? "INR" : req.CurrencyCode.Trim();
        s.ShowZeroValueComponentsByDefault = req.ShowZeroValueComponentsByDefault;
        s.ShowAmountInWordsByDefault = req.ShowAmountInWordsByDefault;
        s.EmailProviderMode = req.EmailProviderMode is "Smtp" ? "Smtp" : "Sandbox";
        s.SmtpHost = req.SmtpHost?.Trim() ?? string.Empty;
        s.SmtpPort = Math.Clamp(req.SmtpPort, 1, 65535);
        s.SmtpUseTls = req.SmtpUseTls;
        s.SmtpFromEmail = req.SmtpFromEmail?.Trim() ?? string.Empty;
        s.SmtpFromName = req.SmtpFromName?.Trim() ?? string.Empty;
        s.SmtpUsername = !string.IsNullOrWhiteSpace(req.SmtpUsername)
            ? req.SmtpUsername.Trim()
            : s.SmtpFromEmail;

        if (s.SmtpFromEmail.EndsWith("@gmail.com", StringComparison.OrdinalIgnoreCase) &&
            (string.IsNullOrWhiteSpace(s.SmtpHost) || s.SmtpHost.Equals("smtp.office365.com", StringComparison.OrdinalIgnoreCase)))
        {
            s.SmtpHost = "smtp.gmail.com";
        }

        if (!string.IsNullOrWhiteSpace(req.NewSmtpPassword))
        {
            s.SmtpPasswordEncrypted = req.NewSmtpPassword.Trim();
            s.EmailProviderMode = "Smtp";
        }
        s.DocumentRetentionDays = Math.Clamp(req.DocumentRetentionDays, 30, 3650);
        s.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "Settings.Updated", "CompanySettings", "1",
            $"Updated organization & email delivery configuration (Company='{s.CompanyName}', EmailMode='{s.EmailProviderMode}', SmtpHost='{s.SmtpHost}', ShowZeroByDefault={s.ShowZeroValueComponentsByDefault}).");

        return await GetCompanySettings();
    }

    [HttpPost("settings/company/complete-setup")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> MarkCompanySetupComplete()
    {
        var s = await _db.CompanySettings.FirstOrDefaultAsync();
        if (s != null)
        {
            s.CompanySetupCompleted = true;
            s.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
                "Company.SetupCompleted", "CompanySettings", s.Id.ToString(),
                $"Initial company profile configuration marked complete by Administrator '{CurrentUserName}'.");
        }
        return Ok(new { success = true, message = "Company setup marked as completed." });
    }

    public class SmtpTestRequest
    {
        public string? SmtpHost { get; set; }
        public int? SmtpPort { get; set; }
        public string? SmtpUsername { get; set; }
        public string? SmtpPassword { get; set; }
        public string? SmtpFromEmail { get; set; }
        public string? TestRecipientEmail { get; set; }
    }

    [HttpPost("settings/smtp-test")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> TestSmtpConnection([FromBody] SmtpTestRequest req)
    {
        var s = await _db.CompanySettings.FirstOrDefaultAsync() ?? new CompanySettings { Id = 1 };

        string host = !string.IsNullOrWhiteSpace(req.SmtpHost) ? req.SmtpHost.Trim() : s.SmtpHost;
        int port = req.SmtpPort is > 0 ? req.SmtpPort.Value : s.SmtpPort;
        string fromEmail = !string.IsNullOrWhiteSpace(req.SmtpFromEmail) ? req.SmtpFromEmail.Trim() : s.SmtpFromEmail;
        string user = !string.IsNullOrWhiteSpace(req.SmtpUsername) ? req.SmtpUsername.Trim() : (!string.IsNullOrWhiteSpace(s.SmtpUsername) ? s.SmtpUsername : fromEmail);
        string pass = !string.IsNullOrWhiteSpace(req.SmtpPassword) ? req.SmtpPassword.Trim() : (s.SmtpPasswordEncrypted ?? string.Empty);

        if (user.EndsWith("@gmail.com", StringComparison.OrdinalIgnoreCase) &&
            (string.IsNullOrWhiteSpace(host) || host.Equals("smtp.office365.com", StringComparison.OrdinalIgnoreCase)))
        {
            host = "smtp.gmail.com";
        }

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass))
        {
            return BadRequest(new
            {
                message = "SMTP Host, Sender Email/Username, and SMTP Password / Google App Password are required to test real email delivery."
            });
        }

        string cleanPass = (host.Contains("gmail.com", StringComparison.OrdinalIgnoreCase) || host.Contains("google.com", StringComparison.OrdinalIgnoreCase))
            ? pass.Replace(" ", "")
            : pass;

        try
        {
            using var client = new MailKit.Net.Smtp.SmtpClient();
            client.Timeout = 20000;
            var secure = port == 465
                ? MailKit.Security.SecureSocketOptions.SslOnConnect
                : MailKit.Security.SecureSocketOptions.StartTls;

            await client.ConnectAsync(host, port, secure);
            await client.AuthenticateAsync(user, cleanPass);

            // Persist working credentials automatically
            s.SmtpHost = host;
            s.SmtpPort = port;
            s.SmtpUsername = user;
            s.SmtpFromEmail = string.IsNullOrWhiteSpace(fromEmail) ? user : fromEmail;
            s.SmtpPasswordEncrypted = pass;
            s.EmailProviderMode = "Smtp";
            s.SmtpUseTls = true;
            s.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            string sentNote = string.Empty;
            if (!string.IsNullOrWhiteSpace(req.TestRecipientEmail) && req.TestRecipientEmail.Contains('@'))
            {
                var msg = new MimeKit.MimeMessage();
                msg.From.Add(new MimeKit.MailboxAddress(s.CompanyName, s.SmtpFromEmail));
                msg.To.Add(new MimeKit.MailboxAddress("Test Recipient", req.TestRecipientEmail.Trim()));
                msg.Subject = $"[FINORA] SMTP Verification Test — {s.CompanyName}";
                msg.Body = new MimeKit.TextPart("plain")
                {
                    Text = $"Hello,\n\nThis is a verified live SMTP test email from {s.CompanyName} FINORA — Finance & Payroll Management System.\n\nAuthenticated SMTP Server: {host}:{port}\nSender Account: {user}\nTimestamp (UTC): {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC\n\nYour FINORA email delivery pipeline is active and ready to dispatch employee payslips."
                };
                await client.SendAsync(msg);
                sentNote = $" and sent a real verification email to {req.TestRecipientEmail.Trim()}";
            }

            await client.DisconnectAsync(true);

            return Ok(new
            {
                success = true,
                message = $"Successfully connected & authenticated with {host}:{port} as {user}{sentNote}. Settings saved in Production SMTP mode."
            });
        }
        catch (MailKit.Security.AuthenticationException authEx)
        {
            return BadRequest(new
            {
                message = $"SMTP login rejected by {host}:{port} for '{user}' ({authEx.Message}). If using Google Workspace or Gmail (@gmail.com), please generate a 16-character Google App Password at https://myaccount.google.com/apppasswords and paste it as the SMTP Password."
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new
            {
                message = $"SMTP connection to {host}:{port} failed: {ex.Message}"
            });
        }
    }

    // ========================================================================
    // USER & ROLE MANAGEMENT (Section 4)
    // ========================================================================
    [HttpGet("users")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> GetUsers()
    {
        var users = await _userManager.Users
            .OrderBy(u => u.UserName)
            .ToListAsync();

        var result = new List<object>();
        foreach (var u in users)
        {
            var roles = await _userManager.GetRolesAsync(u);
            result.Add(new
            {
                id = u.Id,
                userName = u.UserName,
                email = u.Email,
                fullName = u.FullName,
                department = u.Department,
                role = roles.FirstOrDefault() ?? u.RoleName,
                isActive = u.IsActive,
                mfaRequired = u.MfaRequired,
                mfaConfigured = u.MfaConfigured,
                createdAtUtc = u.CreatedAtUtc,
                lastLoginAtUtc = u.LastLoginAtUtc
            });
        }

        return Ok(result);
    }

    public class CreateUserRequest
    {
        public string UserName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Department { get; set; } = "Accounts & Finance";
        public string Role { get; set; } = AppRoles.AccountsOperator;
        public string Password { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
        public bool MfaRequired { get; set; }
    }

    public class UpdateUserRequest
    {
        public string FullName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Department { get; set; } = "Accounts & Finance";
        public string Role { get; set; } = AppRoles.AccountsOperator;
        public bool IsActive { get; set; } = true;
        public bool MfaRequired { get; set; }
        public string? NewPassword { get; set; }
    }

    public class ToggleUserStatusRequest
    {
        public bool IsActive { get; set; }
    }

    [HttpPost("users")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.UserName) || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { message = "Username, email address, and initial password are required." });

        if (string.IsNullOrWhiteSpace(req.FullName))
            return BadRequest(new { message = "Full name is required." });

        if (req.Password.Length < 8)
            return BadRequest(new { message = "Password must be at least 8 characters in length." });

        var existingUser = await _userManager.FindByNameAsync(req.UserName.Trim());
        if (existingUser != null)
            return BadRequest(new { message = $"Username '{req.UserName.Trim()}' is already taken." });

        var existingEmail = await _userManager.FindByEmailAsync(req.Email.Trim());
        if (existingEmail != null)
            return BadRequest(new { message = $"Email address '{req.Email.Trim()}' is already associated with another account." });

        var role = AppRoles.All.Contains(req.Role) ? req.Role : AppRoles.Viewer;

        var user = new ApplicationUser
        {
            UserName = req.UserName.Trim(),
            Email = req.Email.Trim(),
            EmailConfirmed = true,
            FullName = req.FullName.Trim(),
            Department = string.IsNullOrWhiteSpace(req.Department) ? "Accounts & Finance" : req.Department.Trim(),
            RoleName = role,
            IsActive = req.IsActive,
            MfaRequired = req.MfaRequired,
            CreatedAtUtc = DateTime.UtcNow
        };

        var createRes = await _userManager.CreateAsync(user, req.Password);
        if (!createRes.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", createRes.Errors.Select(e => e.Description)) });
        }

        await _userManager.AddToRoleAsync(user, role);

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "User.Created", "ApplicationUser", user.Id,
            $"Created user member account '{user.UserName}' ({user.Email}) with role '{role}' and initial status '{(user.IsActive ? "Active" : "Inactive")}'.");

        return Ok(new
        {
            id = user.Id,
            userName = user.UserName,
            email = user.Email,
            fullName = user.FullName,
            role = role,
            isActive = user.IsActive,
            message = "Member account created successfully."
        });
    }

    [HttpPut("users/{id}")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> UpdateUser(string id, [FromBody] UpdateUserRequest req)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null) return NotFound(new { message = "User not found." });

        var currentRoles = await _userManager.GetRolesAsync(user);
        var currentRole = currentRoles.FirstOrDefault() ?? user.RoleName;
        var newRole = AppRoles.All.Contains(req.Role) ? req.Role : currentRole;

        // Safety Rule 1: Cannot demote or deactivate own current account
        if (CurrentUserId == id)
        {
            if (!req.IsActive)
                return BadRequest(new { message = "You cannot deactivate your own current administrator account." });
            if (newRole != AppRoles.Administrator)
                return BadRequest(new { message = "You cannot remove Administrator privileges from your own account." });
        }

        // Safety Rule 2: Cannot demote or deactivate the last remaining active Administrator
        bool isCurrentAdmin = currentRole == AppRoles.Administrator;
        bool willBeAdmin = newRole == AppRoles.Administrator && req.IsActive;
        if (isCurrentAdmin && !willBeAdmin)
        {
            var adminUsers = await _userManager.GetUsersInRoleAsync(AppRoles.Administrator);
            var otherActiveAdmins = adminUsers.Where(u => u.IsActive && u.Id != user.Id).ToList();
            if (otherActiveAdmins.Count == 0)
            {
                return BadRequest(new { message = "Cannot demote or deactivate the last remaining active Administrator." });
            }
        }

        // Validate email uniqueness if changed
        if (!string.IsNullOrWhiteSpace(req.Email) && !string.Equals(user.Email, req.Email.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            var existingEmail = await _userManager.FindByEmailAsync(req.Email.Trim());
            if (existingEmail != null && existingEmail.Id != user.Id)
                return BadRequest(new { message = $"Email address '{req.Email.Trim()}' is already in use by another account." });
            user.Email = req.Email.Trim();
        }

        if (!string.IsNullOrWhiteSpace(req.FullName))
            user.FullName = req.FullName.Trim();

        if (!string.IsNullOrWhiteSpace(req.Department))
            user.Department = req.Department.Trim();

        // Handle role change
        if (newRole != currentRole)
        {
            if (currentRoles.Count > 0)
                await _userManager.RemoveFromRolesAsync(user, currentRoles);
            await _userManager.AddToRoleAsync(user, newRole);
            user.RoleName = newRole;

            await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
                "User.RoleChanged", "ApplicationUser", user.Id,
                $"Changed role of user '{user.UserName}' from '{currentRole}' to '{newRole}'.");
        }

        // Handle status change
        if (user.IsActive != req.IsActive)
        {
            user.IsActive = req.IsActive;
            string statusAction = user.IsActive ? "User.Activated" : "User.Deactivated";
            await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
                statusAction, "ApplicationUser", user.Id,
                $"{(user.IsActive ? "Activated" : "Deactivated")} user account '{user.UserName}'.");
        }

        user.MfaRequired = req.MfaRequired;

        // Optional password reset
        if (!string.IsNullOrWhiteSpace(req.NewPassword))
        {
            if (req.NewPassword.Length < 8)
                return BadRequest(new { message = "New password must be at least 8 characters long." });

            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var resetRes = await _userManager.ResetPasswordAsync(user, token, req.NewPassword);
            if (!resetRes.Succeeded)
            {
                return BadRequest(new { message = string.Join(" ", resetRes.Errors.Select(e => e.Description)) });
            }

            await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
                "User.PasswordReset", "ApplicationUser", user.Id,
                $"Reset password for user '{user.UserName}'.");
        }

        await _userManager.UpdateAsync(user);

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "User.Edited", "ApplicationUser", user.Id,
            $"Updated member details for user '{user.UserName}' ({user.Email}).");

        return Ok(new
        {
            id = user.Id,
            userName = user.UserName,
            email = user.Email,
            fullName = user.FullName,
            role = user.RoleName,
            isActive = user.IsActive,
            message = "Member account updated successfully."
        });
    }

    [HttpPost("users/{id}/status")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> ToggleUserStatus(string id, [FromBody] ToggleUserStatusRequest req)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null) return NotFound(new { message = "User not found." });

        if (CurrentUserId == id && !req.IsActive)
            return BadRequest(new { message = "You cannot deactivate your own current administrator account." });

        var roles = await _userManager.GetRolesAsync(user);
        if (roles.Contains(AppRoles.Administrator) && !req.IsActive)
        {
            var adminUsers = await _userManager.GetUsersInRoleAsync(AppRoles.Administrator);
            var otherActiveAdmins = adminUsers.Where(u => u.IsActive && u.Id != user.Id).ToList();
            if (otherActiveAdmins.Count == 0)
                return BadRequest(new { message = "Cannot deactivate the last remaining active Administrator." });
        }

        user.IsActive = req.IsActive;
        await _userManager.UpdateAsync(user);

        string actionType = user.IsActive ? "User.Activated" : "User.Deactivated";
        string actionDesc = user.IsActive
            ? $"Activated member account '{user.UserName}'."
            : $"Deactivated member account '{user.UserName}'. Login disabled; historical records retained.";

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            actionType, "ApplicationUser", user.Id, actionDesc);

        return Ok(new
        {
            id = user.Id,
            userName = user.UserName,
            isActive = user.IsActive,
            message = user.IsActive ? "Member activated successfully." : "Member deactivated successfully."
        });
    }

    public class AdminResetPasswordRequest
    {
        public string? CustomTemporaryPassword { get; set; }
    }

    [HttpPost("users/{id}/reset-password")]
    [HttpPost("admin/users/{id}/reset-password")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> AdminResetPassword(string id, [FromBody] AdminResetPasswordRequest? req)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null) return NotFound(new { message = "User account not found." });

        string newPassword;
        if (!string.IsNullOrWhiteSpace(req?.CustomTemporaryPassword))
        {
            newPassword = req.CustomTemporaryPassword.Trim();
            if (newPassword.Length < 8)
                return BadRequest(new { message = "Temporary password must be at least 8 characters in length." });
        }
        else
        {
            var rawBytes = RandomNumberGenerator.GetBytes(6);
            newPassword = "Finora#" + Convert.ToHexString(rawBytes).Substring(0, 6) + "!";
        }

        var resetToken = await _userManager.GeneratePasswordResetTokenAsync(user);
        var resetRes = await _userManager.ResetPasswordAsync(user, resetToken, newPassword);
        if (!resetRes.Succeeded)
        {
            return BadRequest(new { message = string.Join("; ", resetRes.Errors.Select(e => e.Description)) });
        }

        await _userManager.SetLockoutEndDateAsync(user, null);
        await _userManager.ResetAccessFailedCountAsync(user);
        await _userManager.UpdateSecurityStampAsync(user);

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "User.PasswordResetByAdmin", "ApplicationUser", user.Id,
            $"Administrator '{CurrentUserName}' initiated a password reset for user '{user.UserName}' ({user.Email}).");

        return Ok(new
        {
            success = true,
            temporaryPassword = newPassword,
            message = $"Password for '{user.UserName}' has been reset successfully."
        });
    }

    [HttpDelete("users/{id}")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> DeleteUser(string id)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user == null) return NotFound(new { message = "User not found." });

        if (CurrentUserId == id)
            return BadRequest(new { message = "You cannot delete your own logged-in Administrator account." });

        var roles = await _userManager.GetRolesAsync(user);
        if (roles.Contains(AppRoles.Administrator))
        {
            var adminUsers = await _userManager.GetUsersInRoleAsync(AppRoles.Administrator);
            if (adminUsers.Count <= 1)
                return BadRequest(new { message = "Cannot delete the last remaining Administrator account in FINORA." });
        }

        string username = user.UserName ?? id;
        string email = user.Email ?? "";
        string role = roles.FirstOrDefault() ?? user.RoleName;

        var delRes = await _userManager.DeleteAsync(user);
        if (!delRes.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", delRes.Errors.Select(e => e.Description)) });
        }

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "User.Deleted", "ApplicationUser", id,
            $"Permanently removed user account '{username}' ({email}) with role '{role}'. Historical payroll records and audit logs retained.");

        return Ok(new { message = $"Member account '{username}' was permanently deleted." });
    }

    // ========================================================================
    // AUDIT LOG (Section 16)
    // ========================================================================
    [HttpGet("audit")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> GetAuditLog(
        [FromQuery] string? actionFilter = null,
        [FromQuery] string? search = null,
        [FromQuery] int limit = 200)
    {
        var entries = await _audit.QueryAsync(actionFilter, search, limit);
        return Ok(entries);
    }

    // ========================================================================
    // MULTI-FACTOR AUTHENTICATION (MFA) CONFIGURATION
    // ========================================================================
    public record ConfigureMfaRequest(bool MfaRequired, string SecretKey, string? VerificationCode);

    [HttpGet("admin/mfa")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> GetAdminMfaStatus()
    {
        var user = await _userManager.FindByIdAsync(CurrentUserId);
        if (user == null) return NotFound(new { message = "User not found." });

        string secret = !string.IsNullOrWhiteSpace(user.MfaSecretKey)
            ? user.MfaSecretKey
            : TotpHelper.GenerateSecretKey();

        string appName = "FINORA";
        string accountName = user.UserName ?? "admin";
        string otpUri = $"otpauth://totp/{appName}:{accountName}?secret={secret}&issuer={appName}&algorithm=SHA1&digits=6&period=30";
        string currentSampleCode = TotpHelper.GetCurrentCode(secret);

        return Ok(new
        {
            mfaRequired = user.MfaRequired,
            mfaConfigured = user.MfaConfigured,
            secretKey = secret,
            otpUri,
            currentSampleCode,
            adminUsername = user.UserName
        });
    }

    [HttpPost("admin/mfa/generate-secret")]
    [Authorize(Roles = AppRoles.Administrator)]
    public IActionResult GenerateNewMfaSecret()
    {
        string secret = TotpHelper.GenerateSecretKey();
        return Ok(new { secretKey = secret });
    }

    [HttpPost("admin/mfa/configure")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> ConfigureAdminMfa([FromBody] ConfigureMfaRequest req)
    {
        var user = await _userManager.FindByIdAsync(CurrentUserId);
        if (user == null) return NotFound(new { message = "User not found." });

        if (string.IsNullOrWhiteSpace(req.SecretKey))
            return BadRequest(new { message = "A valid MFA secret key or PIN is required." });

        // If activating MFA, verify test code unless demo master 123456
        if (req.MfaRequired && !string.IsNullOrWhiteSpace(req.VerificationCode))
        {
            bool valid = TotpHelper.VerifyCode(req.SecretKey, req.VerificationCode);
            if (!valid)
            {
                return BadRequest(new { message = "Verification code is incorrect. Check your authenticator app code and try again." });
            }
        }

        user.MfaSecretKey = req.SecretKey.Trim();
        user.MfaRequired = req.MfaRequired;
        user.MfaConfigured = true;

        await _userManager.UpdateAsync(user);

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            req.MfaRequired ? "Security.MfaEnabled" : "Security.MfaDisabled",
            "ApplicationUser", user.Id,
            $"{(req.MfaRequired ? "Enabled and configured" : "Disabled")} Multi-Factor Authentication (MFA) for administrator '{user.UserName}'.");

        return Ok(new
        {
            mfaRequired = user.MfaRequired,
            mfaConfigured = user.MfaConfigured,
            message = req.MfaRequired
                ? "Multi-Factor Authentication (MFA) has been successfully activated and enforced for Administrator access!"
                : "Multi-Factor Authentication (MFA) has been disabled."
        });
    }

    [HttpPost("admin/mfa/disable")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> DisableAdminMfa()
    {
        var user = await _userManager.FindByIdAsync(CurrentUserId);
        if (user == null) return NotFound(new { message = "User not found." });

        user.MfaRequired = false;
        user.MfaConfigured = false;
        await _userManager.UpdateAsync(user);

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "Security.MfaDisabled", "ApplicationUser", user.Id,
            $"Disabled Multi-Factor Authentication (MFA) for administrator '{user.UserName}'.");

        return Ok(new { mfaRequired = false, mfaConfigured = false, message = "MFA has been disabled." });
    }

    // ========================================================================
    // BACKUP & RESTORE MANAGEMENT
    // ========================================================================
    private string GetBaseDataDirectory()
    {
        return Environment.GetEnvironmentVariable("FINORA_DATA_DIR")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FINORA");
    }

    [HttpGet("admin/system/storage-info")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> GetSystemStorageInfo()
    {
        var baseDir = GetBaseDataDirectory();
        var dataDir = Path.Combine(baseDir, "Data");
        var docsDir = Path.Combine(baseDir, "Documents");
        var backupsDir = Path.Combine(baseDir, "Backups");
        var dbPath = Path.Combine(dataDir, "finora.db");

        long dbSizeBytes = 0;
        if (System.IO.File.Exists(dbPath))
        {
            dbSizeBytes = new FileInfo(dbPath).Length;
        }

        int totalBackups = 0;
        if (Directory.Exists(backupsDir))
        {
            totalBackups = Directory.GetFiles(backupsDir, "*.zip").Length;
        }

        int totalEmployees = await _db.Employees.CountAsync();
        int totalPayrollRecords = await _db.PayrollRecords.CountAsync();
        int totalPayslips = await _db.GeneratedPayslipDocuments.CountAsync();

        return Ok(new
        {
            baseDirectory = baseDir,
            dataDirectory = dataDir,
            documentsDirectory = docsDir,
            backupsDirectory = backupsDir,
            databaseType = _db.Database.IsSqlite() ? "SQLite (Embedded Desktop)" : "PostgreSQL (Enterprise Server)",
            databaseFile = dbPath,
            databaseSizeBytes = dbSizeBytes,
            databaseSizeFormatted = dbSizeBytes > 0 ? $"{(dbSizeBytes / 1024.0 / 1024.0):F2} MB" : "N/A",
            totalBackups,
            totalEmployees,
            totalPayrollRecords,
            totalPayslips
        });
    }

    [HttpGet("admin/backups")]
    [Authorize(Roles = AppRoles.Administrator)]
    public IActionResult GetBackupsList()
    {
        var baseDir = GetBaseDataDirectory();
        var backupsDir = Path.Combine(baseDir, "Backups");
        if (!Directory.Exists(backupsDir))
        {
            Directory.CreateDirectory(backupsDir);
        }

        var files = Directory.GetFiles(backupsDir, "*.zip")
            .Select(f =>
            {
                var fi = new FileInfo(f);
                return new
                {
                    fileName = fi.Name,
                    sizeBytes = fi.Length,
                    sizeFormatted = $"{(fi.Length / 1024.0 / 1024.0):F2} MB",
                    createdAtUtc = fi.CreationTimeUtc,
                    lastModifiedUtc = fi.LastWriteTimeUtc
                };
            })
            .OrderByDescending(x => x.createdAtUtc)
            .ToList();

        return Ok(files);
    }

    [HttpPost("admin/backups/create")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> CreateBackup()
    {
        var baseDir = GetBaseDataDirectory();
        var dataDir = Path.Combine(baseDir, "Data");
        var backupsDir = Path.Combine(baseDir, "Backups");
        Directory.CreateDirectory(backupsDir);

        var timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
        var backupFileName = $"FINORA_Backup_{timestamp}.zip";
        var backupFilePath = Path.Combine(backupsDir, backupFileName);

        var tempDir = Path.Combine(Path.GetTempPath(), $"finora_bk_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            // 1. Copy SQLite database if exists
            var dbPath = Path.Combine(dataDir, "finora.db");
            if (System.IO.File.Exists(dbPath))
            {
                // In SQLite, copy finora.db safely
                System.IO.File.Copy(dbPath, Path.Combine(tempDir, "finora.db"), true);
            }

            // 2. Export manifest metadata
            var company = await _db.CompanySettings.FirstOrDefaultAsync();
            var empCount = await _db.Employees.CountAsync();
            var prCount = await _db.PayrollRecords.CountAsync();
            var templateCount = await _db.PayslipTemplates.CountAsync();

            var manifest = new
            {
                product = "FINORA",
                version = "1.0.0",
                backupCreatedAtUtc = DateTime.UtcNow,
                createdBy = CurrentUserName,
                companyName = company?.CompanyName ?? "FINORA",
                totalEmployees = empCount,
                totalPayrollRecords = prCount,
                totalTemplates = templateCount
            };
            var manifestJson = System.Text.Json.JsonSerializer.Serialize(manifest, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
            await System.IO.File.WriteAllTextAsync(Path.Combine(tempDir, "manifest.json"), manifestJson);

            // 3. Create zip archive
            if (System.IO.File.Exists(backupFilePath))
            {
                System.IO.File.Delete(backupFilePath);
            }
            System.IO.Compression.ZipFile.CreateFromDirectory(tempDir, backupFilePath);

            var fi = new FileInfo(backupFilePath);

            await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
                "Backup.Created", "SystemBackup", backupFileName,
                $"Created complete system snapshot backup '{backupFileName}' ({fi.Length / 1024} KB).");

            return Ok(new
            {
                success = true,
                fileName = fi.Name,
                sizeBytes = fi.Length,
                sizeFormatted = $"{(fi.Length / 1024.0 / 1024.0):F2} MB",
                createdAtUtc = fi.CreationTimeUtc,
                message = $"Snapshot backup '{backupFileName}' created successfully in {backupsDir}!"
            });
        }
        finally
        {
            try
            {
                if (Directory.Exists(tempDir))
                {
                    Directory.Delete(tempDir, true);
                }
            }
            catch { }
        }
    }

    public record RestoreBackupRequest(string FileName);

    [HttpPost("admin/backups/restore")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> RestoreBackup([FromBody] RestoreBackupRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.FileName))
        {
            return BadRequest(new { message = "Backup file name is required." });
        }

        var baseDir = GetBaseDataDirectory();
        var backupsDir = Path.Combine(baseDir, "Backups");
        var dataDir = Path.Combine(baseDir, "Data");
        var targetBackup = Path.Combine(backupsDir, Path.GetFileName(req.FileName));

        if (!System.IO.File.Exists(targetBackup))
        {
            return NotFound(new { message = $"Backup file '{req.FileName}' not found in {backupsDir}." });
        }

        var tempDir = Path.Combine(Path.GetTempPath(), $"finora_restore_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            System.IO.Compression.ZipFile.ExtractToDirectory(targetBackup, tempDir);
            var extractedDb = Path.Combine(tempDir, "finora.db");
            if (!System.IO.File.Exists(extractedDb))
            {
                return BadRequest(new { message = "Invalid backup archive: missing 'finora.db' payload." });
            }

            var destDb = Path.Combine(dataDir, "finora.db");

            // Pre-restore safety backup of existing db
            if (System.IO.File.Exists(destDb))
            {
                var safetyName = Path.Combine(backupsDir, $"pre_restore_safety_{DateTime.UtcNow:yyyyMMdd_HHmmss}.db");
                System.IO.File.Copy(destDb, safetyName, true);
            }

            // Restore db
            System.IO.File.Copy(extractedDb, destDb, true);

            await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
                "Backup.Restored", "SystemBackup", req.FileName,
                $"Restored system database from backup snapshot '{req.FileName}'.");

            return Ok(new
            {
                success = true,
                fileName = req.FileName,
                message = $"Database restored from '{req.FileName}'. Please refresh or restart FINORA to view the updated data."
            });
        }
        finally
        {
            try
            {
                if (Directory.Exists(tempDir))
                {
                    Directory.Delete(tempDir, true);
                }
            }
            catch { }
        }
    }
}

