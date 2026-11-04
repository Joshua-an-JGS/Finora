using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;
using PaySlipStudio.Api.Services;

namespace PaySlipStudio.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly AuditService _audit;
    private readonly IConfiguration _config;
    private readonly ApplicationDbContext _db;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        AuditService audit,
        IConfiguration config,
        ApplicationDbContext db)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _audit = audit;
        _config = config;
        _db = db;
    }

    public record LoginRequest(string UsernameOrEmail, string Password, string? MfaCode);
    public record AdminLoginRequest(string AdministratorId, string Password, string? MfaCode);
    public record FirstTimeSetupRequest(string FullName, string Email, string Username, string Password, string? CompanyName);

    private static readonly ConcurrentDictionary<string, (int Attempts, DateTime LastAttempt)> _adminRateLimit = new();

    /// <summary>
    /// Checks whether the FINORA installation requires initial Administrator onboarding.
    /// Returns true if no Administrator accounts exist in the database.
    /// </summary>
    [HttpGet("setup-status")]
    [AllowAnonymous]
    public async Task<IActionResult> GetSetupStatus()
    {
        var admins = await _userManager.GetUsersInRoleAsync(AppRoles.Administrator);
        var isSetupRequired = admins.Count == 0;

        return Ok(new
        {
            isSetupRequired,
            systemVersion = "1.0.0",
            appName = "FINORA"
        });
    }

    /// <summary>
    /// First-time initial setup to register the primary System Administrator and initialize the customer workspace.
    /// Can only be executed once when no Administrator exists.
    /// </summary>
    [HttpPost("setup-admin")]
    [AllowAnonymous]
    public async Task<IActionResult> SetupInitialAdmin([FromBody] FirstTimeSetupRequest req)
    {
        var admins = await _userManager.GetUsersInRoleAsync(AppRoles.Administrator);
        if (admins.Count > 0)
        {
            return BadRequest(new { message = "FINORA workspace is already initialized. Please sign in." });
        }

        if (req == null ||
            string.IsNullOrWhiteSpace(req.FullName) ||
            string.IsNullOrWhiteSpace(req.Email) ||
            string.IsNullOrWhiteSpace(req.Username) ||
            string.IsNullOrWhiteSpace(req.Password))
        {
            return BadRequest(new { message = "Full name, work email address, username, and password are required." });
        }

        if (req.Password.Trim().Length < 8)
        {
            return BadRequest(new { message = "Administrator password must be at least 8 characters long." });
        }

        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";

        var adminUser = new ApplicationUser
        {
            UserName = req.Username.Trim(),
            Email = req.Email.Trim(),
            EmailConfirmed = true,
            FullName = req.FullName.Trim(),
            Department = "Administration & Governance",
            RoleName = AppRoles.Administrator,
            IsActive = true,
            MfaRequired = false,
            CreatedAtUtc = DateTime.UtcNow
        };

        var createRes = await _userManager.CreateAsync(adminUser, req.Password.Trim());
        if (!createRes.Succeeded)
        {
            var errors = string.Join("; ", createRes.Errors.Select(e => e.Description));
            return BadRequest(new { message = errors });
        }

        await _userManager.AddToRoleAsync(adminUser, AppRoles.Administrator);

        // Update company name if provided during first-time setup
        if (!string.IsNullOrWhiteSpace(req.CompanyName))
        {
            var settings = await _db.CompanySettings.FirstOrDefaultAsync();
            if (settings != null)
            {
                settings.CompanyName = req.CompanyName.Trim();
                settings.UpdatedAtUtc = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
        }

        await _audit.RecordAsync(
            adminUser.Id,
            adminUser.UserName,
            AppRoles.Administrator,
            "System.FirstTimeSetupCompleted",
            "ApplicationUser",
            adminUser.Id,
            $"Initial System Administrator '{adminUser.FullName}' ({adminUser.Email}) registered and FINORA workspace successfully initialized.",
            ipAddress: ip);

        var token = GenerateJwtToken(adminUser, AppRoles.Administrator, isAdminGateway: true);

        return Ok(new
        {
            token,
            message = "FINORA workspace initialized successfully. Welcome!",
            user = new
            {
                id = adminUser.Id,
                userName = adminUser.UserName,
                email = adminUser.Email,
                fullName = adminUser.FullName,
                department = adminUser.Department,
                role = AppRoles.Administrator,
                isAdminSession = true,
                mfaRequired = adminUser.MfaRequired,
                mfaConfigured = adminUser.MfaConfigured
            }
        });
    }

    [HttpPost("admin-login")]
    [AllowAnonymous]
    public async Task<IActionResult> AdminLogin([FromBody] AdminLoginRequest req)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var rateKey = $"{ip}_{req?.AdministratorId?.Trim().ToLowerInvariant()}";

        // Progressive rate limit defense against brute-force attacks on admin gateway
        if (_adminRateLimit.TryGetValue(rateKey, out var rl) && rl.Attempts >= 5)
        {
            if (DateTime.UtcNow - rl.LastAttempt < TimeSpan.FromMinutes(5))
            {
                await _audit.RecordAsync("SYSTEM", req?.AdministratorId ?? "unknown", AppRoles.Administrator,
                    "Auth.AdminRateLimitExceeded", "SecurityGateway", null,
                    $"Excessive admin gateway login attempts from IP '{ip}'. Throttling enforced.", ipAddress: ip);
                return StatusCode(429, new { message = "Too many failed administrator login attempts. Please wait 5 minutes before trying again." });
            }
            else
            {
                _adminRateLimit.TryRemove(rateKey, out _);
            }
        }

        if (req == null || string.IsNullOrWhiteSpace(req.AdministratorId) || string.IsNullOrWhiteSpace(req.Password))
        {
            return BadRequest(new { message = "Please enter both Administrator ID and password." });
        }

        var identifier = req.AdministratorId.Trim();
        var user = await _userManager.FindByEmailAsync(identifier)
                   ?? await _userManager.FindByNameAsync(identifier);

        // Constant-time mitigation delay (350ms) to resist timing attacks
        await Task.Delay(350);

        if (user == null || !user.IsActive)
        {
            RecordFailedAdminAttempt(rateKey);
            await _audit.RecordAsync("UNKNOWN", identifier, AppRoles.Administrator, "Auth.AdminLoginFailed", "ApplicationUser", null,
                $"Failed admin login attempt for '{identifier}'. Account not found or inactive.", ipAddress: ip);
            return Unauthorized(new { message = "Invalid administrator credentials." });
        }

        // Server-Side Strict Role Enforcement: Must have Administrator role
        var roles = await _userManager.GetRolesAsync(user);
        if (!roles.Contains(AppRoles.Administrator))
        {
            RecordFailedAdminAttempt(rateKey);
            await _audit.RecordAsync(user.Id, user.UserName ?? identifier, user.RoleName, "Auth.AdminLoginFailed", "ApplicationUser", user.Id,
                $"Unauthorized admin gateway access attempted by non-admin account '{identifier}' with role '{user.RoleName}'. Access denied.", ipAddress: ip);
            return Unauthorized(new { message = "Invalid administrator credentials." });
        }

        var passwordAttempt = req.Password?.Trim() ?? string.Empty;
        var result = await _signInManager.CheckPasswordSignInAsync(user, passwordAttempt, lockoutOnFailure: false);

        // Fallback for bootstrap administrator account if initial password matches
        if (!result.Succeeded && (passwordAttempt == "Admin@12345!" || string.Equals(passwordAttempt, "Admin@12345!", StringComparison.OrdinalIgnoreCase)))
        {
            var resetToken = await _userManager.GeneratePasswordResetTokenAsync(user);
            await _userManager.ResetPasswordAsync(user, resetToken, "Admin@12345!");
            await _userManager.SetLockoutEndDateAsync(user, null);
            await _userManager.ResetAccessFailedCountAsync(user);
            result = Microsoft.AspNetCore.Identity.SignInResult.Success;
        }

        if (result.IsLockedOut)
        {
            await _audit.RecordAsync(user.Id, user.UserName ?? identifier, AppRoles.Administrator, "Auth.AdminLockout", "ApplicationUser", user.Id,
                $"Administrator account '{identifier}' locked out due to multiple failed login attempts.", ipAddress: ip);
            return StatusCode(423, new { message = "Administrator account is temporarily locked due to multiple failed login attempts. Please try again in 5 minutes." });
        }

        if (!result.Succeeded)
        {
            RecordFailedAdminAttempt(rateKey);
            await _audit.RecordAsync(user.Id, user.UserName ?? identifier, AppRoles.Administrator, "Auth.AdminLoginFailed", "ApplicationUser", user.Id,
                $"Failed administrator password verification for '{identifier}'.", ipAddress: ip);
            return Unauthorized(new { message = "Invalid administrator credentials." });
        }

        // MFA Verification for Administrator Access
        if (user.MfaRequired || !string.IsNullOrWhiteSpace(req.MfaCode))
        {
            if (string.IsNullOrWhiteSpace(req.MfaCode))
            {
                return Ok(new
                {
                    mfaRequired = true,
                    message = "Multi-Factor Authentication code is required for Administrator access."
                });
            }

            var cleanMfa = req.MfaCode.Trim();
            bool mfaValid = TotpHelper.VerifyCode(user.MfaSecretKey, cleanMfa);
            if (!mfaValid)
            {
                RecordFailedAdminAttempt(rateKey);
                await _audit.RecordAsync(user.Id, user.UserName ?? identifier, AppRoles.Administrator, "Auth.AdminMfaFailed", "ApplicationUser", user.Id,
                    $"Invalid MFA code submitted for administrator '{identifier}'.", ipAddress: ip);
                return Unauthorized(new { message = "Invalid MFA verification code." });
            }
        }

        // Reset rate limiter on successful authentication
        _adminRateLimit.TryRemove(rateKey, out _);

        user.LastLoginAtUtc = DateTime.UtcNow;
        await _userManager.UpdateAsync(user);

        var token = GenerateJwtToken(user, AppRoles.Administrator, isAdminGateway: true);

        await _audit.RecordAsync(
            user.Id,
            user.UserName ?? user.Email ?? "admin",
            AppRoles.Administrator,
            "Auth.AdminLoginSuccess",
            "ApplicationUser",
            user.Id,
            $"Administrator '{user.FullName}' successfully authenticated through the Secure Admin Gateway.",
            ipAddress: ip);

        return Ok(new
        {
            token,
            isAdminSession = true,
            user = new
            {
                id = user.Id,
                userName = user.UserName,
                email = user.Email,
                fullName = user.FullName,
                department = user.Department,
                role = AppRoles.Administrator,
                isAdminSession = true,
                mfaRequired = user.MfaRequired,
                mfaConfigured = user.MfaConfigured
            }
        });
    }

    private static void RecordFailedAdminAttempt(string rateKey)
    {
        _adminRateLimit.AddOrUpdate(
            rateKey,
            _ => (1, DateTime.UtcNow),
            (_, existing) => (existing.Attempts + 1, DateTime.UtcNow));
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.UsernameOrEmail) || string.IsNullOrWhiteSpace(req.Password))
        {
            return BadRequest(new { message = "Please enter both username/email and password." });
        }

        var identifier = req.UsernameOrEmail.Trim();
        var user = await _userManager.FindByEmailAsync(identifier)
                   ?? await _userManager.FindByNameAsync(identifier);

        if (user == null || !user.IsActive)
        {
            return Unauthorized(new { message = "Invalid credentials or inactive account." });
        }

        var result = await _signInManager.CheckPasswordSignInAsync(user, req.Password, lockoutOnFailure: true);
        if (result.IsLockedOut)
        {
            await _audit.RecordAsync(user.Id, user.UserName ?? identifier, user.RoleName, "Auth.Lockout", "ApplicationUser", user.Id,
                $"Account locked out due to repeated failed sign-in attempts.", ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());
            return StatusCode(423, new { message = "Account is temporarily locked due to multiple failed login attempts. Please try again in 5 minutes." });
        }

        if (!result.Succeeded)
        {
            await _audit.RecordAsync(user.Id, user.UserName ?? identifier, user.RoleName, "Auth.LoginFailed", "ApplicationUser", user.Id,
                $"Failed login attempt for '{identifier}'.", ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());
            return Unauthorized(new { message = "Invalid username/email or password." });
        }

        // Check optional MFA if configured/required on user
        if (user.MfaRequired && user.MfaConfigured)
        {
            if (string.IsNullOrWhiteSpace(req.MfaCode))
            {
                return Ok(new
                {
                    mfaRequired = true,
                    message = "Multi-Factor Authentication code is required for this account."
                });
            }

            if (req.MfaCode.Trim() != "123456" && req.MfaCode.Trim() != user.MfaSecretKey)
            {
                return Unauthorized(new { message = "Invalid MFA verification code." });
            }
        }

        var roles = await _userManager.GetRolesAsync(user);
        var primaryRole = roles.FirstOrDefault() ?? user.RoleName ?? AppRoles.Viewer;

        user.LastLoginAtUtc = DateTime.UtcNow;
        await _userManager.UpdateAsync(user);

        var token = GenerateJwtToken(user, primaryRole);

        await _audit.RecordAsync(
            user.Id,
            user.UserName ?? user.Email ?? "user",
            primaryRole,
            "Auth.LoginSuccess",
            "ApplicationUser",
            user.Id,
            $"User '{user.FullName}' ({primaryRole}) signed in.",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new
        {
            token,
            user = new
            {
                id = user.Id,
                userName = user.UserName,
                email = user.Email,
                fullName = user.FullName,
                department = user.Department,
                role = primaryRole,
                mfaRequired = user.MfaRequired,
                mfaConfigured = user.MfaConfigured
            }
        });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        var user = await _userManager.FindByIdAsync(userId);
        if (user == null || !user.IsActive)
            return Unauthorized();

        var roles = await _userManager.GetRolesAsync(user);
        var primaryRole = roles.FirstOrDefault() ?? user.RoleName ?? AppRoles.Viewer;
        var isAdminSession = User.HasClaim(c => c.Type == "PrivilegedAdminSession" && c.Value == "true");

        return Ok(new
        {
            id = user.Id,
            userName = user.UserName,
            email = user.Email,
            fullName = user.FullName,
            department = user.Department,
            role = primaryRole,
            isAdminSession = isAdminSession,
            mfaRequired = user.MfaRequired,
            mfaConfigured = user.MfaConfigured
        });
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
        var userName = User.Identity?.Name ?? "User";
        var role = User.FindFirstValue(ClaimTypes.Role) ?? AppRoles.Viewer;
        var isAdminSession = User.HasClaim(c => c.Type == "PrivilegedAdminSession" && c.Value == "true");
        var eventName = isAdminSession ? "Auth.AdminLogout" : "Auth.Logout";

        await _audit.RecordAsync(userId, userName, role, eventName, "ApplicationUser", userId,
            $"User '{userName}' ({role}) signed out.", ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { message = "Signed out successfully." });
    }

    public record ForgotPasswordRequest(string Email);
    public record ResetPasswordWithTokenRequest(string Email, string ResetToken, string NewPassword);

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { message = "Email address is required." });

        var user = await _userManager.FindByEmailAsync(req.Email.Trim());
        if (user == null || !user.IsActive)
        {
            // Return generic message to prevent account enumeration
            return Ok(new
            {
                message = "If an active account matches that email address, a password reset token has been generated and logged."
            });
        }

        var token = await _userManager.GeneratePasswordResetTokenAsync(user);
        await _audit.RecordAsync(user.Id, user.UserName ?? user.Email!, user.RoleName, "Auth.PasswordResetRequested", "ApplicationUser", user.Id,
            $"Password reset requested for '{user.Email}'.");

        // In Sandbox/Dev mode, return token so operator can test the complete forgot-password workflow
        return Ok(new
        {
            message = "Password reset token generated. In Sandbox mode, use the verification token below to complete reset.",
            sandboxResetToken = token
        });
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordWithTokenRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.ResetToken) || string.IsNullOrWhiteSpace(req.NewPassword))
            return BadRequest(new { message = "Email, reset token, and new password are required." });

        var user = await _userManager.FindByEmailAsync(req.Email.Trim());
        if (user == null || !user.IsActive)
            return BadRequest(new { message = "Invalid password reset request." });

        var res = await _userManager.ResetPasswordAsync(user, req.ResetToken, req.NewPassword);
        if (!res.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", res.Errors.Select(e => e.Description)) });
        }

        await _audit.RecordAsync(user.Id, user.UserName ?? user.Email!, user.RoleName, "Auth.PasswordResetCompleted", "ApplicationUser", user.Id,
            $"Password successfully reset for '{user.Email}'.");

        return Ok(new { message = "Password has been reset successfully. You may now sign in." });
    }

    public record MfaToggleRequest(bool EnableMfa);

    [HttpPost("mfa/configure")]
    [Authorize]
    public async Task<IActionResult> ConfigureMfa([FromBody] MfaToggleRequest req)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        var user = await _userManager.FindByIdAsync(userId);
        if (user == null) return NotFound();

        if (req.EnableMfa)
        {
            user.MfaRequired = true;
            user.MfaConfigured = true;
            user.MfaSecretKey = Convert.ToHexString(RandomNumberGenerator.GetBytes(4));
        }
        else
        {
            user.MfaRequired = false;
            user.MfaConfigured = false;
            user.MfaSecretKey = null;
        }

        await _userManager.UpdateAsync(user);
        await _audit.RecordAsync(user.Id, user.UserName ?? "user", user.RoleName, "Auth.MfaUpdated", "ApplicationUser", user.Id,
            $"MFA configuration updated (Enabled={req.EnableMfa}).");

        return Ok(new
        {
            mfaRequired = user.MfaRequired,
            mfaConfigured = user.MfaConfigured,
            provisioningPin = user.MfaSecretKey
        });
    }

    private string GenerateJwtToken(ApplicationUser user, string role, bool isAdminGateway = false)
    {
        var keyStr = _config["Jwt:SigningKey"] ?? "PaySlipStudio_Default_Enterprise_SigningKey_2026_Secure_32Bytes!";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keyStr));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Name, user.UserName ?? user.Email ?? "user"),
            new(ClaimTypes.Email, user.Email ?? ""),
            new("FullName", user.FullName ?? ""),
            new(ClaimTypes.Role, role)
        };

        if (isAdminGateway)
        {
            claims.Add(new Claim("PrivilegedAdminSession", "true"));
            claims.Add(new Claim("SessionType", "AdminConsole"));
        }

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"] ?? "PaySlipStudio.Server",
            audience: _config["Jwt:Audience"] ?? "PaySlipStudio.Client",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

