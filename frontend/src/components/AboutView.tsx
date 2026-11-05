import React, { useState, useEffect } from 'react';
import {
  Shield,
  Layers,
  Sparkles,
  History,
  FileText,
  CheckCircle2,
  Calendar,
  RefreshCw,
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  FileEdit,
  LayoutTemplate,
  Mail,
  FileBarChart2,
  ClipboardList,
  Settings,
  ArrowRight,
  Check,
  AlertCircle
} from 'lucide-react';
import { apiRequest } from '../services/api';
import type { UpdateStatus, ReleaseHistoryItem } from '../types/payroll';

interface AboutViewProps {
  onNavigateToSettings?: () => void;
}

export const AboutView: React.FC<AboutViewProps> = ({ onNavigateToSettings }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'whats-new' | 'history' | 'license'>('overview');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [history, setHistory] = useState<ReleaseHistoryItem[]>([]);

  // Check for updates state within About page
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ message: string; isError?: boolean } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statusRes, historyRes] = await Promise.allSettled([
        apiRequest<UpdateStatus>('/api/updates/status'),
        apiRequest<ReleaseHistoryItem[]>('/api/updates/history'),
      ]);

      if (statusRes.status === 'fulfilled') setUpdateStatus(statusRes.value);
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value);
    } catch {
      // Fallback defaults
    }
  };

  const handleManualCheck = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      // Check via Electron updater first if available
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.updater?.check) {
        const res = await electronAPI.updater.check();
        if (res.isOffline) {
          setCheckResult({
            message: 'Unable to check for updates. Please check your internet connection and try again.',
            isError: true
          });
          return;
        }
      }

      // Check via backend API
      const res = await apiRequest<any>('/api/updates/check', { method: 'POST' });
      if (res.isOffline) {
        setCheckResult({
          message: res.message || 'Unable to check for updates. Please check your internet connection and try again.',
          isError: true
        });
      } else if (res.isUpdateAvailable) {
        setCheckResult({
          message: `A new update is available: v${res.latestVersion}!`,
          isError: false
        });
      } else {
        setCheckResult({
          message: `FINORA is up to date. You are running the latest version (v${res.currentVersion || updateStatus?.currentVersion || '1.0.1'}).`,
          isError: false
        });
      }
    } catch {
      setCheckResult({
        message: 'Unable to check for updates. Please check your internet connection and try again.',
        isError: true
      });
    } finally {
      setChecking(false);
    }
  };

  const modules = [
    { name: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4 text-[#F47721]" />, desc: 'Executive KPI metrics, active period summaries, and salary distribution analytics.' },
    { name: 'Employee Directory', icon: <Users className="w-4 h-4 text-[#F47721]" />, desc: 'Central personnel directory, bank coordinates, and standard salary component baselines.' },
    { name: 'Excel Import', icon: <FileSpreadsheet className="w-4 h-4 text-[#F47721]" />, desc: 'Flexible spreadsheet column mapping engine with instant multi-row mathematical validation.' },
    { name: 'Monthly Payroll', icon: <Calendar className="w-4 h-4 text-[#F47721]" />, desc: 'Comprehensive period lifecycle manager, automated batch recalculations, and period locking.' },
    { name: 'Payslip Editor', icon: <FileEdit className="w-4 h-4 text-[#F47721]" />, desc: 'Interactive A4 WYSIWYG editor with live preview, real-time formula audits, and dual table modes.' },
    { name: 'Payslip Templates', icon: <LayoutTemplate className="w-4 h-4 text-[#F47721]" />, desc: 'Customizable institutional layout themes, split header alignments, and custom tables.' },
    { name: 'Email Management', icon: <Mail className="w-4 h-4 text-[#F47721]" />, desc: 'Authenticated SMTP and Gmail batch dispatcher with live delivery audit receipts.' },
    { name: 'Reports & Exports', icon: <FileBarChart2 className="w-4 h-4 text-[#F47721]" />, desc: 'Bank transfer disbursement schedules, department variance reports, and Excel/CSV/PDF exports.' },
    { name: 'User Management', icon: <Shield className="w-4 h-4 text-[#F47721]" />, desc: 'Granular enterprise role-based governance for Administrators, Accounts Operators, and Viewers.' },
    { name: 'Audit Log', icon: <ClipboardList className="w-4 h-4 text-[#F47721]" />, desc: 'Cryptographically ordered, tamper-evident operational trail tracking all system activities.' },
    { name: 'Settings', icon: <Settings className="w-4 h-4 text-[#F47721]" />, desc: 'Organizational identity, currency symbols, email security vault, and software update policies.' },
  ];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto text-[#1F2937]">
      {/* Top Hero Card / Product Identity */}
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] px-6 pt-5 pb-0 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          <div className="space-y-1.5">
            <div className="relative inline-flex items-center select-none overflow-hidden max-w-[230px]">
              <img
                src="/splash_logo.png"
                alt="FINORA — Finance &amp; Payroll Management System"
                className="w-full max-w-[230px] h-auto object-contain block relative z-[1]"
              />
              {/* Continuous Silky Orange Light Sweep Overlay */}
              <div
                className="absolute inset-0 pointer-events-none z-[2] overflow-hidden"
                style={{
                  WebkitMaskImage: 'url(/splash_logo.png)',
                  WebkitMaskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'left center',
                  maskImage: 'url(/splash_logo.png)',
                  maskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  maskPosition: 'left center',
                }}
                aria-hidden="true"
              >
                <div className="logo-sweep-beam-login" />
              </div>
            </div>
            <p className="text-[12px] text-[#6B7280] font-['Figtree'] leading-relaxed max-w-[540px]">
              Institutional desktop platform for end-to-end payroll administration and payslip compliance.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 sm:self-center">
            <button
              type="button"
              onClick={handleManualCheck}
              disabled={checking}
              className="px-3.5 py-1.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#F47721] hover:text-[#F47721] text-[#1F2937] text-[12px] font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#F47721] ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? 'Checking for Updates...' : 'Check for Updates'}</span>
            </button>
            {onNavigateToSettings && (
              <button
                type="button"
                onClick={onNavigateToSettings}
                className="px-3.5 py-1.5 rounded-[7px] bg-[#F47721] hover:bg-[#E06612] text-[#FFFFFF] text-[12px] font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <span>Update Settings</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {checkResult && (
          <div className={`mb-3 p-2.5 rounded-[7px] text-[12px] font-medium flex items-center gap-2 ${
            checkResult.isError
              ? 'bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B]'
              : 'bg-[#FFF3E8] border border-[#F47721]/30 text-[#1F2937]'
          }`}>
            {checkResult.isError ? (
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#F47721] shrink-0" />
            )}
            <span>{checkResult.message}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-[#E5E7EB] -mb-[1px]">
          {[
            { key: 'overview', label: 'Overview', icon: <Layers className="w-4 h-4" /> },
            { key: 'whats-new', label: "What's New", icon: <Sparkles className="w-4 h-4" /> },
            { key: 'history', label: 'Update History', icon: <History className="w-4 h-4" /> },
            { key: 'license', label: 'License & Credits', icon: <FileText className="w-4 h-4" /> },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold transition-colors border-b-2 -mb-[1px] ${
                  active
                    ? 'border-[#F47721] text-[#F47721]'
                    : 'border-transparent text-[#6B7280] hover:text-[#1F2937]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ====================================================================
          TAB 1: OVERVIEW
      ==================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* About Narrative Card */}
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 space-y-5 shadow-sm">
            <div>
              <h2 className="text-[16px] font-semibold text-[#1F2937]">About the Software</h2>
              <p className="text-[13px] text-[#4B5563] leading-relaxed mt-2">
                <strong>FINORA</strong> is an institutional finance and payroll management desktop application engineered to streamline employee administration, monthly payroll processing, payslip generation, and fiscal reporting through a unified, high-security desktop platform. Built with dedicated dual-layout payslip engines and offline-first database clustering, FINORA guarantees continuous operation, cryptographic data integrity, and complete compliance.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4 border-t border-[#F3F4F6]">
              <div>
                <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">Application Version</div>
                <div className="text-[15px] font-bold text-[#1F2937] mt-1 font-mono">v{updateStatus?.currentVersion || '1.0.1'}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">Target Platform</div>
                <div className="text-[15px] font-bold text-[#1F2937] mt-1">Windows 64-bit</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">Update Channel</div>
                <div className="text-[15px] font-bold text-[#F47721] mt-1">Stable Production</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">Software License</div>
                <div className="text-[15px] font-bold text-[#1F2937] mt-1">Enterprise Standalone</div>
              </div>
            </div>
          </div>

          {/* Included Software Modules */}
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[#1F2937]">Included Software Modules</h2>
              <p className="text-[12.5px] text-[#6B7280] mt-0.5">
                FINORA provides an integrated suite of institutional modules for finance and payroll management:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5 pt-1">
              {modules.map((m) => (
                <div key={m.name} className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-[13.5px] text-[#1F2937]">
                    <span className="text-[#F47721] shrink-0">{m.icon}</span>
                    <span>{m.name}</span>
                  </div>
                  <p className="text-[12px] text-[#6B7280] leading-relaxed pl-6">
                    {m.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Developer Attribution Card */}
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Product Engineering &amp; Design
              </div>
              <div className="text-[16px] font-bold text-[#1F2937] mt-0.5 font-['Figtree']">
                Designed &amp; Developed by <span className="text-[#F47721]">Joshua Godson</span>
              </div>
              <div className="text-[12px] text-[#6B7280] mt-0.5">
                Product development and software engineering
              </div>
            </div>
            <div className="text-[11.5px] text-[#9CA3AF] text-right font-mono">
              FINORA · Build 2026.11.04-prod
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 2: WHAT'S NEW
      ==================================================================== */}
      {activeTab === 'whats-new' && (
        <div className="space-y-6">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div>
                <div className="text-[12px] font-bold text-[#F47721] tracking-wider uppercase">
                  Version 1.0.1
                </div>
                <h2 className="text-[18px] font-bold text-[#1F2937] mt-1">Feature &amp; UI/UX Quality Update</h2>
                <div className="text-[12px] text-[#6B7280]">Released on November 5, 2026</div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-[14px] font-bold text-[#1F2937] flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
                  New Features
                </h3>
                <ul className="space-y-2 text-[12.5px] text-[#4B5563] pl-4 list-disc">
                  <li><strong>Institutional A4 Payslip Engine:</strong> Real-time WYSIWYG rendering supporting dual layout modes: <em>Side-by-Side (Earnings Left, Deductions Right)</em> and <em>Stacked (Earnings Top, Deductions Bottom)</em>.</li>
                  <li><strong>Dynamic Additional Tables System:</strong> Add institutional sections including Attendance Summary, Leave Balances, CTC Breakdown, Loans &amp; Advances, and Custom Blank Tables with automatic column and row sizing.</li>
                  <li><strong>Enterprise Excel Importer:</strong> High-speed mapping of multi-column payroll spreadsheets with live mathematical discrepancy checks and batch validation.</li>
                  <li><strong>Authenticated Gmail &amp; SMTP Dispatcher:</strong> Direct secure email delivery with personalized HTML email templates, automatic PDF attachment, and delivery audit receipts.</li>
                  <li><strong>Software Update Engine:</strong> Cryptographic SHA-256 update verification with zero-data-loss user data preservation and automated restart.</li>
                </ul>
              </div>

              <div className="pt-2">
                <h3 className="text-[14px] font-bold text-[#1F2937] flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#3B82F6]"></span>
                  Improvements &amp; Enhancements
                </h3>
                <ul className="space-y-2 text-[12.5px] text-[#4B5563] pl-4 list-disc">
                  <li><strong>Auto-Balancing Split Header:</strong> Automatic alignment of company logo (left) and official contact metadata (right) for official documents.</li>
                  <li><strong>High-DPI Desktop Polish:</strong> High-resolution vector icons, crisp typography in Figtree, and a white startup splash screen with dynamic versioning.</li>
                  <li><strong>Data Isolation Guarantee:</strong> Application binaries and user database storage reside in separated locations, ensuring seamless application updates without touching payroll data.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 4: UPDATE HISTORY
      ==================================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 shadow-sm">
            <h2 className="text-[16px] font-semibold text-[#1F2937] mb-1">Release History</h2>
            <p className="text-[12.5px] text-[#6B7280] mb-5">
              Chronological log of verified releases and feature milestones for FINORA.
            </p>

            <div className="space-y-4 divide-y divide-[#E5E7EB]">
              {history.map((rel) => (
                <div
                  key={rel.version}
                  className="pt-4 first:pt-0 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px] font-bold font-mono text-[#1F2937]">v{rel.version}</span>
                      <span className="text-[12.5px] font-semibold text-[#059669]">· {rel.releaseType}</span>
                      {rel.isCurrent && (
                        <span className="text-[12.5px] font-semibold text-[#F47721]">· Current Installed Version</span>
                      )}
                    </div>
                    <span className="text-[12px] text-[#6B7280]">{rel.releaseDate}</span>
                  </div>

                  <p className="text-[13px] text-[#4B5563]">{rel.summary}</p>

                  {rel.newFeatures && rel.newFeatures.length > 0 && (
                    <div>
                      <div className="text-[11.5px] font-bold uppercase tracking-wider text-[#1F2937] mb-1.5">
                        Features &amp; Highlights:
                      </div>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[12px] text-[#4B5563]">
                        {rel.newFeatures.map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 5: LICENSE & CREDITS
      ==================================================================== */}
      {activeTab === 'license' && (
        <div className="space-y-6">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 shadow-sm space-y-4">
            <h2 className="text-[16px] font-semibold text-[#1F2937]">Software License Agreement</h2>
            <div className="text-[12.5px] text-[#4B5563] space-y-2 leading-relaxed">
              <p>
                <strong>FINORA — Finance &amp; Payroll Management System</strong> is proprietary institutional software.
              </p>
              <p>
                Copyright &copy; 2026 FINORA. All rights reserved.
              </p>
              <p>
                Permission is hereby granted to authorized organizational operators and institutional departments to run and operate the application on internal computing infrastructure in accordance with organizational policies.
              </p>
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Engineering Attribution
              </div>
              <div className="text-[15px] font-bold text-[#1F2937] mt-0.5 font-['Figtree']">
                Designed &amp; Developed by <span className="text-[#F47721]">Joshua Godson</span>
              </div>
              <div className="text-[12px] text-[#6B7280] mt-0.5">
                Product development and software engineering
              </div>
            </div>
            <div className="text-[#F47721] font-bold font-mono text-[16px] tracking-wider">
              JG
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
