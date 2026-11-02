/**
 * Narayana Prodigy Student Relation Call Management CRM
 * High-Performance Local & In-Memory Database Engine
 * Implements strict RBAC, IST day boundaries, single daily calllog with attempts,
 * stealth anti-cheat latency, 10.3 universal bulk selector, and Section 11 reports.
 */

import {
  AcademicSession,
  AttendanceAggregation,
  AttendanceRecord,
  AuditLog,
  CallActivity,
  CallAnalytics,
  CallAttempt,
  CallDisposition,
  CallLog,
  Campaign,
  CampaignAssignment,
  ExamResult,
  ExternalLead,
  PossibleMatch,
  Role,
  Settings,
  Student,
  StudentProfile,
  TaskStatus,
  UploadBatch,
  UploadChange,
  User,
} from '../types/crm';
import {
  auditCallSubmission,
  canOverrideInboundToday,
  formatISTDateTime,
  getSanitizedRemarkForUser,
  getTodayCalendarDate,
  istDay,
  maskPhoneNumber,
} from './antiCheat';
import { aggregateAttendance } from './excelIngestion';
import { REAL_ADMISSION_STUDENTS } from '../data/studentsData';
import { ALL_DEFAULT_USERS } from '../data/defaultUsers';

export const DEFAULT_ACADEMIC_SESSIONS: AcademicSession[] = [
  { id: 'session-2025-26', name: '2025-26', start_month: 4, is_active: false },
  { id: 'session-2026-27', name: '2026-27', start_month: 4, is_active: true },
  { id: 'session-2027-28', name: '2027-28', start_month: 4, is_active: false },
];

export const DEFAULT_SETTINGS: Settings = {
  pending_after_days: 2,
  suspicious_seconds: 15,
  attendance_leave_rule: 'EXCLUDE',
  dial_prefix: '+91',
  monthly_call_days: 30,
};

class CRMDatabase {
  private users: User[] = [];
  private sessions: AcademicSession[] = [];
  private activeSessionId: string = 'session-2026-27';
  private settings: Settings = { ...DEFAULT_SETTINGS };

  private profiles: StudentProfile[] = [];
  private students: Student[] = []; // Enrollments
  private callLogs: CallLog[] = [];
  private campaigns: Campaign[] = [];
  private campaignAssignments: CampaignAssignment[] = [];
  private externalLeads: ExternalLead[] = [];
  private exams: ExamResult[] = [];
  private attendance: AttendanceRecord[] = [];
  private uploadBatches: UploadBatch[] = [];
  private uploadChanges: UploadChange[] = [];
  private possibleMatches: PossibleMatch[] = [];
  private auditLogs: AuditLog[] = [];

  // Server-authoritative live dialer sessions: key = `${studentId}_${mentorId}`, val = started_at ISO
  private activeSessions: Map<string, { startedAt: string; contactUsed: 'PRIMARY' | 'ALTERNATE' }> = new Map();

  // Snapshot cache for Section 10.3 bulk selection preview (valid 10 mins)
  private selectionSnapshots: Map<string, { admissionNos: string[]; expiresAt: number }> = new Map();

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const savedUsers = localStorage.getItem('narayana_crm_users_v5');
      const savedSessions = localStorage.getItem('narayana_crm_sessions_v5');
      const savedActiveSession = localStorage.getItem('narayana_crm_active_session_v5');
      const savedSettings = localStorage.getItem('narayana_crm_settings_v5');
      const savedStudents = localStorage.getItem('narayana_crm_students_v5');
      const savedCalls = localStorage.getItem('narayana_crm_calls_v5');
      const savedCampaigns = localStorage.getItem('narayana_crm_campaigns_v5');
      const savedAssignments = localStorage.getItem('narayana_crm_assignments_v5');
      const savedLeads = localStorage.getItem('narayana_crm_leads_v5');
      const savedExams = localStorage.getItem('narayana_crm_exams_v5');
      const savedAttendance = localStorage.getItem('narayana_crm_attendance_v5');
      const savedBatches = localStorage.getItem('narayana_crm_batches_v5');
      const savedAudits = localStorage.getItem('narayana_crm_audits_v5');

      this.users = savedUsers ? JSON.parse(savedUsers) : [...ALL_DEFAULT_USERS];
      this.sessions = savedSessions ? JSON.parse(savedSessions) : [...DEFAULT_ACADEMIC_SESSIONS];
      this.activeSessionId = savedActiveSession || 'session-2026-27';
      this.settings = savedSettings ? JSON.parse(savedSettings) : { ...DEFAULT_SETTINGS };

      this.students = savedStudents ? JSON.parse(savedStudents) : this.processInitialStudents([...REAL_ADMISSION_STUDENTS]);
      this.callLogs = savedCalls ? JSON.parse(savedCalls) : [...this.getInitialCallLogs()];
      this.campaigns = savedCampaigns ? JSON.parse(savedCampaigns) : [...this.getInitialCampaigns()];
      this.campaignAssignments = savedAssignments ? JSON.parse(savedAssignments) : [...this.getInitialAssignments()];
      this.externalLeads = savedLeads ? JSON.parse(savedLeads) : [...this.getInitialLeads()];
      this.exams = savedExams ? JSON.parse(savedExams) : [];
      this.attendance = savedAttendance ? JSON.parse(savedAttendance) : [];
      this.uploadBatches = savedBatches ? JSON.parse(savedBatches) : [];
      this.auditLogs = savedAudits ? JSON.parse(savedAudits) : [];

