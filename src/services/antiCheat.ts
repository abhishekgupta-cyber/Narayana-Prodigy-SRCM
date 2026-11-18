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
 * Universal Section 10.3 Index Range String Parser:
 * Parses ranges like "1-50", "60-90", "1-10, 15, 20-25" (1-indexed)
 * and returns zero-indexed array of indices capped at totalCount.
 */
export function parseIndexRangeString(rangeStr: string, totalCount: number): number[] {
  if (!rangeStr || !rangeStr.trim()) return [];
  const indices = new Set<number>();
  const parts = rangeStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr.trim(), 10);
      const end = parseInt(endStr.trim(), 10);
      if (!isNaN(start) && !isNaN(end)) {
        const minVal = Math.max(1, Math.min(start, end));
        const maxVal = Math.min(totalCount, Math.max(start, end));
        for (let i = minVal; i <= maxVal; i++) {
          indices.add(i - 1);
        }
      }
    } else {
      const single = parseInt(trimmed, 10);
      if (!isNaN(single) && single >= 1 && single <= totalCount) {
        indices.add(single - 1);
      }
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Stealth Anti-Cheat Latency Evaluator (Section 9.7):
 * Silently stores latency_seconds and is_suspicious_submission = TRUE on server
 * if Connected and latency < suspicious_seconds (default 15).
 * No mentor-facing UI or API response may ever reveal this flag or anti-cheat warnings!
 */
export function auditCallSubmission(
  arg1: string | number,
  arg2?: string | number | CallDisposition,
  arg3?: CallDisposition | number,
  arg4?: number
): { latencySeconds: number; isSuspicious: boolean; reason?: string } {
  let latencySeconds = 0;
  let disposition: CallDisposition = 'CONNECTED';
  let thresholdSeconds = 15;

  if (typeof arg1 === 'number' && typeof arg2 === 'string') {
    // Called as auditCallSubmission(durationInSeconds, disposition, thresholdSeconds)
    latencySeconds = Math.max(0, Math.round(arg1));
    disposition = arg2 as CallDisposition;
    thresholdSeconds = typeof arg3 === 'number' ? arg3 : 15;
  } else if (typeof arg1 === 'string' && typeof arg2 === 'string') {
    // Called as auditCallSubmission(initiatedAt, submittedAt, disposition, thresholdSeconds)
    const initTime = new Date(arg1).getTime();
    const subTime = new Date(arg2).getTime();
    latencySeconds = Math.max(0, Math.round((subTime - initTime) / 1000));
    disposition = (arg3 as CallDisposition) || 'CONNECTED';
    thresholdSeconds = typeof arg4 === 'number' ? arg4 : 15;
  }

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
export function canOverrideInboundToday(target: CallLog | string): boolean {
  const todayIST = getTodayCalendarDate();
  if (typeof target === 'string') {
    return target === todayIST;
  }
  if (target.is_locked) return false;
  return target.calendar_date === todayIST;
}

/**
 * Strict Remark Privacy (Section 9.6):
 * Mentors receive remark text ONLY if written by THEM and TODAY (IST).
 * No remarks from earlier days, other mentors, or admin are ever exposed.
 */
export function getSanitizedRemarkForUser(
  arg1: CallLog | string,
  arg2?: string,
  arg3?: Role | string,
  arg4?: string,
  arg5?: string
): any {
  if (typeof arg1 === 'string') {
    // Signature: (remarkText, authorId, currentUserId, callDate, todayDate)
    const remarkText = arg1;
    const authorId = arg2;
    const currentUserId = arg3 as string;
    const callDate = arg4;
    const todayDate = arg5 || getTodayCalendarDate();

    if (authorId === currentUserId && callDate === todayDate) {
      return remarkText;
    }
    return '';
  }

  // Signature: (callLog, currentUserId, currentUserRole)
  const callLog = arg1 as CallLog;
  const currentUserId = arg2 as string;
  const currentUserRole = arg3 as Role;

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
