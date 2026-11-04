using System.Globalization;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.EntityFrameworkCore;
using MimeKit;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;

namespace PaySlipStudio.Api.Services;

public class EmailDeliveryService
{
    private readonly ApplicationDbContext _db;
    private readonly PdfRenderingService _pdfService;
    private readonly PayslipDocumentResolver _resolver;
    private readonly AuditService _audit;
    private readonly string _outboxVaultPath;

    public EmailDeliveryService(
        ApplicationDbContext db,
        PdfRenderingService pdfService,
        PayslipDocumentResolver resolver,
        AuditService audit,
        IConfiguration config,
        IWebHostEnvironment env)
    {
        _db = db;
        _pdfService = pdfService;
        _resolver = resolver;
        _audit = audit;

        var configuredPath = config["Storage:RootPath"] ?? "Storage/PrivateVault";
        var root = Path.IsPathRooted(configuredPath)
            ? configuredPath
            : Path.Combine(env.ContentRootPath, configuredPath);

        _outboxVaultPath = Path.Combine(root, "Outbox");
        Directory.CreateDirectory(_outboxVaultPath);
    }

    public static (string ResolvedSubject, string ResolvedBody) ResolvePlaceholders(
        string subjectTemplate,
        string bodyTemplate,
        PayslipDocumentModel docModel)
    {
        string monthName = CultureInfo.InvariantCulture.DateTimeFormat.GetMonthName(Math.Clamp(docModel.PayrollMonth, 1, 12));
        string yearStr = docModel.PayrollYear.ToString(CultureInfo.InvariantCulture);
        string netStr = docModel.NetSalary.HasValue
            ? PayslipDocumentResolver.FormatIndianAmount(docModel.NetSalary.Value, docModel.CurrencySymbol)
            : string.Empty;

        string Apply(string template)
        {
            if (string.IsNullOrEmpty(template)) return string.Empty;
            var res = template
                .Replace("{{EmployeeName}}", docModel.EmployeeName, StringComparison.OrdinalIgnoreCase)
                .Replace("{{EmployeeId}}", docModel.EmployeeCode, StringComparison.OrdinalIgnoreCase)
                .Replace("{{PayrollMonth}}", monthName, StringComparison.OrdinalIgnoreCase)
                .Replace("{{PayrollYear}}", yearStr, StringComparison.OrdinalIgnoreCase)
                .Replace("{{CompanyName}}", docModel.CompanyName, StringComparison.OrdinalIgnoreCase);

            if (docModel.NetSalary.HasValue)
            {
                res = res.Replace("{{NetSalary}}", netStr, StringComparison.OrdinalIgnoreCase);
            }
            else
            {
                res = res.Replace("{{NetSalary}}", "N/A", StringComparison.OrdinalIgnoreCase);
            }
            return res;
        }

        return (Apply(subjectTemplate), Apply(bodyTemplate));
    }

