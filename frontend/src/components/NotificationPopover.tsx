import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Mail,
  Wallet,
  Shield,
  X,
  RefreshCw,
  BellOff,
  ExternalLink,
} from 'lucide-react';
import { apiRequest } from '../services/api';

export interface FinoraNotification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error' | 'security';
  category: 'Payroll' | 'Email' | 'Import' | 'Security' | 'System';
  timestamp: string;
  targetNav?: string;
  targetRecordId?: string;
}

interface NotificationPopoverProps {
  onNavigate?: (nav: string, recordId?: string) => void;
  className?: string;
}

const STORAGE_KEY_READ = 'finora_notifications_read_v1';
const STORAGE_KEY_DISMISSED = 'finora_notifications_dismissed_v1';

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({
  onNavigate,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<FinoraNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_READ);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DISMISSED);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const popoverRef = useRef<HTMLDivElement>(null);

  // Load notifications from backend
  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const items = await apiRequest<FinoraNotification[]>('/api/dashboard/notifications');
      if (Array.isArray(items)) {
        setNotifications(items);
      }
    } catch {
      // Fallback local notifications if backend is offline or empty
      setNotifications((prev) =>
        prev.length > 0
          ? prev
          : [
              {
                id: 'system-welcome',
                title: 'FINORA System Ready',
                message: 'Payroll management engine is fully operational with active cycle.',
                type: 'info',
                category: 'System',
                timestamp: new Date().toISOString(),
                targetNav: 'dashboard',
              },
            ]
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 45000); // 45s refresh
    return () => clearInterval(interval);
  }, []);

  // Save read & dismissed IDs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_READ, JSON.stringify(readIds));
    } catch {
      // ignore
    }
  }, [readIds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DISMISSED, JSON.stringify(dismissedIds));
    } catch {
      // ignore
    }
  }, [dismissedIds]);

  // Handle click outside to close popover
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const activeNotifications = notifications.filter((n) => !dismissedIds.includes(n.id));
  const unreadCount = activeNotifications.filter((n) => !readIds.includes(n.id)).length;

  const displayedNotifications =
    filter === 'unread'
      ? activeNotifications.filter((n) => !readIds.includes(n.id))
      : activeNotifications;

  const handleMarkAllAsRead = () => {
    const allIds = activeNotifications.map((n) => n.id);
    setReadIds((prev) => Array.from(new Set([...prev, ...allIds])));
  };

  const handleMarkSingleRead = (id: string) => {
    if (!readIds.includes(id)) {
      setReadIds((prev) => [...prev, id]);
    }
  };

  const handleDismissNotification = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDismissedIds((prev) => [...prev, id]);
  };

  const handleClearAll = () => {
    const allIds = activeNotifications.map((n) => n.id);
    setDismissedIds((prev) => Array.from(new Set([...prev, ...allIds])));
  };

  const handleNotificationClick = (item: FinoraNotification) => {
    handleMarkSingleRead(item.id);
    setIsOpen(false);
    if (item.targetNav && onNavigate) {
      onNavigate(item.targetNav, item.targetRecordId);
    }
  };

  const formatTimeAgo = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHrs = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHrs / 24);

      if (diffSec < 60) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHrs < 24) return `${diffHrs}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const renderCategoryIcon = (category: string, type: string) => {
    switch (category) {
      case 'Email':
        return type === 'error' ? (
          <div className="w-7 h-7 rounded-[7px] bg-[#FEF2F2] border border-[#FCA5A5] flex items-center justify-center text-[#EF4444] shrink-0">
            <AlertCircle className="w-3.5 h-3.5" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-[7px] bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#3B82F6] shrink-0">
            <Mail className="w-3.5 h-3.5" />
          </div>
        );
      case 'Import':
        return (
          <div className="w-7 h-7 rounded-[7px] bg-[#FFF8F3] border border-[#F47721]/30 flex items-center justify-center text-[#F47721] shrink-0">
            <FileSpreadsheet className="w-3.5 h-3.5" />
          </div>
        );
      case 'Payroll':
        return (
          <div className="w-7 h-7 rounded-[7px] bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center text-[#10B981] shrink-0">
            <Wallet className="w-3.5 h-3.5" />
          </div>
        );
      case 'Security':
        return (
          <div className="w-7 h-7 rounded-[7px] bg-[#F5F3FF] border border-[#DDD6FE] flex items-center justify-center text-[#8B5CF6] shrink-0">
            <Shield className="w-3.5 h-3.5" />
          </div>
        );
      default:
        return (
          <div className="w-7 h-7 rounded-[7px] bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        );
    }
  };

  return (
    <div className={`relative ${className}`} ref={popoverRef}>
      {/* Bell Action Button - Clean, frameless, no background box or border */}
      <button
        type="button"
        onClick={() => {
          setIsOpen((v) => !v);
          if (!isOpen) fetchNotifications();
        }}
        className="relative p-1.5 flex items-center justify-center text-[#6B7280] hover:text-[#1F2937] transition-colors focus:outline-hidden cursor-pointer"
        title={`Notifications (${unreadCount} unread)`}
        aria-label="Payroll Notifications"
      >
        <Bell
          className={`w-5 h-5 transition-colors ${
            unreadCount > 0
              ? 'bell-orange-blink'
              : isOpen
                ? 'text-[#F47721]'
                : 'text-[#6B7280] hover:text-[#1F2937]'
          }`}
        />
      </button>

      {/* Notifications Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[390px] sm:w-[410px] bg-[#FFFFFF] border border-[#E5E7EB] rounded-[12px] shadow-xl z-50 overflow-hidden flex flex-col text-left">
          {/* Header */}
          <div className="px-4 py-3 bg-[#FFFFFF] border-b border-[#E5E7EB] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#FFF3E8] flex items-center justify-center text-[#F47721]">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <span className="text-[14px] font-bold text-[#1F2937]">Payroll Notifications</span>
              {unreadCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#F47721] text-[#FFFFFF]">
                  {unreadCount} new
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-[#F3F4F6] text-[#6B7280]">
                  All read
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#F47721] hover:text-[#E06612] px-2 py-1 rounded hover:bg-[#FFF3E8] transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark read</span>
                </button>
              )}
              <button
                type="button"
                onClick={fetchNotifications}
                disabled={loading}
                className="p-1 rounded text-[#9CA3AF] hover:text-[#1F2937] hover:bg-[#F3F4F6] transition-colors"
                title="Refresh notifications"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#F47721]' : ''}`} />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-4 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB] flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-[#FFFFFF] text-[#1F2937] font-semibold shadow-xs border border-[#E5E7EB]'
                    : 'text-[#6B7280] hover:text-[#1F2937]'
                }`}
              >
                All ({activeNotifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('unread')}
                className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors ${
                  filter === 'unread'
                    ? 'bg-[#FFFFFF] text-[#1F2937] font-semibold shadow-xs border border-[#E5E7EB]'
                    : 'text-[#6B7280] hover:text-[#1F2937]'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            {activeNotifications.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[11px] text-[#9CA3AF] hover:text-[#EF4444] transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#F3F4F6]">
            {displayedNotifications.length === 0 ? (
              <div className="py-12 px-6 text-center text-[#9CA3AF] space-y-2">
                <BellOff className="w-8 h-8 mx-auto text-[#D1D5DB]" />
                <p className="text-[13px] font-medium text-[#6B7280]">
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
                </p>
                <p className="text-[11.5px] text-[#9CA3AF]">
                  You are completely caught up with your payroll and system activity.
                </p>
              </div>
            ) : (
              displayedNotifications.map((item) => {
                const isUnread = !readIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer group relative ${
                      isUnread
                        ? 'bg-[#FFFBF8] hover:bg-[#FFF3E8]/50'
                        : 'bg-[#FFFFFF] hover:bg-[#F9FAFB]'
                    }`}
                  >
                    {/* Unread indicator bar */}
                    {isUnread && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F47721] absolute top-4 left-1.5 ring-2 ring-white" />
                    )}

                    {/* Icon */}
                    {renderCategoryIcon(item.category, item.type)}

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`text-[12.5px] truncate leading-snug ${
                            isUnread ? 'font-bold text-[#1F2937]' : 'font-medium text-[#374151]'
                          }`}
                        >
                          {item.title}
                        </span>
                        <span className="text-[10.5px] text-[#9CA3AF] shrink-0">
                          {formatTimeAgo(item.timestamp)}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-[#6B7280] leading-relaxed line-clamp-2">
                        {item.message}
                      </p>

                      {item.targetNav && (
                        <div className="flex items-center gap-1 text-[10.5px] text-[#F47721] font-semibold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span>View in {item.targetNav.charAt(0).toUpperCase() + item.targetNav.slice(1)}</span>
                          <ExternalLink className="w-3 h-3" />
                        </div>
                      )}
                    </div>

                    {/* Dismiss Button */}
                    <button
                      type="button"
                      onClick={(e) => handleDismissNotification(e, item.id)}
                      className="absolute top-3 right-3 p-1 rounded-full text-[#D1D5DB] hover:text-[#6B7280] hover:bg-[#E5E7EB]/50 transition-colors opacity-0 group-hover:opacity-100"
                      title="Dismiss notification"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 bg-[#F9FAFB] border-t border-[#E5E7EB] flex items-center justify-between text-[11px] text-[#6B7280]">
            <span>Auto-synced with payroll events</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="font-medium text-[#1F2937] hover:text-[#F47721] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

