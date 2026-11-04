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
[Route("api")]
[Authorize]
public class TemplatesAndEmailController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly PayslipDocumentResolver _resolver;
    private readonly EmailDeliveryService _emailService;
    private readonly AuditService _audit;

    public TemplatesAndEmailController(
        ApplicationDbContext db,
        PayslipDocumentResolver resolver,
        EmailDeliveryService emailService,
        AuditService audit)
    {
        _db = db;
        _resolver = resolver;
        _emailService = emailService;
        _audit = audit;
    }

    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "system";
    private string CurrentUserName => User.Identity?.Name ?? "Operator";
    private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role) ?? AppRoles.Viewer;

    // ========================================================================
    // PAYSLIP TEMPLATES (Section 12)
    // ========================================================================
    [HttpGet("templates/payslip")]
    public async Task<IActionResult> GetPayslipTemplates([FromQuery] bool includeArchived = false)
    {
        var query = _db.PayslipTemplates.AsNoTracking().AsQueryable();
        if (!includeArchived)
        {
            query = query.Where(t => !t.IsArchived);
        }

        var list = await query
            .OrderByDescending(t => t.IsDefault)
            .ThenBy(t => t.Name)
            .ToListAsync();

        var mapped = list.Select(t => new
        {
            id = t.Id,
            name = t.Name,
            description = t.Description,
            isDefault = t.IsDefault,
            isArchived = t.IsArchived,
            isSystemBuiltin = t.IsSystemBuiltin,
            version = t.Version,
            config = JsonSerializer.Deserialize<PayslipTemplateConfig>(t.ConfigJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new PayslipTemplateConfig(),
            updatedAtUtc = t.UpdatedAtUtc
        });

        return Ok(mapped);
    }

    public class UpsertPayslipTemplateRequest
    {
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public PayslipTemplateConfig Config { get; set; } = new();
    }

    [HttpPost("templates/payslip")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> CreatePayslipTemplate([FromBody] UpsertPayslipTemplateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { message = "Template name is required." });

        var cfgJson = JsonSerializer.Serialize(req.Config ?? new PayslipTemplateConfig());
        var tpl = new PayslipTemplate
        {
            Name = req.Name.Trim(),
            Description = req.Description.Trim(),
            IsDefault = false,
            IsArchived = false,
            IsSystemBuiltin = false,
            Version = 1,
            ConfigJson = cfgJson,
            InitialConfigJson = cfgJson,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _db.PayslipTemplates.Add(tpl);
        await _db.SaveChangesAsync();

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "Template.Created", "PayslipTemplate", tpl.Id.ToString(),
            $"Created payslip template '{tpl.Name}'.");

        return Ok(new { id = tpl.Id, name = tpl.Name, version = tpl.Version });
    }

    [HttpPut("templates/payslip/{id:guid}")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> UpdatePayslipTemplate(Guid id, [FromBody] UpsertPayslipTemplateRequest req)
    {
        var tpl = await _db.PayslipTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (tpl == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(req.Name))
            tpl.Name = req.Name.Trim();
        tpl.Description = req.Description?.Trim() ?? tpl.Description;
        tpl.ConfigJson = JsonSerializer.Serialize(req.Config ?? new PayslipTemplateConfig());
        tpl.Version += 1;
        tpl.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "Template.Updated", "PayslipTemplate", tpl.Id.ToString(),
            $"Updated payslip template '{tpl.Name}' to v{tpl.Version}.");

        return Ok(new { id = tpl.Id, name = tpl.Name, version = tpl.Version });
    }

    [HttpPost("templates/payslip/{id:guid}/duplicate")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> DuplicatePayslipTemplate(Guid id)
    {
        var src = await _db.PayslipTemplates.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        if (src == null) return NotFound();

        var copy = new PayslipTemplate
        {
            Name = $"{src.Name} (Copy)",
            Description = src.Description,
            IsDefault = false,
            IsArchived = false,
            IsSystemBuiltin = false,
            Version = 1,
            ConfigJson = src.ConfigJson,
            InitialConfigJson = src.ConfigJson,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _db.PayslipTemplates.Add(copy);
        await _db.SaveChangesAsync();

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "Template.Duplicated", "PayslipTemplate", copy.Id.ToString(),
            $"Duplicated template '{src.Name}' as '{copy.Name}'.");

        return Ok(new { id = copy.Id, name = copy.Name });
    }

    [HttpPost("templates/payslip/{id:guid}/set-default")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> SetDefaultPayslipTemplate(Guid id)
    {
        var all = await _db.PayslipTemplates.ToListAsync();
        var target = all.FirstOrDefault(t => t.Id == id);
        if (target == null) return NotFound();

        foreach (var t in all)
        {
            t.IsDefault = (t.Id == id);
        }
        target.IsArchived = false;
        target.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "Template.SetDefault", "PayslipTemplate", target.Id.ToString(),
            $"Set '{target.Name}' as the default payslip template.");

        return Ok(new { id = target.Id, name = target.Name, isDefault = true });
    }

    [HttpPost("templates/payslip/{id:guid}/reset")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> ResetPayslipTemplate(Guid id)
    {
        var tpl = await _db.PayslipTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (tpl == null) return NotFound();

        tpl.ConfigJson = !string.IsNullOrWhiteSpace(tpl.InitialConfigJson)
            ? tpl.InitialConfigJson
            : JsonSerializer.Serialize(new PayslipTemplateConfig());
        tpl.Version += 1;
        tpl.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "Template.Reset", "PayslipTemplate", tpl.Id.ToString(),
            $"Reset template '{tpl.Name}' to its original factory configuration.");

        return Ok(new { id = tpl.Id, name = tpl.Name, version = tpl.Version });
    }

    public record ArchiveTemplateRequest(bool IsArchived);

    [HttpPost("templates/payslip/{id:guid}/archive")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> ArchivePayslipTemplate(Guid id, [FromBody] ArchiveTemplateRequest req)
    {
        var tpl = await _db.PayslipTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (tpl == null) return NotFound();

        if (tpl.IsDefault && req.IsArchived)
        {
            return BadRequest(new { message = "Cannot archive the active default template. Set another template as default first." });
        }

        tpl.IsArchived = req.IsArchived;
        tpl.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            req.IsArchived ? "Template.Archived" : "Template.Restored",
            "PayslipTemplate", tpl.Id.ToString(),
            $"{(req.IsArchived ? "Archived" : "Restored")} template '{tpl.Name}'.");

        return Ok(new { id = tpl.Id, isArchived = tpl.IsArchived });
    }

    // ========================================================================
    // EMAIL TEMPLATES & INDIVIDUAL PDF DELIVERY (Section 14 & 16)
    // ========================================================================
    [HttpGet("templates/email")]
    public async Task<IActionResult> GetEmailTemplates()
    {
        var list = await _db.EmailTemplates
            .AsNoTracking()
            .OrderByDescending(t => t.IsDefault)
            .ThenBy(t => t.Name)
            .ToListAsync();
        return Ok(list);
    }

    public class UpsertEmailTemplateRequest
    {
        public string Name { get; set; } = string.Empty;
        public string SubjectTemplate { get; set; } = string.Empty;
        public string BodyTemplate { get; set; } = string.Empty;
        public bool IsDefault { get; set; }
    }

    [HttpPost("templates/email")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> CreateEmailTemplate([FromBody] UpsertEmailTemplateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.SubjectTemplate))
            return BadRequest(new { message = "Name and subject template are required." });

        if (req.IsDefault)
        {
            var existing = await _db.EmailTemplates.Where(e => e.IsDefault).ToListAsync();
            foreach (var e in existing) e.IsDefault = false;
        }

        var tpl = new EmailTemplate
        {
            Name = req.Name.Trim(),
            SubjectTemplate = req.SubjectTemplate,
            BodyTemplate = req.BodyTemplate,
            IsDefault = req.IsDefault,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _db.EmailTemplates.Add(tpl);
        await _db.SaveChangesAsync();

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "EmailTemplate.Created", "EmailTemplate", tpl.Id.ToString(),
            $"Created email template '{tpl.Name}'.");

        return Ok(tpl);
    }

    [HttpPut("templates/email/{id:guid}")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> UpdateEmailTemplate(Guid id, [FromBody] UpsertEmailTemplateRequest req)
    {
        var tpl = await _db.EmailTemplates.FirstOrDefaultAsync(e => e.Id == id);
        if (tpl == null) return NotFound();

        if (req.IsDefault)
        {
            var all = await _db.EmailTemplates.Where(e => e.IsDefault && e.Id != id).ToListAsync();
            foreach (var e in all) e.IsDefault = false;
        }

        tpl.Name = string.IsNullOrWhiteSpace(req.Name) ? tpl.Name : req.Name.Trim();
        tpl.SubjectTemplate = req.SubjectTemplate;
        tpl.BodyTemplate = req.BodyTemplate;
        tpl.IsDefault = req.IsDefault;
        tpl.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _audit.RecordAsync(CurrentUserId, CurrentUserName, CurrentUserRole,
            "EmailTemplate.Updated", "EmailTemplate", tpl.Id.ToString(),
            $"Updated email template '{tpl.Name}'.");

        return Ok(tpl);
    }

    public class PreviewEmailRequest
    {
        public Guid PayrollRecordId { get; set; }
        public string SubjectTemplate { get; set; } = string.Empty;
        public string BodyTemplate { get; set; } = string.Empty;
    }

    [HttpPost("email/preview")]
    public async Task<IActionResult> PreviewResolvedEmail([FromBody] PreviewEmailRequest req)
    {
        var record = await _db.PayrollRecords
            .AsNoTracking()
            .Include(r => r.Employee)
            .Include(r => r.PayrollPeriod)
            .Include(r => r.Components)
            .FirstOrDefaultAsync(r => r.Id == req.PayrollRecordId);

        if (record == null)
            return NotFound(new { message = "Payroll record not found." });

        var settings = await _db.CompanySettings.AsNoTracking().FirstOrDefaultAsync() ?? new CompanySettings();
        var defaultTpl = await _db.PayslipTemplates.AsNoTracking().FirstOrDefaultAsync(t => t.IsDefault && !t.IsArchived);
        var docModel = _resolver.ResolveDocument(record, settings, defaultTpl);

        var (resolvedSubject, resolvedBody) = EmailDeliveryService.ResolvePlaceholders(
            req.SubjectTemplate,
            req.BodyTemplate,
            docModel);

        string safeEmpCode = docModel.EmployeeCode.Replace(' ', '_');
        string attachmentFileName = $"Payslip_{safeEmpCode}_{docModel.PeriodLabel.Replace(' ', '_')}.pdf";

        return Ok(new
        {
            employeeCode = docModel.EmployeeCode,
            employeeName = docModel.EmployeeName,
            recipientEmail = docModel.EmployeeEmail,
            periodLabel = docModel.PeriodLabel,
            resolvedSubject,
            resolvedBody,
            attachmentFileName
        });
    }

    public class SendPayslipEmailRequest
    {
        public Guid PayrollRecordId { get; set; }
        public string RecipientEmail { get; set; } = string.Empty;
        public string Subject { get; set; } = string.Empty;
        public string Body { get; set; } = string.Empty;
        public bool IsTestEmail { get; set; }
        public string? SimulatedOutcome { get; set; } // Optional: "Accepted", "Failed", "Uncertain" for test verification
        public string? SmtpHost { get; set; }
        public int? SmtpPort { get; set; }
        public string? SmtpUsername { get; set; }
        public string? SmtpPassword { get; set; }
        public string? SmtpFromEmail { get; set; }
    }

    [HttpPost("email/send")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> SendEmail([FromBody] SendPayslipEmailRequest req)
    {
        try
        {
            // If inline SMTP settings/credentials are supplied from the Send Payslip modal, persist them first
            if (!string.IsNullOrWhiteSpace(req.SmtpPassword) ||
                !string.IsNullOrWhiteSpace(req.SmtpHost) ||
                !string.IsNullOrWhiteSpace(req.SmtpUsername) ||
                !string.IsNullOrWhiteSpace(req.SmtpFromEmail))
            {
                var settings = await _db.CompanySettings.FirstOrDefaultAsync();
                if (settings == null)
                {
                    settings = new CompanySettings { Id = 1 };
                    _db.CompanySettings.Add(settings);
                }

                if (!string.IsNullOrWhiteSpace(req.SmtpHost))
                    settings.SmtpHost = req.SmtpHost.Trim();
                if (req.SmtpPort.HasValue && req.SmtpPort.Value > 0)
                    settings.SmtpPort = Math.Clamp(req.SmtpPort.Value, 1, 65535);
                if (!string.IsNullOrWhiteSpace(req.SmtpFromEmail))
                    settings.SmtpFromEmail = req.SmtpFromEmail.Trim();
                if (!string.IsNullOrWhiteSpace(req.SmtpUsername))
                    settings.SmtpUsername = req.SmtpUsername.Trim();
                else if (string.IsNullOrWhiteSpace(settings.SmtpUsername) && !string.IsNullOrWhiteSpace(settings.SmtpFromEmail))
                    settings.SmtpUsername = settings.SmtpFromEmail;

                if (!string.IsNullOrWhiteSpace(req.SmtpPassword))
                {
                    settings.SmtpPasswordEncrypted = req.SmtpPassword.Trim();
                    settings.EmailProviderMode = "Smtp";
                }

                settings.SmtpUseTls = true;
                settings.UpdatedAtUtc = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }

            var attempt = await _emailService.SendIndividualPayslipEmailAsync(
                req.PayrollRecordId,
                req.RecipientEmail,
                req.Subject,
                req.Body,
                req.IsTestEmail,
                req.SimulatedOutcome,
                retryOfAttemptId: null,
                CurrentUserId,
                CurrentUserName,
                CurrentUserRole);

            return Ok(attempt);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.InnerException?.Message ?? ex.Message });
        }
    }

    public class ManualRetryEmailRequest
    {
        public string? OverrideRecipientEmail { get; set; }
        public string? SimulatedOutcome { get; set; }
    }

    [HttpPost("email/history/{attemptId:guid}/retry")]
    [Authorize(Roles = $"{AppRoles.Administrator},{AppRoles.AccountsOperator}")]
    public async Task<IActionResult> ManualRetryEmail(Guid attemptId, [FromBody] ManualRetryEmailRequest? req)
    {
        var previous = await _db.EmailDeliveryAttempts.FirstOrDefaultAsync(a => a.Id == attemptId);
        if (previous == null)
            return NotFound(new { message = "Delivery attempt record not found." });

        try
        {
            var retryAttempt = await _emailService.SendIndividualPayslipEmailAsync(
                previous.PayrollRecordId,
                !string.IsNullOrWhiteSpace(req?.OverrideRecipientEmail) ? req!.OverrideRecipientEmail! : previous.RecipientEmail,
                previous.Subject,
                previous.Body,
                previous.IsTestEmail,
                req?.SimulatedOutcome,
                retryOfAttemptId: previous.Id,
                CurrentUserId,
                CurrentUserName,
                CurrentUserRole);

            return Ok(retryAttempt);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.InnerException?.Message ?? ex.Message });
        }
    }

    [HttpGet("email/history")]
    public async Task<IActionResult> GetSentHistory(
        [FromQuery] string? periodLabel = null,
        [FromQuery] string? status = null,
        [FromQuery] string? search = null)
    {
        var query = _db.EmailDeliveryAttempts
            .AsNoTracking()
            .Include(a => a.GeneratedDocument)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(periodLabel) && periodLabel != "All")
        {
            query = query.Where(a => a.PeriodLabel == periodLabel);
        }

        if (!string.IsNullOrWhiteSpace(status) && status != "All")
        {
            query = query.Where(a => a.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(a =>
                a.EmployeeName.ToLower().Contains(term) ||
                a.EmployeeCode.ToLower().Contains(term) ||
                a.RecipientEmail.ToLower().Contains(term));
        }

        var items = await query
            .OrderByDescending(a => a.CreatedAtUtc)
            .Take(250)
            .Select(a => new
            {
                id = a.Id,
                payrollRecordId = a.PayrollRecordId,
                employeeId = a.EmployeeId,
                employeeCode = a.EmployeeCode,
                employeeName = a.EmployeeName,
                periodLabel = a.PeriodLabel,
                recipientEmail = a.RecipientEmail,
                subject = a.Subject,
                generatedDocumentId = a.GeneratedDocumentId,
                documentVersionCode = a.GeneratedDocument != null ? a.GeneratedDocument.DocumentVersionCode : "PS-PDF",
                attachmentFileName = a.AttachmentFileName,
                status = a.Status,
                providerMode = a.ProviderMode,
                providerMessageId = a.ProviderMessageId,
                errorDetails = a.ErrorDetails,
                isTestEmail = a.IsTestEmail,
                retryOfAttemptId = a.RetryOfAttemptId,
                operatorName = a.OperatorUserName,
                createdAtUtc = a.CreatedAtUtc,
                completedAtUtc = a.CompletedAtUtc
            })
            .ToListAsync();

        return Ok(items);
    }
}

