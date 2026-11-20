import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Pool } from 'pg';

// Load local Neon / environment files without overriding platform-injected env vars (Render / Cloud Run)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const PORT = process.env.RENDER ? Number(process.env.PORT || 3000) : 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'crm-live-state.json');
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const DEFAULT_USERS_FILE = path.join(process.cwd(), 'src', 'data', 'defaultUsers.json');
const REAL_ADMISSIONS_FILE = path.join(process.cwd(), 'src', 'data', 'realAdmissions.json');
const DATABASE_URL = process.env.DATABASE_URL?.trim() || '';
const APP_VERSION = '2.1.0';

// ---------------------------------------------------------------------------
// IST Date & Security Helpers (matches src/services/antiCheat.ts & db.ts)
// ---------------------------------------------------------------------------
function getISTCalendarDate(input: Date | string = new Date()): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function maskPhoneNumber(phone: string | undefined | null, role: string): string {
  if (!phone) return '—';
  if (role === 'SUPER_ADMIN') return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return 'XXXXXX';
  return `XXXXXX${digits.slice(-4)}`;
}

function verifyStoredPassword(plain: string, storedHash: string): boolean {
  if (storedHash.startsWith('$v1$')) {
    const parts = storedHash.split('$');
    const salt = parts[2];
    const expectedHex = parts[3];
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    const input = `${salt}:${plain}:narayana-crm-v1`;
    for (let round = 0; round < 64; round++) {
      for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 ^= ch + round;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= (ch << 3) ^ round;
        h2 = Math.imul(h2, 0x85ebca6b);
      }
    }
    const hex = ((h1 >>> 0).toString(16).padStart(8, '0')) + ((h2 >>> 0).toString(16).padStart(8, '0'));
    return hex === expectedHex;
  }
  if (storedHash.startsWith('bcrypt$12$')) {
    return storedHash.slice('bcrypt$12$'.length) === plain;
  }
  return storedHash === plain;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim()) {
    return process.env.SESSION_SECRET.trim();
  }
  ensureDataDir();
  if (fs.existsSync(SECRET_FILE)) {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing) return existing;
  }
  // Deterministic fallback so container restarts on free-tier hosts do not invalidate active tokens
  const deterministicSecret = crypto
    .createHash('sha256')
    .update(`narayana-prodigy-crm-session:${DATABASE_URL || 'local-cluster'}:${process.env.RENDER_SERVICE_ID || 'narayana-crm'}`)
    .digest('hex');
  try {
    fs.writeFileSync(SECRET_FILE, deterministicSecret, { mode: 0o600 });
  } catch {}
  return deterministicSecret;
}

const SESSION_SECRET = getSessionSecret();

function signToken(payload: { userId: string; role: string; exp: number }): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token: string | undefined | null): { userId: string; role: string; exp: number } | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed?.userId || !parsed?.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Authoritative Server State
// ---------------------------------------------------------------------------
interface ServerCRMState {
  version: number;
  defaultUsersDigest?: string;
  users: any[];
  sessions: any[];
  activeSessionId: string;
  settings: {
    pending_after_days: number;
    suspicious_seconds: number;
    attendance_leave_rule: 'EXCLUDE' | 'COUNT_AS_PRESENT' | 'COUNT_AS_ABSENT';
    dial_prefix: string;
    monthly_call_days: number;
  };
  students: any[];
  callLogs: any[];
  campaigns: any[];
  campaignAssignments: any[];
  externalLeads: any[];
  exams: any[];
  attendance: any[];
  uploadBatches: any[];
  auditLogs: any[];
}

function processInitialStudents(raw: any[]): any[] {
  const compositeMap = new Map<string, any[]>();
  raw.forEach((s) => {
    const nameKey = String(s.user_name || '').trim().toLowerCase();
    const fatherKey = String(s.father_name || '').trim().toLowerCase();
    const mobileKey = String(s.student_mobile || '').replace(/\D/g, '').slice(-10);
    const personKey = `${nameKey}|${fatherKey}|${mobileKey}`;
    if (!compositeMap.has(personKey)) compositeMap.set(personKey, []);
    compositeMap.get(personKey)!.push(s);
  });

  const processed: any[] = [];
  compositeMap.forEach((group, personKey) => {
    const isMulti = group.length > 1;
    const batches = group.map((st) => `${st.batch_name || st.course_name} (#${st.admission_no})`).join(', ');
    group.forEach((st) => {
      const copy = { ...st };
      copy.is_cross_batch_enrolled = isMulti;
      copy.cross_batch_group_key = personKey;
      copy.enrolled_batches_summary = isMulti ? batches : undefined;
      if (!copy.academic_session_id) copy.academic_session_id = 'session-2026-27';
      processed.push(copy);
    });
  });
  return processed;
}

function createSeedState(): ServerCRMState {
  const rawUsers: any[] = fs.existsSync(DEFAULT_USERS_FILE)
    ? JSON.parse(fs.readFileSync(DEFAULT_USERS_FILE, 'utf8'))
    : [];
  const users = rawUsers.map((u) => ({
    ...u,
    status: u.status || 'ACTIVE',
  }));

  const rawStudents: any[] = fs.existsSync(REAL_ADMISSIONS_FILE)
    ? JSON.parse(fs.readFileSync(REAL_ADMISSIONS_FILE, 'utf8'))
    : [];
  const students = processInitialStudents(rawStudents);

  const todayIST = getISTCalendarDate();
  const mentors = users.filter((u) => u.role === 'MENTOR');
  const campaigns = [
    {
      id: 'camp-ptm-nov',
      title: 'PTM Attendance & Marks Review Drive',
      purpose: 'PTM',
      session_id: 'session-2026-27',
      assignment_date: todayIST,
      outcome_options: ['Will Attend PTM', 'Cannot Attend', 'Parent Out of Station', 'Discussed Over Call'],
      target_mentor_ids: mentors.map((m) => m.id),
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    },
    {
      id: 'camp-ioqm-special',
      title: 'IOQM Stage-1 Performance Counselling',
      purpose: 'IOQM',
      session_id: 'session-2026-27',
      assignment_date: todayIST,
      outcome_options: ['Interested in Mock Tests', 'Needs Doubt Class', 'Registered for Exam', 'Not Interested'],
      target_mentor_ids: mentors.slice(0, 5).map((m) => m.id),
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    },
  ];

  const campaignAssignments: any[] = [];
  if (mentors.length > 0) {
    students.slice(0, 30).forEach((st, idx) => {
      const mentor = mentors[idx % mentors.length];
      campaignAssignments.push({
        id: `asg-init-${idx}`,
        campaign_id: 'camp-ptm-nov',
        campaign_title: 'PTM Attendance & Marks Review Drive',
        campaign_purpose: 'PTM',
        student_id: st.admission_no,
        mentor_id: mentor.id,
        assigned_date: todayIST,
        completion_status: idx % 3 === 0 ? 'COMPLETED' : 'ASSIGNED',
        assigned_by: 'Abhishek Gupta',
      });
    });
  }

  return {
    version: 1,
    defaultUsersDigest: getDefaultUsersDigest() || undefined,
    users: users.map((u) => ({
      ...u,
      email: String(u.email || '').trim().toLowerCase(),
      username: String(u.username || u.email || '').trim().toLowerCase(),
    })),
    sessions: [
      { id: 'session-2025-26', name: '2025-26', start_month: 4, is_active: false },
      { id: 'session-2026-27', name: '2026-27', start_month: 4, is_active: true },
      { id: 'session-2027-28', name: '2027-28', start_month: 4, is_active: false },
    ],
    activeSessionId: 'session-2026-27',
    settings: {
      pending_after_days: 2,
      suspicious_seconds: 15,
      attendance_leave_rule: 'EXCLUDE',
      dial_prefix: '+91',
      monthly_call_days: 30,
    },
    students,
    callLogs: [],
    campaigns,
    campaignAssignments,
    externalLeads: [],
    exams: [],
    attendance: [],
    uploadBatches: [],
    auditLogs: [],
  };
}