    public async Task<EmailDeliveryAttempt> SendIndividualPayslipEmailAsync(
        Guid payrollRecordId,
        string recipientEmail,
        string subject,
        string body,
        bool isTestEmail,
        string? simulatedOutcomeForTesting,
        Guid? retryOfAttemptId,
        string actorUserId,
        string actorUserName,
        string actorRole)
    {
        if (string.IsNullOrWhiteSpace(recipientEmail) || !recipientEmail.Contains('@'))
        {
            throw new InvalidOperationException("A valid recipient email address is required.");
        }

        // Prevent shared recipient lists (Section 14: Never reveal other employee addresses through a shared recipient list)
        if (recipientEmail.Contains(',') || recipientEmail.Contains(';'))
        {
            throw new InvalidOperationException("Multiple recipients are prohibited. Send separate messages for separate employees.");
        }

        var record = await _db.PayrollRecords
            .Include(r => r.Employee)
            .Include(r => r.PayrollPeriod)
            .Include(r => r.Components)
            .Include(r => r.GeneratedDocuments)
            .FirstOrDefaultAsync(r => r.Id == payrollRecordId)
            ?? throw new KeyNotFoundException("Payroll record not found.");

        var companySettings = await _db.CompanySettings.FirstOrDefaultAsync() ?? new CompanySettings();
        PayslipTemplate? template = null;
        if (record.SelectedTemplateId.HasValue)
        {
            template = await _db.PayslipTemplates.FirstOrDefaultAsync(t => t.Id == record.SelectedTemplateId.Value);
        }
        template ??= await _db.PayslipTemplates.FirstOrDefaultAsync(t => t.IsDefault && !t.IsArchived);

        var docModel = _resolver.ResolveDocument(record, companySettings, template);
        var (resolvedSubject, resolvedBody) = ResolvePlaceholders(subject, body, docModel);

        // Always generate or verify the latest PDF for this exact employee and payroll period
        var (pdfDoc, pdfBytes) = await _pdfService.GenerateAndPersistPdfAsync(
            record.Id,
            actorUserId,
            actorUserName,
            actorRole);

        // Strict verification that the attached PDF belongs to this employee and period
        if (pdfDoc.EmployeeId != record.EmployeeId || pdfDoc.PayrollPeriodId != record.PayrollPeriodId)
        {
            throw new InvalidOperationException("Security integrity error: PDF attachment does not match the selected employee or payroll period.");
        }

        string shortHash = pdfDoc.Sha256Hash.Length > 16 ? pdfDoc.Sha256Hash[..16] : pdfDoc.Sha256Hash;
        string rawKey = retryOfAttemptId.HasValue
            ? $"RETRY:{retryOfAttemptId.Value:N}:{DateTime.UtcNow.Ticks}"
            : $"{record.Id:N}:{shortHash}:{recipientEmail.Trim().ToLowerInvariant()}:{(isTestEmail ? "TEST" : "PROD")}";
        string idempotencyKey = rawKey.Length > 120 ? rawKey[..120] : rawKey;

        // Check if an Uncertain attempt exists and prevent automatic duplicate without explicit retry
        if (!retryOfAttemptId.HasValue && !isTestEmail)
        {
            var existingUncertain = await _db.EmailDeliveryAttempts
                .FirstOrDefaultAsync(a => a.PayrollRecordId == record.Id && a.Status == EmailDeliveryStatuses.Uncertain);

            if (existingUncertain != null)
            {
                throw new InvalidOperationException(
                    "A previous delivery attempt for this payslip has an 'Uncertain' status. To prevent duplicate delivery, please review it in Sent History and trigger an explicit Manual Retry if confirmed undelivered.");
            }
        }

        // If this is a real user send (not an automated test with simulatedOutcomeForTesting),
        // require real SMTP configuration so we never falsely report a Sandbox file save as a delivered email!
        if (string.IsNullOrWhiteSpace(simulatedOutcomeForTesting))
        {
            bool isSmtpMode = string.Equals(companySettings.EmailProviderMode, "Smtp", StringComparison.OrdinalIgnoreCase);
            bool hasPassword = !string.IsNullOrWhiteSpace(companySettings.SmtpPasswordEncrypted);
            if (!isSmtpMode || string.IsNullOrWhiteSpace(companySettings.SmtpHost) || !hasPassword)
            {
                throw new InvalidOperationException(
                    "SMTP email credentials are not configured yet (system was in local Sandbox mode). Please enter your Sender Email and SMTP Password / Google App Password in the Send Payslip dialog or in Settings to send real emails.");
            }
        }

        var attempt = new EmailDeliveryAttempt
        {
            IdempotencyKey = idempotencyKey,
            PayrollRecordId = record.Id,
            EmployeeId = record.EmployeeId,
            EmployeeCode = docModel.EmployeeCode,
            EmployeeName = docModel.EmployeeName,
            PayrollPeriodId = record.PayrollPeriodId,
            PeriodLabel = docModel.PeriodLabel,
            GeneratedDocumentId = pdfDoc.Id,
            AttachmentFileName = pdfDoc.FileName,
            RecipientEmail = recipientEmail.Trim(),
            Subject = resolvedSubject,
            Body = resolvedBody,
            Status = EmailDeliveryStatuses.Queued,
            ProviderMode = string.IsNullOrWhiteSpace(simulatedOutcomeForTesting) ? "Smtp" : companySettings.EmailProviderMode,
            IsTestEmail = isTestEmail,
            RetryOfAttemptId = retryOfAttemptId,
            OperatorUserId = actorUserId,
            OperatorUserName = actorUserName,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.EmailDeliveryAttempts.Add(attempt);
        await _db.SaveChangesAsync();

        string effectiveFromEmail = !string.IsNullOrWhiteSpace(companySettings.SmtpFromEmail)
            ? companySettings.SmtpFromEmail.Trim()
            : (!string.IsNullOrWhiteSpace(companySettings.SmtpUsername) && companySettings.SmtpUsername.Contains('@')
                ? companySettings.SmtpUsername.Trim()
                : "payroll@organization.org");

        // Build MIME message with single employee PDF attachment
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(
            string.IsNullOrWhiteSpace(companySettings.SmtpFromName) ? companySettings.CompanyName : companySettings.SmtpFromName,
            effectiveFromEmail));
        message.To.Add(new MailboxAddress(docModel.EmployeeName, attempt.RecipientEmail));
        message.Subject = attempt.Subject;

        var builder = new BodyBuilder
        {
            TextBody = attempt.Body
        };
        builder.Attachments.Add(pdfDoc.FileName, pdfBytes, new ContentType("application", "pdf"));
        message.Body = builder.ToMessageBody();

        bool sendStarted = false;
        try
        {
            // Support controlled outcome testing (Section 20 Criterion 22: Accepted, Failed, Uncertain outcomes)
            if (!string.IsNullOrWhiteSpace(simulatedOutcomeForTesting))
            {
                if (simulatedOutcomeForTesting.Equals("Failed", StringComparison.OrdinalIgnoreCase))
                {
                    attempt.Status = EmailDeliveryStatuses.Failed;
                    attempt.ErrorDetails = "Simulated SMTP 550 5.1.1 Mailbox unavailable / rejected by provider.";
                    attempt.CompletedAtUtc = DateTime.UtcNow;
                }
                else if (simulatedOutcomeForTesting.Equals("Uncertain", StringComparison.OrdinalIgnoreCase))
                {
                    attempt.Status = EmailDeliveryStatuses.Uncertain;
                    attempt.ErrorDetails = "Connection dropped after DATA stream transmission before 250 OK acknowledgement. Delivery outcome is uncertain; manual verification required before retry.";
                    attempt.CompletedAtUtc = DateTime.UtcNow;
                }
                else
                {
                    await SaveToSandboxOutboxAsync(message, attempt);
                    attempt.Status = EmailDeliveryStatuses.Accepted;
                    attempt.ProviderMessageId = $"<sandbox-{attempt.Id:N}@finora.local>";
                    attempt.CompletedAtUtc = DateTime.UtcNow;
                }
            }
            else
            {
                string smtpHost = companySettings.SmtpHost.Trim();
                string smtpUser = !string.IsNullOrWhiteSpace(companySettings.SmtpUsername)
                    ? companySettings.SmtpUsername.Trim()
                    : effectiveFromEmail;

                // Auto-correct smtp.office365.com to smtp.gmail.com for @gmail.com
                if (smtpUser.EndsWith("@gmail.com", StringComparison.OrdinalIgnoreCase) &&
                    smtpHost.Equals("smtp.office365.com", StringComparison.OrdinalIgnoreCase))
                {
                    smtpHost = "smtp.gmail.com";
                }

                string smtpPass = (companySettings.SmtpPasswordEncrypted ?? string.Empty).Trim();
                if (smtpHost.Contains("gmail.com", StringComparison.OrdinalIgnoreCase) ||
                    smtpHost.Contains("google.com", StringComparison.OrdinalIgnoreCase))
                {
                    // Google 16-char App Passwords are often copied with spaces ("xxxx xxxx xxxx xxxx")
                    smtpPass = smtpPass.Replace(" ", "");
                }

                using var client = new SmtpClient();
                client.Timeout = 20000;
                var secureOption = companySettings.SmtpPort == 465
                    ? SecureSocketOptions.SslOnConnect
                    : (companySettings.SmtpUseTls ? SecureSocketOptions.StartTls : SecureSocketOptions.StartTlsWhenAvailable);

                await client.ConnectAsync(smtpHost, companySettings.SmtpPort, secureOption);

                if (!string.IsNullOrWhiteSpace(smtpUser) && !string.IsNullOrWhiteSpace(smtpPass))
                {
                    await client.AuthenticateAsync(smtpUser, smtpPass);
                }

                sendStarted = true;
                string smtpResponse = await client.SendAsync(message);
                await client.DisconnectAsync(true);

                // Also archive a copy in Outbox vault for audit trail
                await SaveToSandboxOutboxAsync(message, attempt);

                attempt.Status = EmailDeliveryStatuses.Accepted;
                attempt.ProviderMessageId = string.IsNullOrWhiteSpace(smtpResponse)
                    ? message.MessageId
                    : smtpResponse;
                attempt.CompletedAtUtc = DateTime.UtcNow;
            }
        }
        catch (MailKit.Security.AuthenticationException authEx)
        {
            attempt.Status = EmailDeliveryStatuses.Failed;
            attempt.ErrorDetails = $"SMTP Authentication failed for '{companySettings.SmtpUsername}': {authEx.Message}. For Google Workspace or Gmail, please use a 16-character Google App Password (myaccount.google.com/apppasswords).";
            attempt.CompletedAtUtc = DateTime.UtcNow;
        }
        catch (SmtpProtocolException protoEx) when (sendStarted)
        {
            attempt.Status = EmailDeliveryStatuses.Uncertain;
            attempt.ErrorDetails = $"SMTP protocol interruption during transfer (outcome uncertain): {protoEx.Message}";
            attempt.CompletedAtUtc = DateTime.UtcNow;
        }
        catch (IOException ioEx) when (sendStarted)
        {
            attempt.Status = EmailDeliveryStatuses.Uncertain;
            attempt.ErrorDetails = $"Network I/O interruption during transfer (outcome uncertain): {ioEx.Message}";
            attempt.CompletedAtUtc = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            attempt.Status = EmailDeliveryStatuses.Failed;
            attempt.ErrorDetails = ex.Message;
            attempt.CompletedAtUtc = DateTime.UtcNow;
        }

        if (attempt.Status == EmailDeliveryStatuses.Accepted && !isTestEmail)
        {
            record.Status = "Sent";
            record.UpdatedAtUtc = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        await _audit.RecordAsync(
            actorUserId,
            actorUserName,
            actorRole,
            retryOfAttemptId.HasValue ? "Email.Retry" : (isTestEmail ? "Email.SendTest" : "Email.Send"),
            "EmailDeliveryAttempt",
            attempt.Id.ToString(),
            $"Email delivery ({attempt.Status}) to '{attempt.RecipientEmail}' for {attempt.EmployeeName} ({attempt.EmployeeCode}) — {attempt.PeriodLabel} with attachment '{attempt.AttachmentFileName}'.");

        return attempt;
    }

    private async Task SaveToSandboxOutboxAsync(MimeMessage message, EmailDeliveryAttempt attempt)
    {
        var emlName = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{attempt.EmployeeCode}_{attempt.Id:N}.eml";
        var emlPath = Path.Combine(_outboxVaultPath, emlName);
        await using var fs = File.Create(emlPath);
        await message.WriteToAsync(fs);
    }
}

