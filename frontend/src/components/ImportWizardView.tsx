import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Layers,
  Table2,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import type {
  ColumnMappingDefinitionDto,
  ExcelUploadSummaryDto,
  ImportValidationPreviewDto,
} from '../types/payroll';
import { formatIndianCurrency } from './PayslipA4Paper';

interface ImportWizardViewProps {
  defaultMonth?: number;
  defaultYear?: number;
  activeMonth?: number;
  activeYear?: number;
  canEdit?: boolean;
  onImportCommitted?: (month: number, year: number) => void;
  onImportCompleted?: (month: number, year: number) => void;
}

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const ROLE_OPTIONS = [
  { value: 'EmployeeId', label: 'Employee ID (Identifier)' },
  { value: 'EmployeeName', label: 'Employee Name (Identifier)' },
  { value: 'Email', label: 'Employee Email' },
  { value: 'Department', label: 'Department (Metadata)' },
  { value: 'Designation', label: 'Designation (Metadata)' },
  { value: 'PayrollMonth', label: 'Payroll Month (Metadata)' },
  { value: 'Earning', label: 'Earning Component (Monetary)' },
  { value: 'Allowance', label: 'Allowance Component (Monetary)' },
  { value: 'Deduction', label: 'Deduction Component (Monetary)' },
  { value: 'EmployerContribution', label: 'Employer Contribution (Monetary)' },
  { value: 'GrossSalary', label: 'Gross Salary Total' },
  { value: 'TotalDeductions', label: 'Total Deductions' },
  { value: 'NetSalary', label: 'Net Salary Payable' },
  { value: 'CustomMonetary', label: 'Custom Monetary Field' },
  { value: 'CustomText', label: 'Custom Text / Metadata Field' },
  { value: 'Ignore', label: 'Ignore / Do Not Import' },
];

