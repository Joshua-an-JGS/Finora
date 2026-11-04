import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Calendar,
  FileEdit,
  LayoutTemplate,
  Mail,
  Send,
  FileBarChart2,
  Shield,
  ClipboardList,
  Settings as SettingsIcon,
  Search,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  apiRequest,
  clearStoredSession,
  getStoredToken,
  getStoredUser,
} from './services/api';
import type { EmployeeSearchItem, UserProfile } from './types/payroll';
import { LoginView } from './components/LoginView';
import { AdminConsoleView } from './components/AdminConsoleView';
import { ImportWizardView } from './components/ImportWizardView';
import { PayslipEditorView } from './components/PayslipEditorView';
import { NotificationPopover } from './components/NotificationPopover';
import {
  AuditLogView,
  DashboardView,
  EmailTemplatesView,
  EmployeeDirectoryView,
  MonthlyPayrollView,
  PayslipTemplatesView,
  ReportsAndExportsView,
  SentHistoryView,
  SettingsView,
  UserManagementView,
} from './components/ModuleViews';

type NavKey =
  | 'dashboard'
  | 'employees'
  | 'import'
  | 'monthly'
  | 'editor'
  | 'payslip-templates'
  | 'email-templates'
  | 'sent-history'
  | 'reports'
  | 'users'
  | 'audit'
  | 'settings';

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

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(() => getStoredUser());
  const [viewMode, setViewMode] = useState<'workspace' | 'admin-console'>('workspace');
  const [activeNav, setActiveNav] = useState<NavKey>('editor');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Global Active Payroll Month & Year
  const [activeMonth, setActiveMonth] = useState<number>(10);
  const [activeYear, setActiveYear] = useState<number>(2026);
  const [selectedEditorRecordId, setSelectedEditorRecordId] = useState<string | null>(null);

  // Top Header Global Employee Search
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalResults, setGlobalResults] = useState<EmployeeSearchItem[]>([]);
  const [showGlobalDropdown, setShowGlobalDropdown] = useState(false);

  // Top Header User Dropdown
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'FINORA — Finance & Payroll Management System';
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }
    apiRequest<UserProfile>('/api/auth/me')
      .then((profile) => {
        setUser(profile);
        if (profile.role === 'Administrator' && profile.isAdminSession) {
          setViewMode('admin-console');
        } else {
          setViewMode('workspace');
        }
      })
      .catch(() => {
        clearStoredSession();
        setUser(null);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    apiRequest<any>('/api/settings/company')
      .then((s) => {
        if (s?.activePayrollMonth) setActiveMonth(s.activePayrollMonth);
        if (s?.activePayrollYear) setActiveYear(s.activePayrollYear);
      })
      .catch(() => { });
  }, [user, activeNav]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (!user || !globalSearch.trim()) {
      setGlobalResults([]);
      return;
    }
    const timer = setTimeout(() => {
      apiRequest<EmployeeSearchItem[]>(
        `/api/payroll/search?q=${encodeURIComponent(globalSearch)}&month=${activeMonth}&year=${activeYear}`
      )
        .then((res) => setGlobalResults(res))
        .catch(() => setGlobalResults([]));
    }, 180);

    return () => clearTimeout(timer);
  }, [globalSearch, activeMonth, activeYear, user]);

  if (!user) {
    return (
      <LoginView
        onLoginSuccess={(u) => {
          setUser(u);
          if (u.role === 'Administrator' && u.isAdminSession) {
            setViewMode('admin-console');
          } else {
            setViewMode('workspace');
          }
        }}
      />
    );
  }

  const isAdmin = user.role === 'Administrator';
  const canEdit = user.role === 'Administrator' || user.role === 'AccountsOperator';

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearStoredSession();
    setUser(null);
    setViewMode('workspace');
  };

  const handleNotificationNavigate = (nav: string, recordId?: string) => {
    if (nav === 'editor') {
      if (recordId) {
        setSelectedEditorRecordId(recordId);
      }
      setActiveNav('editor');
    } else if (nav === 'monthly') {
      setActiveNav('monthly');
    } else if (nav === 'history' || nav === 'sent-history') {
      setActiveNav('sent-history');
    } else if (nav === 'import') {
      setActiveNav('import');
    } else if (nav === 'dashboard') {
      setActiveNav('dashboard');
    } else if (nav === 'audit' && isAdmin) {
      setViewMode('admin-console');
    }
  };

  if (viewMode === 'admin-console' && isAdmin) {
    return (
      <AdminConsoleView
        currentUser={user}
        onReturnToFinora={() => setViewMode('workspace')}
        onLogout={handleLogout}
        onActivePeriodUpdated={(m, y) => {
          setActiveMonth(m);
          setActiveYear(y);
        }}
      />
    );
  }

  const navItems: Array<{
    key: NavKey;
    label: string;
    icon: React.ReactNode;
    visible: boolean;
  }> = [
      { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-[17px] h-[17px]" />, visible: true },
      { key: 'employees', label: 'Employee Directory', icon: <Users className="w-[17px] h-[17px]" />, visible: true },
      { key: 'import', label: 'Import Excel', icon: <FileSpreadsheet className="w-[17px] h-[17px]" />, visible: canEdit },
      { key: 'monthly', label: 'Monthly Payroll', icon: <Calendar className="w-[17px] h-[17px]" />, visible: true },
      { key: 'editor', label: 'Payslip Editor', icon: <FileEdit className="w-[17px] h-[17px]" />, visible: true },
      { key: 'payslip-templates', label: 'Payslip Templates', icon: <LayoutTemplate className="w-[17px] h-[17px]" />, visible: canEdit },
      { key: 'email-templates', label: 'Email Templates', icon: <Mail className="w-[17px] h-[17px]" />, visible: canEdit },
      { key: 'sent-history', label: 'Sent History', icon: <Send className="w-[17px] h-[17px]" />, visible: true },
      { key: 'reports', label: 'Reports & Exports', icon: <FileBarChart2 className="w-[17px] h-[17px]" />, visible: true },
      { key: 'users', label: 'User Management', icon: <Shield className="w-[17px] h-[17px]" />, visible: isAdmin },
      { key: 'audit', label: 'Audit Log', icon: <ClipboardList className="w-[17px] h-[17px]" />, visible: isAdmin },
      { key: 'settings', label: 'Settings', icon: <SettingsIcon className="w-[17px] h-[17px]" />, visible: isAdmin },
    ];

  const handleOpenRecordInEditor = (recordId: string, month?: number, year?: number) => {
    if (month) setActiveMonth(month);
    if (year) setActiveYear(year);
    setSelectedEditorRecordId(recordId);
    setActiveNav('editor');
    setGlobalSearch('');
    setShowGlobalDropdown(false);
  };


  const activeMonthLabel = MONTHS.find((m) => m.value === activeMonth)?.label || 'October';
  const userInitials = (user.fullName || 'AU')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen flex bg-[#F8F9FA] text-[#1F2937]">
      {/* ====================================================================
          SECTION 5: LEFT SIDEBAR (232px, White #FFFFFF, Right Border #E5E7EB)
      ==================================================================== */}
      <aside
        className={`no-print bg-[#FFFFFF] border-r border-[#E5E7EB] flex flex-col justify-between transition-all duration-200 shrink-0 select-none ${sidebarCollapsed ? 'w-[68px]' : 'w-[232px]'
          }`}
      >
        {/* Top Branding */}
        <div>
          <div className="h-[64px] px-4 flex items-center justify-between border-b border-[#E5E7EB]">
            <div className="flex items-center gap-2 overflow-hidden">
              <img
                src="/finora_logo.png"
                alt="FINORA Logo"
                className="w-[38px] h-[38px] rounded-[7px] object-contain shrink-0"
              />
              {!sidebarCollapsed && (
                <div className="leading-tight truncate">
                  <div className="text-[16px] font-bold text-[#1F2937] tracking-tight truncate">
                    FINORA
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#F47721] truncate">
                    Finance &amp; Payroll
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="p-1 rounded-[6px] text-[#9CA3AF] hover:text-[#1F2937] hover:bg-[#F8F9FA] transition-colors"
              title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="py-3 px-2.5 space-y-0.5">
            {navItems
              .filter((item) => item.visible)
              .map((item) => {
                const active = activeNav === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveNav(item.key)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-[7px] text-[13px] transition-colors ${active
                        ? 'bg-[#FFF3E8] text-[#F47721] font-semibold'
                        : 'text-[#6B7280] hover:bg-[#FFF8F3] hover:text-[#1F2937] font-medium'
                      }`}
                  >
                    {/* Small orange indicator bar on the left for active item */}
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-[#F47721] rounded-r" />
                    )}
                    <span className={active ? 'text-[#F47721] shrink-0' : 'text-[#6B7280] shrink-0'}>
                      {item.icon}
                    </span>
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
          </nav>
        </div>

        {/* Bottom Payroll Period Selector Card & Developer Attribution */}
        <div className="p-3 border-t border-[#E5E7EB] space-y-2.5">
          {!sidebarCollapsed ? (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#6B7280] mb-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#F47721]" />
                <span>Payroll Period</span>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Active Payroll Month"
                  value={activeMonth}
                  onChange={(e) => setActiveMonth(Number(e.target.value))}
                  className="flex-1 text-[12.5px] font-semibold text-[#1F2937] bg-[#FFFFFF] border border-[#E5E7EB] rounded-[6px] px-2 py-1"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Active Payroll Year"
                  value={activeYear}
                  onChange={(e) => setActiveYear(Number(e.target.value))}
                  className="w-[72px] text-[12.5px] font-semibold text-[#1F2937] bg-[#FFFFFF] border border-[#E5E7EB] rounded-[6px] px-1.5 py-1"
                >
                  {[2025, 2026, 2027].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center py-2 bg-[#FFF3E8] rounded-[7px] text-[#F47721]"
              title={`Payroll Period: ${activeMonthLabel} ${activeYear}`}
            >
              <Calendar className="w-4 h-4" />
              <span className="text-[10px] font-bold mt-0.5">{activeMonth}/{String(activeYear).slice(-2)}</span>
            </div>
          )}

          {/* Software Developer Attribution */}
          <div className="text-center font-['Figtree'] select-none pt-0.5">
            {!sidebarCollapsed ? (
              <div className="text-[9.5px] sm:text-[10.5px] text-[#9CA3AF] font-normal leading-tight">
                <div>Designed and Developed by</div>
                <div className="text-[#F47721] font-medium mt-0.5">Joshua Godson</div>
              </div>
            ) : (
              <div
                className="text-[9px] text-[#9CA3AF] font-normal text-center cursor-default leading-none"
                title="Designed and Developed by Joshua Godson"
              >
                <span className="text-[#F47721] font-medium">JG</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ====================================================================
          MAIN CONTENT AREA (Top Header + Application Workspace)
      ==================================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* SECTION 6: TOP HEADER (White #FFFFFF, 64px height, Bottom Border #E5E7EB) */}
        <header className="no-print h-[64px] bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 flex items-center justify-between gap-4 shrink-0 z-20">
          {/* Left: Global Employee Search */}
          <div className="relative w-full max-w-[420px]">
            <Search className="w-4 h-4 text-[#F47721] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={globalSearch}
              onFocus={() => setShowGlobalDropdown(true)}
              onBlur={() => setTimeout(() => setShowGlobalDropdown(false), 200)}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setShowGlobalDropdown(true);
              }}
              placeholder="Search employee by name or employee ID..."
              className="w-full pl-10 pr-4 py-2 text-[13px] bg-[#FFFFFF] border border-[#E5E7EB] rounded-[7px] text-[#1F2937] placeholder-[#9CA3AF]"
            />

            {showGlobalDropdown && globalSearch.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] shadow-lg overflow-hidden z-50">
                <div className="px-3 py-1.5 bg-[#FFF8F3] border-b border-[#E5E7EB] text-[11px] font-semibold text-[#6B7280] flex items-center justify-between">
                  <span>Employees in {activeMonthLabel} {activeYear}</span>
                  <span className="text-[#F47721]">{globalResults.length} found</span>
                </div>
                {globalResults.length === 0 ? (
                  <div className="p-3.5 text-[12.5px] text-[#6B7280]">
                    No employee found matching "{globalSearch}" in {activeMonthLabel} {activeYear}.
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto divide-y divide-[#E5E7EB]">
                    {globalResults.map((emp) => (
                      <button
                        key={emp.recordId}
                        type="button"
                        onMouseDown={() => handleOpenRecordInEditor(emp.recordId)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-[#FFF3E8] flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="text-[13px] font-semibold text-[#1F2937]">
                            {emp.employeeName}{' '}
                            <span className="text-[#F47721] font-mono text-[12px] ml-1">
                              {emp.employeeCode}
                            </span>
                          </div>
                          <div className="text-[11.5px] text-[#6B7280]">
                            {emp.department} · {emp.designation}
                          </div>
                        </div>
                        <span className="text-[11.5px] font-semibold text-[#F47721]">
                          Open Editor →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Notifications, Admin Gateway & User Profile Dropdown */}
          <div className="flex items-center gap-2.5">
            {/* Quick Admin Console Switch for authenticated Administrators */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setViewMode('admin-console')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] bg-[#1F2937] text-white hover:bg-[#111827] text-[12px] font-semibold shadow-sm transition-colors"
                title="Switch to Administration Console"
              >
                <Shield className="w-3.5 h-3.5 text-[#F47721]" />
                <span className="hidden sm:inline">Admin Console</span>
              </button>
            )}

            {/* Notifications Popover */}
            <NotificationPopover onNavigate={handleNotificationNavigate} />

            {/* User Avatar + Name + Role + Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu((m) => !m)}
                className="flex items-center gap-2.5 pl-2 pr-2.5 py-1.5 rounded-[8px] hover:bg-[#F8F9FA] border border-transparent hover:border-[#E5E7EB] transition-colors"
              >
                <div className="w-8 h-8 rounded-[7px] bg-[#FFF3E8] border border-[#F47721]/25 flex items-center justify-center text-[#F47721] font-semibold text-[12px]">
                  {userInitials}
                </div>
                <div className="text-left hidden sm:block leading-tight">
                  <div className="text-[13px] font-semibold text-[#1F2937]">
                    {user.fullName}
                  </div>
                  <div className="text-[11px] text-[#6B7280]">{user.role}</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#9CA3AF]" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[8px] shadow-lg py-1.5 z-50">
                  <div className="px-3.5 py-2 border-b border-[#E5E7EB]">
                    <div className="text-[13px] font-semibold text-[#1F2937] truncate">
                      {user.fullName}
                    </div>
                    <div className="text-[11.5px] text-[#6B7280] truncate">{user.email}</div>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        setViewMode('admin-console');
                      }}
                      className="w-full text-left px-3.5 py-2 text-[13px] text-[#1F2937] hover:bg-[#FFF3E8] hover:text-[#F47721] flex items-center gap-2 transition-colors font-medium"
                    >
                      <Shield className="w-3.5 h-3.5 text-[#F47721]" />
                      <span>Administration Console</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3.5 py-2 text-[13px] text-[#1F2937] hover:bg-[#FFF3E8] hover:text-[#F47721] flex items-center gap-2 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* WORKSPACE BODY */}
        <main className="flex-1 min-h-0 overflow-y-auto">
          {activeNav === 'dashboard' && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <DashboardView
                activeMonth={activeMonth}
                activeYear={activeYear}
                onMonthYearChange={(m, y) => {
                  setActiveMonth(m);
                  setActiveYear(y);
                }}
                onNavigate={(nav) => setActiveNav(nav as NavKey)}
                onOpenRecordInEditor={handleOpenRecordInEditor}
              />
            </div>
          )}

          {activeNav === 'employees' && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <EmployeeDirectoryView onOpenRecordInEditor={handleOpenRecordInEditor} />
            </div>
          )}

          {activeNav === 'import' && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <ImportWizardView
                defaultMonth={activeMonth}
                defaultYear={activeYear}
                onImportCommitted={(m, y) => {
                  setActiveMonth(m);
                  setActiveYear(y);
                  setActiveNav('monthly');
                }}
              />
            </div>
          )}

          {activeNav === 'monthly' && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <MonthlyPayrollView
                activeMonth={activeMonth}
                activeYear={activeYear}
                canEdit={canEdit}
                onOpenRecordInEditor={(id) => handleOpenRecordInEditor(id)}
              />
            </div>
          )}

          {activeNav === 'editor' && (
            <PayslipEditorView
              activeMonth={activeMonth}
              activeYear={activeYear}
              initialRecordId={selectedEditorRecordId}
              canEdit={canEdit}
              onMonthYearChange={(m, y) => {
                setActiveMonth(m);
                setActiveYear(y);
              }}
            />
          )}

          {activeNav === 'payslip-templates' && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <PayslipTemplatesView canEdit={canEdit} />
            </div>
          )}

          {activeNav === 'email-templates' && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <EmailTemplatesView canEdit={canEdit} />
            </div>
          )}

          {activeNav === 'sent-history' && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <SentHistoryView canEdit={canEdit} />
            </div>
          )}

          {activeNav === 'reports' && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <ReportsAndExportsView activeMonth={activeMonth} activeYear={activeYear} />
            </div>
          )}

          {activeNav === 'users' && isAdmin && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <UserManagementView currentUser={user} isAdmin={isAdmin} />
            </div>
          )}

          {activeNav === 'audit' && isAdmin && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <AuditLogView />
            </div>
          )}

          {activeNav === 'settings' && isAdmin && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <SettingsView
                onActivePeriodUpdated={(m, y) => {
                  setActiveMonth(m);
                  setActiveYear(y);
                }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
