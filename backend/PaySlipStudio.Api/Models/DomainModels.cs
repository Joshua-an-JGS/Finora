using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.AspNetCore.Identity;

namespace PaySlipStudio.Api.Models;

public static class AppRoles
{
    public const string Administrator = "Administrator";
    public const string AccountsOperator = "AccountsOperator";
    public const string Viewer = "Viewer";

    public static readonly string[] All = [Administrator, AccountsOperator, Viewer];
}

public class ApplicationUser : IdentityUser
{
    [MaxLength(150)]
    public string FullName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Department { get; set; } = "Accounts";

    [MaxLength(50)]
    public string RoleName { get; set; } = AppRoles.Viewer;

    public bool IsActive { get; set; } = true;
    public bool MfaRequired { get; set; }
    public bool MfaConfigured { get; set; }

    [MaxLength(128)]
    public string? MfaSecretKey { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAtUtc { get; set; }
}

public class CompanySettings
{
    [Key]
    public int Id { get; set; } = 1;

    [MaxLength(200)]
    public string CompanyName { get; set; } = "FINORA Enterprise";

    [MaxLength(250)]
    public string Subtitle { get; set; } = "Finance & Payroll Management";

    [MaxLength(500)]
    public string RegisteredAddress { get; set; } = "Institutional Campus / Registered Office Address";

    [MaxLength(150)]
    public string ContactEmail { get; set; } = "payroll@organization.org";

    [MaxLength(100)]
    public string ContactPhone { get; set; } = "+91 0000 000000";

    [MaxLength(200)]
    public string WebsiteUrl { get; set; } = "";

    [MaxLength(200)]
    public string AuthorizedIdentifiers { get; set; } = "";

    [MaxLength(150)]
    public string SignatoryName { get; set; } = "Authorized Signatory";

    [MaxLength(150)]
    public string SignatoryDesignation { get; set; } = "Head — Accounts & Finance";

    public string? LogoDataUrl { get; set; }

    [MaxLength(20)]
    public string CurrencySymbol { get; set; } = "₹";

    [MaxLength(10)]
    public string CurrencyCode { get; set; } = "INR";

    public bool ShowZeroValueComponentsByDefault { get; set; } = false;
    public bool ShowAmountInWordsByDefault { get; set; } = true;

    public int ActivePayrollMonth { get; set; } = 10;
    public int ActivePayrollYear { get; set; } = 2026;

    // Email Provider Settings (Credentials handled safely on server)
    [MaxLength(30)]
    public string EmailProviderMode { get; set; } = "Sandbox"; // "Sandbox" or "Smtp"

    [MaxLength(200)]
    public string SmtpHost { get; set; } = "smtp.gmail.com";

    public int SmtpPort { get; set; } = 587;
    public bool SmtpUseTls { get; set; } = true;

    [MaxLength(200)]
    public string SmtpUsername { get; set; } = "";

    [MaxLength(500)]
    public string? SmtpPasswordEncrypted { get; set; }

    [MaxLength(200)]
    public string SmtpFromEmail { get; set; } = "payroll@organization.org";

    [MaxLength(200)]
    public string SmtpFromName { get; set; } = "FINORA Payroll Administration";

    public int DocumentRetentionDays { get; set; } = 1095;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    // Software Update Configuration
    public bool AutoCheckUpdates { get; set; } = true;
    public bool AutoDownloadUpdates { get; set; } = false;
    public bool NotifyBeforeInstall { get; set; } = true;

    [MaxLength(50)]
    public string UpdateChannel { get; set; } = "Stable";

    [MaxLength(300)]
    public string UpdateServerUrl { get; set; } = "https://github.com/Joshua-an-JGS/Finora";

    public DateTime? LastUpdateCheckedAtUtc { get; set; }
    public DateTime? LastUpdateInstalledAtUtc { get; set; }
}

public class PayrollPeriod
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public int Month { get; set; } // 1..12
    public int Year { get; set; }  // e.g. 2026