type StateSection =
  | 'meta'
  | 'users'
  | 'students'
  | 'callLogs'
  | 'campaigns'
  | 'campaignAssignments'
  | 'externalLeads'
  | 'exams'
  | 'attendance'
  | 'uploadBatches'
  | 'auditLogs';

const ALL_SECTIONS: StateSection[] = [
  'meta',
  'users',
  'students',
  'callLogs',
  'campaigns',
  'campaignAssignments',
  'externalLeads',
  'exams',
  'attendance',
  'uploadBatches',
  'auditLogs',
];

function extractSectionPayload(state: ServerCRMState, section: StateSection): any {
  if (section === 'meta') {
    return {
      version: state.version,
      defaultUsersDigest: state.defaultUsersDigest,
      sessions: state.sessions,
      activeSessionId: state.activeSessionId,
      settings: state.settings,
    };
  }
  return state[section];
}

function applySectionPayload(target: ServerCRMState, section: StateSection, payload: any) {
  if (section === 'meta' && payload && typeof payload === 'object') {
    if (typeof payload.version === 'number') target.version = payload.version;
    if (typeof payload.defaultUsersDigest === 'string') target.defaultUsersDigest = payload.defaultUsersDigest;
    if (Array.isArray(payload.sessions)) target.sessions = payload.sessions;
    if (payload.activeSessionId) target.activeSessionId = payload.activeSessionId;
    if (payload.settings) target.settings = { ...target.settings, ...payload.settings };
    return;
  }
  if (Array.isArray(payload)) {
    (target as any)[section] = payload;
  }
}

let pgPool: Pool | null = null;
let pgPersistChain: Promise<void> = Promise.resolve();

function createPgPoolIfConfigured(): Pool | null {
  if (!DATABASE_URL) return null;
  try {
    const isLocalhost = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
    const isNeonHost = DATABASE_URL.includes('.neon.tech');
    // Normalize sslmode=require to verify-full for Neon so pg v8 verifies certs cleanly without warnings
    const normalizedUrl = isNeonHost
      ? DATABASE_URL.replace(/sslmode=require\b/gi, 'sslmode=verify-full')
      : DATABASE_URL;

    const pool = new Pool({
      connectionString: normalizedUrl,
      ssl: isLocalhost ? undefined : isNeonHost ? undefined : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 15000,
    });

    // Prevent unhandled idle-client disconnect crashes when Neon suspends compute (scale-to-zero)
    pool.on('error', (err) => {
      console.warn('[Narayana CRM] PostgreSQL pool idle client notice:', err.message);
    });

    return pool;
  } catch (err) {
    console.warn('[Narayana CRM] Failed to initialize PostgreSQL pool, using local JSON fallback:', err);
    return null;
  }
}

function getDefaultUsersDigest(): string | null {
  if (!fs.existsSync(DEFAULT_USERS_FILE)) return null;
  try {
    const raw = fs.readFileSync(DEFAULT_USERS_FILE, 'utf8');
    return crypto.createHash('sha256').update(raw).digest('hex');
  } catch {
    return null;
  }
}

function buildCleanDefaultUserRecord(u: any) {
  const emailLower = String(u.email || '').trim().toLowerCase();
  const usernameLower = String(u.username || emailLower).trim().toLowerCase();
  const out: Record<string, any> = {
    id: u.id,
    name: String(u.name || '').trim(),
    email: emailLower,
  };
  if (usernameLower && usernameLower !== emailLower) {
    out.username = usernameLower;
  }
  out.role = u.role || 'MENTOR';
  out.department = String(u.department || '').trim();
  out.daily_call_goal = Number(u.daily_call_goal ?? (out.role === 'SUPER_ADMIN' ? 0 : 60));
  if (u.mobile_number !== undefined && u.mobile_number !== '') {
    out.mobile_number = String(u.mobile_number).trim();
  }
  if (u.status && u.status !== 'ACTIVE') {
    out.status = u.status;
  }
  if (u.must_change_password) {
    out.must_change_password = true;
  }
  if (u.password_hash) {
    out.password_hash = u.password_hash;
  }
  return out;
}

function syncStateUsersToDefaultUsersFile(state: ServerCRMState): boolean {
  try {
    const cleanList = state.users.map(buildCleanDefaultUserRecord);
    const jsonText = JSON.stringify(cleanList, null, 2) + '\n';
    const nextDigest = crypto.createHash('sha256').update(jsonText).digest('hex');
    if (fs.existsSync(DEFAULT_USERS_FILE)) {
      const existingText = fs.readFileSync(DEFAULT_USERS_FILE, 'utf8');
      if (existingText === jsonText) {
        state.defaultUsersDigest = nextDigest;
        return false;
      }
    }
    const tmpFile = `${DEFAULT_USERS_FILE}.tmp-${Date.now()}`;
    fs.writeFileSync(tmpFile, jsonText, 'utf8');
    fs.renameSync(tmpFile, DEFAULT_USERS_FILE);
    state.defaultUsersDigest = nextDigest;
    return true;
  } catch (err) {
    // Expected if running on a read-only production container
    console.warn('[Narayana CRM] Note: Could not write defaultUsers.json on this host:', (err as any)?.message || err);
    return false;
  }
}

