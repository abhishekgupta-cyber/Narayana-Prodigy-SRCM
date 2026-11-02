# Narayana Prodigy Student Relation Call Management CRM

A production-grade, Google-Sheet-speed CRM engineered for Narayana Prodigy Academic Operations. Enforces rigid Role-Based Access Control (RBAC), multi-layer anti-cheat call auditing, automated batch Excel data ingestion, and scalable performance for simultaneous calling staff managing tens of thousands of student records.

---

## 1. System Architecture & Tech Stack

- **Framework**: React 19 + TypeScript + Vite + Tailwind CSS.
- **Database Engine**: In-Memory & Persistent Storage with Server-Authoritative IST Day calculations and PostgreSQL Prisma schema contracts.
- **Security & RBAC**:
  - `SUPER_ADMIN`: Master access to Dashboard, Directory, Upload Center, Campaigns, Cross-Batch Enrollees, External Leads, Mentors & Settings, 5 Dedicated Reports.
  - `MENTOR`: Restricted to Assigned Calls (4 chips), My Students (own students, no 50 cap), and Call History. No access to other mentors, uploads, or admin APIs.
- **Data Ingestion & Export**: SheetJS (XLSX) with multi-sheet workbooks, permissive fuzzy headers, dry-run previews, and 1-click rollback history.
- **Time Authority**: All calendar calculations, midnight locks, and call age windows are computed in **Asia/Kolkata (IST)** via `istDay()` and `formatISTDateTime()`.

---

## 2. Key Architectural Decisions (D1 – D14)

| Decision | Specification Rule | Implementation File(s) | Verification Status |
| :--- | :--- | :--- | :--- |
| **D1** | `admission_no` is strictly unique across sessions. Same `admission_no` in upload = UPDATE. | `src/services/db.ts`, `src/services/excelIngestion.ts` | **PASS** |
| **D2** | Identity tracked by `StudentProfile` (`person_key = lower(name)\|lower(father)\|last-10-mobile`). Matching `person_key` with new `admission_no` = valid cross-batch enrollment (never an error or duplicate). | `src/services/db.ts`, `src/components/admin/AdminDashboard.tsx` | **PASS** |
| **D3** | `batch_name` derived from Course Name or mapped Batch column. | `src/services/db.ts`, `src/services/excelIngestion.ts` | **PASS** |
| **D4** | Normalized 10-digit phone storage. Dial prefix configurable (default `+91`). | `src/services/antiCheat.ts`, `src/services/db.ts` | **PASS** |
| **D5** | Store UTC, display IST (`Asia/Kolkata`) format `"02 Nov 2026, 04:30 PM"` via central `istDay()`. | `src/services/antiCheat.ts` | **PASS** |
| **D6** | Task states: `ASSIGNED`, `ATTEMPTED`, `COMPLETED`, `CANCELLED`. Connected or Wrong Number = `COMPLETED`. | `src/services/db.ts`, `src/types/crm.ts` | **PASS** |
| **D7** | Age rules in days (`pending_after_days`, default 2). If unattempted & > 2 days -> "Pending" with `Overdue` badge. | `src/services/db.ts`, `src/components/mentor/MentorWorkstation.tsx` | **PASS** |
| **D8** | Each task/reminder appears in exactly ONE mentor bucket at a time (Called Today -> Reminders Due -> Pending -> New). | `src/services/db.ts`, `src/components/mentor/MentorWorkstation.tsx` | **PASS** |
| **D9** | Same-day edit window valid until 11:59:59 PM IST of the call's day. Appends to `CallActivity`. | `src/services/db.ts`, `src/services/antiCheat.ts` | **PASS** |
| **D10** | Monthly relationship call: student is "Monthly Call Due" if no `Connected` call in 30 days. | `src/services/db.ts`, `src/components/mentor/MentorWorkstation.tsx` | **PASS** |
| **D11** | Attendance % = `Present / (Present + Absent) * 100`. Blank cells = "not recorded" (never absent). | `src/services/excelIngestion.ts` | **PASS** |
| **D12** | Results/attendance matched by Admission No. | `src/services/excelIngestion.ts`, `src/services/db.ts` | **PASS** |
| **D13** | Strict `ADMIN` and `MENTOR` roles. Single hamburger menu per role. Mentors cannot export or see admin screens. | `src/components/layout/Navbar.tsx`, `src/App.tsx` | **PASS** |
| **D14** | Counts: Total Admissions = course seats; Unique Students = distinct profiles; Cross-Batch Students = profiles with 2+ enrollments. | `src/services/db.ts`, `src/components/admin/AdminDashboard.tsx` | **PASS** |

---

## 3. Known Bugs Resolved (B1 – B14)

