import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  Smartphone,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  QrCode,
  ShieldAlert,
} from 'lucide-react';
import { apiRequest } from '../services/api';

export const SecurityMfaView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaConfigured, setMfaConfigured] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [otpUri, setOtpUri] = useState('');
  const [currentSampleCode, setCurrentSampleCode] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [testCode, setTestCode] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load current MFA configuration on mount
  useEffect(() => {
    loadMfaStatus();
  }, []);

  const loadMfaStatus = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await apiRequest<{
        mfaRequired: boolean;
        mfaConfigured: boolean;
        secretKey: string;
        otpUri: string;
        currentSampleCode: string;
        adminUsername: string;
      }>('/api/admin/mfa');

      setMfaRequired(data.mfaRequired);
      setMfaConfigured(data.mfaConfigured);
      setSecretKey(data.secretKey);
      setOtpUri(data.otpUri);
      setCurrentSampleCode(data.currentSampleCode);
      setAdminUsername(data.adminUsername || 'admin');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to load MFA settings.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNewSecret = async () => {
    try {
      const data = await apiRequest<{ secretKey: string }>('/api/admin/mfa/generate-secret', {
        method: 'POST',
      });
      setSecretKey(data.secretKey);
      setOtpUri(
        `otpauth://totp/FINORA:${adminUsername}?secret=${data.secretKey}&issuer=FINORA&algorithm=SHA1&digits=6&period=30`
      );
      setTestCode('');
      setFeedback({
        type: 'success',
        message: 'Generated a new authenticator secret key. Remember to scan or update it in your app and click Save.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to generate secret key.' });
    }
  };

  const handleSaveMfaConfiguration = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ mfaRequired: boolean; mfaConfigured: boolean; message: string }>(
        '/api/admin/mfa/configure',
        {
          method: 'POST',
          body: JSON.stringify({
            mfaRequired: mfaRequired,
            secretKey: secretKey,
            verificationCode: testCode.trim() || undefined,
          }),
        }
      );

      setMfaConfigured(res.mfaConfigured);
      setMfaRequired(res.mfaRequired);
      setTestCode('');
      setFeedback({
        type: 'success',
        message: res.message || 'Multi-Factor Authentication settings saved successfully!',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to save MFA configuration. Check verification code and try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!window.confirm('Are you sure you want to disable Multi-Factor Authentication for Administrator access?')) {
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ mfaRequired: boolean; message: string }>('/api/admin/mfa/disable', {
        method: 'POST',
      });
      setMfaRequired(false);
      setMfaConfigured(false);
      setFeedback({
        type: 'success',
        message: res.message || 'Multi-Factor Authentication has been disabled.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to disable MFA.' });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, type: 'key' | 'uri') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-8 text-center text-[#6B7280]">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#F47721]" />
        <span>Loading security and MFA configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Status Card */}
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-[10px] p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E5E7EB]">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[8px] bg-[#FFF3E8] text-[#F47721] flex items-center justify-center">
                <Shield className="w-4 h-4" />
              </div>
              <h2 className="text-[20px] font-bold text-[#1F2937]">Multi-Factor Authentication (MFA)</h2>
            </div>
            <p className="text-[13px] text-[#6B7280] mt-1">
              Configure time-based one-time password (TOTP) authenticator verification for the Administrator Gateway.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {mfaConfigured && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]">
                <span>App Linked</span>
              </span>
            )}
            {mfaRequired ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold bg-[#ECFDF5] text-[#10B981] border border-[#A7F3D0]">
                <CheckCircle2 className="w-4 h-4" />
                <span>MFA Enforced</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]">
                <AlertCircle className="w-4 h-4" />
                <span>MFA Optional</span>
              </span>
            )}
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-4 rounded-[8px] text-[13px] font-medium flex items-center gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46]'
                : 'bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B]'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#10B981]" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-[#EF4444]" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Master Enforcement Toggle */}
        <div className="p-4 rounded-[9px] bg-[#F9FAFB] border border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[14px] font-bold text-[#1F2937] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#F47721]" />
              <span>Require MFA for Administrator Gateway Sign-In</span>
            </div>
            <p className="text-[12.5px] text-[#6B7280]">
              When enabled, signing in as Administrator requires both password and a valid 6-digit TOTP code.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={mfaRequired}
              onChange={(e) => setMfaRequired(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#F47721]"></div>
          </label>
        </div>

        {/* Step-by-Step Authenticator App Setup */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {/* Left Column: Secret Key & App Setup */}
          <div className="space-y-4">
            <h3 className="text-[15px] font-bold text-[#1F2937] flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#F47721]" />
              <span>1. Setup in Authenticator App</span>
            </h3>
            <p className="text-[12.5px] text-[#6B7280]">
              Scan or enter the secret key below into your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, or 1Password).
            </p>

            {/* Secret Key Input Box */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#374151]">MFA Secret Key (Base32)</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-[13px] font-mono font-bold bg-[#F9FAFB] border border-[#D1D5DB] rounded-[7px] text-[#1F2937] tracking-wider pr-10"
                    placeholder="ENTER SECRET KEY OR 6-DIGIT PIN"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#1F2937]"
                    title={showSecret ? 'Hide secret key' : 'Show secret key'}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(secretKey, 'key')}
                  className="px-3 py-2 text-[12.5px] font-medium border border-[#D1D5DB] rounded-[7px] bg-[#FFFFFF] hover:bg-[#F9FAFB] flex items-center gap-1.5 transition-colors shrink-0"
                  title="Copy secret key"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateNewSecret}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border border-[#E5E7EB] bg-[#FFFFFF] text-[12px] font-medium text-[#1F2937] hover:border-[#F47721] hover:text-[#F47721] transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#F47721]" />
                <span>Generate New Key</span>
              </button>

              <button
                type="button"
                onClick={() => copyToClipboard(otpUri, 'uri')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] border border-[#E5E7EB] bg-[#FFFFFF] text-[12px] font-medium text-[#1F2937] hover:border-[#F47721] hover:text-[#F47721] transition-colors"
                title="Copy otpauth:// URI"
              >
                <QrCode className="w-3.5 h-3.5 text-[#6B7280]" />
                <span>{copiedUri ? 'URI Copied!' : 'Copy OTP URI'}</span>
              </button>
            </div>

            {/* Account Details */}
            <div className="p-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[8px] text-[12px] space-y-1 text-[#6B7280]">
              <div className="flex justify-between">
                <span>Account Name:</span>
                <span className="font-mono font-semibold text-[#1F2937]">FINORA:{adminUsername}</span>
              </div>
              <div className="flex justify-between">
                <span>Algorithm:</span>
                <span className="font-mono font-semibold text-[#1F2937]">RFC 6238 TOTP (SHA1, 30s)</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-[#E5E7EB]">
                <span>Current Test Code:</span>
                <span className="font-mono font-bold text-[#F47721] tracking-widest bg-[#FFF3E8] px-2 py-0.5 rounded">
                  {currentSampleCode || '123456'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Verify & Activate */}
          <div className="space-y-4">
            <h3 className="text-[15px] font-bold text-[#1F2937] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#F47721]" />
              <span>2. Verify &amp; Save Configuration</span>
            </h3>
            <p className="text-[12.5px] text-[#6B7280]">
              Enter the 6-digit code currently shown in your authenticator app to confirm proper synchronization.
            </p>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#374151]">
                6-Digit Verification Code {mfaRequired && <span className="text-[#EF4444]">*</span>}
              </label>
              <input
                type="text"
                maxLength={8}
                value={testCode}
                onChange={(e) => setTestCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 123456"
                className="w-full px-3.5 py-2.5 text-[16px] font-mono font-bold tracking-widest text-center border border-[#D1D5DB] rounded-[8px] focus:ring-2 focus:ring-[#F47721]/30 focus:border-[#F47721]"
              />
              <span className="block text-[11px] text-[#9CA3AF]">
                Tip: Enter the code from your phone or use test code <code className="text-[#F47721] font-bold">{currentSampleCode || '123456'}</code>.
              </span>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveMfaConfiguration}
                disabled={saving || !secretKey}
                className="px-5 py-2.5 rounded-[8px] bg-[#F47721] text-[#FFFFFF] hover:bg-[#E06612] text-[13px] font-semibold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>{mfaRequired ? 'Save & Enforce MFA' : 'Save MFA Settings'}</span>
                  </>
                )}
              </button>

              {mfaRequired && (
                <button
                  type="button"
                  onClick={handleDisableMfa}
                  disabled={saving}
                  className="px-3.5 py-2.5 rounded-[8px] border border-[#E5E7EB] bg-[#FFFFFF] text-[#EF4444] hover:bg-[#FEF2F2] hover:border-[#FCA5A5] text-[13px] font-medium transition-colors"
                >
                  Disable MFA
                </button>
              )}
            </div>

            {/* Emergency Recovery Notice */}
            <div className="p-3.5 rounded-[8px] bg-[#FFF8F3] border border-[#F47721]/20 text-[12px] space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-[#1F2937]">
                <ShieldAlert className="w-4 h-4 text-[#F47721]" />
                <span>Emergency Backup &amp; Recovery</span>
              </div>
              <p className="text-[#6B7280] leading-relaxed">
                If your phone or authenticator app is lost, you can use your master Administrator credentials or recovery entry at the hidden gateway.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Gateway Architecture & Security Protections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-[13px]">
        <div className="p-5 rounded-[10px] border border-[#10B981]/30 bg-[#F0FDF4] space-y-2.5 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-[#10B981] text-[14.5px]">
            <Shield className="w-4 h-4" />
            <span>Hidden Admin Gateway</span>
          </div>
          <p className="text-[12.5px] text-[#1F2937] leading-relaxed">
            The administrator gateway is completely removed from the standard user login page. It can only be triggered via:
          </p>
          <ul className="text-[12px] list-disc list-inside space-y-1 font-mono text-[#1F2937]">
            <li>Shortcut: <span className="font-bold">Ctrl + Shift + Alt + A</span></li>
            <li>Protected Direct Path: <span className="font-bold">/secure-admin-access</span></li>
          </ul>
        </div>

        <div className="p-5 rounded-[10px] border border-[#E5E7EB] bg-[#FFFFFF] space-y-2.5 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-[#1F2937] text-[14.5px]">
            <Lock className="w-4 h-4 text-[#F47721]" />
            <span>Account Lockout &amp; Progressive Delay</span>
          </div>
          <p className="text-[12.5px] text-[#6B7280] leading-relaxed">
            Repeated invalid administrator login attempts trigger progressive delays (350ms mitigation) and lock accounts after 5 failures for 5 minutes. All events are written to the tamper-evident audit log.
          </p>
        </div>
      </div>
    </div>
  );
};
