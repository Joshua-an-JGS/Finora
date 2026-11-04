import React, { useState, useEffect } from 'react';
import {
  Users,
  Shield,
  KeyRound,
  Building2,
  Layers,
  Calendar,
  Mail,
  LayoutTemplate,
  Lock,
  ClipboardList,
  Server,
  LogOut,
  ArrowLeft,
  CheckCircle2,
  Check,
  X,
  RefreshCw,
  FolderOpen,
  AlertTriangle,
  Archive,
  FileText,
  User,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import type { UserProfile } from '../types/payroll';
import {
  UserManagementView,
  AuditLogView,
  PayslipTemplatesView,
  SettingsView,
} from './ModuleViews';
import { NotificationPopover } from './NotificationPopover';
import { SecurityMfaView } from './SecurityMfaView';

export type AdminNavKey =
  | 'dashboard'
  | 'users'
  | 'roles'
  | 'company'
  | 'payroll-config'
  | 'salary-components'
  | 'email-config'
  | 'templates'
  | 'security'
  | 'audit'
  | 'system';

interface AdminConsoleViewProps {
  currentUser: UserProfile;
  onReturnToFinora: () => void;
  onLogout: () => void;
  onActivePeriodUpdated?: (m: number, y: number) => void;
  onOpenProfile?: () => void;
}

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({
  currentUser,
  onReturnToFinora,
  onLogout,
  onActivePeriodUpdated,
  onOpenProfile,
}) => {
  const [activeNav, setActiveNav] = useState<AdminNavKey>('dashboard');
  const [systemStats, setSystemStats] = useState<{
    totalUsers: number;
    activeUsers: number;
    totalAuditEvents: number;
    activePeriod: string;
    serverUptime: string;
    dbConnected: boolean;
  }>({
    totalUsers: 3,
    activeUsers: 3,
    totalAuditEvents: 0,
    activePeriod: 'October 2026',
    serverUptime: 'Operational',
    dbConnected: true,
  });

  const [feedback, setFeedback] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState<boolean>(false);
  const [restoreConfirmModal, setRestoreConfirmModal] = useState<{ open: boolean; fileName: string }>({
    open: false,
    fileName: '',
  });

  const loadStorageAndBackups = async () => {
    try {
      const [storageRes, backupsRes] = await Promise.allSettled([
        apiRequest<any>('/api/admin/system/storage-info'),
        apiRequest<any[]>('/api/admin/backups'),
      ]);
      if (storageRes.status === 'fulfilled') {
        setStorageInfo(storageRes.value);
      }
      if (backupsRes.status === 'fulfilled' && Array.isArray(backupsRes.value)) {
        setBackups(backupsRes.value);
      }
    } catch {
      // ignore
    }
  };

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await apiRequest<any>('/api/admin/backups/create', { method: 'POST' });
      setFeedback(res.message || 'System backup snapshot created successfully!');
      setTimeout(() => setFeedback(null), 5000);
      await loadStorageAndBackups();
    } catch (err: any) {
      setFeedback(`Backup creation failed: ${err.message || 'Unknown error'}`);
      setTimeout(() => setFeedback(null), 5000);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async (fileName: string) => {
    setBackupLoading(true);
    try {
      const res = await apiRequest<any>('/api/admin/backups/restore', {
        method: 'POST',
        body: JSON.stringify({ fileName }),
      });
      setRestoreConfirmModal({ open: false, fileName: '' });
      setFeedback(res.message || `System restored successfully from ${fileName}!`);
      setTimeout(() => setFeedback(null), 7000);
      await loadStorageAndBackups();
    } catch (err: any) {
      setFeedback(`Restore failed: ${err.message || 'Unknown error'}`);
      setTimeout(() => setFeedback(null), 5000);
    } finally {
      setBackupLoading(false);
    }
  };

  useEffect(() => {
    loadConsoleData();
    loadStorageAndBackups();
  }, []);

  useEffect(() => {
    if (activeNav === 'system') {
      loadStorageAndBackups();
    }
  }, [activeNav]);

  const loadConsoleData = async () => {
    try {
      const [usersRes, auditRes, compRes, healthRes] = await Promise.allSettled([
        apiRequest<any[]>('/api/admin/users'),
        apiRequest<any>('/api/audit'),
        apiRequest<any>('/api/settings/company'),
        apiRequest<any>('/api/health'),
      ]);

      let totalUsers = 3;
      let activeUsers = 3;
      if (usersRes.status === 'fulfilled' && Array.isArray(usersRes.value)) {
        totalUsers = usersRes.value.length;
        activeUsers = usersRes.value.filter((u: any) => u.isActive !== false).length;
      }

      let totalAuditEvents = 0;
      if (auditRes.status === 'fulfilled') {
        const list = Array.isArray(auditRes.value) ? auditRes.value : [];
        totalAuditEvents = list.length;
      }

      let activePeriod = 'October 2026';
      if (compRes.status === 'fulfilled' && compRes.value) {
        const m = compRes.value.activePayrollMonth || 10;
        const y = compRes.value.activePayrollYear || 2026;
        onActivePeriodUpdated?.(m, y);
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December',
        ];
        activePeriod = `${monthNames[m - 1] || 'Month ' + m} ${y}`;
      }

      let dbConnected = true;
      if (healthRes.status === 'fulfilled' && healthRes.value) {
        dbConnected = healthRes.value.databaseConnected ?? true;
      }

      setSystemStats({
        totalUsers,
        activeUsers,
        totalAuditEvents,
        activePeriod,
        serverUptime: 'Healthy (100%)',
        dbConnected,
      });
    } catch {
      // ignore
    }
  };

  // Section 1: Management & Governance Modules
  const managementNavItems: Array<{
    key: AdminNavKey;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }> = [
    { key: 'dashboard', label: 'Admin Dashboard', icon: <Shield className="w-4 h-4" /> },
    { key: 'users', label: 'Users', icon: <Users className="w-4 h-4" />, badge: `${systemStats.totalUsers}` },
    { key: 'roles', label: 'Roles & Permissions', icon: <KeyRound className="w-4 h-4" /> },
    { key: 'company', label: 'Company Profile', icon: <Building2 className="w-4 h-4" /> },
    { key: 'payroll-config', label: 'Payroll Configuration', icon: <Calendar className="w-4 h-4" /> },
    { key: 'salary-components', label: 'Salary Components', icon: <Layers className="w-4 h-4" /> },
    { key: 'email-config', label: 'Email Configuration', icon: <Mail className="w-4 h-4" /> },
    { key: 'templates', label: 'Template Configuration', icon: <LayoutTemplate className="w-4 h-4" /> },
    { key: 'security', label: 'Security & MFA', icon: <Lock className="w-4 h-4" /> },
    { key: 'audit', label: 'Audit Logs', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'system', label: 'System Settings', icon: <Server className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#1F2937]">
      {/* ====================================================================
          ADMINISTRATION TOP BAR
      ==================================================================== */}
      <header className="h-[64px] bg-[#FFFFFF] border-b border-[#E5E7EB] px-6 flex items-center justify-between gap-4 shrink-0 z-30 select-none shadow-xs">
        {/* Left: Branding & Environment Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/finora_logo.png"
              alt="FINORA Logo"
              className="w-[38px] h-[38px] rounded-[7px] object-contain shrink-0"
            />
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="text-[17px] font-bold text-[#1F2937] tracking-tight">
                  FINORA Administration
                </span>
                <span className="px-2 py-0.5 rounded-[4px] bg-[#1F2937] text-[#FFFFFF] text-[10.5px] font-bold uppercase tracking-wider">
                  Admin Gateway
                </span>
              </div>
              <div className="text-[11px] text-[#6B7280]">
                Restricted System Administration Console
              </div>
            </div>
          </div>
        </div>

        {/* Right: Return to FINORA Workspace & User Info */}
        <div className="flex items-center gap-3">
          {/* Prominent Return to FINORA Button */}
          <button
            type="button"
            onClick={onReturnToFinora}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-[#FFF3E8] border border-[#F47721]/40 text-[#F47721] hover:bg-[#F47721] hover:text-[#FFFFFF] text-[13px] font-semibold transition-colors shadow-xs"
            title="Return to the normal FINORA payroll workspace"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to FINORA</span>
          </button>

          {/* Notifications */}
          <NotificationPopover
            onNavigate={(nav) => {
              if (nav === 'audit') setActiveNav('audit');
              else if (nav === 'users') setActiveNav('users');
              else if (nav === 'system') setActiveNav('system');
              else onReturnToFinora();
            }}
          />

          {/* Admin User Badge / Profile Link */}
          <button
            type="button"
            onClick={onOpenProfile || onReturnToFinora}
            className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-[6px] hover:bg-[#F3F4F6] transition-colors cursor-pointer select-none text-left"
            title="View & Edit My Profile"
          >
            <div className="w-7 h-7 rounded-full bg-[#F47721] text-[#FFFFFF] flex items-center justify-center shadow-xs shrink-0">
              <User className="w-3.5 h-3.5 text-[#FFFFFF]" />
            </div>
            <div className="leading-tight text-[12px]">
              <div className="font-semibold text-[#1F2937] hover:text-[#F47721] transition-colors">
                {currentUser.fullName}
              </div>
              <div className="text-[10.5px] text-[#F47721] font-medium">Administrator &bull; My Profile</div>
            </div>
          </button>

          {/* Secure Logout */}
          <button
            type="button"
            onClick={onLogout}
            className="p-1.5 text-[#6B7280] hover:text-[#EF4444] transition-colors focus:outline-hidden cursor-pointer"
            title="Sign Out of Administration"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ====================================================================
          ADMIN BODY: SIDEBAR + CONTENT
      ==================================================================== */}
      <div className="flex-1 flex min-h-0">
        {/* Admin Navigation Sidebar (240px) */}
        <aside className="w-[240px] bg-[#FFFFFF] border-r border-[#E5E7EB] flex flex-col justify-between shrink-0 select-none overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* 1. MANAGEMENT MODULES */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] px-3 py-1.5">
                Management Modules
              </div>
              <nav className="space-y-0.5">
                {managementNavItems.map((item) => {
                  const active = activeNav === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveNav(item.key)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-[8px] text-[13px] transition-colors ${
                        active
                          ? 'bg-[#1F2937] text-[#FFFFFF] font-semibold shadow-xs'
                          : 'text-[#6B7280] hover:bg-[#F8F9FA] hover:text-[#1F2937] font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={active ? 'text-[#F47721]' : 'text-[#6B7280]'}>
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded-[4px] font-semibold ${
                            active
                              ? 'bg-[#F47721] text-[#FFFFFF]'
                              : 'bg-[#F3F4F6] text-[#6B7280]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

          </div>

          {/* Sidebar Footer Security Status */}
          <div className="p-3 border-t border-[#E5E7EB] space-y-2 shrink-0 bg-[#FFFFFF]">
            <div className="p-2.5 rounded-[8px] bg-[#F8F9FA] border border-[#E5E7EB] text-[11px] space-y-1 text-[#6B7280]">
              <div className="flex items-center gap-1.5 text-[#1F2937] font-semibold">
                <Lock className="w-3.5 h-3.5 text-[#F47721]" />
                <span>Privileged Session Active</span>
              </div>
              <div>Rate Limiting: Enforced</div>
              <div>Audit Stream: Live Logging</div>
            </div>
          </div>
        </aside>

        {/* Admin Content Pane */}
        <main className="flex-1 overflow-y-auto min-w-0 p-6">
          <div className="max-w-[1500px] mx-auto space-y-6">
            {feedback && (
              <div className="p-3 rounded-[8px] bg-[#FFF3E8] border border-[#F47721]/40 text-[#1F2937] font-medium text-[13px] flex items-center justify-between">
                <span>{feedback}</span>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="text-[#6B7280] hover:text-[#1F2937]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 1. ADMIN DASHBOARD */}
            {activeNav === 'dashboard' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-[22px] font-bold text-[#1F2937]">System Administration Overview</h1>
                  <p className="text-[13px] text-[#6B7280] mt-0.5">
                    Centralized management and security controls for FINORA Finance &amp; Payroll Management System.
                  </p>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4 shadow-xs">
                    <div className="flex items-center justify-between text-[#6B7280] text-[12px] mb-2 font-medium">
                      <span>Total Accounts</span>
                      <Users className="w-4 h-4 text-[#F47721]" />
                    </div>
                    <div className="text-[26px] font-bold text-[#1F2937]">{systemStats.totalUsers}</div>
                    <div className="text-[11.5px] text-[#10B981] font-medium mt-1">
                      {systemStats.activeUsers} active accounts
                    </div>
                  </div>

                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4 shadow-xs">
                    <div className="flex items-center justify-between text-[#6B7280] text-[12px] mb-2 font-medium">
                      <span>Active Payroll Period</span>
                      <Calendar className="w-4 h-4 text-[#F47721]" />
                    </div>
                    <div className="text-[20px] font-bold text-[#1F2937] truncate">{systemStats.activePeriod}</div>
                    <div className="text-[11.5px] text-[#6B7280] mt-1">Institutional Cycle</div>
                  </div>

                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4 shadow-xs">
                    <div className="flex items-center justify-between text-[#6B7280] text-[12px] mb-2 font-medium">
                      <span>Audit Trail Records</span>
                      <ClipboardList className="w-4 h-4 text-[#F47721]" />
                    </div>
                    <div className="text-[26px] font-bold text-[#1F2937]">{systemStats.totalAuditEvents}</div>
                    <div className="text-[11.5px] text-[#6B7280] mt-1">Full compliance logging</div>
                  </div>

                  <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-4 shadow-xs">
                    <div className="flex items-center justify-between text-[#6B7280] text-[12px] mb-2 font-medium">
                      <span>Security &amp; Gateway</span>
                      <Shield className="w-4 h-4 text-[#10B981]" />
                    </div>
                    <div className="text-[20px] font-bold text-[#10B981]">Protected</div>
                    <div className="text-[11.5px] text-[#6B7280] mt-1">Hidden gateway active</div>
                  </div>
                </div>

                {/* Quick Navigation Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div
                    onClick={() => setActiveNav('users')}
                    className="p-5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] hover:border-[#F47721] cursor-pointer transition-colors shadow-xs group"
                  >
                    <div className="w-10 h-10 rounded-[8px] bg-[#FFF3E8] text-[#F47721] flex items-center justify-center mb-3">
                      <Users className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-[15px] text-[#1F2937] group-hover:text-[#F47721] transition-colors">
                      User &amp; Member Management
                    </h3>
                    <p className="text-[12.5px] text-[#6B7280] mt-1">
                      Add new members, edit details, assign Operator/Viewer roles, deactivate or delete accounts.
                    </p>
                  </div>

                  <div
                    onClick={() => setActiveNav('security')}
                    className="p-5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] hover:border-[#F47721] cursor-pointer transition-colors shadow-xs group"
                  >
                    <div className="w-10 h-10 rounded-[8px] bg-[#FFF3E8] text-[#F47721] flex items-center justify-center mb-3">
                      <Lock className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-[15px] text-[#1F2937] group-hover:text-[#F47721] transition-colors">
                      Security &amp; MFA Controls
                    </h3>
                    <p className="text-[12.5px] text-[#6B7280] mt-1">
                      Configure multi-factor authentication, failed attempt lockouts, and administrator session policies.
                    </p>
                  </div>

                  <div
                    onClick={() => setActiveNav('company')}
                    className="p-5 bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] hover:border-[#F47721] cursor-pointer transition-colors shadow-xs group"
                  >
                    <div className="w-10 h-10 rounded-[8px] bg-[#FFF3E8] text-[#F47721] flex items-center justify-center mb-3">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-[15px] text-[#1F2937] group-hover:text-[#F47721] transition-colors">
                      Company Identity &amp; Branding
                    </h3>
                    <p className="text-[12.5px] text-[#6B7280] mt-1">
                      Manage organization legal details, official logo for payslips &amp; PDFs, and SMTP mail configuration.
                    </p>
                  </div>
                </div>

                {/* System Diagnostics */}
                <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-5 shadow-xs space-y-3">
                  <h3 className="text-[14px] font-bold text-[#1F2937] flex items-center gap-2">
                    <Server className="w-4 h-4 text-[#F47721]" />
                    <span>System Runtime Diagnostics</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-[12.5px]">
                    <div className="p-3 bg-[#F8F9FA] rounded-[7px] border border-[#E5E7EB]">
                      <div className="text-[#6B7280]">Backend Framework</div>
                      <div className="font-semibold text-[#1F2937] mt-0.5">.NET 10.0 LTS</div>
                    </div>
                    <div className="p-3 bg-[#F8F9FA] rounded-[7px] border border-[#E5E7EB]">
                      <div className="text-[#6B7280]">Database Engine</div>
                      <div className="font-semibold text-[#1F2937] mt-0.5">SQLite Relational</div>
                    </div>
                    <div className="p-3 bg-[#F8F9FA] rounded-[7px] border border-[#E5E7EB]">
                      <div className="text-[#6B7280]">PDF Engine</div>
                      <div className="font-semibold text-[#1F2937] mt-0.5">QuestPDF High-Resolution</div>
                    </div>
                    <div className="p-3 bg-[#F8F9FA] rounded-[7px] border border-[#E5E7EB]">
                      <div className="text-[#6B7280]">Database Connection</div>
                      <div className="font-semibold text-[#10B981] mt-0.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Connected</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. USERS */}
            {activeNav === 'users' && (
              <div className="space-y-4">
                <UserManagementView currentUser={currentUser} isAdmin={true} />
              </div>
            )}

            {/* 3. ROLES & PERMISSIONS */}
            {activeNav === 'roles' && (
              <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-6 shadow-xs">
                <div>
                  <h2 className="text-[20px] font-bold text-[#1F2937]">Roles &amp; Access Control (RBAC)</h2>
                  <p className="text-[13px] text-[#6B7280] mt-0.5">
                    Server-enforced role privileges separating administrative access from everyday payroll operations.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Administrator */}
                  <div className="border border-[#F47721]/30 rounded-[10px] p-5 bg-[#FFF8F3] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[16px] text-[#1F2937]">Administrator</span>
                      <span className="px-2 py-0.5 rounded bg-[#F47721] text-[#FFFFFF] font-bold text-[10.5px]">
                        Full System
                      </span>
                    </div>
                    <p className="text-[12.5px] text-[#6B7280]">
                      Only accessible via the Hidden Admin Gateway. Full system, security, user, and configuration access.
                    </p>
                    <ul className="text-[12px] space-y-1.5 text-[#1F2937] pt-2 border-t border-[#E5E7EB]">
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> Add, Edit, Deactivate, Delete Users
                      </li>
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> Security &amp; MFA Policies
                      </li>
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> Company Legal Profile &amp; Logo
                      </li>
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> Full Audit Log Administration
                      </li>
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> SMTP &amp; System Configuration
                      </li>
                    </ul>
                  </div>

                  {/* Accounts Operator */}
                  <div className="border border-[#E5E7EB] rounded-[10px] p-5 bg-[#FFFFFF] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[16px] text-[#1F2937]">Accounts Operator</span>
                      <span className="px-2 py-0.5 rounded bg-[#E5E7EB] text-[#1F2937] font-semibold text-[10.5px]">
                        Operations
                      </span>
                    </div>
                    <p className="text-[12.5px] text-[#6B7280]">
                      Standard operational account for payroll processing, data entry, and email delivery.
                    </p>
                    <ul className="text-[12px] space-y-1.5 text-[#1F2937] pt-2 border-t border-[#E5E7EB]">
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> Import Excel Payroll Sheets
                      </li>
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> Payslip Editor &amp; Calculation Overrides
                      </li>
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> Generate &amp; Download A4 PDFs
                      </li>
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> Email Payslips to Employees
                      </li>
                      <li className="flex items-center gap-1.5 text-[#EF4444]">
                        <X className="w-3.5 h-3.5" /> Cannot access Admin Console or Users
                      </li>
                    </ul>
                  </div>

                  {/* Viewer */}
                  <div className="border border-[#E5E7EB] rounded-[10px] p-5 bg-[#FFFFFF] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[16px] text-[#1F2937]">Viewer</span>
                      <span className="px-2 py-0.5 rounded bg-[#F3F4F6] text-[#6B7280] font-semibold text-[10.5px]">
                        Read Only
                      </span>
                    </div>
                    <p className="text-[12.5px] text-[#6B7280]">
                      Audit and review account with read-only view of dashboard and generated payslips.
                    </p>
                    <ul className="text-[12px] space-y-1.5 text-[#1F2937] pt-2 border-t border-[#E5E7EB]">
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> View Dashboard &amp; Summaries
                      </li>
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> View Employee Directory
                      </li>
                      <li className="flex items-center gap-1.5 text-[#10B981]">
                        <Check className="w-3.5 h-3.5" /> Preview Historical Payslips
                      </li>
                      <li className="flex items-center gap-1.5 text-[#EF4444]">
                        <X className="w-3.5 h-3.5" /> Cannot edit, delete, or import payroll
                      </li>
                      <li className="flex items-center gap-1.5 text-[#EF4444]">
                        <X className="w-3.5 h-3.5" /> Cannot access Administration
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* 4. COMPANY PROFILE & 7. EMAIL CONFIGURATION */}
            {(activeNav === 'company' || activeNav === 'email-config') && (
              <div className="space-y-4">
                <SettingsView
                  isAdmin={true}
                  onSettingsUpdated={loadConsoleData}
                  onActivePeriodUpdated={onActivePeriodUpdated}
                />
              </div>
            )}

            {/* 5. PAYROLL CONFIGURATION */}
            {activeNav === 'payroll-config' && (
              <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5 shadow-xs">
                <div>
                  <h2 className="text-[20px] font-bold text-[#1F2937]">Payroll Configuration &amp; Policies</h2>
                  <p className="text-[13px] text-[#6B7280] mt-0.5">
                    Define default institutional payroll behavior, active periods, and document retention rules.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
                  <div className="p-4 bg-[#F8F9FA] rounded-[8px] border border-[#E5E7EB] space-y-2">
                    <div className="font-semibold text-[#1F2937]">Active Period Management</div>
                    <p className="text-[12px] text-[#6B7280]">
                      Current Active Cycle: <strong>{systemStats.activePeriod}</strong>. Changing the active period updates default view filters across the entire organization.
                    </p>
                  </div>

                  <div className="p-4 bg-[#F8F9FA] rounded-[8px] border border-[#E5E7EB] space-y-2">
                    <div className="font-semibold text-[#1F2937]">Document Retention Policy</div>
                    <p className="text-[12px] text-[#6B7280]">
                      Default: <strong>1,095 days (3 years)</strong>. Generated payslip PDFs and import archives are retained with full audit provenance.
                    </p>
                  </div>

                  <div className="p-4 bg-[#F8F9FA] rounded-[8px] border border-[#E5E7EB] space-y-2">
                    <div className="font-semibold text-[#1F2937]">Currency &amp; Localization</div>
                    <p className="text-[12px] text-[#6B7280]">
                      Default Symbol: <strong>₹ (INR)</strong>. Net salary numbers are converted into standard Indian Numbering system words (Lakhs &amp; Crores).
                    </p>
                  </div>

                  <div className="p-4 bg-[#F8F9FA] rounded-[8px] border border-[#E5E7EB] space-y-2">
                    <div className="font-semibold text-[#1F2937]">Zero-Value Rows</div>
                    <p className="text-[12px] text-[#6B7280]">
                      Default: <strong>Hidden</strong>. Unused salary components are automatically suppressed unless explicitly overridden.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 6. SALARY COMPONENTS */}
            {activeNav === 'salary-components' && (
              <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5 shadow-xs">
                <div>
                  <h2 className="text-[20px] font-bold text-[#1F2937]">Salary Component Architecture</h2>
                  <p className="text-[13px] text-[#6B7280] mt-0.5">
                    Master list of recognized institutional earnings and deductions components.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="border border-[#E5E7EB] rounded-[8px] p-4 space-y-2">
                    <div className="font-bold text-[14px] text-[#F47721] flex items-center gap-1.5 border-b border-[#E5E7EB] pb-2">
                      <Layers className="w-4 h-4" />
                      <span>Earnings &amp; Allowances</span>
                    </div>
                    <ul className="text-[12.5px] space-y-1.5 text-[#1F2937]">
                      <li className="flex justify-between py-1 border-b border-[#F3F4F6]">
                        <span className="font-medium">Basic Salary</span>
                        <span className="text-[#6B7280]">Core Earning</span>
                      </li>
                      <li className="flex justify-between py-1 border-b border-[#F3F4F6]">
                        <span className="font-medium">HRA</span>
                        <span className="text-[#6B7280]">House Rent Allowance</span>
                      </li>
                      <li className="flex justify-between py-1 border-b border-[#F3F4F6]">
                        <span className="font-medium">Medical Allowance</span>
                        <span className="text-[#6B7280]">Statutory Allowance</span>
                      </li>
                      <li className="flex justify-between py-1 border-b border-[#F3F4F6]">
                        <span className="font-medium">Food Allowance</span>
                        <span className="text-[#6B7280]">Standard Allowance</span>
                      </li>
                      <li className="flex justify-between py-1 border-b border-[#F3F4F6]">
                        <span className="font-medium">Conveyance Allowance</span>
                        <span className="text-[#6B7280]">Travel Allowance</span>
                      </li>
                      <li className="flex justify-between py-1 border-b border-[#F3F4F6]">
                        <span className="font-medium">Special Allowance</span>
                        <span className="text-[#6B7280]">Variable Allowance</span>
                      </li>
                      <li className="flex justify-between py-1">
                        <span className="font-medium">Overtime</span>
                        <span className="text-[#6B7280]">Supplemental Earning</span>
                      </li>
                    </ul>
                  </div>

                  <div className="border border-[#E5E7EB] rounded-[8px] p-4 space-y-2">
                    <div className="font-bold text-[14px] text-[#F47721] flex items-center gap-1.5 border-b border-[#E5E7EB] pb-2">
                      <Layers className="w-4 h-4" />
                      <span>Deductions &amp; Recoveries</span>
                    </div>
                    <ul className="text-[12.5px] space-y-1.5 text-[#1F2937]">
                      <li className="flex justify-between py-1 border-b border-[#F3F4F6]">
                        <span className="font-medium">PF (Provident Fund)</span>
                        <span className="text-[#6B7280]">Statutory Deduction</span>
                      </li>
                      <li className="flex justify-between py-1 border-b border-[#F3F4F6]">
                        <span className="font-medium">ESI</span>
                        <span className="text-[#6B7280]">Employee State Insurance</span>
                      </li>
                      <li className="flex justify-between py-1 border-b border-[#F3F4F6]">
                        <span className="font-medium">Professional Tax</span>
                        <span className="text-[#6B7280]">State Tax</span>
                      </li>
                      <li className="flex justify-between py-1">
                        <span className="font-medium">Loan Deduction</span>
                        <span className="text-[#6B7280]">Recovery</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* 8. TEMPLATE CONFIGURATION */}
            {activeNav === 'templates' && (
              <div className="space-y-4">
                <PayslipTemplatesView canEdit={true} />
              </div>
            )}

            {/* 9. SECURITY & MFA */}
            {activeNav === 'security' && (
              <SecurityMfaView />
            )}

            {/* 10. AUDIT LOGS */}
            {activeNav === 'audit' && (
              <div className="space-y-4">
                <AuditLogView />
              </div>
            )}

            {/* 11. SYSTEM SETTINGS */}
            {activeNav === 'system' && (
              <div className="space-y-6">
                {/* System Infrastructure Status */}
                <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5 shadow-xs">
                  <div>
                    <h2 className="text-[20px] font-bold text-[#1F2937]">System &amp; Server Infrastructure</h2>
                    <p className="text-[13px] text-[#6B7280] mt-0.5">
                      Underlying engine status, database schema integrity, and storage configuration.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
                    <div className="p-4 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[8px]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-[#1F2937]">App Architecture</div>
                        <span className="px-2 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] font-bold text-[11px]">
                          Operational
                        </span>
                      </div>
                      <div className="text-[12px] text-[#6B7280]">
                        FINORA Desktop Client &amp; .NET 10 LTS Core Engine
                      </div>
                    </div>

                    <div className="p-4 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[8px]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-[#1F2937]">Database Engine</div>
                        <span className="px-2 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] font-bold text-[11px]">
                          {storageInfo?.databaseType?.includes('SQLite') ? 'SQLite Embedded' : 'PostgreSQL Server'}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#6B7280]">
                        {storageInfo?.databaseSizeFormatted ? `Database Size: ${storageInfo.databaseSizeFormatted}` : 'Entity Framework Core 10'}
                      </div>
                    </div>

                    <div className="p-4 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[8px]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-[#1F2937]">Payroll Records</div>
                        <span className="px-2 py-0.5 rounded bg-[#F47721]/15 text-[#F47721] font-bold text-[11px]">
                          {storageInfo?.totalPayrollRecords ?? 0} Stored
                        </span>
                      </div>
                      <div className="text-[12px] text-[#6B7280]">
                        {storageInfo?.totalEmployees ?? 0} Active Employees in directory
                      </div>
                    </div>
                  </div>
                </div>

                {/* Controlled Application Data Storage */}
                <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-[#F47721]" />
                    <div>
                      <h2 className="text-[18px] font-bold text-[#1F2937]">Application Data Storage</h2>
                      <p className="text-[12.5px] text-[#6B7280]">
                        Protected persistent data locations separate from the program directory to ensure application updates never overwrite payroll records.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12.5px]">
                    <div className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[7px]">
                      <div className="text-[#6B7280] font-medium text-[11px] uppercase tracking-wider mb-1">
                        Application Base Storage (%LOCALAPPDATA%\FINORA)
                      </div>
                      <div className="font-mono text-[#1F2937] text-[12px] break-all bg-white px-2 py-1 rounded border border-[#E5E7EB]">
                        {storageInfo?.baseDirectory || '%LOCALAPPDATA%\\FINORA'}
                      </div>
                    </div>

                    <div className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[7px]">
                      <div className="text-[#6B7280] font-medium text-[11px] uppercase tracking-wider mb-1">
                        Relational Database File
                      </div>
                      <div className="font-mono text-[#1F2937] text-[12px] break-all bg-white px-2 py-1 rounded border border-[#E5E7EB]">
                        {storageInfo?.databaseFile || '%LOCALAPPDATA%\\FINORA\\Data\\finora.db'}
                      </div>
                    </div>

                    <div className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[7px]">
                      <div className="text-[#6B7280] font-medium text-[11px] uppercase tracking-wider mb-1">
                        Generated Documents &amp; Payslips
                      </div>
                      <div className="font-mono text-[#1F2937] text-[12px] break-all bg-white px-2 py-1 rounded border border-[#E5E7EB]">
                        {storageInfo?.documentsDirectory || '%LOCALAPPDATA%\\FINORA\\Documents'}
                      </div>
                    </div>

                    <div className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[7px]">
                      <div className="text-[#6B7280] font-medium text-[11px] uppercase tracking-wider mb-1">
                        System Snapshots &amp; Backups
                      </div>
                      <div className="font-mono text-[#1F2937] text-[12px] break-all bg-white px-2 py-1 rounded border border-[#E5E7EB]">
                        {storageInfo?.backupsDirectory || '%LOCALAPPDATA%\\FINORA\\Backups'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Backup & Recovery Management */}
                <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-4 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Archive className="w-5 h-5 text-[#F47721]" />
                      <div>
                        <h2 className="text-[18px] font-bold text-[#1F2937]">Backup &amp; Recovery</h2>
                        <p className="text-[12.5px] text-[#6B7280]">
                          Create instant snapshot backups of database, templates, and company configuration, or restore from a previous archive.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleCreateBackup}
                      disabled={backupLoading}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#F47721] hover:bg-[#E06612] text-white text-[13px] font-semibold rounded-[8px] transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {backupLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <Archive className="w-4 h-4" />
                          <span>Create System Backup</span>
                        </>
                      )}
                    </button>
                  </div>

                  {backups.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-[#E5E7EB] rounded-[8px] bg-[#FAFAFA]">
                      <Archive className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
                      <p className="text-[13px] font-medium text-[#4B5563]">No backup archives created yet</p>
                      <p className="text-[11.5px] text-[#9CA3AF] mt-0.5">
                        Click "Create System Backup" above to generate a complete snapshot archive.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-[#E5E7EB] rounded-[8px]">
                      <table className="w-full text-left text-[13px]">
                        <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-[#4B5563] font-semibold text-[12px]">
                          <tr>
                            <th className="py-2.5 px-3">Archive File</th>
                            <th className="py-2.5 px-3">Size</th>
                            <th className="py-2.5 px-3">Created Date (UTC)</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB]">
                          {backups.map((b) => (
                            <tr key={b.fileName} className="hover:bg-[#F9FAFB]/75 transition-colors">
                              <td className="py-2.5 px-3 font-mono text-[12px] text-[#1F2937]">
                                <div className="flex items-center gap-1.5">
                                  <FileText className="w-4 h-4 text-[#F47721]" />
                                  <span>{b.fileName}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-[#4B5563] text-[12px]">{b.sizeFormatted}</td>
                              <td className="py-2.5 px-3 text-[#6B7280] text-[12px]">
                                {new Date(b.createdAtUtc).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  onClick={() => setRestoreConfirmModal({ open: true, fileName: b.fileName })}
                                  disabled={backupLoading}
                                  className="px-2.5 py-1 text-[11.5px] font-semibold text-[#B91C1C] hover:bg-[#FEE2E2] rounded transition-colors cursor-pointer"
                                >
                                  Restore Snapshot
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Safety Restore Confirmation Modal */}
                {restoreConfirmModal.open && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-[12px] shadow-xl max-w-md w-full p-6 border border-[#E5E7EB] space-y-4">
                      <div className="flex items-center gap-3 text-[#B91C1C]">
                        <AlertTriangle className="w-7 h-7 shrink-0" />
                        <div>
                          <h3 className="text-[17px] font-bold text-[#1F2937]">Confirm Database Restoration</h3>
                          <p className="text-[12px] text-[#6B7280]">High-integrity operation</p>
                        </div>
                      </div>

                      <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-[8px] text-[12.5px] text-[#991B1B]">
                        Are you sure you want to restore the system database from:
                        <div className="font-mono font-bold mt-1 text-[#7F1D1D] break-all">
                          {restoreConfirmModal.fileName}
                        </div>
                        <div className="mt-2 text-[11.5px] text-[#B91C1C]">
                          A safety pre-restore backup of the current database will automatically be preserved in the Backups directory before this snapshot is applied.
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => setRestoreConfirmModal({ open: false, fileName: '' })}
                          disabled={backupLoading}
                          className="px-3.5 py-1.5 text-[12.5px] font-medium text-[#4B5563] hover:bg-[#F3F4F6] rounded-[7px] transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleRestoreBackup(restoreConfirmModal.fileName)}
                          disabled={backupLoading}
                          className="px-4 py-1.5 text-[12.5px] font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-[7px] transition-colors shadow-xs"
                        >
                          {backupLoading ? 'Restoring...' : 'Confirm & Restore'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