      // Lock calls from prior days
      const todayIST = getTodayCalendarDate();
      let lockedAny = false;
      this.callLogs.forEach((c) => {
        if (c.calendar_date !== todayIST && !c.is_locked) {
          c.is_locked = true;
          lockedAny = true;
        }
      });
      if (lockedAny) this.saveCalls();
    } catch (e) {
      console.warn('DB Load Error, using seed data:', e);
      this.users = [...ALL_DEFAULT_USERS];
      this.sessions = [...DEFAULT_ACADEMIC_SESSIONS];
      this.activeSessionId = 'session-2026-27';
      this.settings = { ...DEFAULT_SETTINGS };
      this.students = this.processInitialStudents([...REAL_ADMISSION_STUDENTS]);
      this.callLogs = [...this.getInitialCallLogs()];
      this.campaigns = [...this.getInitialCampaigns()];
      this.campaignAssignments = [...this.getInitialAssignments()];
      this.externalLeads = [...this.getInitialLeads()];
    }
  }

  // --------------------------------------------------------------------------
  // PERSISTENCE HELPERS
  // --------------------------------------------------------------------------
  private saveUsers() {
    try { localStorage.setItem('narayana_crm_users_v5', JSON.stringify(this.users)); } catch {}
  }
  private saveStudents() {
    try { localStorage.setItem('narayana_crm_students_v5', JSON.stringify(this.students)); } catch {}
  }
  private saveCalls() {
    try { localStorage.setItem('narayana_crm_calls_v5', JSON.stringify(this.callLogs)); } catch {}
  }
  private saveCampaigns() {
    try { localStorage.setItem('narayana_crm_campaigns_v5', JSON.stringify(this.campaigns)); } catch {}
  }
  private saveAssignments() {
    try { localStorage.setItem('narayana_crm_assignments_v5', JSON.stringify(this.campaignAssignments)); } catch {}
  }
  private saveLeads() {
    try { localStorage.setItem('narayana_crm_leads_v5', JSON.stringify(this.externalLeads)); } catch {}
  }
  private saveExams() {
    try { localStorage.setItem('narayana_crm_exams_v5', JSON.stringify(this.exams)); } catch {}
  }
  private saveAttendance() {
    try { localStorage.setItem('narayana_crm_attendance_v5', JSON.stringify(this.attendance)); } catch {}
  }
  private saveBatches() {
    try { localStorage.setItem('narayana_crm_batches_v5', JSON.stringify(this.uploadBatches)); } catch {}
  }
  private saveAudits() {
    try { localStorage.setItem('narayana_crm_audits_v5', JSON.stringify(this.auditLogs)); } catch {}
  }
  private saveSettings() {
    try {
      localStorage.setItem('narayana_crm_settings_v5', JSON.stringify(this.settings));
      localStorage.setItem('narayana_crm_sessions_v5', JSON.stringify(this.sessions));
      localStorage.setItem('narayana_crm_active_session_v5', this.activeSessionId);
    } catch {}
  }

  // --------------------------------------------------------------------------
  // SESSIONS & SETTINGS (Section 5)
  // --------------------------------------------------------------------------
  public getSessions(): AcademicSession[] {
    return this.sessions;
  }

  public getActiveSession(): AcademicSession {
    const s = this.sessions.find((x) => x.id === this.activeSessionId);
    return s || this.sessions[0];
  }

  public setActiveSession(id: string) {
    if (this.sessions.some((s) => s.id === id)) {
      this.activeSessionId = id;
      this.saveSettings();
    }
  }

  public addSession(name: string): AcademicSession {
    const newSession: AcademicSession = {
      id: `session-${Date.now()}`,
      name: name.trim(),
      start_month: 4,
      is_active: true,
    };
    this.sessions.push(newSession);
    this.saveSettings();
    return newSession;
  }

  public getSettings(): Settings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<Settings>, adminUser?: User) {
    this.settings = { ...this.settings, ...partial };
    this.saveSettings();
    if (adminUser) {
      this.logAudit({
        user_name: adminUser.name,
        user_role: adminUser.role,
        action: 'SETTINGS_CHANGE',
        entity: 'Settings',
        entity_id: 'global',
        meta: partial,
      });
    }
  }

  // --------------------------------------------------------------------------
  // AUDIT LOGGING (Section 12)
  // --------------------------------------------------------------------------
  public logAudit(entry: Omit<AuditLog, 'id' | 'created_at'>) {
    const audit: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      ...entry,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.unshift(audit);
    if (this.auditLogs.length > 5000) {
      this.auditLogs = this.auditLogs.slice(0, 5000);
    }
    this.saveAudits();
  }

  public getAuditLogs(limit: number = 100): AuditLog[] {
    return this.auditLogs.slice(0, limit);
  }

  // --------------------------------------------------------------------------
  // IDENTITY & ENROLLMENT PROCESSING (D1, D2, D14)
  // --------------------------------------------------------------------------
  private processInitialStudents(raw: Student[]): Student[] {
    const compositeMap = new Map<string, Student[]>();

    raw.forEach((s) => {
      const nameKey = (s.user_name || '').trim().toLowerCase();
      const fatherKey = (s.father_name || '').trim().toLowerCase();
      const mobileKey = (s.student_mobile || '').replace(/\D/g, '').slice(-10);
      const personKey = `${nameKey}|${fatherKey}|${mobileKey}`;

      if (!compositeMap.has(personKey)) {
        compositeMap.set(personKey, []);
      }
      compositeMap.get(personKey)!.push(s);
    });

    const processed: Student[] = [];
    compositeMap.forEach((group, personKey) => {
      const isMulti = group.length > 1;
      const batches = group.map((st) => `${st.batch_name || st.course_name} (#${st.admission_no})`).join(', ');

      group.forEach((st) => {
        st.is_cross_batch_enrolled = isMulti;
        st.cross_batch_group_key = personKey;
        st.enrolled_batches_summary = isMulti ? batches : undefined;
        if (!st.academic_session_id) {
          st.academic_session_id = 'session-2026-27';
        }
        processed.push(st);
      });
    });

    return processed;
  }

  // --------------------------------------------------------------------------
  // USER / MENTOR MANAGEMENT (4.2)
  // --------------------------------------------------------------------------
  public getUsers(): User[] {
    return this.users;
  }

  public getMentors(): User[] {
    return this.users.filter((u) => u.role === 'MENTOR' && u.status === 'ACTIVE');
  }

  public addUser(userData: Omit<User, 'id'>, adminUser?: User): User {
    const newUser: User = {
      id: `user-${Date.now()}`,
      ...userData,
      status: userData.status || 'ACTIVE',
      created_at: new Date().toISOString(),
    };
    this.users.push(newUser);
    this.saveUsers();
    if (adminUser) {
      this.logAudit({
        user_name: adminUser.name,
        user_role: adminUser.role,
        action: 'ASSIGNMENT',
        entity: 'User',
        entity_id: newUser.id,
        meta: { name: newUser.name, role: newUser.role, designation: newUser.department },
      });
    }
    return newUser;
  }

  public updateUser(id: string, partial: Partial<User>, adminUser?: User): User {
    const idx = this.users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('User not found');
    this.users[idx] = { ...this.users[idx], ...partial };
    this.saveUsers();
    if (adminUser) {
      this.logAudit({
        user_name: adminUser.name,
        user_role: adminUser.role,
        action: 'SETTINGS_CHANGE',
        entity: 'User',
        entity_id: id,
        meta: partial,
      });
    }
    return this.users[idx];
  }

  // --------------------------------------------------------------------------
  // STUDENT DIRECTORY & QUERIES (Section 8, 9, 13)
  // --------------------------------------------------------------------------
  public getStudents(params: {
    page?: number;
    limit?: number;
    search?: string;
    batch?: string;
    course?: string;
    mentorId?: string;
    sessionId?: string;
    isCrossBatchOnly?: boolean;
    unassignedOnly?: boolean;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    userRole?: Role;
  }): {
    students: Student[];
    total: number;
    page: number;
    totalPages: number;
    uniqueStudentsCount: number;
    totalSeatsCount: number;
  } {
    const {
      page = 1,
      limit = 50,
      search = '',
      batch = 'ALL',
      course = 'ALL',
      mentorId,
      sessionId,
      isCrossBatchOnly = false,
      unassignedOnly = false,
      sortBy = 'user_name',
      sortDir = 'asc',
      userRole = 'MENTOR',
    } = params;

    let filtered = this.students.filter((s) => !s.deleted_at);

    // Session filter (unless "ALL")
    const targetSession = sessionId || this.activeSessionId;
    if (targetSession && targetSession !== 'ALL') {
      filtered = filtered.filter((s) => s.academic_session_id === targetSession || !s.academic_session_id);
    }

    if (mentorId) {
      filtered = filtered.filter((s) => s.mentor_id === mentorId);
    }

    if (unassignedOnly) {
      // Unassigned in campaigns or unassigned mentor
      filtered = filtered.filter((s) => !s.mentor_id);
    }

    if (isCrossBatchOnly) {
      filtered = filtered.filter((s) => s.is_cross_batch_enrolled);
    }

    if (batch && batch !== 'ALL') {
      filtered = filtered.filter((s) => s.batch_name === batch);
    }

    if (course && course !== 'ALL') {
      filtered = filtered.filter((s) => s.course_name === course);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((s) =>
        s.user_name.toLowerCase().includes(q) ||
        s.father_name.toLowerCase().includes(q) ||
        s.admission_no.toLowerCase().includes(q) ||
        s.student_mobile.includes(q) ||
        (s.batch_name && s.batch_name.toLowerCase().includes(q)) ||
        (s.mentor_name && s.mentor_name.toLowerCase().includes(q))
      );
    }

    // Stable Sorting
    filtered.sort((a, b) => {
      let valA = (a as any)[sortBy] || '';
      let valB = (b as any)[sortBy] || '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      // Tie breaker by admission_no
      return a.admission_no.localeCompare(b.admission_no);
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const paged = filtered.slice(start, start + limit);

    // Mask phone numbers if user is non-admin (Section 9.1)
    const sanitizedStudents = paged.map((st) => {
      if (userRole === 'SUPER_ADMIN') {
        return st;
      }
      return {
        ...st,
        student_mobile: maskPhoneNumber(st.student_mobile, 'MENTOR'),
        whatsapp_number: maskPhoneNumber(st.whatsapp_number, 'MENTOR'),
      };
    });

    const uniqueSet = new Set(filtered.map((s) => s.cross_batch_group_key || s.admission_no));

    return {
      students: sanitizedStudents,
      total,
      page,
      totalPages,
      uniqueStudentsCount: uniqueSet.size,
      totalSeatsCount: total,
    };
  }

  public getStudentByAdmissionNo(admNo: string, userRole: Role = 'MENTOR'): Student | undefined {
    const s = this.students.find((x) => x.admission_no === admNo && !x.deleted_at);
    if (!s) return undefined;
    if (userRole === 'SUPER_ADMIN') return s;
    return {
      ...s,
      student_mobile: maskPhoneNumber(s.student_mobile, 'MENTOR'),
      whatsapp_number: maskPhoneNumber(s.whatsapp_number, 'MENTOR'),
    };
  }

  // --------------------------------------------------------------------------
  // CALLING ENGINE & SESSIONS (Section 9)
  // --------------------------------------------------------------------------
  /**
   * Starts a call session (Section 9.1 & 9.2):
   * Verifies ownership, logs UNMASK audit log, returns raw numbers,
   * and starts/resumes a server-authoritative timer that never restarts on re-click/refresh.
   */
  public startCallSession(params: {
    studentId: string;
    mentorId: string;
    mentorName: string;
    contactUsed: 'PRIMARY' | 'ALTERNATE';
  }): {
    unmaskedPrimary: string;
    unmaskedAlternate: string;
    firstInitiatedAt: string;
    elapsedSeconds: number;
    dialLink: string;
  } {
    const { studentId, mentorId, mentorName, contactUsed } = params;
    const student = this.students.find((s) => s.admission_no === studentId);
    if (!student) throw new Error('Student not found');

    // Ownership check (Section 9.1)
    const isOwner = student.mentor_id === mentorId;
    const hasTask = this.campaignAssignments.some(
      (a) => a.student_id === studentId && a.mentor_id === mentorId && a.completion_status !== 'COMPLETED'
    );
    if (!isOwner && !hasTask) {
      throw new Error('Access Denied: You are not authorized to call this student.');
    }

    // Audit UNMASK
    this.logAudit({
      user_name: mentorName,
      user_role: 'MENTOR',
      action: 'UNMASK_PHONE',
      entity: 'Student',
      entity_id: studentId,
      meta: { contactUsed },
    });

    const sessionKey = `${studentId}_${mentorId}`;
    let session = this.activeSessions.get(sessionKey);

    const now = new Date();
    if (!session) {
      session = { startedAt: now.toISOString(), contactUsed };
      this.activeSessions.set(sessionKey, session);
    }

    const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000));
    const targetPhone = contactUsed === 'PRIMARY' ? student.student_mobile : student.whatsapp_number;
    const cleanPhone = (targetPhone || '').replace(/\D/g, '');
    const dialLink = `tel:${this.settings.dial_prefix}${cleanPhone}`;

    return {
      unmaskedPrimary: student.student_mobile,
      unmaskedAlternate: student.whatsapp_number,
      firstInitiatedAt: session.startedAt,
      elapsedSeconds: elapsed,
      dialLink,
    };
  }

  /**
   * Submits a call disposition (Section 9.2, 9.3, 9.7):
   * Enforces single CallLog per student per day per mentor (unique key).
   * Appends CallAttempt and CallActivity records.
   * Silently applies stealth anti-cheat latency evaluation.
   */
  public submitCallDisposition(data: {
    studentId: string;
    mentorId: string;
    mentorName: string;
    campaignId?: string;
    campaignOutcome?: string;
    disposition: CallDisposition;
    remark: string;
    followUpDate?: string;
    followUpTime?: string;
    callDurationSec: number;
    initiatedAt?: string | null;
    contactUsed?: 'PRIMARY' | 'ALTERNATE';
  }): { callLog: CallLog; isNewRow: boolean } {
    const todayIST = getTodayCalendarDate();
    const nowIso = new Date().toISOString();

    const student = this.students.find((s) => s.admission_no === data.studentId);
    if (!student) throw new Error('Student not found');

    const sessionKey = `${data.studentId}_${data.mentorId}`;
    const activeSession = this.activeSessions.get(sessionKey);
    const initiatedAt = activeSession?.startedAt || data.initiatedAt || nowIso;

    // Stealth Anti-Cheat Latency Evaluation (Section 9.7)
    const auditResult = auditCallSubmission(
      initiatedAt,
      nowIso,
      data.disposition,
      this.settings.suspicious_seconds
    );

    // Clean active session
    this.activeSessions.delete(sessionKey);

    // Check existing CallLog for this student + mentor + todayIST
    let existingLog = this.callLogs.find(
      (c) => c.student_id === data.studentId && c.mentor_id === data.mentorId && c.calendar_date === todayIST
    );

    let isNew = false;
    const attempt: CallAttempt = {
      id: `att-${Date.now()}`,
      call_log_id: existingLog ? existingLog.id : '',
      contact_used: data.contactUsed || 'PRIMARY',
      started_at: initiatedAt,
      duration_seconds: data.callDurationSec,
    };

    const activity: CallActivity = {
      id: `act-${Date.now()}`,
      call_log_id: existingLog ? existingLog.id : '',
      type: 'INITIAL_SUBMIT',
      disposition_after: data.disposition,
      remark_text: data.remark.trim(),
      reminder_after: data.followUpDate,
      by_user: data.mentorName,
      created_at: nowIso,
    };

    if (existingLog) {
      // Append attempt & activity to existing log (Section 9.3)
      attempt.call_log_id = existingLog.id;
      activity.call_log_id = existingLog.id;
      existingLog.attempts = [...(existingLog.attempts || []), attempt];
      existingLog.activities = [...(existingLog.activities || []), activity];
      existingLog.last_submitted_at = nowIso;
      existingLog.disposition = data.disposition;
      existingLog.campaign_outcome = data.campaignOutcome || existingLog.campaign_outcome;
      existingLog.remark = data.remark.trim();
      existingLog.call_duration_sec += data.callDurationSec;
      if (auditResult.isSuspicious) {
        existingLog.is_suspicious = true;
        existingLog.suspicious_reason = auditResult.reason;
      }
      if (data.followUpDate) {
        existingLog.follow_up_date = data.followUpDate;
        existingLog.follow_up_time = data.followUpTime || '10:00 AM';
        existingLog.follow_up_status = 'PENDING';
      }
    } else {
      isNew = true;
      const newLogId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      attempt.call_log_id = newLogId;
      activity.call_log_id = newLogId;

      existingLog = {
        id: newLogId,
        student_id: data.studentId,
        mentor_id: data.mentorId,
        mentor_name: data.mentorName,
        campaign_id: data.campaignId,
        campaign_outcome: data.campaignOutcome,
        academic_session_id: student.academic_session_id || this.activeSessionId,
        call_date: todayIST,
        calendar_date: todayIST,
        call_initiated_at: initiatedAt,
        first_initiated_at: initiatedAt,
        last_submitted_at: nowIso,
        latency_seconds: auditResult.latencySeconds,
        is_suspicious: auditResult.isSuspicious,
        suspicious_reason: auditResult.reason,
        disposition: data.disposition,
        call_duration_sec: data.callDurationSec,
        remark: data.remark.trim(),
        call_type: 'OUTBOUND',
        status: 'SUBMITTED',
        is_inbound_override: false,
        is_locked: false,
        follow_up_date: data.followUpDate,
        follow_up_time: data.followUpTime || '10:00 AM',
        follow_up_status: data.followUpDate ? 'PENDING' : undefined,
        attempts: [attempt],
        activities: [activity],
      };
      this.callLogs.unshift(existingLog);
    }

    // Update Student cached state
    student.last_call_date = todayIST;
    student.last_call_disposition = data.disposition;
    student.call_status_today = 'CALLED_TODAY';
    student.active_reminder_date = data.followUpDate || undefined;
    if (data.disposition === 'CONNECTED') {
      student.last_connected_at = nowIso;
    }

    // Update Campaign Task if applicable (D6: Connected or Wrong Number = COMPLETED, else ATTEMPTED)
    const taskStatus: TaskStatus = (data.disposition === 'CONNECTED' || data.disposition === 'WRONG_NUMBER')
      ? 'COMPLETED'
      : 'ATTEMPTED';

    const task = this.campaignAssignments.find(
      (a) => a.student_id === data.studentId && a.mentor_id === data.mentorId && a.completion_status !== 'COMPLETED'
    );
    if (task) {
      task.completion_status = taskStatus;
      if (taskStatus === 'COMPLETED') {
        task.completed_at = nowIso;
      }
      this.saveAssignments();
    }

    this.saveCalls();
    this.saveStudents();

    this.logAudit({
      user_name: data.mentorName,
      user_role: 'MENTOR',
      action: 'CALL_SUBMIT',
      entity: 'CallLog',
      entity_id: existingLog.id,
      meta: { disposition: data.disposition, duration: data.callDurationSec, isSuspicious: auditResult.isSuspicious },
    });

    return { callLog: existingLog, isNewRow: isNew };
  }

  /**
   * Same-Day Inbound Callback Override (Section 9.5):
   * Valid until 11:59:59 PM IST of the call's day.
   * Appends to CallActivity without overwriting earlier notes.
   */
  public overrideInboundCallback(params: {
    callId: string;
    newDisposition: CallDisposition;
    newRemark: string;
    newFollowUpDate?: string;
    clearFollowUp?: boolean;
    callerName?: string;
  }): CallLog {
    const call = this.callLogs.find((c) => c.id === params.callId);
    if (!call) throw new Error('Call log not found');
    if (!canOverrideInboundToday(call)) {
      throw new Error('Call log locked: Same-day inbound callback window expires at midnight IST.');
    }

    const nowIso = new Date().toISOString();

    const activity: CallActivity = {
      id: `act-${Date.now()}`,
      call_log_id: call.id,
      type: 'INBOUND_UPDATE',
      disposition_after: params.newDisposition,
      remark_text: params.newRemark.trim(),
      reminder_after: params.clearFollowUp ? undefined : params.newFollowUpDate,
      by_user: params.callerName || call.mentor_name,
      created_at: nowIso,
    };

    call.activities = [...(call.activities || []), activity];
    call.is_inbound_override = true;
    call.original_disposition = call.original_disposition || call.disposition;
    call.original_remark = call.original_remark || call.remark;
    call.disposition = params.newDisposition;
    call.remark = `${call.remark} | [Inbound Callback]: ${params.newRemark.trim()}`;
    call.override_timestamp = nowIso;

    if (params.clearFollowUp) {
      call.follow_up_date = undefined;
      call.follow_up_status = 'CLEARED';
    } else if (params.newFollowUpDate) {
      call.follow_up_date = params.newFollowUpDate;
      call.follow_up_status = 'PENDING';
    }

    // Update Student
    const student = this.students.find((s) => s.admission_no === call.student_id);
    if (student) {
      student.last_call_disposition = params.newDisposition;
      if (params.newDisposition === 'CONNECTED') {
        student.last_connected_at = nowIso;
      }
      student.active_reminder_date = params.clearFollowUp ? undefined : params.newFollowUpDate;
      this.saveStudents();
    }

    // Recalculate Task
    const task = this.campaignAssignments.find(
      (a) => a.student_id === call.student_id && a.mentor_id === call.mentor_id
    );
    if (task) {
      if (params.newDisposition === 'CONNECTED' || params.newDisposition === 'WRONG_NUMBER') {
        task.completion_status = 'COMPLETED';
        task.completed_at = nowIso;
      }
      this.saveAssignments();
    }

    this.saveCalls();

    this.logAudit({
      user_name: call.mentor_name,
      user_role: 'MENTOR',
      action: 'INBOUND_UPDATE',
      entity: 'CallLog',
      entity_id: call.id,
      meta: { newDisposition: params.newDisposition },
    });

    return call;
  }

  // --------------------------------------------------------------------------
  // MENTOR WORKSPACE 4-CHIP BUCKETS (Section 9.4)
  // --------------------------------------------------------------------------
  public getMentorAssignedBuckets(mentorId: string): {
    calledToday: CampaignAssignment[];
    remindersDue: CampaignAssignment[];
    pending: CampaignAssignment[];
    newCalls: CampaignAssignment[];
    monthlyDueCount: number;
  } {
    const todayIST = getTodayCalendarDate();
    const now = new Date();
    const thresholdDays = this.settings.pending_after_days;

    // Find all tasks assigned to this mentor
    const allMentorTasks = this.campaignAssignments.filter((a) => a.mentor_id === mentorId);

    // Attach student/lead objects
    const enrichedTasks = allMentorTasks.map((t) => {
      const student = this.students.find((s) => s.admission_no === t.student_id);
      return {
        ...t,
        student: student ? {
          ...student,
          student_mobile: maskPhoneNumber(student.student_mobile, 'MENTOR'),
          whatsapp_number: maskPhoneNumber(student.whatsapp_number, 'MENTOR'),
        } : undefined,
      };
    });

    const calledToday: CampaignAssignment[] = [];
    const remindersDue: CampaignAssignment[] = [];
    const pending: CampaignAssignment[] = [];
    const newCalls: CampaignAssignment[] = [];

    // Precedence top to bottom (D8):
    // 1. Called Today: has CallLog today (stays visible!)
    // 2. Reminders Due: pending reminder with remind_at <= todayIST
    // 3. Pending: unattempted and older than threshold (Overdue), or Attempted on earlier day
    // 4. New: assigned within threshold
    enrichedTasks.forEach((task) => {
      const studentId = task.student_id;
      const todayCall = this.callLogs.find(
        (c) => c.student_id === studentId && c.mentor_id === mentorId && c.calendar_date === todayIST
      );

      if (todayCall) {
        calledToday.push(task);
        return;
      }

      // Check reminder
      const student = this.students.find((s) => s.admission_no === studentId);
      if (student?.active_reminder_date && student.active_reminder_date <= todayIST) {
        remindersDue.push(task);
        return;
      }

      // If task is completed and not called today, it moves to Call History after midnight
      if (task.completion_status === 'COMPLETED') {
        return;
      }

      // Check age rule (D7)
      const assignedDay = istDay(task.assigned_date);
      const diffMs = now.getTime() - new Date(task.assigned_date).getTime();
      const ageDays = diffMs / (1000 * 60 * 60 * 24);

      if (task.completion_status === 'ATTEMPTED' || ageDays >= thresholdDays) {
        pending.push(task);
      } else {
        newCalls.push(task);
      }
    });

    // Monthly Rule (D10, 9.11): Students with no Connected call in 30 days
    const monthlyThresholdMs = this.settings.monthly_call_days * 24 * 60 * 60 * 1000;
    const monthlyDueCount = this.students.filter((s) => {
      if (s.mentor_id !== mentorId) return false;
      const lastConn = s.last_connected_at ? new Date(s.last_connected_at).getTime() : new Date(s.created_at).getTime();
      return (now.getTime() - lastConn) > monthlyThresholdMs;
    }).length;

    return {
      calledToday,
      remindersDue,
      pending,
      newCalls,
      monthlyDueCount,
    };
  }

  public getMentorCallHistory(mentorId: string, limit: number = 100): CallLog[] {
    const todayIST = getTodayCalendarDate();
    const calls = this.callLogs.filter((c) => c.mentor_id === mentorId);

    // Apply strict remark privacy (Section 9.6): Remarks only visible if written by them TODAY
    return calls.slice(0, limit).map((c) => {
      const sanitized = getSanitizedRemarkForUser(c, mentorId, 'MENTOR');
      return {
        ...c,
        remark: sanitized.remark,
      };
    });
  }

  public getCallsForStudent(studentId: string, userRole: Role, currentUserId?: string): CallLog[] {
    const calls = this.callLogs.filter((c) => c.student_id === studentId);
    if (userRole === 'SUPER_ADMIN') {
      return calls;
    }
    // Mentor view: strict remark privacy
    return calls.map((c) => {
      const sanitized = getSanitizedRemarkForUser(c, currentUserId || '', 'MENTOR');
      return {
        ...c,
        remark: sanitized.remark,
      };
    });
  }

  // --------------------------------------------------------------------------
  // UNIVERSAL BULK SELECTOR ENGINE (Section 10.3)
  // --------------------------------------------------------------------------
  /**
   * Parses universal selection syntax:
   * - Presets: 'ALL', 10, 25, 50, 100, 250, 500
   * - Range text: "1-50", "60-90", "1-10, 15, 20-25" (1-indexed based on full sorted list)
   * - Exact count: N
   */
  public parseIndexRange(inputStr: string, totalRows: number): number[] {
    const cleaned = inputStr.trim();
    if (!cleaned) return [];

    const indices = new Set<number>();
    const parts = cleaned.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
          throw new Error(`Invalid range syntax: "${trimmed}". Expected format like "1-50" or "60-90".`);
        }
        for (let i = start; i <= Math.min(end, totalRows); i++) {
          indices.add(i - 1); // 0-indexed
        }
      } else {
        const single = parseInt(trimmed, 10);
        if (isNaN(single) || single < 1) {
          throw new Error(`Invalid row index: "${trimmed}". Expected positive number.`);
        }
        if (single <= totalRows) {
          indices.add(single - 1);
        }
      }
    }

    return Array.from(indices).sort((a, b) => a - b);
  }

  /**
   * Previews a bulk selection and stores a snapshot token valid for 10 minutes (Section 10.3).
   */
  public previewBulkSelection(params: {
    sessionId?: string;
    batch?: string;
    course?: string;
    mentorId?: string;
    search?: string;
    onlyUnassigned?: boolean;
    selectionMode: 'PRESET' | 'RANGE' | 'EXACT_COUNT';
    presetCount?: number | 'ALL';
    rangeString?: string;
    exactCount?: number;
    campaignId?: string;
  }): {
    snapshotToken: string;
    totalSelected: number;
    sampleRows: Student[];
    skippedAlreadyActive: number;
  } {
    // 1. Fetch entire matching filtered list
    const queryRes = this.getStudents({
      page: 1,
      limit: 100000,
      sessionId: params.sessionId,
      batch: params.batch,
      course: params.course,
      mentorId: params.mentorId,
      search: params.search,
      unassignedOnly: params.onlyUnassigned,
      userRole: 'SUPER_ADMIN',
    });

    const fullList = queryRes.students;
    let selectedIndices: number[] = [];

    if (params.selectionMode === 'PRESET') {
      if (params.presetCount === 'ALL') {
        selectedIndices = fullList.map((_, i) => i);
      } else {
        const count = params.presetCount || 50;
        selectedIndices = fullList.slice(0, count).map((_, i) => i);
      }
    } else if (params.selectionMode === 'RANGE') {
      selectedIndices = this.parseIndexRange(params.rangeString || '', fullList.length);
    } else if (params.selectionMode === 'EXACT_COUNT') {
      const count = Math.max(1, params.exactCount || 1);
      selectedIndices = fullList.slice(0, count).map((_, i) => i);
    }

    const targetStudents = selectedIndices.map((i) => fullList[i]).filter(Boolean);

    // Check which ones are already active in this campaign or have active tasks
    let skipped = 0;
    const finalAdmissionNos: string[] = [];

    targetStudents.forEach((st) => {
      const hasActive = this.campaignAssignments.some(
        (a) => a.student_id === st.admission_no &&
               (params.campaignId ? a.campaign_id === params.campaignId : true) &&
               a.completion_status !== 'COMPLETED'
      );
      if (hasActive) {
        skipped++;
      } else {
        finalAdmissionNos.push(st.admission_no);
      }
    });

    const snapshotToken = `snap-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    this.selectionSnapshots.set(snapshotToken, {
      admissionNos: finalAdmissionNos,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 mins
    });

    const sample = finalAdmissionNos.slice(0, 5).map((adm) => this.students.find((s) => s.admission_no === adm)!).filter(Boolean);

    return {
      snapshotToken,
      totalSelected: finalAdmissionNos.length,
      sampleRows: sample,
      skippedAlreadyActive: skipped,
    };
  }

  /**
   * Confirms bulk assignment using snapshot token and splits equally among selected mentors (Section 10.3).
   */
  public confirmBulkAssignment(params: {
    snapshotToken: string;
    campaignId: string;
    targetMentorIds: string[];
    assignedDate?: string;
    dueDate?: string;
    adminUser?: User;
  }): { assignedCount: number; mentorBreakdown: Record<string, number> } {
    const snap = this.selectionSnapshots.get(params.snapshotToken);
    if (!snap) throw new Error('Selection snapshot expired or invalid. Please preview selection again.');
    if (Date.now() > snap.expiresAt) {
      this.selectionSnapshots.delete(params.snapshotToken);
      throw new Error('Selection snapshot expired (10-minute limit). Please preview selection again.');
    }

    const campaign = this.campaigns.find((c) => c.id === params.campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const mentorIds = params.targetMentorIds;
    if (mentorIds.length === 0) throw new Error('Please select at least one mentor.');

    const admissionNos = snap.admissionNos;
    const mentorBreakdown: Record<string, number> = {};
    mentorIds.forEach((m) => (mentorBreakdown[m] = 0));

    const assignDate = params.assignedDate || getTodayCalendarDate();

    // Equal split with contiguous blocks; first mentors take remainder (Section 10.3)
    const total = admissionNos.length;
    const baseCount = Math.floor(total / mentorIds.length);
    const remainder = total % mentorIds.length;

    let currentIndex = 0;
    mentorIds.forEach((mentorId, idx) => {
      const take = baseCount + (idx < remainder ? 1 : 0);
      const mentorAdmissions = admissionNos.slice(currentIndex, currentIndex + take);
      currentIndex += take;

      mentorAdmissions.forEach((admNo) => {
        const assignment: CampaignAssignment = {
          id: `asg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          campaign_id: campaign.id,
          campaign_title: campaign.title,
          campaign_purpose: campaign.purpose,
          student_id: admNo,
          mentor_id: mentorId,
          assigned_date: assignDate,
          due_date: params.dueDate,
          completion_status: 'ASSIGNED',
          assigned_by: params.adminUser?.name || 'Administrator',
        };
        this.campaignAssignments.push(assignment);
        mentorBreakdown[mentorId]++;
      });
    });

    this.saveAssignments();
    this.selectionSnapshots.delete(params.snapshotToken);

    if (params.adminUser) {
      this.logAudit({
        user_name: params.adminUser.name,
        user_role: params.adminUser.role,
        action: 'ASSIGNMENT',
        entity: 'Campaign',
        entity_id: campaign.id,
        meta: { totalAssigned: total, mentorBreakdown },
      });
    }

    return { assignedCount: total, mentorBreakdown };
  }

  // --------------------------------------------------------------------------
  // CAMPAIGNS (Section 10.1)
  // --------------------------------------------------------------------------
  public getCampaigns(): Campaign[] {
    return this.campaigns.filter((c) => c.status !== 'DELETED');
  }

  public createCampaign(data: {
    title: string;
    purpose: string;
    session_id?: string;
    assignment_date: string;
    due_date?: string;
    outcome_options: string[];
    target_mentor_ids: string[];
  }): Campaign {
    const newCamp: Campaign = {
      id: `camp-${Date.now()}`,
      title: data.title.trim(),
      purpose: data.purpose.trim(),
      session_id: data.session_id || this.activeSessionId,
      assignment_date: data.assignment_date,
      due_date: data.due_date,
      outcome_options: data.outcome_options.length > 0 ? data.outcome_options : ['Connected', 'Callback Requested', 'Wrong Number'],
      target_mentor_ids: data.target_mentor_ids,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
    this.campaigns.unshift(newCamp);
    this.saveCampaigns();
    return newCamp;
  }

  public updateCampaign(id: string, partial: Partial<Campaign>): Campaign {
    const idx = this.campaigns.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Campaign not found');
    this.campaigns[idx] = { ...this.campaigns[idx], ...partial };
    this.saveCampaigns();
    return this.campaigns[idx];
  }

  public deleteCampaign(id: string, adminUser?: User): { affectedTasks: number; affectedCalls: number } {
    const idx = this.campaigns.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Campaign not found');

    const affectedTasks = this.campaignAssignments.filter((a) => a.campaign_id === id).length;
    const affectedCalls = this.callLogs.filter((c) => c.campaign_id === id).length;

    // Soft delete per Section 10.1 (call history is preserved!)
    this.campaigns[idx].status = 'DELETED';
    this.saveCampaigns();

    if (adminUser) {
      this.logAudit({
        user_name: adminUser.name,
        user_role: adminUser.role,
        action: 'SETTINGS_CHANGE',
        entity: 'Campaign',
        entity_id: id,
        meta: { affectedTasks, affectedCalls },
      });
    }

    return { affectedTasks, affectedCalls };
  }

  // --------------------------------------------------------------------------
  // UPLOAD CENTER, BATCHES & ROLLBACK (Section 7.6)
  // --------------------------------------------------------------------------
  public recordUploadBatch(batch: Omit<UploadBatch, 'id' | 'uploaded_at'>): UploadBatch {
    const newBatch: UploadBatch = {
      id: `batch-${Date.now()}`,
      uploaded_at: new Date().toISOString(),
      ...batch,
    };
    this.uploadBatches.unshift(newBatch);
    this.saveBatches();
    return newBatch;
  }

  public getUploadBatches(): UploadBatch[] {
    return this.uploadBatches;
  }

  public rollbackUploadBatch(batchId: string, adminUser?: User): {
    rolledBackCount: number;
    retainedCount: number;
  } {
    const batch = this.uploadBatches.find((b) => b.id === batchId);
    if (!batch) throw new Error('Upload batch not found');

    let rolledBack = 0;
    let retained = 0;

    // Identify rows belonging to this batch
    this.students.forEach((s) => {
      if (s.upload_batch_id === batchId) {
        // If has call history or active campaign assignment, KEEP IT! (Section 7.6)
        const hasHistory = this.callLogs.some((c) => c.student_id === s.admission_no) ||
                           this.campaignAssignments.some((a) => a.student_id === s.admission_no);
        if (hasHistory) {
          retained++;
        } else {
          s.deleted_at = new Date().toISOString();
          rolledBack++;
        }
      }
    });

    batch.status = 'ROLLED_BACK';
    this.saveStudents();
    this.saveBatches();

    if (adminUser) {
      this.logAudit({
        user_name: adminUser.name,
        user_role: adminUser.role,
        action: 'ROLLBACK',
        entity: 'UploadBatch',
        entity_id: batchId,
        meta: { rolledBack, retained },
      });
    }

    return { rolledBackCount: rolledBack, retainedCount: retained };
  }

  // --------------------------------------------------------------------------
  // 5 DEDICATED ADMIN REPORTS (Section 11)
  // --------------------------------------------------------------------------
  /**
   * Report A: Admission Report (completely separate from calling)
   */
  public getAdmissionReport(params: {
    sessionId?: string;
    from?: string;
    to?: string;
  }) {
    const session = params.sessionId || this.activeSessionId;
    let list = this.students.filter((s) => !s.deleted_at);
    if (session && session !== 'ALL') {
      list = list.filter((s) => s.academic_session_id === session || !s.academic_session_id);
    }

    const batchBreakdown: Record<string, number> = {};
    const courseBreakdown: Record<string, number> = {};
    const mentorBreakdown: Record<string, number> = {};

    list.forEach((s) => {
      const b = s.batch_name || 'General';
      batchBreakdown[b] = (batchBreakdown[b] || 0) + 1;

      const c = s.course_name || 'Unassigned';
      courseBreakdown[c] = (courseBreakdown[c] || 0) + 1;

      const m = s.mentor_name || 'Unmapped';
      mentorBreakdown[m] = (mentorBreakdown[m] || 0) + 1;
    });

    const uniqueSet = new Set(list.map((s) => s.cross_batch_group_key || s.admission_no));

    return {
      totalAdmissions: list.length,
      uniqueStudents: uniqueSet.size,
      crossBatchCount: list.filter((s) => s.is_cross_batch_enrolled).length,
      batchBreakdown,
      courseBreakdown,
      mentorBreakdown,
      studentsList: list,
    };
  }

  /**
   * Report B: Calling Report (disposition breakdown, calls vs attempts)
   */
  public getCallingReport(params: {
    sessionId?: string;
    campaignId?: string;
    mentorId?: string;
    batch?: string;
    disposition?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    let calls = this.callLogs;
    if (params.sessionId && params.sessionId !== 'ALL') {
      calls = calls.filter((c) => c.academic_session_id === params.sessionId);
    }
    if (params.campaignId && params.campaignId !== 'ALL') {
      calls = calls.filter((c) => c.campaign_id === params.campaignId);
    }
    if (params.mentorId && params.mentorId !== 'ALL') {
      calls = calls.filter((c) => c.mentor_id === params.mentorId);
    }
    if (params.disposition && params.disposition !== 'ALL') {
      calls = calls.filter((c) => c.disposition === params.disposition);
    }
    if (params.fromDate) {
      calls = calls.filter((c) => c.calendar_date >= params.fromDate!);
    }
    if (params.toDate) {
      calls = calls.filter((c) => c.calendar_date <= params.toDate!);
    }

    const dispositionCounts: Record<string, number> = {};
    let totalAttempts = 0;

    calls.forEach((c) => {
      dispositionCounts[c.disposition] = (dispositionCounts[c.disposition] || 0) + 1;
      totalAttempts += c.attempts?.length || 1;
    });

    return {
      totalCalls: calls.length,
      totalAttempts,
      dispositionCounts,
      calls,
    };
  }

  /**
   * Report C: Mentor Tracking (one-to-one deep dive)
   */
  public getMentorTracking(mentorId: string, fromDate?: string, toDate?: string) {
    const mentor = this.users.find((u) => u.id === mentorId);
    if (!mentor) throw new Error('Mentor not found');

    let calls = this.callLogs.filter((c) => c.mentor_id === mentorId);
    if (fromDate) calls = calls.filter((c) => c.calendar_date >= fromDate);
    if (toDate) calls = calls.filter((c) => c.calendar_date <= toDate);

    const assignments = this.campaignAssignments.filter((a) => a.mentor_id === mentorId);
    const completedTasks = assignments.filter((a) => a.completion_status === 'COMPLETED').length;
    const pendingTasks = assignments.filter((a) => a.completion_status === 'ASSIGNED' || a.completion_status === 'ATTEMPTED').length;

    const suspiciousCount = calls.filter((c) => c.is_suspicious).length;

    const dispositionCounts: Record<string, number> = {};
    calls.forEach((c) => {
      dispositionCounts[c.disposition] = (dispositionCounts[c.disposition] || 0) + 1;
    });

    return {
      mentor,
      totalAssignedTasks: assignments.length,
      completedTasks,
      pendingTasks,
      totalCalls: calls.length,
      suspiciousCount,
      dispositionCounts,
      calls,
    };
  }

  /**
   * Report D: Batch-Wise Call Audit (IOQM case, including 0-call students)
   */
  public getBatchWiseCallAudit(batchOrCampaignId: string) {
    // Find all students in this batch or assigned in this campaign
    let students = this.students.filter((s) => s.batch_name === batchOrCampaignId && !s.deleted_at);
    if (students.length === 0) {
      // Check if it's a campaign ID
      const asg = this.campaignAssignments.filter((a) => a.campaign_id === batchOrCampaignId);
      const studentIds = new Set(asg.map((a) => a.student_id));
      students = this.students.filter((s) => studentIds.has(s.admission_no) && !s.deleted_at);
    }

    const auditRows = students.map((st) => {
      const calls = this.callLogs.filter((c) => c.student_id === st.admission_no);
      let attemptsCount = 0;
      const mentorsWhoCalled = new Set<string>();
      calls.forEach((c) => {
        attemptsCount += c.attempts?.length || 1;
        mentorsWhoCalled.add(c.mentor_name);
      });

      return {
        student: st,
        callsCount: calls.length,
        attemptsCount,
        mentorsWhoCalled: Array.from(mentorsWhoCalled).join(', '),
        calls,
      };
    });

    return {
      batchOrCampaign: batchOrCampaignId,
      totalStudents: students.length,
      auditRows,
    };
  }

  /**
   * Report E: Master Consolidated Campaign Report (Section 11.E)
   */
  public getConsolidatedCampaignReport(campaignId: string) {
    const campaign = this.campaigns.find((c) => c.id === campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const assignments = this.campaignAssignments.filter((a) => a.campaign_id === campaignId);
    const calls = this.callLogs.filter((c) => c.campaign_id === campaignId);

    const mentorSplit: Record<string, { assigned: number; completed: number; connected: number }> = {};
    assignments.forEach((a) => {
      if (!mentorSplit[a.mentor_id]) {
        mentorSplit[a.mentor_id] = { assigned: 0, completed: 0, connected: 0 };
      }
      mentorSplit[a.mentor_id].assigned++;
      if (a.completion_status === 'COMPLETED') {
        mentorSplit[a.mentor_id].completed++;
      }
    });

    calls.forEach((c) => {
      if (mentorSplit[c.mentor_id] && c.disposition === 'CONNECTED') {
        mentorSplit[c.mentor_id].connected++;
      }
    });

    const dispositionCounts: Record<string, number> = {};
    const outcomeCounts: Record<string, number> = {};

    calls.forEach((c) => {
      dispositionCounts[c.disposition] = (dispositionCounts[c.disposition] || 0) + 1;
      if (c.campaign_outcome) {
        outcomeCounts[c.campaign_outcome] = (outcomeCounts[c.campaign_outcome] || 0) + 1;
      }
    });

    return {
      campaign,
      totalAssigned: assignments.length,
      totalCompleted: assignments.filter((a) => a.completion_status === 'COMPLETED').length,
      totalCalls: calls.length,
      mentorSplit,
      dispositionCounts,
      outcomeCounts,
      calls,
    };
  }

  // --------------------------------------------------------------------------
  // EXECUTIVE KPI ANALYTICS (Section 6 & 11)
  // --------------------------------------------------------------------------
  public getAnalytics(): CallAnalytics {
    const todayIST = getTodayCalendarDate();
    const callsToday = this.callLogs.filter((c) => c.calendar_date === todayIST);
    const activeSession = this.getActiveSession();

    let studentsInSession = this.students.filter((s) => !s.deleted_at);
    if (activeSession.id !== 'ALL') {
      studentsInSession = studentsInSession.filter((s) => s.academic_session_id === activeSession.id || !s.academic_session_id);
    }

    const dispositionBreakdown: Record<CallDisposition, number> = {
      CONNECTED: 0,
      BUSY: 0,
      SWITCHED_OFF: 0,
      NOT_REACHABLE: 0,
      RINGING_NO_RESPONSE: 0,
      CALLBACK_REQUESTED: 0,
      INVALID_NUMBER: 0,
      WRONG_NUMBER: 0,
      PARENT_BUSY: 0,
    };

    callsToday.forEach((c) => {
      dispositionBreakdown[c.disposition] = (dispositionBreakdown[c.disposition] || 0) + 1;
    });

    const activeMentors = this.users.filter((u) => u.role === 'MENTOR' && u.status === 'ACTIVE');

    const mentorPerformance = activeMentors.map((m) => {
      const buckets = this.getMentorAssignedBuckets(m.id);
      const totalAssigned = buckets.calledToday.length + buckets.remindersDue.length + buckets.pending.length + buckets.newCalls.length;
      const completedCalls = this.callLogs.filter((c) => c.mentor_id === m.id && c.calendar_date === todayIST).length;

      return {
        mentorId: m.id,
        mentorName: m.name,
        designation: m.department || 'Senior Academic Mentor',
        totalAssigned,
        newCalls: buckets.newCalls.length,
        completedCalls,
        pendingOverdue: buckets.pending.length,
        remindersDue: buckets.remindersDue.length,
        monthlyOverdue: buckets.monthlyDueCount,
        completionRate: m.daily_call_goal > 0 ? Math.round((completedCalls / m.daily_call_goal) * 100) : 0,
      };
    });

    const campaignReports = this.campaigns.map((camp) => {
      const assigned = this.campaignAssignments.filter((a) => a.campaign_id === camp.id);
      const campCalls = this.callLogs.filter((c) => c.campaign_id === camp.id);
      const completed = assigned.filter((a) => a.completion_status === 'COMPLETED').length;
      const connected = campCalls.filter((c) => c.disposition === 'CONNECTED').length;

      const dispCounts: Record<string, number> = {};
      campCalls.forEach((c) => {
        dispCounts[c.disposition] = (dispCounts[c.disposition] || 0) + 1;
      });

      return {
        campaignId: camp.id,
        title: camp.title,
        purpose: camp.purpose,
        assignedCount: assigned.length,
        completedCount: completed,
        connectedCount: connected,
        dispositionCounts: dispCounts,
      };
    });

    const uniqueSet = new Set(studentsInSession.map((s) => s.cross_batch_group_key || s.admission_no));
    const crossBatchStudents = studentsInSession.filter((s) => s.is_cross_batch_enrolled);
    const singleCourseStudents = studentsInSession.filter((s) => !s.is_cross_batch_enrolled);

    return {
      totalStudents: studentsInSession.length,
      uniqueIndividualsCount: uniqueSet.size,
      crossBatchCount: crossBatchStudents.length,
      singleCourseCount: singleCourseStudents.length,
      callsLoggedToday: callsToday.length,
      suspiciousCallsCount: this.callLogs.filter((c) => c.is_suspicious).length,
      inboundCallbacksCount: callsToday.filter((c) => c.is_inbound_override).length,
      dueFollowupsCount: studentsInSession.filter((s) => s.active_reminder_date === todayIST).length,
      activeMentorsCount: activeMentors.length,
      dispositionBreakdown,
      mentorPerformance,
      campaignReports,
    };
  }

  // --------------------------------------------------------------------------
  // EXTERNAL LEADS (Section 7.5)
  // --------------------------------------------------------------------------
  public getExternalLeads(params: {
    page?: number;
    limit?: number;
    search?: string;
    mentorId?: string;
  }): { leads: ExternalLead[]; total: number } {
    const { page = 1, limit = 50, search = '', mentorId } = params;
    let list = this.externalLeads.filter((l) => !l.upload_batch_id || true);

    if (mentorId) {
      list = list.filter((l) => l.assigned_to === mentorId);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((l) =>
        l.name.toLowerCase().includes(q) ||
        l.mobile.includes(q) ||
        (l.city && l.city.toLowerCase().includes(q)) ||
        (l.school && l.school.toLowerCase().includes(q))
      );
    }

    const total = list.length;
    const start = (page - 1) * limit;
    return {
      leads: list.slice(start, start + limit),
      total,
    };
  }

  public assignExternalLeads(leadIds: string[], mentorId: string) {
    this.externalLeads.forEach((l) => {
      if (leadIds.includes(l.id)) {
        l.assigned_to = mentorId;
      }
    });
    this.saveLeads();
  }

  public addExternalLeadsBatch(leads: Omit<ExternalLead, 'id' | 'created_at'>[]) {
    const existingMobiles = new Set(this.externalLeads.map((l) => l.mobile.replace(/\D/g, '')));
    const newItems: ExternalLead[] = [];

    leads.forEach((l) => {
      const cleanMobile = l.mobile.replace(/\D/g, '');
      const isDup = existingMobiles.has(cleanMobile);
      const leadItem: ExternalLead = {
        id: `lead-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        ...l,
        possible_duplicate: isDup,
        created_at: new Date().toISOString(),
      };
      existingMobiles.add(cleanMobile);
      newItems.push(leadItem);
    });

    this.externalLeads = [...newItems, ...this.externalLeads];
    this.saveLeads();
    return newItems.length;
  }

  // --------------------------------------------------------------------------
  // ACADEMIC DATA: EXAMS & ATTENDANCE (Section 7.3 & 7.4)
  // --------------------------------------------------------------------------
  public addExamResults(results: ExamResult[]) {
    this.exams = [...results, ...this.exams];
    this.saveExams();
  }

  public getExamResultForStudent(studentId: string): ExamResult | undefined {
    return this.exams.find((e) => e.student_id === studentId);
  }

  public addAttendanceRecords(records: AttendanceRecord[]) {
    this.attendance = [...records, ...this.attendance];
    this.saveAttendance();
  }

  public getAttendanceForStudent(studentId: string): AttendanceAggregation | null {
    const records = this.attendance.filter((a) => a.student_id === studentId);
    if (records.length === 0) return null;
    return aggregateAttendance(records);
  }

  // Initial Seed Generators
  private getInitialCampaigns(): Campaign[] {
    return [
      {
        id: 'camp-ptm-nov',
        title: 'PTM Attendance & Marks Review Drive',
        purpose: 'PTM',
        session_id: 'session-2026-27',
        assignment_date: getTodayCalendarDate(),
        outcome_options: ['Will Attend PTM', 'Cannot Attend', 'Parent Out of Station', 'Discussed Over Call'],
        target_mentor_ids: ALL_DEFAULT_USERS.filter((u) => u.role === 'MENTOR').map((u) => u.id),
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      },
      {
        id: 'camp-ioqm-special',
        title: 'IOQM Stage-1 Performance Counselling',
        purpose: 'IOQM',
        session_id: 'session-2026-27',
        assignment_date: getTodayCalendarDate(),
        outcome_options: ['Interested in Mock Tests', 'Needs Doubt Class', 'Registered for Exam', 'Not Interested'],
        target_mentor_ids: ALL_DEFAULT_USERS.filter((u) => u.role === 'MENTOR').slice(0, 5).map((u) => u.id),
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      },
    ];
  }

  private getInitialAssignments(): CampaignAssignment[] {
    const mentors = ALL_DEFAULT_USERS.filter((u) => u.role === 'MENTOR');
    if (mentors.length === 0) return [];

    const assignments: CampaignAssignment[] = [];
    const sampleStudents = this.students.slice(0, 30);

    sampleStudents.forEach((st, idx) => {
      const mentor = mentors[idx % mentors.length];
      assignments.push({
        id: `asg-init-${idx}`,
        campaign_id: 'camp-ptm-nov',
        campaign_title: 'PTM Attendance & Marks Review Drive',
        campaign_purpose: 'PTM',
        student_id: st.admission_no,
        mentor_id: mentor.id,
        assigned_date: getTodayCalendarDate(),
        completion_status: idx % 3 === 0 ? 'COMPLETED' : 'ASSIGNED',
        assigned_by: 'Dr. Abhishek Gupta',
      });
    });

    return assignments;
  }

  private getInitialCallLogs(): CallLog[] {
    return [];
  }

  private getInitialLeads(): ExternalLead[] {
    return [];
  }

  public getDuplicateCandidates(): Student[] {
    return this.students.filter((s) => s.is_potential_duplicate);
  }
}

export const crmDb = new CRMDatabase();
export const SYSTEM_USERS = ALL_DEFAULT_USERS;
