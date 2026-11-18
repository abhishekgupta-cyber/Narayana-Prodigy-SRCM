-- ============================================================================
-- Migration: 0001_init_narayana_crm.sql
-- Narayana Prodigy Student Relation Call Management CRM
-- PostgreSQL Production DDL with Extensions, Partial Unique Indexes, and CHECKs
-- ============================================================================

-- 1. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Core Constraints and Partial Unique Indexes

-- D1: admission_no is unique across all sessions strictly among non-deleted rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_admission_no_not_deleted 
  ON "Enrollment" (admission_no) 
  WHERE deleted_at IS NULL;

-- D8 & 9.3: Single CallLog per mentor per student/lead per IST day
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_log_daily_student_unique 
  ON "CallLog" (mentor_id, enrollment_id, call_date) 
  WHERE enrollment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_call_log_daily_lead_unique 
  ON "CallLog" (mentor_id, lead_id, call_date) 
  WHERE lead_id IS NOT NULL;

-- 51: CallTask XOR Target Check Constraint
ALTER TABLE "CallTask" 
  DROP CONSTRAINT IF EXISTS chk_calltask_target;
ALTER TABLE "CallTask" 
  ADD CONSTRAINT chk_calltask_target 
  CHECK (
    (enrollment_id IS NOT NULL AND lead_id IS NULL) OR 
    (enrollment_id IS NULL AND lead_id IS NOT NULL)
  );

-- 52: CallLog XOR Target Check Constraint
ALTER TABLE "CallLog" 
  DROP CONSTRAINT IF EXISTS chk_calllog_target;
ALTER TABLE "CallLog" 
  ADD CONSTRAINT chk_calllog_target 
  CHECK (
    (enrollment_id IS NOT NULL AND lead_id IS NULL) OR 
    (enrollment_id IS NULL AND lead_id IS NOT NULL)
  );

-- Only ONE active (ASSIGNED / ATTEMPTED) task per enrollment or lead
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_task_per_enrollment 
  ON "CallTask" (enrollment_id) 
  WHERE status IN ('ASSIGNED', 'ATTEMPTED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_task_per_lead 
  ON "CallTask" (lead_id) 
  WHERE status IN ('ASSIGNED', 'ATTEMPTED');

-- Section 8: Fast GIN Trigram Search for Student and Father Name
CREATE INDEX IF NOT EXISTS idx_student_name_trgm 
  ON "StudentProfile" USING gin (student_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_father_name_trgm 
  ON "StudentProfile" USING gin (father_name gin_trgm_ops);

-- Section 3 Indexes for Ultra-Fast Lookups & Server-Side Pagination
CREATE INDEX IF NOT EXISTS idx_enrollment_profile_id ON "Enrollment" (profile_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_mentor_session ON "Enrollment" (mentor_id, academic_session_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_session_batch ON "Enrollment" (academic_session_id, batch_name);
CREATE INDEX IF NOT EXISTS idx_enrollment_session_course ON "Enrollment" (academic_session_id, course_name);
CREATE INDEX IF NOT EXISTS idx_calltask_mentor_status_date ON "CallTask" (mentor_id, status, assigned_date);
CREATE INDEX IF NOT EXISTS idx_calllog_mentor_date ON "CallLog" (mentor_id, call_date);
CREATE INDEX IF NOT EXISTS idx_reminder_mentor_status_time ON "Reminder" (mentor_id, status, remind_at);
CREATE INDEX IF NOT EXISTS idx_exam_enrollment_date ON "ExamResult" (enrollment_id, exam_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON "AuditLog" (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_person_key ON "StudentProfile" (person_key);
