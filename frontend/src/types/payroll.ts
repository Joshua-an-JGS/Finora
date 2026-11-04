export type AppRole = 'Administrator' | 'AccountsOperator' | 'Viewer';

export interface AuthUser {
  id: string;
  userName: string;
  email: string;
  fullName: string;
  department: string;
  role: AppRole;
  isAdminSession?: boolean;
  mfaRequired: boolean;
  mfaConfigured: boolean;
}

export type UserProfile = AuthUser;

export interface PayslipTemplateConfig {
  primaryAccentColor: string;
  headingNavyColor: string;
  documentBackgroundColor: string;
  subtleAccentSurfaceColor: string;
  borderColor: string;
  primaryTextColor: string;
  secondaryTextColor: string;

  showLogo: boolean;
  logoHeightPx: number;
  headerAlignment: 'Left' | 'Center' | 'Split';
  documentTitle: string;
  periodPresentationPrefix: string;
  showCompanySubtitle: boolean;
  showCompanyAddress: boolean;
  showCompanyContact: boolean;
  showCompanyWebsite: boolean;
  showAuthorizedIdentifiers: boolean;
  showHeaderDivider?: boolean;
  headerDividerThicknessPt?: number;
  headerDividerColor?: string | null;
  companyNameFontSizePt?: number;

  overrideCompanyName?: string | null;
  overrideCompanySubtitle?: string | null;
  overrideCompanyAddress?: string | null;
  overrideCompanyContact?: string | null;
  overrideCompanyPhone?: string | null;
  overrideCompanyWebsite?: string | null;
  overrideLogoDataUrl?: string | null;

  employeeDetailsColumns: number;
  showEmployeeId: boolean;
  showEmployeeName: boolean;
  showDepartment: boolean;
  showDesignation: boolean;
  showEmployeeEmail: boolean;
  showPayrollPeriodInDetails: boolean;

  tableLayoutMode: 'SideBySide' | 'Stacked';

  additionalTablesLayoutMode?: 'Auto' | 'SideBySide' | 'Stacked';
  earningsSectionHeading: string;
  deductionsSectionHeading: string;
  componentColumnHeading: string;
  amountColumnHeading: string;
  showCurrencySymbolInRows: boolean;
  tableWidthPercent?: number;
  earningsLabelWidthPercent?: number;
  deductionsLabelWidthPercent?: number;
  tableSpacingPx?: number;

  showZeroValueRows: boolean;
  showCustomTextFieldsSection: boolean;

  fontFamily: string;
  baseFontSizePt: number;
  headingFontWeight: string;
  amountAlignment: 'Right' | 'Left';
  rowVerticalPaddingPx: number;
  sectionSpacingPx?: number;
  showTableBorders: boolean;
  borderLineWeightPx: number;
  pageMarginMm: number;

  // Borders Section Controls
  enableBorders?: boolean;
  borderThicknessPt?: number;
  enableRowBorders?: boolean;
  rowBorderMode?: 'All' | 'HeaderOnly' | 'DataOnly' | 'None';
  rowBorderColor?: string;
  rowBorderThicknessPt?: number;
  enableColumnBorders?: boolean;
  columnBorderColor?: string;
  columnBorderThicknessPt?: number;
  showEmployeeDetailsBorder?: boolean;
  showSalaryTablesBorder?: boolean;
  showTotalsSummaryBorder?: boolean;
  showNetSalaryBorder?: boolean;
  showSignatureBorder?: boolean;
  showFooterBorder?: boolean;

  highlightNetSalaryBox: boolean;
  netSalaryLabel: string;
  showAmountInWords: boolean;
  showSignatureArea: boolean;
  signatureAlignment?: 'Left' | 'Center' | 'Right';
  leftSignatureLabel: string;
  showLeftSignature: boolean;
  rightSignatureLabel: string;
  rightSignatureSubtext: string;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  signatureLineWidthPx?: number;
  signatureLineThicknessPt?: number;
  signatureTopSpacingPx?: number;
  signatureBottomSpacingPx?: number;
  showFooterDisclaimer: boolean;
  footerDisclaimerText: string;

  titleBannerBgColor?: string;
  titleBannerTitleColor?: string;
  titleBannerPeriodColor?: string;

