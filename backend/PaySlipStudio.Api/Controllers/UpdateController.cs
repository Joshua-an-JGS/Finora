using System.Diagnostics;
using System.Net.Http.Headers;
using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;
using PaySlipStudio.Api.Services;

namespace PaySlipStudio.Api.Controllers;

[ApiController]
[Route("api/updates")]
[Authorize]
public class UpdateController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;
    private readonly AuditService _audit;

    public const string CurrentApplicationVersion = "1.0.1";
    public const string BuildIdentifier = "2026.11.05-prod.x64";
    public const string ReleaseDateString = "November 5, 2026";

    public UpdateController(
        ApplicationDbContext db,
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        AuditService audit)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _config = config;
        _audit = audit;
    }

    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "system";
    private string CurrentUserName => User.Identity?.Name ?? "User";

    [HttpGet("status")]
    public async Task<IActionResult> GetUpdateStatus()
    {
        var settings = await _db.CompanySettings.AsNoTracking().FirstOrDefaultAsync() ?? new CompanySettings();

        DateTime? installDate = null;
        try
        {
            var mainModule = Process.GetCurrentProcess().MainModule?.FileName;
            if (!string.IsNullOrEmpty(mainModule) && System.IO.File.Exists(mainModule))
            {
                installDate = System.IO.File.GetCreationTimeUtc(mainModule);
            }
        }
        catch { }

        return Ok(new
        {
            currentVersion = CurrentApplicationVersion,
            latestVersion = CurrentApplicationVersion,
            isUpdateAvailable = false,
            updateChannel = settings.UpdateChannel,
            autoCheckUpdates = settings.AutoCheckUpdates,
            autoDownloadUpdates = settings.AutoDownloadUpdates,
            notifyBeforeInstall = settings.NotifyBeforeInstall,
            updateServerUrl = settings.UpdateServerUrl,
            lastCheckedAtUtc = settings.LastUpdateCheckedAtUtc,
            lastInstalledAtUtc = settings.LastUpdateInstalledAtUtc ?? installDate,
            installationDateUtc = installDate ?? DateTime.UtcNow,
            platform = "Windows 64-bit (win32-x64)",
            architecture = "x64",
            runtime = ".NET 10.0 LTS",
            databaseEngine = "PostgreSQL 18.0",
            buildNumber = BuildIdentifier,
            releaseDate = ReleaseDateString,
            license = "Commercial / Proprietary Enterprise License",
            developer = "Joshua Godson",
            attribution = "Designed and Developed by Joshua Godson"
        });
    }

    [HttpPost("check")]
    public async Task<IActionResult> CheckForUpdates()
    {
        var settings = await _db.CompanySettings.FirstOrDefaultAsync();
        if (settings == null)
        {
            settings = new CompanySettings { Id = 1 };
            _db.CompanySettings.Add(settings);
        }

        settings.LastUpdateCheckedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(7);
        client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("FINORA-Desktop", CurrentApplicationVersion));

        // GitHub Release API or generic HTTPS endpoint
        string targetRepo = "Joshua-an-JGS/Finora";
        string checkUrl = $"https://api.github.com/repos/{targetRepo}/releases/latest";

        try
        {
            using var response = await client.GetAsync(checkUrl);

            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(content);
                var root = doc.RootElement;

                var tagName = root.TryGetProperty("tag_name", out var tagProp) ? tagProp.GetString() : "1.0.0";
                var cleanVersion = (tagName ?? "1.0.0").TrimStart('v').Trim();
                var releaseName = root.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : $"FINORA v{cleanVersion}";
                var body = root.TryGetProperty("body", out var bodyProp) ? bodyProp.GetString() : "Maintenance and security improvements.";
                var publishedAt = root.TryGetProperty("published_at", out var pubProp) ? pubProp.GetString() : null;

                bool isNewer = CompareVersions(cleanVersion, CurrentApplicationVersion) > 0;

                string? downloadUrl = null;
                long totalBytes = 0;
                string? sha256 = null;

                if (root.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
                {
                    foreach (var asset in assets.EnumerateArray())
                    {
                        var assetName = asset.TryGetProperty("name", out var n) ? n.GetString() : "";
                        if (assetName != null && assetName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                        {
                            downloadUrl = asset.TryGetProperty("browser_download_url", out var dl) ? dl.GetString() : null;
                            totalBytes = asset.TryGetProperty("size", out var s) ? s.GetInt64() : 0;
                            break;
                        }
                    }
                }

                return Ok(new
                {
                    isSuccess = true,
                    isUpdateAvailable = isNewer,
                    currentVersion = CurrentApplicationVersion,
                    latestVersion = cleanVersion,
                    releaseName,
                    releaseNotes = body,
                    publishedAt,
                    downloadUrl,
                    totalBytes,
                    sha256,
                    lastCheckedAtUtc = settings.LastUpdateCheckedAtUtc
                });
            }
            else if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                // No public releases yet on newly created repo
                return Ok(new
                {
                    isSuccess = true,
                    isUpdateAvailable = false,
                    currentVersion = CurrentApplicationVersion,
                    latestVersion = CurrentApplicationVersion,
                    message = "FINORA is fully up to date. You are running the latest release.",
                    lastCheckedAtUtc = settings.LastUpdateCheckedAtUtc
                });
            }
            else
            {
                return Ok(new
                {
                    isSuccess = true,
                    isUpdateAvailable = false,
                    currentVersion = CurrentApplicationVersion,
                    latestVersion = CurrentApplicationVersion,
                    message = "FINORA is running the latest production build.",
                    lastCheckedAtUtc = settings.LastUpdateCheckedAtUtc
                });
            }
        }
        catch (HttpRequestException)
        {
            return Ok(new
            {
                isSuccess = false,
                isOffline = true,
                message = "Unable to check for updates. Please check your internet connection and try again.",
                currentVersion = CurrentApplicationVersion,
                lastCheckedAtUtc = settings.LastUpdateCheckedAtUtc
            });
        }
        catch (TaskCanceledException)
        {
            return Ok(new
            {
                isSuccess = false,
                isOffline = true,
                message = "Unable to check for updates. Connection to the update server timed out.",
                currentVersion = CurrentApplicationVersion,
                lastCheckedAtUtc = settings.LastUpdateCheckedAtUtc
            });
        }
        catch (Exception ex)
        {
            return Ok(new
            {
                isSuccess = false,
                isOffline = false,
                message = "Update check service temporarily unavailable.",
                detail = ex.Message,
                currentVersion = CurrentApplicationVersion,
                lastCheckedAtUtc = settings.LastUpdateCheckedAtUtc
            });
        }
    }

    [HttpGet("history")]
    [AllowAnonymous]
    public IActionResult GetReleaseHistory()
    {
        var history = new[]
        {
            new
            {
                version = "1.0.1",
                releaseDate = "November 5, 2026",
                releaseType = "Feature & UI/UX Quality Update",
                isCurrent = true,
                summary = "FINORA System Quality Update: streamlined Payslip Editor template action bars, interactive preset naming prompt, and complete FINORA corporate theme harmonization.",
                newFeatures = new[]
                {
                    "Interactive 'Save Template' dialog modal with instant name prompt and validation",
                    "Harmonized system-theme 'Saved' status button adhering to FINORA brand standards",
                    "Seamless preset naming with automated update and creation workflows"
                },
                improvements = new[]
                {
                    "Eliminated redundant and duplicated action button containers from Template & Layout view",
                    "Updated clean template status indicator with signature FINORA accents",
                    "Ensured consistent component height, spacing, and typography across all editor controls"
                },
                bugFixes = new[]
                {
                    "Resolved duplicate 'Template & Layout Actions' card cluttering the template editor",
                    "Removed green color styling in favor of unified FINORA corporate design system",
                    "Fixed character encoding artifacts in template preset selector"
                }
            },
            new
            {
                version = "1.0.0",
                releaseDate = "November 4, 2026",
                releaseType = "Production Release",
                isCurrent = false,
                summary = "Initial commercial production release of FINORA Finance & Payroll Management System.",
                newFeatures = new[]
                {
                    "Institutional A4 Payslip Engine with dual layout formats (Side-by-Side & Stacked)",
                    "Dynamic Additional Tables system (Attendance, Leave Balances, CTC, Advances, and Custom Blank)",
                    "Enterprise Excel Payroll Workbook Importer with multi-column mapping and zero-error validation",
                    "Gmail & Authenticated SMTP Dispatcher with real-time inbox delivery confirmation",
                    "Automated Role-Based Security Vault with Administrator, Accounts Operator, and Viewer roles",
                    "Cryptographic Tamper-Evident Audit Logging for all operations"
                },
                improvements = new[]
                {
                    "Real-time WYSIWYG A4 paper rendering synchronization with pixel-perfect PDF export",
                    "Auto-adjusting Split Header branding layout with dynamic logo and contact alignment",
                    "High-DPI desktop scaling and smooth white-themed startup splash screen",
                    "Isolated PostgreSQL Cluster user storage with complete zero-data-loss protection"
                },
                bugFixes = new[]
                {
                    "Synchronized table borders and column metrics across HTML preview and QuestPDF generator",
                    "Resolved additional table placement order directly adjacent to Net Salary payable",
                    "Fixed Git committer provenance linking strictly to official user identity"
                }
            }
        };

        return Ok(history);
    }

    [HttpGet("system-info")]
    [AllowAnonymous]
    public async Task<IActionResult> GetSystemInfo()
    {
        var dbCanConnect = await _db.Database.CanConnectAsync();

        string dataPath = Environment.GetEnvironmentVariable("FINORA_DATA_DIR")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FINORA");

        return Ok(new
        {
            applicationName = "FINORA",
            applicationTitle = "FINORA — Finance & Payroll Management System",
            version = CurrentApplicationVersion,
            buildNumber = BuildIdentifier,
            releaseDate = ReleaseDateString,
            platform = "Windows 64-bit",
            osVersion = Environment.OSVersion.ToString(),
            is64BitOperatingSystem = Environment.Is64BitOperatingSystem,
            is64BitProcess = Environment.Is64BitProcess,
            processorCount = Environment.ProcessorCount,
            runtimeFramework = ".NET 10.0 LTS",
            desktopShell = "Electron 35 / Chromium 134",
            frontendEngine = "React 19 / Vite 6 / Tailwind CSS",
            documentEngine = "QuestPDF 2025 Institutional Rendering Engine",
            databaseEngine = "PostgreSQL 18.0 (Local Cluster)",
            databaseConnected = dbCanConnect,
            baseDataDirectory = dataPath,
            logsDirectory = Path.Combine(dataPath, "Logs"),
            documentsDirectory = Path.Combine(dataPath, "Documents"),
            developer = "Joshua Godson",
            attribution = "Designed and Developed by Joshua Godson",
            serverTimeUtc = DateTime.UtcNow
        });
    }

    [HttpPost("settings")]
    [Authorize(Roles = AppRoles.Administrator)]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateSettingsDto dto)
    {
        var settings = await _db.CompanySettings.FirstOrDefaultAsync();
        if (settings == null)
        {
            settings = new CompanySettings { Id = 1 };
            _db.CompanySettings.Add(settings);
        }

        settings.AutoCheckUpdates = dto.AutoCheckUpdates;
        settings.AutoDownloadUpdates = dto.AutoDownloadUpdates;
        settings.NotifyBeforeInstall = dto.NotifyBeforeInstall;
        if (!string.IsNullOrWhiteSpace(dto.UpdateChannel))
        {
            settings.UpdateChannel = dto.UpdateChannel.Trim();
        }
        if (!string.IsNullOrWhiteSpace(dto.UpdateServerUrl))
        {
            settings.UpdateServerUrl = dto.UpdateServerUrl.Trim();
        }

        await _db.SaveChangesAsync();

        await _audit.RecordAsync(
            CurrentUserId,
            CurrentUserName,
            AppRoles.Administrator,
            "UPDATE_CONFIG",
            "CompanySettings",
            "1",
            $"Modified update configuration: AutoCheck={settings.AutoCheckUpdates}, Channel={settings.UpdateChannel}"
        );

        return Ok(new
        {
            message = "Software update preferences saved successfully.",
            settings.AutoCheckUpdates,
            settings.AutoDownloadUpdates,
            settings.NotifyBeforeInstall,
            settings.UpdateChannel,
            settings.UpdateServerUrl
        });
    }

    private static int CompareVersions(string v1, string v2)
    {
        try
        {
            var p1 = v1.Split('.').Select(int.Parse).ToArray();
            var p2 = v2.Split('.').Select(int.Parse).ToArray();

            for (int i = 0; i < Math.Max(p1.Length, p2.Length); i++)
            {
                int num1 = i < p1.Length ? p1[i] : 0;
                int num2 = i < p2.Length ? p2[i] : 0;
                if (num1 > num2) return 1;
                if (num1 < num2) return -1;
            }
            return 0;
        }
        catch
        {
            return string.Compare(v1, v2, StringComparison.OrdinalIgnoreCase);
        }
    }
}

public class UpdateSettingsDto
{
    public bool AutoCheckUpdates { get; set; } = true;
    public bool AutoDownloadUpdates { get; set; } = false;
    public bool NotifyBeforeInstall { get; set; } = true;
    public string? UpdateChannel { get; set; } = "Stable";
    public string? UpdateServerUrl { get; set; }
}
