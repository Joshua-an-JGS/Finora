import React, { useState, useEffect } from 'react';
import {
  User,
  Lock,
  Shield,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Activity,
  Save,
  Check,
  Building,
} from 'lucide-react';
import type { UserProfile } from '../types/payroll';
import { apiRequest, setStoredSession } from '../services/api';

interface MyProfileViewProps {
  user: UserProfile;
  onProfileUpdated: (updatedUser: UserProfile) => void;
  onNavigateToUserManagement?: () => void;
}

interface SecurityActivity {
  id?: string;
  action?: string;
  actionType?: string;
  summary: string;
  timestamp?: string;
  timestampUtc?: string;
  ipAddress?: string;
}

interface DetailedProfile {
  id: string;
  userName: string;
  email: string;
  fullName: string;
  department: string;
  role: string;
  isActive: boolean;
  createdAtUtc?: string;
  lastLoginAtUtc?: string;
  mfaRequired?: boolean;
  mfaConfigured?: boolean;
  isAdminSession?: boolean;
}

export const MyProfileView: React.FC<MyProfileViewProps> = ({
  user,
  onProfileUpdated,
  onNavigateToUserManagement,
}) => {
  const [profile, setProfile] = useState<DetailedProfile>({
    id: user.id,
    userName: user.userName,
    email: user.email,
    fullName: user.fullName,
    department: user.department || 'Finance & Accounts',
    role: user.role,
    isActive: true,
  });

  const [activities, setActivities] = useState<SecurityActivity[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Profile Form State
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);

  // Change Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passSuccessMsg, setPassSuccessMsg] = useState<string | null>(null);
  const [passErrorMsg, setPassErrorMsg] = useState<string | null>(null);

  // Load latest profile and recent audit events from server
  const loadProfileData = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<any>('/api/auth/profile');
      if (res) {
        const userObj = res.user || res;
        setProfile({
          id: userObj.id,
          userName: userObj.userName,
          email: userObj.email,
          fullName: userObj.fullName,
          department: userObj.department || 'Finance & Accounts',
          role: userObj.role,
          isActive: userObj.isActive ?? true,
          createdAtUtc: userObj.createdAtUtc,
          lastLoginAtUtc: userObj.lastLoginAtUtc,
          mfaRequired: userObj.mfaRequired,
          mfaConfigured: userObj.mfaConfigured,
          isAdminSession: userObj.isAdminSession,
        });
        setFullName(userObj.fullName);
        setEmail(userObj.email);
        const acts = res.recentActivities || res.activities || [];
        setActivities(acts);
      }
    } catch (err: any) {
      console.warn('Could not refresh full profile from server:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, []);

  // Handle Personal Details Update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccessMsg(null);
    setProfileErrorMsg(null);

    const cleanName = fullName.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setProfileErrorMsg('Full Name cannot be empty.');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setProfileErrorMsg('Please provide a valid corporate email address.');
      return;
    }

    try {
      setIsSavingProfile(true);
      const res = await apiRequest<{ token: string; message: string; user: DetailedProfile }>(
        '/api/auth/profile',
        {
          method: 'PUT',
          body: JSON.stringify({ fullName: cleanName, email: cleanEmail }),
        }
      );

      if (res && res.user) {
        setProfile(res.user);
        setStoredSession(res.token, res.user);
        onProfileUpdated(res.user as unknown as UserProfile);
        setProfileSuccessMsg('Your personal profile details have been saved successfully.');
        setTimeout(() => setProfileSuccessMsg(null), 5000);
      }
    } catch (err: any) {
      setProfileErrorMsg(err?.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Handle Self-Service Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassSuccessMsg(null);
    setPassErrorMsg(null);

    if (!currentPassword) {
      setPassErrorMsg('Please enter your current password.');
      return;
    }

    if (!newPassword) {
      setPassErrorMsg('Please enter a new password.');
      return;
    }

    if (newPassword.length < 8) {
      setPassErrorMsg('New password must contain at least 8 characters.');
      return;
    }

    if (newPassword === currentPassword) {
      setPassErrorMsg('New password cannot be the same as your current password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassErrorMsg('New password and confirmation password do not match.');
      return;
    }

    try {
      setIsChangingPass(true);
      const res = await apiRequest<{ success: boolean; token: string; message: string }>(
        '/api/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({
            currentPassword,
            newPassword,
            confirmNewPassword: confirmPassword,
          }),
        }
      );

      if (res && res.success) {
        setStoredSession(res.token, profile);
        setPassSuccessMsg('Your account password has been changed successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        // Refresh security activity log
        loadProfileData();
        setTimeout(() => setPassSuccessMsg(null), 6000);
      }
    } catch (err: any) {
      setPassErrorMsg(err?.message || 'Failed to change password. Please check your current password.');
    } finally {
      setIsChangingPass(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'Administrator':
        return {
          bg: 'bg-[#FFF3E8] border-[#F47721]/30 text-[#F47721]',
          label: 'System Administrator',
          description: 'Full system governance, security policies & user management',
        };
      case 'AccountsOperator':
        return {
          bg: 'bg-[#EFF6FF] border-[#3B82F6]/30 text-[#2563EB]',
          label: 'Accounts Operator',
          description: 'Full payroll administration, employee records & payslip dispatch',
        };
      case 'Viewer':
      default:
        return {
          bg: 'bg-[#F3F4F6] border-[#D1D5DB] text-[#4B5563]',
          label: 'Finance Auditor (Viewer)',
          description: 'Read-only fiscal oversight, verification & payroll reports',
        };
    }
  };

  const roleMeta = getRoleBadge(profile.role);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Not available';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Banner / Hero Card */}
      <div className="bg-[#FFFFFF] rounded-[10px] border border-[#E5E7EB] p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-[#F47721] text-[#FFFFFF] flex items-center justify-center text-[24px] font-bold shadow-sm shrink-0">
            <User className="w-8 h-8 text-[#FFFFFF]" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[22px] font-bold text-[#1F2937] leading-tight">
                {profile.fullName}
              </h1>
            </div>
            <p className="text-[13px] text-[#6B7280] mt-1">
              Signed in as <span className="font-medium text-[#374151]">@{profile.userName}</span>{' '}
              ({profile.email})
            </p>
            <p className="text-[12px] text-[#9CA3AF] mt-0.5">{roleMeta.description}</p>
          </div>
        </div>

        {/* Admin Quick Action (if Administrator) */}
        {profile.role === 'Administrator' && onNavigateToUserManagement && (
          <button
            type="button"
            onClick={onNavigateToUserManagement}
            className="flex items-center gap-2 px-4 py-2 bg-[#FFF3E8] hover:bg-[#FFE8D6] text-[#F47721] border border-[#F47721]/30 rounded-[8px] text-[13px] font-medium transition-colors cursor-pointer shrink-0"
          >
            <Shield className="w-4 h-4" />
            <span>Manage All System Users</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Profile Info + Security & Password */}
        <div className="lg:col-span-2 space-y-6">
          {/* SECTION 1: Personal Profile Information */}
          <div className="bg-[#FFFFFF] rounded-[10px] border border-[#E5E7EB] shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5E7EB] bg-[#FAFAFA] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[6px] bg-[#FFF3E8] text-[#F47721] flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-[#1F2937]">Profile Information</h2>
                  <p className="text-[12px] text-[#6B7280]">
                    Update your permitted identity and contact information.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="p-6 space-y-5">
              {profileSuccessMsg && (
                <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-[6px] flex items-center gap-2.5 text-[13px] text-[#065F46] animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}

              {profileErrorMsg && (
                <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[6px] flex items-center gap-2.5 text-[13px] text-[#991B1B] animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
                  <span>{profileErrorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name (Editable) */}
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#374151] mb-1">
                    Full Name <span className="text-[#F47721]">*</span>
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="Enter your full name"
                    className="w-full px-3.5 py-2 text-[13.5px] bg-[#FFFFFF] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721] focus:ring-1 focus:ring-[#F47721] transition-all"
                  />
                  <span className="text-[11px] text-[#9CA3AF] mt-1 block">
                    Your display name on payslips and system audit stamps.
                  </span>
                </div>

                {/* Email Address (Editable) */}
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#374151] mb-1">
                    Email Address <span className="text-[#F47721]">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="name@company.com"
                    className="w-full px-3.5 py-2 text-[13.5px] bg-[#FFFFFF] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721] focus:ring-1 focus:ring-[#F47721] transition-all"
                  />
                  <span className="text-[11px] text-[#9CA3AF] mt-1 block">
                    Used for notifications and account verification.
                  </span>
                </div>

                {/* Username (Read-Only) */}
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#6B7280] mb-1">
                    System Username
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={profile.userName}
                      disabled
                      className="w-full px-3.5 py-2 text-[13px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-[6px] text-[#6B7280] cursor-not-allowed select-none"
                    />
                    <Lock className="w-3.5 h-3.5 text-[#9CA3AF] absolute right-3 top-3" />
                  </div>
                  <span className="text-[11px] text-[#9CA3AF] mt-1 block">
                    Fixed account identifier (cannot be changed).
                  </span>
                </div>

                {/* Department (Read-Only / Profile meta) */}
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#6B7280] mb-1">
                    Department
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={profile.department || 'Finance & Accounts'}
                      disabled
                      className="w-full px-3.5 py-2 text-[13px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-[6px] text-[#6B7280] cursor-not-allowed select-none"
                    />
                    <Building className="w-3.5 h-3.5 text-[#9CA3AF] absolute right-3 top-3" />
                  </div>
                  <span className="text-[11px] text-[#9CA3AF] mt-1 block">
                    Assigned institutional division.
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-[#F47721] hover:bg-[#E06411] text-[#FFFFFF] rounded-[6px] text-[13px] font-medium transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingProfile ? 'Saving...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* SECTION 2: Security & Change Password */}
          <div className="bg-[#FFFFFF] rounded-[10px] border border-[#E5E7EB] shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5E7EB] bg-[#FAFAFA] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[6px] bg-[#FFF3E8] text-[#F47721] flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-[#1F2937]">Security &amp; Password</h2>
                  <p className="text-[12px] text-[#6B7280]">
                    Manage your account credentials and security authentication.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              {passSuccessMsg && (
                <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-[6px] flex items-center gap-2.5 text-[13px] text-[#065F46] animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
                  <span>{passSuccessMsg}</span>
                </div>
              )}

              {passErrorMsg && (
                <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[6px] flex items-center gap-2.5 text-[13px] text-[#991B1B] animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
                  <span>{passErrorMsg}</span>
                </div>
              )}

              {/* Current Password */}
              <div>
                <label className="block text-[12.5px] font-semibold text-[#374151] mb-1">
                  Current Password <span className="text-[#F47721]">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter your existing account password"
                    className="w-full pl-3.5 pr-10 py-2 text-[13.5px] bg-[#FFFFFF] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721] focus:ring-1 focus:ring-[#F47721] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-2.5 text-[#9CA3AF] hover:text-[#4B5563] cursor-pointer"
                    title={showCurrentPass ? 'Hide password' : 'Show password'}
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* New Password */}
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#374151] mb-1">
                    New Password <span className="text-[#F47721]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      placeholder="Minimum 8 characters"
                      className="w-full pl-3.5 pr-10 py-2 text-[13.5px] bg-[#FFFFFF] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721] focus:ring-1 focus:ring-[#F47721] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-3 top-2.5 text-[#9CA3AF] hover:text-[#4B5563] cursor-pointer"
                      title={showNewPass ? 'Hide password' : 'Show password'}
                    >
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password */}
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#374151] mb-1">
                    Confirm New Password <span className="text-[#F47721]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      placeholder="Re-type new password"
                      className="w-full pl-3.5 pr-10 py-2 text-[13.5px] bg-[#FFFFFF] border border-[#D1D5DB] rounded-[6px] focus:outline-hidden focus:border-[#F47721] focus:ring-1 focus:ring-[#F47721] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-3 top-2.5 text-[#9CA3AF] hover:text-[#4B5563] cursor-pointer"
                      title={showConfirmPass ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password Requirements Guidance */}
              <div className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[6px] text-[11.5px] text-[#6B7280] space-y-1">
                <div className="font-semibold text-[#374151]">Security Requirements:</div>
                <div className="flex items-center gap-1.5">
                  <Check
                    className={`w-3.5 h-3.5 ${
                      newPassword.length >= 8 ? 'text-[#10B981]' : 'text-[#9CA3AF]'
                    }`}
                  />
                  <span>At least 8 characters long</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check
                    className={`w-3.5 h-3.5 ${
                      newPassword && newPassword !== currentPassword
                        ? 'text-[#10B981]'
                        : 'text-[#9CA3AF]'
                    }`}
                  />
                  <span>Must not match your current password</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check
                    className={`w-3.5 h-3.5 ${
                      newPassword && newPassword === confirmPassword
                        ? 'text-[#10B981]'
                        : 'text-[#9CA3AF]'
                    }`}
                  />
                  <span>New password and confirmation must match</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isChangingPass}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-[#F47721] hover:bg-[#E06411] text-[#FFFFFF] rounded-[6px] text-[13px] font-medium transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  <span>{isChangingPass ? 'Updating Password...' : 'Change Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column (1 Col): Account Details & Recent Account Activity */}
        <div className="space-y-6">
          {/* SECTION 3: Account Details */}
          <div className="bg-[#FFFFFF] rounded-[10px] border border-[#E5E7EB] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E7EB] bg-[#FAFAFA]">
              <h3 className="text-[14px] font-bold text-[#1F2937]">Account Details</h3>
              <p className="text-[11.5px] text-[#6B7280]">System metadata and permissions</p>
            </div>

            <div className="p-5 space-y-4 text-[13px]">
              <div>
                <div className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
                  Assigned Role
                </div>
                <div className="font-semibold text-[#1F2937]">{roleMeta.label}</div>
                <div className="text-[11.5px] text-[#6B7280] mt-0.5">
                  {roleMeta.description}
                </div>
              </div>

              <div className="border-t border-[#F3F4F6] pt-3">
                <div className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
                  Account Status
                </div>
                <div className="flex items-center gap-1.5 text-[#059669] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
                  <span>Active &amp; Operational</span>
                </div>
              </div>

              <div className="border-t border-[#F3F4F6] pt-3">
                <div className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
                  Account Created
                </div>
                <div className="flex items-center gap-1.5 text-[#374151]">
                  <Calendar className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  <span>{formatDate(profile.createdAtUtc)}</span>
                </div>
              </div>

              <div className="border-t border-[#F3F4F6] pt-3">
                <div className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
                  Last Login
                </div>
                <div className="flex items-center gap-1.5 text-[#374151]">
                  <Clock className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  <span>{formatDate(profile.lastLoginAtUtc)}</span>
                </div>
              </div>

              <div className="border-t border-[#F3F4F6] pt-3">
                <div className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
                  Security Encryption
                </div>
                <div className="text-[12px] text-[#4B5563]">
                  Identity PBKDF2 with Cryptographic Salting &amp; Session Invalidation
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 4: Recent Account Security Activity */}
          <div className="bg-[#FFFFFF] rounded-[10px] border border-[#E5E7EB] shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E7EB] bg-[#FAFAFA] flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-bold text-[#1F2937]">Recent Account Activity</h3>
                <p className="text-[11.5px] text-[#6B7280]">Audit log of personal security events</p>
              </div>
              <Activity className="w-4 h-4 text-[#F47721]" />
            </div>

            <div className="divide-y divide-[#F3F4F6] max-h-80 overflow-y-auto">
              {loading ? (
                <div className="p-5 text-center text-[12px] text-[#9CA3AF]">
                  Loading security activity...
                </div>
              ) : activities.length === 0 ? (
                <div className="p-5 text-center text-[12px] text-[#9CA3AF]">
                  No recent security events recorded.
                </div>
              ) : (
                activities.map((act, idx) => (
                  <div key={act.id || idx} className="p-3.5 text-[12px] hover:bg-[#F9FAFB] transition-colors">
                    <div className="flex items-center justify-between text-[#374151] font-medium">
                      <span className="text-[#F47721] font-semibold">{act.action || act.actionType}</span>
                      <span className="text-[10.5px] text-[#9CA3AF]">
                        {formatDate(act.timestamp || act.timestampUtc)}
                      </span>
                    </div>
                    <p className="text-[#6B7280] mt-1 text-[11.5px] leading-relaxed">
                      {act.summary}
                    </p>
                    {act.ipAddress && (
                      <span className="text-[10px] text-[#9CA3AF] block mt-0.5">
                        IP: {act.ipAddress}
                      </span>
                    )}
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
