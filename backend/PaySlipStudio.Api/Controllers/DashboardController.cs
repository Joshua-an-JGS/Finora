using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PaySlipStudio.Api.Data;
using PaySlipStudio.Api.Models;
using PaySlipStudio.Api.Services;

namespace PaySlipStudio.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public DashboardController(ApplicationDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetDashboard([FromQuery] int? month = null, [FromQuery] int? year = null)
    {
        var settings = await _db.CompanySettings.AsNoTracking().FirstOrDefaultAsync() ?? new CompanySettings();
        int activeMonth = month ?? settings.ActivePayrollMonth;
        int activeYear = year ?? settings.ActivePayrollYear;

        var activePeriod = await _db.PayrollPeriods
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Month == activeMonth && p.Year == activeYear);

        int totalEmployeesInMonth = 0;
        int payslipsGeneratedInMonth = 0;
        int payslipsSentSuccessfully = 0;
        int emailsPendingOrQueued = 0;
        int emailsFailed = 0;
        int emailsUncertain = 0;
        decimal totalNetPayrollInMonth = 0m;

        var recentEmployeeActivity = new List<object>();

        if (activePeriod != null)
        {
            var periodRecords = await _db.PayrollRecords
                .AsNoTracking()
                .Include(r => r.GeneratedDocuments)
                .Include(r => r.EmailAttempts)
                .Where(r => r.PayrollPeriodId == activePeriod.Id)
                .OrderByDescending(r => r.UpdatedAtUtc)
                .ToListAsync();

            totalEmployeesInMonth = periodRecords.Count;
            payslipsGeneratedInMonth = periodRecords.Count(r => r.GeneratedDocuments.Any() || r.Status is "PdfGenerated" or "Sent");
            payslipsSentSuccessfully = periodRecords.Count(r =>
                r.EmailAttempts.Any(a => a.Status == EmailDeliveryStatuses.Accepted && !a.IsTestEmail) || r.Status == "Sent");
            totalNetPayrollInMonth = periodRecords.Sum(r => (r.OverrideNetSalary ?? r.ImportedNetSalary) ?? 0m);

            var periodAttempts = periodRecords.SelectMany(r => r.EmailAttempts).ToList();
            emailsPendingOrQueued = periodAttempts.Count(a => a.Status == EmailDeliveryStatuses.Queued);
            emailsFailed = periodAttempts.Count(a => a.Status == EmailDeliveryStatuses.Failed);
            emailsUncertain = periodAttempts.Count(a => a.Status == EmailDeliveryStatuses.Uncertain);

            recentEmployeeActivity = periodRecords.Take(8).Select(r => (object)new
            {
                recordId = r.Id,
                employeeId = r.EmployeeId,
                employeeCode = r.ImportedEmployeeCode,
                employeeName = r.OverrideEmployeeName ?? r.ImportedEmployeeName,
                department = r.OverrideDepartment ?? r.ImportedDepartment,
                designation = r.OverrideDesignation ?? r.ImportedDesignation,
                netSalary = r.OverrideNetSalary ?? r.ImportedNetSalary,
                status = r.Status,
                pdfCount = r.GeneratedDocuments.Count,
                lastEmailStatus = r.EmailAttempts.OrderByDescending(a => a.CreatedAtUtc).FirstOrDefault()?.Status,
                updatedAtUtc = r.UpdatedAtUtc
            }).ToList();
        }

        var latestImports = await _db.ImportBatches
            .AsNoTracking()
            .Include(b => b.PayrollPeriod)
            .Where(b => b.Status == "Committed")
            .OrderByDescending(b => b.CommittedAtUtc ?? b.CreatedAtUtc)
            .Take(6)
            .Select(b => new
            {
                id = b.Id,
                fileName = b.SourceFileName,
                worksheet = b.SelectedWorksheet,
                periodLabel = b.PayrollPeriod != null ? b.PayrollPeriod.PeriodLabel : "",
                month = b.PayrollPeriod != null ? b.PayrollPeriod.Month : activeMonth,
                year = b.PayrollPeriod != null ? b.PayrollPeriod.Year : activeYear,
                importedRows = b.ValidRowsImported,
                warningCount = b.WarningCount,
                operatorName = b.UploadedByUserName,
                committedAtUtc = b.CommittedAtUtc ?? b.CreatedAtUtc
            })
            .ToListAsync();

        var recentDeliveries = await _db.EmailDeliveryAttempts
            .AsNoTracking()
            .OrderByDescending(a => a.CreatedAtUtc)
            .Take(8)
            .Select(a => new
            {
                id = a.Id,
                payrollRecordId = a.PayrollRecordId,
                employeeCode = a.EmployeeCode,
                employeeName = a.EmployeeName,
                periodLabel = a.PeriodLabel,
                recipientEmail = a.RecipientEmail,
                attachmentFileName = a.AttachmentFileName,
                status = a.Status,
                isTestEmail = a.IsTestEmail,
                operatorName = a.OperatorUserName,
                createdAtUtc = a.CreatedAtUtc
            })
            .ToListAsync();

        var availablePeriods = await _db.PayrollPeriods
            .AsNoTracking()
            .OrderByDescending(p => p.Year)
            .ThenByDescending(p => p.Month)
            .Select(p => new
            {
                id = p.Id,
                month = p.Month,
                year = p.Year,
                periodLabel = p.PeriodLabel,
                employeeCount = p.PayrollRecords.Count
            })
            .ToListAsync();

        return Ok(new
        {
            activeMonth,
            activeYear,
            activePeriodLabel = ExcelPayrollService.FormatPeriodLabel(activeMonth, activeYear),
            currencySymbol = settings.CurrencySymbol,
            metrics = new
            {
                totalEmployeesInMonth,
                payslipsGeneratedInMonth,
                payslipsSentSuccessfully,
                emailsPendingOrQueued,
                emailsFailed,
                emailsUncertain,
                emailsAttentionTotal = emailsPendingOrQueued + emailsFailed + emailsUncertain,
                totalNetPayrollInMonth
            },
            availablePeriods,
            latestImports,
            recentEmployeeActivity,
            recentDeliveries
        });
    }

    [HttpGet("notifications")]
    public async Task<IActionResult> GetNotifications()
    {
        var notifications = new List<object>();

        // 1. Email Delivery Attempts (Delivered or Failed)
        var recentEmails = await _db.EmailDeliveryAttempts
            .AsNoTracking()
            .OrderByDescending(a => a.CreatedAtUtc)
            .Take(8)
            .ToListAsync();

        foreach (var email in recentEmails)
        {
            bool isSuccess = email.Status == EmailDeliveryStatuses.Accepted;
            bool isFailed = email.Status == EmailDeliveryStatuses.Failed;

            notifications.Add(new
            {
                id = $"email-{email.Id}",
                title = isSuccess ? "Payslip Dispatched" : isFailed ? "Email Delivery Failed" : "Email Queued",
                message = isSuccess
                    ? $"Payslip successfully emailed to {email.RecipientEmail} ({email.EmployeeName})"
                    : isFailed
                        ? $"Failed to deliver payslip to {email.RecipientEmail}: {email.ErrorDetails ?? "Connection error"}"
                        : $"Payslip for {email.EmployeeName} is queued for delivery.",
                type = isSuccess ? "success" : isFailed ? "error" : "info",
                category = "Email",
                timestamp = email.CreatedAtUtc,
                targetNav = "history",
                targetRecordId = email.PayrollRecordId.ToString()
            });
        }

        // 2. Recent Import Batches
        var recentImports = await _db.ImportBatches
            .AsNoTracking()
            .Include(b => b.PayrollPeriod)
            .OrderByDescending(b => b.CommittedAtUtc ?? b.CreatedAtUtc)
            .Take(4)
            .ToListAsync();

        foreach (var batch in recentImports)
        {
            notifications.Add(new
            {
                id = $"import-{batch.Id}",
                title = "Excel Dataset Imported",
                message = $"{batch.ValidRowsImported} employee rows imported from '{batch.SourceFileName}' into {batch.PayrollPeriod?.PeriodLabel ?? "Active Period"}.",
                type = "info",
                category = "Import",
                timestamp = batch.CommittedAtUtc ?? batch.CreatedAtUtc,
                targetNav = "monthly",
                targetRecordId = (string?)null
            });
        }

        // 3. Recent Payslip Draft Overrides
        var recentDrafts = await _db.PayrollRecords
            .AsNoTracking()
            .Include(r => r.PayrollPeriod)
            .Where(r => r.Status == "DraftSaved")
            .OrderByDescending(r => r.UpdatedAtUtc)
            .Take(4)
            .ToListAsync();

        foreach (var draft in recentDrafts)
        {
            notifications.Add(new
            {
                id = $"draft-{draft.Id}-{draft.UpdatedAtUtc.Ticks}",
                title = "Payslip Changes Saved",
                message = $"Draft updates saved for {draft.ImportedEmployeeName} ({draft.ImportedEmployeeCode}) in {draft.PayrollPeriod?.PeriodLabel ?? "Current Period"}.",
                type = "success",
                category = "Payroll",
                timestamp = draft.UpdatedAtUtc,
                targetNav = "editor",
                targetRecordId = draft.Id.ToString()
            });
        }

        // 4. Recent Security / Governance Audit Events (if any)
        var recentAudits = await _db.AuditLogEntries
            .AsNoTracking()
            .OrderByDescending(a => a.TimestampUtc)
            .Take(4)
            .ToListAsync();

        foreach (var audit in recentAudits)
        {
            notifications.Add(new
            {
                id = $"audit-{audit.Id}",
                title = "Security & Governance Audit",
                message = $"{audit.ActionType}: {audit.Summary} ({audit.ActorUserName})",
                type = "security",
                category = "Security",
                timestamp = audit.TimestampUtc,
                targetNav = "audit",
                targetRecordId = (string?)null
            });
        }

        // Sort descending by timestamp
        var sorted = notifications
            .OrderByDescending(n => (DateTime)n.GetType().GetProperty("timestamp")!.GetValue(n)!)
            .Take(20)
            .ToList();

        return Ok(sorted);
    }
}

