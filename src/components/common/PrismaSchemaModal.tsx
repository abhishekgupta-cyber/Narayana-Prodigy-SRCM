import React, { useState } from 'react';
import { X, Copy, Check, Database, FileCode } from 'lucide-react';

interface PrismaSchemaModalProps {
  onClose: () => void;
}

export const PrismaSchemaModal: React.FC<PrismaSchemaModalProps> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);

  const prismaSchemaCode = `// ============================================================================
// Prisma Schema: Narayana Prodigy Student Relation Call Management CRM
// Full Section 3 Production Data Model with PostgreSQL Optimization
// ============================================================================

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearchPostgres"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  SUPER_ADMIN
  MENTOR
}

enum TaskStatus {
  ASSIGNED
  ATTEMPTED
  COMPLETED
  CANCELLED
}

enum CallDisposition {
  CONNECTED
  BUSY
  SWITCHED_OFF
  NOT_REACHABLE
  RINGING_NO_RESPONSE
  CALLBACK_REQUESTED
  INVALID_NUMBER
  WRONG_NUMBER
  PARENT_BUSY
}

// 1. User & Staff Entity (Super Admin & Calling Mentors)
model User {
  id                   String      @id @default(uuid())
  full_name            String
  designation          String?     // Senior Academic Mentor, Student Relation Officer
  mobile               String?     @unique
  username             String      @unique
  email                String      @unique
  password_hash        String      // bcrypt cost 12
  role                 Role        @default(MENTOR)
  status               String      @default("ACTIVE")
  must_change_password Boolean     @default(true)
  daily_call_goal      Int         @default(60)
  created_at           DateTime    @default(now())
  updated_at           DateTime    @updatedAt
}

// 2. Academic Session (Section 5)
model AcademicSession {
  id          String   @id @default(uuid())
  name        String   @unique // e.g. "2025-26", "2026-27", "2027-28"
  start_month Int      @default(4)
  is_active   Boolean  @default(true)
}

// 3. Student Identity (StudentProfile)
model StudentProfile {
  id                 String    @id @default(uuid())
  student_name       String
  father_name        String
  mother_name        String?
  primary_mobile     String    // 10 digits normalized
  alternate_mobile   String?
  email              String?
  person_key         String    @unique // lower(name)|lower(father)|last-10-mobile
  created_at         DateTime  @default(now())
}

// 4. Course Enrollment (D1, D2, D14)
model Enrollment {
  id                    String    @id @default(uuid())
  admission_no          String    @unique
  profile_id            String
  academic_session_id   String
  course_name           String
  batch_name            String    @default("General Batch")
  mentor_id             String?
  raw_mentor_name       String?
  last_connected_at     DateTime?
  last_call_at          DateTime?
  deleted_at            DateTime?
}

// 5. Calling Engine with Single Daily CallLog & Attempts (Section 9.3)
model CallLog {
  id                       String          @id @default(uuid())
  task_id                  String?
  enrollment_id            String?
  mentor_id                String
  call_date                String          // IST date "YYYY-MM-DD"
  disposition              CallDisposition
  campaign_outcome         String?
  first_initiated_at       DateTime
  last_submitted_at        DateTime
  latency_seconds          Int             @default(0)
  is_suspicious_submission Boolean         @default(false)
  idempotency_key          String?         @unique

  @@unique([mentor_id, enrollment_id, call_date], name: "uq_daily_mentor_student_call")
}

model CallAttempt {
  id               String       @id @default(uuid())
  call_log_id      String
  contact_used     String       // PRIMARY or ALTERNATE
  started_at       DateTime     @default(now())
  duration_seconds Int          @default(0)
}

model CallActivity {
  id                String           @id @default(uuid())
  call_log_id       String
  type              String           // INITIAL_SUBMIT, INBOUND_UPDATE, ATTEMPT_ADDED
  disposition_after CallDisposition
  remark_text       String           @db.Text
  by_user           String
  created_at        DateTime         @default(now())
}

// 6. Settings (Section 12)
model Settings {
  id                    String   @id @default("global")
  pending_after_days    Int      @default(2)
  suspicious_seconds    Int      @default(15)
  monthly_call_days     Int      @default(30)
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(prismaSchemaCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 bg-slate-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-bold">PostgreSQL Database Architecture (Prisma Schema)</h3>
              <p className="text-[11px] text-slate-400">Strict Section 3 Data Contracts with Partial Unique Constraints</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Schema'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-900 text-slate-100 font-mono text-xs">
          <pre className="whitespace-pre">{prismaSchemaCode}</pre>
        </div>

        <div className="p-3 bg-slate-100 border-t border-slate-200 text-right text-xs text-slate-600 font-sans">
          Narayana Prodigy Academic Operations · PostgreSQL 16+ Production Specification
        </div>
      </div>
    </div>
  );
};
