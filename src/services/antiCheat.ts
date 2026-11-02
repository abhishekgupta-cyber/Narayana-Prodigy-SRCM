/**
 * Anti-Cheat, Timing, and Privacy Service (IST Authority)
 * Narayana Prodigy Student Relation Call Management CRM
 */

import { CallDisposition, CallLog, Role } from '../types/crm';

/**
 * Returns the current date/time converted to Asia/Kolkata (IST) Day (D5).
 * Always returns 'YYYY-MM-DD' representing the IST calendar day.
 */
export function istDay(inputDate?: Date | string | number): string {
  const d = inputDate ? new Date(inputDate) : new Date();
  // Format in Asia/Kolkata
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d); // Returns "YYYY-MM-DD"
}

/**
 * Formats date into standard IST format: "02 Nov 2026, 04:30 PM" (D5).
 */
export function formatISTDateTime(inputDate?: Date | string | number | null): string {
  if (!inputDate) return '—';
  try {
    const d = new Date(inputDate);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * Returns today's calendar date in IST: "YYYY-MM-DD"
 */
export function getTodayCalendarDate(): string {
  return istDay();
}

/**
 * Server-side Number Masking (Section 9.1):
 * Phones are masked (XXXXXX4521) for non-admin users on desktop, laptop, and mobile.
 * In UI AND in every API response.
 * Real numbers are visible ONLY to Super Admin, or temporarily unmasked during active call session.
 */
export function maskPhoneNumber(phone: string | undefined | null, userRole: Role = 'MENTOR'): string {
  if (!phone) return '—';
  const clean = phone.replace(/\D/g, '');
  if (!clean) return '—';

  if (userRole === 'SUPER_ADMIN') {
    if (clean.length === 10) {
      return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
    }
    return phone;
  }

  // Non-Admin: Strict Masking (XXXXXX4521)
  if (clean.length >= 4) {
    const last4 = clean.slice(-4);
    return `XXXXXX${last4}`;
  }
  return 'XXXXXX****';
}

/**
 * Backward compatibility alias for formatPhoneNumber
 */
export function formatPhoneNumber(phone: string, _isMobileViewport: boolean = false): string {
  return maskPhoneNumber(phone, 'MENTOR');
}

/**
 * Stealth Anti-Cheat Latency Evaluator (Section 9.7):
 * Silently stores latency_seconds and is_suspicious_submission = TRUE on server
 * if Connected and latency < suspicious_seconds (default 15).
 * No mentor-facing UI or API response may ever reveal this flag or anti-cheat warnings!
 */
export function auditCallSubmission(
  initiatedAt: string,
  submittedAt: string,
  disposition: CallDisposition,
  thresholdSeconds: number = 15
): { latencySeconds: number; isSuspicious: boolean; reason?: string } {
  const initTime = new Date(initiatedAt).getTime();
  const subTime = new Date(submittedAt).getTime();
  const latencySeconds = Math.max(0, Math.round((subTime - initTime) / 1000));

  let isSuspicious = false;
  let reason: string | undefined = undefined;

  if (disposition === 'CONNECTED' && latencySeconds < thresholdSeconds) {
    isSuspicious = true;
    reason = `Stealth Audit: Instant Connected submission within ${latencySeconds}s (<${thresholdSeconds}s threshold)`;
  }

  return { latencySeconds, isSuspicious, reason };
}

/**
 * Checks if a call log can still be edited via Same-Day Inbound Callback Override (Section 9.5).
 * Window is valid until 11:59:59 PM IST of the call's day.
 */
export function canOverrideInboundToday(callLog: CallLog): boolean {
  if (callLog.is_locked) return false;
  const todayIST = getTodayCalendarDate();
  return callLog.calendar_date === todayIST;
}

/**
 * Strict Remark Privacy (Section 9.6):
 * Mentors receive remark text ONLY if written by THEM and TODAY (IST).
 * No remarks from earlier days, other mentors, or admin are ever exposed.
 */
export function getSanitizedRemarkForUser(
  callLog: CallLog,
  currentUserId: string,
  currentUserRole: Role
): { remark: string; isConcealed: boolean } {
  if (currentUserRole === 'SUPER_ADMIN') {
    return { remark: callLog.remark || '', isConcealed: false };
  }

  const todayIST = getTodayCalendarDate();
  const isMine = callLog.mentor_id === currentUserId;
  const isToday = callLog.calendar_date === todayIST;

  if (isMine && isToday) {
    return { remark: callLog.remark || '', isConcealed: false };
  }

  return {
    remark: '',
    isConcealed: true,
  };
}
