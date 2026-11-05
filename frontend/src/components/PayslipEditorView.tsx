import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Save,
  Loader2,
  RotateCcw,
  FileDown,
  Send,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Maximize2,
  Minimize2,
  ArrowUp,
  ArrowDown,
  FileText,
  User,
  Wallet,
  MinusCircle,
  Info,
  StickyNote,
  Layout,
  Sliders,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Eye,
  Layers,
  Upload,
  Image as ImageIcon,
  Building2,
  Table,
  TableProperties,
} from 'lucide-react';
import { apiRequest, getAuthorizedDownloadUrl } from '../services/api';
import type {
  CustomPayslipTable,
  EditorComponentItemDto,
  EmailTemplateItem,
  EmployeeSearchItem,
  PayslipDocumentModel,
  PayslipTemplateConfig,
  PayslipTemplateItem,
  ResolvedPayslipComponentRow,
  ResolvedPayslipTextField,
} from '../types/payroll';
import { PayslipA4Paper, formatIndianCurrency } from './PayslipA4Paper';

interface PayslipEditorViewProps {
  activeMonth: number;
  activeYear: number;
  initialRecordId?: string | null;
  canEdit: boolean;
  onMonthYearChange: (month: number, year: number) => void;
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

type LeftEditorTab = 'details' | 'earnings' | 'deductions' | 'custom-tables' | 'other' | 'notes';
type RightPreviewTab = 'preview' | 'template';

const STANDARD_METADATA_FIELDS = [
  { key: 'meta_location', label: 'Location', matchLabels: ['location', 'work location', 'branch', 'city', 'office location', 'place of posting'] },
  { key: 'meta_doj', label: 'Date of Joining', matchLabels: ['date of joining', 'doj', 'joining date', 'date joined'] },
  { key: 'meta_pan', label: 'PAN Number', matchLabels: ['pan', 'pan number', 'pan no', 'pan card', 'income tax pan'] },
  { key: 'meta_bank', label: 'Bank Account', matchLabels: ['bank account', 'account number', 'bank a/c', 'account no', 'bank account no', 'bank account number', 'a/c no'] },
];

const UNITS_MAP = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS_MAP = [
  'Zero', 'Ten', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function numberToIndianWords(num: number): string {
  let n = Math.floor(Math.abs(num));
  if (n === 0) return 'Zero';
  const parts: string[] = [];

  if (Math.floor(n / 10000000) > 0) {
    parts.push(`${numberToIndianWords(Math.floor(n / 10000000))} Crore`);
    n %= 10000000;
  }
  if (Math.floor(n / 100000) > 0) {
    parts.push(`${numberToIndianWords(Math.floor(n / 100000))} Lakh`);
    n %= 100000;
  }
  if (Math.floor(n / 1000) > 0) {
    parts.push(`${numberToIndianWords(Math.floor(n / 1000))} Thousand`);
    n %= 1000;
  }
  if (Math.floor(n / 100) > 0) {
    parts.push(`${numberToIndianWords(Math.floor(n / 100))} Hundred`);
    n %= 100;
  }
  if (n > 0) {
    if (n < 20) {
      parts.push(UNITS_MAP[n]);
    } else {
      let tenWord = TENS_MAP[Math.floor(n / 10)];
      if (n % 10 > 0) tenWord += `-${UNITS_MAP[n % 10]}`;
      parts.push(tenWord);
    }
  }
  return parts.join(' ');
}

function convertAmountToIndianWordsClient(amount: number, currencyCode = 'INR'): string {
  if (!Number.isFinite(amount) || amount === 0) return 'Rupees Zero Only';
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);
  const prefix = currencyCode.toUpperCase() === 'INR' ? 'Rupees' : currencyCode.toUpperCase();
  let words = `${prefix} ${numberToIndianWords(rupees)}`;
  if (paise > 0) {
    words += ` and ${numberToIndianWords(paise)} Paise`;
  }
  words += ' Only';
  return isNegative ? `Minus ${words}` : words;
}

export const PayslipEditorView: React.FC<PayslipEditorViewProps> = ({
  activeMonth,
  activeYear,
  initialRecordId,
  canEdit,
  onMonthYearChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [employeesInPeriod, setEmployeesInPeriod] = useState<EmployeeSearchItem[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(initialRecordId || null);
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState<string | null>(null);

  const [serverDoc, setServerDoc] = useState<PayslipDocumentModel | null>(null);
  const [templates, setTemplates] = useState<PayslipTemplateItem[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateItem[]>([]);

  // Local Editable Draft State (isolated per selected employee & period)
  const [empCodeEdit, setEmpCodeEdit] = useState('');
  const [empNameEdit, setEmpNameEdit] = useState('');
  const [empEmailEdit, setEmpEmailEdit] = useState('');
  const [empDeptEdit, setEmpDeptEdit] = useState('');
  const [empDesigEdit, setEmpDesigEdit] = useState('');
  const [grossEdit, setGrossEdit] = useState<string>('');
  const [deductionsTotalEdit, setDeductionsTotalEdit] = useState<string>('');
  const [netSalaryEdit, setNetSalaryEdit] = useState<string>('');
  const [footerNotesEdit, setFooterNotesEdit] = useState<string>('');
  const [componentsEdit, setComponentsEdit] = useState<EditorComponentItemDto[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showZeroValueRowsOverride, setShowZeroValueRowsOverride] = useState<boolean | null>(null);
  const [styleEdit, setStyleEdit] = useState<PayslipTemplateConfig | null>(null);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');

  // Editor & Preview Tabs
  const [leftTab, setLeftTab] = useState<LeftEditorTab>('details');
  const [rightTab, setRightTab] = useState<RightPreviewTab>('preview');
  const [zoomScale, setZoomScale] = useState<number>(0.9);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);

  // Inline editing state for Earnings / Deductions rows
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [showAddRowForm, setShowAddRowForm] = useState<'Earning' | 'Deduction' | 'Other' | null>(null);
  const [newCompLabel, setNewCompLabel] = useState('');
  const [newCompAmount, setNewCompAmount] = useState('');
  const [newCompCategory, setNewCompCategory] = useState<'Earning' | 'Allowance' | 'Deduction' | 'EmployerContribution'>('Earning');

  // Send Payslip Modal State
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState<string>('');
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailPreviewData, setEmailPreviewData] = useState<{
    resolvedSubject: string;
    resolvedBody: string;
    attachmentName: string;
  } | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccessMsg, setModalSuccessMsg] = useState<string | null>(null);

  // Loading & Feedback States
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // Collapsible Template & Layout Sections
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    header: false,
    layout: false,
    typography: false,
    color: false,
    borders: false,
    tables: false,
    signature: false,
    footer: false,
    visibility: true,
  });

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const requestSeqRef = useRef(0);

  // Load templates & email templates on mount
  useEffect(() => {
    apiRequest<PayslipTemplateItem[]>('/api/templates/payslip')
      .then((list) => {
        setTemplates(list);
        if (list.length > 0) {
          setSelectedTemplateId((prev) => {
            if (prev && list.some((t) => t.id === prev)) return prev;
            const def = list.find((t) => t.isDefault) || list[0];
            return def.id;
          });
        }
      })
      .catch(() => {});

    apiRequest<EmailTemplateItem[]>('/api/templates/email')
      .then((list) => {
        setEmailTemplates(list);
        const def = list.find((x) => x.isDefault) || list[0];
        if (def) {
          setSelectedEmailTemplateId(def.id);
          setEmailSubject(def.subjectTemplate);
          setEmailBody(def.bodyTemplate);
        }
      })
      .catch(() => {});
  }, []);

  // Load employees in selected period
  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    apiRequest<EmployeeSearchItem[]>(
      `/api/payroll/search?q=${encodeURIComponent(searchQuery)}&month=${activeMonth}&year=${activeYear}`
    )
      .then((list) => {
        if (cancelled) return;
        setEmployeesInPeriod(list);

        if (selectedEmployeeCode) {
          const matchInNewMonth = list.find(
            (e) => e.employeeCode.toLowerCase() === selectedEmployeeCode.toLowerCase()
          );
          if (matchInNewMonth && matchInNewMonth.recordId !== selectedRecordId) {
            setSelectedRecordId(matchInNewMonth.recordId);
            return;
          }
        }

        if (list.length > 0) {
          const existsInList = list.some((e) => e.recordId === selectedRecordId);
          if (!selectedRecordId || !existsInList) {
            setSelectedRecordId(list[0].recordId);
            setSelectedEmployeeCode(list[0].employeeCode);
          }
        } else if (searchQuery.trim() === '') {
          setSelectedRecordId(null);
          setServerDoc(null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchQuery, activeMonth, activeYear]);

  useEffect(() => {
    if (initialRecordId && initialRecordId !== selectedRecordId) {
      setSelectedRecordId(initialRecordId);
    }
  }, [initialRecordId]);

  const loadDocumentById = async (recordId: string) => {
    const seq = ++requestSeqRef.current;
    setLoadingDoc(true);
    setFeedback(null);

    try {
      const res = await apiRequest(`/api/payroll/records/${recordId}/document`);
      if (seq !== requestSeqRef.current) return;

      const doc: PayslipDocumentModel = res.document;
      setServerDoc(doc);
      setSelectedEmployeeCode(doc.employeeCode);
      hydrateEditorFromDocument(doc);
    } catch (err: any) {
      if (seq === requestSeqRef.current) {
        setFeedback({ type: 'error', text: err.message || 'Failed to load payroll record.' });
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoadingDoc(false);
      }
    }
  };

  useEffect(() => {
    if (selectedRecordId) {
      loadDocumentById(selectedRecordId);
    }
  }, [selectedRecordId]);

  const hydrateEditorFromDocument = (doc: PayslipDocumentModel) => {
    setEmpCodeEdit(doc.employeeCode || '');
    setEmpNameEdit(doc.employeeName || '');
    setEmpEmailEdit(doc.employeeEmail || '');
    setEmpDeptEdit(doc.department || '');
    setEmpDesigEdit(doc.designation || '');

    setGrossEdit(doc.grossSalary !== null && doc.grossSalary !== undefined ? String(doc.grossSalary) : '');
    setDeductionsTotalEdit(
      doc.totalDeductions !== null && doc.totalDeductions !== undefined ? String(doc.totalDeductions) : ''
    );
    setNetSalaryEdit(doc.netSalary !== null && doc.netSalary !== undefined ? String(doc.netSalary) : '');

    setFooterNotesEdit(doc.customFooterNotes || '');
    setComponentsEdit(doc.allEditorComponents ? doc.allEditorComponents.map((c) => ({ ...c })) : []);
    const resolvedTplId =
      doc.selectedTemplateId ||
      templates.find((t) => t.isDefault)?.id ||
      (templates.length > 0 ? templates[0].id : '');
    setSelectedTemplateId(resolvedTplId);
    setShowZeroValueRowsOverride(doc.styleConfig.showZeroValueRows);
    const rawCfg = { ...doc.styleConfig };
    if (rawCfg.footerDisclaimerText) {
      rawCfg.footerDisclaimerText = rawCfg.footerDisclaimerText.replace(/PaySlip Studio/g, 'FINORA');
    }
    const normText =
      !rawCfg.primaryTextColor ||
      rawCfg.primaryTextColor.toUpperCase() === '#071747' ||
      rawCfg.primaryTextColor.toUpperCase() === '#111827'
        ? '#1F2937'
        : rawCfg.primaryTextColor;
    const normSoft =
      !rawCfg.subtleAccentSurfaceColor || rawCfg.subtleAccentSurfaceColor.toUpperCase() === '#FFF4E8'
        ? '#FFF3E8'
        : rawCfg.subtleAccentSurfaceColor;
    const customTablesList = doc.customTables || rawCfg.customTables || [];
    setStyleEdit({
      ...rawCfg,
      primaryAccentColor: rawCfg.primaryAccentColor || '#F47721',
      subtleAccentSurfaceColor: normSoft,
      documentBackgroundColor: rawCfg.documentBackgroundColor || '#FFFFFF',
      primaryTextColor: normText,
      headingNavyColor: normText,
      borderColor: rawCfg.borderColor || '#E5E7EB',
      customTables: customTablesList,
    });
    setEmailRecipient(doc.employeeEmail || '');
    setDirty(false);
    setEditingRowId(null);
    setShowAddRowForm(null);
  };

  // ==========================================================================
  // LIVE CLIENT-SIDE DYNAMIC PAYSLIP DOCUMENT RESOLUTION (Section 14)
  // ==========================================================================
  const liveResolvedDocument: PayslipDocumentModel | null = useMemo(() => {
    if (!serverDoc || !styleEdit) return null;

    const showZero =
      showZeroValueRowsOverride !== null ? showZeroValueRowsOverride : styleEdit.showZeroValueRows;
    const sym = styleEdit.showCurrencySymbolInRows ? serverDoc.currencySymbol : '';

    const visibleEarnings: ResolvedPayslipComponentRow[] = [];
    const visibleDeductions: ResolvedPayslipComponentRow[] = [];
    const visibleEmployerContributions: ResolvedPayslipComponentRow[] = [];
    const visibleCustomTextFields: ResolvedPayslipTextField[] = [];
    const visibleMetadataFields: ResolvedPayslipTextField[] = [];

    const sorted = [...componentsEdit].sort((a, b) => a.sortOrder - b.sortOrder);

    for (const c of sorted) {
      const effectiveLabel =
        c.overrideLabel && c.overrideLabel.trim().length > 0 ? c.overrideLabel.trim() : c.originalLabel;

      if (c.category === 'CustomText' || c.category === 'Metadata') {
        const rawTxt = c.hasManualOverride
          ? c.overrideTextValue ??
            (c.overrideNumericValue !== null && c.overrideNumericValue !== undefined
              ? String(c.overrideNumericValue)
              : null)
          : c.importedTextValue ??
            (c.importedNumericValue !== null && c.importedNumericValue !== undefined
              ? String(c.importedNumericValue)
              : null);
        const txtVal = rawTxt ? rawTxt.trim() : '';
        const hasText = txtVal.length > 0;
        const visible =
          c.explicitVisibilityOverride !== null && c.explicitVisibilityOverride !== undefined
            ? c.explicitVisibilityOverride && hasText
            : hasText;

        if (visible && hasText) {
          const matchedStandard = STANDARD_METADATA_FIELDS.find(
            (m) =>
              m.key === c.componentKey.toLowerCase() ||
              m.matchLabels.includes((c.overrideLabel || c.originalLabel).trim().toLowerCase()) ||
              m.matchLabels.includes(c.originalLabel.trim().toLowerCase())
          );
          const displayMetaLabel =
            c.overrideLabel &&
            c.overrideLabel.trim().length > 0 &&
            c.overrideLabel.trim().toLowerCase() !== c.originalLabel.trim().toLowerCase()
              ? c.overrideLabel.trim()
              : matchedStandard
                ? matchedStandard.label
                : effectiveLabel;

          visibleMetadataFields.push({
            componentId: c.id,
            componentKey: c.componentKey,
            label: displayMetaLabel,
            value: txtVal,
            isOverridden: c.hasManualOverride,
          });
        }
        continue;
      }

      const numVal = c.hasManualOverride ? c.overrideNumericValue : c.importedNumericValue;
      let isVisible = false;

      if (c.explicitVisibilityOverride !== null && c.explicitVisibilityOverride !== undefined) {
        isVisible = c.explicitVisibilityOverride && numVal !== null && numVal !== undefined;
      } else if (c.isManuallyAdded) {
        isVisible = numVal !== null && numVal !== undefined;
      } else if (c.sourceCellType === 'Empty' || numVal === null || numVal === undefined) {
        isVisible = false;
      } else if (numVal === 0) {
        isVisible = showZero;
      } else {
        isVisible = true;
      }

      if (isVisible && numVal !== null && numVal !== undefined) {
        const row: ResolvedPayslipComponentRow = {
          componentId: c.id,
          componentKey: c.componentKey,
          originalLabel: c.originalLabel,
          displayLabel: effectiveLabel,
          category: c.category,
          amount: numVal,
          formattedAmount: formatIndianCurrency(numVal, sym),
          isOverridden: c.hasManualOverride,
          isManuallyAdded: c.isManuallyAdded,
          isZeroValue: numVal === 0,
        };

        if (c.category === 'Deduction') {
          visibleDeductions.push(row);
        } else if (c.category === 'EmployerContribution') {
          visibleEmployerContributions.push(row);
        } else {
          visibleEarnings.push(row);
        }
      }
    }

    const calcEarn = visibleEarnings.reduce((acc, r) => acc + r.amount, 0);
    const calcDed = visibleDeductions.reduce((acc, r) => acc + r.amount, 0);

    const parsedGross = grossEdit.trim() !== '' && !Number.isNaN(Number(grossEdit)) ? Number(grossEdit) : null;
    const parsedDedTotal =
      deductionsTotalEdit.trim() !== '' && !Number.isNaN(Number(deductionsTotalEdit))
        ? Number(deductionsTotalEdit)
        : null;
    const parsedNet =
      netSalaryEdit.trim() !== '' && !Number.isNaN(Number(netSalaryEdit)) ? Number(netSalaryEdit) : null;

    const warnings: string[] = [];
    if (
      parsedGross !== null &&
      visibleEarnings.length > 0 &&
      Math.abs(parsedGross - calcEarn) >= 0.01
    ) {
      warnings.push(
        `Displayed Gross Salary (${formatIndianCurrency(parsedGross, serverDoc.currencySymbol)}) differs from sum of visible earnings (${formatIndianCurrency(calcEarn, serverDoc.currencySymbol)}).`
      );
    }

    if (
      parsedDedTotal !== null &&
      visibleDeductions.length > 0 &&
      Math.abs(parsedDedTotal - calcDed) >= 0.01
    ) {
      warnings.push(
        `Displayed Total Deductions (${formatIndianCurrency(parsedDedTotal, serverDoc.currencySymbol)}) differs from sum of visible deductions (${formatIndianCurrency(calcDed, serverDoc.currencySymbol)}).`
      );
    }

    const effectiveGrossForNet = parsedGross !== null ? parsedGross : calcEarn;
    const effectiveDedForNet = parsedDedTotal !== null ? parsedDedTotal : calcDed;
    const expectedNet = effectiveGrossForNet - effectiveDedForNet;

    if (
      parsedNet !== null &&
      (visibleEarnings.length > 0 || visibleDeductions.length > 0) &&
      Math.abs(parsedNet - expectedNet) >= 0.01
    ) {
      warnings.push(
        `Displayed Net Salary (${formatIndianCurrency(parsedNet, serverDoc.currencySymbol)}) differs from Gross minus Deductions (${formatIndianCurrency(expectedNet, serverDoc.currencySymbol)}).`
      );
    }

    const metaPriority = (f: ResolvedPayslipTextField) => {
      const k = f.componentKey.trim().toLowerCase();
      const l = f.label.trim().toLowerCase();
      if (k === 'meta_location' || l === 'location') return 1;
      if (k === 'meta_doj' || l === 'date of joining') return 2;
      if (k === 'meta_pan' || l === 'pan number') return 3;
      if (k === 'meta_bank' || l === 'bank account') return 4;
      return 10;
    };

    const sortedVisibleMetadataFields = [...visibleMetadataFields].sort(
      (a, b) => metaPriority(a) - metaPriority(b)
    );

    return {
      ...serverDoc,
      employeeCode: empCodeEdit.trim(),
      employeeName: empNameEdit.trim(),
      employeeEmail: empEmailEdit.trim(),
      department: empDeptEdit.trim(),
      designation: empDesigEdit.trim(),
      companyName:
        styleEdit.overrideCompanyName !== undefined && styleEdit.overrideCompanyName !== null
          ? styleEdit.overrideCompanyName
          : serverDoc.companyName,
      companySubtitle:
        styleEdit.overrideCompanySubtitle !== undefined && styleEdit.overrideCompanySubtitle !== null
          ? styleEdit.overrideCompanySubtitle
          : serverDoc.companySubtitle,
      companyAddress:
        styleEdit.overrideCompanyAddress !== undefined && styleEdit.overrideCompanyAddress !== null
          ? styleEdit.overrideCompanyAddress
          : serverDoc.companyAddress,
      companyEmail:
        styleEdit.overrideCompanyContact !== undefined && styleEdit.overrideCompanyContact !== null
          ? styleEdit.overrideCompanyContact
          : serverDoc.companyEmail,
      companyContactEmail:
        styleEdit.overrideCompanyContact !== undefined && styleEdit.overrideCompanyContact !== null
          ? styleEdit.overrideCompanyContact
          : serverDoc.companyContactEmail,
      companyPhone:
        styleEdit.overrideCompanyPhone !== undefined && styleEdit.overrideCompanyPhone !== null
          ? styleEdit.overrideCompanyPhone
          : serverDoc.companyPhone,
      companyContactPhone:
        styleEdit.overrideCompanyPhone !== undefined && styleEdit.overrideCompanyPhone !== null
          ? styleEdit.overrideCompanyPhone
          : serverDoc.companyContactPhone,
      companyWebsite:
        styleEdit.overrideCompanyWebsite !== undefined && styleEdit.overrideCompanyWebsite !== null
          ? styleEdit.overrideCompanyWebsite
          : serverDoc.companyWebsite,
      logoDataUrl:
        styleEdit.overrideLogoDataUrl !== undefined && styleEdit.overrideLogoDataUrl !== null
          ? (styleEdit.overrideLogoDataUrl || null)
          : serverDoc.logoDataUrl,
      visibleEarnings,
      visibleDeductions,
      visibleEmployerContributions,
      visibleCustomTextFields,
      visibleMetadataFields: sortedVisibleMetadataFields,
      calculatedEarningsTotal: calcEarn,
      calculatedDeductionsTotal: calcDed,
      grossSalary: parsedGross,
      totalDeductions: parsedDedTotal,
      netSalary: parsedNet,
      netSalaryInWords:
        parsedNet !== null && styleEdit.showAmountInWords
          ? convertAmountToIndianWordsClient(parsedNet, serverDoc.currencyCode || 'INR')
          : null,
      hasDiscrepancyWarning: warnings.length > 0,
      discrepancyMessages: warnings,
      customFooterNotes: footerNotesEdit,
      customTables: styleEdit.customTables || serverDoc.customTables || [],
      styleConfig: {
        ...styleEdit,
        customTables: styleEdit.customTables || serverDoc.customTables || [],
        showZeroValueRows: showZero,
      },
    };
  }, [
    serverDoc,
    styleEdit,
    empCodeEdit,
    empNameEdit,
    empEmailEdit,
    empDeptEdit,
    empDesigEdit,
    grossEdit,
    deductionsTotalEdit,
    netSalaryEdit,
    footerNotesEdit,
    componentsEdit,
    showZeroValueRowsOverride,
  ]);

  // Live Email Preview resolution
  useEffect(() => {
    if (!liveResolvedDocument) return;
    const monthName =
      MONTHS.find((m) => m.value === liveResolvedDocument.payrollMonth)?.label || '';
    const yearStr = String(liveResolvedDocument.payrollYear);
    const netStr =
      liveResolvedDocument.netSalary !== null && liveResolvedDocument.netSalary !== undefined
        ? formatIndianCurrency(liveResolvedDocument.netSalary, liveResolvedDocument.currencySymbol)
        : 'N/A';

    const applyTokens = (str: string) =>
      str
        .replace(/\{\{EmployeeName\}\}/gi, liveResolvedDocument.employeeName)
        .replace(/\{\{EmployeeId\}\}/gi, liveResolvedDocument.employeeCode)
        .replace(/\{\{PayrollMonth\}\}/gi, monthName)
        .replace(/\{\{PayrollYear\}\}/gi, yearStr)
        .replace(/\{\{CompanyName\}\}/gi, liveResolvedDocument.companyName)
        .replace(/\{\{NetSalary\}\}/gi, netStr);

    setEmailPreviewData({
      resolvedSubject: applyTokens(emailSubject),
      resolvedBody: applyTokens(emailBody),
      attachmentName: `Payslip_${liveResolvedDocument.employeeCode}_${liveResolvedDocument.periodLabel.replace(/\s+/g, '_')}.pdf`,
    });
  }, [liveResolvedDocument, emailSubject, emailBody]);

  // ==========================================================================
  // METADATA FIELD HELPERS (Location, Date of Joining, PAN Number, Bank Account)
  // ==========================================================================
  const getStandardMetaValue = (metaDef: (typeof STANDARD_METADATA_FIELDS)[number]): string => {
    const found = componentsEdit.find(
      (c) =>
        (c.category === 'Metadata' || c.category === 'CustomText') &&
        (c.componentKey.toLowerCase() === metaDef.key ||
          metaDef.matchLabels.includes((c.overrideLabel || c.originalLabel).trim().toLowerCase()) ||
          metaDef.matchLabels.includes(c.originalLabel.trim().toLowerCase()))
    );
    if (!found) return '';
    if (found.hasManualOverride) {
      return (
        found.overrideTextValue ??
        (found.overrideNumericValue !== null && found.overrideNumericValue !== undefined
          ? String(found.overrideNumericValue)
          : '')
      );
    }
    return (
      found.importedTextValue ??
      (found.importedNumericValue !== null && found.importedNumericValue !== undefined
        ? String(found.importedNumericValue)
        : '')
    );
  };

  const setStandardMetaValue = (metaDef: (typeof STANDARD_METADATA_FIELDS)[number], newVal: string) => {
    setDirty(true);
    setComponentsEdit((prev) => {
      const idx = prev.findIndex(
        (c) =>
          (c.category === 'Metadata' || c.category === 'CustomText') &&
          (c.componentKey.toLowerCase() === metaDef.key ||
            metaDef.matchLabels.includes((c.overrideLabel || c.originalLabel).trim().toLowerCase()) ||
            metaDef.matchLabels.includes(c.originalLabel.trim().toLowerCase()))
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          category: 'Metadata',
          hasManualOverride: true,
          overrideTextValue: newVal,
          effectiveTextValue: newVal,
          explicitVisibilityOverride: newVal.trim().length > 0 ? true : false,
        };
        return copy;
      }
      // Dynamically add metadata entry if user types into it
      return [
        ...prev,
        {
          id: `temp-${Date.now()}-${metaDef.key}`,
          componentKey: metaDef.key,
          originalLabel: metaDef.label,
          overrideLabel: metaDef.label,
          effectiveLabel: metaDef.label,
          category: 'Metadata',
          sortOrder: prev.length + 1,
          sourceCellType: 'Text',
          importedNumericValue: null,
          importedTextValue: null,
          isManuallyAdded: true,
          hasManualOverride: true,
          overrideNumericValue: null,
          overrideTextValue: newVal,
          effectiveNumericValue: null,
          effectiveTextValue: newVal,
          explicitVisibilityOverride: newVal.trim().length > 0 ? true : false,
          isCurrentlyVisibleOnPayslip: newVal.trim().length > 0,
          visibilityReason: 'Added in Employee Details',
        },
      ];
    });
  };

  // ==========================================================================
  // COMPONENT ROW HANDLERS (With Instant Auto-Calculation of Gross, Deductions & Net)
  // ==========================================================================
  const syncTotalsFromComponentsList = (nextComponents: EditorComponentItemDto[]) => {
    const showZero =
      showZeroValueRowsOverride !== null
        ? showZeroValueRowsOverride
        : Boolean(styleEdit?.showZeroValueRows);

    let earnSum = 0;
    let dedSum = 0;

    for (const c of nextComponents) {
      if (c.category === 'CustomText' || c.category === 'Metadata' || c.category === 'EmployerContribution') {
        continue;
      }
      const numVal = c.hasManualOverride ? c.overrideNumericValue : c.importedNumericValue;
      let isVisible = false;
      if (c.explicitVisibilityOverride !== null && c.explicitVisibilityOverride !== undefined) {
        isVisible = c.explicitVisibilityOverride && numVal !== null && numVal !== undefined;
      } else if (c.isManuallyAdded) {
        isVisible = numVal !== null && numVal !== undefined;
      } else if (c.sourceCellType === 'Empty' || numVal === null || numVal === undefined) {
        isVisible = false;
      } else if (numVal === 0) {
        isVisible = showZero;
      } else {
        isVisible = true;
      }

      if (isVisible && numVal !== null && numVal !== undefined) {
        if (c.category === 'Deduction') {
          dedSum += numVal;
        } else {
          earnSum += numVal;
        }
      }
    }

    const roundedEarn = Math.round(earnSum * 100) / 100;
    const roundedDed = Math.round(dedSum * 100) / 100;
    const roundedNet = Math.round((roundedEarn - roundedDed) * 100) / 100;

    setGrossEdit(String(roundedEarn));
    setDeductionsTotalEdit(String(roundedDed));
    setNetSalaryEdit(String(roundedNet));
  };

  const handleComponentAmountChange = (compId: string, rawVal: string) => {
    setDirty(true);
    const nextList = componentsEdit.map((c) => {
      if (c.id !== compId) return c;
      if (rawVal.trim() === '') {
        return {
          ...c,
          hasManualOverride: true,
          overrideNumericValue: null,
          effectiveNumericValue: null,
        };
      }
      const num = Number(rawVal);
      if (Number.isNaN(num)) return c;
      const isSameAsImported = num === c.importedNumericValue && !c.isManuallyAdded;
      return {
        ...c,
        hasManualOverride: !isSameAsImported,
        overrideNumericValue: isSameAsImported ? null : num,
        effectiveNumericValue: num,
      };
    });
    setComponentsEdit(nextList);
    syncTotalsFromComponentsList(nextList);
  };

  const handleComponentLabelChange = (compId: string, newLabel: string) => {
    setDirty(true);
    setComponentsEdit((prev) =>
      prev.map((c) => {
        if (c.id !== compId) return c;
        const same = newLabel.trim() === c.originalLabel.trim();
        return {
          ...c,
          overrideLabel: same ? null : newLabel,
          effectiveLabel: newLabel,
        };
      })
    );
  };

  const handleComponentVisibilityChange = (compId: string, vis: boolean | null) => {
    setDirty(true);
    const nextList = componentsEdit.map((c) =>
      c.id === compId ? { ...c, explicitVisibilityOverride: vis } : c
    );
    setComponentsEdit(nextList);
    syncTotalsFromComponentsList(nextList);
  };

  const handleResetSingleComponent = (compId: string) => {
    setDirty(true);
    const nextList = componentsEdit.map((c) =>
      c.id === compId
        ? {
            ...c,
            hasManualOverride: false,
            overrideNumericValue: null,
            overrideTextValue: null,
            overrideLabel: null,
            effectiveLabel: c.originalLabel,
            effectiveNumericValue: c.importedNumericValue,
            effectiveTextValue: c.importedTextValue,
            explicitVisibilityOverride: null,
          }
        : c
    );
    setComponentsEdit(nextList);
    syncTotalsFromComponentsList(nextList);
  };

  const handleDeleteOrHideComponent = (comp: EditorComponentItemDto) => {
    setDirty(true);
    if (comp.isManuallyAdded) {
      const nextList = componentsEdit.filter((c) => c.id !== comp.id);
      setComponentsEdit(nextList);
      syncTotalsFromComponentsList(nextList);
    } else {
      handleComponentVisibilityChange(comp.id, false);
    }
  };

  const handleMoveComponentOrder = (compId: string, direction: -1 | 1, categoryList: EditorComponentItemDto[]) => {
    const idx = categoryList.findIndex((c) => c.id === compId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= categoryList.length) return;

    const itemA = categoryList[idx];
    const itemB = categoryList[targetIdx];
    setDirty(true);
    setComponentsEdit((prev) =>
      prev.map((c) => {
        if (c.id === itemA.id) return { ...c, sortOrder: itemB.sortOrder };
        if (c.id === itemB.id) return { ...c, sortOrder: itemA.sortOrder };
        return c;
      })
    );
  };

  const handleAddCustomComponent = () => {
    if (!newCompLabel.trim()) return;
    const numVal = Number(newCompAmount);
    if (Number.isNaN(numVal)) return;

    setDirty(true);
    const maxSort = componentsEdit.reduce((m, c) => Math.max(m, c.sortOrder), 0);
    const newId = `temp-${Date.now()}`;
    const newComp: EditorComponentItemDto = {
      id: newId,
      componentKey: `custom_${Date.now()}`,
      originalLabel: newCompLabel.trim(),
      overrideLabel: null,
      effectiveLabel: newCompLabel.trim(),
      category: newCompCategory,
      sortOrder: maxSort + 1,
      sourceCellType: numVal === 0 ? 'NumericZero' : 'NumericNonZero',
      importedNumericValue: null,
      importedTextValue: null,
      isManuallyAdded: true,
      hasManualOverride: true,
      overrideNumericValue: numVal,
      overrideTextValue: null,
      effectiveNumericValue: numVal,
      effectiveTextValue: null,
      explicitVisibilityOverride: true,
      isCurrentlyVisibleOnPayslip: true,
      visibilityReason: 'Manually added by operator',
    };

    const nextList = [...componentsEdit, newComp];
    setComponentsEdit(nextList);
    syncTotalsFromComponentsList(nextList);
    setNewCompLabel('');
    setNewCompAmount('');
    setShowAddRowForm(null);
  };

  const handleRecalculateTotalsFromVisibleRows = () => {
    if (!liveResolvedDocument) return;
    setDirty(true);
    const earnSum = liveResolvedDocument.calculatedEarningsTotal ?? 0;
    const dedSum = liveResolvedDocument.calculatedDeductionsTotal ?? 0;
    const netSum = earnSum - dedSum;
    setGrossEdit(String(earnSum));
    setDeductionsTotalEdit(String(dedSum));
    setNetSalaryEdit(String(netSum));
  };

  // ==========================================================================
  // CUSTOM TABLES HANDLERS (Leave, Attendance, CTC, Loans, Custom)
  // ==========================================================================
  const handleAddPresetTable = (preset: 'leave' | 'attendance' | 'ctc' | 'loan' | 'blank') => {
    if (!styleEdit) return;
    const existing = styleEdit.customTables ? [...styleEdit.customTables] : [];
    const newId = Math.random().toString(36).substring(2, 9);
    let newTable: CustomPayslipTable;

    if (preset === 'leave') {
      newTable = {
        id: `leave-${newId}`,
        title: 'LEAVE SUMMARY / BALANCE',
        columns: ['Leave Type', 'Opening', 'Availed', 'Closing Balance'],
        rows: [
          { id: `r1-${newId}`, cells: ['Casual Leave (CL)', '12', '3', '9'] },
          { id: `r2-${newId}`, cells: ['Sick Leave (SL)', '8', '1', '7'] },
          { id: `r3-${newId}`, cells: ['Privilege / Earned Leave (EL)', '15', '0', '15'] },
        ],
        showBorder: true,
        isVisible: true,
        headingTextColor: '#F47721',
        headingBgColor: '#FFFFFF',
        layoutWidth: 'auto',
      };
    } else if (preset === 'attendance') {
      newTable = {
        id: `attendance-${newId}`,
        title: 'ATTENDANCE SUMMARY',
        columns: ['Metric / Description', 'Days / Count'],
        rows: [
          { id: `r1-${newId}`, cells: ['Total Working Days', '30'] },
          { id: `r2-${newId}`, cells: ['Days Present / Paid', '30'] },
          { id: `r3-${newId}`, cells: ['Loss of Pay (LOP) Days', '0'] },
          { id: `r4-${newId}`, cells: ['Overtime Hours', '16 hrs'] },
        ],
        showBorder: true,
        isVisible: true,
        headingTextColor: '#F47721',
        headingBgColor: '#FFFFFF',
        layoutWidth: 'auto',
      };
    } else if (preset === 'ctc') {
      newTable = {
        id: `ctc-${newId}`,
        title: 'CONSOLIDATED SALARY / CTC BREAKDOWN',
        columns: ['Component', 'Monthly (₹)', 'Annual (₹)'],
        rows: [
          { id: `r1-${newId}`, cells: ['Gross Salary', '65,800.00', '7,89,600.00'] },
          { id: `r2-${newId}`, cells: ['Employer PF Contribution', '1,800.00', '21,600.00'] },
          { id: `r3-${newId}`, cells: ['Gratuity & Retiral Benefits', '1,996.00', '23,952.00'] },
          { id: `r4-${newId}`, cells: ['Total Cost to Company (CTC)', '69,596.00', '8,35,152.00'] },
        ],
        showBorder: true,
        isVisible: true,
        headingTextColor: '#F47721',
        headingBgColor: '#FFFFFF',
        layoutWidth: 'full',
      };
    } else if (preset === 'loan') {
      newTable = {
        id: `loan-${newId}`,
        title: 'LOANS & ADVANCES',
        columns: ['Loan Type', 'Sanctioned', 'Deducted this Month', 'Outstanding Balance'],
        rows: [
          { id: `r1-${newId}`, cells: ['Salary Advance', '₹15,000.00', '₹5,000.00', '₹10,000.00'] },
        ],
        showBorder: true,
        isVisible: true,
        headingTextColor: '#F47721',
        headingBgColor: '#FFFFFF',
        layoutWidth: 'auto',
      };
    } else {
      newTable = {
        id: `custom-${newId}`,
        title: 'ADDITIONAL INFORMATION',
        columns: ['Particulars', 'Details'],
        rows: [
          { id: `r1-${newId}`, cells: ['Description', 'Value'] },
        ],
        showBorder: true,
        isVisible: true,
        headingTextColor: '#F47721',
        headingBgColor: '#FFFFFF',
        layoutWidth: 'auto',
      };
    }

    setStyleEdit({
      ...styleEdit,
      customTables: [...existing, newTable],
    });
    setDirty(true);
  };

  const handleUpdateCustomTable = (tableId: string, updater: (t: CustomPayslipTable) => CustomPayslipTable) => {
    if (!styleEdit) return;
    const updated = (styleEdit.customTables || []).map((t) => (t.id === tableId ? updater(t) : t));
    setStyleEdit({ ...styleEdit, customTables: updated });
    setDirty(true);
  };

  const handleDeleteCustomTable = (tableId: string) => {
    if (!styleEdit) return;
    if (!window.confirm('Are you sure you want to delete this table?')) return;
    const updated = (styleEdit.customTables || []).filter((t) => t.id !== tableId);
    setStyleEdit({ ...styleEdit, customTables: updated });
    setDirty(true);
  };

  const handleMoveCustomTable = (index: number, direction: 'up' | 'down') => {
    if (!styleEdit || !styleEdit.customTables) return;
    const tables = [...styleEdit.customTables];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= tables.length) return;
    const temp = tables[index];
    tables[index] = tables[targetIdx];
    tables[targetIdx] = temp;
    setStyleEdit({ ...styleEdit, customTables: tables });
    setDirty(true);
  };

  const handleAddColumnToTable = (tableId: string) => {
    handleUpdateCustomTable(tableId, (tbl) => {
      const colNum = (tbl.columns?.length || 0) + 1;
      const updatedCols = [...(tbl.columns || []), `Column ${colNum}`];
      const updatedRows = (tbl.rows || []).map((r) => ({
        ...r,
        cells: [...(r.cells || []), ''],
      }));
      return { ...tbl, columns: updatedCols, rows: updatedRows };
    });
  };

  const handleDeleteColumnFromTable = (tableId: string, colIdx: number) => {
    handleUpdateCustomTable(tableId, (tbl) => {
      if ((tbl.columns?.length || 0) <= 1) return tbl;
      const updatedCols = tbl.columns.filter((_, i) => i !== colIdx);
      const updatedRows = (tbl.rows || []).map((r) => ({
        ...r,
        cells: r.cells.filter((_, i) => i !== colIdx),
      }));
      return { ...tbl, columns: updatedCols, rows: updatedRows };
    });
  };

  const handleAddRowToTable = (tableId: string) => {
    handleUpdateCustomTable(tableId, (tbl) => {
      const rowId = Math.random().toString(36).substring(2, 9);
      const emptyCells = new Array(tbl.columns.length).fill('');
      return {
        ...tbl,
        rows: [...(tbl.rows || []), { id: `row-${rowId}`, cells: emptyCells }],
      };
    });
  };

  const handleDeleteRowFromTable = (tableId: string, rowId: string) => {
    handleUpdateCustomTable(tableId, (tbl) => ({
      ...tbl,
      rows: (tbl.rows || []).filter((r) => r.id !== rowId),
    }));
  };

  const handleMoveRowInTable = (tableId: string, rowIdx: number, direction: 'up' | 'down') => {
    handleUpdateCustomTable(tableId, (tbl) => {
      const rows = [...tbl.rows];
      const targetIdx = direction === 'up' ? rowIdx - 1 : rowIdx + 1;
      if (targetIdx < 0 || targetIdx >= rows.length) return tbl;
      const temp = rows[rowIdx];
      rows[rowIdx] = rows[targetIdx];
      rows[targetIdx] = temp;
      return { ...tbl, rows };
    });
  };

  // ==========================================================================
  // SAVE DRAFT, RESET, PDF PREVIEW/DOWNLOAD & SEND PAYSLIP
  // ==========================================================================
  const handleSaveDraft = async () => {
    if (!serverDoc || !styleEdit) return;
    setSaving(true);
    setFeedback(null);

    try {
      const payload = {
        overrideEmployeeCode: empCodeEdit,
        overrideEmployeeName: empNameEdit,
        overrideEmail: empEmailEdit,
        overrideDepartment: empDeptEdit,
        overrideDesignation: empDesigEdit,
        overrideGrossSalary: grossEdit.trim() !== '' ? Number(grossEdit) : null,
        clearGrossSalaryOverride: Number(grossEdit) === serverDoc.importedGrossSalary,
        overrideTotalDeductions: deductionsTotalEdit.trim() !== '' ? Number(deductionsTotalEdit) : null,
        clearTotalDeductionsOverride: Number(deductionsTotalEdit) === serverDoc.importedTotalDeductions,
        overrideNetSalary: netSalaryEdit.trim() !== '' ? Number(netSalaryEdit) : null,
        clearNetSalaryOverride: Number(netSalaryEdit) === serverDoc.importedNetSalary,
        selectedTemplateId: selectedTemplateId ? selectedTemplateId : null,
        showZeroValueRowsOverride,
        presentationOverrides: styleEdit,
        customFooterNotes: footerNotesEdit,
        componentUpdates: componentsEdit.map((c) => ({
          id: c.id.startsWith('temp-') ? null : c.id,
          componentKey: c.componentKey,
          originalLabel: c.originalLabel,
          overrideLabel: c.overrideLabel,
          category: c.category,
          sortOrder: c.sortOrder,
          isManuallyAdded: c.isManuallyAdded,
          resetToImported: !c.hasManualOverride && !c.isManuallyAdded && c.explicitVisibilityOverride === null,
          removeManualComponent: false,
          overrideNumericValue: c.hasManualOverride ? c.overrideNumericValue : null,
          overrideTextValue: c.hasManualOverride ? c.overrideTextValue : null,
          explicitVisibilityOverride: c.explicitVisibilityOverride,
        })),
      };

      const res = await apiRequest(`/api/payroll/records/${serverDoc.payrollRecordId}/draft`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      const updatedDoc: PayslipDocumentModel = res.document;
      setServerDoc(updatedDoc);
      hydrateEditorFromDocument(updatedDoc);
      setFeedback({ type: 'success', text: 'Payslip changes saved.' });
      return updatedDoc;
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to save draft.' });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleApplyTemplateToCurrentPayslip = async () => {
    if (!serverDoc || !styleEdit) return;
    try {
      await handleSaveDraft();
      setRightTab('preview');
      setFeedback({ type: 'success', text: 'Template & layout applied to payslip!' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to apply template to payslip.' });
    }
  };

  const handleOpenSaveTemplateModal = () => {
    if (!styleEdit) return;
    const currentTpl = templates.find((t) => t.id === selectedTemplateId);
    setSaveTemplateName(currentTpl ? currentTpl.name : 'Custom Institutional Template');
    setShowSaveTemplateModal(true);
  };

  const handleSaveTemplatePreset = handleOpenSaveTemplateModal;

  const handleConfirmSaveTemplate = async () => {
    if (!styleEdit || !saveTemplateName.trim()) return;
    const trimmedName = saveTemplateName.trim();
    setSaving(true);
    setFeedback(null);
    try {
      const existingTpl = templates.find(
        (t) => t.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );

      if (existingTpl) {
        await apiRequest(`/api/templates/payslip/${existingTpl.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: trimmedName,
            description: existingTpl.description || 'Institutional payslip template',
            config: styleEdit,
          }),
        });
        setSelectedTemplateId(existingTpl.id);
      } else {
        const createRes = await apiRequest<{ id: string; name: string }>('/api/templates/payslip', {
          method: 'POST',
          body: JSON.stringify({
            name: trimmedName,
            description: 'Custom payslip template created from Template & Layout',
            config: styleEdit,
          }),
        });
        setSelectedTemplateId(createRes.id);
      }

      const updatedTemplates = await apiRequest<PayslipTemplateItem[]>('/api/templates/payslip');
      setTemplates(updatedTemplates);

      if (serverDoc) {
        await handleSaveDraft();
      }

      setShowSaveTemplateModal(false);
      setFeedback({
        type: 'success',
        text: `Template preset "${trimmedName}" successfully saved and applied!`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to save template preset.' });
    } finally {
      setSaving(false);
    }
  };

    const handleApplyTemplateToAllInPeriod = async () => {
    if (!serverDoc || !styleEdit) return;
    const periodLabel = serverDoc.periodLabel || 'the current period';
    if (!window.confirm(`Apply this template layout to ALL employee payslips in ${periodLabel}?`)) {
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ count: number; message: string }>(
        `/api/payroll/periods/${serverDoc.payrollPeriodId}/apply-template`,
        {
          method: 'POST',
          body: JSON.stringify({
            templateId: selectedTemplateId || null,
            config: styleEdit,
          }),
        }
      );

      await handleSaveDraft();
      setRightTab('preview');
      setFeedback({
        type: 'success',
        text: `Template layout applied to all ${res.count} employee payslips in ${periodLabel}!`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to apply template to all payslips.' });
    } finally {
      setSaving(false);
    }
  };

  const [savingOrgLogo, setSavingOrgLogo] = useState(false);

  const handleHeaderLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ type: 'error', text: 'Logo image must be smaller than 2MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const dataUrl = reader.result;
        setDirty(true);
        setStyleEdit((prev) => (prev ? { ...prev, overrideLogoDataUrl: dataUrl, showLogo: true } : prev));
        setFeedback({ type: 'success', text: 'Header logo uploaded! Live preview updated.' });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveLogoAsOrgDefault = async () => {
    const currentLogo =
      styleEdit?.overrideLogoDataUrl !== undefined && styleEdit?.overrideLogoDataUrl !== null
        ? styleEdit.overrideLogoDataUrl
        : serverDoc?.logoDataUrl;
    if (!currentLogo) return;
    setSavingOrgLogo(true);
    setFeedback(null);
    try {
      const currentSettings = await apiRequest<any>('/api/settings/company');
      await apiRequest('/api/settings/company', {
        method: 'PUT',
        body: JSON.stringify({
          ...currentSettings,
          logoDataUrl: currentLogo,
        }),
      });
      if (serverDoc) {
        setServerDoc({ ...serverDoc, logoDataUrl: currentLogo });
      }
      setFeedback({
        type: 'success',
        text: 'Logo successfully saved as organization-wide default logo for FINORA!',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Failed to update organization default logo. (Administrator permission required).',
      });
    } finally {
      setSavingOrgLogo(false);
    }
  };

  const handleResetAllToImported = async () => {
    if (!serverDoc) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiRequest(
        `/api/payroll/records/${serverDoc.payrollRecordId}/reset-overrides`,
        { method: 'POST' }
      );
      const updatedDoc: PayslipDocumentModel = res.document;
      setServerDoc(updatedDoc);
      hydrateEditorFromDocument(updatedDoc);
      setFeedback({
        type: 'info',
        text: 'Reset employee details, components, and layout to original imported values.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to reset overrides.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewOrDownloadPdf = async () => {
    if (!serverDoc || !styleEdit) return;
    setSaving(true);
    setFeedback(null);
    try {
      if (canEdit) {
        // Always save draft to persist all employee details, overrides, and styleEdit to DB
        await handleSaveDraft();

        // Pass current live styleEdit directly in request body to guarantee 100% WYSIWYG
        const pdfRes = await apiRequest(`/api/payroll/records/${serverDoc.payrollRecordId}/pdf`, {
          method: 'POST',
          body: JSON.stringify(styleEdit),
        });
        window.open(
          getAuthorizedDownloadUrl(`/api/payroll/documents/${pdfRes.documentId}/download`),
          '_blank'
        );
        setFeedback({
          type: 'success',
          text: `Generated PDF (${pdfRes.fileName}).`,
        });
      } else {
        window.open(
          getAuthorizedDownloadUrl(`/api/payroll/records/${serverDoc.payrollRecordId}/pdf/preview`),
          '_blank'
        );
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to generate PDF.' });
    } finally {
      setSaving(false);
    }
  };

  // Fetch current SMTP configuration whenever Send Payslip modal opens
  useEffect(() => {
    if (!showSendModal) return;
    setModalError(null);
    setModalSuccessMsg(null);
    apiRequest<any>('/api/settings/company')
      .then((s) => {
        const ready = s.emailProviderMode === 'Smtp' && Boolean(s.hasSmtpPasswordConfigured);
        setSmtpConfigured(ready);
      })
      .catch(() => {
        // Settings may be restricted for this role; let the server decide on send.
        setSmtpConfigured(true);
      });
  }, [showSendModal]);

  const handleSendEmail = async (isTest: boolean) => {
    if (!serverDoc) return;
    setSaving(true);
    setFeedback(null);
    setModalError(null);
    setModalSuccessMsg(null);
    try {
      if (dirty && canEdit) {
        await handleSaveDraft();
      }
      const attempt = await apiRequest<any>('/api/email/send', {
        method: 'POST',
        body: JSON.stringify({
          payrollRecordId: serverDoc.payrollRecordId,
          recipientEmail: emailRecipient,
          subject: emailSubject,
          body: emailBody,
          isTestEmail: isTest,
        }),
      });

      if (attempt.status !== 'Accepted') {
        setModalError(
          attempt.errorDetails ||
            `Delivery ${attempt.status}: Please verify the sender account in Admin Console → Email Configuration.`
        );
        return;
      }

      setShowSendModal(false);
      setFeedback({
        type: 'success',
        text: `Payslip email sent via SMTP to ${attempt.recipientEmail} (${attempt.attachmentFileName}).`,
      });
    } catch (err: any) {
      setModalError(err.message || 'Email delivery failed.');
    } finally {
      setSaving(false);
    }
  };

  // Filtered Component Lists per Tab
  const earningsRows = useMemo(
    () =>
      componentsEdit
        .filter((c) => c.category === 'Earning' || c.category === 'Allowance' || c.category === 'CustomMonetary')
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [componentsEdit]
  );

  const populatedEarningsRows = useMemo(
    () =>
      earningsRows.filter(
        (c) =>
          c.isManuallyAdded ||
          c.hasManualOverride ||
          (c.sourceCellType !== 'Empty' && c.importedNumericValue !== null)
      ),
    [earningsRows]
  );

  const deductionsRows = useMemo(
    () =>
      componentsEdit
        .filter((c) => c.category === 'Deduction')
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [componentsEdit]
  );

  const populatedDeductionsRows = useMemo(
    () =>
      deductionsRows.filter(
        (c) =>
          c.isManuallyAdded ||
          c.hasManualOverride ||
          (c.sourceCellType !== 'Empty' && c.importedNumericValue !== null)
      ),
    [deductionsRows]
  );

  const employerAndOtherRows = useMemo(
    () =>
      componentsEdit
        .filter((c) => c.category === 'EmployerContribution')
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [componentsEdit]
  );

  const currentEmpIndex = employeesInPeriod.findIndex((e) => e.recordId === selectedRecordId);
  const activeMonthLabel = MONTHS.find((m) => m.value === activeMonth)?.label || 'October';

  const empInitials = (empNameEdit || serverDoc?.employeeName || 'EM')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  // Reusable Component Table for Earnings & Deductions (Sections 12 & 13)
  const renderEditableComponentTable = (
    sectionTitle: string,
    rows: EditorComponentItemDto[],
    categoryType: 'Earning' | 'Deduction'
  ) => {
    const showZero =
      showZeroValueRowsOverride !== null ? showZeroValueRowsOverride : styleEdit?.showZeroValueRows ?? false;

    // Filter out hidden 0.00 rows unless user is editing them or showZero is enabled
    const displayedRows = rows.filter((r) => {
      if (r.explicitVisibilityOverride === false) return false;
      const val = r.hasManualOverride ? r.overrideNumericValue : r.importedNumericValue;
      if (val === 0 && !showZero && r.explicitVisibilityOverride !== true && editingRowId !== r.id) {
        return false;
      }
      return val !== null && val !== undefined;
    });

    const hiddenZeroOrSuppressedRows = rows.filter((r) => !displayedRows.some((d) => d.id === r.id));

    return (
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
        {/* Table Section Header */}
        <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {categoryType === 'Earning' ? (
              <Wallet className="w-4 h-4 text-[#F47721]" />
            ) : (
              <MinusCircle className="w-4 h-4 text-[#F47721]" />
            )}
            <h3 className="text-[15px] font-semibold text-[#1F2937]">{sectionTitle}</h3>
            <span className="text-[11.5px] font-semibold text-[#F47721] bg-[#FFF3E8] px-2 py-0.5 rounded-[5px]">
              {displayedRows.length} active
            </span>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setNewCompCategory(categoryType);
                setShowAddRowForm(categoryType);
                setNewCompLabel('');
                setNewCompAmount('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-semibold bg-[#FFF3E8] text-[#F47721] hover:bg-[#F47721] hover:text-[#FFFFFF] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add {categoryType}</span>
            </button>
          )}
        </div>

        {/* Inline Add Row Bar */}
        {showAddRowForm === categoryType && canEdit && (
          <div className="p-3.5 bg-[#FFF8F3] border-b border-[#E5E7EB] flex flex-wrap items-end gap-2.5">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                Component Name
              </label>
              <input
                type="text"
                value={newCompLabel}
                onChange={(e) => setNewCompLabel(e.target.value)}
                placeholder={categoryType === 'Earning' ? 'e.g. Performance Bonus' : 'e.g. Salary Advance'}
                className="w-full px-2.5 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
              />
            </div>
            <div className="w-36">
              <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={newCompAmount}
                onChange={(e) => setNewCompAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-2.5 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px] text-right"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAddCustomComponent}
                className="px-3 py-1.5 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[12.5px] font-semibold hover:bg-[#E06612] transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowAddRowForm(null)}
                className="px-2.5 py-1.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280] text-[12.5px] hover:text-[#1F2937]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Editable Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[#6B7280] text-[11.5px] font-semibold">
                <th className="text-left py-2.5 px-4">Item</th>
                <th className="text-right py-2.5 px-4 w-40">Amount</th>
                <th className="text-right py-2.5 px-4 w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 px-4 text-center text-[12.5px] text-[#9CA3AF]">
                    No active {sectionTitle.toLowerCase()} for this employee.
                  </td>
                </tr>
              ) : (
                displayedRows.map((row) => {
                  const isEditingThis = editingRowId === row.id;
                  const effectiveVal = row.hasManualOverride
                    ? row.overrideNumericValue
                    : row.importedNumericValue;

                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${
                        isEditingThis ? 'bg-[#FFF8F3]' : 'hover:bg-[#F8F9FA]/60'
                      }`}
                    >
                      {/* Item Label */}
                      <td className="py-2.5 px-4">
                        {isEditingThis && canEdit ? (
                          <input
                            type="text"
                            value={row.overrideLabel ?? row.originalLabel}
                            onChange={(e) => handleComponentLabelChange(row.id, e.target.value)}
                            className="w-full px-2.5 py-1 text-[13px] font-medium border border-[#E5E7EB] rounded-[6px]"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#1F2937]">
                              {row.overrideLabel || row.originalLabel}
                            </span>
                            {row.hasManualOverride && (
                              <span className="text-[10.5px] font-semibold text-[#F47721] bg-[#FFF3E8] px-1.5 py-0.5 rounded-[4px]">
                                Edited
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        {canEdit ? (
                          <input
                            type="number"
                            step="0.01"
                            value={effectiveVal !== null && effectiveVal !== undefined ? effectiveVal : ''}
                            onChange={(e) => handleComponentAmountChange(row.id, e.target.value)}
                            className="w-32 px-2.5 py-1 text-[13px] font-semibold text-right border border-[#E5E7EB] rounded-[6px] bg-[#FFFFFF]"
                          />
                        ) : (
                          <span className="font-semibold text-[#1F2937]">
                            {formatIndianCurrency(effectiveVal || 0, serverDoc?.currencySymbol || '₹')}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-4 text-right">
                        {canEdit && (
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingRowId(isEditingThis ? null : row.id)}
                              className={`p-1.5 rounded-[6px] transition-colors ${
                                isEditingThis
                                  ? 'bg-[#F47721] text-[#FFFFFF]'
                                  : 'text-[#6B7280] hover:text-[#F47721] hover:bg-[#FFF3E8]'
                              }`}
                              title={isEditingThis ? 'Done editing label' : 'Edit label'}
                            >
                              {isEditingThis ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Edit3 className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleMoveComponentOrder(row.id, -1, displayedRows)}
                              className="p-1.5 rounded-[6px] text-[#9CA3AF] hover:text-[#1F2937] hover:bg-[#F8F9FA]"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleMoveComponentOrder(row.id, 1, displayedRows)}
                              className="p-1.5 rounded-[6px] text-[#9CA3AF] hover:text-[#1F2937] hover:bg-[#F8F9FA]"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>

                            {row.hasManualOverride && !row.isManuallyAdded && (
                              <button
                                type="button"
                                onClick={() => handleResetSingleComponent(row.id)}
                                className="p-1.5 rounded-[6px] text-[#6B7280] hover:text-[#F47721] hover:bg-[#FFF3E8]"
                                title={`Reset to imported (${formatIndianCurrency(row.importedNumericValue || 0)})`}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteOrHideComponent(row)}
                              className="p-1.5 rounded-[6px] text-[#6B7280] hover:text-[#F47721] hover:bg-[#FFF3E8]"
                              title={row.isManuallyAdded ? 'Delete row' : 'Hide row on payslip'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Hidden / Zero-Value Rows Accordion (if any exist for this employee) */}
        {hiddenZeroOrSuppressedRows.length > 0 && (
          <div className="px-4 py-2.5 bg-[#F8F9FA] border-t border-[#E5E7EB] flex items-center justify-between text-[12px] text-[#6B7280]">
            <span>
              {hiddenZeroOrSuppressedRows.length} zero-value or hidden component(s) suppressed on payslip
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {hiddenZeroOrSuppressedRows.map((hr) => (
                <button
                  key={hr.id}
                  type="button"
                  onClick={() => handleComponentVisibilityChange(hr.id, true)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] bg-[#FFFFFF] border border-[#E5E7EB] text-[11.5px] text-[#6B7280] hover:border-[#F47721] hover:text-[#F47721]"
                  title="Click to show on payslip"
                >
                  <Eye className="w-3 h-3" />
                  <span>{hr.overrideLabel || hr.originalLabel}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#F8F9FA]">
      {/* ====================================================================
          SECTION 7: PAGE HEADER
      ==================================================================== */}
      <div className="no-print bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="text-[11.5px] font-medium text-[#6B7280] flex items-center gap-1.5">
            <span>Payslip Editor</span>
            <span>/</span>
            <span className="text-[#F47721] font-semibold">
              {liveResolvedDocument?.employeeCode || 'Select Employee'}
            </span>
          </div>
          <div className="flex items-baseline gap-3 mt-0.5">
            <h1 className="text-[24px] font-semibold text-[#1F2937] leading-tight">
              Payslip Editor
            </h1>
            <p className="text-[13px] text-[#6B7280] hidden md:inline">
              Edit employee details, payroll components and payslip layout.
            </p>
          </div>
        </div>

        {/* Right Action Buttons: Only 'Send Payslip' is solid Orange #F47721 */}
        <div className="flex items-center gap-2.5">
          {canEdit && (
            <>
              <button
                type="button"
                disabled={saving || !serverDoc || !dirty}
                onClick={handleSaveDraft}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-[7px] text-[13px] transition-all cursor-pointer ${
                  dirty
                    ? 'bg-[#F47721] text-[#FFFFFF] hover:bg-[#E06612] font-semibold shadow-xs ring-2 ring-[#F47721]/30 animate-pulse'
                    : 'bg-[#F9FAFB] text-[#10B981] border border-[#D1D5DB] font-medium cursor-default opacity-90'
                }`}
                title={dirty ? 'Save changes made to this employee payslip' : 'All changes saved to database'}
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Saving...</span>
                  </>
                ) : dirty ? (
                  <>
                    <Save className="w-4 h-4 text-white" />
                    <span>Save Changes</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                    <span>Saved</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={saving || !serverDoc}
                onClick={handleResetAllToImported}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[7px] text-[13px] font-medium bg-[#FFFFFF] border border-[#E5E7EB] text-[#1F2937] hover:border-[#F47721] hover:text-[#F47721] transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4 text-[#6B7280]" />
                <span>Reset</span>
              </button>
            </>
          )}

          <button
            type="button"
            disabled={saving || !serverDoc}
            onClick={handlePreviewOrDownloadPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[7px] text-[13px] font-medium bg-[#FFFFFF] border border-[#E5E7EB] text-[#1F2937] hover:border-[#F47721] hover:text-[#F47721] transition-colors disabled:opacity-50"
          >
            <FileText className="w-4 h-4 text-[#6B7280]" />
            <span>Preview PDF</span>
          </button>

          {canEdit && (
            <button
              type="button"
              disabled={saving || !serverDoc}
              onClick={() => setShowSendModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[7px] text-[13px] font-semibold bg-[#F47721] text-[#FFFFFF] hover:bg-[#E06612] transition-colors shadow-xs disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>Send Payslip</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Callout Strip (Strictly Orange + White + Neutral Gray) */}
      {feedback && (
        <div className="no-print px-6 py-2 bg-[#FFF3E8] border-b border-[#F47721]/30 flex items-center justify-between text-[13px] text-[#1F2937]">
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-[#F47721] shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#F47721] shrink-0" />
            )}
            <span className="font-medium">{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[#6B7280] hover:text-[#1F2937] p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ====================================================================
          SECTION 8: MAIN TWO-PANEL WORKSPACE (45% Editor / 55% Preview)
      ==================================================================== */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT EDITOR PANEL (45%) */}
        {!isFullscreenPreview && (
          <div className="no-print w-full lg:w-[45%] h-full overflow-y-auto border-b lg:border-b-0 lg:border-r border-[#E5E7EB] bg-[#F8F9FA] p-5 space-y-4">
            {/* SECTION 9: EMPLOYEE SELECTION */}
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Employee Selection
                </span>
                <span className="text-[11.5px] text-[#6B7280]">
                  {employeesInPeriod.length} employees in {activeMonthLabel} {activeYear}
                </span>
              </div>

              {/* Search + Employee Dropdown + Month Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-5 relative">
                  <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name or ID..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                  />
                </div>

                <div className="sm:col-span-4">
                  <select
                    aria-label="Select Employee"
                    value={selectedRecordId || ''}
                    onChange={(e) => setSelectedRecordId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[13px] font-medium border border-[#E5E7EB] rounded-[7px]"
                  >
                    {employeesInPeriod.map((emp) => (
                      <option key={emp.recordId} value={emp.recordId}>
                        {emp.employeeCode} — {emp.employeeName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <select
                    aria-label="Payroll Month"
                    value={activeMonth}
                    onChange={(e) => onMonthYearChange(Number(e.target.value), activeYear)}
                    className="w-full px-2 py-1.5 text-[13px] font-medium border border-[#E5E7EB] rounded-[7px]"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label} {activeYear}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Compact Employee Summary Card */}
              {liveResolvedDocument && (
                <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-[8px] bg-[#FFF3E8] border border-[#F47721]/25 flex items-center justify-center text-[#F47721] font-semibold text-[13px] shrink-0">
                      {empInitials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-[#1F2937] truncate">
                          {liveResolvedDocument.employeeName}
                        </span>
                        <span className="text-[11.5px] font-semibold text-[#F47721] bg-[#FFF3E8] px-2 py-0.5 rounded-[5px]">
                          {liveResolvedDocument.employeeCode}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#6B7280] truncate">
                        {liveResolvedDocument.department || 'General'} ·{' '}
                        {liveResolvedDocument.designation || 'Staff'}
                      </div>
                      {liveResolvedDocument.employeeEmail && (
                        <a
                          href={`mailto:${liveResolvedDocument.employeeEmail}`}
                          className="text-[12px] text-[#F47721] hover:underline truncate block"
                        >
                          {liveResolvedDocument.employeeEmail}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Quick Prev/Next Employee Switcher */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={currentEmpIndex <= 0}
                      onClick={() => {
                        if (currentEmpIndex > 0) {
                          setSelectedRecordId(employeesInPeriod[currentEmpIndex - 1].recordId);
                        }
                      }}
                      className="p-1.5 rounded-[6px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#6B7280] hover:text-[#F47721] disabled:opacity-40"
                      title="Previous Employee"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={currentEmpIndex < 0 || currentEmpIndex >= employeesInPeriod.length - 1}
                      onClick={() => {
                        if (currentEmpIndex >= 0 && currentEmpIndex < employeesInPeriod.length - 1) {
                          setSelectedRecordId(employeesInPeriod[currentEmpIndex + 1].recordId);
                        }
                      }}
                      className="p-1.5 rounded-[6px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#6B7280] hover:text-[#F47721] disabled:opacity-40"
                      title="Next Employee"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                </div>
              )}
            </div>

            {/* SECTION 10: EDITOR TABS (Orange text + Orange bottom indicator) */}
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] px-4 pt-1">
              <div className="flex items-center gap-6 border-b border-[#E5E7EB] overflow-x-auto">
                {(
                  [
                    { key: 'details', label: 'Employee Details', icon: <User className="w-3.5 h-3.5" /> },
                    { key: 'earnings', label: 'Earnings', icon: <Wallet className="w-3.5 h-3.5" /> },
                    { key: 'deductions', label: 'Deductions', icon: <MinusCircle className="w-3.5 h-3.5" /> },
                    {
                      key: 'custom-tables',
                      label: `Custom Tables${(styleEdit?.customTables?.length || 0) > 0 ? ` (${styleEdit?.customTables?.length})` : ''}`,
                      icon: <Table className="w-3.5 h-3.5" />,
                    },
                    { key: 'other', label: 'Other Info', icon: <Info className="w-3.5 h-3.5" /> },
                    { key: 'notes', label: 'Notes', icon: <StickyNote className="w-3.5 h-3.5" /> },
                  ] as Array<{ key: LeftEditorTab; label: string; icon: React.ReactNode }>
                ).map((tab) => {
                  const active = leftTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setLeftTab(tab.key)}
                      className={`flex items-center gap-1.5 py-3 text-[13px] border-b-2 transition-colors whitespace-nowrap ${
                        active
                          ? 'border-[#F47721] text-[#F47721] font-semibold'
                          : 'border-transparent text-[#6B7280] hover:text-[#1F2937] font-medium'
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* TAB 1: EMPLOYEE DETAILS (Section 11 — 3-Column Responsive Form) */}
              {leftTab === 'details' && serverDoc && (
                <div className="py-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    <div>
                      <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                        Employee ID
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={empCodeEdit}
                        onChange={(e) => {
                          setDirty(true);
                          setEmpCodeEdit(e.target.value);
                        }}
                        className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                        Employee Name
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={empNameEdit}
                        onChange={(e) => {
                          setDirty(true);
                          setEmpNameEdit(e.target.value);
                        }}
                        className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        disabled={!canEdit}
                        value={empEmailEdit}
                        onChange={(e) => {
                          setDirty(true);
                          setEmpEmailEdit(e.target.value);
                        }}
                        className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                        Department
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={empDeptEdit}
                        onChange={(e) => {
                          setDirty(true);
                          setEmpDeptEdit(e.target.value);
                        }}
                        className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                        Designation
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={empDesigEdit}
                        onChange={(e) => {
                          setDirty(true);
                          setEmpDesigEdit(e.target.value);
                        }}
                        className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                      />
                    </div>

                    {/* Standard Corporate Metadata Fields: Location, Date of Joining, PAN Number, Bank Account */}
                    {STANDARD_METADATA_FIELDS.map((metaDef) => (
                      <div key={metaDef.key}>
                        <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                          {metaDef.label}
                        </label>
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={getStandardMetaValue(metaDef)}
                          onChange={(e) => setStandardMetaValue(metaDef, e.target.value)}
                          placeholder={`Optional ${metaDef.label}`}
                          className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Additional Imported Metadata Fields (e.g., Days Worked, PF No, UAN) */}
                  {componentsEdit.filter(
                    (c) =>
                      (c.category === 'Metadata' || c.category === 'CustomText') &&
                      !STANDARD_METADATA_FIELDS.some(
                        (m) =>
                          m.key === c.componentKey ||
                          m.matchLabels.includes((c.overrideLabel || c.originalLabel).trim().toLowerCase())
                      )
                  ).length > 0 && (
                    <div className="pt-3 border-t border-[#E5E7EB]">
                      <div className="text-[12px] font-semibold text-[#6B7280] mb-2.5">
                        Imported Payroll Metadata
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                        {componentsEdit
                          .filter(
                            (c) =>
                              (c.category === 'Metadata' || c.category === 'CustomText') &&
                              !STANDARD_METADATA_FIELDS.some(
                                (m) =>
                                  m.key === c.componentKey ||
                                  m.matchLabels.includes(
                                    (c.overrideLabel || c.originalLabel).trim().toLowerCase()
                                  )
                              )
                          )
                          .map((metaComp) => {
                            const val = metaComp.hasManualOverride
                              ? metaComp.overrideTextValue
                              : metaComp.importedTextValue;
                            return (
                              <div key={metaComp.id}>
                                <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                                  {metaComp.overrideLabel || metaComp.originalLabel}
                                </label>
                                <input
                                  type="text"
                                  disabled={!canEdit}
                                  value={val || ''}
                                  onChange={(e) => {
                                    const txt = e.target.value;
                                    setDirty(true);
                                    setComponentsEdit((prev) =>
                                      prev.map((x) =>
                                        x.id === metaComp.id
                                          ? {
                                              ...x,
                                              hasManualOverride: true,
                                              overrideTextValue: txt,
                                              effectiveTextValue: txt,
                                              explicitVisibilityOverride: txt.trim().length > 0 ? true : false,
                                            }
                                          : x
                                      )
                                    );
                                  }}
                                  className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                                />
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: OTHER INFO */}
              {leftTab === 'other' && serverDoc && (
                <div className="py-4 space-y-4">
                  {/* Zero-Value Policy Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-[8px] bg-[#F8F9FA] border border-[#E5E7EB]">
                    <div>
                      <div className="text-[13px] font-semibold text-[#1F2937]">
                        Show 0.00 Value Salary Rows
                      </div>
                      <div className="text-[11.5px] text-[#6B7280]">
                        By default, zero-value cells (0.00) are hidden on the payslip while blank cells never appear.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={
                        showZeroValueRowsOverride !== null
                          ? showZeroValueRowsOverride
                          : styleEdit?.showZeroValueRows ?? false
                      }
                      onChange={(e) => {
                        setDirty(true);
                        setShowZeroValueRowsOverride(e.target.checked);
                      }}
                      className="w-4 h-4"
                    />
                  </div>

                  {/* Employer Contributions */}
                  <div className="space-y-2">
                    <div className="text-[13px] font-semibold text-[#1F2937]">
                      Employer Contributions
                    </div>
                    {employerAndOtherRows.length === 0 ? (
                      <div className="text-[12.5px] text-[#6B7280]">
                        No employer contribution columns in this import.
                      </div>
                    ) : (
                      <div className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-[8px]">
                        {employerAndOtherRows.map((c) => {
                          const val = c.hasManualOverride
                            ? c.overrideNumericValue
                            : c.importedNumericValue;
                          return (
                            <div
                              key={c.id}
                              className="p-2.5 flex items-center justify-between text-[13px]"
                            >
                              <span className="font-medium text-[#1F2937]">
                                {c.overrideLabel || c.originalLabel}
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                disabled={!canEdit}
                                value={val ?? ''}
                                onChange={(e) => handleComponentAmountChange(c.id, e.target.value)}
                                className="w-32 px-2.5 py-1 text-right border border-[#E5E7EB] rounded-[6px]"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* TAB 5: NOTES */}
              {leftTab === 'notes' && serverDoc && (
                <div className="py-4 space-y-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#1F2937] mb-1.5">
                      Employee Payslip Notes / Remarks
                    </label>
                    <textarea
                      rows={4}
                      disabled={!canEdit}
                      value={footerNotesEdit}
                      onChange={(e) => {
                        setDirty(true);
                        setFooterNotesEdit(e.target.value);
                      }}
                      placeholder="Add optional remarks or notes to display at the bottom of this employee's payslip..."
                      className="w-full p-3 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                    />
                  </div>

                </div>
              )}

              {/* TAB: CUSTOM TABLES (Leave, Attendance, CTC, Loan, Blank) */}
              {leftTab === 'custom-tables' && serverDoc && (
                <div className="py-4 space-y-4">
                  {/* Preset quick action buttons */}
                  <div className="bg-[#FFF8F3] border border-[#F47721]/30 rounded-[8px] p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TableProperties className="w-4 h-4 text-[#F47721]" />
                        <span className="text-[13px] font-semibold text-[#1F2937]">
                          Add Additional Tables to Payslip
                        </span>
                      </div>
                      <span className="text-[11.5px] text-[#6B7280]">
                        {(styleEdit?.customTables?.length || 0)} active table{(styleEdit?.customTables?.length || 0) === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#4B5563]">
                      Add institutional sections like Leave Balance, Attendance, CTC Breakdown, or custom blank tables. These render immediately on both the A4 preview and the generated PDF.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => handleAddPresetTable('attendance')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[#FFFFFF] border border-[#F47721] text-[#F47721] hover:bg-[#FFF3E8] text-[12px] font-medium transition-colors shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Attendance Summary</span>
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => handleAddPresetTable('leave')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[#FFFFFF] border border-[#F47721] text-[#F47721] hover:bg-[#FFF3E8] text-[12px] font-medium transition-colors shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Leave Balance</span>
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => handleAddPresetTable('ctc')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[#FFFFFF] border border-[#F47721] text-[#F47721] hover:bg-[#FFF3E8] text-[12px] font-medium transition-colors shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Consolidated CTC</span>
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => handleAddPresetTable('loan')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[#FFFFFF] border border-[#F47721] text-[#F47721] hover:bg-[#FFF3E8] text-[12px] font-medium transition-colors shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Loans &amp; Advances</span>
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => handleAddPresetTable('blank')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[#FFFFFF] border border-[#D1D5DB] text-[#374151] hover:bg-[#F3F4F6] text-[12px] font-medium transition-colors shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Custom Blank Table</span>
                      </button>
                    </div>
                  </div>

                  {/* Empty state if no tables */}
                  {(!styleEdit?.customTables || styleEdit.customTables.length === 0) && (
                    <div className="text-center py-8 px-4 border border-dashed border-[#D1D5DB] rounded-[8px] bg-[#FAFAFA]">
                      <Table className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
                      <p className="text-[13px] font-medium text-[#374151]">No custom tables added yet</p>
                      <p className="text-[12px] text-[#6B7280] mt-1 max-w-md mx-auto">
                        Click any of the preset buttons above (such as Leave Balance or Attendance Summary) to add an institutional table to this employee&apos;s payslip.
                      </p>
                    </div>
                  )}

                  {/* List of Custom Tables */}
                  {styleEdit?.customTables && styleEdit.customTables.map((tbl, tIdx) => {
                    const isVisible = tbl.isVisible !== false;
                    return (
                      <div
                        key={tbl.id || tIdx}
                        className={`border rounded-[8px] transition-all overflow-hidden ${
                          isVisible ? 'border-[#E5E7EB] bg-[#FFFFFF]' : 'border-dashed border-[#D1D5DB] bg-[#F9FAFB] opacity-75'
                        }`}
                      >
                        {/* Table Card Top Bar */}
                        <div className="p-3 bg-[#F8F9FA] border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                            <span className="text-[11px] font-bold text-[#F47721] px-1.5 py-0.5 rounded bg-[#FFF3E8]">
                              Table {tIdx + 1}
                            </span>
                            <input
                              type="text"
                              disabled={!canEdit}
                              value={tbl.title}
                              onChange={(e) => {
                                handleUpdateCustomTable(tbl.id, (t) => ({ ...t, title: e.target.value }));
                              }}
                              placeholder="Table Title..."
                              className="font-semibold text-[13px] text-[#1F2937] px-2 py-1 rounded bg-[#FFFFFF] border border-[#D1D5DB] flex-1 max-w-[340px] focus:outline-none focus:border-[#F47721]"
                            />
                          </div>

                          <div className="flex items-center gap-1.5">
                            {/* Table Width / Layout selector */}
                            <div className="flex items-center gap-1.5 bg-[#FFFFFF] px-2 py-1 rounded-[5px] border border-[#E5E7EB]">
                              <span className="text-[11px] font-semibold text-[#6B7280]">Width:</span>
                              <select
                                disabled={!canEdit}
                                value={tbl.layoutWidth || 'auto'}
                                onChange={(e) => {
                                  handleUpdateCustomTable(tbl.id, (t) => ({
                                    ...t,
                                    layoutWidth: e.target.value as 'auto' | 'half' | 'full',
                                  }));
                                }}
                                className="text-[11px] font-medium text-[#1F2937] bg-transparent focus:outline-none cursor-pointer"
                              >
                                <option value="auto">Auto (Side-by-Side)</option>
                                <option value="half">Half (50%)</option>
                                <option value="full">Full (100%)</option>
                              </select>
                            </div>

                            {/* Visibility toggle */}
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => {
                                handleUpdateCustomTable(tbl.id, (t) => ({ ...t, isVisible: !t.isVisible }));
                              }}
                              className={`p-1.5 rounded-[5px] border text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
                                isVisible
                                  ? 'border-[#E5E7EB] bg-[#FFFFFF] text-[#1F2937] hover:text-[#F47721]'
                                  : 'border-[#FCA5A5] bg-[#FEF2F2] text-[#DC2626]'
                              }`}
                              title={isVisible ? 'Visible on payslip (click to hide)' : 'Hidden (click to show)'}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{isVisible ? 'Visible' : 'Hidden'}</span>
                            </button>

                            {/* Move Up */}
                            <button
                              type="button"
                              disabled={!canEdit || tIdx === 0}
                              onClick={() => handleMoveCustomTable(tIdx, 'up')}
                              className="p-1.5 rounded-[5px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#6B7280] hover:text-[#F47721] disabled:opacity-30 cursor-pointer"
                              title="Move table up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>

                            {/* Move Down */}
                            <button
                              type="button"
                              disabled={!canEdit || tIdx === styleEdit.customTables!.length - 1}
                              onClick={() => handleMoveCustomTable(tIdx, 'down')}
                              className="p-1.5 rounded-[5px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#6B7280] hover:text-[#F47721] disabled:opacity-30 cursor-pointer"
                              title="Move table down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Table */}
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => handleDeleteCustomTable(tbl.id)}
                              className="p-1.5 rounded-[5px] border border-[#FCA5A5] bg-[#FFFFFF] text-[#EF4444] hover:bg-[#FEF2F2] cursor-pointer"
                              title="Delete table"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Column Headers Editor */}
                        <div className="p-3 border-b border-[#E5E7EB] bg-[#FFFFFF] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11.5px] font-semibold text-[#6B7280] uppercase tracking-wide">
                              Columns ({tbl.columns.length})
                            </span>
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => handleAddColumnToTable(tbl.id)}
                              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#F47721] hover:underline cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add Column</span>
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {tbl.columns.map((col, cIdx) => (
                              <div
                                key={cIdx}
                                className="flex items-center gap-1 bg-[#F3F4F6] px-2 py-1 rounded-[5px] border border-[#E5E7EB]"
                              >
                                <input
                                  type="text"
                                  disabled={!canEdit}
                                  value={col}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleUpdateCustomTable(tbl.id, (t) => {
                                      const newCols = [...t.columns];
                                      newCols[cIdx] = val;
                                      return { ...t, columns: newCols };
                                    });
                                  }}
                                  className="text-[12px] font-medium text-[#1F2937] bg-transparent border-0 focus:outline-none w-28"
                                  placeholder={`Col ${cIdx + 1}`}
                                />
                                {tbl.columns.length > 1 && canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteColumnFromTable(tbl.id, cIdx)}
                                    className="text-[#9CA3AF] hover:text-[#EF4444] p-0.5 cursor-pointer"
                                    title="Delete column"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Rows and Cells Editor */}
                        <div className="p-3 bg-[#FFFFFF] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11.5px] font-semibold text-[#6B7280] uppercase tracking-wide">
                              Rows &amp; Cell Data ({tbl.rows.length})
                            </span>
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => handleAddRowToTable(tbl.id)}
                              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#F47721] hover:underline cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add Row</span>
                            </button>
                          </div>

                          {tbl.rows.length === 0 ? (
                            <p className="text-[12px] text-[#9CA3AF] italic py-2">
                              No rows added yet. Click &quot;Add Row&quot; to insert data.
                            </p>
                          ) : (
                            <div className="overflow-x-auto border border-[#E5E7EB] rounded-[6px]">
                              <table className="w-full text-left border-collapse text-[12px]">
                                <thead>
                                  <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB]">
                                    <th className="py-1.5 px-2 text-[#6B7280] font-semibold w-8 text-center">#</th>
                                    {tbl.columns.map((col, cIdx) => (
                                      <th key={cIdx} className="py-1.5 px-2 text-[#4B5563] font-semibold">
                                        {col || `Col ${cIdx + 1}`}
                                      </th>
                                    ))}
                                    <th className="py-1.5 px-2 text-[#6B7280] font-semibold w-16 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tbl.rows.map((row, rIdx) => (
                                    <tr key={row.id || rIdx} className="border-b border-[#F3F4F6] hover:bg-[#FAFAFA]">
                                      <td className="py-1 px-2 text-[#9CA3AF] text-center font-mono text-[11px]">
                                        {rIdx + 1}
                                      </td>
                                      {tbl.columns.map((_, cIdx) => {
                                        const cellVal = row.cells?.[cIdx] ?? '';
                                        return (
                                          <td key={cIdx} className="py-1 px-1.5">
                                            <input
                                              type="text"
                                              disabled={!canEdit}
                                              value={cellVal}
                                              onChange={(e) => {
                                                const newVal = e.target.value;
                                                handleUpdateCustomTable(tbl.id, (t) => {
                                                  const newRows = [...t.rows];
                                                  const rowCells = [...(newRows[rIdx].cells || [])];
                                                  rowCells[cIdx] = newVal;
                                                  newRows[rIdx] = { ...newRows[rIdx], cells: rowCells };
                                                  return { ...t, rows: newRows };
                                                });
                                              }}
                                              placeholder="..."
                                              className="w-full px-2 py-1 text-[12px] border border-[#E5E7EB] rounded-[4px] focus:outline-none focus:border-[#F47721] bg-[#FFFFFF]"
                                            />
                                          </td>
                                        );
                                      })}
                                      <td className="py-1 px-2 text-right whitespace-nowrap">
                                        <div className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            disabled={!canEdit || rIdx === 0}
                                            onClick={() => handleMoveRowInTable(tbl.id, rIdx, 'up')}
                                            className="p-1 text-[#6B7280] hover:text-[#1F2937] disabled:opacity-30 cursor-pointer"
                                            title="Move row up"
                                          >
                                            <ArrowUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={!canEdit || rIdx === tbl.rows.length - 1}
                                            onClick={() => handleMoveRowInTable(tbl.id, rIdx, 'down')}
                                            className="p-1 text-[#6B7280] hover:text-[#1F2937] disabled:opacity-30 cursor-pointer"
                                            title="Move row down"
                                          >
                                            <ArrowDown className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={!canEdit}
                                            onClick={() => handleDeleteRowFromTable(tbl.id, row.id)}
                                            className="p-1 text-[#9CA3AF] hover:text-[#EF4444] cursor-pointer"
                                            title="Delete row"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECTION 12: EARNINGS TABLE (shown when Earnings tab or Details tab is active) */}
            {(leftTab === 'earnings' || leftTab === 'details') &&
              serverDoc &&
              renderEditableComponentTable('Earnings', populatedEarningsRows, 'Earning')}

            {/* SECTION 13: DEDUCTIONS TABLE (shown when Deductions tab or Details tab is active) */}
            {(leftTab === 'deductions' || leftTab === 'details') &&
              serverDoc &&
              renderEditableComponentTable('Deductions', populatedDeductionsRows, 'Deduction')}

            {/* TOTALS & NET SALARY SUMMARY CARD */}
            {serverDoc && liveResolvedDocument && (
              <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[#1F2937]">
                    Payroll Totals Summary
                  </span>
                  {liveResolvedDocument.hasDiscrepancyWarning && canEdit && (
                    <button
                      type="button"
                      onClick={handleRecalculateTotalsFromVisibleRows}
                      className="text-[12px] font-semibold text-[#F47721] hover:underline"
                    >
                      Recalculate from visible rows
                    </button>
                  )}
                </div>

                {liveResolvedDocument.hasDiscrepancyWarning && (
                  <div className="p-3 rounded-[7px] bg-[#FFF3E8] border border-[#F47721]/30 text-[12px] text-[#1F2937] space-y-1">
                    {(liveResolvedDocument.discrepancyMessages || []).map((msg: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-[#F47721] shrink-0 mt-0.5" />
                        <span>{msg}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                      Gross Salary (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canEdit}
                      value={grossEdit}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDirty(true);
                        setGrossEdit(val);
                        const g = Number(val);
                        const d = Number(deductionsTotalEdit);
                        if (!Number.isNaN(g) && !Number.isNaN(d)) {
                          setNetSalaryEdit(String(Math.round((g - d) * 100) / 100));
                        }
                      }}
                      className="w-full px-3 py-1.5 text-[13px] font-semibold border border-[#E5E7EB] rounded-[7px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                      Total Deductions (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canEdit}
                      value={deductionsTotalEdit}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDirty(true);
                        setDeductionsTotalEdit(val);
                        const g = Number(grossEdit);
                        const d = Number(val);
                        if (!Number.isNaN(g) && !Number.isNaN(d)) {
                          setNetSalaryEdit(String(Math.round((g - d) * 100) / 100));
                        }
                      }}
                      className="w-full px-3 py-1.5 text-[13px] font-semibold border border-[#E5E7EB] rounded-[7px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#F47721] mb-1">
                      Net Salary (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canEdit}
                      value={netSalaryEdit}
                      onChange={(e) => {
                        setDirty(true);
                        setNetSalaryEdit(e.target.value);
                      }}
                      className="w-full px-3 py-1.5 text-[13px] font-bold text-[#F47721] bg-[#FFF3E8] border border-[#F47721]/40 rounded-[7px]"
                    />
                  </div>

                </div>
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            SECTION 15: RIGHT PAYSLIP PREVIEW WORKSPACE (55%)
        ==================================================================== */}
        <div
          className={`${
            isFullscreenPreview ? 'w-full' : 'w-full lg:w-[55%]'
          } h-full flex flex-col bg-[#F8F9FA] overflow-hidden`}
        >
          {/* Compact Preview Top Bar */}
          <div className="no-print bg-[#FFFFFF] border-b border-[#E5E7EB] px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Left: Payslip Preview | Template & Layout Tabs */}
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => setRightTab('preview')}
                className={`flex items-center gap-1.5 py-1.5 text-[13px] border-b-2 transition-colors ${
                  rightTab === 'preview'
                    ? 'border-[#F47721] text-[#F47721] font-semibold'
                    : 'border-transparent text-[#6B7280] hover:text-[#1F2937] font-medium'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Payslip Preview</span>
              </button>

              <button
                type="button"
                onClick={() => setRightTab('template')}
                className={`flex items-center gap-1.5 py-1.5 text-[13px] border-b-2 transition-colors ${
                  rightTab === 'template'
                    ? 'border-[#F47721] text-[#F47721] font-semibold'
                    : 'border-transparent text-[#6B7280] hover:text-[#1F2937] font-medium'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Template & Layout</span>
              </button>
            </div>

            {/* Right: Controls dependent on active rightTab */}
            {rightTab === 'preview' ? (
              <div className="flex items-center gap-2 text-[12px]">
                {/* Page indicator */}
                <div className="inline-flex items-center border border-[#E5E7EB] rounded-[6px] bg-[#FFFFFF] px-1.5 py-1 text-[#6B7280]">
                  <span className="px-1.5 font-medium text-[#1F2937]">1 / 1</span>
                </div>

                {/* Zoom controls */}
                <div className="inline-flex items-center border border-[#E5E7EB] rounded-[6px] bg-[#FFFFFF]">
                  <button
                    type="button"
                    onClick={() => setZoomScale((z) => Math.max(0.65, Number((z - 0.1).toFixed(2))))}
                    className="px-2 py-1 text-[#6B7280] hover:text-[#1F2937]"
                    title="Zoom Out"
                  >
                    −
                  </button>
                  <span className="px-2 py-1 font-medium text-[#1F2937] border-x border-[#E5E7EB] tabular-nums">
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomScale((z) => Math.min(1.2, Number((z + 0.1).toFixed(2))))}
                    className="px-2 py-1 text-[#6B7280] hover:text-[#1F2937]"
                    title="Zoom In"
                  >
                    +
                  </button>
                </div>

                {/* Fullscreen Toggle */}
                <button
                  type="button"
                  onClick={() => setIsFullscreenPreview((f) => !f)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#1F2937] hover:border-[#F47721] hover:text-[#F47721]"
                  title="Toggle Fullscreen Preview"
                >
                  {isFullscreenPreview ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">Fullscreen</span>
                </button>

                {/* Download PDF */}
                <button
                  type="button"
                  disabled={!serverDoc || saving}
                  onClick={handlePreviewOrDownloadPdf}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#1F2937] hover:border-[#F47721] hover:text-[#F47721] font-medium"
                >
                  <FileDown className="w-3.5 h-3.5 text-[#F47721]" />
                  <span>Download PDF</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[12px]">
                <button
                  type="button"
                  disabled={saving || !styleEdit}
                  onClick={handleSaveTemplatePreset}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#1F2937] hover:border-[#F47721] hover:text-[#F47721] font-medium transition-colors disabled:opacity-50"
                  title="Save styling configuration to template preset"
                >
                  <Save className="w-3.5 h-3.5 text-[#6B7280]" />
                  <span>Save Template</span>
                </button>

                <button
                  type="button"
                  disabled={saving || !styleEdit || !serverDoc}
                  onClick={handleApplyTemplateToAllInPeriod}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#1F2937] hover:border-[#F47721] hover:text-[#F47721] font-medium transition-colors disabled:opacity-50"
                  title="Apply this layout configuration to all employee payslips in current period"
                >
                  <Layers className="w-3.5 h-3.5 text-[#6B7280]" />
                  <span className="hidden sm:inline">Apply to All</span>
                </button>

                <button
                  type="button"
                  disabled={saving || !serverDoc || !styleEdit}
                  onClick={handleApplyTemplateToCurrentPayslip}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[6px] bg-[#F47721] text-[#FFFFFF] hover:bg-[#e06714] font-semibold shadow-xs transition-colors disabled:opacity-50"
                  title="Apply changes to this payslip and switch to Payslip Preview"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply to Payslip</span>
                </button>
              </div>
            )}
          </div>

          {/* RIGHT PANE BODY */}
          <div className="flex-1 overflow-y-auto p-6">
            {loadingDoc || !liveResolvedDocument ? (
              <div className="h-full flex items-center justify-center text-[13px] text-[#6B7280]">
                {loadingList || loadingDoc
                  ? 'Loading employee payslip...'
                  : 'Select an employee to view their payslip.'}
              </div>
            ) : rightTab === 'preview' ? (
              <div className="flex justify-center pb-10">
                <PayslipA4Paper doc={liveResolvedDocument} scale={zoomScale} />
              </div>
            ) : (
              /* SECTION 21: CLEAN TEMPLATE & LAYOUT SETTINGS PANEL */
              styleEdit && (
                <div className="max-w-2xl mx-auto space-y-5 pb-10">
                  {/* Preset Selector */}
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layout className="w-4 h-4 text-[#F47721]" />
                        <h3 className="text-[15px] font-semibold text-[#1F2937]">
                          Payslip Template Preset
                        </h3>
                      </div>
                      <span className="text-[12px] text-[#6B7280]">
                        {dirty ? '• Unsaved modifications' : 'All modifications saved'}
                      </span>
                    </div>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => {
                        const tplId = e.target.value;
                        setSelectedTemplateId(tplId);
                        setDirty(true);
                        const tpl = templates.find((t) => t.id === tplId);
                        if (tpl) {
                          setStyleEdit({ ...tpl.config });
                        }
                      }}
                      className="w-full px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
                    >
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.isDefault ? '(Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 1. Company Header */}
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('header')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#FFFFFF] hover:bg-[#F8F9FA] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Layout className="w-4 h-4 text-[#F47721]" />
                        <span className="text-[14.5px] font-semibold text-[#1F2937]">
                          1. Company Header &amp; Branding
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#6B7280]">
                          {collapsedSections.header ? 'Expand' : 'Collapse'}
                        </span>
                        {collapsedSections.header ? (
                          <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                        )}
                      </div>
                    </button>

                    {!collapsedSections.header && (
                      <div className="p-4 border-t border-[#E5E7EB] space-y-4">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setDirty(true);
                              setStyleEdit({
                                ...styleEdit,
                                overrideCompanyName: null,
                                overrideCompanySubtitle: null,
                                overrideCompanyAddress: null,
                                overrideCompanyContact: null,
                                overrideCompanyPhone: null,
                                overrideCompanyWebsite: null,
                                overrideLogoDataUrl: null,
                                documentTitle: 'PAYSLIP',
                                periodPresentationPrefix: 'For the Month of',
                                headerAlignment: 'Left',
                                showLogo: true,
                                showHeaderDivider: true,
                                headerDividerThicknessPt: 2,
                                headerDividerColor: '#F47721',
                                companyNameFontSizePt: 14,
                                showCompanySubtitle: true,
                                showCompanyAddress: true,
                                showCompanyContact: true,
                                showCompanyWebsite: true,
                              });
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11.5px] font-medium bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280] hover:text-[#F47721] hover:border-[#F47721] transition-colors"
                          >
                            <RotateCcw className="w-3 h-3 text-[#F47721]" />
                            <span>Reset Header Defaults</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {/* Header Logo Upload & Configuration Card */}
                          {(() => {
                            const headerActiveLogo =
                              styleEdit.overrideLogoDataUrl !== undefined && styleEdit.overrideLogoDataUrl !== null
                                ? styleEdit.overrideLogoDataUrl
                                : serverDoc?.logoDataUrl;
                            const isCustomLogo = Boolean(styleEdit.overrideLogoDataUrl);

                            return (
                              <div className="sm:col-span-2 p-3.5 rounded-[8px] bg-[#F8F9FA] border border-[#E5E7EB] space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] pb-2.5">
                                  <div className="flex items-center gap-2">
                                    <ImageIcon className="w-4 h-4 text-[#F47721]" />
                                    <span className="text-[12.5px] font-bold text-[#1F2937]">Company Header Logo</span>
                                    {isCustomLogo ? (
                                      <span className="px-2 py-0.5 text-[10.5px] font-semibold bg-[#FFF3E8] text-[#F47721] rounded-[4px] border border-[#F47721]/30">
                                        Custom Template Logo
                                      </span>
                                    ) : headerActiveLogo ? (
                                      <span className="px-2 py-0.5 text-[10.5px] font-medium bg-[#FFFFFF] text-[#6B7280] rounded-[4px] border border-[#E5E7EB]">
                                        Organization Default Logo
                                      </span>
                                    ) : null}
                                  </div>
                                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-[12px] text-[#1F2937]">
                                    <input
                                      type="checkbox"
                                      checked={styleEdit.showLogo}
                                      onChange={(e) => {
                                        setDirty(true);
                                        setStyleEdit({ ...styleEdit, showLogo: e.target.checked });
                                      }}
                                      className="rounded text-[#F47721] focus:ring-[#F47721]"
                                    />
                                    <span className="font-medium">Show Logo in Header</span>
                                  </label>
                                </div>

                                <div className="flex flex-wrap items-center gap-4">
                                  {/* Current Logo Thumbnail */}
                                  {headerActiveLogo ? (
                                    <div
                                      className={`h-14 min-w-[70px] max-w-[160px] p-1.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] flex items-center justify-center shadow-xs overflow-hidden ${
                                        !styleEdit.showLogo ? 'opacity-40' : ''
                                      }`}
                                      title={styleEdit.showLogo ? 'Active Header Logo' : 'Logo is hidden'}
                                    >
                                      <img
                                        src={headerActiveLogo}
                                        alt="Company Logo"
                                        className="max-h-full max-w-full object-contain"
                                      />
                                    </div>
                                  ) : (
                                    <div className="w-14 h-14 rounded-[8px] bg-[#F47721] flex items-center justify-center text-[#FFFFFF] font-bold text-[12px] shadow-xs">
                                      {((styleEdit.overrideCompanyName || serverDoc?.companyName) || 'CORP').slice(0, 5)}
                                    </div>
                                  )}

                                  {/* Upload and Logo Actions */}
                                  <div className="flex-1 min-w-[220px] space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] bg-[#FFF3E8] text-[#F47721] font-semibold text-[12px] cursor-pointer hover:bg-[#F47721] hover:text-[#FFFFFF] transition-colors shadow-xs">
                                        <Upload className="w-3.5 h-3.5" />
                                        <span>Upload Logo</span>
                                        <input
                                          type="file"
                                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                          className="hidden"
                                          onChange={handleHeaderLogoUpload}
                                        />
                                      </label>

                                      {isCustomLogo && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDirty(true);
                                            setStyleEdit({ ...styleEdit, overrideLogoDataUrl: null });
                                          }}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] text-[11.5px] font-medium bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280] hover:text-[#1F2937] hover:border-[#6B7280] transition-colors"
                                          title="Revert back to organization default logo"
                                        >
                                          <RotateCcw className="w-3 h-3 text-[#6B7280]" />
                                          <span>Reset to Org Default</span>
                                        </button>
                                      )}

                                      {headerActiveLogo && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDirty(true);
                                            setStyleEdit({
                                              ...styleEdit,
                                              showLogo: false,
                                              overrideLogoDataUrl: '',
                                            });
                                          }}
                                          className="text-[12px] text-[#EF4444] hover:text-[#DC2626] font-medium px-2 py-1 transition-colors"
                                          title="Remove logo from header"
                                        >
                                          Remove Logo
                                        </button>
                                      )}

                                      {isCustomLogo && (
                                        <button
                                          type="button"
                                          onClick={handleSaveLogoAsOrgDefault}
                                          disabled={savingOrgLogo}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] text-[11.5px] font-medium bg-[#FFFFFF] border border-[#F47721]/50 text-[#F47721] hover:bg-[#FFF3E8] transition-colors disabled:opacity-50"
                                          title="Set this logo as the system-wide default logo in Administrator Settings"
                                        >
                                          <Building2 className="w-3 h-3 text-[#F47721]" />
                                          <span>{savingOrgLogo ? 'Saving...' : 'Set as Org Default'}</span>
                                        </button>
                                      )}
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6B7280]">
                                      <span>Supported: PNG, JPEG, WebP, SVG (Max 2MB). Immediate live preview &amp; PDF sync.</span>
                                      {!styleEdit.showLogo && (
                                        <span className="text-[#EF4444] font-medium">Logo is currently hidden from header</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="sm:col-span-2">
                            <label className="block text-[11.5px] font-medium text-[#1F2937] mb-1">
                              Company / Institution Name
                            </label>
                            <input
                              type="text"
                              placeholder={serverDoc?.companyName || 'Institution Name'}
                              value={
                                styleEdit.overrideCompanyName !== undefined && styleEdit.overrideCompanyName !== null
                                  ? styleEdit.overrideCompanyName
                                  : serverDoc?.companyName || ''
                              }
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, overrideCompanyName: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] font-semibold border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11.5px] font-medium text-[#1F2937] mb-1">
                              Company Subtitle / Tagline <span className="text-[11px] text-[#F47721]">(Orange accent line)</span>
                            </label>
                            <input
                              type="text"
                              placeholder={serverDoc?.companySubtitle || 'Tagline'}
                              value={
                                styleEdit.overrideCompanySubtitle !== undefined && styleEdit.overrideCompanySubtitle !== null
                                  ? styleEdit.overrideCompanySubtitle
                                  : serverDoc?.companySubtitle || ''
                              }
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, overrideCompanySubtitle: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11.5px] font-medium text-[#1F2937] mb-1">
                              Registered Address
                            </label>
                            <input
                              type="text"
                              placeholder={serverDoc?.companyAddress || 'Registered Address'}
                              value={
                                styleEdit.overrideCompanyAddress !== undefined && styleEdit.overrideCompanyAddress !== null
                                  ? styleEdit.overrideCompanyAddress
                                  : serverDoc?.companyAddress || ''
                              }
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, overrideCompanyAddress: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#1F2937] mb-1">
                              Contact Information (Email / Phone)
                            </label>
                            <input
                              type="text"
                              placeholder={serverDoc?.companyEmail || 'accounts@company.org'}
                              value={
                                styleEdit.overrideCompanyContact !== undefined && styleEdit.overrideCompanyContact !== null
                                  ? styleEdit.overrideCompanyContact
                                  : serverDoc?.companyEmail || ''
                              }
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, overrideCompanyContact: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#1F2937] mb-1">
                              Website URL
                            </label>
                            <input
                              type="text"
                              placeholder={serverDoc?.companyWebsite || 'https://company.org'}
                              value={
                                styleEdit.overrideCompanyWebsite !== undefined && styleEdit.overrideCompanyWebsite !== null
                                  ? styleEdit.overrideCompanyWebsite
                                  : serverDoc?.companyWebsite || ''
                              }
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, overrideCompanyWebsite: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Header Alignment
                            </label>
                            <select
                              value={styleEdit.headerAlignment}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  headerAlignment: e.target.value as 'Left' | 'Center' | 'Split',
                                });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            >
                              <option value="Left">Left Aligned (Corporate Standard)</option>
                              <option value="Center">Center Aligned</option>
                              <option value="Split">Split (Logo Left, Contact Right)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Document Title
                            </label>
                            <input
                              type="text"
                              value={styleEdit.documentTitle}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, documentTitle: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Period Banner Prefix
                            </label>
                            <input
                              type="text"
                              value={styleEdit.periodPresentationPrefix}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, periodPresentationPrefix: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Company Name Font Size ({styleEdit.companyNameFontSizePt || 14} pt)
                            </label>
                            <input
                              type="range"
                              min={11}
                              max={18}
                              value={styleEdit.companyNameFontSizePt || 14}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  companyNameFontSizePt: Number(e.target.value),
                                });
                              }}
                              className="w-full accent-[#F47721]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Logo Height ({styleEdit.logoHeightPx} px)
                            </label>
                            <input
                              type="range"
                              min={32}
                              max={80}
                              value={styleEdit.logoHeightPx}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  logoHeightPx: Number(e.target.value),
                                });
                              }}
                              className="w-full accent-[#F47721]"
                            />
                          </div>
                        </div>

                        {/* Header Divider Line Controls */}
                        <div className="pt-2 border-t border-[#E5E7EB] space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={styleEdit.showHeaderDivider !== false}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, showHeaderDivider: e.target.checked });
                              }}
                              className="rounded-[4px] text-[#F47721] focus:ring-[#F47721]"
                            />
                            <span className="text-[12.5px] font-medium text-[#1F2937]">
                              Show Corporate Divider Line below Header
                            </span>
                          </label>

                          {styleEdit.showHeaderDivider !== false && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6 pt-1">
                              <div>
                                <label className="block text-[11px] text-[#6B7280] mb-1">
                                  Divider Thickness ({styleEdit.headerDividerThicknessPt || 2} pt)
                                </label>
                                <input
                                  type="range"
                                  min={1}
                                  max={4}
                                  step={0.5}
                                  value={styleEdit.headerDividerThicknessPt || 2}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({
                                      ...styleEdit,
                                      headerDividerThicknessPt: Number(e.target.value),
                                    });
                                  }}
                                  className="w-full accent-[#F47721]"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-[#6B7280] mb-1">
                                  Divider Color
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={styleEdit.headerDividerColor || styleEdit.primaryAccentColor || '#F47721'}
                                    onChange={(e) => {
                                      setDirty(true);
                                      setStyleEdit({
                                        ...styleEdit,
                                        headerDividerColor: e.target.value.toUpperCase(),
                                      });
                                    }}
                                    className="w-8 h-8 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                  />
                                  <input
                                    type="text"
                                    maxLength={7}
                                    value={styleEdit.headerDividerColor || styleEdit.primaryAccentColor || '#F47721'}
                                    onChange={(e) => {
                                      setDirty(true);
                                      setStyleEdit({ ...styleEdit, headerDividerColor: e.target.value });
                                    }}
                                    className="w-full px-2.5 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Visibility Checkboxes */}
                        <div className="pt-2 border-t border-[#E5E7EB]">
                          <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">
                            Header Element Display Toggles
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[
                              { label: 'Company Logo', key: 'showLogo' as const },
                              { label: 'Subtitle / Tagline', key: 'showCompanySubtitle' as const },
                              { label: 'Registered Address', key: 'showCompanyAddress' as const },
                              { label: 'Contact Details', key: 'showCompanyContact' as const },
                              { label: 'Website URL', key: 'showCompanyWebsite' as const },
                              { label: 'Identifiers (PAN/GST)', key: 'showAuthorizedIdentifiers' as const },
                            ].map((item) => (
                              <label key={item.key} className="flex items-center gap-2 text-[12px] text-[#1F2937] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(styleEdit[item.key])}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, [item.key]: e.target.checked });
                                  }}
                                  className="rounded-[4px] text-[#F47721] focus:ring-[#F47721]"
                                />
                                <span>{item.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Page & Layout */}
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('layout')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#FFFFFF] hover:bg-[#F8F9FA] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Sliders className="w-4 h-4 text-[#F47721]" />
                        <span className="text-[14.5px] font-semibold text-[#1F2937]">
                          2. Page &amp; Layout
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#6B7280]">
                          {collapsedSections.layout ? 'Expand' : 'Collapse'}
                        </span>
                        {collapsedSections.layout ? (
                          <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                        )}
                      </div>
                    </button>

                    {!collapsedSections.layout && (
                      <div className="p-4 border-t border-[#E5E7EB] space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Page Margins ({styleEdit.pageMarginMm} mm)
                            </label>
                            <input
                              type="range"
                              min={8}
                              max={24}
                              value={styleEdit.pageMarginMm}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  pageMarginMm: Number(e.target.value),
                                });
                              }}
                              className="w-full accent-[#F47721]"
                            />
                            <div className="flex justify-between text-[10.5px] text-[#6B7280] mt-0.5">
                              <span>8 mm (Compact)</span>
                              <span>14 mm (Default)</span>
                              <span>24 mm (Spacious)</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Section Spacing ({styleEdit.sectionSpacingPx ?? 12} px)
                            </label>
                            <input
                              type="range"
                              min={6}
                              max={24}
                              value={styleEdit.sectionSpacingPx ?? 12}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  sectionSpacingPx: Number(e.target.value),
                                });
                              }}
                              className="w-full accent-[#F47721]"
                            />
                            <div className="flex justify-between text-[10.5px] text-[#6B7280] mt-0.5">
                              <span>Tight (6px)</span>
                              <span>Normal (12px)</span>
                              <span>Relaxed (24px)</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Employee Details Grid
                            </label>
                            <select
                              value={styleEdit.employeeDetailsColumns}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  employeeDetailsColumns: Number(e.target.value),
                                });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            >
                              <option value={2}>2 Columns (Standard Corporate)</option>
                              <option value={3}>3 Columns (High Density)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Salary Tables Layout Mode
                            </label>
                            <select
                              value={styleEdit.tableLayoutMode}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  tableLayoutMode: e.target.value as 'SideBySide' | 'Stacked',
                                });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            >
                              <option value="SideBySide">Side-by-Side (Earnings Left, Deductions Right &amp; Additional Tables 2-Columns)</option>
                              <option value="Stacked">Stacked (Earnings Top, Deductions Bottom &amp; Additional Tables Full-Width)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Additional Tables Layout Mode
                            </label>
                            <select
                              value={styleEdit.additionalTablesLayoutMode || 'Auto'}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  additionalTablesLayoutMode: e.target.value as 'Auto' | 'SideBySide' | 'Stacked',
                                });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            >
                              <option value="Auto">Automatic (Follows Tables Layout Mode above)</option>
                              <option value="SideBySide">Side-by-Side (2 Columns: Left &amp; Right pairs)</option>
                              <option value="Stacked">Stacked (1 Column: Full Width, One Below Other)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. Typography */}
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('typography')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#FFFFFF] hover:bg-[#F8F9FA] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-[#F47721]" />
                        <span className="text-[14.5px] font-semibold text-[#1F2937]">
                          3. Typography
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#6B7280]">
                          {collapsedSections.typography ? 'Expand' : 'Collapse'}
                        </span>
                        {collapsedSections.typography ? (
                          <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                        )}
                      </div>
                    </button>

                    {!collapsedSections.typography && (
                      <div className="p-4 border-t border-[#E5E7EB] space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Font Family
                            </label>
                            <select
                              value={styleEdit.fontFamily}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, fontFamily: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            >
                              <option value="Figtree">Figtree (Corporate Standard)</option>
                              <option value="Inter">Inter (Modern Crisp)</option>
                              <option value="Segoe UI">Segoe UI (System Standard)</option>
                              <option value="Roboto">Roboto (Google Clean)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Base Document Font Size ({styleEdit.baseFontSizePt} pt)
                            </label>
                            <input
                              type="range"
                              min={8}
                              max={13}
                              step={0.5}
                              value={styleEdit.baseFontSizePt}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  baseFontSizePt: Number(e.target.value),
                                });
                              }}
                              className="w-full accent-[#F47721]"
                            />
                            <div className="flex justify-between text-[10.5px] text-[#6B7280] mt-0.5">
                              <span>8 pt</span>
                              <span>10 pt (Default)</span>
                              <span>13 pt</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Heading Font Weight
                            </label>
                            <select
                              value={styleEdit.headingFontWeight}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, headingFontWeight: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            >
                              <option value="500">Medium (500)</option>
                              <option value="600">Semi-Bold (600)</option>
                              <option value="700">Bold (700 - Default)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Amount Column Alignment
                            </label>
                            <select
                              value={styleEdit.amountAlignment}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  amountAlignment: e.target.value as 'Right' | 'Left',
                                });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            >
                              <option value="Right">Right-Aligned (Corporate Financial Standard)</option>
                              <option value="Left">Left-Aligned</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. Color & Theme */}
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('color')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#FFFFFF] hover:bg-[#F8F9FA] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Sliders className="w-4 h-4 text-[#F47721]" />
                        <span className="text-[14.5px] font-semibold text-[#1F2937]">
                          4. Color &amp; Theme
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#6B7280]">
                          {collapsedSections.color ? 'Expand' : 'Collapse'}
                        </span>
                        {collapsedSections.color ? (
                          <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                        )}
                      </div>
                    </button>

                    {!collapsedSections.color && (
                      <div className="p-4 border-t border-[#E5E7EB] space-y-4">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setDirty(true);
                              setStyleEdit({
                                ...styleEdit,
                                primaryAccentColor: '#F47721',
                                subtleAccentSurfaceColor: '#FFF3E8',
                                primaryTextColor: '#1F2937',
                                secondaryTextColor: '#6B7280',
                                documentBackgroundColor: '#FFFFFF',
                                titleBannerBgColor: '#FFF8F3',
                                titleBannerTitleColor: '#1F2937',
                                titleBannerPeriodColor: '#F47721',
                                netSalaryBgColor: '#FFF3E8',
                                netSalaryBorderColor: '#F47721',
                                netSalaryTitleColor: '#1F2937',
                                netSalaryWordsColor: '#6B7280',
                                netSalaryAmountColor: '#F47721',
                              });
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11.5px] font-medium bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280] hover:text-[#F47721] hover:border-[#F47721] transition-colors"
                          >
                            <RotateCcw className="w-3 h-3 text-[#F47721]" />
                            <span>Reset Colors to Corporate Orange</span>
                          </button>
                        </div>

                        {/* Palette Items */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {[
                            { label: 'Primary Orange Accent', key: 'primaryAccentColor' as const, def: '#F47721' },
                            { label: 'Soft Orange Surface', key: 'subtleAccentSurfaceColor' as const, def: '#FFF3E8' },
                            { label: 'Primary Text', key: 'primaryTextColor' as const, def: '#1F2937' },
                            { label: 'Secondary Text', key: 'secondaryTextColor' as const, def: '#6B7280' },
                            { label: 'Document Background', key: 'documentBackgroundColor' as const, def: '#FFFFFF' },
                          ].map((item) => (
                            <div key={item.key}>
                              <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                                {item.label}
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={styleEdit[item.key] || item.def}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({
                                      ...styleEdit,
                                      [item.key]: e.target.value.toUpperCase(),
                                    });
                                  }}
                                  className="w-8 h-8 p-0.5 rounded-[5px] border border-[#E5E7EB] bg-[#FFFFFF] cursor-pointer shrink-0"
                                />
                                <input
                                  type="text"
                                  maxLength={7}
                                  value={styleEdit[item.key] || item.def}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, [item.key]: e.target.value });
                                  }}
                                  className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Title & Period Banner Colors */}
                        <div className="pt-3 border-t border-[#E5E7EB] space-y-3">
                          <div className="text-[12px] font-semibold text-[#1F2937]">
                            Title &amp; Period Banner Colors
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">Banner Background</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={styleEdit.titleBannerBgColor || '#FFF8F3'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, titleBannerBgColor: e.target.value.toUpperCase() });
                                  }}
                                  className="w-8 h-8 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                />
                                <input
                                  type="text"
                                  maxLength={7}
                                  value={styleEdit.titleBannerBgColor || '#FFF8F3'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, titleBannerBgColor: e.target.value });
                                  }}
                                  className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">Title Text Color</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={styleEdit.titleBannerTitleColor || '#1F2937'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, titleBannerTitleColor: e.target.value.toUpperCase() });
                                  }}
                                  className="w-8 h-8 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                />
                                <input
                                  type="text"
                                  maxLength={7}
                                  value={styleEdit.titleBannerTitleColor || '#1F2937'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, titleBannerTitleColor: e.target.value });
                                  }}
                                  className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">Period Text Color</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={styleEdit.titleBannerPeriodColor || '#F47721'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, titleBannerPeriodColor: e.target.value.toUpperCase() });
                                  }}
                                  className="w-8 h-8 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                />
                                <input
                                  type="text"
                                  maxLength={7}
                                  value={styleEdit.titleBannerPeriodColor || '#F47721'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, titleBannerPeriodColor: e.target.value });
                                  }}
                                  className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Net Salary Banner Colors */}
                        <div className="pt-3 border-t border-[#E5E7EB] space-y-3">
                          <div className="text-[12px] font-semibold text-[#1F2937]">
                            Net Salary Payable Banner Colors
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">Background Color</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={styleEdit.netSalaryBgColor || '#FFF3E8'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, netSalaryBgColor: e.target.value.toUpperCase() });
                                  }}
                                  className="w-8 h-8 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                />
                                <input
                                  type="text"
                                  maxLength={7}
                                  value={styleEdit.netSalaryBgColor || '#FFF3E8'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, netSalaryBgColor: e.target.value });
                                  }}
                                  className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">Border Color</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={styleEdit.netSalaryBorderColor || '#F47721'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, netSalaryBorderColor: e.target.value.toUpperCase() });
                                  }}
                                  className="w-8 h-8 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                />
                                <input
                                  type="text"
                                  maxLength={7}
                                  value={styleEdit.netSalaryBorderColor || '#F47721'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, netSalaryBorderColor: e.target.value });
                                  }}
                                  className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">Title Text Color</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={styleEdit.netSalaryTitleColor || '#1F2937'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, netSalaryTitleColor: e.target.value.toUpperCase() });
                                  }}
                                  className="w-8 h-8 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                />
                                <input
                                  type="text"
                                  maxLength={7}
                                  value={styleEdit.netSalaryTitleColor || '#1F2937'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, netSalaryTitleColor: e.target.value });
                                  }}
                                  className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">Words Text Color</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={styleEdit.netSalaryWordsColor || '#6B7280'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, netSalaryWordsColor: e.target.value.toUpperCase() });
                                  }}
                                  className="w-8 h-8 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                />
                                <input
                                  type="text"
                                  maxLength={7}
                                  value={styleEdit.netSalaryWordsColor || '#6B7280'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, netSalaryWordsColor: e.target.value });
                                  }}
                                  className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">Net Amount Value Color</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={styleEdit.netSalaryAmountColor || '#F47721'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, netSalaryAmountColor: e.target.value.toUpperCase() });
                                  }}
                                  className="w-8 h-8 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                />
                                <input
                                  type="text"
                                  maxLength={7}
                                  value={styleEdit.netSalaryAmountColor || '#F47721'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, netSalaryAmountColor: e.target.value });
                                  }}
                                  className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 5. Borders */}
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('borders')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#FFFFFF] hover:bg-[#F8F9FA] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Layout className="w-4 h-4 text-[#F47721]" />
                        <span className="text-[14.5px] font-semibold text-[#1F2937]">
                          5. Borders (Master, Row, Column &amp; Sections)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#6B7280]">
                          {collapsedSections.borders ? 'Expand' : 'Collapse'}
                        </span>
                        {collapsedSections.borders ? (
                          <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                        )}
                      </div>
                    </button>

                    {!collapsedSections.borders && (
                      <div className="p-4 border-t border-[#E5E7EB] space-y-4">
                        {/* Master Border Controls */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={styleEdit.enableBorders !== false}
                                onChange={(e) => {
                                  setDirty(true);
                                  setStyleEdit({ ...styleEdit, enableBorders: e.target.checked });
                                }}
                                className="rounded-[4px] text-[#F47721] focus:ring-[#F47721]"
                              />
                              <span className="text-[13px] font-semibold text-[#1F2937]">
                                Enable Document Borders
                              </span>
                            </label>
                            <span className="text-[11px] text-[#6B7280]">Master Border Switch</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">
                                Master Border Color
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={styleEdit.borderColor || '#E5E7EB'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, borderColor: e.target.value.toUpperCase() });
                                  }}
                                  className="w-8 h-8 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                />
                                <input
                                  type="text"
                                  maxLength={7}
                                  value={styleEdit.borderColor || '#E5E7EB'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, borderColor: e.target.value });
                                  }}
                                  className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">
                                Master Border Thickness ({styleEdit.borderThicknessPt || 1} pt)
                              </label>
                              <div className="flex items-center gap-1.5 pt-1">
                                {[0.5, 1, 1.5, 2, 2.5, 3].map((val) => (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() => {
                                      setDirty(true);
                                      setStyleEdit({ ...styleEdit, borderThicknessPt: val });
                                    }}
                                    className={`px-2 py-1 text-[11px] font-medium rounded-[5px] border ${
                                      (styleEdit.borderThicknessPt || 1) === val
                                        ? 'bg-[#F47721] text-white border-[#F47721]'
                                        : 'bg-white text-[#1F2937] border-[#E5E7EB] hover:border-[#F47721]'
                                    }`}
                                  >
                                    {val}px
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Row Borders */}
                        <div className="pt-3 border-t border-[#E5E7EB] space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={styleEdit.enableRowBorders !== false}
                                onChange={(e) => {
                                  setDirty(true);
                                  setStyleEdit({ ...styleEdit, enableRowBorders: e.target.checked });
                                }}
                                className="rounded-[4px] text-[#F47721] focus:ring-[#F47721]"
                              />
                              <span className="text-[13px] font-semibold text-[#1F2937]">
                                Table Row Borders
                              </span>
                            </label>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-6">
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">
                                Row Border Mode
                              </label>
                              <select
                                value={styleEdit.rowBorderMode || 'All'}
                                onChange={(e) => {
                                  setDirty(true);
                                  setStyleEdit({
                                    ...styleEdit,
                                    rowBorderMode: e.target.value as any,
                                  });
                                }}
                                className="w-full px-2.5 py-1 text-[12px] border border-[#E5E7EB] rounded-[6px]"
                              >
                                <option value="All">All Rows</option>
                                <option value="HeaderOnly">Header Rows Only</option>
                                <option value="DataOnly">Data Rows Only</option>
                                <option value="None">None</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">
                                Row Border Color
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={styleEdit.rowBorderColor || styleEdit.borderColor || '#E5E7EB'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, rowBorderColor: e.target.value.toUpperCase() });
                                  }}
                                  className="w-7 h-7 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                />
                                <input
                                  type="text"
                                  maxLength={7}
                                  value={styleEdit.rowBorderColor || styleEdit.borderColor || '#E5E7EB'}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, rowBorderColor: e.target.value });
                                  }}
                                  className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#6B7280] mb-1">
                                Row Thickness ({styleEdit.rowBorderThicknessPt || 1} pt)
                              </label>
                              <input
                                type="range"
                                min={0.5}
                                max={2}
                                step={0.5}
                                value={styleEdit.rowBorderThicknessPt || 1}
                                onChange={(e) => {
                                  setDirty(true);
                                  setStyleEdit({ ...styleEdit, rowBorderThicknessPt: Number(e.target.value) });
                                }}
                                className="w-full accent-[#F47721]"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Column Borders */}
                        <div className="pt-3 border-t border-[#E5E7EB] space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(styleEdit.enableColumnBorders)}
                                onChange={(e) => {
                                  setDirty(true);
                                  setStyleEdit({ ...styleEdit, enableColumnBorders: e.target.checked });
                                }}
                                className="rounded-[4px] text-[#F47721] focus:ring-[#F47721]"
                              />
                              <span className="text-[13px] font-semibold text-[#1F2937]">
                                Table Column Borders (Vertical Dividers)
                              </span>
                            </label>
                          </div>

                          {styleEdit.enableColumnBorders && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                              <div>
                                <label className="block text-[11px] text-[#6B7280] mb-1">
                                  Column Border Color
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={styleEdit.columnBorderColor || styleEdit.borderColor || '#E5E7EB'}
                                    onChange={(e) => {
                                      setDirty(true);
                                      setStyleEdit({ ...styleEdit, columnBorderColor: e.target.value.toUpperCase() });
                                    }}
                                    className="w-7 h-7 p-0.5 rounded-[5px] border border-[#E5E7EB] cursor-pointer shrink-0"
                                  />
                                  <input
                                    type="text"
                                    maxLength={7}
                                    value={styleEdit.columnBorderColor || styleEdit.borderColor || '#E5E7EB'}
                                    onChange={(e) => {
                                      setDirty(true);
                                      setStyleEdit({ ...styleEdit, columnBorderColor: e.target.value });
                                    }}
                                    className="w-full px-2 py-1 text-[12px] font-mono uppercase border border-[#E5E7EB] rounded-[6px]"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[11px] text-[#6B7280] mb-1">
                                  Column Thickness ({styleEdit.columnBorderThicknessPt || 1} pt)
                                </label>
                                <input
                                  type="range"
                                  min={0.5}
                                  max={2}
                                  step={0.5}
                                  value={styleEdit.columnBorderThicknessPt || 1}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, columnBorderThicknessPt: Number(e.target.value) });
                                  }}
                                  className="w-full accent-[#F47721]"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Section Border Toggles */}
                        <div className="pt-3 border-t border-[#E5E7EB] space-y-2">
                          <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                            Section Border Controls (Enable / Disable per Section)
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[
                              { label: 'Employee Details', key: 'showEmployeeDetailsBorder' as const },
                              { label: 'Salary Tables', key: 'showSalaryTablesBorder' as const },
                              { label: 'Totals Summary', key: 'showTotalsSummaryBorder' as const },
                              { label: 'Net Salary Box', key: 'showNetSalaryBorder' as const },
                              { label: 'Signature Box', key: 'showSignatureBorder' as const },
                              { label: 'Footer Line', key: 'showFooterBorder' as const },
                            ].map((s) => (
                              <label key={s.key} className="flex items-center gap-2 text-[12px] text-[#1F2937] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={styleEdit[s.key] !== false}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, [s.key]: e.target.checked });
                                  }}
                                  className="rounded-[4px] text-[#F47721] focus:ring-[#F47721]"
                                />
                                <span>{s.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 6. Tables */}
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('tables')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#FFFFFF] hover:bg-[#F8F9FA] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Layout className="w-4 h-4 text-[#F47721]" />
                        <span className="text-[14.5px] font-semibold text-[#1F2937]">
                          6. Tables (Widths, Column Splits, Padding &amp; Zero Suppression)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#6B7280]">
                          {collapsedSections.tables ? 'Expand' : 'Collapse'}
                        </span>
                        {collapsedSections.tables ? (
                          <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                        )}
                      </div>
                    </button>

                    {!collapsedSections.tables && (
                      <div className="p-4 border-t border-[#E5E7EB] space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Table Overall Width ({styleEdit.tableWidthPercent || 100}%)
                            </label>
                            <input
                              type="range"
                              min={80}
                              max={100}
                              value={styleEdit.tableWidthPercent || 100}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  tableWidthPercent: Number(e.target.value),
                                });
                              }}
                              className="w-full accent-[#F47721]"
                            />
                            <div className="flex justify-between text-[10.5px] text-[#6B7280] mt-0.5">
                              <span>80%</span>
                              <span>90%</span>
                              <span>100% (Full Width)</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Earnings Particulars Column Width ({styleEdit.earningsLabelWidthPercent || 65}% / Amount: {100 - (styleEdit.earningsLabelWidthPercent || 65)}%)
                            </label>
                            <input
                              type="range"
                              min={40}
                              max={80}
                              value={styleEdit.earningsLabelWidthPercent || 65}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  earningsLabelWidthPercent: Number(e.target.value),
                                });
                              }}
                              className="w-full accent-[#F47721]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Deductions Particulars Column Width ({styleEdit.deductionsLabelWidthPercent || 65}% / Amount: {100 - (styleEdit.deductionsLabelWidthPercent || 65)}%)
                            </label>
                            <input
                              type="range"
                              min={40}
                              max={80}
                              value={styleEdit.deductionsLabelWidthPercent || 65}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  deductionsLabelWidthPercent: Number(e.target.value),
                                });
                              }}
                              className="w-full accent-[#F47721]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Table Gap Spacing ({styleEdit.tableSpacingPx ?? 16} px)
                            </label>
                            <input
                              type="range"
                              min={8}
                              max={28}
                              value={styleEdit.tableSpacingPx ?? 16}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  tableSpacingPx: Number(e.target.value),
                                });
                              }}
                              className="w-full accent-[#F47721]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Row Vertical Padding ({styleEdit.rowVerticalPaddingPx} px)
                            </label>
                            <input
                              type="range"
                              min={3}
                              max={14}
                              value={styleEdit.rowVerticalPaddingPx}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  rowVerticalPaddingPx: Number(e.target.value),
                                });
                              }}
                              className="w-full accent-[#F47721]"
                            />
                          </div>

                          <div className="flex items-center pt-5">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={styleEdit.showCurrencySymbolInRows}
                                onChange={(e) => {
                                  setDirty(true);
                                  setStyleEdit({
                                    ...styleEdit,
                                    showCurrencySymbolInRows: e.target.checked,
                                  });
                                }}
                                className="rounded-[4px] text-[#F47721] focus:ring-[#F47721]"
                              />
                              <span className="text-[12.5px] font-medium text-[#1F2937]">
                                Show Currency Symbol (₹) in Table Rows
                              </span>
                            </label>
                          </div>
                        </div>

                        {/* Headings */}
                        <div className="pt-3 border-t border-[#E5E7EB] grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Earnings Section Heading
                            </label>
                            <input
                              type="text"
                              value={styleEdit.earningsSectionHeading}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, earningsSectionHeading: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Deductions Section Heading
                            </label>
                            <input
                              type="text"
                              value={styleEdit.deductionsSectionHeading}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, deductionsSectionHeading: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Particulars Column Header
                            </label>
                            <input
                              type="text"
                              value={styleEdit.componentColumnHeading}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, componentColumnHeading: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                              Amount Column Header
                            </label>
                            <input
                              type="text"
                              value={styleEdit.amountColumnHeading}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, amountColumnHeading: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                            />
                          </div>
                        </div>

                        {/* Zero Value Rows Rule */}
                        <div className="pt-3 border-t border-[#E5E7EB] p-3 rounded-[8px] bg-[#FFF8F3] border border-[#F47721]/30">
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={styleEdit.showZeroValueRows}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, showZeroValueRows: e.target.checked });
                                setShowZeroValueRowsOverride(e.target.checked);
                              }}
                              className="mt-0.5 rounded-[4px] text-[#F47721] focus:ring-[#F47721]"
                            />
                            <div>
                              <span className="text-[12.5px] font-semibold text-[#1F2937] block">
                                Show Zero Value / Inapplicable Salary Rows
                              </span>
                              <span className="text-[11.5px] text-[#6B7280] block mt-0.5">
                                When unchecked (recommended), rows with ₹0 or empty imported values are automatically suppressed so the payslip remains clean.
                              </span>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 7. Signature Area */}
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('signature')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#FFFFFF] hover:bg-[#F8F9FA] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Edit3 className="w-4 h-4 text-[#F47721]" />
                        <span className="text-[14.5px] font-semibold text-[#1F2937]">
                          7. Authorized Signature Controls
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#6B7280]">
                          {collapsedSections.signature ? 'Expand' : 'Collapse'}
                        </span>
                        {collapsedSections.signature ? (
                          <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                        )}
                      </div>
                    </button>

                    {!collapsedSections.signature && (
                      <div className="p-4 border-t border-[#E5E7EB] space-y-4">
                        <div className="flex items-center justify-between p-3 rounded-[8px] bg-[#F8F9FA] border border-[#E5E7EB]">
                          <div>
                            <span className="text-[13px] font-semibold text-[#1F2937] block">
                              Enable Authorized Signature Area
                            </span>
                            <span className="text-[11.5px] text-[#6B7280] block mt-0.5">
                              When disabled, the signature line, name, designation and all reserved space are completely removed with zero blank space.
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={styleEdit.showSignatureArea}
                            onChange={(e) => {
                              setDirty(true);
                              setStyleEdit({ ...styleEdit, showSignatureArea: e.target.checked });
                            }}
                            className="w-5 h-5 rounded-[4px] text-[#F47721] focus:ring-[#F47721] cursor-pointer"
                          />
                        </div>

                        {styleEdit.showSignatureArea && (
                          <div className="space-y-4">
                            {/* Alignment Selector */}
                            <div>
                              <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1.5">
                                Signature Position / Alignment
                              </label>
                              <div className="flex items-center gap-2">
                                {[
                                  { label: 'Left Aligned', val: 'Left' as const },
                                  { label: 'Center Aligned', val: 'Center' as const },
                                  { label: 'Right Aligned (Default)', val: 'Right' as const },
                                ].map((pos) => (
                                  <button
                                    key={pos.val}
                                    type="button"
                                    onClick={() => {
                                      setDirty(true);
                                      setStyleEdit({ ...styleEdit, signatureAlignment: pos.val });
                                    }}
                                    className={`flex-1 py-1.5 px-3 text-[12.5px] font-medium rounded-[7px] border transition-colors ${
                                      (styleEdit.signatureAlignment || 'Right') === pos.val
                                        ? 'bg-[#F47721] text-white border-[#F47721]'
                                        : 'bg-white text-[#1F2937] border-[#E5E7EB] hover:border-[#F47721]'
                                    }`}
                                  >
                                    {pos.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                              <div>
                                <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                                  Authorized Signatory Title
                                </label>
                                <input
                                  type="text"
                                  value={styleEdit.rightSignatureLabel}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, rightSignatureLabel: e.target.value });
                                  }}
                                  className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                                />
                              </div>

                              <div>
                                <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                                  Signatory Person Name (Optional)
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Dr. K. Ramanathan"
                                  value={styleEdit.signatoryName || ''}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, signatoryName: e.target.value });
                                  }}
                                  className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                                />
                              </div>

                              <div>
                                <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                                  Signatory Designation (Optional)
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Senior Accounts Officer"
                                  value={styleEdit.signatoryDesignation || ''}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, signatoryDesignation: e.target.value });
                                  }}
                                  className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                                />
                              </div>

                              <div>
                                <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                                  Department / Subtext
                                </label>
                                <input
                                  type="text"
                                  value={styleEdit.rightSignatureSubtext}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, rightSignatureSubtext: e.target.value });
                                  }}
                                  className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                                />
                              </div>

                              <div>
                                <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                                  Signature Line Width ({styleEdit.signatureLineWidthPx || 160} px)
                                </label>
                                <input
                                  type="range"
                                  min={100}
                                  max={260}
                                  value={styleEdit.signatureLineWidthPx || 160}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({
                                      ...styleEdit,
                                      signatureLineWidthPx: Number(e.target.value),
                                    });
                                  }}
                                  className="w-full accent-[#F47721]"
                                />
                              </div>

                              <div>
                                <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                                  Line Thickness ({styleEdit.signatureLineThicknessPt || 1} pt)
                                </label>
                                <input
                                  type="range"
                                  min={0.5}
                                  max={3}
                                  step={0.5}
                                  value={styleEdit.signatureLineThicknessPt || 1}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({
                                      ...styleEdit,
                                      signatureLineThicknessPt: Number(e.target.value),
                                    });
                                  }}
                                  className="w-full accent-[#F47721]"
                                />
                              </div>

                              <div>
                                <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                                  Top Spacing before Signature ({styleEdit.signatureTopSpacingPx || 18} px)
                                </label>
                                <input
                                  type="range"
                                  min={10}
                                  max={40}
                                  value={styleEdit.signatureTopSpacingPx || 18}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({
                                      ...styleEdit,
                                      signatureTopSpacingPx: Number(e.target.value),
                                    });
                                  }}
                                  className="w-full accent-[#F47721]"
                                />
                              </div>
                            </div>

                            {/* Left Signature Option */}
                            <div className="pt-3 border-t border-[#E5E7EB] space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={styleEdit.showLeftSignature}
                                  onChange={(e) => {
                                    setDirty(true);
                                    setStyleEdit({ ...styleEdit, showLeftSignature: e.target.checked });
                                  }}
                                  className="rounded-[4px] text-[#F47721] focus:ring-[#F47721]"
                                />
                                <span className="text-[12.5px] font-medium text-[#1F2937]">
                                  Show Employee Signature / Acknowledgement Line (Left Side)
                                </span>
                              </label>

                              {styleEdit.showLeftSignature && (
                                <div className="pl-6 pt-1 max-w-sm">
                                  <label className="block text-[11px] text-[#6B7280] mb-1">
                                    Left Signature Label
                                  </label>
                                  <input
                                    type="text"
                                    value={styleEdit.leftSignatureLabel}
                                    onChange={(e) => {
                                      setDirty(true);
                                      setStyleEdit({ ...styleEdit, leftSignatureLabel: e.target.value });
                                    }}
                                    className="w-full px-3 py-1.5 text-[12.5px] border border-[#E5E7EB] rounded-[7px]"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 8. Footer & Notes */}
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('footer')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#FFFFFF] hover:bg-[#F8F9FA] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <StickyNote className="w-4 h-4 text-[#F47721]" />
                        <span className="text-[14.5px] font-semibold text-[#1F2937]">
                          8. Footer &amp; Administrative Notes
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#6B7280]">
                          {collapsedSections.footer ? 'Expand' : 'Collapse'}
                        </span>
                        {collapsedSections.footer ? (
                          <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                        )}
                      </div>
                    </button>

                    {!collapsedSections.footer && (
                      <div className="p-4 border-t border-[#E5E7EB] space-y-4">
                        <div className="space-y-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={styleEdit.showAmountInWords}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({ ...styleEdit, showAmountInWords: e.target.checked });
                              }}
                              className="rounded-[4px] text-[#F47721] focus:ring-[#F47721]"
                            />
                            <span className="text-[12.5px] font-medium text-[#1F2937]">
                              Show Net Salary Amount in Words
                            </span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={styleEdit.showFooterDisclaimer}
                              onChange={(e) => {
                                setDirty(true);
                                setStyleEdit({
                                  ...styleEdit,
                                  showFooterDisclaimer: e.target.checked,
                                });
                              }}
                              className="rounded-[4px] text-[#F47721] focus:ring-[#F47721]"
                            />
                            <span className="text-[12.5px] font-medium text-[#1F2937]">
                              Show Footer Disclaimer Line
                            </span>
                          </label>
                        </div>

                        <div>
                          <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                            Footer Disclaimer Text
                          </label>
                          <input
                            type="text"
                            value={
                              styleEdit.footerDisclaimerText
                                ? styleEdit.footerDisclaimerText.replace(/PaySlip Studio/g, 'FINORA')
                                : 'This is an official payroll document generated by FINORA — Finance & Payroll Management System.'
                            }
                            onChange={(e) => {
                              setDirty(true);
                              setStyleEdit({ ...styleEdit, footerDisclaimerText: e.target.value });
                            }}
                            className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                            Custom Administrative Notes (Appears above disclaimer)
                          </label>
                          <textarea
                            rows={2}
                            placeholder="Optional notes or instructions for the employee..."
                            value={footerNotesEdit}
                            onChange={(e) => {
                              setDirty(true);
                              setFooterNotesEdit(e.target.value);
                            }}
                            className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px] text-[#1F2937]"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 9. Visibility & Section Ordering */}
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('visibility')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#FFFFFF] hover:bg-[#F8F9FA] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Eye className="w-4 h-4 text-[#F47721]" />
                        <span className="text-[14.5px] font-semibold text-[#1F2937]">
                          9. Section Visibility &amp; Ordering
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#6B7280]">
                          {collapsedSections.visibility ? 'Expand' : 'Collapse'}
                        </span>
                        {collapsedSections.visibility ? (
                          <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                        )}
                      </div>
                    </button>

                    {!collapsedSections.visibility && (
                      <div className="p-4 border-t border-[#E5E7EB] space-y-3">
                        <p className="text-[12px] text-[#6B7280]">
                          Document sections render in the standard corporate sequence below:
                        </p>
                        <div className="space-y-1.5">
                          {[
                            '1. Header (Organization branding & contact)',
                            '2. TitleBanner (Document title & payroll period)',
                            '3. EmployeeDetails (Code, Name, Department, Designation, Joining date)',
                            '4. SalaryTables (Earnings & Deductions tables)',
                            '5. CustomFields (Additional payroll metadata)',
                            ...(styleEdit?.customTables || []).map(
                              (t, idx) =>
                                `Custom Table ${idx + 1}: ${t.title || 'Untitled'} (${t.columns?.length || 0} cols, ${t.rows?.length || 0} rows)`
                            ),
                            '6. TotalsSummary (Gross Salary & Total Deductions bar)',
                            '7. NetSalaryBanner (Highlighted net payable amount & words)',
                            '8. SignatureBlock (Signatory authorization)',
                            '9. Footer (Administrative notes & system disclaimer)',
                          ].map((sec, i) => {
                            const isCustom = sec.startsWith('Custom Table');
                            return (
                              <div
                                key={i}
                                className={`px-3 py-2 rounded-[6px] border text-[12px] flex items-center justify-between ${
                                  isCustom
                                    ? 'bg-[#FFF8F3] border-[#F47721]/30 text-[#1F2937]'
                                    : 'bg-[#F8F9FA] border-[#E5E7EB] text-[#1F2937]'
                                }`}
                              >
                                <span className={isCustom ? 'font-medium text-[#F47721]' : ''}>{sec}</span>
                                <span className="text-[11px] font-medium text-[#F47721]">Active</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="pt-2 flex items-center justify-between border-t border-[#E5E7EB]">
                          <span className="text-[11.5px] text-[#6B7280]">
                            {(styleEdit?.customTables?.length || 0)} custom table{(styleEdit?.customTables?.length || 0) === 1 ? '' : 's'} configured
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setLeftTab('custom-tables');
                              setRightTab('preview');
                            }}
                            className="text-[12px] font-semibold text-[#F47721] hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <TableProperties className="w-3.5 h-3.5" />
                            <span>Configure Tables in Payslip Editor &rarr;</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Template Status Bar */}
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-3.5 flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${dirty ? 'bg-[#F47721] animate-pulse' : 'bg-[#10B981]'}`} />
                      <span className="text-[12.5px] font-medium text-[#1F2937]">
                        {dirty ? 'Unsaved template styling changes' : 'All template changes saved'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ====================================================================
          SEND PAYSLIP MODAL (Clean Orange + White Corporate Dialog)
      ==================================================================== */}
      {showSendModal && liveResolvedDocument && (
        <div className="fixed inset-0 z-50 bg-[#1F2937]/40 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] shadow-xl w-full max-w-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-[#F47721]" />
                <h2 className="text-[16px] font-semibold text-[#1F2937]">
                  Send Payslip — {liveResolvedDocument.employeeName} ({liveResolvedDocument.employeeCode})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSendModal(false)}
                className="p-1 rounded-[6px] text-[#6B7280] hover:text-[#1F2937]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 max-h-[78vh] overflow-y-auto">
              {/* Inline Error or Success Banner inside Modal */}
              {modalError && (
                <div className="p-3 rounded-[8px] bg-[#FFF3E8] border border-[#F47721] text-[12.5px] text-[#1F2937] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#F47721] shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">
                    <div className="font-semibold text-[#F47721] mb-0.5">Email Delivery Notice</div>
                    <div>{modalError}</div>
                  </div>

                </div>
              )}

              {modalSuccessMsg && (
                <div className="p-3 rounded-[8px] bg-[#FFF3E8] border border-[#F47721]/40 text-[12.5px] text-[#1F2937] flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#F47721] shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{modalSuccessMsg}</div>
                </div>
              )}

              {/* Sender account is managed centrally in Admin Console → Email Configuration */}
              {!smtpConfigured && (
                <div className="p-3 rounded-[8px] bg-[#F8F9FA] border border-[#E5E7EB] text-[12px] text-[#6B7280] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#9CA3AF] shrink-0 mt-0.5" />
                  <div>
                    Email sender is not configured yet. An Administrator can set it up in{' '}
                    <span className="font-semibold text-[#1F2937]">Admin Console → Email Configuration</span>.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                    Recipient Email
                  </label>
                  <input
                    type="email"
                    value={emailRecipient}
                    onChange={(e) => setEmailRecipient(e.target.value)}
                    className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                    Email Template
                  </label>
                  <select
                    value={selectedEmailTemplateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedEmailTemplateId(id);
                      const tpl = emailTemplates.find((x) => x.id === id);
                      if (tpl) {
                        setEmailSubject(tpl.subjectTemplate);
                        setEmailBody(tpl.bodyTemplate);
                      }
                    }}
                    className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                  >
                    {emailTemplates.map((et) => (
                      <option key={et.id} value={et.id}>
                        {et.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                  Message Body
                </label>
                <textarea
                  rows={4}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full p-3 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                />
              </div>

              {emailPreviewData && (
                <div className="p-3 rounded-[8px] bg-[#FFF8F3] border border-[#E5E7EB] text-[12px] space-y-1">
                  <div className="font-semibold text-[#1F2937]">
                    Resolved Preview & Attachment
                  </div>
                  <div className="text-[#6B7280]">
                    <span className="font-medium text-[#1F2937]">Subject:</span>{' '}
                    {emailPreviewData.resolvedSubject}
                  </div>
                  <div className="text-[#6B7280]">
                    <span className="font-medium text-[#1F2937]">PDF Attachment:</span>{' '}
                    <span className="text-[#F47721] font-semibold">{emailPreviewData.attachmentName}</span>
                  </div>

                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-[#F8F9FA] border-t border-[#E5E7EB] flex items-center justify-between">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSendEmail(true)}
                className="px-3.5 py-2 rounded-[7px] text-[13px] font-medium bg-[#FFFFFF] border border-[#E5E7EB] text-[#1F2937] hover:border-[#F47721] hover:text-[#F47721]"
              >
                Send Test Email
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSendModal(false)}
                  className="px-3.5 py-2 rounded-[7px] text-[13px] font-medium bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280] hover:text-[#1F2937]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSendEmail(false)}
                  className="px-4 py-2 rounded-[7px] text-[13px] font-semibold bg-[#F47721] text-[#FFFFFF] hover:bg-[#E06612]"
                >
                  {saving ? 'Sending...' : 'Send Payslip'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* SAVE TEMPLATE PRESET MODAL */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[12px] shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#FFF4E8] flex items-center justify-center text-[#F47721]">
                  <Save className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[#1F2937]">Save Template Preset</h3>
                  <p className="text-[12px] text-[#6B7280]">Enter a name to save this design configuration</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveTemplateModal(false)}
                className="text-[#9CA3AF] hover:text-[#1F2937] p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-[12px] font-semibold text-[#374151]">
                Template Name <span className="text-[#EF4444]">*</span>
              </label>
              <input
                type="text"
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                placeholder="e.g. Standard Institutional Template 2026"
                className="w-full px-3 py-2 text-[13px] border border-[#D1D5DB] rounded-[7px] focus:outline-none focus:border-[#F47721] focus:ring-1 focus:ring-[#F47721]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmSaveTemplate();
                  }
                }}
              />
              <p className="text-[11px] text-[#6B7280]">
                If a template with this name already exists, it will be updated. Otherwise a new preset will be created.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F3F4F6]">
              <button
                type="button"
                onClick={() => setShowSaveTemplateModal(false)}
                className="px-3.5 py-2 text-[12.5px] font-medium text-[#4B5563] hover:text-[#1F2937] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] hover:bg-[#F9FAFB] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!saveTemplateName.trim() || saving}
                onClick={handleConfirmSaveTemplate}
                className="px-4 py-2 text-[12.5px] font-semibold text-white bg-[#F47721] hover:bg-[#e06714] rounded-[7px] shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Template</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