    [MaxLength(60)]
    public string PeriodLabel { get; set; } = string.Empty; // e.g., "October 2026"

    public bool IsClosed { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<PayrollRecord> PayrollRecords { get; set; } = new List<PayrollRecord>();
    public ICollection<ImportBatch> ImportBatches { get; set; } = new List<ImportBatch>();
}

public class Employee
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(64)]
    public string EmployeeCode { get; set; } = string.Empty; // e.g., EMP001

    [Required, MaxLength(200)]
    public string FullName { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Email { get; set; } = string.Empty;

    [MaxLength(150)]
    public string Department { get; set; } = string.Empty;

    [MaxLength(150)]
    public string Designation { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<PayrollRecord> PayrollRecords { get; set; } = new List<PayrollRecord>();
}

public class ImportBatch
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PayrollPeriodId { get; set; }
    public PayrollPeriod? PayrollPeriod { get; set; }

    [MaxLength(260)]
    public string SourceFileName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string StoredFilePath { get; set; } = string.Empty;

    [MaxLength(128)]
    public string FileSha256 { get; set; } = string.Empty;

    [MaxLength(150)]
    public string SelectedWorksheet { get; set; } = string.Empty;

    public int TotalRowsDetected { get; set; }
    public int ValidRowsImported { get; set; }
    public int WarningCount { get; set; }
    public int ErrorCount { get; set; }

    // Stores the mapping definitions used during import
    public string ColumnMappingsJson { get; set; } = "[]";

    // Stores full parsed preview payload before confirmation
    public string StagedPreviewJson { get; set; } = "[]";

    [MaxLength(40)]
    public string Status { get; set; } = "Staged"; // "Staged", "Committed", "Replaced"

    [MaxLength(128)]
    public string UploadedByUserId { get; set; } = string.Empty;

    [MaxLength(150)]
    public string UploadedByUserName { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? CommittedAtUtc { get; set; }
}

public class PayrollRecord
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid EmployeeId { get; set; }
    public Employee? Employee { get; set; }

    public Guid PayrollPeriodId { get; set; }
    public PayrollPeriod? PayrollPeriod { get; set; }

    public Guid? ImportBatchId { get; set; }
    public ImportBatch? ImportBatch { get; set; }

    // Immutable Employee Snapshot at Import Time
    [MaxLength(64)]
    public string ImportedEmployeeCode { get; set; } = string.Empty;

    [MaxLength(200)]
    public string ImportedEmployeeName { get; set; } = string.Empty;

    [MaxLength(200)]
    public string ImportedEmail { get; set; } = string.Empty;

    [MaxLength(150)]
    public string ImportedDepartment { get; set; } = string.Empty;

    [MaxLength(150)]
    public string ImportedDesignation { get; set; } = string.Empty;

    [MaxLength(80)]
    public string ImportedPayrollMonthText { get; set; } = string.Empty;

    // Optional Operator Overrides for Employee Metadata on this Payslip
    [MaxLength(64)]
    public string? OverrideEmployeeCode { get; set; }

    [MaxLength(200)]
    public string? OverrideEmployeeName { get; set; }

    [MaxLength(200)]
    public string? OverrideEmail { get; set; }

    [MaxLength(150)]
    public string? OverrideDepartment { get; set; }

    [MaxLength(150)]
    public string? OverrideDesignation { get; set; }

    // Imported Totals (preserved exactly as supplied by Excel; never silently recomputed!)
    [Column(TypeName = "numeric(18,2)")]
    public decimal? ImportedGrossSalary { get; set; }

    [Column(TypeName = "numeric(18,2)")]
    public decimal? ImportedTotalDeductions { get; set; }

    [Column(TypeName = "numeric(18,2)")]
    public decimal? ImportedNetSalary { get; set; }

    // Explicit Operator Overrides for Totals (stored separately from Imported Totals)
    [Column(TypeName = "numeric(18,2)")]
    public decimal? OverrideGrossSalary { get; set; }

    [Column(TypeName = "numeric(18,2)")]
    public decimal? OverrideTotalDeductions { get; set; }

    [Column(TypeName = "numeric(18,2)")]
    public decimal? OverrideNetSalary { get; set; }

    // Full Immutable JSON Snapshot of the original imported Excel row
    public string SourceRowSnapshotJson { get; set; } = "{}";

    // Presentation & Layout Overrides specific to this employee's payslip
    public Guid? SelectedTemplateId { get; set; }
    public bool? ShowZeroValueRowsOverride { get; set; }
    public string? PresentationOverridesJson { get; set; }
    public string? CustomFooterNotes { get; set; }

    [MaxLength(40)]
    public string Status { get; set; } = "Imported"; // "Imported", "DraftSaved", "PdfGenerated", "Sent"

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public string? LastModifiedByUserName { get; set; }

    public ICollection<PayrollComponentValue> Components { get; set; } = new List<PayrollComponentValue>();
    public ICollection<GeneratedPayslipDocument> GeneratedDocuments { get; set; } = new List<GeneratedPayslipDocument>();
    public ICollection<EmailDeliveryAttempt> EmailAttempts { get; set; } = new List<EmailDeliveryAttempt>();
}