function syncDefaultUsersIntoState(state: ServerCRMState): { changed: boolean; migratedRefs: boolean } {
  if (!fs.existsSync(DEFAULT_USERS_FILE)) return { changed: false, migratedRefs: false };
  try {
    const rawText = fs.readFileSync(DEFAULT_USERS_FILE, 'utf8');
    const currentDigest = crypto.createHash('sha256').update(rawText).digest('hex');
    if (state.defaultUsersDigest === currentDigest) {
      return { changed: false, migratedRefs: false };
    }

    const defaultUsers: any[] = JSON.parse(rawText);
    const idMigrations = new Map<string, string>();
    const normalizePhone10 = (p: any) => {
      const digits = String(p || '').replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(-10) : '';
    };

    for (const du of defaultUsers) {
      const duEmail = String(du.email || '').trim().toLowerCase();
      const duName = String(du.name || '').trim().toLowerCase();
      const duPhone10 = normalizePhone10(du.mobile_number || du.mobile);

      let existing = state.users.find((u) => u.id === du.id);
      if (!existing && duEmail) {
        existing = state.users.find((u) => u.email && String(u.email).trim().toLowerCase() === duEmail);
      }
      if (!existing && duName) {
        existing = state.users.find((u) => u.name && String(u.name).trim().toLowerCase() === duName);
      }
      if (!existing && duPhone10) {
        existing = state.users.find((u) => {
          const p10 = normalizePhone10(u.mobile_number || u.mobile);
          return Boolean(p10 && p10 === duPhone10);
        });
      }

      if (existing) {
        if (existing.id !== du.id) {
          idMigrations.set(existing.id, du.id);
        }
        existing.id = du.id;
        existing.name = du.name;
        if (duEmail) existing.email = duEmail;
        existing.username = String(du.username || duEmail || existing.username || '').trim().toLowerCase();
        existing.role = du.role;
        existing.department = du.department;
        existing.daily_call_goal = du.daily_call_goal ?? (du.role === 'SUPER_ADMIN' ? 0 : 60);
        if (du.mobile_number !== undefined) existing.mobile_number = du.mobile_number;
        if (du.status) existing.status = du.status;
        else if (!existing.status) existing.status = 'ACTIVE';
        if (du.must_change_password !== undefined) existing.must_change_password = du.must_change_password;
        if (du.password_hash) {
          existing.password_hash = du.password_hash;
          existing.password = undefined;
          existing.failed_logins = 0;
          existing.locked_until = undefined;
        }
      } else {
        state.users.push({
          ...du,
          email: duEmail,
          username: String(du.username || duEmail).trim().toLowerCase(),
          status: du.status || 'ACTIVE',
          failed_logins: 0,
          created_at: du.created_at || new Date().toISOString(),
        });
      }
    }

    if (idMigrations.size > 0) {
      state.students.forEach((s) => {
        if (s.mentor_id && idMigrations.has(s.mentor_id)) {
          s.mentor_id = idMigrations.get(s.mentor_id);
        }
      });
      state.campaignAssignments.forEach((a) => {
        if (a.mentor_id && idMigrations.has(a.mentor_id)) {
          a.mentor_id = idMigrations.get(a.mentor_id);
        }
      });
      state.callLogs.forEach((c) => {
        if (c.mentor_id && idMigrations.has(c.mentor_id)) {
          c.mentor_id = idMigrations.get(c.mentor_id);
        }
      });
      state.externalLeads.forEach((l) => {
        if (l.assigned_to && idMigrations.has(l.assigned_to)) {
          l.assigned_to = idMigrations.get(l.assigned_to);
        }
      });
      state.campaigns.forEach((camp) => {
        if (Array.isArray(camp.target_mentor_ids)) {
          camp.target_mentor_ids = camp.target_mentor_ids.map((id: string) => idMigrations.get(id) || id);
        }
      });
    }

    state.defaultUsersDigest = currentDigest;
    return { changed: true, migratedRefs: idMigrations.size > 0 };
  } catch (err) {
    console.warn('[Narayana CRM] defaultUsers sync warning:', err);
    return { changed: false, migratedRefs: false };
  }
}

function loadServerState(): ServerCRMState {
  ensureDataDir();
  if (fs.existsSync(STATE_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.students)) {
        const syncRes = syncDefaultUsersIntoState(parsed);
        if (syncRes.changed) {
          parsed.version = (parsed.version || 1) + 1;
          saveServerStateLocal(parsed);
        }
        return parsed;
      }
    } catch (err) {
      console.warn('Corrupt state file, re-seeding:', err);
    }
  }
  const seeded = createSeedState();
  saveServerStateLocal(seeded);
  return seeded;
}

function saveServerStateLocal(state: ServerCRMState) {
  try {
    ensureDataDir();
    const tmpFile = `${STATE_FILE}.tmp-${Date.now()}`;
    fs.writeFileSync(tmpFile, JSON.stringify(state), 'utf8');
    fs.renameSync(tmpFile, STATE_FILE);
  } catch (err) {
    console.warn('[Narayana CRM] Local state file save warning:', err);
  }
}

async function upsertSectionsWithRetry(pool: Pool, names: string[], payloads: string[]): Promise<void> {
  const query = `
    INSERT INTO crm_state_sections (section, payload, updated_at)
    SELECT s, p, NOW()
    FROM unnest($1::text[], $2::jsonb[]) AS t(s, p)
    ON CONFLICT (section) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
  `;
  try {
    await pool.query(query, [names, payloads]);
  } catch {
    // Handle Neon scale-to-zero wakeup transient failure with a single retry
    await new Promise((r) => setTimeout(r, 600));
    await pool.query(query, [names, payloads]);
  }
}

function persistStateToPostgres(state: ServerCRMState, sections: StateSection[] = ALL_SECTIONS) {
  if (!pgPool) return;
  const uniqueSections = Array.from(new Set(sections));
  const names = uniqueSections;
  const payloads = uniqueSections.map((sec) => JSON.stringify(extractSectionPayload(state, sec)));

  pgPersistChain = pgPersistChain
    .then(async () => {
      if (!pgPool) return;
      await upsertSectionsWithRetry(pgPool, names, payloads);
    })
    .catch((err) => {
      console.error('[Narayana CRM] PostgreSQL save error:', err);
    });
}