| Bug ID | Description | Root Cause & Resolution | Status |
| :--- | :--- | :--- | :--- |
| **B1** | Mentor lists stop at 50 records. | Hardcoded limits removed; full server-side pagination with "Showing X-Y of TOTAL" implemented. | **RESOLVED** |
| **B2** | "Reset to 1548" button/endpoint present. | Completely eliminated from Navbar, App, and DB engine per Section 0.5. | **RESOLVED** |
| **B3** | Landing page shows totals and default passwords. | Eliminated all pre-login data leaks and test accounts. Standard credentials form only. | **RESOLVED** |
| **B4** | My Queue / Due Today / Call History not working. | Replaced with strict 4-chip precedence (Called Today, Reminders Due, Pending, New) & Call History. | **RESOLVED** |
| **B5** | Reminder dates clipped. | Formatted with `formatISTDateTime()` and `nowrap` layout to prevent clipping. | **RESOLVED** |
| **B6** | Mentor cannot see own students properly. | Filtered strictly by `student.mentor_id === currentUser.id` with total count display. | **RESOLVED** |
| **B7** | Same student shows as two call rows & timer restarts. | Enforced database unique constraint `(mentor_id, student_id, call_date)`. Server-based timer resumes without restarting. | **RESOLVED** |
| **B8** | Anti-cheat alert visible to mentors. | Completely removed all timing warnings and alerts from mentor UI; latency checked silently on server. | **RESOLVED** |
| **B9** | Custom report dates cannot be selected. | Integrated native HTML5 date inputs (`From <= To`) across all 5 admin reports. | **RESOLVED** |
| **B10** | Minimum 10 calls restriction. | Universal bulk selector allows assigning exact count `N >= 1`. | **RESOLVED** |
| **B11** | Duplicate tabs / old remarks visible to mentors. | Single hamburger menu per role; remarks visible to mentors ONLY if written by them today. | **RESOLVED** |
| **B12** | Cross-batch students shown as duplicates. | Dedicated 3-tab Cross-Batch Enrollees center with 3-sheet Excel download. | **RESOLVED** |
| **B13** | Admin has no per-mentor call tracking or IOQM batch audit. | Added dedicated Reports C (1-to-1 Mentor Tracking) and D (Batch-Wise Call Audit). | **RESOLVED** |
| **B14** | No date on assignment; no campaign edit/delete. | Implemented full assignment date tracking and soft delete/archive in Campaign management. | **RESOLVED** |

---

## 4. Acceptance Tests Verified (T1 – T23)

- **T1**: Landing page displays clean login card; zero data fetched before authentication.
- **T2**: Production seed has no demo credential hints; "Reset to 1548" removed.
- **T3**: Global Academic Session selector in header (`2025-26`, `2026-27`, `2027-28`); filters all screens.
- **T4**: Multi-enrollment with identical person key attaches as valid cross-batch student.
- **T5**: Mentor sees all assigned students across pagination; phone numbers masked (`XXXXXX4521`) on all devices; unmasked only on call start.
- **T6**: Mentor cannot read other mentors' students or call records.
- **T7**: Result upload by Admission No attaches cleanly; previous exams retained.
- **T8**: Attendance Matrix & Combined-Header parsing with P/A/L status and blank cell handling.
- **T9**: Multiple calls in same day append as attempts to single CallLog row; timer never resets on re-click/refresh.
- **T10**: Same-day Inbound Callback Override appends to `CallActivity` until 11:59:59 PM IST.
- **T11**: Mentor never sees remarks from past days or other mentors; anti-cheat alert hidden; connected call <15s flagged in admin only.
- **T12**: Unattempted tasks older than threshold show under Pending with Overdue badge.
- **T13**: Monthly relationship rule flags students without Connected call in 30 days.
- **T14**: Universal bulk selector handles index ranges (`"1-50"`, `"60-90"`), exact counts (`N >= 1`), "only unassigned", and equal mentor split.
- **T15**: Campaigns support outcome options, assignment date, due date, and consolidated multi-mentor report.
- **T16**: Mentor Tracking and IOQM Batch Audit Excel files export accurately with 0-call student rows.
- **T17**: Admin dashboard displays KPI strip and mentor matrix; Admission Report and Calling Report separated.
- **T18**: External promotional leads upload with arbitrary columns, search, and bulk assign without mixing with enrolled students.
- **T19**: Upload batch rollback cleanly reverses inserts while preserving records with active call history.
- **T20**: User management supports designations, bcrypt password resets, and deactivation.
- **T21**: Server-side pagination and debounce maintain zero lag.
- **T22**: Non-admin browser deterrents active (user-select:none, right-click block, shortcut blocks, print-hide, blur-on-unfocus, diagonal watermark).
- **T23**: Production build compiles with 0 errors (`compile_applet` and `lint_applet` PASS).

---

## 5. Security & Screenshot Traceability Notice

As documented in Section 12 of the system specification:
> Standard browser security controls can deter right-clicks, copy-paste, print actions, and window focus loss, but cannot physically prevent operating system level screen recording or external camera capture. The diagonal watermark containing the Mentor's Name, Staff ID, and Live IST Timestamp ensures visual traceability and legal forensics.
