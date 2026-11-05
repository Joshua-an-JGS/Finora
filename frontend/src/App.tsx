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
  Info,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  User,
  X,
  ArrowRight,
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
import { AboutView } from './components/AboutView';
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
import { MyProfileView } from './components/MyProfileView';
import { CompanySetupWizard } from './components/CompanySetupWizard';

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
  | 'settings'
  | 'about'
  | 'profile';

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
  const [showCompanyWizard, setShowCompanyWizard] = useState(false);

  // Top Header Global Employee Search
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalResults, setGlobalResults] = useState<EmployeeSearchItem[]>([]);
  const [showGlobalDropdown, setShowGlobalDropdown] = useState(false);

  // Top Header User Dropdown
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Automatic Software Update Notification State
  const [updateNotification, setUpdateNotification] = useState<{
    show: boolean;
    version: string;
    releaseNotes?: string;
    downloading?: boolean;
    progress?: number;
    readyToInstall?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!user) return;

    // 1. Electron Native Updater Events
    const electronAPI = (window as any).electronAPI;
    let unsubUpdater: (() => void) | undefined;
    if (electronAPI?.updater?.onEvent) {
      unsubUpdater = electronAPI.updater.onEvent((evt: any) => {
        if (evt.type === 'available') {
          setUpdateNotification({
            show: true,
            version: evt.version,
            releaseNotes: typeof evt.releaseNotes === 'string' ? evt.releaseNotes : undefined,
          });
        } else if (evt.type === 'progress') {
          setUpdateNotification((prev) =>
            prev ? { ...prev, downloading: true, progress: evt.percent } : null
          );
        } else if (evt.type === 'downloaded') {
          setUpdateNotification((prev) =>
            prev ? { ...prev, downloading: false, readyToInstall: true } : null
          );
        }
      });
    }

    // 2. Initial background check via API if enabled
    const timer = setTimeout(() => {
      apiRequest<any>('/api/updates/status')
        .then((s) => {
          if (s?.autoCheckUpdates) {
            apiRequest<any>('/api/updates/check', { method: 'POST' })
              .then((res) => {
                if (res?.isUpdateAvailable && res?.latestVersion) {
                  setUpdateNotification({
                    show: true,
                    version: res.latestVersion,
                    releaseNotes: res.releaseNotes,
                  });
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }, 4500);

    return () => {
      clearTimeout(timer);
      if (unsubUpdater) unsubUpdater();
    };
  }, [user]);


  const handleInstallUpdateFromBanner = async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.updater?.install) {
      await electronAPI.updater.install();
    } else {
      alert('In packaged desktop mode, FINORA will cleanly close and launch the verified installer.');
    }
  };

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
        if (profile.role === 'Administrator') {
          if (profile.companySetupCompleted === false) {
            setShowCompanyWizard(true);
          }
          if (profile.isAdminSession) {
            setViewMode('admin-console');
          } else {
            setViewMode('workspace');
          }
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
          if (u.role === 'Administrator') {
            if (u.companySetupCompleted === false) {
              setShowCompanyWizard(true);
            }
            if (u.isAdminSession) {
              setViewMode('admin-console');
            } else {
              setViewMode('workspace');
            }
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
      <>
        {showCompanyWizard && user && user.role === 'Administrator' && (
          <CompanySetupWizard
            currentUser={user}
            onFinish={() => {
              setShowCompanyWizard(false);
              setUser((prev) => (prev ? { ...prev, companySetupCompleted: true } : null));
            }}
            onSkip={() => {
              setShowCompanyWizard(false);
              setUser((prev) => (prev ? { ...prev, companySetupCompleted: true } : null));
            }}
          />
        )}
        <AdminConsoleView
        currentUser={user}
        onReturnToFinora={() => setViewMode('workspace')}
        onLogout={handleLogout}
        onOpenProfile={() => {
          setViewMode('workspace');
          setActiveNav('profile');
        }}
        onActivePeriodUpdated={(m, y) => {
          setActiveMonth(m);
          setActiveYear(y);
        }}
      />
      </>
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
      { key: 'about', label: 'About FINORA', icon: <Info className="w-[17px] h-[17px]" />, visible: true },
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
                className="flex items-center gap-2.5 px-1.5 py-1 rounded-[8px] transition-colors cursor-pointer select-none focus:outline-hidden"
              >
                <div className="w-8 h-8 rounded-full bg-[#F47721] flex items-center justify-center text-[#FFFFFF] shadow-xs shrink-0">
                  <User className="w-4 h-4 text-[#FFFFFF]" />
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

                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      setViewMode('workspace');
                      setActiveNav('profile');
                    }}
                    className="w-full text-left px-3.5 py-2 text-[13px] text-[#1F2937] hover:bg-[#FFF3E8] hover:text-[#F47721] flex items-center gap-2 transition-colors font-medium cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5 text-[#F47721]" />
                    <span>My Profile</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        setViewMode('admin-console');
                      }}
                      className="w-full text-left px-3.5 py-2 text-[13px] text-[#1F2937] hover:bg-[#FFF3E8] hover:text-[#F47721] flex items-center gap-2 transition-colors font-medium cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5 text-[#F47721]" />
                      <span>Administration Console</span>
                    </button>
                  )}

                  <div className="my-1 border-t border-[#F3F4F6]"></div>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3.5 py-2 text-[13px] text-[#1F2937] hover:bg-[#FFF3E8] hover:text-[#F47721] flex items-center gap-2 transition-colors cursor-pointer"
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
        <main className="flex-1 min-h-0 overflow-y-auto relative">
          {/* Automatic Software Update Alert Popup Toast (Bottom-Right Corner Slide-in) */}
          {updateNotification && updateNotification.show && (
            <aside
              aria-label="Software Update Notification"
              className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] rounded-[12px] bg-[#FFFFFF] border border-[#E5E7EB] border-t-2 border-t-[#F47721] shadow-2xl p-4 animate-in slide-in-from-bottom-5 fade-in duration-300"
            >
              <div
                className="flex items-start justify-between gap-3 cursor-pointer group"
                onClick={() => {
                  setActiveNav('about');
                  setUpdateNotification(null);
                }}
                title="Click to view update details in About page"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-[8px] bg-[#FFF3E8] border border-[#F47721]/30 flex items-center justify-center text-[#F47721] shrink-0 group-hover:bg-[#F47721] group-hover:text-[#FFFFFF] transition-colors">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-bold text-[#1F2937] group-hover:text-[#F47721] transition-colors">
                        Update Available
                      </span>
                      <span className="px-1.5 py-0.5 rounded font-mono text-[10.5px] font-bold bg-[#FFF3E8] text-[#F47721] border border-[#F47721]/30">
                        v{updateNotification.version}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#6B7280] mt-1 leading-snug">
                      FINORA v{updateNotification.version} is ready with enhancements. Click to review and install.
                    </p>
                  </div>
                </div>

                {/* Dismiss Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUpdateNotification(null);
                  }}
                  className="p-1 rounded-[6px] text-[#9CA3AF] hover:text-[#1F2937] hover:bg-[#F3F4F6] transition-colors shrink-0"
                  title="Dismiss notification"
                  aria-label="Dismiss notification"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {updateNotification.downloading ? (
                <div className="mt-3 pt-2.5 border-t border-[#F3F4F6] space-y-1.5">
                  <div className="flex justify-between text-[11.5px] font-semibold text-[#1F2937]">
                    <span className="flex items-center gap-1.5 text-[#F47721]">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Downloading update...
                    </span>
                    <span>{updateNotification.progress || 0}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#E5E7EB] overflow-hidden">
                    <div
                      className="h-full bg-[#F47721] rounded-full transition-all duration-300"
                      style={{ width: `${updateNotification.progress || 0}%` }}
                    />
                  </div>
                </div>
              ) : updateNotification.readyToInstall ? (
                <div className="mt-3 pt-2.5 border-t border-[#F3F4F6] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleInstallUpdateFromBanner}
                    className="flex-1 py-1.5 px-3 rounded-[7px] bg-[#059669] hover:bg-[#047857] text-[#FFFFFF] text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Install &amp; Restart</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpdateNotification(null)}
                    className="py-1.5 px-3 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280] hover:text-[#1F2937] text-[12px] font-medium transition-colors cursor-pointer"
                  >
                    Later
                  </button>
                </div>
              ) : (
                <div className="mt-3 pt-2.5 border-t border-[#F3F4F6] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveNav('about');
                      setUpdateNotification(null);
                    }}
                    className="flex-1 py-1.5 px-3 rounded-[7px] bg-[#F47721] hover:bg-[#E06612] text-[#FFFFFF] text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <span>View &amp; Update</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpdateNotification(null)}
                    className="py-1.5 px-2.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280] hover:text-[#1F2937] text-[12px] font-medium transition-colors cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </aside>
          )}

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

          {activeNav === 'about' && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <AboutView onNavigateToSettings={() => isAdmin && setActiveNav('settings')} />
            </div>
          )}

          {activeNav === 'profile' && (
            <div className="p-6 max-w-[1600px] mx-auto">
              <MyProfileView
                user={user}
                onProfileUpdated={(updated) => setUser(updated)}
                onNavigateToUserManagement={() => {
                  if (isAdmin) {
                    setViewMode('admin-console');
                  }
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
