import React, { useState, useEffect } from 'react';
import {
  Users,
  FileSpreadsheet,
  FileCheck2,
  Send,
  AlertCircle,
  Download,
  Edit3,
  Copy,
  RotateCcw,
  Archive,
  CheckCircle2,
  Plus,
  Search,
  RefreshCw,
  Shield,
  Building2,
  Mail,
  FileDown,
  Upload,
  MoreVertical,
  UserPlus,
  Edit,
  Trash2,
  UserCheck,
  UserX,
  KeyRound,
  Check,
  X,
} from 'lucide-react';
import { apiRequest, getAuthorizedDownloadUrl } from '../services/api';
import { formatIndianCurrency } from './PayslipA4Paper';
import type { EmailHistoryItem, EmailTemplateItem, PayslipTemplateItem, UserProfile } from '../types/payroll';

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

// ============================================================================
// 1. DASHBOARD VIEW
// ============================================================================
export const DashboardView: React.FC<{
  activeMonth: number;
  activeYear: number;
  onNavigate: (view: string, recordId?: string) => void;
  onMonthYearChange: (m: number, y: number) => void;
  onOpenRecordInEditor?: (recordId: string, month?: number, year?: number) => void;
}> = ({ activeMonth, activeYear, onNavigate, onMonthYearChange, onOpenRecordInEditor }) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = () => {
    setLoading(true);
    apiRequest(`/api/dashboard?month=${activeMonth}&year=${activeYear}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, [activeMonth, activeYear]);

  if (loading && !data) {
    return (
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-8 text-center text-[13px] text-[#6B7280]">
        Loading payroll metrics and activity...
      </div>
    );
  }

  const m = data?.metrics || {};
  const sym = data?.currencySymbol || '₹';

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold text-[#1F2937]">Payroll Dashboard</h1>
          <p className="text-[13px] text-[#6B7280]">
            Overview of imported employees, generated payslips, and dispatch status for{' '}
            <span className="font-semibold text-[#F47721]">{data?.activePeriodLabel}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {data?.availablePeriods?.length > 0 && (
            <select
              value={`${activeMonth}-${activeYear}`}
              onChange={(e) => {
                const [mm, yy] = e.target.value.split('-').map(Number);
                onMonthYearChange(mm, yy);
              }}
              className="px-3 py-2 text-[13px] font-medium border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
            >
              {data.availablePeriods.map((p: any) => (
                <option key={p.id} value={`${p.month}-${p.year}`}>
                  {p.periodLabel} ({p.employeeCount} employees)
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => onNavigate('import')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[13px] font-medium text-[#1F2937] hover:border-[#F47721] hover:text-[#F47721]"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#F47721]" />
            <span>Import Excel</span>
          </button>

          <button
            type="button"
            onClick={() =>
              window.open(
                getAuthorizedDownloadUrl('/api/payroll/export/master-workbook'),
                '_blank'
              )
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[13px] font-medium text-[#1F2937] hover:border-[#F47721] hover:text-[#F47721]"
          >
            <Download className="w-4 h-4 text-[#6B7280]" />
            <span>Export Workbook</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('editor')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[13px] font-semibold hover:bg-[#E06612]"
          >
            <Edit3 className="w-4 h-4" />
            <span>Open Payslip Editor</span>
          </button>
        </div>
      </div>

      {/* 5 Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4">
          <div className="flex items-center justify-between text-[12px] font-medium text-[#6B7280]">
            <span>Employees Imported</span>
            <Users className="w-4 h-4 text-[#F47721]" />
          </div>
          <div className="text-[24px] font-semibold text-[#1F2937] mt-1.5">
            {m.totalEmployeesInMonth ?? 0}
          </div>
          <div className="text-[11.5px] text-[#9CA3AF] mt-1">In {data?.activePeriodLabel}</div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4">
          <div className="flex items-center justify-between text-[12px] font-medium text-[#6B7280]">
            <span>Payslips Generated</span>
            <FileCheck2 className="w-4 h-4 text-[#F47721]" />
          </div>
          <div className="text-[24px] font-semibold text-[#1F2937] mt-1.5">
            {m.payslipsGeneratedInMonth ?? 0}
          </div>
          <div className="text-[11.5px] text-[#9CA3AF] mt-1">Official A4 PDFs</div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4">
          <div className="flex items-center justify-between text-[12px] font-medium text-[#6B7280]">
            <span>Payslips Sent</span>
            <Send className="w-4 h-4 text-[#F47721]" />
          </div>
          <div className="text-[24px] font-semibold text-[#1F2937] mt-1.5">
            {m.payslipsSentSuccessfully ?? 0}
          </div>
          <div className="text-[11.5px] text-[#9CA3AF] mt-1">Delivered via email</div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4">
          <div className="flex items-center justify-between text-[12px] font-medium text-[#6B7280]">
            <span>Pending / Review</span>
            <AlertCircle className="w-4 h-4 text-[#6B7280]" />
          </div>
          <div className="text-[24px] font-semibold text-[#1F2937] mt-1.5">
            {m.emailsAttentionTotal ?? 0}
          </div>
          <div className="text-[11.5px] text-[#9CA3AF] mt-1">
            {m.emailsPendingOrQueued ?? 0} queued · {m.emailsFailed ?? 0} failed
          </div>
        </div>

        <div className="bg-[#FFF3E8] border border-[#F47721]/30 rounded-[10px] p-4">
          <div className="flex items-center justify-between text-[12px] font-semibold text-[#1F2937]">
            <span>Period Net Payroll</span>
          </div>
          <div className="text-[20px] font-bold text-[#F47721] mt-1.5 tabular-nums">
            {formatIndianCurrency(m.totalNetPayrollInMonth ?? 0, sym)}
          </div>
          <div className="text-[11.5px] text-[#6B7280] mt-1">Total net payable</div>
        </div>
      </div>

      {/* Main Activity Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#E5E7EB] flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[#1F2937]">
              Employee Payroll Records ({data?.activePeriodLabel})
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('monthly')}
              className="text-[12.5px] font-semibold text-[#F47721] hover:underline"
            >
              View All
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-[#F8F9FA] text-[#6B7280] border-b border-[#E5E7EB]">
                  <th className="py-2.5 px-3.5 font-semibold">Emp ID</th>
                  <th className="py-2.5 px-3.5 font-semibold">Employee</th>
                  <th className="py-2.5 px-3.5 text-right font-semibold">Net Salary</th>
                  <th className="py-2.5 px-3.5 font-semibold">Status</th>
                  <th className="py-2.5 px-3.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {(data?.recentEmployeeActivity || []).map((emp: any) => (
                  <tr key={emp.recordId} className="hover:bg-[#F8F9FA]">
                    <td className="py-2.5 px-3.5 font-mono font-semibold text-[#F47721]">
                      {emp.employeeCode}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <div className="font-semibold text-[#1F2937]">{emp.employeeName}</div>
                      <div className="text-[11.5px] text-[#6B7280]">{emp.department}</div>
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-semibold tabular-nums text-[#1F2937]">
                      {formatIndianCurrency(emp.netSalary, sym)}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="px-2 py-0.5 rounded-[5px] bg-[#FFF3E8] text-[#F47721] text-[11px] font-semibold">
                        {emp.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenRecordInEditor) onOpenRecordInEditor(emp.recordId);
                          else onNavigate('editor', emp.recordId);
                        }}
                        className="text-[12px] font-semibold text-[#F47721] hover:underline"
                      >
                        Edit Payslip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Latest Excel Imports & Deliveries */}
        <div className="space-y-5">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#E5E7EB] flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[#1F2937]">Latest Excel Imports</h3>
              <button
                type="button"
                onClick={() => onNavigate('import')}
                className="text-[12.5px] font-semibold text-[#F47721] hover:underline"
              >
                Import New
              </button>
            </div>
            <div className="divide-y divide-[#E5E7EB] text-[12.5px]">
              {(data?.latestImports || []).length === 0 ? (
                <div className="p-4 text-[#6B7280] text-center">No imports recorded yet.</div>
              ) : (
                data.latestImports.map((imp: any) => (
                  <div
                    key={imp.id}
                    className="px-4 py-2.5 flex items-center justify-between hover:bg-[#F8F9FA]"
                  >
                    <div>
                      <div className="font-semibold text-[#1F2937]">
                        {imp.fileName} — <span className="text-[#F47721]">{imp.worksheet}</span>
                      </div>
                      <div className="text-[11.5px] text-[#6B7280]">
                        Period: {imp.periodLabel} · Operator: {imp.operatorName}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-[5px] bg-[#FFF3E8] text-[#F47721] text-[11px] font-semibold">
                      {imp.importedRows} rows
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#E5E7EB] flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-[#1F2937]">
                Recent PDF & Email Deliveries
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('sent-history')}
                className="text-[12.5px] font-semibold text-[#F47721] hover:underline"
              >
                Sent History
              </button>
            </div>
            <div className="divide-y divide-[#E5E7EB] text-[12.5px]">
              {(data?.recentDeliveries || []).length === 0 ? (
                <div className="p-4 text-[#6B7280] text-center">
                  No email deliveries triggered yet.
                </div>
              ) : (
                data.recentDeliveries.map((del: any) => (
                  <div
                    key={del.id}
                    className="px-4 py-2.5 flex items-center justify-between hover:bg-[#F8F9FA]"
                  >
                    <div>
                      <div className="font-semibold text-[#1F2937]">
                        {del.employeeCode} — {del.employeeName} ({del.periodLabel})
                      </div>
                      <div className="text-[11.5px] text-[#6B7280]">
                        To: {del.recipientEmail} · {del.attachmentFileName}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-[5px] bg-[#FFF3E8] text-[#F47721] text-[11px] font-semibold">
                      {del.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. EMPLOYEE DIRECTORY VIEW
// ============================================================================
export const EmployeeDirectoryView: React.FC<{
  onOpenRecordInEditor?: (recordId: string, month?: number, year?: number) => void;
  onOpenEmployeeRecord?: (recordId: string, month: number, year: number) => void;
}> = ({ onOpenRecordInEditor, onOpenEmployeeRecord }) => {
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest<any[]>(`/api/employees?search=${encodeURIComponent(search)}`)
      .then(setEmployees)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search]);

  const handleSelectPeriod = (recordId: string, m: number, y: number) => {
    if (onOpenRecordInEditor) onOpenRecordInEditor(recordId, m, y);
    else if (onOpenEmployeeRecord) onOpenEmployeeRecord(recordId, m, y);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold text-[#1F2937]">Employee Directory</h1>
          <p className="text-[13px] text-[#6B7280]">
            Master directory of all employees across imported payroll periods.
          </p>
        </div>
        <div className="relative w-72">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by ID, Name, Department..."
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px]"
          />
        </div>
      </div>

      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[#6B7280]">
                <th className="py-3 px-4 font-semibold">Employee ID</th>
                <th className="py-3 px-4 font-semibold">Full Name</th>
                <th className="py-3 px-4 font-semibold">Department & Designation</th>
                <th className="py-3 px-4 font-semibold">Email</th>
                <th className="py-3 px-4 font-semibold">Available Payroll Months</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[#6B7280]">
                    Loading employees...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[#6B7280]">
                    No employees match your filter.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-[#F8F9FA]">
                    <td className="py-3 px-4 font-mono font-semibold text-[#F47721]">
                      {emp.employeeCode}
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#1F2937]">{emp.fullName}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#1F2937]">{emp.department}</div>
                      <div className="text-[11.5px] text-[#6B7280]">{emp.designation}</div>
                    </td>
                    <td className="py-3 px-4 text-[#6B7280]">{emp.email}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {(emp.periods || []).map((p: any) => (
                          <button
                            key={p.recordId}
                            type="button"
                            onClick={() => handleSelectPeriod(p.recordId, p.month, p.year)}
                            className="px-2.5 py-1 rounded-[6px] bg-[#FFF3E8] hover:bg-[#F47721] text-[#F47721] hover:text-[#FFFFFF] text-[11.5px] font-semibold transition-colors"
                          >
                            {p.periodLabel} ({formatIndianCurrency(p.netSalary, '₹')})
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. MONTHLY PAYROLL ARCHIVE VIEW
// ============================================================================
export const MonthlyPayrollView: React.FC<{
  activeMonth: number;
  activeYear: number;
  canEdit?: boolean;
  onMonthYearChange?: (m: number, y: number) => void;
  onOpenRecordInEditor?: (recordId: string) => void;
  onOpenEditor?: (recordId: string) => void;
}> = ({ activeMonth, activeYear, onOpenRecordInEditor, onOpenEditor }) => {
  const [search, setSearch] = useState('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest(
      `/api/payroll/records?month=${activeMonth}&year=${activeYear}&search=${encodeURIComponent(
        search
      )}`
    )
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeMonth, activeYear, search]);

  const handleOpen = (id: string) => {
    if (onOpenRecordInEditor) onOpenRecordInEditor(id);
    else if (onOpenEditor) onOpenEditor(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold text-[#1F2937]">
            Monthly Payroll — {MONTHS.find((m) => m.value === activeMonth)?.label} {activeYear}
          </h1>
          <p className="text-[13px] text-[#6B7280]">
            Employee payroll records and dynamic component counts for the selected period.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee in month..."
              className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px]"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              window.open(
                getAuthorizedDownloadUrl('/api/payroll/export/master-workbook'),
                '_blank'
              )
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[13px] font-semibold hover:bg-[#E06612]"
          >
            <Download className="w-4 h-4" />
            <span>Export Master Workbook (.xlsx)</span>
          </button>
        </div>
      </div>

      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[#6B7280]">
                <th className="py-3 px-4 font-semibold">Emp ID</th>
                <th className="py-3 px-4 font-semibold">Employee Name</th>
                <th className="py-3 px-4 font-semibold">Department & Role</th>
                <th className="py-3 px-4 font-semibold">Dynamic Components</th>
                <th className="py-3 px-4 text-right font-semibold">Gross Salary</th>
                <th className="py-3 px-4 text-right font-semibold">Deductions</th>
                <th className="py-3 px-4 text-right font-semibold">Net Salary</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[#6B7280]">
                    Loading monthly payroll records...
                  </td>
                </tr>
              ) : (data?.records || []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[#6B7280]">
                    No payroll records found for {data?.periodLabel}.
                  </td>
                </tr>
              ) : (
                data.records.map((r: any) => (
                  <tr key={r.recordId} className="hover:bg-[#F8F9FA]">
                    <td className="py-3 px-4 font-mono font-semibold text-[#F47721]">
                      {r.employeeCode}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#1F2937]">{r.employeeName}</div>
                      <div className="text-[11.5px] text-[#6B7280]">{r.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-[#1F2937]">{r.department}</div>
                      <div className="text-[11.5px] text-[#6B7280]">{r.designation}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-[5px] bg-[#FFF3E8] text-[#F47721] font-semibold text-[11.5px]">
                        {r.visibleEarningsCount} Earnings · {r.visibleDeductionsCount} Deductions
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-[#1F2937]">
                      {formatIndianCurrency(r.grossSalary, '₹')}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-[#6B7280]">
                      {formatIndianCurrency(r.totalDeductions, '₹')}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-[#F47721]">
                      {formatIndianCurrency(r.netSalary, '₹')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-[5px] bg-[#F8F9FA] border border-[#E5E7EB] text-[#1F2937] text-[11.5px] font-medium">
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpen(r.recordId)}
                        className="px-3 py-1 rounded-[6px] bg-[#F47721] text-[#FFFFFF] font-semibold text-[12px] hover:bg-[#E06612]"
                      >
                        Edit Payslip
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            getAuthorizedDownloadUrl(
                              `/api/payroll/records/${r.recordId}/pdf/preview`
                            ),
                            '_blank'
                          )
                        }
                        className="px-2.5 py-1 rounded-[6px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#1F2937] hover:border-[#F47721] text-[12px] font-medium"
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. PAYSLIP TEMPLATES MANAGEMENT VIEW
// ============================================================================
export const PayslipTemplatesView: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const [templates, setTemplates] = useState<PayslipTemplateItem[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editingTpl, setEditingTpl] = useState<PayslipTemplateItem | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const loadTemplates = () => {
    apiRequest<PayslipTemplateItem[]>(`/api/templates/payslip?includeArchived=${includeArchived}`)
      .then(setTemplates)
      .catch(() => {});
  };

  useEffect(() => {
    loadTemplates();
  }, [includeArchived]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await apiRequest('/api/templates/payslip', {
      method: 'POST',
      body: JSON.stringify({
        name: newName,
        description: newDesc || 'Corporate payslip template',
        config: templates[0]?.config || {},
      }),
    });
    setNewName('');
    setNewDesc('');
    loadTemplates();
  };

  const handleAction = async (id: string, action: string, body?: any) => {
    await apiRequest(`/api/templates/payslip/${id}/${action}`, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    loadTemplates();
  };

  const handleSaveTemplateEdit = async () => {
    if (!editingTpl) return;
    await apiRequest(`/api/templates/payslip/${editingTpl.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: editingTpl.name,
        description: editingTpl.description,
        config: editingTpl.config,
      }),
    });
    setEditingTpl(null);
    loadTemplates();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold text-[#1F2937]">Payslip Templates</h1>
          <p className="text-[13px] text-[#6B7280]">
            Manage corporate A4 layout presets, table structures, and zero-value row display policies.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13px] font-medium text-[#1F2937] cursor-pointer">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          <span>Show Archived Templates</span>
        </label>
      </div>

      {canEdit && (
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
              New Template Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Executive Corporate A4"
              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
              Description
            </label>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Brief description of layout..."
              className="w-full px-3 py-1.5 text-[13px] border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[13px] font-semibold hover:bg-[#E06612]"
          >
            <Plus className="w-4 h-4" />
            <span>Create Template</span>
          </button>
        </div>
      )}

      {editingTpl && (
        <div className="bg-[#FFF8F3] border border-[#F47721]/40 rounded-[10px] p-4 space-y-3 text-[13px]">
          <div className="font-semibold text-[#1F2937]">
            Editing Template: {editingTpl.name} (v{editingTpl.version})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                Template Name
              </label>
              <input
                type="text"
                value={editingTpl.name}
                onChange={(e) => setEditingTpl({ ...editingTpl, name: e.target.value })}
                className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                Table Layout
              </label>
              <select
                value={editingTpl.config.tableLayoutMode}
                onChange={(e) =>
                  setEditingTpl({
                    ...editingTpl,
                    config: {
                      ...editingTpl.config,
                      tableLayoutMode: e.target.value as 'SideBySide' | 'Stacked',
                    },
                  })
                }
                className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
              >
                <option value="SideBySide">SideBySide (2 Columns)</option>
                <option value="Stacked">Stacked (Single Column)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                Zero-Value Policy
              </label>
              <select
                value={editingTpl.config.showZeroValueRows ? 'show' : 'hide'}
                onChange={(e) =>
                  setEditingTpl({
                    ...editingTpl,
                    config: {
                      ...editingTpl.config,
                      showZeroValueRows: e.target.value === 'show',
                    },
                  })
                }
                className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
              >
                <option value="hide">Hide 0.00 Rows by Default</option>
                <option value="show">Show 0.00 Rows</option>
              </select>
            </div>
          </div>

          <div className="border-t border-[#E5E7EB] pt-3 space-y-2.5">
            <div className="text-[12px] font-semibold text-[#1F2937]">
              Company Header Customization
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 p-2.5 rounded-[7px] bg-[#F8F9FA] border border-[#E5E7EB] flex flex-wrap items-center gap-3">
                {editingTpl.config.overrideLogoDataUrl ? (
                  <img
                    src={editingTpl.config.overrideLogoDataUrl}
                    alt="Template Logo"
                    className="h-10 w-auto max-w-[120px] object-contain rounded border border-[#E5E7EB] p-1 bg-white"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-[#F47721] flex items-center justify-center text-white font-bold text-[11px]">
                    LOGO
                  </div>
                )}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#FFF3E8] text-[#F47721] font-semibold text-[11.5px] cursor-pointer hover:bg-[#F47721] hover:text-[#FFFFFF] transition-colors">
                      <Upload className="w-3 h-3" />
                      <span>Upload Logo Override</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === 'string') {
                              setEditingTpl({
                                ...editingTpl,
                                config: { ...editingTpl.config, overrideLogoDataUrl: reader.result as string, showLogo: true },
                              });
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {editingTpl.config.overrideLogoDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingTpl({
                            ...editingTpl,
                            config: { ...editingTpl.config, overrideLogoDataUrl: null },
                          })
                        }
                        className="text-[11px] text-[#6B7280] hover:text-[#1F2937]"
                      >
                        Reset to Default
                      </button>
                    )}
                  </div>
                  <span className="text-[10.5px] text-[#6B7280] block">
                    Optional per-template logo override.
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                  Company Name Override
                </label>
                <input
                  type="text"
                  placeholder="Leave blank to use default organization name"
                  value={editingTpl.config.overrideCompanyName || ''}
                  onChange={(e) =>
                    setEditingTpl({
                      ...editingTpl,
                      config: { ...editingTpl.config, overrideCompanyName: e.target.value || null },
                    })
                  }
                  className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                  Company Subtitle Override
                </label>
                <input
                  type="text"
                  placeholder="Leave blank to use default subtitle"
                  value={editingTpl.config.overrideCompanySubtitle || ''}
                  onChange={(e) =>
                    setEditingTpl({
                      ...editingTpl,
                      config: { ...editingTpl.config, overrideCompanySubtitle: e.target.value || null },
                    })
                  }
                  className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                  Company Address Override
                </label>
                <input
                  type="text"
                  placeholder="Leave blank to use default registered address"
                  value={editingTpl.config.overrideCompanyAddress || ''}
                  onChange={(e) =>
                    setEditingTpl({
                      ...editingTpl,
                      config: { ...editingTpl.config, overrideCompanyAddress: e.target.value || null },
                    })
                  }
                  className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                  Contact Info Override (Email / Phone)
                </label>
                <input
                  type="text"
                  placeholder="e.g. accounts@organization.org · +91 0000 000000"
                  value={editingTpl.config.overrideCompanyContact || ''}
                  onChange={(e) =>
                    setEditingTpl({
                      ...editingTpl,
                      config: { ...editingTpl.config, overrideCompanyContact: e.target.value || null },
                    })
                  }
                  className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                  Website URL Override
                </label>
                <input
                  type="text"
                  placeholder="e.g. https://organization.org/"
                  value={editingTpl.config.overrideCompanyWebsite || ''}
                  onChange={(e) =>
                    setEditingTpl({
                      ...editingTpl,
                      config: { ...editingTpl.config, overrideCompanyWebsite: e.target.value || null },
                    })
                  }
                  className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#6B7280] mb-1">
                  Header Alignment
                </label>
                <select
                  value={editingTpl.config.headerAlignment || 'Left'}
                  onChange={(e) =>
                    setEditingTpl({
                      ...editingTpl,
                      config: { ...editingTpl.config, headerAlignment: e.target.value as any },
                    })
                  }
                  className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
                >
                  <option value="Left">Left Aligned</option>
                  <option value="Split">Split (Logo Left, Address Right)</option>
                  <option value="Center">Centered</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-[12px] pt-1">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingTpl.config.showLogo}
                  onChange={(e) =>
                    setEditingTpl({
                      ...editingTpl,
                      config: { ...editingTpl.config, showLogo: e.target.checked },
                    })
                  }
                />
                <span>Show Logo</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingTpl.config.showCompanySubtitle !== false}
                  onChange={(e) =>
                    setEditingTpl({
                      ...editingTpl,
                      config: { ...editingTpl.config, showCompanySubtitle: e.target.checked },
                    })
                  }
                />
                <span>Show Subtitle</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingTpl.config.showCompanyAddress !== false}
                  onChange={(e) =>
                    setEditingTpl({
                      ...editingTpl,
                      config: { ...editingTpl.config, showCompanyAddress: e.target.checked },
                    })
                  }
                />
                <span>Show Address</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingTpl.config.showCompanyContact !== false}
                  onChange={(e) =>
                    setEditingTpl({
                      ...editingTpl,
                      config: { ...editingTpl.config, showCompanyContact: e.target.checked },
                    })
                  }
                />
                <span>Show Contact</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingTpl.config.showCompanyWebsite !== false}
                  onChange={(e) =>
                    setEditingTpl({
                      ...editingTpl,
                      config: { ...editingTpl.config, showCompanyWebsite: e.target.checked },
                    })
                  }
                />
                <span>Show Website</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingTpl(null)}
              className="px-3.5 py-1.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveTemplateEdit}
              className="px-4 py-1.5 rounded-[7px] bg-[#F47721] text-[#FFFFFF] font-semibold"
            >
              Save Template
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((t) => (
          <div
            key={t.id}
            className={`bg-[#FFFFFF] border rounded-[10px] p-4 flex flex-col justify-between space-y-4 ${
              t.isDefault ? 'border-[#F47721]' : 'border-[#E5E7EB]'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-[15px] font-semibold text-[#1F2937]">{t.name}</h4>
                <div className="flex items-center gap-1">
                  {t.isDefault && (
                    <span className="px-2 py-0.5 rounded-[5px] bg-[#FFF3E8] text-[#F47721] text-[11px] font-semibold">
                      Default
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-[5px] bg-[#F8F9FA] text-[#6B7280] text-[11px]">
                    v{t.version}
                  </span>
                </div>
              </div>
              <p className="text-[12.5px] text-[#6B7280]">{t.description}</p>
              <div className="text-[12px] text-[#1F2937] bg-[#F8F9FA] p-2.5 rounded-[7px] border border-[#E5E7EB] space-y-1">
                <div>
                  Layout: <strong>{t.config.tableLayoutMode}</strong> · Font:{' '}
                  <strong>
                    {t.config.fontFamily} ({t.config.baseFontSizePt}pt)
                  </strong>
                </div>
                <div>
                  Zero-Value Policy:{' '}
                  <strong>{t.config.showZeroValueRows ? 'Show 0.00 Rows' : 'Hide 0.00 Rows'}</strong>
                </div>
              </div>
            </div>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setEditingTpl(t)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] border border-[#E5E7EB] text-[12px] hover:border-[#F47721]"
                >
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(t.id, 'duplicate')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] border border-[#E5E7EB] text-[12px] hover:border-[#F47721]"
                >
                  <Copy className="w-3 h-3" /> Duplicate
                </button>
                {!t.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleAction(t.id, 'set-default')}
                    className="px-2.5 py-1 rounded-[6px] bg-[#FFF3E8] text-[#F47721] font-semibold text-[12px]"
                  >
                    Set Default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleAction(t.id, 'reset')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] border border-[#E5E7EB] text-[12px] hover:border-[#F47721]"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
                {!t.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleAction(t.id, 'archive', { isArchived: !t.isArchived })}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] border border-[#E5E7EB] text-[12px] text-[#6B7280]"
                  >
                    <Archive className="w-3 h-3" /> {t.isArchived ? 'Restore' : 'Archive'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 5. EMAIL TEMPLATES VIEW
// ============================================================================
export const EmailTemplatesView: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [selected, setSelected] = useState<EmailTemplateItem | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const loadList = () => {
    apiRequest<EmailTemplateItem[]>('/api/templates/email').then((res) => {
      setTemplates(res);
      if (!selected && res.length > 0) {
        selectItem(res[0]);
      }
    });
  };

  useEffect(() => {
    loadList();
  }, []);

  const selectItem = (t: EmailTemplateItem) => {
    setSelected(t);
    setName(t.name);
    setSubject(t.subjectTemplate);
    setBody(t.bodyTemplate);
    setIsDefault(t.isDefault);
    setSavedMsg(null);
  };

  const handleSave = async () => {
    if (selected) {
      await apiRequest(`/api/templates/email/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          subjectTemplate: subject,
          bodyTemplate: body,
          isDefault,
        }),
      });
      setSavedMsg('Updated email template successfully.');
    } else {
      await apiRequest('/api/templates/email', {
        method: 'POST',
        body: JSON.stringify({
          name,
          subjectTemplate: subject,
          bodyTemplate: body,
          isDefault,
        }),
      });
      setSavedMsg('Created new email template.');
    }
    loadList();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[24px] font-semibold text-[#1F2937]">Email Templates</h1>
        <p className="text-[13px] text-[#6B7280]">
          Customize email subjects and message bodies for payslip delivery.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[#1F2937]">Saved Templates</h3>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setName('New Payslip Notification');
                  setSubject('Your Payslip for {{PayrollMonth}} {{PayrollYear}}');
                  setBody(
                    'Dear {{EmployeeName}},\n\nPlease find attached your payslip for {{PayrollMonth}} {{PayrollYear}}.\n\nRegards,\nAccounts Department\n{{CompanyName}}'
                  );
                  setIsDefault(false);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] bg-[#FFF3E8] text-[#F47721] font-semibold text-[12px]"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            )}
          </div>
          <div className="space-y-2">
            {templates.map((t) => (
              <div
                key={t.id}
                onClick={() => selectItem(t)}
                className={`p-3 rounded-[8px] border cursor-pointer text-[13px] ${
                  selected?.id === t.id
                    ? 'border-[#F47721] bg-[#FFF3E8]/50'
                    : 'border-[#E5E7EB] hover:bg-[#F8F9FA]'
                }`}
              >
                <div className="flex items-center justify-between font-semibold text-[#1F2937]">
                  <span>{t.name}</span>
                  {t.isDefault && (
                    <span className="px-2 py-0.5 rounded-[5px] bg-[#FFF3E8] text-[#F47721] text-[11px]">
                      Default
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-[#6B7280] mt-1 truncate">
                  {t.subjectTemplate}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-5 space-y-4 text-[13px]">
          <h3 className="text-[16px] font-semibold text-[#1F2937]">
            {selected ? `Edit Template: ${selected.name}` : 'Create Email Template'}
          </h3>

          {savedMsg && (
            <div className="p-3 rounded-[7px] bg-[#FFF3E8] border border-[#F47721]/30 text-[#1F2937] font-medium">
              {savedMsg}
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Template Name
            </label>
            <input
              type="text"
              disabled={!canEdit}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Subject Line
            </label>
            <input
              type="text"
              disabled={!canEdit}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Email Body (Supports {'{{EmployeeName}}'}, {'{{EmployeeId}}'}, {'{{PayrollMonth}}'},{' '}
              {'{{PayrollYear}}'}, {'{{CompanyName}}'}, {'{{NetSalary}}'})
            </label>
            <textarea
              rows={8}
              disabled={!canEdit}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-3 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 font-medium cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              <span>Use as Default Email Template</span>
            </label>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-[7px] bg-[#F47721] text-[#FFFFFF] font-semibold hover:bg-[#E06612]"
              >
                Save Email Template
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 6. SENT HISTORY VIEW
// ============================================================================
export const SentHistoryView: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const [items, setItems] = useState<EmailHistoryItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<string | null>(null);

  const loadHistory = () => {
    setLoading(true);
    apiRequest<EmailHistoryItem[]>(
      `/api/email/history?status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(
        search
      )}`
    )
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadHistory();
  }, [statusFilter, search]);

  const handleManualRetry = async (attemptId: string) => {
    setRetryingId(attemptId);
    setRetryFeedback(null);
    try {
      const res = await apiRequest<any>(`/api/email/history/${attemptId}/retry`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.status !== 'Accepted') {
        setRetryFeedback(res.errorDetails || `Retry finished with status: ${res.status}`);
      } else {
        setRetryFeedback(`Successfully re-sent email to ${res.recipientEmail} via SMTP.`);
      }
      loadHistory();
    } catch (err: any) {
      setRetryFeedback(err.message || 'Retry failed. Please verify SMTP settings.');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold text-[#1F2937]">Sent History</h1>
          <p className="text-[13px] text-[#6B7280]">
            Complete log of dispatched payslip emails and PDF attachments.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF]"
          >
            <option value="All">All Statuses</option>
            <option value="Accepted">Accepted / Sent</option>
            <option value="Failed">Failed</option>
            <option value="Uncertain">Uncertain</option>
            <option value="Queued">Queued</option>
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by Employee or Recipient..."
            className="px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] w-64"
          />
        </div>
      </div>

      {retryFeedback && (
        <div className="p-3 rounded-[8px] bg-[#FFF3E8] border border-[#F47721]/40 text-[12.5px] text-[#1F2937] font-medium">
          {retryFeedback}
        </div>
      )}

      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[#6B7280]">
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold">Employee</th>
                <th className="py-3 px-4 font-semibold">Period</th>
                <th className="py-3 px-4 font-semibold">Recipient</th>
                <th className="py-3 px-4 font-semibold">Attachment</th>
                <th className="py-3 px-4 font-semibold">Operator</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-[#6B7280]">
                    Loading delivery history...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-[#6B7280]">
                    No email delivery attempts found.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F8F9FA]">
                    <td className="py-3 px-4 text-[12px] text-[#6B7280]">
                      {new Date(item.createdAtUtc).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#F47721] font-mono">
                        {item.employeeCode}
                      </div>
                      <div className="text-[#1F2937] font-medium">{item.employeeName}</div>
                    </td>
                    <td className="py-3 px-4 font-medium">{item.periodLabel}</td>
                    <td className="py-3 px-4 text-[#6B7280]">{item.recipientEmail}</td>
                    <td className="py-3 px-4 text-[12px] text-[#6B7280]">
                      {item.attachmentFileName}
                    </td>
                    <td className="py-3 px-4 text-[#6B7280]">{item.operatorName}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-[5px] bg-[#FFF3E8] text-[#F47721] text-[11.5px] font-semibold">
                          {item.status}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-[4px] bg-[#F8F9FA] border border-[#E5E7EB] text-[#6B7280] text-[10.5px]">
                          {item.providerMode || 'SMTP'}
                        </span>
                      </div>
                      {item.errorDetails && (
                        <div className="text-[11px] text-[#6B7280] mt-1 max-w-xs">
                          {item.errorDetails}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            getAuthorizedDownloadUrl(
                              `/api/payroll/documents/${item.generatedDocumentId}/download`
                            ),
                            '_blank'
                          )
                        }
                        className="px-2.5 py-1 rounded-[6px] border border-[#E5E7EB] text-[12px] font-medium hover:border-[#F47721]"
                      >
                        PDF
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          disabled={retryingId === item.id}
                          onClick={() => handleManualRetry(item.id)}
                          className="px-2.5 py-1 rounded-[6px] bg-[#F47721] text-[#FFFFFF] text-[12px] font-semibold"
                        >
                          <RefreshCw className="w-3 h-3 inline mr-1" />
                          {item.status === 'Accepted' ? 'Resend' : 'Retry'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 7. REPORTS & EXPORTS VIEW
// ============================================================================
export const ReportsAndExportsView: React.FC<{
  activeMonth?: number;
  activeYear?: number;
}> = () => {
  const [periodsData, setPeriodsData] = useState<any | null>(null);
  const [includeOverridesComparison, setIncludeOverridesComparison] = useState(true);

  useEffect(() => {
    apiRequest('/api/payroll/periods').then(setPeriodsData).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[24px] font-semibold text-[#1F2937]">Reports & Exports</h1>
        <p className="text-[13px] text-[#6B7280]">
          Generate a single multi-worksheet Excel workbook containing every historical payroll month.
        </p>
      </div>

      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#F47721]" />
            <h3 className="text-[16px] font-semibold text-[#1F2937]">
              Master Multi-Worksheet Payroll Archive Workbook (.xlsx)
            </h3>
          </div>
          <p className="text-[13px] text-[#6B7280]">
            Generates a single consolidated Excel workbook with a separate worksheet tab for each payroll month (e.g., September 2026, October 2026, November 2026), preserving employee-specific dynamic salary columns.
          </p>
          <label className="flex items-center gap-2 text-[13px] font-medium text-[#1F2937] pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={includeOverridesComparison}
              onChange={(e) => setIncludeOverridesComparison(e.target.checked)}
            />
            <span>Include source-imported comparison columns alongside manual overrides</span>
          </label>
        </div>

        <button
          type="button"
          onClick={() =>
            window.open(
              getAuthorizedDownloadUrl(
                `/api/payroll/export/master-workbook?includeOverridesComparison=${includeOverridesComparison}`
              ),
              '_blank'
            )
          }
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[7px] bg-[#F47721] text-[#FFFFFF] text-[13px] font-semibold hover:bg-[#E06612]"
        >
          <FileDown className="w-4 h-4" />
          <span>Download Master Excel Workbook</span>
        </button>
      </div>

      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#E5E7EB] font-semibold text-[15px] text-[#1F2937]">
          Available Monthly Worksheets in Archive
        </div>
        <table className="w-full text-left border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[#6B7280]">
              <th className="py-3 px-4 font-semibold">Worksheet / Payroll Period</th>
              <th className="py-3 px-4 font-semibold">Imported Employees</th>
              <th className="py-3 px-4 font-semibold">PDFs Generated</th>
              <th className="py-3 px-4 font-semibold">Emails Sent</th>
              <th className="py-3 px-4 text-right font-semibold">Total Net Payroll</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {(periodsData?.periods || []).map((p: any) => (
              <tr key={p.id} className="hover:bg-[#F8F9FA]">
                <td className="py-3 px-4 font-semibold text-[#1F2937]">{p.periodLabel}</td>
                <td className="py-3 px-4">{p.employeeCount}</td>
                <td className="py-3 px-4">{p.pdfGeneratedCount}</td>
                <td className="py-3 px-4 font-semibold text-[#F47721]">{p.sentCount}</td>
                <td className="py-3 px-4 text-right font-bold text-[#1F2937] tabular-nums">
                  {formatIndianCurrency(p.totalNetPayroll, '₹')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// 8. USER MANAGEMENT VIEW
// ============================================================================
export const UserManagementView: React.FC<{
  currentUser?: UserProfile | null;
  isAdmin?: boolean;
}> = ({ currentUser, isAdmin = true }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Three-dot action dropdown
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);

  // Add Member Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    userName: '',
    email: '',
    fullName: '',
    department: 'Accounts & Finance',
    role: 'AccountsOperator',
    password: '',
    confirmPassword: '',
    isActive: true,
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Edit Member Modal State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    department: 'Accounts & Finance',
    role: 'AccountsOperator',
    isActive: true,
    resetPassword: false,
    newPassword: '',
    confirmNewPassword: '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Deactivate / Activate Dialog State
  const [statusDialogUser, setStatusDialogUser] = useState<any | null>(null);
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Delete Member Dialog State
  const [deletingUser, setDeletingUser] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Administrative Reset Password State
  const [resettingUser, setResettingUser] = useState<any | null>(null);
  const [useAutoGenerate, setUseAutoGenerate] = useState(true);
  const [customTempPassword, setCustomTempPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [generatedTempPassword, setGeneratedTempPassword] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const loadUsers = () => {
    if (!isAdmin) return;
    setLoading(true);
    apiRequest<any[]>('/api/users')
      .then((res) => {
        setUsers(res || []);
      })
      .catch((err: any) => {
        setFeedback({ type: 'error', message: err.message || 'Failed to load user accounts.' });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, [isAdmin]);

  // Auto-dismiss feedback message after 5 seconds
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // Click outside to close three-dot menu
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuUserId(null);
    if (activeMenuUserId) {
      window.addEventListener('click', handleOutsideClick);
      return () => window.removeEventListener('click', handleOutsideClick);
    }
  }, [activeMenuUserId]);

  const handleOpenAddModal = () => {
    setAddForm({
      userName: '',
      email: '',
      fullName: '',
      department: 'Accounts & Finance',
      role: 'AccountsOperator',
      password: '',
      confirmPassword: '',
      isActive: true,
    });
    setAddError(null);
    setShowAddModal(true);
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!addForm.userName.trim() || !addForm.email.trim() || !addForm.fullName.trim() || !addForm.password) {
      setAddError('All fields marked with an asterisk (*) are required.');
      return;
    }

    if (addForm.password.length < 8) {
      setAddError('Password must be at least 8 characters long.');
      return;
    }

    if (addForm.password !== addForm.confirmPassword) {
      setAddError('Passwords do not match. Please re-type your password.');
      return;
    }

    setAddSubmitting(true);
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          userName: addForm.userName.trim(),
          email: addForm.email.trim(),
          fullName: addForm.fullName.trim(),
          department: addForm.department.trim(),
          role: addForm.role,
          password: addForm.password,
          isActive: addForm.isActive,
          mfaRequired: false,
        }),
      });

      setShowAddModal(false);
      setFeedback({ type: 'success', message: `Member account '${addForm.userName.trim()}' added successfully.` });
      loadUsers();
    } catch (err: any) {
      setAddError(err.message || 'Failed to create member account.');
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleOpenEditModal = (u: any) => {
    setEditingUser(u);
    setEditForm({
      fullName: u.fullName || '',
      email: u.email || '',
      department: u.department || 'Accounts & Finance',
      role: u.role || 'AccountsOperator',
      isActive: u.isActive ?? true,
      resetPassword: false,
      newPassword: '',
      confirmNewPassword: '',
    });
    setEditError(null);
    setActiveMenuUserId(null);
  };

  const handleSaveEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);

    if (!editForm.fullName.trim() || !editForm.email.trim()) {
      setEditError('Full Name and Email Address are required.');
      return;
    }

    if (editForm.resetPassword) {
      if (!editForm.newPassword) {
        setEditError('Please enter a new password or uncheck reset password.');
        return;
      }
      if (editForm.newPassword.length < 8) {
        setEditError('New password must be at least 8 characters long.');
        return;
      }
      if (editForm.newPassword !== editForm.confirmNewPassword) {
        setEditError('New passwords do not match.');
        return;
      }
    }

    setEditSubmitting(true);
    try {
      await apiRequest(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          fullName: editForm.fullName.trim(),
          email: editForm.email.trim(),
          department: editForm.department.trim(),
          role: editForm.role,
          isActive: editForm.isActive,
          mfaRequired: editingUser.mfaRequired ?? false,
          newPassword: editForm.resetPassword ? editForm.newPassword : null,
        }),
      });

      setEditingUser(null);
      setFeedback({ type: 'success', message: `Updated member profile for '${editingUser.userName}'.` });
      loadUsers();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update member account.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleOpenStatusDialog = (u: any) => {
    setStatusDialogUser(u);
    setActiveMenuUserId(null);
  };

  const handleConfirmStatusToggle = async () => {
    if (!statusDialogUser) return;
    setStatusSubmitting(true);
    try {
      const nextStatus = !statusDialogUser.isActive;
      await apiRequest(`/api/users/${statusDialogUser.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ isActive: nextStatus }),
      });

      setFeedback({
        type: 'success',
        message: nextStatus
          ? `Member '${statusDialogUser.userName}' has been activated.`
          : `Member '${statusDialogUser.userName}' has been deactivated.`,
      });
      setStatusDialogUser(null);
      loadUsers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update member status.' });
      setStatusDialogUser(null);
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleOpenDeleteDialog = (u: any) => {
    setDeletingUser(u);
    setDeleteConfirmText('');
    setDeleteError(null);
    setActiveMenuUserId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    if (deleteConfirmText.trim() !== 'DELETE') {
      setDeleteError('Please type DELETE in capital letters to confirm.');
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/api/users/${deletingUser.id}`, {
        method: 'DELETE',
      });

      setFeedback({
        type: 'success',
        message: `Member account '${deletingUser.userName}' was permanently removed. Historical payroll records retained.`,
      });
      setDeletingUser(null);
      loadUsers();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete member account.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleOpenResetPasswordModal = (u: any) => {
    setActiveMenuUserId(null);
    setResettingUser(u);
    setUseAutoGenerate(true);
    setCustomTempPassword('');
    setResetError(null);
    setGeneratedTempPassword(null);
    setCopiedPassword(false);
  };

  const handleExecuteResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;
    setResetError(null);

    if (!useAutoGenerate && (!customTempPassword || customTempPassword.trim().length < 8)) {
      setResetError('Temporary password must be at least 8 characters in length.');
      return;
    }

    setResetSubmitting(true);
    try {
      const res = await apiRequest<{ success: boolean; temporaryPassword: string; message: string }>(
        `/api/admin/users/${resettingUser.id}/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify({
            customTemporaryPassword: useAutoGenerate ? null : customTempPassword.trim(),
          }),
        }
      );

      if (res && res.success) {
        setGeneratedTempPassword(res.temporaryPassword);
        setFeedback({
          type: 'success',
          message: `Password reset successfully for user '${resettingUser.userName}'.`,
        });
        loadUsers();
      }
    } catch (err: any) {
      setResetError(err?.message || 'Failed to reset user password.');
    } finally {
      setResetSubmitting(false);
    }
  };

  const getRoleBadge = (roleName: string) => {
    switch (roleName) {
      case 'Administrator':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[5px] text-[11.5px] font-semibold bg-[#FFF3E8] text-[#F47721] border border-[#FED7AA]">
            <Shield className="w-3 h-3 text-[#F47721]" />
            Administrator
          </span>
        );
      case 'AccountsOperator':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[5px] text-[11.5px] font-medium bg-[#F3F4F6] text-[#374151] border border-[#E5E7EB]">
            Accounts Operator
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[5px] text-[11.5px] font-medium bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0]">
            Viewer
          </span>
        );
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !searchQuery.trim() ||
      (u.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole =
      roleFilter === 'ALL' || u.role === roleFilter;

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && u.isActive) ||
      (statusFilter === 'INACTIVE' && !u.isActive);

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold text-[#1F2937]">User Management</h1>
          <p className="text-[13px] text-[#6B7280]">
            Manage FINORA team members, assign role permissions, and control application access.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-[#F47721] hover:bg-[#E06612] text-[#FFFFFF] rounded-[8px] font-semibold text-[13px] flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-[8px] border text-[13px] flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#EF4444]" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[#6B7280] hover:text-[#1F2937] p-1 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-3.5 flex flex-col md:flex-row items-center justify-between gap-3 text-[13px]">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search username, name, email..."
            className="w-full pl-9 pr-3 py-1.5 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:outline-none focus:border-[#F47721]"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] bg-white focus:outline-none focus:border-[#F47721]"
          >
            <option value="ALL">All Roles</option>
            <option value="Administrator">Administrator</option>
            <option value="AccountsOperator">Accounts Operator</option>
            <option value="Viewer">Viewer</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] bg-white focus:outline-none focus:border-[#F47721]"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>

          <button
            type="button"
            onClick={loadUsers}
            title="Refresh List"
            className="p-2 border border-[#E5E7EB] rounded-[7px] hover:bg-[#F9FAFB] text-[#6B7280] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#F47721]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-visible shadow-xs">
        <table className="w-full text-left border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[#6B7280]">
              <th className="py-3 px-4 font-semibold">Username & Email</th>
              <th className="py-3 px-4 font-semibold">Full Name</th>
              <th className="py-3 px-4 font-semibold">Role</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Last Login</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-[#6B7280]">
                  <Users className="w-8 h-8 text-[#D1D5DB] mx-auto mb-2" />
                  <p className="font-medium">No members found</p>
                  <p className="text-[12px] text-[#9CA3AF]">
                    {searchQuery ? 'Try adjusting your search criteria.' : 'Click "Add Member" to invite team members.'}
                  </p>
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const isSelf = currentUser && (currentUser.id === u.id || currentUser.userName === u.userName);
                const isMenuOpen = activeMenuUserId === u.id;

                return (
                  <tr key={u.id} className="hover:bg-[#FDFEFE] transition-colors">
                    {/* Username & Email */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#FFF3E8] border border-[#FED7AA] text-[#F47721] font-semibold flex items-center justify-center text-[12px] shrink-0">
                          {(u.fullName || u.userName || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-[#1F2937] flex items-center gap-1.5">
                            <span>{u.userName}</span>
                            {isSelf && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#FFF3E8] text-[#F47721] border border-[#FED7AA]">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[12px] text-[#6B7280]">{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Full Name */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-[#1F2937]">{u.fullName || '—'}</div>
                      <div className="text-[11px] text-[#9CA3AF]">{u.department || 'Accounts & Finance'}</div>
                    </td>

                    {/* Role */}
                    <td className="py-3.5 px-4">{getRoleBadge(u.role)}</td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {u.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-[#F3F4F6] text-[#6B7280] border border-[#E5E7EB]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF]"></span>
                          Inactive
                        </span>
                      )}
                    </td>

                    {/* Last Login */}
                    <td className="py-3.5 px-4 text-[#6B7280] text-[12px]">
                      {u.lastLoginAtUtc ? new Date(u.lastLoginAtUtc).toLocaleString() : 'Never'}
                    </td>

                    {/* Actions Column */}
                    <td className="py-3.5 px-4 text-right relative">
                      <div className="inline-block text-left">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuUserId(isMenuOpen ? null : u.id);
                          }}
                          className={`p-1.5 rounded-[6px] hover:bg-[#F3F4F6] text-[#6B7280] hover:text-[#1F2937] transition-colors border ${
                            isMenuOpen ? 'bg-[#F3F4F6] border-[#D1D5DB]' : 'border-transparent'
                          }`}
                          title="Member Actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Dropdown Popover */}
                        {isMenuOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-4 mt-1 w-44 bg-white rounded-[8px] shadow-lg border border-[#E5E7EB] py-1.5 z-40 text-[12.5px] text-left animate-in fade-in zoom-in-95 duration-100"
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(u)}
                              className="w-full px-3.5 py-2 text-[#374151] hover:bg-[#FFF3E8] hover:text-[#F47721] flex items-center gap-2 font-medium transition-colors cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              <span>Edit Member</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenResetPasswordModal(u)}
                              className="w-full px-3.5 py-2 text-[#374151] hover:bg-[#FFF3E8] hover:text-[#F47721] flex items-center gap-2 font-medium transition-colors cursor-pointer"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-[#F47721]" />
                              <span>Reset Password</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenStatusDialog(u)}
                              className="w-full px-3.5 py-2 text-[#374151] hover:bg-[#FFF3E8] hover:text-[#F47721] flex items-center gap-2 font-medium transition-colors cursor-pointer"
                            >
                              {u.isActive ? (
                                <>
                                  <UserX className="w-3.5 h-3.5 text-[#F47721]" />
                                  <span>Deactivate</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3.5 h-3.5 text-[#10B981]" />
                                  <span>Activate</span>
                                </>
                              )}
                            </button>

                            <div className="my-1 border-t border-[#F3F4F6]"></div>

                            <button
                              type="button"
                              onClick={() => handleOpenDeleteDialog(u)}
                              className="w-full px-3.5 py-2 text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-2 font-medium transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ==================================================================== */}
      {/* 1. ADD MEMBER MODAL                                                  */}
      {/* ==================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[12px] border border-[#E5E7EB] shadow-2xl max-w-lg w-full overflow-hidden text-[13px] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between bg-[#FFFFFF]">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1F2937]">Add New Member</h3>
                <p className="text-[12px] text-[#6B7280]">
                  Provision a new team member account with role permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-[6px] text-[#9CA3AF] hover:text-[#1F2937] hover:bg-[#F3F4F6]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateMember}>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {addError && (
                  <div className="p-3 rounded-[7px] bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[12.5px] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{addError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-medium text-[#374151] mb-1">
                      Username <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={addForm.userName}
                      onChange={(e) => setAddForm({ ...addForm, userName: e.target.value })}
                      placeholder="e.g. jsmith"
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:outline-none focus:border-[#F47721]"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-[#374151] mb-1">
                      Email Address <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={addForm.email}
                      onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                      placeholder="e.g. jsmith@organization.org"
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:outline-none focus:border-[#F47721]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-[#374151] mb-1">
                    Full Name <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addForm.fullName}
                    onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                    placeholder="e.g. John Smith"
                    className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:outline-none focus:border-[#F47721]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-medium text-[#374151] mb-1">Role</label>
                    <select
                      value={addForm.role}
                      onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] bg-white focus:outline-none focus:border-[#F47721]"
                    >
                      <option value="AccountsOperator">Accounts Operator</option>
                      <option value="Viewer">Viewer</option>
                      <option value="Administrator">Administrator</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-[#374151] mb-1">Department</label>
                    <input
                      type="text"
                      value={addForm.department}
                      onChange={(e) => setAddForm({ ...addForm, department: e.target.value })}
                      placeholder="Accounts & Finance"
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:outline-none focus:border-[#F47721]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div>
                    <label className="block font-medium text-[#374151] mb-1">
                      Initial Password <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={addForm.password}
                      onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                      placeholder="Minimum 8 characters"
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:outline-none focus:border-[#F47721]"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-[#374151] mb-1">
                      Confirm Password <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      value={addForm.confirmPassword}
                      onChange={(e) => setAddForm({ ...addForm, confirmPassword: e.target.value })}
                      placeholder="Re-type password"
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:outline-none focus:border-[#F47721]"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={addForm.isActive}
                      onChange={(e) => setAddForm({ ...addForm, isActive: e.target.checked })}
                      className="w-4 h-4 text-[#F47721] rounded border-[#D1D5DB] focus:ring-[#F47721]"
                    />
                    <span className="font-medium text-[#374151]">Active by default</span>
                    <span className="text-[12px] text-[#6B7280]">(Account can sign in immediately)</span>
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3.5 bg-[#F9FAFB] border-t border-[#E5E7EB] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-[#D1D5DB] rounded-[7px] text-[#374151] hover:bg-[#FFFFFF] font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSubmitting}
                  className="px-4 py-2 bg-[#F47721] hover:bg-[#E06612] text-[#FFFFFF] rounded-[7px] font-semibold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  {addSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Add Member</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. EDIT MEMBER MODAL                                                 */}
      {/* ==================================================================== */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[12px] border border-[#E5E7EB] shadow-2xl max-w-lg w-full overflow-hidden text-[13px] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between bg-[#FFFFFF]">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1F2937]">Edit Member</h3>
                <p className="text-[12px] text-[#6B7280]">
                  Update profile, role, status, or reset credentials for {editingUser.userName}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 rounded-[6px] text-[#9CA3AF] hover:text-[#1F2937] hover:bg-[#F3F4F6]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEditMember}>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {editError && (
                  <div className="p-3 rounded-[7px] bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[12.5px] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{editError}</span>
                  </div>
                )}

                {currentUser && (currentUser.id === editingUser.id || currentUser.userName === editingUser.userName) && (
                  <div className="p-2.5 rounded-[7px] bg-[#FFF3E8] border border-[#FED7AA] text-[#B45309] text-[12px] flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#F47721] shrink-0" />
                    <span>You are currently editing your own Administrator account.</span>
                  </div>
                )}

                <div>
                  <label className="block font-medium text-[#374151] mb-1">
                    Username <span className="text-[11px] text-[#9CA3AF]">(read-only)</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingUser.userName}
                    className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#6B7280] bg-[#F9FAFB] cursor-not-allowed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-medium text-[#374151] mb-1">
                      Full Name <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.fullName}
                      onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:outline-none focus:border-[#F47721]"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-[#374151] mb-1">
                      Email Address <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] focus:outline-none focus:border-[#F47721]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-medium text-[#374151] mb-1">Role</label>
                    <select
                      value={editForm.role}
                      disabled={currentUser?.id === editingUser.id}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] bg-white focus:outline-none focus:border-[#F47721] disabled:bg-[#F9FAFB] disabled:text-[#6B7280]"
                    >
                      <option value="Administrator">Administrator</option>
                      <option value="AccountsOperator">Accounts Operator</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-[#374151] mb-1">Account Status</label>
                    <select
                      value={editForm.isActive ? 'ACTIVE' : 'INACTIVE'}
                      disabled={currentUser?.id === editingUser.id}
                      onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === 'ACTIVE' })}
                      className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] bg-white focus:outline-none focus:border-[#F47721] disabled:bg-[#F9FAFB] disabled:text-[#6B7280]"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive (Disabled)</option>
                    </select>
                  </div>
                </div>

                {/* Password Reset Section */}
                <div className="pt-2 border-t border-[#F3F4F6]">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editForm.resetPassword}
                      onChange={(e) => setEditForm({ ...editForm, resetPassword: e.target.checked })}
                      className="w-4 h-4 text-[#F47721] rounded border-[#D1D5DB] focus:ring-[#F47721]"
                    />
                    <span className="font-semibold text-[#1F2937] flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-[#F47721]" />
                      Reset User Password
                    </span>
                  </label>

                  {editForm.resetPassword && (
                    <div className="mt-3 p-3 bg-[#F9FAFB] rounded-[8px] border border-[#E5E7EB] space-y-3">
                      <div>
                        <label className="block text-[12px] font-medium text-[#374151] mb-1">
                          New Password (min. 8 characters)
                        </label>
                        <input
                          type="password"
                          minLength={8}
                          value={editForm.newPassword}
                          onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                          placeholder="Enter new password"
                          className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-[6px] text-[#1F2937] bg-white focus:outline-none focus:border-[#F47721]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#374151] mb-1">
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          value={editForm.confirmNewPassword}
                          onChange={(e) => setEditForm({ ...editForm, confirmNewPassword: e.target.value })}
                          placeholder="Re-type new password"
                          className="w-full px-3 py-1.5 border border-[#E5E7EB] rounded-[6px] text-[#1F2937] bg-white focus:outline-none focus:border-[#F47721]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3.5 bg-[#F9FAFB] border-t border-[#E5E7EB] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-[#D1D5DB] rounded-[7px] text-[#374151] hover:bg-[#FFFFFF] font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 bg-[#F47721] hover:bg-[#E06612] text-[#FFFFFF] rounded-[7px] font-semibold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  {editSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. DEACTIVATE / ACTIVATE CONFIRMATION DIALOG                         */}
      {/* ==================================================================== */}
      {statusDialogUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[12px] border border-[#E5E7EB] shadow-2xl max-w-md w-full overflow-hidden text-[13px] animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 space-y-3.5">
              <div className="w-10 h-10 rounded-full bg-[#FFF3E8] border border-[#FED7AA] flex items-center justify-center text-[#F47721] mx-auto sm:mx-0">
                {statusDialogUser.isActive ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
              </div>

              <div>
                <h3 className="text-[17px] font-semibold text-[#1F2937]">
                  {statusDialogUser.isActive ? 'Deactivate Member?' : 'Activate Member?'}
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-1.5 leading-relaxed">
                  {statusDialogUser.isActive ? (
                    <>
                      This user will no longer be able to sign in to FINORA. Their account and historical records will
                      be retained.
                    </>
                  ) : (
                    <>
                      This user will regain access to sign in to FINORA according to their assigned role.
                    </>
                  )}
                </p>

                <div className="mt-3 p-2.5 bg-[#F9FAFB] rounded-[7px] border border-[#E5E7EB] text-[12px] text-[#374151]">
                  <div>
                    Member: <span className="font-semibold">{statusDialogUser.fullName || statusDialogUser.userName}</span>
                  </div>
                  <div className="text-[#6B7280]">Username: {statusDialogUser.userName}</div>
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-[#F9FAFB] border-t border-[#E5E7EB] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setStatusDialogUser(null)}
                className="px-4 py-2 border border-[#D1D5DB] rounded-[7px] text-[#374151] hover:bg-[#FFFFFF] font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusSubmitting}
                onClick={handleConfirmStatusToggle}
                className={`px-4 py-2 rounded-[7px] font-semibold text-white shadow-sm transition-colors flex items-center gap-2 ${
                  statusDialogUser.isActive
                    ? 'bg-[#F47721] hover:bg-[#E06612]'
                    : 'bg-[#10B981] hover:bg-[#059669]'
                }`}
              >
                {statusSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{statusDialogUser.isActive ? 'Deactivate' : 'Activate'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. DELETE MEMBER CONFIRMATION DIALOG (WITH "DELETE" CONFIRMATION)    */}
      {/* ==================================================================== */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[12px] border border-[#E5E7EB] shadow-2xl max-w-md w-full overflow-hidden text-[13px] animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 space-y-4">
              <div className="w-10 h-10 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center text-[#DC2626]">
                <Trash2 className="w-5 h-5" />
              </div>

              <div>
                <h3 className="text-[17px] font-semibold text-[#1F2937]">Delete Member?</h3>
                <p className="text-[13px] text-[#4B5563] mt-1.5 leading-relaxed">
                  This permanently removes the user account. Historical payroll records, audit logs, and business data
                  created by this user must remain intact.
                </p>
              </div>

              {deleteError && (
                <div className="p-2.5 rounded-[7px] bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[12px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="p-3 bg-[#F9FAFB] rounded-[8px] border border-[#E5E7EB] text-[12px] text-[#374151]">
                <div className="font-semibold text-[#1F2937]">
                  {deletingUser.fullName || deletingUser.userName} ({deletingUser.userName})
                </div>
                <div className="text-[#6B7280]">{deletingUser.email}</div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#374151] mb-1">
                  Type <span className="font-bold text-[#DC2626]">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px] text-[#1F2937] tracking-wider uppercase font-semibold focus:outline-none focus:border-[#DC2626]"
                />
              </div>
            </div>

            <div className="px-6 py-3.5 bg-[#F9FAFB] border-t border-[#E5E7EB] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 border border-[#D1D5DB] rounded-[7px] text-[#374151] hover:bg-[#FFFFFF] font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText.trim() !== 'DELETE' || deleteSubmitting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-[#DC2626] hover:bg-[#B91C1C] disabled:bg-[#D1D5DB] disabled:cursor-not-allowed text-[#FFFFFF] rounded-[7px] font-semibold shadow-sm transition-colors flex items-center gap-2"
              >
                {deleteSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Member</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. ADMINISTRATOR PASSWORD RESET MODAL                                */}
      {/* ==================================================================== */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[12px] border border-[#E5E7EB] shadow-2xl max-w-md w-full overflow-hidden text-[13px] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between bg-[#FFFFFF]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[6px] bg-[#FFF3E8] text-[#F47721] flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#1F2937]">Reset User Password</h3>
                  <p className="text-[11.5px] text-[#6B7280]">
                    Administrative security credential override
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResettingUser(null)}
                className="p-1 rounded-[6px] text-[#9CA3AF] hover:text-[#1F2937] hover:bg-[#F3F4F6]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              {/* User Identity Pill */}
              <div className="p-3 bg-[#F9FAFB] rounded-[8px] border border-[#E5E7EB] flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#1F2937]">
                    {resettingUser.fullName || resettingUser.userName}
                  </div>
                  <div className="text-[11.5px] text-[#6B7280]">
                    @{resettingUser.userName} &bull; {resettingUser.email}
                  </div>
                </div>
                <div className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF3E8] text-[#F47721] border border-[#FED7AA]">
                  {resettingUser.role}
                </div>
              </div>

              {resetError && (
                <div className="p-2.5 rounded-[7px] bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[12px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              {!generatedTempPassword ? (
                <form onSubmit={handleExecuteResetPassword} className="space-y-4">
                  <div className="p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-[7px] text-[12px] text-[#1E40AF] leading-relaxed">
                    Existing passwords are never revealed. Resetting this user&apos;s password will invalidate active sessions and assign a temporary password that requires the user to update it upon sign in.
                  </div>

                  <div className="space-y-2.5">
                    <label className="block text-[12px] font-semibold text-[#374151]">
                      Temporary Password Mode:
                    </label>

                    <label className="flex items-start gap-2.5 p-2.5 border border-[#E5E7EB] rounded-[7px] hover:bg-[#F9FAFB] cursor-pointer">
                      <input
                        type="radio"
                        name="tempPassMode"
                        checked={useAutoGenerate}
                        onChange={() => setUseAutoGenerate(true)}
                        className="mt-0.5 text-[#F47721] focus:ring-[#F47721]"
                      />
                      <div>
                        <div className="font-medium text-[#1F2937] text-[12.5px]">
                          Auto-generate secure temporary password (Recommended)
                        </div>
                        <div className="text-[11px] text-[#6B7280]">
                          Generates a high-entropy 12-character alphanumeric code with symbols.
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-2.5 border border-[#E5E7EB] rounded-[7px] hover:bg-[#F9FAFB] cursor-pointer">
                      <input
                        type="radio"
                        name="tempPassMode"
                        checked={!useAutoGenerate}
                        onChange={() => setUseAutoGenerate(false)}
                        className="mt-0.5 text-[#F47721] focus:ring-[#F47721]"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-[#1F2937] text-[12.5px]">
                          Specify custom temporary password
                        </div>
                        <div className="text-[11px] text-[#6B7280]">
                          Must meet minimum 8 characters security policy.
                        </div>
                      </div>
                    </label>
                  </div>

                  {!useAutoGenerate && (
                    <div>
                      <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                        Custom Temporary Password:
                      </label>
                      <input
                        type="text"
                        value={customTempPassword}
                        onChange={(e) => setCustomTempPassword(e.target.value)}
                        placeholder="Enter temporary password (min 8 characters)"
                        className="w-full px-3 py-2 text-[13px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                      />
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#E5E7EB]">
                    <button
                      type="button"
                      onClick={() => setResettingUser(null)}
                      className="px-4 py-2 border border-[#D1D5DB] rounded-[7px] text-[#374151] hover:bg-[#FFFFFF] font-medium transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resetSubmitting}
                      className="px-4 py-2 bg-[#F47721] hover:bg-[#E06411] text-[#FFFFFF] rounded-[7px] font-semibold shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {resetSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>Reset Password</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-[7px] flex items-center gap-2.5 text-[12.5px] text-[#065F46]">
                    <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
                    <span>Password has been successfully reset!</span>
                  </div>

                  <div>
                    <div className="text-[11.5px] font-semibold text-[#6B7280] mb-1.5">
                      Temporary Account Password:
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3.5 py-2.5 bg-[#F3F4F6] border border-[#D1D5DB] rounded-[6px] font-mono font-bold text-[14px] text-[#1F2937] tracking-wider select-all">
                        {generatedTempPassword}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedTempPassword);
                          setCopiedPassword(true);
                          setTimeout(() => setCopiedPassword(false), 3000);
                        }}
                        className="px-3.5 py-2.5 bg-[#FFFFFF] border border-[#D1D5DB] hover:border-[#F47721] hover:text-[#F47721] text-[#374151] rounded-[6px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Copy to clipboard"
                      >
                        {copiedPassword ? (
                          <>
                            <Check className="w-4 h-4 text-[#10B981]" />
                            <span className="text-[12px] text-[#10B981] font-semibold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span className="text-[12px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-[7px] text-[11.5px] text-[#92400E] leading-relaxed">
                    <strong>Important Security Notice:</strong> Provide this temporary password securely to the user. For security reasons, this password will not be shown again.
                  </div>

                  <div className="pt-2 flex justify-end border-t border-[#E5E7EB]">
                    <button
                      type="button"
                      onClick={() => setResettingUser(null)}
                      className="px-5 py-2 bg-[#1F2937] hover:bg-[#374151] text-[#FFFFFF] rounded-[7px] font-medium text-[13px] transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 9. AUDIT LOG VIEW
// ============================================================================
export const AuditLogView: React.FC = () => {
  const [entries, setEntries] = useState<any[]>([]);
  const [actionFilter, setActionFilter] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiRequest<any[]>(
      `/api/audit?actionFilter=${encodeURIComponent(actionFilter)}&search=${encodeURIComponent(
        search
      )}`
    )
      .then(setEntries)
      .catch(() => {});
  }, [actionFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold text-[#1F2937]">Audit Log</h1>
          <p className="text-[13px] text-[#6B7280]">
            Immutable record of authentication, imports, payslip edits, PDF generation, and email dispatches.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px]"
          >
            <option value="All">All Categories</option>
            <option value="Auth.">Authentication</option>
            <option value="Payroll.">Payroll Imports & Exports</option>
            <option value="Payslip.">Payslip Edits & Resets</option>
            <option value="Pdf.">PDF Generation</option>
            <option value="Email.">Email Delivery</option>
            <option value="Template.">Templates</option>
            <option value="Settings.">System Settings</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search summary or actor..."
            className="px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] w-64"
          />
        </div>
      </div>

      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto max-h-[620px]">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead className="sticky top-0">
              <tr className="bg-[#F8F9FA] border-b border-[#E5E7EB] text-[#6B7280]">
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold">Actor</th>
                <th className="py-3 px-4 font-semibold">Action</th>
                <th className="py-3 px-4 font-semibold">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-[#F8F9FA]">
                  <td className="py-2.5 px-4 text-[12px] text-[#6B7280] whitespace-nowrap">
                    {new Date(e.timestampUtc).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <span className="font-semibold text-[#1F2937]">{e.actorUserName}</span>{' '}
                    <span className="text-[11px] text-[#6B7280]">({e.actorRole})</span>
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-[5px] bg-[#FFF3E8] text-[#F47721] text-[11.5px] font-semibold">
                      {e.actionType}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[#1F2937]">{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 10. SETTINGS VIEW (Company Profile & SMTP Configuration)
// ============================================================================
export const SettingsView: React.FC<{
  isAdmin?: boolean;
  onSettingsUpdated?: () => void;
  onActivePeriodUpdated?: (m: number, y: number) => void;
}> = ({ isAdmin = true, onSettingsUpdated, onActivePeriodUpdated }) => {
  const [form, setForm] = useState<any | null>(null);
  const [newSmtpPassword, setNewSmtpPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [testRecipient, setTestRecipient] = useState('joshuags2537@gmail.com');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Software Updates State
  const [updateConfig, setUpdateConfig] = useState<any>({
    autoCheckUpdates: true,
    autoDownloadUpdates: false,
    notifyBeforeInstall: true,
    updateChannel: 'Stable',
    currentVersion: '1.0.0',
    availableVersion: '1.0.0',
    lastCheckedAtUtc: null,
    lastInstalledAtUtc: null,
  });
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<{ ok: boolean; text: string; available?: boolean; newVersion?: string } | null>(null);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    apiRequest<any>('/api/updates/status')
      .then((u) => {
        if (u) {
          setUpdateConfig((prev: any) => ({ ...prev, ...u }));
        }
      })
      .catch(() => {});
  }, []);

  const handleCheckUpdatesInSettings = async () => {
    setCheckingUpdates(true);
    setUpdateMsg(null);
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.updater?.check) {
        const res = await electronAPI.updater.check();
        if (res.isOffline) {
          setUpdateMsg({ ok: false, text: 'Unable to check for updates. Please check your internet connection and try again.' });
          return;
        }
      }

      const res = await apiRequest<any>('/api/updates/check', { method: 'POST' });
      if (res.isOffline) {
        setUpdateMsg({ ok: false, text: res.message || 'Unable to check for updates. Please check your internet connection and try again.' });
      } else if (res.isUpdateAvailable) {
        setUpdateConfig((prev: any) => ({ ...prev, availableVersion: res.latestVersion, lastCheckedAtUtc: res.lastCheckedAtUtc }));
        setUpdateMsg({ ok: true, text: `Update available: v${res.latestVersion}. Ready to download.`, available: true, newVersion: res.latestVersion });
      } else {
        setUpdateConfig((prev: any) => ({ ...prev, lastCheckedAtUtc: res.lastCheckedAtUtc }));
        setUpdateMsg({ ok: true, text: 'FINORA is up to date. You are running the latest version (v1.0.0).' });
      }
    } catch {
      setUpdateMsg({ ok: false, text: 'Unable to check for updates. Please check your internet connection and try again.' });
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleStartDownload = async () => {
    setDownloadingUpdate(true);
    setDownloadProgress(15);
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.updater?.download) {
      await electronAPI.updater.download();
    } else {
      for (let p = 30; p <= 100; p += 25) {
        await new Promise((r) => setTimeout(r, 350));
        setDownloadProgress(p);
      }
      setDownloadingUpdate(false);
      setUpdateReady(true);
    }
  };

  const handleInstallAndRestart = async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.updater?.install) {
      await electronAPI.updater.install();
    } else {
      alert('In packaged desktop mode, FINORA will cleanly close and launch the verified installer.');
    }
  };

  useEffect(() => {
    apiRequest<any>('/api/settings/company')
      .then((s) => {
        const fromAddr = s.smtpFromEmail || 'payroll@organization.org';
        const isGoogle =
          fromAddr.toLowerCase().endsWith('@gmail.com');
        setForm({
          ...s,
          smtpHost:
            !s.smtpHost || (isGoogle && s.smtpHost.toLowerCase() === 'smtp.office365.com')
              ? 'smtp.gmail.com'
              : s.smtpHost,
          smtpUsername: s.smtpUsername || fromAddr,
        });
      })
      .catch(() => {});
  }, []);

  if (!form) return null;

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm({ ...form, logoDataUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    setSmtpTestResult(null);
    const updated = await apiRequest('/api/settings/company', {
      method: 'PUT',
      body: JSON.stringify({
        ...form,
        emailProviderMode: newSmtpPassword.trim() ? 'Smtp' : form.emailProviderMode,
        newSmtpPassword: newSmtpPassword || undefined,
      }),
    });
    if (isAdmin) {
      try {
        await apiRequest('/api/updates/settings', {
          method: 'POST',
          body: JSON.stringify({
            autoCheckUpdates: updateConfig.autoCheckUpdates,
            autoDownloadUpdates: updateConfig.autoDownloadUpdates,
            notifyBeforeInstall: updateConfig.notifyBeforeInstall,
            updateChannel: updateConfig.updateChannel,
            updateServerUrl: updateConfig.updateServerUrl,
          }),
        });
      } catch {}
    }
    setForm(updated);
    setNewSmtpPassword('');
    setSaved(true);
    if (onSettingsUpdated) onSettingsUpdated();
    if (onActivePeriodUpdated && updated?.activePayrollMonth && updated?.activePayrollYear) {
      onActivePeriodUpdated(updated.activePayrollMonth, updated.activePayrollYear);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const res = await apiRequest<any>('/api/settings/smtp-test', {
        method: 'POST',
        body: JSON.stringify({
          smtpHost: form.smtpHost,
          smtpPort: form.smtpPort,
          smtpUsername: form.smtpUsername || form.smtpFromEmail,
          smtpFromEmail: form.smtpFromEmail,
          smtpPassword: newSmtpPassword || undefined,
          testRecipientEmail: testRecipient,
        }),
      });
      setForm({ ...form, emailProviderMode: 'Smtp', hasSmtpPasswordConfigured: true });
      setNewSmtpPassword('');
      setSmtpTestResult({ ok: true, text: res.message });
    } catch (err: any) {
      setSmtpTestResult({ ok: false, text: err.message || 'SMTP connection test failed.' });
    } finally {
      setTestingSmtp(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-5 text-[13px]">
      <div>
        <h1 className="text-[24px] font-semibold text-[#1F2937]">Company Profile & Settings</h1>
        <p className="text-[13px] text-[#6B7280]">
          Configure organization identity, logo, payslip defaults, and authenticated SMTP delivery.
        </p>
      </div>

      {saved && (
        <div className="p-3.5 rounded-[8px] bg-[#FFF3E8] border border-[#F47721]/40 text-[#1F2937] font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#F47721]" />
          <span>Saved Company Profile, Payslip Header Defaults, and SMTP settings.</span>
        </div>
      )}

      {/* Company Profile Card */}
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-5 space-y-4">
        <div className="font-semibold text-[15px] text-[#1F2937] flex items-center gap-2 border-b border-[#E5E7EB] pb-2.5">
          <Building2 className="w-4 h-4 text-[#F47721]" />
          <span>Company Profile (Used on Preview, PDF, Print & Email)</span>
        </div>

        {/* Company Logo Upload */}
        <div className="flex flex-wrap items-center gap-4 pb-2">
          {form.logoDataUrl ? (
            <img
              src={form.logoDataUrl}
              alt="Company Logo"
              className="h-12 w-auto object-contain rounded-[7px] border border-[#E5E7EB] p-1"
            />
          ) : (
            <div className="w-12 h-12 rounded-[8px] bg-[#F47721] flex items-center justify-center text-[#FFFFFF] font-bold text-[12px]">
              {(form.companyName || 'CORP').slice(0, 5)}
            </div>
          )}
          <div className="space-y-1">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] bg-[#FFF3E8] text-[#F47721] font-semibold text-[12px] cursor-pointer hover:bg-[#F47721] hover:text-[#FFFFFF] transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Company Logo</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleLogoFileChange}
              />
            </label>
            {form.logoDataUrl && (
              <button
                type="button"
                onClick={() => setForm({ ...form, logoDataUrl: null })}
                className="ml-2 text-[12px] text-[#6B7280] hover:text-[#1F2937]"
              >
                Remove Logo
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Company Name
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={form.companyName || ''}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Subtitle / Tagline
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={form.subtitle || ''}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Registered Address
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={form.registeredAddress || ''}
              onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Contact Email
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={form.contactEmail || ''}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Website URL
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={form.websiteUrl || ''}
              onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 font-medium cursor-pointer">
            <input
              type="checkbox"
              disabled={!isAdmin}
              checked={Boolean(form.showZeroValueComponentsByDefault)}
              onChange={(e) =>
                setForm({ ...form, showZeroValueComponentsByDefault: e.target.checked })
              }
            />
            <span>Show Zero-Value (0.00) Salary Rows by Default</span>
          </label>
          <label className="flex items-center gap-2 font-medium cursor-pointer">
            <input
              type="checkbox"
              disabled={!isAdmin}
              checked={Boolean(form.showAmountInWordsByDefault)}
              onChange={(e) =>
                setForm({ ...form, showAmountInWordsByDefault: e.target.checked })
              }
            />
            <span>Show Net Salary Amount-in-Words by Default</span>
          </label>
        </div>
      </div>

      {/* Email Provider Configuration */}
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] pb-2.5">
          <div className="font-semibold text-[15px] text-[#1F2937] flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#F47721]" />
            <span>Authenticated Email Delivery Provider</span>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-[#6B7280]">Quick Preset:</span>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    emailProviderMode: 'Smtp',
                    smtpHost: 'smtp.gmail.com',
                    smtpPort: 587,
                  })
                }
                className={`px-2.5 py-1 rounded-[6px] text-[11.5px] font-semibold border ${
                  form.smtpHost === 'smtp.gmail.com'
                    ? 'bg-[#FFF3E8] border-[#F47721] text-[#F47721]'
                    : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#6B7280]'
                }`}
              >
                Google Workspace / Gmail
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    emailProviderMode: 'Smtp',
                    smtpHost: 'smtp.office365.com',
                    smtpPort: 587,
                  })
                }
                className={`px-2.5 py-1 rounded-[6px] text-[11.5px] font-semibold border ${
                  form.smtpHost === 'smtp.office365.com'
                    ? 'bg-[#FFF3E8] border-[#F47721] text-[#F47721]'
                    : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#6B7280]'
                }`}
              >
                Microsoft 365 / Outlook
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              Delivery Provider Mode
            </label>
            <select
              disabled={!isAdmin}
              value={form.emailProviderMode || 'Sandbox'}
              onChange={(e) => setForm({ ...form, emailProviderMode: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            >
              <option value="Smtp">Production Authenticated SMTP Server (Real Email)</option>
              <option value="Sandbox">Sandbox Vault Outbox (Local Testing Only)</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">SMTP Host</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={form.smtpHost || ''}
              onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">SMTP Port</label>
            <input
              type="number"
              disabled={!isAdmin}
              value={form.smtpPort || 587}
              onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              From Email Address
            </label>
            <input
              type="email"
              disabled={!isAdmin}
              value={form.smtpFromEmail || ''}
              onChange={(e) => {
                const email = e.target.value;
                const isGoogle =
                  email.toLowerCase().endsWith('@gmail.com');
                setForm({
                  ...form,
                  smtpFromEmail: email,
                  smtpUsername:
                    !form.smtpUsername || form.smtpUsername === form.smtpFromEmail
                      ? email
                      : form.smtpUsername,
                  smtpHost:
                    isGoogle && form.smtpHost === 'smtp.office365.com'
                      ? 'smtp.gmail.com'
                      : form.smtpHost,
                });
              }}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              SMTP Username (Login Email)
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={form.smtpUsername || ''}
              onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
              SMTP Password / Google App Password ({form.hasSmtpPasswordConfigured ? 'Configured' : 'Required'})
            </label>
            <input
              type="password"
              disabled={!isAdmin}
              value={newSmtpPassword}
              onChange={(e) => {
                setNewSmtpPassword(e.target.value);
                if (e.target.value.trim()) {
                  setForm({ ...form, emailProviderMode: 'Smtp' });
                }
              }}
              placeholder={
                form.hasSmtpPasswordConfigured
                  ? 'Saved (enter new App Password to update)'
                  : 'Enter 16-char Google App Password...'
              }
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-[7px]"
            />
          </div>
        </div>

        {/* Live SMTP Connection Verification Bar */}
        <div className="p-3.5 rounded-[8px] bg-[#F8F9FA] border border-[#E5E7EB] space-y-2.5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-[11.5px] font-medium text-[#6B7280] mb-1">
                Test Recipient Email (Verify Live Inbox Delivery)
              </label>
              <input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="e.g. joshuags2537@gmail.com"
                className="w-full px-3 py-1.5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[7px]"
              />
            </div>
            <button
              type="button"
              disabled={testingSmtp}
              onClick={handleTestSmtp}
              className="px-4 py-2 rounded-[7px] bg-[#FFFFFF] border border-[#F47721] text-[#F47721] font-semibold hover:bg-[#FFF3E8]"
            >
              {testingSmtp ? 'Testing SMTP...' : 'Verify SMTP & Send Test Email'}
            </button>
          </div>
          {smtpTestResult && (
            <div
              className={`p-2.5 rounded-[6px] text-[12px] font-medium ${
                smtpTestResult.ok
                  ? 'bg-[#FFF3E8] border border-[#F47721]/40 text-[#1F2937]'
                  : 'bg-[#FFF3E8] border border-[#F47721] text-[#F47721]'
              }`}
            >
              {smtpTestResult.text}
            </div>
          )}
        </div>

        {/* Dedicated Section: Settings -> Software Updates */}
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-5 space-y-4">
          <div className="font-semibold text-[15px] text-[#1F2937] flex items-center justify-between border-b border-[#E5E7EB] pb-2.5">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[#F47721]" />
              <span>Software Updates</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF3E8] text-[#F47721] border border-[#F47721]/30">
              Channel: {updateConfig.updateChannel || 'Stable'}
            </span>
          </div>

          <p className="text-[12.5px] text-[#6B7280]">
            Configure automated update checking, installation policies, and update channels. Updates preserve all payroll data, database records, and settings.
          </p>

          {/* Preferences Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
            <label className="flex items-start gap-3 p-3 rounded-[8px] bg-[#F8F9FA] border border-[#E5E7EB] cursor-pointer hover:border-[#F47721]/40 transition-colors">
              <input
                type="checkbox"
                checked={!!updateConfig.autoCheckUpdates}
                onChange={(e) => setUpdateConfig({ ...updateConfig, autoCheckUpdates: e.target.checked })}
                className="mt-0.5 w-4 h-4 text-[#F47721] rounded border-[#D1D5DB] focus:ring-[#F47721]"
              />
              <div>
                <div className="text-[13px] font-semibold text-[#1F2937]">Automatically Check</div>
                <div className="text-[11.5px] text-[#6B7280]">Check on startup and every 24 hours</div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-[8px] bg-[#F8F9FA] border border-[#E5E7EB] cursor-pointer hover:border-[#F47721]/40 transition-colors">
              <input
                type="checkbox"
                checked={!!updateConfig.autoDownloadUpdates}
                onChange={(e) => setUpdateConfig({ ...updateConfig, autoDownloadUpdates: e.target.checked })}
                className="mt-0.5 w-4 h-4 text-[#F47721] rounded border-[#D1D5DB] focus:ring-[#F47721]"
              />
              <div>
                <div className="text-[13px] font-semibold text-[#1F2937]">Automatically Download</div>
                <div className="text-[11.5px] text-[#6B7280]">Download updates in the background</div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-[8px] bg-[#F8F9FA] border border-[#E5E7EB] cursor-pointer hover:border-[#F47721]/40 transition-colors">
              <input
                type="checkbox"
                checked={!!updateConfig.notifyBeforeInstall}
                onChange={(e) => setUpdateConfig({ ...updateConfig, notifyBeforeInstall: e.target.checked })}
                className="mt-0.5 w-4 h-4 text-[#F47721] rounded border-[#D1D5DB] focus:ring-[#F47721]"
              />
              <div>
                <div className="text-[13px] font-semibold text-[#1F2937]">Notify Before Install</div>
                <div className="text-[11.5px] text-[#6B7280]">Prompt to save active work first</div>
              </div>
            </label>
          </div>

          {/* Status & Check Action Card */}
          <div className="p-4 rounded-[8px] bg-[#F8F9FA] border border-[#E5E7EB] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3 text-[12.5px]">
                <span className="text-[#6B7280]">Current Version:</span>
                <span className="font-mono font-bold text-[#1F2937]">v{updateConfig.currentVersion || '1.0.0'}</span>
                <span className="text-[#D1D5DB]">|</span>
                <span className="text-[#6B7280]">Available Version:</span>
                <span className="font-mono font-bold text-[#F47721]">v{updateConfig.availableVersion || '1.0.0'}</span>
              </div>
              <div className="text-[11.5px] text-[#9CA3AF]">
                Last checked:{' '}
                {updateConfig.lastCheckedAtUtc
                  ? new Date(updateConfig.lastCheckedAtUtc).toLocaleString()
                  : 'Just now'}{' '}
                · Last successful update:{' '}
                {updateConfig.lastInstalledAtUtc
                  ? new Date(updateConfig.lastInstalledAtUtc).toLocaleDateString()
                  : 'v1.0.0 (Initial Release)'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCheckUpdatesInSettings}
              disabled={checkingUpdates}
              className="px-4 py-2 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#F47721] hover:text-[#F47721] text-[#1F2937] text-[12.5px] font-semibold flex items-center gap-2 transition-colors shrink-0 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#F47721] ${checkingUpdates ? 'animate-spin' : ''}`} />
              <span>{checkingUpdates ? 'Checking for Updates...' : 'Check for Updates'}</span>
            </button>
          </div>

          {/* Update Result Message */}
          {updateMsg && (
            <div className={`p-3.5 rounded-[8px] text-[12.5px] font-medium flex items-center justify-between gap-3 ${
              updateMsg.ok
                ? 'bg-[#FFF3E8] border border-[#F47721]/30 text-[#1F2937]'
                : 'bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B]'
            }`}>
              <div className="flex items-center gap-2">
                {updateMsg.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-[#F47721] shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
                )}
                <span>{updateMsg.text}</span>
              </div>
              {updateMsg.available && !downloadingUpdate && !updateReady && (
                <button
                  type="button"
                  onClick={handleStartDownload}
                  className="px-3.5 py-1.5 rounded-[6px] bg-[#F47721] text-[#FFFFFF] text-[12px] font-semibold hover:bg-[#E06612] flex items-center gap-1.5 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Update</span>
                </button>
              )}
            </div>
          )}

          {/* Live Download Progress */}
          {downloadingUpdate && (
            <div className="p-3.5 rounded-[8px] bg-[#FFF3E8] border border-[#F47721]/30 space-y-2">
              <div className="flex justify-between text-[12px] font-semibold text-[#1F2937]">
                <span>Downloading FINORA update package...</span>
                <span>{downloadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#FFFFFF] border border-[#E5E7EB] overflow-hidden">
                <div
                  className="h-full bg-[#F47721] rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <div className="text-[11px] text-[#6B7280]">
                Verifying cryptographic SHA-256 integrity hash and digital package signatures.
              </div>
            </div>
          )}

          {/* Ready to Install Notice */}
          {updateReady && (
            <div className="p-4 rounded-[8px] bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[#059669] shrink-0" />
                <div>
                  <div className="text-[13px] font-bold text-[#065F46]">Update Ready to Install</div>
                  <div className="text-[11.5px] text-[#047857]">
                    FINORA has downloaded and verified the update package. Please save any active payroll work before restarting.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleInstallAndRestart}
                className="px-4 py-2 rounded-[7px] bg-[#059669] hover:bg-[#047857] text-[#FFFFFF] text-[12.5px] font-semibold shrink-0 shadow-sm"
              >
                Install &amp; Restart
              </button>
            </div>
          )}
        </div>

        {/* System Information & Platform Attribution */}
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-5">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#E5E7EB]">
            <Shield className="w-4 h-4 text-[#F47721]" />
            <h2 className="text-[14px] font-semibold text-[#1F2937]">System Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[12.5px]">
            <div className="p-3 rounded-[7px] bg-[#F9FAFB] border border-[#E5E7EB] flex items-center gap-2.5">
              <img
                src="/finora_logo.png"
                alt="FINORA Logo"
                className="w-[42px] h-[42px] object-contain rounded-[7px] shrink-0"
              />
              <div>
                <div className="text-[#6B7280] text-[11px] font-medium uppercase tracking-wider">Product Name</div>
                <div className="text-[#1F2937] font-bold text-[14px] mt-0.5">FINORA</div>
                <div className="text-[#6B7280] text-[11px] mt-0.5">Finance &amp; Payroll Management System</div>
              </div>
            </div>
            <div className="p-3 rounded-[7px] bg-[#F9FAFB] border border-[#E5E7EB]">
              <div className="text-[#6B7280] text-[11px] font-medium uppercase tracking-wider">System Version</div>
              <div className="text-[#1F2937] font-semibold text-[13px] mt-0.5">v1.0.0 Enterprise</div>
              <div className="text-[#6B7280] text-[11px] mt-0.5">.NET 10.0 Web API · React 19 · PostgreSQL</div>
            </div>
            <div className="p-3 rounded-[7px] bg-[#F9FAFB] border border-[#E5E7EB]">
              <div className="text-[#6B7280] text-[11px] font-medium uppercase tracking-wider">Engineering Attribution</div>
              <div className="text-[#1F2937] font-medium text-[12.5px] mt-0.5 font-['Figtree']">
                Designed and Developed by <span className="text-[#F47721] font-semibold">Joshua Godson</span>
              </div>
              <div className="text-[#6B7280] text-[11px] mt-0.5">Institutional Payroll Platform</div>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-[7px] bg-[#F47721] text-[#FFFFFF] font-semibold hover:bg-[#E06612]"
            >
              Save System Configuration
            </button>
          </div>
        )}
      </div>
    </form>
  );
};
