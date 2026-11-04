using System.Diagnostics;
using System.Net.Sockets;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;
using PaySlipStudio.Api.Services;

var appBaseDir = AppContext.BaseDirectory;
var candidateWwwroot = Path.Combine(appBaseDir, "wwwroot");

var webAppOptions = new WebApplicationOptions
{
    Args = args,
    ContentRootPath = appBaseDir,
    WebRootPath = Directory.Exists(candidateWwwroot) ? candidateWwwroot : null
};
var builder = WebApplication.CreateBuilder(webAppOptions);

// Dynamic port configuration from FINORA_PORT or --urls
var envPort = Environment.GetEnvironmentVariable("FINORA_PORT");
if (!string.IsNullOrEmpty(envPort) && int.TryParse(envPort, out var customPort))
{
    builder.WebHost.UseUrls($"http://127.0.0.1:{customPort}");
}

// Desktop Mode Detection & Application Data Storage Directory Resolution
bool isDesktopMode = string.Equals(Environment.GetEnvironmentVariable("FINORA_DESKTOP_MODE"), "true", StringComparison.OrdinalIgnoreCase)
    || args.Contains("--desktop")
    || string.Equals(builder.Configuration["FINORA_DESKTOP_MODE"], "true", StringComparison.OrdinalIgnoreCase);

string baseDataDir = Environment.GetEnvironmentVariable("FINORA_DATA_DIR")
    ?? (isDesktopMode
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FINORA")
        : AppContext.BaseDirectory);

// Standard FINORA Data Storage Structure
var dataDir = Path.Combine(baseDataDir, "Data");
var payslipsDir = Path.Combine(baseDataDir, "Documents", "Payslips");
var reportsDir = Path.Combine(baseDataDir, "Documents", "Reports");
var importsDir = Path.Combine(baseDataDir, "Imports");
var templatesDir = Path.Combine(baseDataDir, "Templates");
var backupsDir = Path.Combine(baseDataDir, "Backups");
var logsDir = Path.Combine(baseDataDir, "Logs");

foreach (var dir in new[] { dataDir, payslipsDir, reportsDir, importsDir, templatesDir, backupsDir, logsDir })
{
    Directory.CreateDirectory(dir);
}

// Redirect storage root to the persistent user data directory
builder.Configuration["Storage:RootPath"] = Path.Combine(baseDataDir, "Documents");
builder.Configuration["FINORA_BASE_DATA_DIR"] = baseDataDir;

var configuredProvider = builder.Configuration["Database:Provider"] ?? "PostgreSql";
var effectiveProvider = isDesktopMode ? "Sqlite" : configuredProvider;

if (string.Equals(effectiveProvider, "PostgreSql", StringComparison.OrdinalIgnoreCase))
{
    EnsureLocalPostgresRunning();
}

builder.Services.AddDbContext<ApplicationDbContext>(options =>
{
    if (string.Equals(effectiveProvider, "Sqlite", StringComparison.OrdinalIgnoreCase))
    {
        var sqliteDbPath = Path.Combine(dataDir, "finora.db");
        options.UseSqlite($"Data Source={sqliteDbPath}");
    }
    else
    {
        var connStr = builder.Configuration.GetConnectionString("DefaultConnection")
                      ?? "Host=127.0.0.1;Port=5432;Database=payslip_studio;Username=postgres";
        options.UseNpgsql(connStr);
    }
});

builder.Services
    .AddIdentity<ApplicationUser, IdentityRole>(options =>
    {
        options.Password.RequireDigit = true;
        options.Password.RequiredLength = 8;
        options.Password.RequireNonAlphanumeric = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireLowercase = true;

        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.AllowedForNewUsers = true;

        options.User.RequireUniqueEmail = true;
    })
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddDefaultTokenProviders();

var jwtKey = builder.Configuration["Jwt:SigningKey"] ?? "PaySlipStudio_Default_Enterprise_SigningKey_2026_Secure_32Bytes!";
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "PaySlipStudio.Server",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "PaySlipStudio.Client",
            IssuerSigningKey = signingKey,
            ClockSkew = TimeSpan.FromMinutes(1)
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddHttpClient();

builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<PayslipDocumentResolver>();
builder.Services.AddScoped<ExcelPayrollService>();
builder.Services.AddScoped<PdfRenderingService>();
builder.Services.AddScoped<EmailDeliveryService>();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy
            .SetIsOriginAllowed(origin =>
            {
                if (string.IsNullOrEmpty(origin)) return true;
                if (origin.StartsWith("http://localhost:") || origin.StartsWith("http://127.0.0.1:")) return true;
                if (origin.StartsWith("file://") || origin.StartsWith("app://") || origin.StartsWith("devtools://")) return true;
                return false;
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

// Security headers middleware
app.Use(async (context, next) =>
{
    context.Response.Headers.TryAdd("X-Content-Type-Options", "nosniff");
    context.Response.Headers.TryAdd("X-Frame-Options", "SAMEORIGIN");
    context.Response.Headers.TryAdd("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
});

app.UseCors("FrontendPolicy");
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapFallbackToFile("index.html");

await DatabaseInitializer.InitializeAsync(app.Services);

app.Run();

static void EnsureLocalPostgresRunning()
{
    try
    {
        using var tcp = new TcpClient();
        var connectTask = tcp.ConnectAsync("127.0.0.1", 5432);
        if (connectTask.Wait(TimeSpan.FromMilliseconds(500)) && tcp.Connected)
        {
            return;
        }
    }
    catch
    {
        // Not listening on 5432 yet
    }

    try
    {
        var pgCtl = @"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe";
        var pgData = @"G:\UAV\PAY SLIP\.pgdata";
        if (File.Exists(pgCtl) && Directory.Exists(pgData))
        {
            var psi = new ProcessStartInfo
            {
                FileName = pgCtl,
                Arguments = $"-D \"{pgData}\" -l \"G:\\UAV\\PAY SLIP\\postgres.log\" -o \"-p 5432\" start",
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi);
            proc?.WaitForExit(5000);
        }
    }
    catch
    {
        // Ignore if managed externally
    }
}

public partial class Program { }
