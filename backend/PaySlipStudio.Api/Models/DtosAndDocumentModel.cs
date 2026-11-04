namespace PaySlipStudio.Api.Models;
// ============================================================================
// 1. TEMPLATE & PRESENTATION CONFIGURATION (Section 10, 11, 12, 13)
// ============================================================================
public class PayslipTemplateConfig
{
    // Branding & Colors (Strict Orange + White + Neutral Gray Corporate Design System)
    public string PrimaryAccentColor { get; set; } = "#F47721";
    public string HeadingNavyColor { get; set; } = "#1F2937";
    public string DocumentBackgroundColor { get; set; } = "#FFFFFF";
    public string SubtleAccentSurfaceColor { get; set; } = "#FFF3E8";
    public string BorderColor { get; set; } = "#E5E7EB";
    public string PrimaryTextColor { get; set; } = "#1F2937";
    public string SecondaryTextColor { get; set; } = "#6B7280";
    // Title & Period Banner Custom Colors
    public string? TitleBannerBgColor { get; set; }
    public string? TitleBannerTitleColor { get; set; }
    public string? TitleBannerPeriodColor { get; set; }
    // Net Salary Banner Custom Colors
    public string? NetSalaryBgColor { get; set; }
    public string? NetSalaryBorderColor { get; set; }
    public string? NetSalaryTitleColor { get; set; }
    public string? NetSalaryWordsColor { get; set; }
    public string? NetSalaryAmountColor { get; set; }
    // Header Configuration
    public bool ShowLogo { get; set; } = true;
    public int LogoHeightPx { get; set; } = 48;
    public string HeaderAlignment { get; set; } = "Left"; // "Left", "Center", "Split"
    public string DocumentTitle { get; set; } = "PAYSLIP";
    public string PeriodPresentationPrefix { get; set; } = "For the Month of";
    public bool ShowCompanySubtitle { get; set; } = true;
    public bool ShowCompanyAddress { get; set; } = true;
    public bool ShowCompanyContact { get; set; } = true;
    public bool ShowCompanyWebsite { get; set; } = true;
    public bool ShowAuthorizedIdentifiers { get; set; } = false;
    public bool ShowHeaderDivider { get; set; } = true;
    public float HeaderDividerThicknessPt { get; set; } = 2.0f;
    public string? HeaderDividerColor { get; set; }
    public int CompanyNameFontSizePt { get; set; } = 14;
    // Company Header Overrides (optional per-template override of CompanySettings)
    public string? OverrideCompanyName { get; set; }
    public string? OverrideCompanySubtitle { get; set; }
    public string? OverrideCompanyAddress { get; set; }
    public string? OverrideCompanyContact { get; set; }
    public string? OverrideCompanyPhone { get; set; }
    public string? OverrideCompanyWebsite { get; set; }
    public string? OverrideLogoDataUrl { get; set; }
    // Employee Info Section
    public int EmployeeDetailsColumns { get; set; } = 2; // 2 or 3 column grid
    public bool ShowEmployeeId { get; set; } = true;
    public bool ShowEmployeeName { get; set; } = true;
    public bool ShowDepartment { get; set; } = true;
    public bool ShowDesignation { get; set; } = true;
    public bool ShowEmployeeEmail { get; set; } = true;
    public bool ShowPayrollPeriodInDetails { get; set; } = true;
    // Earnings & Deductions Table Layout
    public string TableLayoutMode { get; set; } = "SideBySide"; // "SideBySide" (Two-column) or "Stacked"
    public string AdditionalTablesLayoutMode { get; set; } = "Auto"; // "Auto", "SideBySide", "Stacked" // "SideBySide" (Two-column) or "Stacked"
    public string EarningsSectionHeading { get; set; } = "EARNINGS & ALLOWANCES";
    public string DeductionsSectionHeading { get; set; } = "DEDUCTIONS & RECOVERIES";
    public string ComponentColumnHeading { get; set; } = "Particulars";
    public string AmountColumnHeading { get; set; } = "Amount";
    public bool ShowCurrencySymbolInRows { get; set; } = true;
    public int TableWidthPercent { get; set; } = 100;
    public int EarningsLabelWidthPercent { get; set; } = 65;
    public int DeductionsLabelWidthPercent { get; set; } = 65;
    public int TableSpacingPx { get; set; } = 16;
    // Dynamic Component Rules
    public bool ShowZeroValueRows { get; set; } = false;
    public bool ShowCustomTextFieldsSection { get; set; } = true;
    // Typography & Spacing
    public string FontFamily { get; set; } = "Figtree"; // "Figtree", "Inter", "Segoe UI", "Roboto"
    public int BaseFontSizePt { get; set; } = 10;       // 8..13
    public string HeadingFontWeight { get; set; } = "700";
    public string AmountAlignment { get; set; } = "Right"; // "Right", "Left"
    public int RowVerticalPaddingPx { get; set; } = 7;     // 3..14
    public int SectionSpacingPx { get; set; } = 16;        // 10..28
    public bool ShowTableBorders { get; set; } = true;
    public int BorderLineWeightPx { get; set; } = 1;       // 1..3
    public int PageMarginMm { get; set; } = 14;            // 8..28
    // Borders Section Controls
    public bool EnableBorders { get; set; } = true;
    public float BorderThicknessPt { get; set; } = 1.0f;
    public bool EnableRowBorders { get; set; } = true;
    public string RowBorderMode { get; set; } = "All"; // "All", "HeaderOnly", "DataOnly", "None"
    public string RowBorderColor { get; set; } = "#E5E7EB";
    public float RowBorderThicknessPt { get; set; } = 1.0f;
    public bool EnableColumnBorders { get; set; } = false;
    public string ColumnBorderColor { get; set; } = "#E5E7EB";
    public float ColumnBorderThicknessPt { get; set; } = 1.0f;
    public bool ShowEmployeeDetailsBorder { get; set; } = true;
    public bool ShowSalaryTablesBorder { get; set; } = true;
    public bool ShowTotalsSummaryBorder { get; set; } = true;
    public bool ShowNetSalaryBorder { get; set; } = true;
    public bool ShowSignatureBorder { get; set; } = false;
    public bool ShowFooterBorder { get; set; } = true;
    // Totals, Net Salary & Footer
    public bool HighlightNetSalaryBox { get; set; } = true;
    public string NetSalaryLabel { get; set; } = "NET SALARY PAYABLE";
    public bool ShowAmountInWords { get; set; } = true;
    public bool ShowSignatureArea { get; set; } = true;
    public string SignatureAlignment { get; set; } = "Right"; // "Left", "Center", "Right"
    public string LeftSignatureLabel { get; set; } = "Employee Acknowledgement";
    public bool ShowLeftSignature { get; set; } = false;
    public string RightSignatureLabel { get; set; } = "Authorized Signatory";
    public string RightSignatureSubtext { get; set; } = "Accounts & Finance Department";
    public string? SignatoryName { get; set; } = "";
    public string? SignatoryDesignation { get; set; } = "";
    public int SignatureLineWidthPx { get; set; } = 160;
    public float SignatureLineThicknessPt { get; set; } = 1.0f;
    public int SignatureTopSpacingPx { get; set; } = 20;
    public int SignatureBottomSpacingPx { get; set; } = 4;
    public bool ShowFooterDisclaimer { get; set; } = true;
    public string FooterDisclaimerText { get; set; } = "This is an official payroll document generated by FINORA — Finance & Payroll Management System.";
    // Ordered section keys for customizable section ordering
    public List<string> SectionOrder { get; set; } =
    [
        "Header",
        "TitleBanner",
        "EmployeeDetails",
        "SalaryTables",
        "CustomTables",
        "CustomFields",
        "TotalsSummary",
        "NetSalaryBanner",
        "SignatureBlock",
        "Footer"
    ];
    // Dynamic Custom Tables (Leave Balance, Attendance Summary, Consolidated CTC, etc.)
    public List<CustomPayslipTable> CustomTables { get; set; } = new();
}
public class CustomPayslipTableRow
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public List<string> Cells { get; set; } = new();
}
public class CustomPayslipTable
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Title { get; set; } = "CUSTOM TABLE";
    public List<string> Columns { get; set; } = new() { "Particulars", "Details" };
    public List<CustomPayslipTableRow> Rows { get; set; } = new();
    public bool ShowBorder { get; set; } = true;
    public bool IsVisible { get; set; } = true;
    public string? HeadingBgColor { get; set; }
    public string? HeadingTextColor { get; set; }
    public string LayoutWidth { get; set; } = "auto"; // "auto", "half", "full"
}
// ============================================================================
// 2. SHARED RESOLVED PAYSLIP DOCUMENT MODEL (Browser Preview = Print = PDF)
// ============================================================================
public class PayslipDocumentModel
{
    public Guid PayrollRecordId { get; set; }
    public Guid EmployeeId { get; set; }
    public Guid PayrollPeriodId { get; set; }
    public Guid? TemplateId { get; set; }
    public string TemplateName { get; set; } = "FINORA Institutional Standard";
    public string RecordStatus { get; set; } = "Imported";
    // Organization Identity
    public string CompanyName { get; set; } = string.Empty;
    public string CompanySubtitle { get; set; } = string.Empty;
    public string CompanyAddress { get; set; } = string.Empty;
    public string CompanyEmail { get; set; } = string.Empty;
    public string CompanyPhone { get; set; } = string.Empty;
    public string CompanyWebsite { get; set; } = string.Empty;
    public string AuthorizedIdentifiers { get; set; } = string.Empty;
    public string? LogoDataUrl { get; set; }
    public string CurrencySymbol { get; set; } = "₹";
    public string CurrencyCode { get; set; } = "INR";
    // Period & Employee Details
    public int PayrollMonth { get; set; }
    public int PayrollYear { get; set; }
    public string PeriodLabel { get; set; } = string.Empty;
    public string EmployeeCode { get; set; } = string.Empty;
    public string EmployeeName { get; set; } = string.Empty;
    public string EmployeeEmail { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string Designation { get; set; } = string.Empty;
    // Dynamically Filtered Visible Salary Component Rows (Section 8)
    public List<ResolvedPayslipComponentRow> VisibleEarnings { get; set; } = new();
    public List<ResolvedPayslipComponentRow> VisibleDeductions { get; set; } = new();
    public List<ResolvedPayslipComponentRow> VisibleEmployerContributions { get; set; } = new();
    public List<ResolvedPayslipTextField> VisibleMetadataFields { get; set; } = new();
    public List<ResolvedPayslipTextField> VisibleCustomTextFields { get; set; } = new();
    // Full Component List for the Editor Panel (includes hidden/zero/empty so operator can inspect or override)
    public List<EditorComponentItemDto> AllEditorComponents { get; set; } = new();
    // Supplied & Auto-Calculated Totals (Section 8 Rule 16 & Section 17)
    public decimal CalculatedEarningsTotal { get; set; }
    public decimal CalculatedDeductionsTotal { get; set; }
    public decimal? GrossSalary { get; set; }
    public decimal? ImportedGrossSalary { get; set; }
    public bool IsGrossOverridden { get; set; }
    public decimal? TotalDeductions { get; set; }
    public decimal? ImportedTotalDeductions { get; set; }
    public bool IsTotalDeductionsOverridden { get; set; }
    public decimal? NetSalary { get; set; }
    public decimal? ImportedNetSalary { get; set; }
    public bool IsNetSalaryOverridden { get; set; }
    public string? NetSalaryInWords { get; set; }
    public List<string> IntegrityWarnings { get; set; } = new();
    // Applied Visual & Layout Config
    public PayslipTemplateConfig StyleConfig { get; set; } = new();
    public string? CustomFooterNotes { get; set; }
    // Dynamic Custom Tables attached to this resolved document
    public List<CustomPayslipTable> CustomTables { get; set; } = new();
}
public class ResolvedPayslipComponentRow
{
    public Guid ComponentId { get; set; }
    public string ComponentKey { get; set; } = string.Empty;
    public string OriginalLabel { get; set; } = string.Empty;
    public string DisplayLabel { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string FormattedAmount { get; set; } = string.Empty;
    public bool IsOverridden { get; set; }
    public bool IsManuallyAdded { get; set; }
    public bool IsZeroValue { get; set; }
}
public class ResolvedPayslipTextField
{
    public Guid ComponentId { get; set; }
    public string ComponentKey { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public bool IsOverridden { get; set; }
}
public class EditorComponentItemDto
{
    public Guid Id { get; set; }
    public string ComponentKey { get; set; } = string.Empty;
    public string OriginalLabel { get; set; } = string.Empty;
    public string? OverrideLabel { get; set; }
    public string EffectiveLabel { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public string SourceCellType { get; set; } = string.Empty;
    public decimal? ImportedNumericValue { get; set; }
    public string? ImportedTextValue { get; set; }
    public bool IsManuallyAdded { get; set; }
    public bool HasManualOverride { get; set; }
    public decimal? OverrideNumericValue { get; set; }
    public string? OverrideTextValue { get; set; }
    public decimal? EffectiveNumericValue { get; set; }
    public string? EffectiveTextValue { get; set; }
    public bool? ExplicitVisibilityOverride { get; set; }
    public bool IsCurrentlyVisibleOnPayslip { get; set; }
    public string VisibilityReason { get; set; } = string.Empty;
}
// ============================================================================
// 3. EXCEL IMPORT WIZARD DTOs (Section 7)
// ============================================================================
public class ExcelUploadSummaryDto
{
    public Guid ImportBatchId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public string FileSha256 { get; set; } = string.Empty;
    public int Month { get; set; }
    public int Year { get; set; }
    public string PeriodLabel { get; set; } = string.Empty;
    public List<WorksheetSummaryDto> Worksheets { get; set; } = new();
    public string SelectedWorksheet { get; set; } = string.Empty;
    public bool HasExistingRecordsForPeriod { get; set; }
    public int ExistingRecordCountForPeriod { get; set; }
}
public class WorksheetSummaryDto
{
    public string Name { get; set; } = string.Empty;
    public int RowCount { get; set; }
    public int ColumnCount { get; set; }
    public List<string> SampleHeaders { get; set; } = new();
}
public class ColumnMappingDefinitionDto
{
    public int ColumnIndex { get; set; }
    public string ColumnLetter { get; set; } = string.Empty;
    public string HeaderText { get; set; } = string.Empty;
    // MappedRole:
    // "EmployeeId", "EmployeeName", "Email", "Department", "Designation", "PayrollMonth",
    // "Earning", "Allowance", "Deduction", "EmployerContribution",
    // "GrossSalary", "TotalDeductions", "NetSalary",
    // "CustomMonetary", "CustomText", "Ignore"
    public string MappedRole { get; set; } = "Earning";
    public string DisplayLabel { get; set; } = string.Empty;
    public string SampleNonEmptyValue { get; set; } = string.Empty;
    public bool IsAutoDetected { get; set; } = true;
}
public class ImportValidationPreviewDto
{
    public Guid ImportBatchId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string SelectedWorksheet { get; set; } = string.Empty;
    public int Month { get; set; }
    public int Year { get; set; }
    public string PeriodLabel { get; set; } = string.Empty;
    public bool HasExistingRecordsForPeriod { get; set; }
    public int ExistingRecordCountForPeriod { get; set; }
    public bool IsDuplicateFileUpload { get; set; }
    public List<ColumnMappingDefinitionDto> ColumnMappings { get; set; } = new();
    public List<PreviewEmployeeRowDto> Rows { get; set; } = new();
    public int TotalRows { get; set; }
    public int ValidRows { get; set; }
    public int RowsWithWarnings { get; set; }
    public int RowsWithErrors { get; set; }
    public List<string> GlobalIssues { get; set; } = new();
}
public class PreviewEmployeeRowDto
{
    public int RowNumber { get; set; }
    public string EmployeeCode { get; set; } = string.Empty;
    public string EmployeeName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string Designation { get; set; } = string.Empty;
    public string PayrollMonthCell { get; set; } = string.Empty;
    public decimal? GrossSalary { get; set; }
    public decimal? TotalDeductions { get; set; }
    public decimal? NetSalary { get; set; }
    public List<PreviewCellDto> Cells { get; set; } = new();
    public List<string> Errors { get; set; } = new();
    public List<string> Warnings { get; set; } = new();
    public bool IsReplacementOfExisting { get; set; }
}
public class PreviewCellDto
{
    public int ColumnIndex { get; set; }
    public string HeaderText { get; set; } = string.Empty;
    public string MappedRole { get; set; } = string.Empty;
    public string SourceCellType { get; set; } = SourceCellTypes.Empty;
    public string? RawText { get; set; }
    public decimal? NumericValue { get; set; }
    public bool IsFormula { get; set; }
    public bool IsFormulaUncertain { get; set; }
}
// ============================================================================
// 4. EDITOR SAVE / OVERRIDE REQUESTS (Section 10)
// ============================================================================
public class UpdatePayrollRecordDraftRequest
{
    public string? OverrideEmployeeCode { get; set; }
    public string? OverrideEmployeeName { get; set; }
    public string? OverrideEmail { get; set; }
    public string? OverrideDepartment { get; set; }
    public string? OverrideDesignation { get; set; }
    public decimal? OverrideGrossSalary { get; set; }
    public bool ClearGrossSalaryOverride { get; set; }
    public decimal? OverrideTotalDeductions { get; set; }
    public bool ClearTotalDeductionsOverride { get; set; }
    public decimal? OverrideNetSalary { get; set; }
    public bool ClearNetSalaryOverride { get; set; }
    public Guid? SelectedTemplateId { get; set; }
    public bool? ShowZeroValueRowsOverride { get; set; }
    public PayslipTemplateConfig? PresentationOverrides { get; set; }
    public string? CustomFooterNotes { get; set; }
    public List<ComponentOverrideUpdateItem> ComponentUpdates { get; set; } = new();
}
public class ComponentOverrideUpdateItem
{
    public Guid? Id { get; set; }
    public string ComponentKey { get; set; } = string.Empty;
    public string OriginalLabel { get; set; } = string.Empty;
    public string? OverrideLabel { get; set; }
    public string Category { get; set; } = ComponentCategories.Earning;
    public int SortOrder { get; set; }
    public bool IsManuallyAdded { get; set; }
    public bool ResetToImported { get; set; }
    public bool RemoveManualComponent { get; set; }
    public decimal? OverrideNumericValue { get; set; }
    public string? OverrideTextValue { get; set; }
    public bool? ExplicitVisibilityOverride { get; set; }
}