export const ImportWizardView: React.FC<ImportWizardViewProps> = ({
  defaultMonth,
  defaultYear,
  activeMonth,
  activeYear,
  canEdit = true,
  onImportCommitted,
  onImportCompleted,
}) => {
  const [step, setStep] = useState<number>(1);
  const [month, setMonth] = useState<number>(defaultMonth ?? activeMonth ?? 10);
  const [year, setYear] = useState<number>(defaultYear ?? activeYear ?? 2026);
  const [uploadSummary, setUploadSummary] = useState<ExcelUploadSummaryDto | null>(null);
  const [selectedWorksheet, setSelectedWorksheet] = useState<string>('');
  const [mappings, setMappings] = useState<ColumnMappingDefinitionDto[]>([]);
  const [preview, setPreview] = useState<ImportValidationPreviewDto | null>(null);
  const [confirmReplacement, setConfirmReplacement] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [committedResult, setCommittedResult] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const notifyComplete = (m: number, y: number) => {
    if (onImportCommitted) onImportCommitted(m, y);
    else if (onImportCompleted) onImportCompleted(m, y);
  };

  if (!canEdit) {
    return (
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-8 text-center">
        <AlertCircle className="w-10 h-10 text-[#F47721] mx-auto mb-3" />
        <h2 className="text-[18px] font-semibold text-[#1F2937]">Read-Only Viewer Access</h2>
        <p className="text-[13px] text-[#6B7280] mt-1">
          Your account has Viewer permissions. Importing or modifying payroll batches requires an Accounts Operator or Administrator role.
        </p>
      </div>
    );
  }

  const handleFileUpload = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('month', String(month));
      form.append('year', String(year));

      const summary = await apiRequest<ExcelUploadSummaryDto>('/api/payroll/import/upload', {
        method: 'POST',
        body: form,
      });

      setUploadSummary(summary);
      setSelectedWorksheet(summary.selectedWorksheet);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Failed to upload payroll file.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadWorkspaceMock = async () => {
    setError(null);
    setLoading(true);
    try {
      const summary = await apiRequest<ExcelUploadSummaryDto>(
        '/api/payroll/import/load-workspace-mock',
        {
          method: 'POST',
          body: JSON.stringify({ month, year }),
        }
      );
      setUploadSummary(summary);
      setSelectedWorksheet(summary.selectedWorksheet);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Failed to load workspace mock Excel file.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeWorksheet = async (
    customMaps?: ColumnMappingDefinitionDto[],
    nextStepNum = 4
  ) => {
    if (!uploadSummary) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<ImportValidationPreviewDto>(
        `/api/payroll/import/${uploadSummary.importBatchId}/preview`,
        {
          method: 'POST',
          body: JSON.stringify({
            worksheetName: selectedWorksheet,
            month,
            year,
            customMappings: customMaps,
          }),
        }
      );
      setPreview(res);
      setMappings(res.columnMappings);
      setStep(nextStepNum);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze worksheet.');
    } finally {
      setLoading(false);
    }
  };

  const handleCommitBatch = async () => {
    if (!uploadSummary || !preview) return;
    if (preview.hasExistingRecordsForPeriod && !confirmReplacement) {
      setError(
        'Please check the explicit replacement confirmation box before overwriting existing period records.'
      );
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest(`/api/payroll/import/${uploadSummary.importBatchId}/commit`, {
        method: 'POST',
        body: JSON.stringify({
          allowReplaceExisting: confirmReplacement || !preview.hasExistingRecordsForPeriod,
        }),
      });
      setCommittedResult(res);
    } catch (err: any) {
      setError(err.message || 'Import commit failed.');
    } finally {
      setLoading(false);
    }
  };

  const updateMappingItem = (
    colIdx: number,
    field: 'mappedRole' | 'displayLabel',
    val: string
  ) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.columnIndex === colIdx ? { ...m, [field]: val, isAutoDetected: false } : m
      )
    );
  };

  const stepsMeta = [
    { num: 1, title: '1. Payroll Period' },
    { num: 2, title: '2. Upload File' },
    { num: 3, title: '3. Worksheet' },
    { num: 4, title: '4. Map Columns' },
    { num: 5, title: '5. Validate Grid' },
    { num: 6, title: '6. Confirm Import' },
  ];

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div>
        <h1 className="text-[24px] font-semibold text-[#1F2937]">Import Payroll Excel</h1>
        <p className="text-[13px] text-[#6B7280]">
          Upload monthly payroll spreadsheets and automatically map employee-specific salary components.
        </p>
      </div>

      {/* Stepper Header */}
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {stepsMeta.map((s) => {
            const isActive = step === s.num && !committedResult;
            const isDone = step > s.num || Boolean(committedResult);
            return (
              <div
                key={s.num}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-[7px] text-[12.5px] font-semibold transition-colors ${
                  isActive
                    ? 'bg-[#F47721] text-[#FFFFFF]'
                    : isDone
                    ? 'bg-[#FFF3E8] text-[#F47721] border border-[#F47721]/30'
                    : 'bg-[#F8F9FA] text-[#6B7280]'
                }`}
              >
                <span>{s.title}</span>
                {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-[#F47721]" />}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="bg-[#FFF3E8] border border-[#F47721]/40 rounded-[8px] p-3.5 flex items-start gap-2.5 text-[13px] text-[#1F2937]">
          <AlertCircle className="w-4 h-4 text-[#F47721] shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {committedResult ? (
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-[10px] bg-[#FFF3E8] text-[#F47721] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-[20px] font-semibold text-[#1F2937]">
            Payroll Batch Successfully Imported
          </h3>
          <p className="text-[13.5px] text-[#6B7280] max-w-lg mx-auto">
            Imported <strong>{committedResult.importedRows}</strong> employee payroll records from
            worksheet <strong>{committedResult.worksheet}</strong> into{' '}
            <strong>
              {MONTHS.find((m) => m.value === month)?.label} {year}
            </strong>
            .
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setCommittedResult(null);
                setUploadSummary(null);
                setPreview(null);
                setStep(1);
              }}
              className="px-4 py-2 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#1F2937] text-[13px] font-medium hover:border-[#F47721]"
            >
              Import Another File
            </button>
            <button
              type="button"
              onClick={() => notifyComplete(month, year)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[13px] font-semibold hover:bg-[#E06612]"
            >
              <span>
                Open Payroll for {MONTHS.find((m) => m.value === month)?.label} {year}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* STEP 1 */}
          {step === 1 && (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1F2937]">
                  Step 1: Select Target Payroll Period
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-0.5">
                  Choose the payroll month and year for the batch you are importing.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <div>
                  <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                    Payroll Month
                  </label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                    Payroll Year
                  </label>
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                  >
                    {[2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[13px] font-semibold hover:bg-[#E06612]"
                >
                  <span>Continue to File Upload</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] font-semibold text-[#1F2937]">
                    Step 2: Upload Payroll Spreadsheet (.xlsx, .xls, .csv)
                  </h3>
                  <p className="text-[13px] text-[#6B7280] mt-0.5">
                    Target Period:{' '}
                    <strong className="text-[#F47721]">
                      {MONTHS.find((m) => m.value === month)?.label} {year}
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#1F2937] text-[12.5px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Change Period</span>
                </button>
              </div>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#E5E7EB] hover:border-[#F47721] rounded-[10px] p-10 text-center cursor-pointer bg-[#F8F9FA] hover:bg-[#FFF8F3] transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                />
                <Upload className="w-9 h-9 text-[#F47721] mx-auto mb-3" />
                <div className="text-[14px] font-semibold text-[#1F2937]">
                  Drag and drop your Excel (.xlsx / .xls) or .csv file here, or click to browse
                </div>
                <div className="text-[12.5px] text-[#6B7280] mt-1">
                  Supports dynamic employee-specific salary columns.
                </div>
              </div>

              <div className="p-4 rounded-[8px] bg-[#FFF3E8] border border-[#F47721]/30 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-[#F47721] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[13px] font-semibold text-[#1F2937]">
                      Workspace Mock Excel File (`PaySlip_Studio_Mock_Payroll_Test_Data.xlsx`)
                    </div>
                    <div className="text-[12px] text-[#6B7280] mt-0.5">
                      Worksheets: September 2026, October 2026, November 2026, IMPORT_TEST
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleLoadWorkspaceMock}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[12.5px] font-semibold hover:bg-[#E06612]"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{loading ? 'Loading...' : 'Use Attached Mock Excel'}</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && uploadSummary && (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] font-semibold text-[#1F2937]">
                    Step 3: Select Worksheet from {uploadSummary.fileName}
                  </h3>
                  <p className="text-[12.5px] text-[#6B7280] mt-0.5">
                    Discovered {uploadSummary.worksheets.length} worksheet(s)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[12.5px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {uploadSummary.worksheets.map((ws) => {
                  const selected = selectedWorksheet === ws.name;
                  return (
                    <div
                      key={ws.name}
                      onClick={() => setSelectedWorksheet(ws.name)}
                      className={`p-4 rounded-[8px] border cursor-pointer transition-all ${
                        selected
                          ? 'border-[#F47721] bg-[#FFF3E8]/50'
                          : 'border-[#E5E7EB] hover:border-[#F47721]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold text-[13.5px] text-[#1F2937]">
                          <Layers className="w-4 h-4 text-[#F47721]" />
                          <span>{ws.name}</span>
                        </div>
                        <span className="text-[11.5px] font-semibold text-[#F47721] bg-[#FFF3E8] px-2 py-0.5 rounded-[5px]">
                          {Math.max(0, ws.rowCount - 1)} rows · {ws.columnCount} cols
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[#6B7280] mt-2 line-clamp-2">
                        Columns: {ws.sampleHeaders.join(' · ')}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  disabled={loading || !selectedWorksheet}
                  onClick={() => handleAnalyzeWorksheet(undefined, 4)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[13px] font-semibold hover:bg-[#E06612]"
                >
                  <span>{loading ? 'Detecting Columns...' : 'Detect & Map Columns'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && preview && (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] font-semibold text-[#1F2937]">
                    Step 4: Review & Customize Column Mappings
                  </h3>
                  <p className="text-[12.5px] text-[#6B7280] mt-0.5">
                    Review auto-detected column roles and presentation labels.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[12.5px]"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleAnalyzeWorksheet(mappings, 5)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[12.5px] font-semibold hover:bg-[#E06612]"
                  >
                    <span>{loading ? 'Validating...' : 'Validate & Preview Data'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-[#E5E7EB] rounded-[8px]">
                <table className="w-full text-left border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[#6B7280]">
                      <th className="py-2.5 px-3 font-semibold">Col</th>
                      <th className="py-2.5 px-3 font-semibold">Spreadsheet Header</th>
                      <th className="py-2.5 px-3 font-semibold">Sample Value</th>
                      <th className="py-2.5 px-3 font-semibold">Mapped Field Role</th>
                      <th className="py-2.5 px-3 font-semibold">Payslip Label</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {mappings.map((m) => (
                      <tr key={m.columnIndex} className="hover:bg-[#F8F9FA]">
                        <td className="py-2 px-3 font-mono font-semibold text-[#F47721]">
                          {m.columnLetter}
                        </td>
                        <td className="py-2 px-3 font-medium text-[#1F2937]">{m.headerText}</td>
                        <td className="py-2 px-3 text-[#6B7280] font-mono">
                          {m.sampleNonEmptyValue || <span className="italic">empty</span>}
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={m.mappedRole}
                            onChange={(e) =>
                              updateMappingItem(m.columnIndex, 'mappedRole', e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 border border-[#E5E7EB] rounded-[6px] text-[12.5px]"
                          >
                            {ROLE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={m.displayLabel}
                            onChange={(e) =>
                              updateMappingItem(m.columnIndex, 'displayLabel', e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 border border-[#E5E7EB] rounded-[6px] text-[12.5px]"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 5 */}
          {step === 5 && preview && (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-[16px] font-semibold text-[#1F2937]">
                    Step 5: Validate Imported Employee Records & Dynamic Components
                  </h3>
                  <p className="text-[12.5px] text-[#6B7280] mt-0.5">
                    Blank cells are suppressed on the payslip; numeric zero cells are preserved.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[12.5px]"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Adjust Mappings</span>
                  </button>
                  <button
                    type="button"
                    disabled={preview.validRows === 0 || preview.globalIssues.length > 0}
                    onClick={() => setStep(6)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[12.5px] font-semibold hover:bg-[#E06612]"
                  >
                    <span>Proceed to Confirmation</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-[8px] border border-[#E5E7EB] bg-[#F8F9FA]">
                  <div className="text-[11px] text-[#6B7280] font-semibold uppercase">Total Rows</div>
                  <div className="text-[18px] font-bold text-[#1F2937]">{preview.totalRows}</div>
                </div>
                <div className="p-3 rounded-[8px] border border-[#F47721]/30 bg-[#FFF3E8]">
                  <div className="text-[11px] text-[#F47721] font-semibold uppercase">Valid Rows</div>
                  <div className="text-[18px] font-bold text-[#F47721]">{preview.validRows}</div>
                </div>
                <div className="p-3 rounded-[8px] border border-[#E5E7EB] bg-[#FFFFFF]">
                  <div className="text-[11px] text-[#6B7280] font-semibold uppercase">Warnings</div>
                  <div className="text-[18px] font-bold text-[#1F2937]">
                    {preview.rowsWithWarnings}
                  </div>
                </div>
                <div className="p-3 rounded-[8px] border border-[#E5E7EB] bg-[#FFFFFF]">
                  <div className="text-[11px] text-[#6B7280] font-semibold uppercase">Errors</div>
                  <div className="text-[18px] font-bold text-[#1F2937]">{preview.rowsWithErrors}</div>
                </div>
              </div>

              <div className="overflow-x-auto border border-[#E5E7EB] rounded-[8px] max-h-[420px]">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[#1F2937]">
                      <th className="py-2 px-2.5 whitespace-nowrap">Row</th>
                      <th className="py-2 px-2.5 whitespace-nowrap">Status</th>
                      {preview.columnMappings
                        .filter((m) => m.mappedRole !== 'Ignore')
                        .map((m) => (
                          <th key={m.columnIndex} className="py-2 px-2.5 whitespace-nowrap">
                            <div>{m.displayLabel}</div>
                            <div className="text-[10.5px] text-[#F47721] font-normal">
                              {m.mappedRole}
                            </div>
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {preview.rows.map((row) => (
                      <tr key={row.rowNumber} className="hover:bg-[#F8F9FA]">
                        <td className="py-2 px-2.5 font-mono text-[#6B7280]">{row.rowNumber}</td>
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] bg-[#FFF3E8] text-[#F47721] font-semibold text-[11px]">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        </td>
                        {preview.columnMappings
                          .filter((m) => m.mappedRole !== 'Ignore')
                          .map((m) => {
                            const cell = row.cells.find((c) => c.columnIndex === m.columnIndex);
                            if (!cell || cell.sourceCellType === 'Empty') {
                              return (
                                <td key={m.columnIndex} className="py-2 px-2.5 whitespace-nowrap">
                                  <span className="text-[10.5px] px-1.5 py-0.5 rounded-[4px] bg-[#F8F9FA] text-[#9CA3AF] italic">
                                    BLANK
                                  </span>
                                </td>
                              );
                            }
                            if (cell.sourceCellType === 'NumericZero') {
                              return (
                                <td key={m.columnIndex} className="py-2 px-2.5 whitespace-nowrap">
                                  <span className="text-[10.5px] px-1.5 py-0.5 rounded-[4px] bg-[#FFF8F3] text-[#6B7280] font-mono">
                                    0.00
                                  </span>
                                </td>
                              );
                            }
                            return (
                              <td
                                key={m.columnIndex}
                                className="py-2 px-2.5 whitespace-nowrap font-medium text-[#1F2937]"
                              >
                                {cell.numericValue !== null && cell.numericValue !== undefined
                                  ? formatIndianCurrency(cell.numericValue, '₹')
                                  : cell.rawText}
                              </td>
                            );
                          })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 6 */}
          {step === 6 && preview && (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] font-semibold text-[#1F2937]">
                    Step 6: Confirm & Save Payroll Batch
                  </h3>
                  <p className="text-[12.5px] text-[#6B7280] mt-0.5">
                    Confirm to save imported employee records.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[12.5px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Grid</span>
                </button>
              </div>

              <div className="bg-[#F8F9FA] border border-[#E5E7EB] rounded-[8px] p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[12.5px]">
                <div>
                  <span className="text-[#6B7280] block">Source File & Worksheet</span>
                  <strong className="text-[#1F2937] text-[13.5px]">
                    {preview.fileName} — {preview.selectedWorksheet}
                  </strong>
                </div>
                <div>
                  <span className="text-[#6B7280] block">Target Payroll Period</span>
                  <strong className="text-[#F47721] text-[13.5px]">{preview.periodLabel}</strong>
                </div>
                <div>
                  <span className="text-[#6B7280] block">Employees to Import</span>
                  <strong className="text-[#1F2937] text-[13.5px]">
                    {preview.validRows} of {preview.totalRows} rows
                  </strong>
                </div>
              </div>

              {preview.hasExistingRecordsForPeriod && (
                <div className="p-4 rounded-[8px] bg-[#FFF3E8] border border-[#F47721]/40 space-y-2">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-[#1F2937]">
                    <AlertTriangle className="w-4 h-4 text-[#F47721]" />
                    <span>
                      Replacement Confirmation Required ({preview.existingRecordCountForPeriod} existing records in{' '}
                      {preview.periodLabel})
                    </span>
                  </div>
                  <label className="flex items-center gap-2 text-[12.5px] font-medium text-[#1F2937] pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmReplacement}
                      onChange={(e) => setConfirmReplacement(e.target.checked)}
                    />
                    <span>
                      I confirm replacing/updating the existing {preview.existingRecordCountForPeriod} payroll records for{' '}
                      {preview.periodLabel}.
                    </span>
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={loading || (preview.hasExistingRecordsForPeriod && !confirmReplacement)}
                  onClick={handleCommitBatch}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[13px] font-semibold hover:bg-[#E06612] disabled:opacity-50"
                >
                  <Table2 className="w-4 h-4" />
                  <span>
                    {loading
                      ? 'Saving Payroll Batch...'
                      : `Confirm & Import ${preview.validRows} Employees`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
