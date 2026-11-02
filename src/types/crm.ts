/**
 * Narayana Prodigy Student Relation Call Management CRM
 * Type Definitions & Schema Contracts (Section 3 Compliant)
 */

export type Role = 'SUPER_ADMIN' | 'MENTOR';

export type CallDisposition =
  | 'CONNECTED'
  | 'BUSY'
  | 'SWITCHED_OFF'
  | 'NOT_REACHABLE'
  | 'RINGING_NO_RESPONSE'
  | 'CALLBACK_REQUESTED'
  | 'INVALID_NUMBER'
  | 'WRONG_NUMBER'
  | 'PARENT_BUSY';

export type TaskStatus = 'ASSIGNED' | 'ATTEMPTED' | 'COMPLETED' | 'CANCELLED';

export type AttendanceStatus = 'P' | 'A' | 'L'; // Present, Absent, Leave

export interface AcademicSession {
  id: string;
  name: string; // "2025-26", "2026-27", "2027-28"
  start_month: number; // default 4 (April)
  is_active: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  username?: string;
  password_hash?: string;
  role: Role;
  department: string; // e.g. "Senior Academic Mentor", "Student Relation Officer"
  designation?: string;
  mobile_number?: string;
  daily_call_goal: number;
  status?: 'ACTIVE' | 'INACTIVE';
  must_change_password?: boolean;
  failed_logins?: number;
  locked_until?: string | null;
  created_at?: string;
}

export interface StudentProfile {
  id: string;
  student_name: string;
  father_name: string;
  mother_name?: string;
  primary_mobile: string;
  alternate_mobile?: string;
  email?: string;
  gender?: string;
  dob?: string;
  govt_id_encrypted?: string; // admin sees last 4 only, never in mentor APIs
  govt_id_last4?: string;
  address?: string;
  city?: string;
  state?: string;
  district?: string;
  pin?: string;
  person_key: string; // lower/trim name | lower/trim father | last-10-digits mobile
  created_at: string;
}

// Master Enrollment Schema (maps to Student in previous code)
export interface Student {
  admission_no: string;      // Unique Primary Key
  academic_year: string;     // e.g., "2026-2027"
  academic_session_id?: string;
  profile_id?: string;
  user_name: string;         // Student Full Name
  father_name: string;       // Father's Name
  mother_name: string;       // Mother's Name
  student_mobile: string;    // Primary Mobile (normalized 10 digits)
  whatsapp_number: string;   // WhatsApp / Alternate
  email: string;             // Email
  gender: string;            // Gender
  dob: string;               // Date of Birth (YYYY-MM-DD)
  category: string;          // Category
  address: string;           // Address
  city: string;              // City
  state_name: string;        // State
  district_name: string;     // District
  pin_code: string;          // PIN
  course_name: string;       // Course Name
  course_type: string;       // Course Type
  course_group: string;      // Course Group
  course_class: string;      // Class
  mentor_name?: string;      // Assigned Caller Name
  raw_mentor_name?: string;  // Unmapped mentor string from upload
  mentor_id?: string;        // Mentor User ID
  course_category: string;   // Course Category
  batch_name: string;        // Derived from Course Name or mapped Batch column
  admission_date?: string;
  last_connected_at?: string;
  last_call_at?: string;
  upload_batch_id?: string;
  deleted_at?: string | null;

  // Cross-Batch & Tracking Fields
  is_cross_batch_enrolled?: boolean;
  is_potential_duplicate?: boolean;
  duplicate_reason?: string;
  duplicate_resolution?: string;
  matched_admission_no?: string;
  cross_batch_group_key?: string;
  enrolled_batches_summary?: string;
  enrollment_status?: string;
  created_at: string;
  updated_at: string;

  // Aggregates & Indicators
  last_call_date?: string;
  last_call_disposition?: CallDisposition;
  call_status_today?: 'NEVER_CALLED' | 'CALLED_TODAY' | 'CALLED_YESTERDAY' | 'DUE_FOLLOWUP';
  active_reminder_date?: string;
  latest_result_summary?: {
    exam_name: string;
    total: number;
    max: number;
    percentage: number;
    rank?: number;
  };
  attendance_summary?: {
    percentage: number;
    present: number;
    absent: number;
    leave: number;
    total: number;
  };
}

export interface Campaign {
  id: string;
  title: string;
  purpose: 'PTM' | 'Marks' | 'IOQM' | 'Admission Follow-up' | 'Fee' | 'Routine' | 'Other' | string;
  session_id: string;
  assignment_date: string; // YYYY-MM-DD
  start_date?: string;
  due_date?: string;
  outcome_options: string[]; // e.g. ["Will Attend", "Will Not Attend", "Maybe"]
  target_mentor_ids: string[];
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  created_at: string;
  total_assigned?: number;
  completed_calls?: number;
}

export interface CampaignAssignment {
  id: string;
  campaign_id: string;
  campaign_title?: string;
  campaign_purpose?: string;
  student_id: string;
  lead_id?: string;
  mentor_id: string;
  assigned_date: string;
  due_date?: string;
  completion_status: TaskStatus;
  completed_at?: string;
  assigned_by?: string;
  student?: Student;
  lead?: ExternalLead;
}

export interface CallAttempt {
  id: string;
  call_log_id: string;
  contact_used: 'PRIMARY' | 'ALTERNATE';
  started_at: string; // server timestamp ISO
  duration_seconds: number;
}

export interface CallActivity {
  id: string;
  call_log_id: string;
  type: 'INITIAL_SUBMIT' | 'INBOUND_UPDATE' | 'ATTEMPT_ADDED' | 'REMINDER_CHANGED';
  disposition_after: CallDisposition;
  remark_text: string;
  reminder_after?: string;
  by_user: string;
  created_at: string; // ISO
}