  netSalaryBgColor?: string;
  netSalaryBorderColor?: string;
  netSalaryTitleColor?: string;
  netSalaryWordsColor?: string;
  netSalaryAmountColor?: string;

  sectionOrder: string[];
  customTables?: CustomPayslipTable[];
}

export interface CustomPayslipTableRow {
  id: string;
  cells: string[];
}

export interface CustomPayslipTable {
  id: string;
  title: string;
  columns: string[];
  rows: CustomPayslipTableRow[];
  showBorder: boolean;
  isVisible: boolean;
  headingBgColor?: string | null;
  headingTextColor?: string | null;

  layoutWidth?: 'auto' | 'half' | 'full';
}

export interface ResolvedPayslipComponentRow {
  componentId: string;
  componentKey: string;
  originalLabel: string;
  displayLabel: string;
  category: string;
  amount: number;
  formattedAmount: string;
  isOverridden: boolean;
  isManuallyAdded: boolean;
  isZeroValue: boolean;
}

export interface ResolvedPayslipTextField {
  componentId: string;
  componentKey: string;
  label: string;
  value: string;
  isOverridden: boolean;
}

export interface EditorComponentItemDto {
  id: string;
  componentKey: string;
  originalLabel: string;
  overrideLabel?: string | null;
  effectiveLabel: string;
  category: string;
  sortOrder: number;
  sourceCellType: string;
  importedNumericValue?: number | null;
  importedTextValue?: string | null;
  isManuallyAdded: boolean;
  hasManualOverride: boolean;
  overrideNumericValue?: number | null;
  overrideTextValue?: string | null;
  effectiveNumericValue?: number | null;
  effectiveTextValue?: string | null;
  explicitVisibilityOverride?: boolean | null;
  isCurrentlyVisibleOnPayslip: boolean;
  visibilityReason: string;
}

export interface PayslipDocumentModel {
  payrollRecordId: string;
  employeeId: string;
  payrollPeriodId: string;
  templateId?: string | null;
  selectedTemplateId?: string | null;
  templateName: string;
  recordStatus: string;

  companyName: string;
  companySubtitle: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyContactEmail?: string;
  companyContactPhone?: string;
  companyWebsite: string;
  authorizedIdentifiers: string;
  logoDataUrl?: string | null;
  currencySymbol: string;
  currencyCode: string;

  payrollMonth: number;
  payrollYear: number;
  periodLabel: string;
  employeeCode: string;
  employeeName: string;
  employeeEmail: string;
  department: string;
  designation: string;

  visibleEarnings: ResolvedPayslipComponentRow[];
  visibleDeductions: ResolvedPayslipComponentRow[];
  visibleEmployerContributions: ResolvedPayslipComponentRow[];
  visibleCustomTextFields: ResolvedPayslipTextField[];
  visibleMetadataFields?: ResolvedPayslipTextField[];
  allEditorComponents: EditorComponentItemDto[];

  calculatedEarningsTotal?: number;
  calculatedDeductionsTotal?: number;
  hasDiscrepancyWarning?: boolean;
  discrepancyMessages?: string[];

  grossSalary?: number | null;
  importedGrossSalary?: number | null;
  isGrossOverridden: boolean;

  totalDeductions?: number | null;
  importedTotalDeductions?: number | null;
  isTotalDeductionsOverridden: boolean;

  netSalary?: number | null;
  importedNetSalary?: number | null;
  isNetSalaryOverridden: boolean;

  netSalaryInWords?: string | null;
  integrityWarnings: string[];
  styleConfig: PayslipTemplateConfig;
  customTables?: CustomPayslipTable[];
  customFooterNotes?: string | null;
}

export interface PayrollPeriodSummary {
  id: string;
  month: number;
  year: number;
  periodLabel: string;
  isClosed?: boolean;
  employeeCount: number;
  pdfGeneratedCount?: number;
  sentCount?: number;
  totalNetPayroll?: number;
}

export interface EmployeeSearchItem {
  recordId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  email: string;
  department: string;
  designation: string;
  month: number;
  year: number;
  periodLabel: string;
  grossSalary?: number | null;
  netSalary?: number | null;
  status: string;
}

export interface WorksheetSummaryDto {
  name: string;
  rowCount: number;
  columnCount: number;
  sampleHeaders: string[];
}

