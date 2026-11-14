import React, { useState, useRef, useEffect } from 'react';
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
  Archive,
  Calendar,
  CalendarRange,
  Download,
  Trash2,
  ShieldAlert,
  Search,
  RefreshCw,
  Eye,
  Check,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { apiRequest, getStoredToken } from '../services/api';
import { getPayrollYears, notifyYearsUpdated, onYearsUpdated } from '../services/payrollYears';
import type {
  ColumnMappingDefinitionDto,
  ExcelUploadSummaryDto,
  ImportValidationPreviewDto,
  ImportPeriodMode,
  DetectedPeriodDto,
  ControlledReimportDiffDto,
  ArchiveYearGroupDto,
  ArchiveFileItemDto,
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
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'wizard' | 'archive'>('wizard');

  // Wizard state
  const [step, setStep] = useState<number>(1);
  const [importMode, setImportMode] = useState<ImportPeriodMode>('SingleMonth');
  const [month, setMonth] = useState<number>(defaultMonth ?? activeMonth ?? 10);
  const [year, setYear] = useState<number>(defaultYear ?? activeYear ?? 2026);
  const [selectedMultiMonths, setSelectedMultiMonths] = useState<number[]>([
    defaultMonth ?? activeMonth ?? 10,
  ]);

  const [uploadSummary, setUploadSummary] = useState<ExcelUploadSummaryDto | null>(null);
  const [selectedWorksheet, setSelectedWorksheet] = useState<string>('');
  const [detectedPeriods, setDetectedPeriods] = useState<DetectedPeriodDto[]>([]);
  const [mappings, setMappings] = useState<ColumnMappingDefinitionDto[]>([]);
  const [preview, setPreview] = useState<ImportValidationPreviewDto | null>(null);
  const [confirmReplacement, setConfirmReplacement] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [committedResult, setCommittedResult] = useState<any | null>(null);

  // Controlled Reimport Diff state
  const [reimportDiff, setReimportDiff] = useState<ControlledReimportDiffDto | null>(null);
  const [showReimportDiffModal, setShowReimportDiffModal] = useState<boolean>(false);
  const [diffLoading, setDiffLoading] = useState<boolean>(false);

  // Dynamic Payroll Years
  const [candidateYears, setCandidateYears] = useState<number[]>([2030, 2029, 2028, 2027, 2026, 2025]);
  const [availableYears, setAvailableYears] = useState<number[]>([2028, 2027, 2026, 2025]);

  useEffect(() => {
    const fetchYears = async () => {
      try {
        const data = await getPayrollYears();
        if (data.availableYears && data.availableYears.length > 0) {
          setAvailableYears(data.availableYears);
        }
        if (data.importCandidateYears && data.importCandidateYears.length > 0) {
          setCandidateYears(data.importCandidateYears);
        }
      } catch (e) {
        console.error('Failed to load years in ImportWizardView:', e);
      }
    };
    fetchYears();
    const unsub = onYearsUpdated(fetchYears);
    return unsub;
  }, []);

  // Archive Library state
  const [archiveData, setArchiveData] = useState<ArchiveYearGroupDto[]>([]);
  const [archiveLoading, setArchiveLoading] = useState<boolean>(false);
  const [archiveYearFilter, setArchiveYearFilter] = useState<number | null>(null);
  const [archiveSearch, setArchiveSearch] = useState<string>('');
  const [collapsedYears, setCollapsedYears] = useState<Record<number, boolean>>({});

  const toggleYearCollapse = (y: number) => {
    setCollapsedYears((prev) => ({
      ...prev,
      [y]: !prev[y],
    }));
  };

  const toggleCollapseAll = (collapse: boolean) => {
    const updated: Record<number, boolean> = {};
    archiveData.forEach((yg) => {
      updated[yg.year] = collapse;
    });
    setCollapsedYears(updated);
  };

  // Safe file delete modal
  const [safeDeleteFile, setSafeDeleteFile] = useState<ArchiveFileItemDto | null>(null);
  const [safeDeleteLoading, setSafeDeleteLoading] = useState<boolean>(false);

  // Protected batch removal modal
  const [batchToRemove, setBatchToRemove] = useState<ArchiveFileItemDto | null>(null);
  const [removalSafety, setRemovalSafety] = useState<any | null>(null);
  const [forceRemove, setForceRemove] = useState<boolean>(false);
  const [removalLoading, setRemovalLoading] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const notifyComplete = (m: number, y: number) => {
    if (onImportCommitted) onImportCommitted(m, y);
    else if (onImportCompleted) onImportCompleted(m, y);
  };

  // Load Archive data
  const loadArchive = async () => {
    setArchiveLoading(true);
    try {
      let query = '';
      const params = new URLSearchParams();
      if (archiveYearFilter) params.append('year', String(archiveYearFilter));
      if (archiveSearch.trim()) params.append('search', archiveSearch.trim());
      if (params.toString()) query = `?${params.toString()}`;

      const data = await apiRequest<ArchiveYearGroupDto[]>(`/api/payroll/import/archive${query}`);
      setArchiveData(data || []);
    } catch (err: any) {
      console.error('Failed to load payroll archive:', err);
    } finally {
      setArchiveLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'archive') {
      loadArchive();
    }
  }, [activeTab, archiveYearFilter, archiveSearch]);

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
      form.append('importMode', importMode);
      if (importMode === 'MultipleMonths') {
        form.append('requestedMonths', JSON.stringify(selectedMultiMonths));
      }

      const summary = await apiRequest<ExcelUploadSummaryDto>('/api/payroll/import/upload', {
        method: 'POST',
        body: form,
      });

      setUploadSummary(summary);
      setSelectedWorksheet(summary.selectedWorksheet);
      setDetectedPeriods(summary.detectedPeriods || []);
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
          body: JSON.stringify({
            month,
            year,
            importMode,
            requestedMonths: importMode === 'MultipleMonths' ? selectedMultiMonths : null,
          }),
        }
      );
      setUploadSummary(summary);
      setSelectedWorksheet(summary.selectedWorksheet);
      setDetectedPeriods(summary.detectedPeriods || []);
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

    // Check if multiple periods are selected
    const selectedPeriods = detectedPeriods.filter((p) => p.isSelected);

    if (selectedPeriods.length > 1 && (importMode === 'FullYear' || importMode === 'MultipleMonths' || importMode === 'AutoDetect')) {
      // Multi-period commit
      setError(null);
      setLoading(true);
      try {
        const res = await apiRequest(`/api/payroll/import/${uploadSummary.importBatchId}/commit-multi`, {
          method: 'POST',
          body: JSON.stringify({
            selectedPeriods: selectedPeriods.map((p) => ({
              month: p.month,
              year: p.year,
              worksheetName: p.worksheetName || selectedWorksheet,
            })),
            allowReplaceExisting: confirmReplacement || !preview.hasExistingRecordsForPeriod,
          }),
        });
        setCommittedResult({
          importedRows: res.totalEmployeesImported,
          worksheet: `${res.totalPeriodsImported} periods [${res.importedPeriodLabels?.join(', ')}]`,
          periodsImported: res.importedPeriodLabels,
        });
        notifyYearsUpdated();
      } catch (err: any) {
        setError(err.message || 'Multi-period import commit failed.');
      } finally {
        setLoading(false);
      }
      return;
    }

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
      notifyYearsUpdated();
    } catch (err: any) {
      setError(err.message || 'Import commit failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchControlledDiff = async () => {
    if (!uploadSummary) return;
    setDiffLoading(true);
    setError(null);
    try {
      const diff = await apiRequest<ControlledReimportDiffDto>(
        `/api/payroll/import/${uploadSummary.importBatchId}/reimport-diff`,
        {
          method: 'POST',
          body: JSON.stringify({
            month,
            year,
            worksheetName: selectedWorksheet,
          }),
        }
      );
      setReimportDiff(diff);
      setShowReimportDiffModal(true);
    } catch (err: any) {
      setError(err.message || 'Failed to generate controlled reimport comparison.');
    } finally {
      setDiffLoading(false);
    }
  };

  const handleDownloadArchivedFile = async (item: ArchiveFileItemDto) => {
    try {
      const token = getStoredToken();
      const res = await fetch(`/api/payroll/import/archive/${item.importBatchId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('File download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Download error: ${err.message}`);
    }
  };

  const handleConfirmSafeDeleteFile = async () => {
    if (!safeDeleteFile) return;
    setSafeDeleteLoading(true);
    try {
      await apiRequest(`/api/payroll/import/archive/${safeDeleteFile.importBatchId}/file`, {
        method: 'DELETE',
      });
      setSafeDeleteFile(null);
      loadArchive();
    } catch (err: any) {
      alert(`Deletion error: ${err.message}`);
    } finally {
      setSafeDeleteLoading(false);
    }
  };

  const handleCheckBatchSafetyAndOpenModal = async (file: ArchiveFileItemDto) => {
    setBatchToRemove(file);
    setForceRemove(false);
    try {
      const safety = await apiRequest(`/api/payroll/import/archive/${file.importBatchId}/safety`);
      setRemovalSafety(safety);
    } catch {
      setRemovalSafety(null);
    }
  };

  const handleConfirmRemoveBatch = async () => {
    if (!batchToRemove) return;
    setRemovalLoading(true);
    try {
      await apiRequest(
        `/api/payroll/import/archive/${batchToRemove.importBatchId}/batch?force=${forceRemove}`,
        {
          method: 'DELETE',
        }
      );
      setBatchToRemove(null);
      setRemovalSafety(null);
      loadArchive();
      notifyYearsUpdated();
    } catch (err: any) {
      alert(`Batch removal failed: ${err.message}`);
    } finally {
      setRemovalLoading(false);
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

  const togglePeriodSelection = (idx: number) => {
    setDetectedPeriods((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, isSelected: !p.isSelected } : p))
    );
  };

  const stepsMeta = [
    { num: 1, title: '1. Period Selection' },
    { num: 2, title: '2. Upload File' },
    { num: 3, title: '3. Worksheet & Detection' },
    { num: 4, title: '4. Map Columns' },
    { num: 5, title: '5. Validate Grid' },
    { num: 6, title: '6. Confirm Import' },
  ];

  return (
    <div className="space-y-5">
      {/* Page Header with Tab Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold text-[#1F2937]">Import Payroll Excel</h1>
          <p className="text-[13px] text-[#6B7280]">
            Flexible annual & monthly spreadsheet imports with permanent year-wise archive protection.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-[#F3F4F6] p-1 rounded-[8px]">
          <button
            type="button"
            onClick={() => setActiveTab('wizard')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[6px] text-[12.5px] font-semibold transition-all ${
              activeTab === 'wizard'
                ? 'bg-[#FFFFFF] text-[#F47721] shadow-sm'
                : 'text-[#6B7280] hover:text-[#1F2937]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Wizard</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('archive')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[6px] text-[12.5px] font-semibold transition-all ${
              activeTab === 'archive'
                ? 'bg-[#FFFFFF] text-[#F47721] shadow-sm'
                : 'text-[#6B7280] hover:text-[#1F2937]'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Payroll Archive & Library</span>
          </button>
        </div>
      </div>

      {activeTab === 'archive' ? (
        /* ARCHIVE & FILE MANAGEMENT VIEW */
        <div className="space-y-5">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1F2937]">
                  Permanent Payroll Archive & Library
                </h3>
                <p className="text-[12.5px] text-[#6B7280]">
                  Year-wise historical index. Source files are permanently retained under FINORA_DATA/Payroll_Archive.
                </p>
              </div>

              {/* Search & Filter */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={archiveSearch}
                    onChange={(e) => setArchiveSearch(e.target.value)}
                    placeholder="Search by file or sheet name..."
                    className="pl-8 pr-3 py-1.5 text-[12.5px] border border-[#E5E7EB] rounded-[7px] w-56 focus:outline-none focus:border-[#F47721]"
                  />
                </div>
                <button
                  type="button"
                  onClick={loadArchive}
                  className="p-2 border border-[#E5E7EB] rounded-[7px] hover:border-[#F47721] text-[#6B7280]"
                  title="Refresh archive"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${archiveLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Year Filters & Global Collapse/Expand */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#F3F4F6]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium text-[#6B7280]">Filter Year:</span>
                <button
                  type="button"
                  onClick={() => setArchiveYearFilter(null)}
                  className={`px-3 py-1 rounded-[6px] text-[12px] font-semibold transition-all ${
                    archiveYearFilter === null
                      ? 'bg-[#F47721] text-[#FFFFFF]'
                      : 'bg-[#F8F9FA] text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  All Years
                </button>
                {Array.from(
                  new Set([...availableYears, ...archiveData.map((d) => d.year)])
                )
                  .sort((a, b) => b - a)
                  .map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setArchiveYearFilter(y)}
                      className={`px-3 py-1 rounded-[6px] text-[12px] font-semibold transition-all ${
                        archiveYearFilter === y
                          ? 'bg-[#F47721] text-[#FFFFFF]'
                          : 'bg-[#F8F9FA] text-[#6B7280] hover:text-[#1F2937]'
                      }`}
                    >
                      {y}
                    </button>
                  ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleCollapseAll(false)}
                  className="px-2.5 py-1 rounded-[6px] text-[11.5px] font-semibold text-[#6B7280] hover:text-[#F47721] hover:bg-[#FFF3E8] border border-[#E5E7EB] transition-colors"
                >
                  Expand All
                </button>
                <button
                  type="button"
                  onClick={() => toggleCollapseAll(true)}
                  className="px-2.5 py-1 rounded-[6px] text-[11.5px] font-semibold text-[#6B7280] hover:text-[#F47721] hover:bg-[#FFF3E8] border border-[#E5E7EB] transition-colors"
                >
                  Collapse All
                </button>
              </div>
            </div>
          </div>

          {archiveLoading ? (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-12 text-center text-[#6B7280] text-[13px]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#F47721] mb-2" />
              Loading payroll archive history...
            </div>
          ) : archiveData.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-12 text-center text-[#6B7280] text-[13px]">
              <Archive className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
              No archived payroll records found for the selected filter.
            </div>
          ) : (
            archiveData.map((yg) => {
              const isCollapsed = Boolean(collapsedYears[yg.year]);
              return (
                <div
                  key={yg.year}
                  className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-5 space-y-4 transition-all"
                >
                  <div
                    onClick={() => toggleYearCollapse(yg.year)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleYearCollapse(yg.year);
                      }
                    }}
                    className={`flex items-center justify-between cursor-pointer select-none transition-colors group ${
                      isCollapsed ? '' : 'border-b border-[#F3F4F6] pb-3'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-[18px] font-bold text-[#1F2937] group-hover:text-[#F47721] transition-colors">
                        {yg.year}
                      </span>
                      <span className="text-[12px] text-[#F47721] font-medium">
                        {yg.months.filter((m) => m.isImported).length} of 12 Months Imported
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-[12px] text-[#6B7280] hidden sm:inline">
                        Storage Directory:{' '}
                        <code className="font-mono text-[#1F2937]">
                          FINORA_DATA/Payroll_Archive/{yg.year}/
                        </code>
                      </span>
                      <div className="flex items-center gap-1 text-[12px] text-[#6B7280] group-hover:text-[#F47721] transition-colors">
                        <span>{isCollapsed ? 'Expand' : 'Collapse'}</span>
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#F47721]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#F47721]" />
                        )}
                      </div>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <>

                {/* 12 Months Grid */}
                <div>
                  <h4 className="text-[12.5px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2.5">
                    Monthly Payroll Records Status
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                    {yg.months.map((m) => (
                      <div
                        key={m.month}
                        className={`p-3 rounded-[8px] border transition-all ${
                          m.isImported
                            ? 'bg-[#FFFFFF] border-[#F47721]/30 hover:shadow-sm'
                            : 'bg-[#F9FAFB] border-[#E5E7EB]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[12.5px] font-semibold text-[#1F2937]">{m.monthName}</span>
                          {m.isImported ? (
                            <span className="text-[10.5px] font-semibold text-[#16A34A] flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> Imported
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#9CA3AF]">Not Imported</span>
                          )}
                        </div>

                        {m.isImported ? (
                          <div className="mt-2 text-[11.5px] space-y-1">
                            <div className="text-[#6B7280]">
                              Employees: <strong className="text-[#1F2937]">{m.employeeCount}</strong>
                            </div>
                            <div className="text-[#6B7280]">
                              Net: <strong className="text-[#F47721]">{formatIndianCurrency(m.totalNetPayroll, '₹')}</strong>
                            </div>
                            <button
                              type="button"
                              onClick={() => notifyComplete(m.month, yg.year)}
                              className="w-full mt-1.5 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-[5px] bg-[#FFF3E8] text-[#F47721] font-semibold text-[11px] hover:bg-[#F47721] hover:text-[#FFFFFF] transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Open Payslips</span>
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2 text-[11px] text-[#9CA3AF] italic">No records imported</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                      {/* Archived Files Table */}
                      {yg.archivedFiles.length > 0 && (
                        <div className="pt-2">
                          <h4 className="text-[12.5px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2.5">
                            Archived Original Excel Files ({yg.archivedFiles.length})
                          </h4>
                          <div className="overflow-x-auto border border-[#E5E7EB] rounded-[8px]">
                            <table className="w-full text-left border-collapse text-[12px]">
                              <thead>
                                <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[#6B7280]">
                                  <th className="py-2 px-3 font-semibold">Original File Name</th>
                                  <th className="py-2 px-3 font-semibold">Mode & Periods</th>
                                  <th className="py-2 px-3 font-semibold">Import Date & User</th>
                                  <th className="py-2 px-3 font-semibold">File Retention</th>
                                  <th className="py-2 px-3 font-semibold text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#E5E7EB]">
                                {yg.archivedFiles.map((f) => (
                                  <tr key={f.importBatchId} className="hover:bg-[#F8F9FA]">
                                    <td className="py-2.5 px-3">
                                      <div className="font-semibold text-[#1F2937] flex items-center gap-1.5">
                                        <FileSpreadsheet className="w-4 h-4 text-[#F47721] shrink-0" />
                                        <span>{f.fileName}</span>
                                      </div>
                                      <div className="text-[10.5px] text-[#9CA3AF] font-mono mt-0.5">
                                        SHA-256: {f.fileSha256 ? f.fileSha256.substring(0, 16) + '...' : 'N/A'}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className="inline-block px-1.5 py-0.5 rounded-[4px] bg-[#F3F4F6] text-[#4B5563] text-[10.5px] font-medium mr-1 mb-1">
                                        {f.importMode || 'SingleMonth'}
                                      </span>
                                      <div className="text-[11px] text-[#6B7280]">
                                        {f.detectedPeriods && f.detectedPeriods.length > 0
                                          ? f.detectedPeriods.join(', ')
                                          : 'Period verified'}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-[#6B7280]">
                                      <div>{new Date(f.importDateUtc).toLocaleDateString()}</div>
                                      <div className="text-[11px] text-[#9CA3AF]">{f.importedBy}</div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      {f.sourceFileRetentionStatus === 'Retained' && f.physicalFileExists ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded-[4px]">
                                          <Check className="w-3 h-3" /> Retained On Disk
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded-[4px]">
                                          <AlertTriangle className="w-3 h-3" /> File Removed (Records Intact)
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right">
                                      <div className="inline-flex items-center gap-1.5">
                                        {f.sourceFileRetentionStatus === 'Retained' && f.physicalFileExists && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleDownloadArchivedFile(f)}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[5px] bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#F47721] text-[#1F2937] text-[11.5px] font-medium"
                                              title="Download original imported Excel file"
                                            >
                                              <Download className="w-3 h-3 text-[#F47721]" />
                                              <span>Download</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setSafeDeleteFile(f)}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[5px] bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#DC2626] text-[#DC2626] text-[11.5px] font-medium"
                                              title="Delete source file from disk (preserves all payroll records)"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                              <span>Delete File</span>
                                            </button>
                                          </>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleCheckBatchSafetyAndOpenModal(f)}
                                          className="p-1 rounded-[5px] text-[#9CA3AF] hover:text-[#DC2626] hover:bg-[#FEE2E2]"
                                          title="Remove Batch (Admin Only)"
                                        >
                                          <ShieldAlert className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* IMPORT WIZARD FLOW (Steps 1 to 6) */
        <>
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
                Imported <strong>{committedResult.importedRows}</strong> employee payroll records from{' '}
                <strong>{committedResult.worksheet}</strong> into{' '}
                <strong>
                  {committedResult.periodsImported && committedResult.periodsImported.length > 0
                    ? committedResult.periodsImported.join(', ')
                    : `${MONTHS.find((m) => m.value === month)?.label} ${year}`}
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
              {/* STEP 1: PERIOD SELECTION MODE */}
              {step === 1 && (
                <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-6">
                  <div>
                    <h3 className="text-[16px] font-semibold text-[#1F2937]">
                      Step 1: Flexible Payroll Period Selection
                    </h3>
                    <p className="text-[13px] text-[#6B7280] mt-0.5">
                      Choose how FINORA should identify and process the payroll periods in your spreadsheet.
                    </p>
                  </div>

                  {/* Mode Selector Cards */}
                  <div>
                    <label className="block text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">
                      Import Period Mode
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        {
                          id: 'SingleMonth',
                          title: 'Single Month',
                          icon: Calendar,
                        },
                        {
                          id: 'FullYear',
                          title: 'Full Year',
                          icon: CalendarRange,
                        },
                        {
                          id: 'MultipleMonths',
                          title: 'Multiple Months',
                          icon: Layers,
                        },
                        {
                          id: 'AutoDetect',
                          title: 'Auto Detect from Excel',
                          icon: Sparkles,
                        },
                      ].map((m) => {
                        const Icon = m.icon;
                        const isSelected = importMode === m.id;
                        return (
                          <div
                            key={m.id}
                            onClick={() => setImportMode(m.id as ImportPeriodMode)}
                            className={`px-3.5 py-2.5 rounded-[8px] border cursor-pointer transition-all flex items-center gap-2.5 ${
                              isSelected
                                ? 'border-[#F47721] bg-[#FFF3E8]/60 shadow-sm ring-1 ring-[#F47721]/30'
                                : 'border-[#E5E7EB] hover:border-[#F47721]/40 bg-[#FFFFFF] hover:bg-[#F9FAFB]'
                            }`}
                          >
                            <div
                              className={`w-7 h-7 rounded-[6px] shrink-0 flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-[#F47721] text-[#FFFFFF]' : 'bg-[#F3F4F6] text-[#6B7280]'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-semibold text-[13px] text-[#1F2937] truncate">{m.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dynamic Controls per Mode */}
                  <div className="p-4 rounded-[8px] bg-[#F8F9FA] border border-[#E5E7EB] space-y-4">
                    {importMode === 'SingleMonth' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                        <div>
                          <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                            Payroll Month
                          </label>
                          <select
                            value={month}
                            onChange={(e) => setMonth(Number(e.target.value))}
                            className="w-full px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
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
                            className="w-full px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
                          >
                            {Array.from(new Set([year, ...candidateYears]))
                              .sort((a, b) => b - a)
                              .map((y) => (
                                <option key={y} value={y}>
                                  {y}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {importMode === 'FullYear' && (
                      <div className="space-y-3 max-w-md">
                        <div>
                          <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                            Target Payroll Year
                          </label>
                          <select
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            className="w-full px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
                          >
                            {Array.from(new Set([year, ...candidateYears]))
                              .sort((a, b) => b - a)
                              .map((y) => (
                                <option key={y} value={y}>
                                  {y}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="text-[12px] text-[#6B7280] flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                          <span>FINORA will auto-detect and import all 12 monthly sheets available for {year}.</span>
                        </div>
                      </div>
                    )}

                    {importMode === 'MultipleMonths' && (
                      <div className="space-y-3">
                        <div className="max-w-xs">
                          <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                            Target Payroll Year
                          </label>
                          <select
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            className="w-full px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
                          >
                            {Array.from(new Set([year, ...candidateYears]))
                              .sort((a, b) => b - a)
                              .map((y) => (
                                <option key={y} value={y}>
                                  {y}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[12px] font-medium text-[#6B7280] mb-2">
                            Select Months to Import ({selectedMultiMonths.length} selected):
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                            {MONTHS.map((m) => {
                              const checked = selectedMultiMonths.includes(m.value);
                              return (
                                <button
                                  key={m.value}
                                  type="button"
                                  onClick={() => {
                                    if (checked) {
                                      if (selectedMultiMonths.length > 1) {
                                        setSelectedMultiMonths(selectedMultiMonths.filter((v) => v !== m.value));
                                      }
                                    } else {
                                      setSelectedMultiMonths([...selectedMultiMonths, m.value]);
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-[6px] text-[12px] font-semibold border transition-all ${
                                    checked
                                      ? 'bg-[#F47721] text-[#FFFFFF] border-[#F47721]'
                                      : 'bg-[#FFFFFF] text-[#6B7280] border-[#E5E7EB] hover:border-[#F47721]/50'
                                  }`}
                                >
                                  {m.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {importMode === 'AutoDetect' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[13px] font-medium text-[#1F2937]">
                          <Sparkles className="w-4 h-4 text-[#F47721]" />
                          <span>Intelligent Workbook & Payroll Period Detection</span>
                        </div>
                        <p className="text-[12px] text-[#6B7280] max-w-xl">
                          Upload your spreadsheet. FINORA will scan worksheet titles, date headers, and row period cells to detect all payroll periods across single or multiple years.
                        </p>
                      </div>
                    )}
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

              {/* STEP 2: UPLOAD FILE */}
              {step === 2 && (
                <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-[16px] font-semibold text-[#1F2937]">
                        Step 2: Upload Payroll Spreadsheet (.xlsx, .xls, .csv)
                      </h3>
                      <p className="text-[13px] text-[#6B7280] mt-0.5">
                        Selected Mode: <strong className="text-[#F47721]">{importMode}</strong> · Year:{' '}
                        <strong className="text-[#1F2937]">{year}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#1F2937] text-[12.5px]"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Change Mode</span>
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
                      Permanent Year-Wise Archive will store original workbook under <code className="font-mono text-[#F47721]">FINORA_DATA/Payroll_Archive/{year}/</code>
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

              {/* STEP 3: SMART FILE ANALYSIS & WORKSHEET SELECTION */}
              {step === 3 && uploadSummary && (
                <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-[16px] font-semibold text-[#1F2937]">
                        Step 3: Smart File Analysis & Worksheet Inspection
                      </h3>
                      <p className="text-[12.5px] text-[#6B7280] mt-0.5">
                        Uploaded File: <strong className="text-[#1F2937]">{uploadSummary.fileName}</strong> (
                        {(uploadSummary.fileSizeBytes / 1024).toFixed(1)} KB)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[12.5px]"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Upload</span>
                    </button>
                  </div>

                  {/* Duplicate Detection Alert Banner */}
                  {uploadSummary.isDuplicateFile && (
                    <div className="p-4 rounded-[8px] bg-[#FEF3C7] border border-[#F59E0B]/40 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
                        <div>
                          <div className="text-[13.5px] font-semibold text-[#92400E]">
                            Duplicate Import Detected
                          </div>
                          <p className="text-[12px] text-[#78350F] mt-0.5">
                            This workbook matches a previously committed import (SHA-256:{' '}
                            <code className="font-mono">{uploadSummary.fileSha256.substring(0, 16)}...</code>).
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('archive');
                          }}
                          className="px-3 py-1.5 rounded-[6px] bg-[#FFFFFF] border border-[#D97706] text-[#92400E] text-[12px] font-semibold hover:bg-[#FEF3C7]"
                        >
                          View Previous Import in Archive
                        </button>
                        <button
                          type="button"
                          disabled={diffLoading}
                          onClick={handleFetchControlledDiff}
                          className="px-3 py-1.5 rounded-[6px] bg-[#F47721] text-[#FFFFFF] text-[12px] font-semibold hover:bg-[#E06612]"
                        >
                          {diffLoading ? 'Analyzing Changes...' : 'Continue with Controlled Reimport'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadSummary(null);
                            setStep(1);
                          }}
                          className="px-3 py-1.5 rounded-[6px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280] text-[12px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Detected Payroll Periods Summary Table */}
                  {detectedPeriods.length > 0 && (
                    <div className="space-y-2 border border-[#E5E7EB] rounded-[8px] p-4 bg-[#F8F9FA]">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-[#1F2937]">
                          Detected Payroll Periods ({detectedPeriods.length})
                        </span>
                        <span className="text-[11.5px] text-[#6B7280]">
                          Check periods you wish to import:
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[12px]">
                          <thead>
                            <tr className="border-b border-[#E5E7EB] text-[#6B7280]">
                              <th className="py-1.5 px-2 w-8">Import</th>
                              <th className="py-1.5 px-2">Period</th>
                              <th className="py-1.5 px-2">Worksheet</th>
                              <th className="py-1.5 px-2">Employees Detected</th>
                              <th className="py-1.5 px-2">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E5E7EB]">
                            {detectedPeriods.map((dp, idx) => (
                              <tr key={`${dp.year}-${dp.month}`} className="hover:bg-[#FFFFFF]">
                                <td className="py-2 px-2">
                                  <input
                                    type="checkbox"
                                    checked={dp.isSelected}
                                    onChange={() => togglePeriodSelection(idx)}
                                    className="rounded border-[#D1D5DB] text-[#F47721]"
                                  />
                                </td>
                                <td className="py-2 px-2 font-semibold text-[#1F2937]">
                                  {dp.periodLabel}
                                </td>
                                <td className="py-2 px-2 text-[#6B7280]">{dp.worksheetName}</td>
                                <td className="py-2 px-2 font-medium text-[#1F2937]">
                                  {dp.employeeCount}
                                </td>
                                <td className="py-2 px-2">
                                  {dp.hasExistingRecords ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded-[4px]">
                                      <AlertTriangle className="w-3 h-3" /> Existing Records ({dp.existingRecordCount})
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded-[4px]">
                                      <Check className="w-3 h-3" /> Ready for Validation
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Worksheets Grid */}
                  <div>
                    <label className="block text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">
                      Primary Worksheet to Preview & Map Columns
                    </label>
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
                              <span className="text-[12px] font-semibold text-[#F47721]">
                                ({Math.max(0, ws.rowCount - 1)} rows · {ws.columnCount} cols)
                              </span>
                            </div>
                            <div className="text-[11.5px] text-[#6B7280] mt-2 line-clamp-2">
                              Columns: {ws.sampleHeaders.join(' · ')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
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

              {/* STEP 4: COLUMN MAPPINGS */}
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

              {/* STEP 5: VALIDATE GRID */}
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

              {/* STEP 6: CONFIRM & COMMIT */}
              {step === 6 && preview && (
                <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-[16px] font-semibold text-[#1F2937]">
                        Step 6: Confirm & Save Payroll Batch
                      </h3>
                      <p className="text-[12.5px] text-[#6B7280] mt-0.5">
                        Confirm to save imported employee records into permanent archive.
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
        </>
      )}

      {/* CONTROLLED REIMPORT DIFF MODAL */}
      {showReimportDiffModal && reimportDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[#FFFFFF] rounded-[10px] shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-[#F47721]" />
                <h3 className="text-[17px] font-bold text-[#1F2937]">
                  Controlled Reimport Comparison — {reimportDiff.periodLabel}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReimportDiffModal(false)}
                className="p-1 rounded-[5px] text-[#9CA3AF] hover:text-[#1F2937]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-[12px]">
              <div className="p-3 rounded-[8px] bg-[#DCFCE7] text-[#16A34A] font-semibold">
                <div className="text-[18px]">{reimportDiff.addedCount}</div>
                <div>New Employees (Added)</div>
              </div>
              <div className="p-3 rounded-[8px] bg-[#FEF3C7] text-[#D97706] font-semibold">
                <div className="text-[18px]">{reimportDiff.updatedCount}</div>
                <div>Employees with Changes</div>
              </div>
              <div className="p-3 rounded-[8px] bg-[#F3F4F6] text-[#6B7280] font-semibold">
                <div className="text-[18px]">{reimportDiff.unchangedCount}</div>
                <div>Unchanged Records</div>
              </div>
            </div>

            {reimportDiff.updatedRows.length > 0 && (
              <div>
                <h4 className="text-[13px] font-semibold text-[#1F2937] mb-2">Changed Employee Records:</h4>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {reimportDiff.updatedRows.map((u) => (
                    <div key={u.employeeCode} className="p-2.5 rounded-[6px] bg-[#F8F9FA] border border-[#E5E7EB] text-[12px]">
                      <div className="font-semibold text-[#1F2937]">
                        {u.employeeName} ({u.employeeCode})
                      </div>
                      <div className="text-[11px] text-[#D97706] mt-1 space-y-0.5">
                        {u.changedFields?.map((cf, i) => (
                          <div key={i}>• {cf}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-3 rounded-[6px] bg-[#FFF3E8] border border-[#F47721]/30 text-[12px] text-[#1F2937]">
              Controlled reimport will safely update changed records within an atomic database transaction. Previous version snapshot will be logged in the audit ledger.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReimportDiffModal(false)}
                className="px-4 py-2 rounded-[7px] border border-[#E5E7EB] text-[13px] font-medium"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowReimportDiffModal(false);
                  setConfirmReplacement(true);
                  setStep(4);
                }}
                className="px-4 py-2 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[13px] font-semibold hover:bg-[#E06612]"
              >
                Accept & Proceed to Column Mapping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAFE DELETE ORIGINAL FILE MODAL */}
      {safeDeleteFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[#FFFFFF] rounded-[10px] shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#DC2626]">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-[17px] font-bold text-[#1F2937]">Delete Imported Excel File?</h3>
            </div>
            <p className="text-[13px] text-[#4B5563] leading-relaxed">
              This action will remove the selected original Excel source file (<strong>{safeDeleteFile.fileName}</strong>) from the FINORA import archive disk.
            </p>
            <div className="p-3 rounded-[6px] bg-[#DCFCE7] border border-[#16A34A]/30 text-[12px] text-[#166534]">
              <strong>Data Protection Guarantee:</strong> All previously processed payroll records, payslips, email logs, and historical data will remain completely intact.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSafeDeleteFile(null)}
                className="px-4 py-2 rounded-[7px] border border-[#E5E7EB] text-[13px] font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={safeDeleteLoading}
                onClick={handleConfirmSafeDeleteFile}
                className="px-4 py-2 rounded-[7px] bg-[#DC2626] text-[#FFFFFF] text-[13px] font-semibold hover:bg-[#B91C1C]"
              >
                {safeDeleteLoading ? 'Deleting...' : 'Delete Original File'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROTECTED BATCH REMOVAL MODAL (ADMIN ONLY) */}
      {batchToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[#FFFFFF] rounded-[10px] shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#DC2626]">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="text-[17px] font-bold text-[#1F2937]">Remove Entire Payroll Batch</h3>
            </div>
            <p className="text-[13px] text-[#4B5563]">
              You are about to remove the entire batch for <strong>{batchToRemove.fileName}</strong>.
            </p>

            {removalSafety && removalSafety.warnings && removalSafety.warnings.length > 0 && (
              <div className="p-3 rounded-[6px] bg-[#FEE2E2] border border-[#DC2626]/30 text-[12px] text-[#991B1B] space-y-1">
                <strong>Safety Warnings:</strong>
                {removalSafety.warnings.map((w: string, i: number) => (
                  <div key={i}>• {w}</div>
                ))}
              </div>
            )}

            {removalSafety && !removalSafety.canRemove && (
              <label className="flex items-center gap-2 text-[12px] font-semibold text-[#DC2626] cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceRemove}
                  onChange={(e) => setForceRemove(e.target.checked)}
                />
                <span>Administrator Force Override (I understand the audit implications)</span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setBatchToRemove(null);
                  setRemovalSafety(null);
                }}
                className="px-4 py-2 rounded-[7px] border border-[#E5E7EB] text-[13px] font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removalLoading || (removalSafety && !removalSafety.canRemove && !forceRemove)}
                onClick={handleConfirmRemoveBatch}
                className="px-4 py-2 rounded-[7px] bg-[#DC2626] text-[#FFFFFF] text-[13px] font-semibold hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {removalLoading ? 'Removing Batch...' : 'Confirm Remove Batch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