export interface CallLog {
  id: string;
  task_id?: string;
  student_id: string;
  lead_id?: string;
  mentor_id: string;
  mentor_name: string;
  campaign_id?: string;
  campaign_outcome?: string;
  academic_session_id?: string;
  call_date: string; // IST calendar date "YYYY-MM-DD"
  calendar_date: string; // "YYYY-MM-DD"
  
  // Anti-Cheat & Timing
  call_initiated_at: string; // ISO
  first_initiated_at?: string;
  last_submitted_at?: string;
  latency_seconds: number;
  is_suspicious: boolean; // Flagged in admin only
  suspicious_reason?: string;
  idempotency_key?: string;
  
  // Dispositions & Status
  disposition: CallDisposition;
  call_duration_sec: number;
  remark: string; // Latest active remark
  call_type: 'OUTBOUND' | 'INBOUND_CALLBACK';
  status?: 'OPEN' | 'SUBMITTED' | 'ABANDONED';
  
  // Inbound Callback Override
  is_inbound_override: boolean;
  original_remark?: string;
  original_disposition?: CallDisposition;
  override_timestamp?: string;
  is_locked: boolean;
  
  // Follow-up
  follow_up_date?: string;
  follow_up_time?: string;
  follow_up_status?: 'PENDING' | 'COMPLETED' | 'EXPIRED' | 'CLEARED';

  // Attempts and timeline activities
  attempts?: CallAttempt[];
  activities?: CallActivity[];
}

export interface ExternalLead {
  id: string;
  name: string;
  mobile: string;
  alternate_mobile?: string;
  city?: string;
  school?: string;
  source_list: string;
  source_remarks?: string;
  assigned_to?: string;
  status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'DROPPED';
  notes?: string;
  possible_duplicate?: boolean;
  extra_json?: Record<string, any>;
  upload_batch_id?: string;
  created_at: string;
}

export interface ExamResult {
  id: string;
  student_id: string;
  exam_name: string;
  exam_date: string;
  subject_marks?: Record<string, number>;
  physics_marks?: number;
  chemistry_marks?: number;
  math_marks?: number;
  biology_marks?: number;
  total_marks: number;
  max_marks: number;
  percentage: number;
  rank?: number;
  upload_batch_id?: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  date: string; // "YYYY-MM-DD"
  time_slot: string; // "09:00-10:30" or ""
  subject: string;
  status: AttendanceStatus;
  faculty?: string;
  upload_batch_id?: string;
}

export interface AttendanceAggregation {
  totalClasses: number;
  presentClasses: number;
  absentClasses?: number;
  leaveClasses?: number;
  overallPercentage: number;
  subjectCounts: Record<string, { present: number; total: number; percentage: number }>;
  absenteeDetails: {
    date: string;
    time_slot: string;
    subject: string;
    faculty?: string;
  }[];
}

export interface UploadBatch {
  id: string;
  type: 'ADMISSION' | 'EXAM' | 'ATTENDANCE' | 'LEADS';
  session_id: string;
  template_id?: string;
  file_name: string;
  uploaded_by: string;
  uploaded_at: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'ROLLED_BACK';
  total_rows: number;
  inserted_count: number;
  updated_count: number;
  unmatched_count: number;
  error_count: number;
}

export interface UploadChange {
  id: string;
  batch_id: string;
  entity_type: 'STUDENT' | 'EXAM' | 'ATTENDANCE' | 'LEAD';
  entity_id: string;
  action: 'INSERT' | 'UPDATE';
  previous_data_json?: string;
}

export interface PossibleMatch {
  id: string;
  enrollment_id: string;
  candidate_profile_id: string;
  student_name: string;
  father_name: string;
  mobile: string;
  reason: string;
  status: 'PENDING' | 'MERGED' | 'DISMISSED';
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_name: string;
  user_role: string;
  action: 'LOGIN' | 'UNMASK_PHONE' | 'CALL_SUBMIT' | 'INBOUND_UPDATE' | 'ASSIGNMENT' | 'EXPORT_EXCEL' | 'UPLOAD' | 'ROLLBACK' | 'SETTINGS_CHANGE';
  entity: string;
  entity_id: string;
  meta?: any;
  created_at: string;
}

export interface Settings {
  pending_after_days: number; // default 2
  suspicious_seconds: number; // default 15
  attendance_leave_rule: 'EXCLUDE' | 'COUNT_AS_ABSENT' | 'COUNT_AS_PRESENT';
  dial_prefix: string; // default '+91'
  monthly_call_days: number; // default 30
}

export interface CallAnalytics {
  totalStudents: number;
  uniqueIndividualsCount: number;
  crossBatchCount: number;
  singleCourseCount: number;
  callsLoggedToday: number;
  suspiciousCallsCount: number;
  inboundCallbacksCount: number;
  dueFollowupsCount: number;
  activeMentorsCount: number;
  dispositionBreakdown: Record<CallDisposition, number>;
  mentorPerformance: {
    mentorId: string;
    mentorName: string;
    designation: string;
    totalAssigned: number;
    newCalls: number;
    completedCalls: number;
    pendingOverdue: number;
    remindersDue: number;
    monthlyOverdue: number;
    completionRate: number;
  }[];
  campaignReports: {
    campaignId: string;
    title: string;
    purpose: string;
    assignedCount: number;
    completedCount: number;
    connectedCount: number;
    dispositionCounts: Record<string, number>;
  }[];
}