export interface ExcelUploadSummaryDto {
  importBatchId: string;
  fileName: string;
  fileSizeBytes: number;
  fileSha256: string;
  month: number;
  year: number;
  periodLabel: string;
  worksheets: WorksheetSummaryDto[];
  selectedWorksheet: string;
  hasExistingRecordsForPeriod: boolean;
  existingRecordCountForPeriod: number;
}

export interface ColumnMappingDefinitionDto {
  columnIndex: number;
  columnLetter: string;
  headerText: string;
  mappedRole: string;
  displayLabel: string;
  sampleNonEmptyValue: string;
  isAutoDetected: boolean;
}

export interface PreviewCellDto {
  columnIndex: number;
  headerText: string;
  mappedRole: string;
  sourceCellType: string;
  rawText?: string | null;
  numericValue?: number | null;
  isFormula: boolean;
  isFormulaUncertain: boolean;
}

export interface PreviewEmployeeRowDto {
  rowNumber: number;
  employeeCode: string;
  employeeName: string;
  email: string;
  department: string;
  designation: string;
  payrollMonthCell: string;
  grossSalary?: number | null;
  totalDeductions?: number | null;
  netSalary?: number | null;
  cells: PreviewCellDto[];
  errors: string[];
  warnings: string[];
  isReplacementOfExisting: boolean;
}

export interface ImportValidationPreviewDto {
  importBatchId: string;
  fileName: string;
  selectedWorksheet: string;
  month: number;
  year: number;
  periodLabel: string;
  hasExistingRecordsForPeriod: boolean;
  existingRecordCountForPeriod: number;
  isDuplicateFileUpload: boolean;
  columnMappings: ColumnMappingDefinitionDto[];
  rows: PreviewEmployeeRowDto[];
  totalRows: number;
  validRows: number;
  rowsWithWarnings: number;
  rowsWithErrors: number;
  globalIssues: string[];
}

export interface PayslipTemplateItem {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  isArchived: boolean;
  isSystemBuiltin: boolean;
  version: number;
  config: PayslipTemplateConfig;
  updatedAtUtc: string;
}

export interface EmailTemplateItem {
  id: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  isDefault: boolean;
  updatedAtUtc: string;
}

export interface EmailHistoryItem {
  id: string;
  payrollRecordId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  periodLabel: string;
  recipientEmail: string;
  subject: string;
  generatedDocumentId: string;
  documentVersionCode: string;
  attachmentFileName: string;
  status: 'Queued' | 'Accepted' | 'Failed' | 'Uncertain';
  providerMode: string;
  providerMessageId?: string | null;
  errorDetails?: string | null;
  isTestEmail: boolean;
  retryOfAttemptId?: string | null;
  operatorName: string;
  createdAtUtc: string;
  completedAtUtc?: string | null;
}


export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string;
  isUpdateAvailable: boolean;
  updateChannel: string;
  autoCheckUpdates: boolean;
  autoDownloadUpdates: boolean;
  notifyBeforeInstall: boolean;
  updateServerUrl?: string;
  lastCheckedAtUtc?: string | null;
  lastInstalledAtUtc?: string | null;
  installationDateUtc?: string;
  platform: string;
  architecture: string;
  runtime: string;
  databaseEngine: string;
  buildNumber: string;
  releaseDate: string;
  license: string;
  developer: string;
  attribution: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  totalBytes?: number;
  message?: string;
  isOffline?: boolean;
}

export interface ReleaseHistoryItem {
  version: string;
  releaseDate: string;
  releaseType: string;
  isCurrent: boolean;
  summary: string;
  newFeatures: string[];
  improvements: string[];
  bugFixes: string[];
}

export interface SystemInfo {
  applicationName: string;
  applicationTitle: string;
  version: string;
  buildNumber: string;
  releaseDate: string;
  platform: string;
  osVersion: string;
  is64BitOperatingSystem: boolean;
  is64BitProcess: boolean;
  processorCount: number;
  runtimeFramework: string;
  desktopShell: string;
  frontendEngine: string;
  documentEngine: string;
  databaseEngine: string;
  databaseConnected: boolean;
  baseDataDirectory: string;
  logsDirectory: string;
  documentsDirectory: string;
  developer: string;
  attribution: string;
  serverTimeUtc: string;
}
