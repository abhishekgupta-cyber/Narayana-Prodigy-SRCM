# Narayana Prodigy Student Relation Call Management CRM

A high-density operational CRM engineered for Narayana Prodigy Academic Operations. Enforces rigid Role-Based Access Control (RBAC), silent call latency auditing, automated batch Excel data ingestion, cross-batch identity linking, and scalable pagination for concurrent calling staff.

---

## 1. System Architecture & Tech Stack

- **Frontend Runtime**: React 19 + TypeScript + Vite + Tailwind CSS (`npm run dev` on port `3000`).
- **Domain Engine**: Client-side `CRMDatabase` engine (`src/services/db.ts`) backed by persistent browser `localStorage` with `Asia/Kolkata` (IST) authoritative day boundaries (`src/services/antiCheat.ts`).
- **Database Schema Contracts**: Full PostgreSQL schema and initial SQL migration provided in `prisma/schema.prisma` and `prisma/migrations/0001_init_narayana_crm.sql`.
- **Excel Ingestion & Export**: SheetJS (`xlsx`) in `src/services/excelIngestion.ts` supporting multi-sheet workbooks, fuzzy header matching, dry-run validation, 1-click upload rollback, and dedicated workbook exports.
- **Security & RBAC**:
  - `SUPER_ADMIN`: Access to Executive Dashboard, Directory, Upload Center, Campaigns & Universal Bulk Selector, Cross-Batch Enrollees, External Leads, Mentors & Settings, and 5 Dedicated Reports.
  - `MENTOR`: Restricted to Assigned Calls (4 precedence chips), My Students (scoped strictly to `student.mentor_id === currentUser.id`, server-paginated without 50-row caps), and Call History. No exports, no admin metrics, no cross-mentor access.

### Architecture Note & Unverified Runtime Infrastructure
This workspace runs as a **Vite + React SPA** backed by `CRMDatabase` (in-memory + `localStorage` persistence) rather than a live Next.js App Router + PostgreSQL backend server. Accordingly:
- **Verified in this environment**: All React components, TypeScript compilation, Vite production bundling, client-side RBAC boundaries, authentication & lockout logic, cross-batch linking, Excel parsing/exports, 4-chip task precedence, bulk selector snapshots, and automated CLI suite (`T1`–`T23` + 50,000-row performance benchmark).
- **NOT verified against a live server runtime**: Live PostgreSQL connection & `prisma migrate` execution against a database server, server-side HTTP-only JWT cookie verification in Next.js middleware, `pg-boss` background job queues, and `exceljs` server-side HTTP streaming responses.

---

## 2. Setup Instructions & Environment Variables

### Prerequisites
- Node.js 20+ and npm

### Installation & Local Commands
```bash
npm install
npm run dev      # Starts Vite dev server on http://0.0.0.0:3000
npm run lint     # Runs TypeScript type-checking (tsc --noEmit)
npm run build    # Builds production bundle into dist/
npm test         # Executes automated verification suite (T1–T23 + 50k benchmark)
```

### Environment Variables (`.env.example`)
Copy `.env.example` to `.env` for local overrides and future server deployment:
- `GEMINI_API_KEY`: Reserved AI Studio runtime environment key.
- `APP_URL`: Hosted application URL.
- `DATABASE_URL`: PostgreSQL connection string for Prisma schema deployment.
- `SEED_ADMIN_PASSWORD` / `VITE_SEED_ADMIN_PASSWORD`: Initial password override for seeded Super Admin (`abhishekgupta@narayanagroup.com`) if not pre-hashed.
- `SESSION_SECRET`: Cookie signing secret for production server sessions.
- `GOVT_ID_ENCRYPTION_KEY`: AES-256 encryption key for sensitive Govt ID storage in production.

---

## 3. Architectural Decisions Coverage (D1 – D14)

| Decision | Specification Rule | Implementation File(s) | Status |
| :--- | :--- | :--- | :--- |
| **D1** | `admission_no` strictly unique across sessions. Re-upload updates existing record. | `src/services/db.ts`, `src/services/excelIngestion.ts` | Implemented |
| **D2** | Identity tracked by `person_key = lower(name)\|lower(father)\|last-10-mobile`. Different `admission_no` = valid cross-batch seat. | `src/services/db.ts`, `src/components/admin/AdminDashboard.tsx` | Implemented |
| **D3** | `batch_name` derived from Course Name or mapped Batch column. | `src/services/db.ts`, `src/services/excelIngestion.ts` | Implemented |
| **D4** | Normalized 10-digit phone storage with configurable dial prefix (`+91`). | `src/services/antiCheat.ts`, `src/services/db.ts` | Implemented |
| **D5** | UTC stored, IST (`Asia/Kolkata`) displayed (`"02 Nov 2026, 04:30 PM"`) via `istDay()`. | `src/services/antiCheat.ts` | Implemented |
| **D6** | Task states: `ASSIGNED`, `ATTEMPTED`, `COMPLETED`, `CANCELLED`. Connected / Wrong Number -> `COMPLETED`. | `src/services/db.ts`, `src/types/crm.ts` | Implemented |
| **D7** | Age rules in days (`pending_after_days`, default 2). Unattempted > threshold -> Pending (`Overdue` badge). | `src/services/db.ts`, `src/components/mentor/MentorWorkstation.tsx` | Implemented |
| **D8** | Exclusive 4-bucket mentor task precedence (Called Today -> Reminders Due -> Pending -> New). | `src/services/db.ts`, `src/components/mentor/MentorWorkstation.tsx` | Implemented |
| **D9** | Same-day inbound callback override valid until 11:59:59 PM IST; appends to `CallActivity`. | `src/services/db.ts`, `src/services/antiCheat.ts` | Implemented |
| **D10** | Monthly relationship call due if no `CONNECTED` call in `monthly_call_days` (default 30). | `src/services/db.ts`, `src/components/mentor/MentorWorkstation.tsx` | Implemented |
| **D11** | Attendance % = `Present / (Present + Absent) * 100`. Blank cells = not recorded. | `src/services/excelIngestion.ts` | Implemented |
| **D12** | Exam results & attendance matched strictly by `admission_no`. | `src/services/excelIngestion.ts`, `src/services/db.ts` | Implemented |
| **D13** | Strict `SUPER_ADMIN` and `MENTOR` roles; single hamburger menu per role; no mentor exports. | `src/components/layout/Navbar.tsx`, `src/App.tsx` | Implemented |
| **D14** | Separate KPIs: Total Admissions (course seats), Unique Students, Cross-Batch (2+ enrollments). | `src/services/db.ts`, `src/components/admin/AdminDashboard.tsx` | Implemented |

