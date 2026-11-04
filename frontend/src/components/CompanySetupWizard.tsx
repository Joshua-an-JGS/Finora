import React, { useState } from 'react';
import {
  Building2,
  Mail,
  Phone,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Upload,
  Sparkles,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import type { UserProfile } from '../types/payroll';

interface CompanySetupWizardProps {
  currentUser: UserProfile;
  onFinish: () => void;
  onSkip: () => void;
}

export const CompanySetupWizard: React.FC<CompanySetupWizardProps> = ({
  currentUser,
  onFinish,
  onSkip,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [companyName, setCompanyName] = useState('FINORA Enterprise');
  const [subtitle, setSubtitle] = useState('Finance & Payroll Management');
  const [registeredAddress, setRegisteredAddress] = useState(
    'Institutional Campus / Registered Office Address'
  );
  const [contactEmail, setContactEmail] = useState(currentUser.email || 'payroll@organization.org');
  const [contactPhone, setContactPhone] = useState('+91 0000 000000');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [authorizedIdentifiers, setAuthorizedIdentifiers] = useState('');
  const [signatoryName, setSignatoryName] = useState(currentUser.fullName || 'Authorized Signatory');
  const [signatoryDesignation, setSignatoryDesignation] = useState('Head of Finance & Accounts');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  // Fiscal & Payroll baseline
  const [currencySymbol, setCurrencySymbol] = useState('₹');
  const [currencyCode, setCurrencyCode] = useState('INR');
  const [showZeroValueComponentsByDefault, setShowZeroValueComponentsByDefault] = useState(false);
  const [showAmountInWordsByDefault, setShowAmountInWordsByDefault] = useState(true);

  // Email Configuration
  const [emailProviderMode, setEmailProviderMode] = useState<'Sandbox' | 'Smtp'>('Sandbox');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUseTls, setSmtpUseTls] = useState(true);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('payroll@organization.org');
  const [smtpFromName, setSmtpFromName] = useState('FINORA Payroll Administration');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError('Logo file size must be less than 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        setLogoDataUrl(uploadEvent.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCompleteSetup = async () => {
    setError(null);
    setSaving(true);
    try {
      // 1. Update company settings
      await apiRequest('/api/settings/company', {
        method: 'PUT',
        body: JSON.stringify({
          companyName: companyName.trim() || 'FINORA Enterprise',
          subtitle: subtitle.trim(),
          registeredAddress: registeredAddress.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          websiteUrl: websiteUrl.trim(),
          authorizedIdentifiers: authorizedIdentifiers.trim(),
          signatoryName: signatoryName.trim(),
          signatoryDesignation: signatoryDesignation.trim(),
          logoDataUrl: logoDataUrl || null,
          currencySymbol: currencySymbol.trim() || '₹',
          currencyCode: currencyCode.trim() || 'INR',
          showZeroValueComponentsByDefault,
          showAmountInWordsByDefault,
          emailProviderMode,
          smtpHost: smtpHost.trim(),
          smtpPort,
          smtpUseTls,
          smtpUsername: smtpUsername.trim(),
          newSmtpPassword: smtpPassword.trim() || undefined,
          smtpFromEmail: smtpFromEmail.trim(),
          smtpFromName: smtpFromName.trim(),
          documentRetentionDays: 1095,
        }),
      });

      // 2. Mark company setup complete
      await apiRequest('/api/settings/company/complete-setup', {
        method: 'POST',
      });

      onFinish();
    } catch (err: any) {
      setError(err?.message || 'Failed to complete company setup.');
      setSaving(false);
    }
  };

  const handleSkipForNow = async () => {
    try {
      await apiRequest('/api/settings/company/complete-setup', {
        method: 'POST',
      });
    } catch {
      // ignore
    }
    onSkip();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] rounded-[16px] border border-[#E5E7EB] shadow-2xl max-w-2xl w-full overflow-hidden text-[13px] animate-in fade-in zoom-in-95 duration-200 my-8">
        {/* Wizard Header */}
        <div className="px-8 py-5 border-b border-[#E5E7EB] bg-[#FAFAFA] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FFF3E8] border border-[#FED7AA] flex items-center justify-center text-[#F47721]">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-bold text-[#1F2937]">Company Onboarding Wizard</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF3E8] text-[#F47721] border border-[#FED7AA]">
                  Step {step} of 5
                </span>
              </div>
              <p className="text-[12px] text-[#6B7280]">
                Configure your organization profile and institutional payroll baseline.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSkipForNow}
            className="text-[12px] text-[#6B7280] hover:text-[#1F2937] font-medium px-3 py-1.5 rounded-[6px] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
          >
            Complete Later
          </button>
        </div>

        {/* Step Indicator Progress Bar */}
        <div className="w-full bg-[#E5E7EB] h-1.5">
          <div
            className="bg-[#F47721] h-1.5 transition-all duration-300"
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>

        {error && (
          <div className="mx-8 mt-5 p-3 rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] text-[12.5px] text-[#991B1B]">
            {error}
          </div>
        )}

        {/* Wizard Body Content */}
        <div className="p-8 max-h-[65vh] overflow-y-auto space-y-5">
          {/* STEP 1: Organization & Identity */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#1F2937]">Organization &amp; Branding</h3>
                <p className="text-[12px] text-[#6B7280]">
                  Set your organization legal name and primary logo for generated payslips.
                </p>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                  Company / Organization Name <span className="text-[#F47721]">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Technologies Ltd."
                  className="w-full px-3.5 py-2 text-[13.5px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                  Subtitle / Division
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="e.g. Finance & Payroll Management Division"
                  className="w-full px-3.5 py-2 text-[13.5px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                  Company Logo
                </label>
                <div className="flex items-center gap-4">
                  {logoDataUrl ? (
                    <div className="relative w-28 h-14 border border-[#E5E7EB] rounded-[6px] p-1 flex items-center justify-center bg-[#FAFAFA]">
                      <img src={logoDataUrl} alt="Logo Preview" className="max-h-full max-w-full object-contain" />
                      <button
                        type="button"
                        onClick={() => setLogoDataUrl(null)}
                        className="absolute -top-2 -right-2 bg-[#DC2626] text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-sm cursor-pointer"
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-4 py-2 border border-[#D1D5DB] hover:border-[#F47721] rounded-[6px] text-[#4B5563] hover:text-[#F47721] cursor-pointer transition-colors bg-[#FAFAFA]">
                      <Upload className="w-4 h-4" />
                      <span>Upload Logo (PNG/JPG)</span>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                  )}
                  <span className="text-[11.5px] text-[#9CA3AF]">
                    Displayed on official PDF payslips and fiscal exports.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Address & Authorized Signatory */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#1F2937]">Address &amp; Authorized Signatory</h3>
                <p className="text-[12px] text-[#6B7280]">
                  Enter legal address and signing authority coordinates.
                </p>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                  Registered Address <span className="text-[#F47721]">*</span>
                </label>
                <textarea
                  rows={2}
                  value={registeredAddress}
                  onChange={(e) => setRegisteredAddress(e.target.value)}
                  placeholder="Official street address, city, state, postal code"
                  className="w-full px-3.5 py-2 text-[13px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                    Official Contact Email
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-3" />
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="payroll@company.com"
                      className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                    Contact Phone
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-3" />
                    <input
                      type="text"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="+91 0000 000000"
                      className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                    Authorized Signatory Name
                  </label>
                  <input
                    type="text"
                    value={signatoryName}
                    onChange={(e) => setSignatoryName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3.5 py-2 text-[13px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                    Signatory Designation
                  </label>
                  <input
                    type="text"
                    value={signatoryDesignation}
                    onChange={(e) => setSignatoryDesignation(e.target.value)}
                    placeholder="e.g. Head of Accounts & Finance"
                    className="w-full px-3.5 py-2 text-[13px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                    Website URL
                  </label>
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://company.org"
                    className="w-full px-3.5 py-2 text-[13px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                    Registration / Tax Identifiers
                  </label>
                  <input
                    type="text"
                    value={authorizedIdentifiers}
                    onChange={(e) => setAuthorizedIdentifiers(e.target.value)}
                    placeholder="CIN / GSTIN / PAN / Registration No."
                    className="w-full px-3.5 py-2 text-[13px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Payroll & Fiscal Rules */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#1F2937]">Payroll &amp; Fiscal Baseline</h3>
                <p className="text-[12px] text-[#6B7280]">
                  Configure your primary currency symbol, formatting, and display rules.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                    Currency Symbol
                  </label>
                  <input
                    type="text"
                    value={currencySymbol}
                    onChange={(e) => setCurrencySymbol(e.target.value)}
                    placeholder="₹"
                    className="w-full px-3.5 py-2 text-[13px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#374151] mb-1">
                    Currency ISO Code
                  </label>
                  <input
                    type="text"
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value)}
                    placeholder="INR"
                    className="w-full px-3.5 py-2 text-[13px] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721]"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2.5 p-3 border border-[#E5E7EB] rounded-[7px] hover:bg-[#F9FAFB] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAmountInWordsByDefault}
                    onChange={(e) => setShowAmountInWordsByDefault(e.target.checked)}
                    className="text-[#F47721] rounded-[4px] focus:ring-[#F47721]"
                  />
                  <div>
                    <div className="font-semibold text-[#1F2937] text-[12.5px]">
                      Display Net Pay in Words (Indian / International Numerals)
                    </div>
                    <div className="text-[11px] text-[#6B7280]">
                      Automatically prints net salary in words on official payslips.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 border border-[#E5E7EB] rounded-[7px] hover:bg-[#F9FAFB] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showZeroValueComponentsByDefault}
                    onChange={(e) => setShowZeroValueComponentsByDefault(e.target.checked)}
                    className="text-[#F47721] rounded-[4px] focus:ring-[#F47721]"
                  />
                  <div>
                    <div className="font-semibold text-[#1F2937] text-[12.5px]">
                      Show Zero-Value Components by Default
                    </div>
                    <div className="text-[11px] text-[#6B7280]">
                      Includes salary elements with ₹0.00 value on payslip tables.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* STEP 4: Email Dispatch Configuration */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#1F2937]">Email Dispatch Gateway</h3>
                <p className="text-[12px] text-[#6B7280]">
                  Choose simulated Sandbox mode or live authenticated SMTP.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setEmailProviderMode('Sandbox')}
                  className={`p-3.5 border rounded-[8px] text-left transition-all cursor-pointer ${
                    emailProviderMode === 'Sandbox'
                      ? 'border-[#F47721] bg-[#FFF3E8]'
                      : 'border-[#E5E7EB] hover:bg-[#F9FAFB]'
                  }`}
                >
                  <div className="font-semibold text-[#1F2937] text-[13px]">
                    Sandbox Mode (Recommended)
                  </div>
                  <div className="text-[11.5px] text-[#6B7280] mt-1">
                    Safe local simulation. Renders emails and receipts without sending live emails.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setEmailProviderMode('Smtp')}
                  className={`p-3.5 border rounded-[8px] text-left transition-all cursor-pointer ${
                    emailProviderMode === 'Smtp'
                      ? 'border-[#F47721] bg-[#FFF3E8]'
                      : 'border-[#E5E7EB] hover:bg-[#F9FAFB]'
                  }`}
                >
                  <div className="font-semibold text-[#1F2937] text-[13px]">
                    Live SMTP Server
                  </div>
                  <div className="text-[11.5px] text-[#6B7280] mt-1">
                    Send real emails using corporate Gmail, Office 365, or institutional SMTP.
                  </div>
                </button>
              </div>

              {emailProviderMode === 'Smtp' && (
                <div className="space-y-3 p-4 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[8px]">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11.5px] font-semibold text-[#374151] mb-1">
                        SMTP Host
                      </label>
                      <input
                        type="text"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="smtp.gmail.com"
                        className="w-full px-3 py-1.5 text-[12.5px] border border-[#D1D5DB] rounded-[6px] bg-white focus:outline-hidden focus:border-[#F47721]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-semibold text-[#374151] mb-1">
                        Port
                      </label>
                      <input
                        type="number"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
                        className="w-full px-3 py-1.5 text-[12.5px] border border-[#D1D5DB] rounded-[6px] bg-white focus:outline-hidden focus:border-[#F47721]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11.5px] font-semibold text-[#374151] mb-1">
                        SMTP Username
                      </label>
                      <input
                        type="text"
                        value={smtpUsername}
                        onChange={(e) => setSmtpUsername(e.target.value)}
                        placeholder="payroll@company.com"
                        className="w-full px-3 py-1.5 text-[12.5px] border border-[#D1D5DB] rounded-[6px] bg-white focus:outline-hidden focus:border-[#F47721]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-semibold text-[#374151] mb-1">
                        SMTP Password / App Password
                      </label>
                      <input
                        type="password"
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        placeholder="App-specific password"
                        className="w-full px-3 py-1.5 text-[12.5px] border border-[#D1D5DB] rounded-[6px] bg-white focus:outline-hidden focus:border-[#F47721]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11.5px] font-semibold text-[#374151] mb-1">
                        From Email Address
                      </label>
                      <input
                        type="email"
                        value={smtpFromEmail}
                        onChange={(e) => setSmtpFromEmail(e.target.value)}
                        placeholder="payroll@organization.org"
                        className="w-full px-3 py-1.5 text-[12.5px] border border-[#D1D5DB] rounded-[6px] bg-white focus:outline-hidden focus:border-[#F47721]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-semibold text-[#374151] mb-1">
                        Sender Display Name
                      </label>
                      <input
                        type="text"
                        value={smtpFromName}
                        onChange={(e) => setSmtpFromName(e.target.value)}
                        placeholder="FINORA Payroll Division"
                        className="w-full px-3 py-1.5 text-[12.5px] border border-[#D1D5DB] rounded-[6px] bg-white focus:outline-hidden focus:border-[#F47721]"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 pt-1 text-[12px] text-[#374151] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smtpUseTls}
                      onChange={(e) => setSmtpUseTls(e.target.checked)}
                      className="text-[#F47721] rounded-[4px] focus:ring-[#F47721]"
                    />
                    <span>Enable TLS Encryption (Recommended for Port 587)</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: Review & Confirm */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#1F2937]">Review &amp; Launch FINORA</h3>
                <p className="text-[12px] text-[#6B7280]">
                  Your initial institutional workspace is ready to be launched.
                </p>
              </div>

              <div className="p-4 bg-[#F9FAFB] rounded-[10px] border border-[#E5E7EB] space-y-3 text-[12.5px]">
                <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB]">
                  <span className="text-[#6B7280]">Organization Name:</span>
                  <span className="font-semibold text-[#1F2937]">{companyName}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB]">
                  <span className="text-[#6B7280]">Signatory:</span>
                  <span className="font-semibold text-[#1F2937]">{signatoryName} ({signatoryDesignation})</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB]">
                  <span className="text-[#6B7280]">Currency:</span>
                  <span className="font-semibold text-[#1F2937]">{currencySymbol} ({currencyCode})</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB]">
                  <span className="text-[#6B7280]">Email Mode:</span>
                  <span className="font-semibold text-[#F47721]">{emailProviderMode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6B7280]">System Administrator:</span>
                  <span className="font-semibold text-[#1F2937]">@{currentUser.userName}</span>
                </div>
              </div>

              <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-[7px] text-[12px] text-[#065F46] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
                <span>You can adjust any of these settings anytime from Settings or Administration Console.</span>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="px-8 py-4 bg-[#FAFAFA] border-t border-[#E5E7EB] flex items-center justify-between">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as any)}
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-[#D1D5DB] rounded-[6px] text-[#374151] hover:bg-[#FFFFFF] font-medium text-[12.5px] transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSkipForNow}
                className="text-[12px] text-[#6B7280] hover:text-[#1F2937] font-medium transition-colors cursor-pointer"
              >
                Skip for Now
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step < 5 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as any)}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#F47721] hover:bg-[#E06411] text-[#FFFFFF] rounded-[6px] font-semibold text-[13px] transition-colors shadow-xs cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleCompleteSetup}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#F47721] hover:bg-[#E06411] text-[#FFFFFF] rounded-[6px] font-bold text-[13.5px] transition-colors shadow-md cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <span>Saving &amp; Initializing...</span>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Save &amp; Launch FINORA</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
