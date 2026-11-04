import React, { useState, useEffect } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  KeyRound,
  ArrowRight,
  ShieldAlert,
  ArrowLeft,
  UserCheck,
  Building,
  User,
} from 'lucide-react';
import { apiRequest, setStoredSession } from '../services/api';
import type { UserProfile } from '../types/payroll';

interface LoginViewProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  // First-Time Customer Setup State
  const [isFirstRunSetup, setIsFirstRunSetup] = useState(false);
  const [setupOrgName, setSetupOrgName] = useState('');
  const [setupFullName, setSetupFullName] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupUsername, setSetupUsername] = useState('admin');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');

  // Mode: 'normal' (Operator/Viewer) vs 'admin-gateway' (Protected Administrator Access)
  const [isAdminGateway, setIsAdminGateway] = useState(false);

  // Normal Login Credentials (Operator & Viewer ONLY) - Clean Empty Production Defaults
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRoleType, setSelectedRoleType] = useState<'operator' | 'viewer'>('operator');

  // Admin Gateway Credentials - Clean Empty Production Defaults
  const [adminId, setAdminId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminMfaCode, setAdminMfaCode] = useState('');

  // UI & Loading States
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Forgot Password Workflow
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');

  // Check whether the installation requires first-time Administrator onboarding
  useEffect(() => {
    apiRequest<{ isSetupRequired: boolean }>('/api/auth/setup-status')
      .then((res) => {
        if (res?.isSetupRequired) {
          setIsFirstRunSetup(true);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for Hidden Admin Gateway Shortcut: Ctrl + Shift + Alt + A
  // and Direct Protected Route: /secure-admin-access or #/secure-admin-access or ?gateway=admin
  useEffect(() => {
    const checkAdminRoute = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      const search = window.location.search.toLowerCase();
      if (
        path.includes('secure-admin-access') ||
        hash.includes('secure-admin-access') ||
        hash.includes('admin-gateway') ||
        search.includes('secure-admin-access') ||
        search.includes('gateway=admin')
      ) {
        setIsAdminGateway(true);
      }
    };

    checkAdminRoute();
    window.addEventListener('popstate', checkAdminRoute);
    window.addEventListener('hashchange', checkAdminRoute);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl + Shift + Alt + A (case-insensitive A)
      const isA = e.key === 'a' || e.key === 'A' || e.code === 'KeyA';
      const hasModifiers = (e.ctrlKey || e.metaKey) && e.shiftKey && e.altKey;

      if (hasModifiers && isA) {
        e.preventDefault();
        setError(null);
        setInfoMessage(null);
        setIsAdminGateway((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('popstate', checkAdminRoute);
      window.removeEventListener('hashchange', checkAdminRoute);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Standard Login for Normal Roles (Operator / Viewer)
  const handleNormalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<any>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          usernameOrEmail: usernameOrEmail.trim(),
          password,
        }),
      });

      setStoredSession(res.token, res.user);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Sign-in failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Dedicated Admin Gateway Login
  const handleAdminGatewayLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<any>('/api/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify({
          administratorId: adminId.trim(),
          password: adminPassword.trim(),
          mfaCode: adminMfaCode.trim() ? adminMfaCode.trim() : undefined,
        }),
      });

      if (res.mfaRequired && !res.token) {
        setInfoMessage(res.message || 'Multi-Factor Authentication code is required.');
        setLoading(false);
        return;
      }

      setStoredSession(res.token, { ...res.user, isAdminSession: true });
      onLoginSuccess({ ...res.user, isAdminSession: true });
    } catch (err: any) {
      // Never enumerate: show generic error
      setError(err.message || 'Invalid administrator credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      if (resetStep === 'request') {
        const res = await apiRequest<any>('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: resetEmail.trim() }),
        });
        setInfoMessage(res.message);
        if (res.sandboxResetToken) {
          setResetToken(res.sandboxResetToken);
        }
        setResetStep('confirm');
      } else {
        const res = await apiRequest<any>('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            email: resetEmail.trim(),
            resetToken: resetToken.trim(),
            newPassword,
          }),
        });
        setInfoMessage(res.message);
        setForgotMode(false);
        setResetStep('request');
      }
    } catch (err: any) {
      setError(err.message || 'Password reset request failed.');
    } finally {
      setLoading(false);
    }
  };

  const fillNormalRole = (role: 'operator' | 'viewer') => {
    setError(null);
    setSelectedRoleType(role);
  };

  const handleInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupPassword !== setupConfirmPassword) {
      setError('Passwords do not match. Please verify and try again.');
      return;
    }
    if (setupPassword.length < 8) {
      setError('Administrator password must be at least 8 characters long.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<any>('/api/auth/setup-admin', {
        method: 'POST',
        body: JSON.stringify({
          fullName: setupFullName.trim(),
          email: setupEmail.trim(),
          username: setupUsername.trim(),
          password: setupPassword.trim(),
          companyName: setupOrgName.trim() || undefined,
        }),
      });
      if (res.token) {
        setStoredSession(res.token, res.user);
        onLoginSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Workspace initialization failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F9FA] px-4 py-8 sm:py-12">
      <div className="w-full max-w-[440px] bg-[#FFFFFF] border border-[#E5E7EB] rounded-[12px] p-6 sm:p-8 shadow-[0_6px_28px_rgba(31,41,55,0.06)]">
        {/* ====================================================================
            GATEWAY 0: FIRST-TIME INSTALLATION & INITIAL SETUP WIZARD
        ==================================================================== */}
        {isFirstRunSetup && (
          <div>
            <div className="flex flex-col items-center justify-center pb-5 mb-5 border-b border-[#E5E7EB]">
              <div className="relative inline-flex items-center justify-center select-none overflow-hidden max-w-[200px]">
                <img
                  src="/splash_logo.png"
                  alt="FINORA — Finance &amp; Payroll Management System"
                  className="w-full max-w-[200px] h-auto object-contain block relative z-[1]"
                />
                <div
                  className="absolute inset-0 pointer-events-none z-[2] overflow-hidden"
                  style={{
                    WebkitMaskImage: 'url(/splash_logo.png)',
                    WebkitMaskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskImage: 'url(/splash_logo.png)',
                    maskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                  }}
                  aria-hidden="true"
                >
                  <div className="logo-sweep-beam-login" />
                </div>
              </div>
            </div>

            <div className="mb-4">
              <h2 className="text-[17px] font-bold text-[#1F2937]">Welcome to FINORA</h2>
              <p className="text-[12.5px] text-[#6B7280] mt-1 leading-relaxed">
                Create your primary System Administrator account to initialize your institutional payroll workspace.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-[8px] bg-[#FEF2F2] border border-[#EF4444]/40 text-[12.5px] text-[#991B1B] font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleInitialSetup} className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-medium text-[#1F2937] mb-1">
                  Organization / Company Name
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={setupOrgName}
                    onChange={(e) => setSetupOrgName(e.target.value)}
                    placeholder="e.g. Acme Corporation"
                    className="w-full pl-10 pr-3.5 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#1F2937] mb-1">
                  Administrator Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={setupFullName}
                    onChange={(e) => setSetupFullName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="w-full pl-10 pr-3.5 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#1F2937] mb-1">
                    Work Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={setupEmail}
                      onChange={(e) => setSetupEmail(e.target.value)}
                      placeholder="admin@company.com"
                      className="w-full pl-10 pr-3.5 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#1F2937] mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    value={setupUsername}
                    onChange={(e) => setSetupUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full px-3.5 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#1F2937] mb-1">
                  Password (min 8 chars)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="Create strong password"
                    className="w-full pl-10 pr-10 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#1F2937]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#1F2937] mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={setupConfirmPassword}
                    onChange={(e) => setSetupConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-10 pr-3.5 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 rounded-[7px] bg-[#F47721] hover:bg-[#E06612] text-[#FFFFFF] font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-colors disabled:opacity-60 shadow-xs cursor-pointer"
              >
                <span>{loading ? 'Initializing Workspace...' : 'Initialize FINORA Workspace'}</span>
                <ArrowRight className="w-4 h-4 text-[#FFFFFF]" />
              </button>
            </form>
          </div>
        )}

        {/* ====================================================================
            GATEWAY 1: NORMAL LOGIN EXPERIENCE (Operator / Viewer Only)
        ==================================================================== */}
        {!isFirstRunSetup && !isAdminGateway && !forgotMode && (
          <>
            {/* Top Corporate Branding: Official Animated FINORA Splash Logo */}
            <div className="flex flex-col items-center justify-center pb-5 mb-5 border-b border-[#E5E7EB]">
              <div className="relative inline-flex items-center justify-center select-none overflow-hidden max-w-[200px]">
                <img
                  src="/splash_logo.png"
                  alt="FINORA — Finance &amp; Payroll Management System"
                  className="w-full max-w-[200px] h-auto object-contain block relative z-[1]"
                />
                {/* Continuous Orange Light Sweep Overlay (1s sweep, 1s pause) */}
                <div
                  className="absolute inset-0 pointer-events-none z-[2] overflow-hidden"
                  style={{
                    WebkitMaskImage: 'url(/splash_logo.png)',
                    WebkitMaskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskImage: 'url(/splash_logo.png)',
                    maskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                  }}
                  aria-hidden="true"
                >
                  <div className="logo-sweep-beam-login" />
                </div>
              </div>
            </div>

            {/* Role Selection Tabs for Everyday Users */}
            <div className="mb-5 space-y-1.5">
              <label className="block text-[11.5px] font-bold text-[#6B7280] uppercase tracking-wider">
                Sign in as
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => fillNormalRole('operator')}
                  className={`py-2 px-3 rounded-[7px] text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    selectedRoleType === 'operator'
                      ? 'border border-[#F47721] text-[#F47721] bg-[#FFFFFF] shadow-2xs'
                      : 'border border-[#E5E7EB] text-[#6B7280] bg-[#FFFFFF] hover:border-[#D1D5DB] hover:text-[#1F2937]'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Operator</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillNormalRole('viewer')}
                  className={`py-2 px-3 rounded-[7px] text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    selectedRoleType === 'viewer'
                      ? 'border border-[#F47721] text-[#F47721] bg-[#FFFFFF] shadow-2xs'
                      : 'border border-[#E5E7EB] text-[#6B7280] bg-[#FFFFFF] hover:border-[#D1D5DB] hover:text-[#1F2937]'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Viewer</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-[8px] bg-[#FFF3E8] border border-[#F47721]/40 text-[12.5px] text-[#1F2937] font-medium">
                {error}
              </div>
            )}

            {infoMessage && (
              <div className="mb-4 p-3 rounded-[8px] bg-[#FFF8F3] border border-[#E5E7EB] text-[12.5px] text-[#1F2937]">
                {infoMessage}
              </div>
            )}

            {/* Normal Sign-In Form */}
            <form onSubmit={handleNormalLogin} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
                  Email or Username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    placeholder="name@organization.org"
                    className="w-full pl-10 pr-3.5 py-2 text-[13.5px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[12px] font-medium text-[#6B7280]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(true);
                      setResetEmail(usernameOrEmail.includes('@') ? usernameOrEmail : '');
                    }}
                    className="text-[12px] font-medium text-[#F47721] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter account password"
                    className="w-full pl-10 pr-10 py-2 text-[13.5px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#1F2937]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-[7px] bg-[#F47721] hover:bg-[#E06612] text-[#FFFFFF] font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-colors disabled:opacity-60 shadow-xs"
              >
                <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </>
        )}

        {/* ====================================================================
            GATEWAY 2: HIDDEN ADMINISTRATOR ACCESS GATEWAY
        ==================================================================== */}
        {isAdminGateway && !forgotMode && (
          <div className="space-y-5">
            {/* Admin Header with Animated Logo & Administrator Badge */}
            <div className="text-center pb-4 border-b border-[#E5E7EB]">
              <div className="flex justify-center mb-3">
                <div className="relative inline-flex items-center justify-center select-none overflow-hidden max-w-[190px]">
                  <img
                    src="/splash_logo.png"
                    alt="FINORA — Finance &amp; Payroll Management System"
                    className="w-full max-w-[190px] h-auto object-contain block relative z-[1]"
                  />
                  <div
                    className="absolute inset-0 pointer-events-none z-[2] overflow-hidden"
                    style={{
                      WebkitMaskImage: 'url(/splash_logo.png)',
                      WebkitMaskSize: 'contain',
                      WebkitMaskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskImage: 'url(/splash_logo.png)',
                      maskSize: 'contain',
                      maskRepeat: 'no-repeat',
                      maskPosition: 'center',
                    }}
                    aria-hidden="true"
                  >
                    <div className="logo-sweep-beam-login" />
                  </div>
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF3E8] border border-[#F47721]/30 text-[11px] font-bold text-[#F47721] tracking-wide uppercase">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Administrator Access</span>
              </div>
              <p className="text-[12px] text-[#6B7280] mt-1.5">
                Restricted system administration area
              </p>
            </div>

            {/* Security Notice */}
            <div className="p-2.5 rounded-[7px] bg-[#FFF8F3] border border-[#F47721]/30 text-[11.5px] text-[#6B7280] text-center leading-tight">
              Privileged gateway. All authentication attempts are verified, rate-limited, and recorded in the immutable audit log.
            </div>

            {error && (
              <div className="p-3 rounded-[8px] bg-[#FEF2F2] border border-[#EF4444]/40 text-[12.5px] text-[#991B1B] font-medium text-center">
                {error}
              </div>
            )}

            {infoMessage && (
              <div className="p-3 rounded-[8px] bg-[#FFF8F3] border border-[#E5E7EB] text-[12.5px] text-[#1F2937]">
                {infoMessage}
              </div>
            )}

            {/* Administrator Authentication Form */}
            <form onSubmit={handleAdminGatewayLogin} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#1F2937] mb-1.5">
                  Administrator ID
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value)}
                    placeholder="admin@organization.com or username"
                    className="w-full pl-10 pr-3.5 py-2 text-[13.5px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#1F2937] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter administrator password"
                    className="w-full pl-10 pr-10 py-2 text-[13.5px] border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#1F2937]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#1F2937] mb-1.5">
                  MFA / Authenticator Code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={adminMfaCode}
                    onChange={(e) => setAdminMfaCode(e.target.value)}
                    placeholder="Enter 6-digit code (if enabled)"
                    className="w-full pl-10 pr-3.5 py-2 text-[13.5px] font-mono tracking-wider border border-[#E5E7EB] rounded-[7px] bg-[#FFFFFF] text-[#1F2937] focus:border-[#F47721] focus:outline-hidden"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-[7px] bg-[#1F2937] hover:bg-[#111827] text-[#FFFFFF] font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-colors disabled:opacity-60 shadow-xs border border-[#1F2937]"
              >
                <span>{loading ? 'Authenticating...' : 'Secure Sign In'}</span>
                <ArrowRight className="w-4 h-4 text-[#F47721]" />
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setInfoMessage(null);
                    setIsAdminGateway(false);
                    if (window.location.hash.includes('secure-admin-access')) {
                      window.location.hash = '';
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#6B7280] hover:text-[#1F2937] transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Login</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ====================================================================
            FORGOT PASSWORD WORKFLOW
        ==================================================================== */}
        {forgotMode && (
          <div>
            <h2 className="text-[17px] font-semibold text-[#1F2937] mb-1">Reset Password</h2>
            <p className="text-[13px] text-[#6B7280] mb-4">
              Request a password reset token for your FINORA account.
            </p>

            {error && (
              <div className="mb-3 p-3 rounded-[7px] bg-[#FFF3E8] border border-[#F47721]/40 text-[12.5px] text-[#1F2937]">
                {error}
              </div>
            )}
            {infoMessage && (
              <div className="mb-3 p-3 rounded-[7px] bg-[#FFF8F3] border border-[#E5E7EB] text-[12.5px] text-[#1F2937]">
                {infoMessage}
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                  Account Email
                </label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                />
              </div>

              {resetStep === 'confirm' && (
                <>
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                      Reset Token
                    </label>
                    <input
                      type="text"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] font-mono border border-[#E5E7EB] rounded-[7px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#6B7280] mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 text-[13px] border border-[#E5E7EB] rounded-[7px]"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 px-4 rounded-[7px] bg-[#F47721] text-[#FFFFFF] font-semibold text-[13px] hover:bg-[#E06612]"
                >
                  {resetStep === 'request' ? 'Generate Reset Token' : 'Confirm New Password'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(false);
                    setResetStep('request');
                  }}
                  className="py-2 px-3.5 rounded-[7px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280] text-[13px] hover:text-[#1F2937]"
                >
                  Back
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Subtle Developer Attribution */}
      <footer className="mt-5 text-center font-['Figtree'] select-none">
        <p className="text-[9.5px] sm:text-[10.5px] text-[#9CA3AF] font-normal tracking-normal">
          Designed and Developed by{' '}
          <span className="text-[#F47721] font-medium">Joshua Godson</span>
        </p>
      </footer>
    </div>
  );
};