public static class ComponentCategories
{
    public const string Earning = "Earning";
    public const string Allowance = "Allowance";
    public const string Deduction = "Deduction";
    public const string EmployerContribution = "EmployerContribution";
    public const string CustomMonetary = "CustomMonetary";
    public const string CustomText = "CustomText";
    public const string Metadata = "Metadata";
}

public static class SourceCellTypes
{
    public const string Empty = "Empty";
    public const string NumericZero = "NumericZero";
    public const string NumericNonZero = "NumericNonZero";
    public const string Text = "Text";
    public const string FormulaVerified = "FormulaVerified";
    public const string FormulaUncertain = "FormulaUncertain";
}

public class PayrollComponentValue
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PayrollRecordId { get; set; }
    public PayrollRecord? PayrollRecord { get; set; }

    [Required, MaxLength(120)]
    public string ComponentKey { get; set; } = string.Empty;

    [Required, MaxLength(150)]
    public string OriginalLabel { get; set; } = string.Empty;

    [MaxLength(150)]
    public string? OverrideLabel { get; set; }

    [Required, MaxLength(50)]
    public string Category { get; set; } = ComponentCategories.Earning;

    public int SortOrder { get; set; }

    // Strict Source Values (never overwritten by manual edits)
    [Required, MaxLength(40)]
    public string SourceCellType { get; set; } = SourceCellTypes.Empty;

    [MaxLength(500)]
    public string? RawSourceText { get; set; }

    [Column(TypeName = "numeric(18,2)")]
    public decimal? ImportedNumericValue { get; set; }

    [MaxLength(500)]
    public string? ImportedTextValue { get; set; }

    public bool IsFormulaCell { get; set; }
    public bool IsFormulaUncertain { get; set; }

    // Operator Manual Edit / Override Layer
    public bool IsManuallyAdded { get; set; }
    public bool HasManualOverride { get; set; }

    [Column(TypeName = "numeric(18,2)")]
    public decimal? OverrideNumericValue { get; set; }

    [MaxLength(500)]
    public string? OverrideTextValue { get; set; }

    // Visibility control: null = automatic dynamic rule; true = force show; false = force hide
    public bool? ExplicitVisibilityOverride { get; set; }

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class PayslipTemplate
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(400)]
    public string Description { get; set; } = string.Empty;

    public bool IsDefault { get; set; }
    public bool IsArchived { get; set; }
    public bool IsSystemBuiltin { get; set; }
    public int Version { get; set; } = 1;

    // JSON serialized PayslipTemplateConfig
    public string ConfigJson { get; set; } = "{}";

    // Preserved initial factory configuration for Reset-to-Original
    public string InitialConfigJson { get; set; } = "{}";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class GeneratedPayslipDocument
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(64)]
    public string DocumentVersionCode { get; set; } = string.Empty; // e.g., PS-202610-EMP001-V1

    public Guid PayrollRecordId { get; set; }
    public PayrollRecord? PayrollRecord { get; set; }

    public Guid EmployeeId { get; set; }
    public Guid PayrollPeriodId { get; set; }
    public Guid? TemplateId { get; set; }
    public int TemplateVersion { get; set; } = 1;

    [MaxLength(260)]
    public string FileName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string StoredFilePath { get; set; } = string.Empty;

    public long FileSizeBytes { get; set; }

    [MaxLength(128)]
    public string Sha256Hash { get; set; } = string.Empty;

    // Exact resolved document model used to render this PDF
    public string RenderedDocumentModelJson { get; set; } = "{}";

    [MaxLength(128)]
    public string GeneratedByUserId { get; set; } = string.Empty;

    [MaxLength(150)]
    public string GeneratedByUserName { get; set; } = string.Empty;

    public DateTime GeneratedAtUtc { get; set; } = DateTime.UtcNow;
}

