import { apiRequest } from './api';
import type { PayrollYearsDto } from '../types/payroll';

let cachedYears: PayrollYearsDto | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

const YEARS_UPDATED_EVENT = 'finora:years-updated';

/**
 * Fetch available payroll years dynamically from FINORA centralized backend service.
 */
export async function getPayrollYears(force = false): Promise<PayrollYearsDto> {
  const now = Date.now();
  if (!force && cachedYears && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedYears;
  }

  try {
    const data = await apiRequest<PayrollYearsDto>('/api/payroll/years' + (force ? '?force=true' : ''));
    cachedYears = data;
    lastFetchTime = now;
    return data;
  } catch (err) {
    console.error('Failed to fetch dynamic payroll years from backend:', err);
    // Fallback if network or unauthenticated
    const currentYear = new Date().getFullYear();
    const fallback: PayrollYearsDto = {
      activeYear: cachedYears?.activeYear ?? currentYear,
      activeMonth: cachedYears?.activeMonth ?? new Date().getMonth() + 1,
      availableYears: cachedYears?.availableYears ?? [2028, 2027, 2026, 2025],
      importCandidateYears: [2031, 2030, 2029, 2028, 2027, 2026, 2025, 2024],
      summaries: [],
    };
    return fallback;
  }
}

/**
 * Update the active payroll period (month and year) across FINORA.
 */
export async function setActivePayrollPeriod(month: number, year: number): Promise<void> {
  await apiRequest('/api/payroll/periods/active', {
    method: 'POST',
    body: JSON.stringify({ month, year }),
  });
  // Clear cache and emit update event
  cachedYears = null;
  notifyYearsUpdated();
}

/**
 * Invalidate cache and broadcast to all application listeners that payroll years or records changed.
 */
export function notifyYearsUpdated(): void {
  cachedYears = null;
  lastFetchTime = 0;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(YEARS_UPDATED_EVENT));
  }
}

/**
 * Subscribe to global payroll year change events (e.g. after a file is imported or period changed).
 */
export function onYearsUpdated(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(YEARS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(YEARS_UPDATED_EVENT, handler);
}