---

## 4. Resolved Specification Defects (B1 – B14)

| Bug ID | Defect Addressed | Resolution Summary |
| :--- | :--- | :--- |
| **B1** | Mentor lists capped at 50 rows | Full paginated `crmDb.getStudents()` with `Showing X to Y of TOTAL` across pages. |
| **B2** | "Reset to 1548" button/route present | Completely removed from UI, navbar, and DB engine. |
| **B3** | Landing page leaked totals / default passwords | Zero data fetched before auth; `<meta name="robots" content="noindex, nofollow" />`; clean credentials form only. |
| **B4** | Queue / Due Today / Call History broken | Strict 4-chip exclusive categorization + chronological Call History view. |
| **B5** | Reminder timestamps clipped | Formatted via `formatISTDateTime()` with `whitespace-nowrap`. |
| **B6** | Mentor student scoping inconsistent | Strictly filtered by `student.mentor_id === currentUser.id`. |
| **B7** | Duplicate daily call rows & resetting timer | Single `(mentor_id, student_id, call_date)` CallLog per IST day; persistent `firstInitiatedAt` timer. |
| **B8** | Latency / protocol text exposed to mentors | Zero protocol/audit wording or alerts visible to mentors or leaked into UI copy. |
| **B9** | Custom report date filtering missing | From/To date filters wired across admin report tabs. |
| **B10** | Minimum 10 calls bulk selector restriction | Universal bulk selector supports any exact count `N >= 1` and index ranges (`1-50`, `60-90`). |
| **B11** | Redundant tabs / past remarks visible to mentors | Single clean navigation per role; `getSanitizedRemarkForUser()` returns remarks only for same-day own calls. |
| **B12** | Cross-batch enrollees flagged as duplicates | Dedicated 3-tab Cross-Batch Center + 3-sheet Excel workbook export. |
| **B13** | No per-mentor tracking or IOQM batch audit | Reports C (1-to-1 Mentor Tracking) and D (Batch-Wise Call Audit) with Excel exports. |
| **B14** | Missing assignment dates & campaign archiving | Assignment date tracking + archive/soft-delete preserving historical call records. |

---

## 5. Acceptance Tests Coverage Matrix (T1 – T23)

All 23 verification checks are automated in `src/tests/specVerification.ts` (runnable via `npm test` or the Admin "Verify Tests (T1-T23)" modal):
- **T1–T3**: Zero pre-login data disclosure & salted password auth + lockout (`LoginPage.tsx`, `db.ts`), no "1548" seed/reset, reactive Academic Session switching (`App.tsx`, `Navbar.tsx`).
- **T4–T6**: Cross-batch linking (`person_key`), full pagination & phone masking (`XXXXXX4521` unmasked only on call initiation), strict mentor isolation.
- **T7–T10**: Results attachment by `admission_no`, Attendance P/A/L & blank matrix parsing, single daily `CallLog` + non-resetting timer, same-day inbound callback `CallActivity` override.
- **T11–T13**: Strict mentor remark sanitization & silent `<15s` submission latency flag (admin-only), pending overdue age rules, 30-day monthly relationship call due rule.
- **T14–T17**: Universal bulk selector (ranges, `N >= 1`, unassigned filter, equal mentor split), campaign management, Mentor Tracking & Batch Audit Excel exports, separated Admission & Calling KPIs.
- **T18–T23**: Isolated External Promotional Leads, 1-click Upload Batch rollback preserving active call logs, User Management with hashed passwords & designation/status controls, 50,000-row pagination/search latency benchmark, non-admin deterrents (`select-none`, right-click/shortcut/print blocking, blur-on-unfocus, live IST diagonal watermark), and clean production compilation.

---

## 6. Security Limitations & Operational Assumptions

- **Browser Security Deterrents (Section 12)**: Standard browser controls (`select-none`, context-menu block, keyboard shortcut interception, `blur` veil on window focus loss, and `@media print { .non-admin-protected { display: none !important; } }`) deter casual copying and printing, **but cannot physically block OS-level screen recording or external cameras**. The fixed diagonal watermark (`Mentor Name · Staff ID · Live IST Timestamp`) provides visual traceability.
- **Client-Side Auth Hashing Note**: In the current Vite SPA build without a live Node API backend, `crmDb` uses salted iterative SHA-256 digests (`$v1$...`) for credential verification in browser storage; production deployment against PostgreSQL must execute `bcrypt` verification server-side with HTTP-only Secure cookies.
- **Assumptions (Section 0.4)**: Academic sessions are isolated per session selector; all date cutoffs use server/client `Asia/Kolkata` calendar day helpers; uploaded sheets without attendance entries leave cells unrecorded rather than marking absent.