public class EmailTemplate
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(300)]
    public string SubjectTemplate { get; set; } = "Your Payslip for {{PayrollMonth}} {{PayrollYear}}";

    [Required]
    public string BodyTemplate { get; set; } =
@"Dear {{EmployeeName}},

Please find attached your payslip for {{PayrollMonth}} {{PayrollYear}}.

Please review the document and contact the Accounts Department if you have any questions regarding the details.

Regards,
Accounts Department
{{CompanyName}}";

    public bool IsDefault { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public static class EmailDeliveryStatuses
{
    public const string Queued = "Queued";
    public const string Accepted = "Accepted";
    public const string Failed = "Failed";
    public const string Uncertain = "Uncertain";
}

public class EmailDeliveryAttempt
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(512)]
    public string IdempotencyKey { get; set; } = string.Empty;

    public Guid PayrollRecordId { get; set; }
    public PayrollRecord? PayrollRecord { get; set; }

    public Guid EmployeeId { get; set; }

    [MaxLength(64)]
    public string EmployeeCode { get; set; } = string.Empty;

    [MaxLength(200)]
    public string EmployeeName { get; set; } = string.Empty;

    public Guid PayrollPeriodId { get; set; }

    [MaxLength(60)]
    public string PeriodLabel { get; set; } = string.Empty;

    public Guid GeneratedDocumentId { get; set; }
    public GeneratedPayslipDocument? GeneratedDocument { get; set; }

    [MaxLength(260)]
    public string AttachmentFileName { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string RecipientEmail { get; set; } = string.Empty;

    [MaxLength(512)]
    public string Subject { get; set; } = string.Empty;

    public string Body { get; set; } = string.Empty;

    [MaxLength(40)]
    public string Status { get; set; } = EmailDeliveryStatuses.Queued; // Queued, Accepted, Failed, Uncertain

    [MaxLength(60)]
    public string ProviderMode { get; set; } = "Sandbox";

    [MaxLength(512)]
    public string? ProviderMessageId { get; set; }

    public string? ErrorDetails { get; set; }

    public bool IsTestEmail { get; set; }
    public Guid? RetryOfAttemptId { get; set; }

    [MaxLength(128)]
    public string OperatorUserId { get; set; } = string.Empty;

    [MaxLength(150)]
    public string OperatorUserName { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAtUtc { get; set; }
}

public class AuditLogEntry
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;

    [MaxLength(128)]
    public string ActorUserId { get; set; } = string.Empty;

    [MaxLength(150)]
    public string ActorUserName { get; set; } = string.Empty;

    [MaxLength(60)]
    public string ActorRole { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string ActionType { get; set; } = string.Empty;

    [MaxLength(100)]
    public string EntityType { get; set; } = string.Empty;

    [MaxLength(128)]
    public string EntityId { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Summary { get; set; } = string.Empty;

    public string? BeforeValuesJson { get; set; }
    public string? AfterValuesJson { get; set; }

    [MaxLength(64)]
    public string? IpAddress { get; set; }
}