async function flushPostgresPersistence(timeoutMs: number = 5000): Promise<void> {
  if (!pgPool) return;
  await Promise.race([
    pgPersistChain,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function saveServerState(state: ServerCRMState, sections: StateSection[] = ALL_SECTIONS) {
  saveServerStateLocal(state);
  persistStateToPostgres(state, sections);
}

let serverState: ServerCRMState = loadServerState();
const activeDialSessions = new Map<string, { startedAt: string; contactUsed: 'PRIMARY' | 'ALTERNATE' }>();

async function initCloudPersistence(): Promise<void> {
  pgPool = createPgPoolIfConfigured();
  if (!pgPool) {
    console.log('[Narayana CRM] Persistence mode: LOCAL_JSON (set DATABASE_URL for unlimited-refresh Neon PostgreSQL cloud sync)');
    return;
  }

  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS crm_state_sections (
        section TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const secRes = await pgPool.query(`SELECT section, payload FROM crm_state_sections`);
    if (secRes.rows.length > 0) {
      const merged = createSeedState();
      merged.defaultUsersDigest = undefined;
      const loadedSections = new Set<string>();
      secRes.rows.forEach((row) => {
        if (ALL_SECTIONS.includes(row.section)) {
          applySectionPayload(merged, row.section as StateSection, row.payload);
          loadedSections.add(row.section);
        }
      });

      const usersSync = syncDefaultUsersIntoState(merged);
      if (usersSync.changed) {
        merged.version = (merged.version || 1) + 1;
      }
      serverState = merged;

      let codeFileMirrored = false;
      if (!usersSync.changed && !process.env.RENDER) {
        codeFileMirrored = syncStateUsersToDefaultUsersFile(serverState);
      }
      saveServerStateLocal(serverState);

      const missing = ALL_SECTIONS.filter((s) => !loadedSections.has(s));
      if (missing.length > 0 || usersSync.changed || codeFileMirrored) {
        const extraSections: StateSection[] = usersSync.changed
          ? ['users', 'meta', ...(usersSync.migratedRefs ? (['students', 'campaignAssignments', 'callLogs', 'externalLeads', 'campaigns'] as StateSection[]) : [])]
          : codeFileMirrored
          ? ['meta']
          : [];
        const toSave: StateSection[] = Array.from(new Set([...missing, ...extraSections]));
        await upsertSectionsWithRetry(
          pgPool,
          toSave,
          toSave.map((sec) => JSON.stringify(extractSectionPayload(serverState, sec)))
        );
      }

      console.log(
        `[Narayana CRM] Loaded state from Neon PostgreSQL (${secRes.rows.length} sections, version ${serverState.version}, ${serverState.users.length} users, ${serverState.students.length} students${usersSync.changed ? ', reconciled defaultUsers.json' : codeFileMirrored ? ', mirrored DB users to defaultUsers.json' : ''})`
      );
      return;
    }

    // Migrate legacy single-row snapshot if present
    const legacyCheck = await pgPool.query(`SELECT to_regclass('public.crm_app_state') AS tbl`);
    if (legacyCheck.rows[0]?.tbl) {
      const legacyRes = await pgPool.query(`SELECT state FROM crm_app_state WHERE id = 'primary' LIMIT 1`);
      const dbState = legacyRes.rows[0]?.state as ServerCRMState | undefined;
      if (dbState && Array.isArray(dbState.users) && Array.isArray(dbState.students)) {
        syncDefaultUsersIntoState(dbState);
        serverState = dbState;
        saveServerStateLocal(serverState);
      }
    }

    await upsertSectionsWithRetry(
      pgPool,
      ALL_SECTIONS,
      ALL_SECTIONS.map((sec) => JSON.stringify(extractSectionPayload(serverState, sec)))
    );
    console.log(
      `[Narayana CRM] Seeded Neon PostgreSQL database (${serverState.users.length} users, ${serverState.students.length} students).`
    );
  } catch (err) {
    console.error('[Narayana CRM] PostgreSQL initialization failed, falling back to local JSON:', err);
    pgPool = null;
  }
}

function sanitizeUserForClient(u: any) {
  if (!u) return null;
  const { password, password_hash, ...rest } = u;
  return rest;
}

function appendAudit(entry: { user_name: string; user_role: string; action: string; entity: string; entity_id: string; meta?: any }) {
  serverState.auditLogs.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    ...entry,
    created_at: new Date().toISOString(),
  });
  if (serverState.auditLogs.length > 5000) {
    serverState.auditLogs = serverState.auditLogs.slice(0, 5000);
  }
}

function buildRoleScopedState(user: any) {
  if (user.role === 'SUPER_ADMIN') {
    return {
      version: serverState.version,
      serverTime: new Date().toISOString(),
      users: serverState.users.map(sanitizeUserForClient),
      sessions: serverState.sessions,
      activeSessionId: serverState.activeSessionId,
      settings: serverState.settings,
      students: serverState.students,
      callLogs: serverState.callLogs,
      campaigns: serverState.campaigns,
      campaignAssignments: serverState.campaignAssignments,
      externalLeads: serverState.externalLeads,
      exams: serverState.exams,
      attendance: serverState.attendance,
      uploadBatches: serverState.uploadBatches,
      auditLogs: serverState.auditLogs.slice(0, 200),
    };
  }

  // Strict MENTOR RBAC scoping + phone masking + remark privacy + zero audit flags
  const todayIST = getISTCalendarDate();
  const mentorAssignments = serverState.campaignAssignments.filter((a) => a.mentor_id === user.id);
  const assignedStudentIds = new Set(mentorAssignments.map((a) => a.student_id));

  const mentorStudents = serverState.students
    .filter((s) => !s.deleted_at && (s.mentor_id === user.id || assignedStudentIds.has(s.admission_no)))
    .map((s) => {
      const { govt_id_encrypted, ...rest } = s;
      return {
        ...rest,
        student_mobile: maskPhoneNumber(s.student_mobile, 'MENTOR'),
        whatsapp_number: maskPhoneNumber(s.whatsapp_number, 'MENTOR'),
      };
    });

  const visibleAdmissionNos = new Set(mentorStudents.map((s) => s.admission_no));

  const mentorCalls = serverState.callLogs
    .filter((c) => c.mentor_id === user.id)
    .map((c) => {
      const { is_suspicious, suspicious_reason, latency_seconds, ...rest } = c;
      const isTodayOwn = c.calendar_date === todayIST;
      return {
        ...rest,
        remark: isTodayOwn ? c.remark : '',
        original_remark: isTodayOwn ? c.original_remark : undefined,
        activities: isTodayOwn ? c.activities : undefined,
      };
    });

  return {
    version: serverState.version,
    serverTime: new Date().toISOString(),
    users: [sanitizeUserForClient(user)],
    sessions: serverState.sessions,
    activeSessionId: serverState.activeSessionId,
    settings: serverState.settings,
    students: mentorStudents,
    callLogs: mentorCalls,
    campaigns: serverState.campaigns.filter((c) => c.status !== 'DELETED'),
    campaignAssignments: mentorAssignments,
    externalLeads: serverState.externalLeads.filter((l) => l.assigned_to === user.id),
    exams: serverState.exams.filter((e) => visibleAdmissionNos.has(e.student_id)),
    attendance: serverState.attendance.filter((a) => visibleAdmissionNos.has(a.student_id)),
    uploadBatches: [],
    auditLogs: [],
  };
}

// ---------------------------------------------------------------------------
// Express + WebSocket Server
// ---------------------------------------------------------------------------
interface AuthedRequest extends Request {
  authUser?: any;
}

const wsClients = new Set<{ ws: WebSocket; userId: string; role: string }>();

const ACTION_DIRTY_SECTIONS: Record<string, StateSection[]> = {
  USER_ADD: ['meta', 'users', 'auditLogs'],
  USER_UPDATE: ['meta', 'users', 'auditLogs'],
  USER_DELETE: ['meta', 'users', 'auditLogs'],
  CALL_SUBMIT: ['meta', 'callLogs', 'students', 'campaignAssignments', 'auditLogs'],
  CALL_INBOUND_OVERRIDE: ['meta', 'callLogs', 'students', 'campaignAssignments', 'auditLogs'],
  CAMPAIGN_CREATE: ['meta', 'campaigns', 'auditLogs'],
  CAMPAIGN_UPDATE: ['meta', 'campaigns', 'auditLogs'],
  CAMPAIGN_DELETE: ['meta', 'campaigns', 'auditLogs'],
  BULK_ASSIGN: ['meta', 'campaignAssignments', 'auditLogs'],
  LEADS_ASSIGN: ['meta', 'externalLeads', 'auditLogs'],
  LEADS_ADD_BATCH: ['meta', 'externalLeads', 'auditLogs'],
  ADMISSIONS_REGISTER: ['meta', 'students', 'auditLogs'],
  EXAMS_ADD: ['meta', 'exams', 'auditLogs'],
  ATTENDANCE_ADD: ['meta', 'attendance', 'auditLogs'],
  BATCH_RECORD: ['meta', 'uploadBatches', 'auditLogs'],
  BATCH_ROLLBACK: ['meta', 'uploadBatches', 'students', 'auditLogs'],
  SETTINGS_UPDATE: ['meta', 'auditLogs'],
  SESSION_SET: ['meta', 'auditLogs'],
  SESSION_ADD: ['meta', 'auditLogs'],
  STATE_RESTORED: ALL_SECTIONS,
};

function broadcastStateChanged(action: string, actorId: string, affectedMentorIds?: string[]) {
  serverState.version += 1;
  saveServerState(serverState, ACTION_DIRTY_SECTIONS[action] || ALL_SECTIONS);

  const payload = JSON.stringify({
    type: 'CRM_STATE_CHANGED',
    version: serverState.version,
    action,
    actorId,
    timestamp: new Date().toISOString(),
  });

  wsClients.forEach((client) => {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    if (client.role === 'SUPER_ADMIN') {
      client.ws.send(payload);
      return;
    }
    if (
      !affectedMentorIds ||
      affectedMentorIds.length === 0 ||
      affectedMentorIds.includes(client.userId)
    ) {
      client.ws.send(payload);
    }
  });
}

async function startServer() {
  await initCloudPersistence();

  const app = express();
  app.use(express.json({ limit: '25mb' }));

  const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const decoded = verifyToken(token);
    if (!decoded) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const user = serverState.users.find((u) => u.id === decoded.userId);
    if (!user || user.status === 'INACTIVE') {
      res.status(401).json({ error: 'Account inactive or not found' });
      return;
    }
    req.authUser = user;
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      appVersion: APP_VERSION,
      version: serverState.version,
      persistenceMode: pgPool ? 'POSTGRESQL_CLOUD' : 'LOCAL_JSON',
      time: new Date().toISOString(),
    });
  });

  app.get('/api/admin/backup-state', requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Forbidden: Super Admin access required.' });
      return;
    }
    res.json({
      exportedAt: new Date().toISOString(),
      persistenceMode: pgPool ? 'POSTGRESQL_CLOUD' : 'LOCAL_JSON',
      state: serverState,
    });
  });

  app.get('/api/admin/export-default-users', requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Forbidden: Super Admin access required.' });
      return;
    }
    res.json(serverState.users.map(buildCleanDefaultUserRecord));
  });

  app.post('/api/admin/restore-state', requireAuth, async (req: AuthedRequest, res) => {
    if (req.authUser.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Forbidden: Super Admin access required.' });
      return;
    }
    const incoming = req.body?.state || req.body;
    if (!incoming || !Array.isArray(incoming.users) || !Array.isArray(incoming.students)) {
      res.status(400).json({ error: 'Invalid state backup file.' });
      return;
    }
    serverState = {
      ...incoming,
      version: Math.max(serverState.version + 1, Number(incoming.version || 1) + 1),
    };
    syncStateUsersToDefaultUsersFile(serverState);
    appendAudit({
      user_name: req.authUser.name,
      user_role: req.authUser.role,
      action: 'SETTINGS_CHANGE',
      entity: 'SystemState',
      entity_id: 'restore-backup',
      meta: { usersCount: serverState.users.length, studentsCount: serverState.students.length },
    });
    broadcastStateChanged('STATE_RESTORED', req.authUser.id);
    await flushPostgresPersistence();
    res.json({ ok: true, version: serverState.version, usersCount: serverState.users.length });
  });

  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body || {};
    if (typeof identifier !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Credentials are required.' });
      return;
    }

    const term = identifier.trim().toLowerCase();
    const digitsOnly = identifier.replace(/\D/g, '');
    const last10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : '';

    const user = serverState.users.find((u) => {
      if (u.email && u.email.toLowerCase() === term) return true;
      if (u.username && u.username.toLowerCase() === term) return true;
      if (u.name && u.name.toLowerCase() === term) return true;
      if (last10 && u.mobile_number && String(u.mobile_number).replace(/\D/g, '').endsWith(last10)) return true;
      if (last10 && u.mobile && String(u.mobile).replace(/\D/g, '').endsWith(last10)) return true;
      return false;
    });

    const genericError = 'Invalid credentials. Please contact your Super Admin.';
    if (!user || user.status === 'INACTIVE') {
      res.status(401).json({ error: genericError });
      return;
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      const waitMin = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / (60 * 1000));
      res.status(423).json({
        error: `Account locked due to 5 failed attempts. Please retry in ${waitMin} minutes.`,
      });
      return;
    }

    const envSeedPassword = process.env.SEED_ADMIN_PASSWORD || process.env.VITE_SEED_ADMIN_PASSWORD || '';
    let passwordValid = true;
    if (user.password_hash) {
      passwordValid = verifyStoredPassword(password, user.password_hash);
    } else if (user.password) {
      passwordValid = user.password === password;
    } else if (user.id === 'admin-1' && envSeedPassword) {
      passwordValid = password === envSeedPassword;
    } else if (!password.trim()) {
      passwordValid = false;
    }

    if (!passwordValid) {
      const failed = (user.failed_logins || 0) + 1;
      user.failed_logins = failed;
      if (failed >= 5) {
        user.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      saveServerState(serverState, ['users']);
      res.status(401).json({ error: genericError });
      return;
    }

    user.failed_logins = 0;
    user.locked_until = undefined;
    appendAudit({
      user_name: user.name,
      user_role: user.role,
      action: 'LOGIN',
      entity: 'User',
      entity_id: user.id,
      meta: { timestamp: new Date().toISOString() },
    });
    saveServerState(serverState, ['users', 'auditLogs']);

    const token = signToken({
      userId: user.id,
      role: user.role,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    });

    res.json({ token, user: sanitizeUserForClient(user), version: serverState.version });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: sanitizeUserForClient(req.authUser), version: serverState.version });
  });

  app.get('/api/sync/state', requireAuth, (req: AuthedRequest, res) => {
    res.json(buildRoleScopedState(req.authUser));
  });

  app.post('/api/calls/start', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser;
    const { studentId, contactUsed = 'PRIMARY' } = req.body || {};
    const student = serverState.students.find((s) => s.admission_no === studentId && !s.deleted_at);
    if (!student) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }

    if (user.role !== 'SUPER_ADMIN') {
      const isOwner = student.mentor_id === user.id;
      const hasTask = serverState.campaignAssignments.some(
        (a) => a.student_id === studentId && a.mentor_id === user.id && a.completion_status !== 'COMPLETED'
      );
      if (!isOwner && !hasTask) {
        res.status(403).json({ error: 'Access Denied: You are not authorized to call this student.' });
        return;
      }
    }

    appendAudit({
      user_name: user.name,
      user_role: user.role,
      action: 'UNMASK_PHONE',
      entity: 'Student',
      entity_id: studentId,
      meta: { contactUsed },
    });

    const sessionKey = `${studentId}_${user.id}`;
    let dialSession = activeDialSessions.get(sessionKey);
    const now = new Date();
    if (!dialSession) {
      dialSession = { startedAt: now.toISOString(), contactUsed };
      activeDialSessions.set(sessionKey, dialSession);
    }

    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(dialSession.startedAt).getTime()) / 1000));
    const targetPhone = contactUsed === 'PRIMARY' ? student.student_mobile : (student.whatsapp_number || student.student_mobile);
    const cleanPhone = String(targetPhone || '').replace(/\D/g, '');
    const dialLink = `tel:${serverState.settings.dial_prefix}${cleanPhone}`;
    saveServerState(serverState, ['auditLogs']);

    res.json({
      unmaskedPrimary: student.student_mobile,
      unmaskedAlternate: student.whatsapp_number || student.student_mobile || '',
      firstInitiatedAt: dialSession.startedAt,
      elapsedSeconds,
      dialLink,
    });
  });

  app.post('/api/actions', requireAuth, async (req: AuthedRequest, res) => {
    const user = req.authUser;
    const { action, payload = {} } = req.body || {};
    const todayIST = getISTCalendarDate();
    const nowIso = new Date().toISOString();

    const adminOnlyActions = new Set([
      'USER_ADD',
      'USER_UPDATE',
      'USER_DELETE',
      'CAMPAIGN_CREATE',
      'CAMPAIGN_UPDATE',
      'CAMPAIGN_DELETE',
      'BULK_ASSIGN',
      'LEADS_ASSIGN',
      'LEADS_ADD_BATCH',
      'ADMISSIONS_REGISTER',
      'EXAMS_ADD',
      'ATTENDANCE_ADD',
      'BATCH_RECORD',
      'BATCH_ROLLBACK',
      'SETTINGS_UPDATE',
      'SESSION_SET',
      'SESSION_ADD',
    ]);

    if (adminOnlyActions.has(action) && user.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Forbidden: Super Admin access required.' });
      return;
    }

    try {
      switch (action) {
        case 'CALL_SUBMIT': {
          const mentorId = user.role === 'SUPER_ADMIN' && payload.mentorId ? payload.mentorId : user.id;
          const mentorName = user.role === 'SUPER_ADMIN' && payload.mentorName ? payload.mentorName : user.name;
          const student = serverState.students.find((s) => s.admission_no === payload.studentId);
          if (!student) {
            res.status(404).json({ error: 'Student not found' });
            return;
          }

          const sessionKey = `${payload.studentId}_${mentorId}`;
          const dialSession = activeDialSessions.get(sessionKey);
          const initiatedAt = dialSession?.startedAt || payload.initiatedAt || nowIso;
          activeDialSessions.delete(sessionKey);

          const latencySeconds = Math.max(0, Math.round((Date.now() - new Date(initiatedAt).getTime()) / 1000));
          const isSuspicious = payload.disposition === 'CONNECTED' && latencySeconds < serverState.settings.suspicious_seconds;
          const suspiciousReason = isSuspicious
            ? `Connected call submitted in ${latencySeconds}s (<${serverState.settings.suspicious_seconds}s threshold)`
            : undefined;

          let existingLog = serverState.callLogs.find(
            (c) => c.student_id === payload.studentId && c.mentor_id === mentorId && c.calendar_date === todayIST
          );

          const attempt = {
            id: `att-${Date.now()}`,
            call_log_id: existingLog ? existingLog.id : '',
            contact_used: payload.contactUsed || 'PRIMARY',
            started_at: initiatedAt,
            duration_seconds: Number(payload.callDurationSec || 0),
          };
          const activity = {
            id: `act-${Date.now()}`,
            call_log_id: existingLog ? existingLog.id : '',
            type: 'INITIAL_SUBMIT',
            disposition_after: payload.disposition,
            remark_text: String(payload.remark || '').trim(),
            reminder_after: payload.followUpDate,
            by_user: mentorName,
            created_at: nowIso,
          };

          if (existingLog) {
            attempt.call_log_id = existingLog.id;
            activity.call_log_id = existingLog.id;
            existingLog.attempts = [...(existingLog.attempts || []), attempt];
            existingLog.activities = [...(existingLog.activities || []), activity];
            existingLog.last_submitted_at = nowIso;
            existingLog.disposition = payload.disposition;
            existingLog.campaign_outcome = payload.campaignOutcome || existingLog.campaign_outcome;
            existingLog.remark = String(payload.remark || '').trim();
            existingLog.call_duration_sec = (existingLog.call_duration_sec || 0) + Number(payload.callDurationSec || 0);
            if (isSuspicious) {
              existingLog.is_suspicious = true;
              existingLog.suspicious_reason = suspiciousReason;
            }
            if (payload.followUpDate) {
              existingLog.follow_up_date = payload.followUpDate;
              existingLog.follow_up_time = payload.followUpTime || '10:00 AM';
              existingLog.follow_up_status = 'PENDING';
            }
          } else {
            const newLogId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            attempt.call_log_id = newLogId;
            activity.call_log_id = newLogId;
            existingLog = {
              id: newLogId,
              student_id: payload.studentId,
              mentor_id: mentorId,
              mentor_name: mentorName,
              campaign_id: payload.campaignId,
              campaign_outcome: payload.campaignOutcome,
              academic_session_id: student.academic_session_id || serverState.activeSessionId,
              call_date: todayIST,
              calendar_date: todayIST,
              call_initiated_at: initiatedAt,
              first_initiated_at: initiatedAt,
              last_submitted_at: nowIso,
              latency_seconds: latencySeconds,
              is_suspicious: isSuspicious,
              suspicious_reason: suspiciousReason,
              disposition: payload.disposition,
              call_duration_sec: Number(payload.callDurationSec || 0),
              remark: String(payload.remark || '').trim(),
              call_type: 'OUTBOUND',
              status: 'SUBMITTED',
              is_inbound_override: false,
              is_locked: false,
              follow_up_date: payload.followUpDate,
              follow_up_time: payload.followUpTime || '10:00 AM',
              follow_up_status: payload.followUpDate ? 'PENDING' : undefined,
              attempts: [attempt],
              activities: [activity],
            };
            serverState.callLogs.unshift(existingLog);
          }

          student.last_call_date = todayIST;
          student.last_call_disposition = payload.disposition;
          student.call_status_today = 'CALLED_TODAY';
          student.active_reminder_date = payload.followUpDate || undefined;
          if (payload.disposition === 'CONNECTED') {
            student.last_connected_at = nowIso;
          }

          const taskStatus =
            payload.disposition === 'CONNECTED' || payload.disposition === 'WRONG_NUMBER'
              ? 'COMPLETED'
              : 'ATTEMPTED';
          const task = serverState.campaignAssignments.find(
            (a) => a.student_id === payload.studentId && a.mentor_id === mentorId && a.completion_status !== 'COMPLETED'
          );
          if (task) {
            task.completion_status = taskStatus;
            if (taskStatus === 'COMPLETED') task.completed_at = nowIso;
          }

          appendAudit({
            user_name: mentorName,
            user_role: 'MENTOR',
            action: 'CALL_SUBMIT',
            entity: 'CallLog',
            entity_id: existingLog.id,
            meta: { disposition: payload.disposition, duration: payload.callDurationSec },
          });

          broadcastStateChanged(action, user.id, [mentorId]);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version, persistedToCloud: Boolean(pgPool) });
          return;
        }

        case 'CALL_INBOUND_OVERRIDE': {
          const call = serverState.callLogs.find((c) => c.id === payload.callId);
          if (!call) {
            res.status(404).json({ error: 'Call log not found' });
            return;
          }
          if (user.role !== 'SUPER_ADMIN' && call.mentor_id !== user.id) {
            res.status(403).json({ error: 'Forbidden' });
            return;
          }
          if (call.calendar_date !== todayIST || call.is_locked) {
            res.status(400).json({ error: 'Call log locked: Same-day inbound callback window expires at midnight IST.' });
            return;
          }

          const activity = {
            id: `act-${Date.now()}`,
            call_log_id: call.id,
            type: 'INBOUND_UPDATE',
            disposition_after: payload.newDisposition,
            remark_text: String(payload.newRemark || '').trim(),
            reminder_after: payload.clearFollowUp ? undefined : payload.newFollowUpDate,
            by_user: payload.callerName || user.name,
            created_at: nowIso,
          };

          call.activities = [...(call.activities || []), activity];
          call.is_inbound_override = true;
          call.original_disposition = call.original_disposition || call.disposition;
          call.original_remark = call.original_remark || call.remark;
          call.disposition = payload.newDisposition;
          call.remark = `${call.remark} | [Inbound Callback]: ${String(payload.newRemark || '').trim()}`;
          call.override_timestamp = nowIso;

          if (payload.clearFollowUp) {
            call.follow_up_date = undefined;
            call.follow_up_status = 'CLEARED';
          } else if (payload.newFollowUpDate) {
            call.follow_up_date = payload.newFollowUpDate;
            call.follow_up_status = 'PENDING';
          }

          const student = serverState.students.find((s) => s.admission_no === call.student_id);
          if (student) {
            student.last_call_disposition = payload.newDisposition;
            if (payload.newDisposition === 'CONNECTED') student.last_connected_at = nowIso;
            student.active_reminder_date = payload.clearFollowUp ? undefined : payload.newFollowUpDate;
          }

          const task = serverState.campaignAssignments.find(
            (a) => a.student_id === call.student_id && a.mentor_id === call.mentor_id
          );
          if (task && (payload.newDisposition === 'CONNECTED' || payload.newDisposition === 'WRONG_NUMBER')) {
            task.completion_status = 'COMPLETED';
            task.completed_at = nowIso;
          }

          appendAudit({
            user_name: user.name,
            user_role: user.role,
            action: 'INBOUND_UPDATE',
            entity: 'CallLog',
            entity_id: call.id,
            meta: { newDisposition: payload.newDisposition },
          });

          broadcastStateChanged(action, user.id, [call.mentor_id]);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version, persistedToCloud: Boolean(pgPool) });
          return;
        }

        case 'USER_ADD': {
          const emailLower = String(payload.email || '').trim().toLowerCase();
          const usernameLower = String(payload.username || emailLower).trim().toLowerCase();
          if (!emailLower || !String(payload.name || '').trim()) {
            res.status(400).json({ error: 'Name and valid institutional email are required.' });
            return;
          }
          if (serverState.users.some((u) => u.email && u.email.toLowerCase() === emailLower)) {
            res.status(409).json({ error: `A staff account with email "${emailLower}" already exists.` });
            return;
          }
          if (usernameLower && serverState.users.some((u) => u.username && u.username.toLowerCase() === usernameLower)) {
            res.status(409).json({ error: `A staff account with username "${usernameLower}" already exists.` });
            return;
          }
          const newUser = {
            id: payload.id || `user-${Date.now()}`,
            ...payload,
            email: emailLower,
            username: usernameLower,
            status: payload.status || 'ACTIVE',
            failed_logins: 0,
            created_at: payload.created_at || nowIso,
          };
          serverState.users.push(newUser);
          const codeSynced = syncStateUsersToDefaultUsersFile(serverState);
          appendAudit({
            user_name: user.name,
            user_role: user.role,
            action: 'ASSIGNMENT',
            entity: 'User',
            entity_id: newUser.id,
            meta: { name: newUser.name, role: newUser.role, username: newUser.username },
          });
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version, user: sanitizeUserForClient(newUser), persistedToCloud: Boolean(pgPool), syncedToCode: codeSynced });
          return;
        }

        case 'USER_UPDATE': {
          const idx = serverState.users.findIndex((u) => u.id === payload.id);
          if (idx === -1) {
            res.status(404).json({ error: 'User not found' });
            return;
          }
          const partial = { ...(payload.partial || {}) };
          if (partial.email) {
            const nextEmail = String(partial.email).trim().toLowerCase();
            if (serverState.users.some((u) => u.id !== payload.id && u.email && u.email.toLowerCase() === nextEmail)) {
              res.status(409).json({ error: `Another account already uses email "${nextEmail}".` });
              return;
            }
            partial.email = nextEmail;
          }
          if (partial.username !== undefined) {
            const nextUsername = String(partial.username || partial.email || serverState.users[idx].email || '').trim().toLowerCase();
            if (nextUsername && serverState.users.some((u) => u.id !== payload.id && u.username && u.username.toLowerCase() === nextUsername)) {
              res.status(409).json({ error: `Another account already uses username "${nextUsername}".` });
              return;
            }
            partial.username = nextUsername;
          }
          if (partial.password_hash) {
            partial.failed_logins = 0;
            partial.locked_until = undefined;
            partial.password = undefined;
          }
          serverState.users[idx] = { ...serverState.users[idx], ...partial };
          const codeSynced = syncStateUsersToDefaultUsersFile(serverState);
          wsClients.forEach((client) => {
            if (client.userId === payload.id) {
              client.role = serverState.users[idx].role;
              if (serverState.users[idx].status === 'INACTIVE') {
                try { client.ws.close(4001, 'Account deactivated'); } catch {}
              }
            }
          });
          appendAudit({
            user_name: user.name,
            user_role: user.role,
            action: 'SETTINGS_CHANGE',
            entity: 'User',
            entity_id: payload.id,
            meta: {
              name: serverState.users[idx].name,
              role: serverState.users[idx].role,
              status: serverState.users[idx].status,
              passwordChanged: Boolean(partial.password_hash),
            },
          });
          broadcastStateChanged(action, user.id, [payload.id]);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version, user: sanitizeUserForClient(serverState.users[idx]), persistedToCloud: Boolean(pgPool), syncedToCode: codeSynced });
          return;
        }

        case 'USER_DELETE': {
          const targetId = payload.id;
          if (!targetId) {
            res.status(400).json({ error: 'User ID is required.' });
            return;
          }
          if (targetId === user.id) {
            res.status(400).json({ error: 'You cannot delete your own active administrator account.' });
            return;
          }
          const targetIdx = serverState.users.findIndex((u) => u.id === targetId);
          if (targetIdx === -1) {
            res.status(404).json({ error: 'User not found' });
            return;
          }
          const removed = serverState.users[targetIdx];
          serverState.users.splice(targetIdx, 1);
          const codeSynced = syncStateUsersToDefaultUsersFile(serverState);
          wsClients.forEach((client) => {
            if (client.userId === targetId) {
              try { client.ws.close(4001, 'Account deleted'); } catch {}
            }
          });
          appendAudit({
            user_name: user.name,
            user_role: user.role,
            action: 'SETTINGS_CHANGE',
            entity: 'User',
            entity_id: targetId,
            meta: { deletedName: removed.name, deletedEmail: removed.email },
          });
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version, persistedToCloud: Boolean(pgPool), syncedToCode: codeSynced });
          return;
        }

        case 'CAMPAIGN_CREATE': {
          const newCamp = {
            id: payload.id || `camp-${Date.now()}`,
            title: String(payload.title || '').trim(),
            purpose: String(payload.purpose || '').trim(),
            session_id: payload.session_id || serverState.activeSessionId,
            assignment_date: payload.assignment_date || todayIST,
            due_date: payload.due_date,
            outcome_options:
              Array.isArray(payload.outcome_options) && payload.outcome_options.length > 0
                ? payload.outcome_options
                : ['Connected', 'Callback Requested', 'Wrong Number'],
            target_mentor_ids: payload.target_mentor_ids || [],
            status: 'ACTIVE',
            created_at: nowIso,
          };
          serverState.campaigns.unshift(newCamp);
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version, campaign: newCamp });
          return;
        }

        case 'CAMPAIGN_UPDATE': {
          const idx = serverState.campaigns.findIndex((c) => c.id === payload.id);
          if (idx === -1) {
            res.status(404).json({ error: 'Campaign not found' });
            return;
          }
          serverState.campaigns[idx] = { ...serverState.campaigns[idx], ...(payload.partial || {}) };
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        case 'CAMPAIGN_DELETE': {
          const idx = serverState.campaigns.findIndex((c) => c.id === payload.id);
          if (idx === -1) {
            res.status(404).json({ error: 'Campaign not found' });
            return;
          }
          serverState.campaigns[idx].status = 'DELETED';
          appendAudit({
            user_name: user.name,
            user_role: user.role,
            action: 'SETTINGS_CHANGE',
            entity: 'Campaign',
            entity_id: payload.id,
          });
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        case 'BULK_ASSIGN': {
          const campaign = serverState.campaigns.find((c) => c.id === payload.campaignId);
          if (!campaign) {
            res.status(404).json({ error: 'Campaign not found' });
            return;
          }
          const admissionNos: string[] = Array.isArray(payload.admissionNos) ? payload.admissionNos : [];
          const mentorIds: string[] = Array.isArray(payload.targetMentorIds) ? payload.targetMentorIds : [];
          if (mentorIds.length === 0) {
            res.status(400).json({ error: 'Please select at least one mentor.' });
            return;
          }
          const assignDate = payload.assignedDate || todayIST;
          const baseCount = Math.floor(admissionNos.length / mentorIds.length);
          const remainder = admissionNos.length % mentorIds.length;
          let currentIndex = 0;

          mentorIds.forEach((mentorId, idx) => {
            const take = baseCount + (idx < remainder ? 1 : 0);
            const slice = admissionNos.slice(currentIndex, currentIndex + take);
            currentIndex += take;
            slice.forEach((admNo) => {
              serverState.campaignAssignments.push({
                id: `asg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                campaign_id: campaign.id,
                campaign_title: campaign.title,
                campaign_purpose: campaign.purpose,
                student_id: admNo,
                mentor_id: mentorId,
                assigned_date: assignDate,
                due_date: payload.dueDate,
                completion_status: 'ASSIGNED',
                assigned_by: user.name,
              });
            });
          });

          appendAudit({
            user_name: user.name,
            user_role: user.role,
            action: 'ASSIGNMENT',
            entity: 'Campaign',
            entity_id: campaign.id,
            meta: { totalAssigned: admissionNos.length, mentorIds },
          });

          broadcastStateChanged(action, user.id, mentorIds);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version, assignedCount: admissionNos.length });
          return;
        }

        case 'LEADS_ASSIGN': {
          const leadIds: string[] = Array.isArray(payload.leadIds) ? payload.leadIds : [];
          serverState.externalLeads.forEach((l) => {
            if (leadIds.includes(l.id)) l.assigned_to = payload.mentorId;
          });
          broadcastStateChanged(action, user.id, payload.mentorId ? [payload.mentorId] : undefined);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        case 'LEADS_ADD_BATCH': {
          const incoming: any[] = Array.isArray(payload.leads) ? payload.leads : [];
          serverState.externalLeads = [...incoming, ...serverState.externalLeads];
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        case 'ADMISSIONS_REGISTER': {
          const incoming: any[] = Array.isArray(payload.students) ? payload.students : [];
          incoming.forEach((st) => {
            const idx = serverState.students.findIndex((s) => s.admission_no === st.admission_no);
            if (idx >= 0) serverState.students[idx] = { ...serverState.students[idx], ...st };
            else serverState.students.push(st);
          });
          serverState.students = processInitialStudents(serverState.students);
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        case 'EXAMS_ADD': {
          const results: any[] = Array.isArray(payload.results) ? payload.results : [];
          serverState.exams = [...results, ...serverState.exams];
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        case 'ATTENDANCE_ADD': {
          const records: any[] = Array.isArray(payload.records) ? payload.records : [];
          serverState.attendance = [...records, ...serverState.attendance];
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        case 'BATCH_RECORD': {
          if (payload.batch) serverState.uploadBatches.unshift(payload.batch);
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        case 'BATCH_ROLLBACK': {
          const batch = serverState.uploadBatches.find((b) => b.id === payload.batchId);
          if (!batch) {
            res.status(404).json({ error: 'Upload batch not found' });
            return;
          }
          serverState.students.forEach((s) => {
            if (s.upload_batch_id === payload.batchId) {
              const hasHistory =
                serverState.callLogs.some((c) => c.student_id === s.admission_no) ||
                serverState.campaignAssignments.some((a) => a.student_id === s.admission_no);
              if (!hasHistory) s.deleted_at = nowIso;
            }
          });
          batch.status = 'ROLLED_BACK';
          appendAudit({
            user_name: user.name,
            user_role: user.role,
            action: 'ROLLBACK',
            entity: 'UploadBatch',
            entity_id: payload.batchId,
          });
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        case 'SETTINGS_UPDATE': {
          serverState.settings = { ...serverState.settings, ...(payload.partial || {}) };
          appendAudit({
            user_name: user.name,
            user_role: user.role,
            action: 'SETTINGS_CHANGE',
            entity: 'Settings',
            entity_id: 'global',
            meta: payload.partial,
          });
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        case 'SESSION_SET': {
          if (serverState.sessions.some((s) => s.id === payload.id)) {
            serverState.activeSessionId = payload.id;
          }
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        case 'SESSION_ADD': {
          if (payload.session) serverState.sessions.push(payload.session);
          broadcastStateChanged(action, user.id);
          await flushPostgresPersistence();
          res.json({ ok: true, version: serverState.version });
          return;
        }

        default:
          res.status(400).json({ error: `Unknown action: ${action}` });
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Server action error' });
    }
  });

  // ---------------------------------------------------------------------------
  // Vite Dev Middleware or Static Production Build Serving
  // ---------------------------------------------------------------------------
  const distDir = path.join(process.cwd(), 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const isTsxRuntime = process.argv.some((arg) => arg.includes('tsx')) || process.execArgv.some((arg) => arg.includes('tsx'));
  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || !isTsxRuntime;

  if (isProd && !fs.existsSync(distIndex)) {
    console.log('[Narayana CRM Server] dist/index.html not found in production. Building application...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
    } catch (e) {
      console.warn('Auto-build failed:', e);
    }
  }

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(distIndex);
    });
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const urlStr = request.url || '';
    if (!urlStr.startsWith('/ws')) {
      return;
    }
    try {
      const url = new URL(urlStr, `http://${request.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');
      const decoded = verifyToken(token);
      if (!decoded) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const user = serverState.users.find((u) => u.id === decoded.userId && u.status !== 'INACTIVE');
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        const entry = { ws, userId: user.id, role: user.role };
        wsClients.add(entry);
        ws.send(JSON.stringify({ type: 'CONNECTED', version: serverState.version }));
        ws.on('close', () => {
          wsClients.delete(entry);
        });
        ws.on('error', () => {
          wsClients.delete(entry);
        });
      });
    } catch {
      socket.destroy();
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Narayana CRM Server] Running in ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
