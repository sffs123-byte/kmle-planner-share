#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const { isDeepStrictEqual } = require('node:util');
const {
  FORMAT: PERSONAL_OVERLAY_FORMAT,
  applyPersonalOverlay,
  buildPersonalOverlay,
  overlaySummary,
} = require('./cpx-personal-overlay');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || process.env.CPX_LOCAL_PORT || 8787);
const HOST = process.env.HOST || process.env.CPX_LOCAL_HOST || '127.0.0.1';
const DB_PATH = process.env.CPX_DB_PATH || path.join(ROOT, '.local', 'cpx-local.sqlite');
const DEFAULT_USER_ID = 'gangryeol-cpx-scripts';
const SHARED_PASSWORD = process.env.CPX_BOARD_PASSWORD || process.env.CPX_LOCAL_PASSWORD || '';
const INITIAL_STUDENT_PASSWORD = process.env.CPX_INITIAL_PASSWORD || 'cnu2026';
const GOOGLE_CLIENT_ID = String(process.env.CPX_GOOGLE_CLIENT_ID || '109649532353-j74oj72rqqah1to1m2rtoopjkk9p1r8o.apps.googleusercontent.com').trim();
const GOOGLE_AUTH_ENABLED = process.env.CPX_GOOGLE_AUTH_ENABLED !== '0' && Boolean(GOOGLE_CLIENT_ID);
const A4_GOOGLE_ONLY = process.env.CPX_A4_GOOGLE_ONLY !== '0';
const A4_PERSONAL_OVERLAYS_ENABLED = process.env.CPX_A4_PERSONAL_OVERLAYS_ENABLED !== '0';
const GOOGLE_REGISTRATION_MODES = new Set(['closed', 'open_provisional', 'roster_locked']);
const GOOGLE_REGISTRATION_MODE = GOOGLE_REGISTRATION_MODES.has(process.env.CPX_GOOGLE_REGISTRATION_MODE)
  ? process.env.CPX_GOOGLE_REGISTRATION_MODE
  : 'closed';
const GOOGLE_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const GOOGLE_ONBOARDING_TTL_MS = 10 * 60 * 1000;
const GOOGLE_RATE_WINDOW_MS = 10 * 60 * 1000;
const GOOGLE_RATE_MAX = 30;
const MAX_BODY_BYTES = nonNegativeIntEnv('CPX_MAX_BODY_BYTES', 64 * 1024 * 1024);
const CLOUD_ROOT = process.env.CPX_CLOUD_ROOT || path.join(ROOT, '.local', 'cpx-cloud');
const CLOUD_TRASH_DIRNAME = '.trash';
const CLOUD_CAPACITY_BYTES = nonNegativeIntEnv('CPX_CLOUD_CAPACITY_BYTES', 300 * 1024 * 1024 * 1024);
const CLOUD_MAX_FILE_BYTES = nonNegativeIntEnv('CPX_CLOUD_MAX_FILE_BYTES', 200 * 1024 * 1024);
const CLOUD_TRASH_DAYS = nonNegativeIntEnv('CPX_CLOUD_TRASH_DAYS', 14);
const CLOUD_SEED_FOLDERS = (process.env.CPX_CLOUD_SEED_FOLDERS || '')
  .split(',')
  .map(name => name.trim())
  .filter(Boolean);
const CLOUD_TF_USER_IDS = stringSet(process.env.CPX_CLOUD_TF_USER_IDS, process.env.CPX_CLOUD_TF_USER_ID);
const CLOUD_TF_STUDENT_NOS = stringSet(process.env.CPX_CLOUD_TF_STUDENT_NOS, process.env.CPX_CLOUD_TF_STUDENT_NO);
const CLOUD_TF_NICKNAMES = stringSet(process.env.CPX_CLOUD_TF_NICKNAMES, process.env.CPX_CLOUD_TF_NICKNAME);
const PRESENCE_TTL_MS = 30_000;
const STATE_HISTORY_RECENT_WINDOW_MS = nonNegativeIntEnv('CPX_STATE_HISTORY_RECENT_WINDOW_MS', 24 * 60 * 60 * 1000);
const STATE_HISTORY_DAILY_WINDOW_MS = nonNegativeIntEnv('CPX_STATE_HISTORY_DAILY_WINDOW_MS', 10 * 24 * 60 * 60 * 1000);
const STATE_HISTORY_MIN_INTERVAL_MS = nonNegativeIntEnv('CPX_STATE_HISTORY_MIN_INTERVAL_MS', 60 * 60 * 1000);
const STATE_HISTORY_PRUNE_ON_SAVE = process.env.CPX_STATE_HISTORY_PRUNE_ON_SAVE !== '0';
const STATE_RESPONSE_CACHE_MS = nonNegativeIntEnv('CPX_STATE_RESPONSE_CACHE_MS', 15000);
const STATE_RESPONSE_CACHE_MAX_ENTRIES = nonNegativeIntEnv('CPX_STATE_RESPONSE_CACHE_MAX_ENTRIES', 4);
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const A4_USER_IDS = new Set(String(process.env.CPX_A4_USER_IDS || process.env.CPX_A4_USER_ID || 'gangryeol-cpx-a4-editor,gangryeol-cpx-a4-editor-reset-20260515')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean));
const A4_REQUIRED_CLIENT_BUILD = process.env.CPX_A4_REQUIRED_CLIENT_BUILD || '';
const A4_STRICT_CLIENT_BUILD = process.env.CPX_A4_STRICT_CLIENT_BUILD === '1';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -65536;
  PRAGMA mmap_size = 268435456;
  CREATE TABLE IF NOT EXISTS board_state (
    user_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    state_version TEXT,
    updated_by TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS state_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    state_version TEXT,
    updated_by TEXT,
    updated_at TEXT NOT NULL,
    saved_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );
  CREATE TABLE IF NOT EXISTS presence (
    board_user_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    cc_id TEXT,
    field_key TEXT,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(board_user_id, user_id),
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );
  CREATE TABLE IF NOT EXISTS presence_tabs (
    board_user_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    client_session_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    cc_id TEXT,
    field_key TEXT,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(board_user_id, user_id, client_session_id),
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );
  CREATE TABLE IF NOT EXISTS cloud_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    target_path TEXT,
    actor_id TEXT,
    actor_name TEXT,
    size_bytes INTEGER,
    created_at TEXT NOT NULL,
    detail_json TEXT
  );
  CREATE TABLE IF NOT EXISTS cloud_likes (
    rel_path TEXT NOT NULL,
    user_id TEXT NOT NULL,
    actor_name TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY(rel_path, user_id),
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_cloud_likes_rel_path ON cloud_likes(rel_path);
  CREATE TABLE IF NOT EXISTS cloud_entries (
    rel_path TEXT PRIMARY KEY,
    owner_id TEXT,
    owner_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(owner_id) REFERENCES users(user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_cloud_entries_owner ON cloud_entries(owner_id);
  CREATE TABLE IF NOT EXISTS bug_reports (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'open',
    page_url TEXT,
    context_doc_id TEXT,
    context_title TEXT,
    reporter_user_id TEXT NOT NULL,
    reporter_name TEXT NOT NULL,
    reporter_student_masked TEXT,
    user_agent TEXT,
    client_build TEXT,
    admin_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(reporter_user_id) REFERENCES users(user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at);
  CREATE INDEX IF NOT EXISTS idx_bug_reports_reporter ON bug_reports(reporter_user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status, created_at);
  CREATE TABLE IF NOT EXISTS a4_google_identities (
    google_sub TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 1,
    google_display_name TEXT,
    linked_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );
  CREATE TABLE IF NOT EXISTS a4_google_registrations (
    registration_id TEXT PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL UNIQUE,
    student_no TEXT NOT NULL UNIQUE,
    submitted_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    status TEXT NOT NULL,
    registered_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );
  CREATE TABLE IF NOT EXISTS a4_auth_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    google_sub TEXT,
    user_id TEXT,
    student_no TEXT,
    created_at TEXT NOT NULL,
    detail_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_a4_auth_audit_created_at ON a4_auth_audit(created_at);
  CREATE TABLE IF NOT EXISTS a4_personal_overlays (
    board_user_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    overlay_json TEXT NOT NULL,
    base_state_updated_at TEXT,
    state_version TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    client_session_id TEXT,
    PRIMARY KEY(board_user_id, user_id),
    FOREIGN KEY(user_id) REFERENCES users(user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_a4_personal_overlays_user ON a4_personal_overlays(user_id, updated_at);
`);

const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(row => row.name));
const ensureUserColumn = (name, ddl) => {
  if (!userColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${ddl}`);
};
ensureUserColumn('student_no', 'TEXT');
ensureUserColumn('student_masked', 'TEXT');
ensureUserColumn('password_hash', 'TEXT');
ensureUserColumn('password_salt', 'TEXT');
ensureUserColumn('password_changed', 'INTEGER NOT NULL DEFAULT 0');
ensureUserColumn('recovery_school_hash', 'TEXT');
ensureUserColumn('recovery_school_salt', 'TEXT');
ensureUserColumn('recovery_school_set_at', 'TEXT');
ensureUserColumn('official_name', 'TEXT');
ensureUserColumn('auth_provider', "TEXT NOT NULL DEFAULT 'password'");
ensureUserColumn('account_status', "TEXT NOT NULL DEFAULT 'active'");
ensureUserColumn('a4_role', "TEXT NOT NULL DEFAULT 'student'");
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_no ON users(student_no) WHERE student_no IS NOT NULL');

const bugReportColumns = new Set(db.prepare('PRAGMA table_info(bug_reports)').all().map(row => row.name));
const ensureBugReportColumn = (name, ddl) => {
  if (!bugReportColumns.has(name)) db.exec(`ALTER TABLE bug_reports ADD COLUMN ${name} ${ddl}`);
};
ensureBugReportColumn('capture_image', 'TEXT');
ensureBugReportColumn('capture_rect_json', 'TEXT');
ensureBugReportColumn('capture_meta_json', 'TEXT');

const historyColumns = new Set(db.prepare('PRAGMA table_info(state_history)').all().map(row => row.name));
const ensureHistoryColumn = (name, ddl) => {
  if (!historyColumns.has(name)) db.exec(`ALTER TABLE state_history ADD COLUMN ${name} ${ddl}`);
};
// Existing rows are marked legacy so the new rolling-retention policy does not
// destructively prune the old 43GB archive until we explicitly do a backed-up
// cleanup pass. New writes below set history_kind to auto/manual/checkpoint.
ensureHistoryColumn('history_kind', "TEXT NOT NULL DEFAULT 'legacy'");
const personalOverlayColumns = new Set(db.prepare('PRAGMA table_info(a4_personal_overlays)').all().map(row => row.name));
const ensurePersonalOverlayColumn = (name, ddl) => {
  if (!personalOverlayColumns.has(name)) db.exec(`ALTER TABLE a4_personal_overlays ADD COLUMN ${name} ${ddl}`);
};
ensurePersonalOverlayColumn('client_session_id', 'TEXT');
db.exec('CREATE TABLE IF NOT EXISTS server_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
const getMetaStmt = db.prepare('SELECT value FROM server_meta WHERE key = ?');
const setMetaStmt = db.prepare('INSERT INTO server_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
const STATE_HISTORY_AUTO_START_ID = initStateHistoryAutoStartId();

const getStateStmt = db.prepare('SELECT user_id, state_json, state_version, updated_by, updated_at FROM board_state WHERE user_id = ?');
const upsertStateStmt = db.prepare(`
  INSERT INTO board_state (user_id, state_json, state_version, updated_by, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    state_json = excluded.state_json,
    state_version = excluded.state_version,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
`);
const insertHistoryStmt = db.prepare(`
  INSERT INTO state_history (user_id, state_json, state_version, updated_by, updated_at, history_kind)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const latestHistoryStmt = db.prepare('SELECT saved_at FROM state_history WHERE id >= ? AND user_id = ? ORDER BY id DESC LIMIT 1');
const listAutoHistoryStmt = db.prepare("SELECT id, saved_at, updated_at FROM state_history WHERE id >= ? AND user_id = ? AND history_kind = 'auto' ORDER BY id DESC");
const deleteHistoryStmt = db.prepare('DELETE FROM state_history WHERE id = ?');
const upsertUserStmt = db.prepare(`
  INSERT INTO users (user_id, nickname, created_at, last_seen_at, student_no, student_masked, password_hash, password_salt, password_changed)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET nickname = excluded.nickname, last_seen_at = excluded.last_seen_at
`);
const createOrUpdateStudentUserStmt = db.prepare(`
  INSERT INTO users (user_id, nickname, created_at, last_seen_at, student_no, student_masked, password_hash, password_salt, password_changed)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    nickname = excluded.nickname,
    last_seen_at = excluded.last_seen_at,
    student_no = COALESCE(users.student_no, excluded.student_no),
    student_masked = COALESCE(users.student_masked, excluded.student_masked),
    password_hash = COALESCE(users.password_hash, excluded.password_hash),
    password_salt = COALESCE(users.password_salt, excluded.password_salt),
    password_changed = users.password_changed
`);
const getUserStmt = db.prepare('SELECT user_id, nickname, student_no, student_masked, password_hash, password_salt, password_changed, recovery_school_hash, recovery_school_salt, recovery_school_set_at, official_name, auth_provider, account_status, a4_role FROM users WHERE user_id = ?');
const getUserByStudentNoStmt = db.prepare('SELECT user_id, nickname, student_no, student_masked, password_hash, password_salt, password_changed, recovery_school_hash, recovery_school_salt, recovery_school_set_at, official_name, auth_provider, account_status, a4_role FROM users WHERE student_no = ?');
const setUserPasswordStmt = db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, password_changed = ?, last_seen_at = ? WHERE user_id = ?');
const setUserRecoverySchoolStmt = db.prepare('UPDATE users SET recovery_school_hash = ?, recovery_school_salt = ?, recovery_school_set_at = ?, last_seen_at = ? WHERE user_id = ?');
const setUserNicknameStmt = db.prepare('UPDATE users SET nickname = ?, last_seen_at = ? WHERE user_id = ?');
const setGoogleUserStmt = db.prepare("UPDATE users SET nickname = ?, official_name = ?, auth_provider = 'google', account_status = ?, a4_role = ?, password_changed = 1, last_seen_at = ? WHERE user_id = ?");
const deleteUserSessionsStmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
const insertSessionStmt = db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)');
const getSessionStmt = db.prepare(`
  SELECT sessions.token_hash, users.user_id, users.nickname, users.student_no, users.student_masked, users.password_changed, users.recovery_school_hash,
    users.official_name, users.auth_provider, users.account_status, users.a4_role
  FROM sessions JOIN users ON users.user_id = sessions.user_id
  WHERE sessions.token_hash = ?
`);
const getGoogleIdentityStmt = db.prepare(`
  SELECT i.google_sub, i.user_id, i.email, i.email_verified, i.google_display_name, i.linked_at, i.last_login_at, i.revoked_at,
    u.nickname, u.student_no, u.student_masked, u.password_changed, u.recovery_school_hash, u.official_name, u.auth_provider, u.account_status, u.a4_role
  FROM a4_google_identities i JOIN users u ON u.user_id = i.user_id
  WHERE i.google_sub = ?
`);
const getGoogleIdentityByUserStmt = db.prepare('SELECT google_sub, user_id, email, revoked_at FROM a4_google_identities WHERE user_id = ?');
const insertGoogleIdentityStmt = db.prepare(`
  INSERT INTO a4_google_identities (google_sub, user_id, email, email_verified, google_display_name, linked_at, last_login_at, revoked_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
`);
const touchGoogleIdentityStmt = db.prepare('UPDATE a4_google_identities SET email = ?, google_display_name = ?, last_login_at = ? WHERE google_sub = ?');
const insertGoogleRegistrationStmt = db.prepare(`
  INSERT INTO a4_google_registrations (registration_id, google_sub, user_id, student_no, submitted_name, normalized_name, status, registered_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertAuthAuditStmt = db.prepare('INSERT INTO a4_auth_audit (event_type, google_sub, user_id, student_no, created_at, detail_json) VALUES (?, ?, ?, ?, ?, ?)');
const getPersonalOverlayStmt = db.prepare(`
  SELECT board_user_id, user_id, overlay_json, base_state_updated_at, state_version, created_at, updated_at, updated_by, client_session_id
  FROM a4_personal_overlays
  WHERE board_user_id = ? AND user_id = ?
`);
const upsertPersonalOverlayStmt = db.prepare(`
  INSERT INTO a4_personal_overlays (board_user_id, user_id, overlay_json, base_state_updated_at, state_version, created_at, updated_at, updated_by, client_session_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(board_user_id, user_id) DO UPDATE SET
    overlay_json = excluded.overlay_json,
    base_state_updated_at = excluded.base_state_updated_at,
    state_version = excluded.state_version,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    client_session_id = excluded.client_session_id
`);
const touchSessionStmt = db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?');
const touchUserStmt = db.prepare('UPDATE users SET last_seen_at = ? WHERE user_id = ?');
const upsertPresenceStmt = db.prepare(`
  INSERT INTO presence_tabs (board_user_id, user_id, client_session_id, nickname, cc_id, field_key, status, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(board_user_id, user_id, client_session_id) DO UPDATE SET
    nickname = excluded.nickname,
    cc_id = excluded.cc_id,
    field_key = excluded.field_key,
    status = excluded.status,
    updated_at = excluded.updated_at
`);
const listPresenceStmt = db.prepare(`
  SELECT board_user_id, user_id, client_session_id, nickname, cc_id, field_key, status, updated_at
  FROM presence_tabs
  WHERE board_user_id = ? AND status != 'idle' AND updated_at >= ?
  ORDER BY updated_at DESC
`);
const prunePresenceStmt = db.prepare('DELETE FROM presence_tabs WHERE updated_at < ? OR status = \'idle\'');
const insertCloudEventStmt = db.prepare(`
  INSERT INTO cloud_events (event_type, rel_path, target_path, actor_id, actor_name, size_bytes, created_at, detail_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const getCloudLikeStmt = db.prepare('SELECT 1 AS liked FROM cloud_likes WHERE rel_path = ? AND user_id = ?');
const countCloudLikesStmt = db.prepare('SELECT COUNT(*) AS count FROM cloud_likes WHERE rel_path = ?');
const insertCloudLikeStmt = db.prepare(`
  INSERT OR IGNORE INTO cloud_likes (rel_path, user_id, actor_name, created_at)
  VALUES (?, ?, ?, ?)
`);
const deleteCloudLikeStmt = db.prepare('DELETE FROM cloud_likes WHERE rel_path = ? AND user_id = ?');
const deleteCloudLikesForPathStmt = db.prepare('DELETE FROM cloud_likes WHERE rel_path = ? OR rel_path LIKE ?');
const listCloudLikesForPathStmt = db.prepare('SELECT rel_path, user_id FROM cloud_likes WHERE rel_path = ? OR rel_path LIKE ?');
const updateCloudLikePathStmt = db.prepare('UPDATE cloud_likes SET rel_path = ? WHERE rel_path = ? AND user_id = ?');
const getCloudEntryStmt = db.prepare('SELECT rel_path, owner_id, owner_name, created_at, updated_at FROM cloud_entries WHERE rel_path = ?');
const upsertCloudEntryStmt = db.prepare(`
  INSERT INTO cloud_entries (rel_path, owner_id, owner_name, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(rel_path) DO UPDATE SET
    owner_id = COALESCE(cloud_entries.owner_id, excluded.owner_id),
    owner_name = COALESCE(cloud_entries.owner_name, excluded.owner_name),
    updated_at = excluded.updated_at
`);
const deleteCloudEntriesForPathStmt = db.prepare('DELETE FROM cloud_entries WHERE rel_path = ? OR rel_path LIKE ?');
const listCloudEntriesForPathStmt = db.prepare('SELECT rel_path FROM cloud_entries WHERE rel_path = ? OR rel_path LIKE ?');
const updateCloudEntryPathStmt = db.prepare('UPDATE cloud_entries SET rel_path = ?, updated_at = ? WHERE rel_path = ?');
const insertBugReportStmt = db.prepare(`
  INSERT INTO bug_reports (
    id, title, body, severity, status, page_url, context_doc_id, context_title,
    reporter_user_id, reporter_name, reporter_student_masked, user_agent, client_build,
    capture_image, capture_rect_json, capture_meta_json, admin_note, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const listBugReportsAllStmt = db.prepare(`
  SELECT * FROM bug_reports
  ORDER BY created_at DESC
  LIMIT ?
`);
const listBugReportsForUserStmt = db.prepare(`
  SELECT * FROM bug_reports
  WHERE reporter_user_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`);
const getBugReportStmt = db.prepare('SELECT * FROM bug_reports WHERE id = ?');
const updateBugReportStmt = db.prepare('UPDATE bug_reports SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?');

const clientsByUser = new Map();
const stateResponseCache = new Map();
const googleChallenges = new Map();
const googleOnboardingTokens = new Map();
const googleRateBuckets = new Map();
let googleJwksCache = { expiresAt: 0, keys: new Map() };

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  return jsonRaw(res, status, body);
}

function jsonRaw(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function text(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const declaredSize = Number(req.headers['content-length'] || 0);
    if (declaredSize > MAX_BODY_BYTES) {
      req.resume();
      reject(Object.assign(new Error(`Request body too large (${declaredSize} > ${MAX_BODY_BYTES})`), { statusCode: 413 }));
      return;
    }
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(Object.assign(new Error(`Request body too large (${size} > ${MAX_BODY_BYTES})`), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', error => { if (!tooLarge) reject(error); });
  });
}

function readBinaryBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function rootVolumeReady() {
  const normalized = path.resolve(CLOUD_ROOT);
  if (!normalized.startsWith('/Volumes/')) return true;
  const [, , volumeName] = normalized.split(path.sep);
  if (!volumeName) return false;
  const volumePath = path.join('/Volumes', volumeName);
  try {
    return fs.statSync(volumePath).isDirectory();
  } catch {
    return false;
  }
}

function cloudRootReady({ create = false } = {}) {
  if (!rootVolumeReady()) return false;
  try {
    if (!fs.existsSync(CLOUD_ROOT)) {
      if (!create) return false;
      fs.mkdirSync(CLOUD_ROOT, { recursive: true });
    }
    return fs.statSync(CLOUD_ROOT).isDirectory();
  } catch {
    return false;
  }
}

function normalizeCloudRel(input = '/') {
  const raw = String(input || '/').replace(/\0/g, '').trim();
  const parts = raw.split(/[\\/]+/).filter(Boolean);
  if (parts.some(part => part === '.' || part === '..')) {
    throw Object.assign(new Error('invalid path'), { statusCode: 400 });
  }
  if (parts[0] === CLOUD_TRASH_DIRNAME) {
    throw Object.assign(new Error('trash path is not directly accessible'), { statusCode: 403 });
  }
  return parts.join('/');
}

function cloudAbs(rel = '/') {
  const normalizedRel = normalizeCloudRel(rel);
  const target = path.resolve(CLOUD_ROOT, normalizedRel);
  const root = path.resolve(CLOUD_ROOT);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw Object.assign(new Error('invalid path'), { statusCode: 400 });
  }
  return { rel: normalizedRel, abs: target };
}

function cloudDisplayPath(rel = '') {
  return '/' + normalizeCloudRel(rel);
}

function cloudInternalDisplayPath(rel = '') {
  const parts = String(rel || '').replace(/\0/g, '').split(/[\\/]+/).filter(Boolean);
  return '/' + parts.join('/');
}

function cloudLikeKey(rel = '') {
  return cloudDisplayPath(rel).normalize('NFC');
}

function cloudMetaKey(rel = '') {
  return cloudDisplayPath(rel).normalize('NFC');
}

function isCloudTf(auth = null) {
  if (!auth) return false;
  const studentNo = normalizeStudentNo(auth.studentNo || '');
  const nickname = normalizeNickname(auth.nickname || '').normalize('NFC');
  return Boolean(
    CLOUD_TF_USER_IDS.has(String(auth.userId || '').trim()) ||
    (studentNo && CLOUD_TF_STUDENT_NOS.has(studentNo)) ||
    (nickname && CLOUD_TF_NICKNAMES.has(nickname))
  );
}

function isBugReportAdmin(auth = null) {
  const userId = String(auth?.userId || '').trim();
  const nickname = normalizeNickname(auth?.nickname || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const compactNickname = nickname.replace(/\s+/g, '');
  return Boolean(
    isCloudTf(auth) ||
    ['stu_p5zjhx', 'stu_st0cod', 'user_596e7e3b41dbab91702e'].includes(userId) ||
    ['배강렬', '관리자배강렬', 'TF배강렬', 'TF관리자배강렬'].includes(compactNickname)
  );
}

function normalizeBugSeverity(value) {
  const v = String(value || '').trim().toLowerCase();
  return ['normal', 'high', 'urgent'].includes(v) ? v : 'normal';
}

function normalizeBugStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  return ['open', 'reviewing', 'resolved', 'closed'].includes(v) ? v : 'open';
}

function parseBugJson(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function publicBugReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    severity: row.severity,
    status: row.status,
    pageUrl: row.page_url || '',
    contextDocId: row.context_doc_id || '',
    contextTitle: row.context_title || '',
    reporterUserId: row.reporter_user_id,
    reporterName: row.reporter_name,
    reporterStudentMasked: row.reporter_student_masked || '',
    clientBuild: row.client_build || '',
    captureImage: row.capture_image || '',
    captureRect: parseBugJson(row.capture_rect_json),
    captureMeta: parseBugJson(row.capture_meta_json),
    adminNote: row.admin_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CLOUD_TF_ONLY_ROOT = (process.env.CPX_CLOUD_TF_ONLY_ROOT || 'TF 전용').normalize('NFC');

function isTfOnlyCloudPath(rel = '') {
  const first = normalizeCloudRel(rel).split('/').filter(Boolean)[0] || '';
  return first.normalize('NFC') === CLOUD_TF_ONLY_ROOT;
}

function canReadCloudPath(rel = '', auth = null) {
  return !isTfOnlyCloudPath(rel) || isCloudTf(auth);
}

function requireCloudRead(rel = '', auth = null) {
  if (!canReadCloudPath(rel, auth)) {
    throw Object.assign(new Error('TF 전용 폴더는 TF만 열 수 있습니다.'), { statusCode: 403 });
  }
}

function cloudOwnerMeta(rel = '') {
  return getCloudEntryStmt.get(cloudMetaKey(rel)) || null;
}

function markCloudOwner(rel, auth) {
  const key = cloudMetaKey(rel);
  const at = nowIso();
  upsertCloudEntryStmt.run(key, auth?.userId || null, auth?.nickname || null, at, at);
}

function ownedByAuth(rel, auth) {
  const owner = cloudOwnerMeta(rel);
  return Boolean(owner?.owner_id && auth?.userId && String(owner.owner_id) === String(auth.userId));
}

function canDeleteListedCloudPath(rel, auth) {
  return isCloudTf(auth) || ownedByAuth(rel, auth);
}

function canDeleteCloudTree(rel, auth) {
  if (isCloudTf(auth)) return true;
  if (!ownedByAuth(rel, auth)) return false;
  const target = cloudAbs(rel);
  let st;
  try {
    st = fs.lstatSync(target.abs);
  } catch {
    return false;
  }
  if (st.isSymbolicLink()) return false;
  if (st.isFile()) return true;
  if (!st.isDirectory()) return false;
  let entries = [];
  try {
    entries = fs.readdirSync(target.abs, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const ent of entries) {
    if (ent.name === CLOUD_TRASH_DIRNAME || ent.name === '.DS_Store') continue;
    const childRel = [normalizeCloudRel(rel), ent.name].filter(Boolean).join('/');
    if (!canDeleteCloudTree(childRel, auth)) return false;
  }
  return true;
}

function cloudEntryControls(rel, auth) {
  const owner = cloudOwnerMeta(rel);
  return {
    ownedByMe: Boolean(owner?.owner_id && auth?.userId && String(owner.owner_id) === String(auth.userId)),
    ownerName: owner?.owner_name || null,
    canDelete: canDeleteListedCloudPath(rel, auth),
    isTf: isCloudTf(auth),
  };
}

function ensureCloudBase() {
  if (!cloudRootReady({ create: true })) {
    throw Object.assign(new Error('CPX Cloud SSD is not mounted'), { statusCode: 503 });
  }
  fs.mkdirSync(path.join(CLOUD_ROOT, CLOUD_TRASH_DIRNAME), { recursive: true });
  for (const folder of CLOUD_SEED_FOLDERS) {
    fs.mkdirSync(path.join(CLOUD_ROOT, folder), { recursive: true });
  }
}

function walkSize(abs) {
  let total = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    const child = path.join(abs, ent.name);
    try {
      const st = fs.lstatSync(child);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) total += walkSize(child);
      else if (st.isFile()) total += st.size;
    } catch {}
  }
  return total;
}

function activeCloudSize(abs) {
  let total = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    if (ent.name === CLOUD_TRASH_DIRNAME) continue;
    const child = path.join(abs, ent.name);
    try {
      const st = fs.lstatSync(child);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) total += activeCloudSize(child);
      else if (st.isFile()) total += st.size;
    } catch {}
  }
  return total;
}

function cloudStatusPayload() {
  const mounted = cloudRootReady({ create: !path.resolve(CLOUD_ROOT).startsWith('/Volumes/') });
  let usedBytes = 0;
  let activeBytes = 0;
  let freeBytes = null;
  if (mounted) {
    usedBytes = walkSize(CLOUD_ROOT);
    activeBytes = activeCloudSize(CLOUD_ROOT);
    try {
      const fsStat = fs.statfsSync(CLOUD_ROOT);
      freeBytes = Number(fsStat.bavail || 0) * Number(fsStat.bsize || 0);
    } catch {}
  }
  return {
    ok: mounted,
    mounted,
    root: CLOUD_ROOT,
    capacityBytes: CLOUD_CAPACITY_BYTES,
    usedBytes,
    activeBytes,
    trashBytes: Math.max(0, usedBytes - activeBytes),
    remainingBytes: Math.max(0, CLOUD_CAPACITY_BYTES - usedBytes),
    diskFreeBytes: freeBytes,
    maxFileBytes: CLOUD_MAX_FILE_BYTES,
    trashDays: CLOUD_TRASH_DAYS,
    seedFolders: CLOUD_SEED_FOLDERS,
  };
}

function pruneCloudTrash() {
  if (!CLOUD_TRASH_DAYS || CLOUD_TRASH_DAYS < 0) return { deleted: 0 };
  const trash = path.join(CLOUD_ROOT, CLOUD_TRASH_DIRNAME);
  const cutoff = Date.now() - CLOUD_TRASH_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(trash, { withFileTypes: true });
  } catch {
    return { deleted: 0 };
  }
  for (const ent of entries) {
    const child = path.join(trash, ent.name);
    try {
      const st = fs.lstatSync(child);
      if (st.mtimeMs >= cutoff) continue;
      fs.rmSync(child, { recursive: true, force: true });
      deleted += 1;
    } catch {}
  }
  return { deleted };
}

function safeCloudName(name, fallback = '새 파일') {
  const cleaned = String(name || '')
    .normalize('NFC')
    .replace(/\0/g, '')
    .replace(/[\/\\:]/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}

function uniqueChildPath(dirAbs, desiredName) {
  const parsed = path.parse(safeCloudName(desiredName));
  const base = parsed.name || '파일';
  const ext = parsed.ext || '';
  let candidate = path.join(dirAbs, base + ext);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dirAbs, `${base} (${i})${ext}`);
    i += 1;
  }
  return candidate;
}

function remapCloudPrefixKey(key, fromKey, toKey) {
  if (key === fromKey) return toKey;
  if (key.startsWith(fromKey + '/')) return toKey + key.slice(fromKey.length);
  return key;
}

function rewriteCloudMetadataPrefix(fromRel, toRel) {
  const fromKey = cloudMetaKey(fromRel);
  const toKey = cloudMetaKey(toRel);
  if (!fromKey || !toKey || fromKey === toKey) return;
  const fromLike = `${fromKey}/%`;
  const toLike = `${toKey}/%`;
  const likeRows = listCloudLikesForPathStmt.all(fromKey, fromLike);
  const entryRows = listCloudEntriesForPathStmt.all(fromKey, fromLike);
  db.exec('BEGIN IMMEDIATE');
  try {
    deleteCloudLikesForPathStmt.run(toKey, toLike);
    deleteCloudEntriesForPathStmt.run(toKey, toLike);
    for (const row of likeRows) {
      updateCloudLikePathStmt.run(remapCloudPrefixKey(row.rel_path, fromKey, toKey), row.rel_path, row.user_id);
    }
    const at = nowIso();
    for (const row of entryRows) {
      updateCloudEntryPathStmt.run(remapCloudPrefixKey(row.rel_path, fromKey, toKey), at, row.rel_path);
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

function cloudLikeMeta(displayPath, auth = null) {
  const key = cloudLikeKey(displayPath);
  const likeCount = Number(countCloudLikesStmt.get(key)?.count || 0);
  const likedByMe = Boolean(auth?.userId && getCloudLikeStmt.get(key, auth.userId));
  return { likeCount, likedByMe, featured: likeCount >= 5 };
}

function listCloudDir(rel = '/', auth = null) {
  ensureCloudBase();
  pruneCloudTrash();
  const { abs, rel: normalizedRel } = cloudAbs(rel);
  requireCloudRead(normalizedRel, auth);
  const st = fs.statSync(abs);
  if (!st.isDirectory()) throw Object.assign(new Error('not a folder'), { statusCode: 400 });
  const entries = fs.readdirSync(abs, { withFileTypes: true })
    .filter(ent => {
      if (ent.name === CLOUD_TRASH_DIRNAME || ent.name.startsWith('.DS_Store')) return false;
      const childRel = [normalizedRel, ent.name].filter(Boolean).join('/');
      return canReadCloudPath(childRel, auth);
    })
    .map(ent => {
      const childRel = [normalizedRel, ent.name].filter(Boolean).join('/');
      const childAbs = path.join(abs, ent.name);
      const childSt = fs.statSync(childAbs);
      const entry = {
        name: ent.name,
        path: cloudDisplayPath(childRel),
        type: ent.isDirectory() ? 'folder' : 'file',
        size: ent.isFile() ? childSt.size : null,
        modifiedAt: childSt.mtime.toISOString(),
        ...cloudEntryControls(childRel, auth),
      };
      return ent.isFile() ? { ...entry, ...cloudLikeMeta(entry.path, auth) } : entry;
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'ko') : a.type === 'folder' ? -1 : 1));
  return { path: cloudDisplayPath(normalizedRel), entries, status: cloudStatusPayload() };
}

function parseMultipart(buffer, contentType) {
  const match = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw Object.assign(new Error('multipart boundary required'), { statusCode: 400 });
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const parts = [];
  let cursor = buffer.indexOf(boundary);
  while (cursor >= 0) {
    let start = cursor + boundary.length;
    if (buffer.slice(start, start + 2).toString() === '--') break;
    if (buffer.slice(start, start + 2).toString() === '\r\n') start += 2;
    const next = buffer.indexOf(boundary, start);
    if (next < 0) break;
    let segment = buffer.slice(start, next);
    if (segment.slice(-2).toString() === '\r\n') segment = segment.slice(0, -2);
    const headerEnd = segment.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd >= 0) {
      const headerText = segment.slice(0, headerEnd).toString('utf8');
      const data = segment.slice(headerEnd + 4);
      const disposition = headerText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || '';
      const name = disposition.match(/name="([^"]*)"/i)?.[1] || '';
      const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || '';
      const type = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream';
      parts.push({ name, filename, type, data });
    }
    cursor = next;
  }
  return parts;
}

function recordCloudEvent(type, relPath, targetPath, auth, sizeBytes = null, detail = {}) {
  insertCloudEventStmt.run(
    type,
    cloudDisplayPath(relPath),
    targetPath ? cloudInternalDisplayPath(targetPath) : null,
    auth?.userId || null,
    auth?.nickname || null,
    sizeBytes,
    nowIso(),
    JSON.stringify(detail || {})
  );
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(Buffer.concat(stderr).toString('utf8').trim() || `${command} exited with ${code}`), { statusCode: 500 }));
    });
  });
}

function safeZipName(name, fallback = 'CPX_Cloud.zip') {
  const base = safeCloudName(String(name || '').replace(/\.zip$/i, ''), fallback.replace(/\.zip$/i, ''));
  return `${base || fallback.replace(/\.zip$/i, '')}.zip`;
}

async function buildCloudZip(paths, auth, filenameBase = 'CPX_Cloud') {
  ensureCloudBase();
  const seen = new Set();
  const targets = [];
  for (const itemPath of paths) {
    const target = cloudAbs(itemPath || '');
    if (!target.rel) throw Object.assign(new Error('root folder cannot be downloaded as a zip'), { statusCode: 400 });
    requireCloudRead(target.rel, auth);
    const key = cloudMetaKey(target.rel);
    if (seen.has(key)) continue;
    if (!fs.existsSync(target.abs)) throw Object.assign(new Error('file not found'), { statusCode: 404 });
    const st = fs.lstatSync(target.abs);
    if (st.isSymbolicLink()) throw Object.assign(new Error('symbolic links are not supported'), { statusCode: 400 });
    if (!st.isFile() && !st.isDirectory()) throw Object.assign(new Error('unsupported file type'), { statusCode: 400 });
    seen.add(key);
    targets.push(target);
  }
  if (!targets.length) throw Object.assign(new Error('download target required'), { statusCode: 400 });
  const parentRels = new Set(targets.map(target => path.dirname(target.rel) === '.' ? '' : path.dirname(target.rel)));
  const parentRel = parentRels.size === 1 ? [...parentRels][0] : '';
  const cwdAbs = path.resolve(CLOUD_ROOT, parentRel);
  const items = targets.map(target => {
    const rel = path.relative(cwdAbs, target.abs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw Object.assign(new Error('invalid zip path'), { statusCode: 400 });
    }
    return rel;
  });
  const downloadRoot = path.join(CLOUD_ROOT, CLOUD_TRASH_DIRNAME, '.downloads');
  fs.mkdirSync(downloadRoot, { recursive: true });
  const zipAbs = path.join(downloadRoot, `download-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.zip`);
  await runProcess('/usr/bin/zip', ['-qry', zipAbs, '--', ...items], { cwd: cwdAbs });
  const stat = fs.statSync(zipAbs);
  recordCloudEvent('download_zip', targets[0].rel, null, auth, stat.size, { count: targets.length, filename: safeZipName(filenameBase) });
  return { zipAbs, filename: safeZipName(filenameBase), size: stat.size };
}

function streamDownload(res, fileAbs, filename, contentType, size, cleanup = null) {
  let cleaned = false;
  const clean = () => {
    if (cleaned || !cleanup) return;
    cleaned = true;
    try { cleanup(); } catch {}
  };
  res.writeHead(200, {
    'content-type': contentType || 'application/octet-stream',
    ...(Number.isFinite(size) ? { 'content-length': size } : {}),
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'access-control-allow-origin': '*',
    'cache-control': 'private, no-store',
  });
  const stream = fs.createReadStream(fileAbs);
  stream.on('error', clean);
  res.on('finish', clean);
  res.on('close', clean);
  return stream.pipe(res);
}

function safeUserId(url) {
  return url.searchParams.get('user_id') || url.searchParams.get('userId') || DEFAULT_USER_ID;
}

function nowIso() { return new Date().toISOString(); }

function profileRecordTime(profile) {
  return Date.parse(profile?.updatedAt || profile?.updated_at || profile?.createdAt || 0) || 0;
}

function mergeProfilesByUpdatedAt(existing = {}, incoming = {}) {
  const out = { ...(existing || {}) };
  Object.entries(incoming || {}).forEach(([id, profile]) => {
    if (!profile) return;
    const old = out[id];
    const oldAt = profileRecordTime(old);
    const newAt = profileRecordTime(profile);
    out[id] = !old || newAt >= oldAt ? { ...(old || {}), ...(profile || {}) } : { ...(profile || {}), ...old };
  });
  return out;
}

function preserveNewestProfiles(userId, state) {
  const row = getStateStmt.get(userId);
  if (!row?.state_json || !state || typeof state !== 'object') return;
  try {
    const current = JSON.parse(row.state_json);
    const currentProfiles = current?.settings?.profiles || {};
    const incomingProfiles = state?.settings?.profiles || {};
    state.settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
    state.settings.profiles = mergeProfilesByUpdatedAt(currentProfiles, incomingProfiles);
  } catch {}
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function tokenHash(token) { return hash(`cpx-session:${token}`); }

function nonNegativeIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function stringSet(...values) {
  const items = values
    .flatMap(value => String(value || '').split(','))
    .map(value => value.trim().normalize('NFC'))
    .filter(Boolean);
  return new Set(items);
}

function parseSqliteUtcMs(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : 0;
}

function initStateHistoryAutoStartId() {
  const existing = Number.parseInt(getMetaStmt.get('state_history_auto_start_id')?.value || '', 10);
  if (Number.isFinite(existing) && existing > 0) return existing;
  const seqRow = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'state_history'").get();
  const maxId = Number(seqRow?.seq || 0);
  const startId = maxId + 1;
  setMetaStmt.run('state_history_auto_start_id', String(startId));
  return startId;
}

function historyModeFromBody(body) {
  return String(body.history_kind ?? body.historyKind ?? body.history_mode ?? body.historyMode ?? '').trim().toLowerCase();
}

function historyKindFromBody(body) {
  const mode = historyModeFromBody(body);
  if (['manual', 'force', 'checkpoint'].includes(mode)) return mode === 'force' ? 'manual' : mode;
  return 'auto';
}

function shouldInsertStateHistory(userId, body, nowMs = Date.now()) {
  const mode = historyModeFromBody(body);
  if (['skip', 'none', 'off', 'disabled'].includes(mode)) return false;
  if (STATE_HISTORY_MIN_INTERVAL_MS === 0) return true;
  if (['manual', 'force', 'checkpoint'].includes(mode)) return true;

  const lastMs = parseSqliteUtcMs(latestHistoryStmt.get(STATE_HISTORY_AUTO_START_ID, userId)?.saved_at);
  return !lastMs || nowMs - lastMs >= STATE_HISTORY_MIN_INTERVAL_MS;
}

function kstBucket(ms, unit) {
  const d = new Date(ms + KST_OFFSET_MS);
  const iso = d.toISOString();
  return unit === 'hour' ? iso.slice(0, 13) : iso.slice(0, 10);
}

function pruneAutoStateHistory(userId, nowMs = Date.now()) {
  if (!STATE_HISTORY_PRUNE_ON_SAVE) return { enabled: false, deleted: 0, kept: 0 };
  const recentCutoff = nowMs - STATE_HISTORY_RECENT_WINDOW_MS;
  const dailyCutoff = nowMs - STATE_HISTORY_DAILY_WINDOW_MS;
  const seenHours = new Set();
  const seenDays = new Set();
  let kept = 0;
  let deleted = 0;

  for (const row of listAutoHistoryStmt.all(STATE_HISTORY_AUTO_START_ID, userId)) {
    const savedMs = parseSqliteUtcMs(row.saved_at) || Date.parse(row.updated_at || '') || 0;
    let keep = false;
    if (!savedMs) {
      keep = true;
    } else if (savedMs >= recentCutoff) {
      const key = kstBucket(savedMs, 'hour');
      keep = !seenHours.has(key);
      seenHours.add(key);
    } else if (savedMs >= dailyCutoff) {
      const key = kstBucket(savedMs, 'day');
      keep = !seenDays.has(key);
      seenDays.add(key);
    }

    if (keep) {
      kept += 1;
    } else {
      deleteHistoryStmt.run(row.id);
      deleted += 1;
    }
  }
  return { enabled: true, deleted, kept };
}


function splitDocLines(text) {
  return String(text ?? '').split('\n');
}

function findBaseLinePositions(baseLines, targetLines) {
  const positions = [];
  let cursor = 0;
  for (const line of baseLines) {
    let found = -1;
    for (let i = cursor; i < targetLines.length; i += 1) {
      if (targetLines[i] === line) {
        found = i;
        break;
      }
    }
    if (found < 0) return null;
    positions.push(found);
    cursor = found + 1;
  }
  return positions;
}

function collectInsertOnlyLineOps(baseText, editedText) {
  if (String(baseText ?? '') === String(editedText ?? '')) return [];
  if (String(baseText ?? '') === '') return [{ index: 0, lines: splitDocLines(editedText) }];
  const baseLines = splitDocLines(baseText);
  const editedLines = splitDocLines(editedText);
  const ops = [];
  let baseIndex = 0;
  let editedIndex = 0;
  while (baseIndex < baseLines.length) {
    if (editedIndex >= editedLines.length) return null;
    if (editedLines[editedIndex] === baseLines[baseIndex]) {
      baseIndex += 1;
      editedIndex += 1;
      continue;
    }
    let nextMatch = editedIndex;
    while (nextMatch < editedLines.length && editedLines[nextMatch] !== baseLines[baseIndex]) nextMatch += 1;
    if (nextMatch >= editedLines.length) return null;
    ops.push({ index: baseIndex, lines: editedLines.slice(editedIndex, nextMatch) });
    editedIndex = nextMatch;
  }
  if (editedIndex < editedLines.length) ops.push({ index: baseLines.length, lines: editedLines.slice(editedIndex) });
  return ops.filter(op => op.lines.length);
}

function containsLineSegment(lines, segment) {
  if (!segment?.length) return true;
  outer: for (let i = 0; i <= lines.length - segment.length; i += 1) {
    for (let j = 0; j < segment.length; j += 1) {
      if (lines[i + j] !== segment[j]) continue outer;
    }
    return true;
  }
  return false;
}

function applyInsertOnlyLineOps(baseText, remoteText, ops) {
  const baseLines = splitDocLines(baseText);
  let out = splitDocLines(remoteText);
  for (const op of ops) {
    const positions = findBaseLinePositions(baseLines, out);
    if (!positions) return null;
    const gapStart = op.index > 0 ? positions[op.index - 1] + 1 : 0;
    const gapEnd = op.index < baseLines.length ? positions[op.index] : out.length;
    const gap = out.slice(gapStart, gapEnd);
    if (!containsLineSegment(gap, op.lines)) out.splice(gapEnd, 0, ...op.lines);
  }
  return out.join('\n');
}

function mergeDocText(baseText, localText, remoteText) {
  const base = String(baseText ?? '');
  const local = String(localText ?? '');
  const remote = String(remoteText ?? '');
  if (remote === base) return { ok: true, text: local, mode: 'replace' };
  if (local === remote) return { ok: true, text: remote, mode: 'noop' };
  if (local === base) return { ok: true, text: remote, mode: 'remote-only' };
  const ops = collectInsertOnlyLineOps(base, local);
  if (ops && ops.length) {
    const merged = applyInsertOnlyLineOps(base, remote, ops);
    if (merged != null) return { ok: true, text: merged, mode: 'insert-merge', opCount: ops.length };
  }
  return { ok: false, text: remote, mode: 'conflict' };
}

function makePasswordRecord(password, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto.pbkdf2Sync(String(password || ''), salt, 120000, 32, 'sha256').toString('hex');
  return { passwordHash, salt };
}

function verifyPassword(password, row) {
  if (!row?.password_hash || !row?.password_salt) return false;
  const { passwordHash } = makePasswordRecord(password, row.password_salt);
  const a = Buffer.from(passwordHash, 'hex');
  const b = Buffer.from(String(row.password_hash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeRecoverySchool(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^0-9a-zㄱ-ㅎ가-힣]/g, '')
    .replace(/(초등학교|초등|초교|초학교|학교)$/u, '')
    .replace(/초$/u, '');
}

function makeRecoverySchoolRecord(studentNo, answer, salt = crypto.randomBytes(16).toString('hex')) {
  const normalized = normalizeRecoverySchool(answer);
  if (normalized.length < 2) return null;
  const recoveryHash = crypto.pbkdf2Sync(`cpx-recovery:${normalizeStudentNo(studentNo)}:${normalized}`, salt, 120000, 32, 'sha256').toString('hex');
  return { recoveryHash, salt, normalized };
}

function verifyRecoverySchool(answer, row) {
  if (!row?.student_no || !row?.recovery_school_hash || !row?.recovery_school_salt) return false;
  const rec = makeRecoverySchoolRecord(row.student_no, answer, row.recovery_school_salt);
  if (!rec) return false;
  const a = Buffer.from(rec.recoveryHash, 'hex');
  const b = Buffer.from(String(row.recovery_school_hash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setRecoverySchoolForUser(rowOrUserId, answer, at = nowIso()) {
  const row = typeof rowOrUserId === 'string' ? getUserStmt.get(rowOrUserId) : rowOrUserId;
  if (!row?.user_id || !row?.student_no) throw Object.assign(new Error('student account required'), { statusCode: 400 });
  const rec = makeRecoverySchoolRecord(row.student_no, answer);
  if (!rec) throw Object.assign(new Error('출신 초등학교를 2글자 이상 입력해주세요.'), { statusCode: 400 });
  setUserRecoverySchoolStmt.run(rec.recoveryHash, rec.salt, at, at, row.user_id);
  return getUserStmt.get(row.user_id);
}

function issueSession(userId, at = nowIso()) {
  const token = crypto.randomBytes(32).toString('base64url');
  insertSessionStmt.run(tokenHash(token), userId, at, at);
  return token;
}

function normalizeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 32);
}

function normalizeClientSessionId(value) {
  return String(value || '').trim().replace(/[^\w:.-]/g, '').slice(0, 96);
}

function presenceClientSessionId(value) {
  return normalizeClientSessionId(value) || 'legacy';
}

function normalizeStudentNo(value) {
  return String(value || '').replace(/[^0-9A-Za-z]/g, '').trim();
}

function hashStudentNo(value) {
  let h = 2166136261;
  for (const ch of normalizeStudentNo(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function maskStudent(value) {
  const s = normalizeStudentNo(value);
  if (!s) return '';
  if (s.length <= 4) return `${s[0] || ''}***`;
  return `${s.slice(0, 4)}****`;
}

function stableUserId(nickname) {
  return `user_${hash(`cpx-user:${nickname}`).slice(0, 20)}`;
}

function stableStudentUserId(studentNo) {
  return `stu_${hashStudentNo(studentNo)}`;
}

function normalizeOfficialName(value) {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, 40);
}

function isActiveAccountStatus(value) {
  return ['active', 'provisional_active', 'verified_active'].includes(String(value || 'active'));
}

function googleRegistrationProfile(row, officialName) {
  const nickname = normalizeNickname(row?.nickname || '');
  const currentRole = String(row?.a4_role || 'student');
  const privilegedRole = currentRole === 'admin' || currentRole === 'editor';
  const tfEditor = /^TF(?:\s|$)/.test(nickname);
  const privileged = privilegedRole || tfEditor;
  let a4Role = currentRole;
  if (privileged && a4Role === 'student') a4Role = /^TF\s*관리자(?:\s|$)/.test(nickname) ? 'admin' : 'editor';
  return {
    nickname: privileged && nickname ? nickname : officialName,
    accountStatus: privileged ? 'verified_active' : 'provisional_active',
    a4Role,
    registrationStatus: privileged ? 'verified_active' : 'provisional_active',
  };
}

function pruneGoogleEphemeral(now = Date.now()) {
  for (const [key, value] of googleChallenges) if (!value || value.expiresAt <= now) googleChallenges.delete(key);
  for (const [key, value] of googleOnboardingTokens) if (!value || value.expiresAt <= now) googleOnboardingTokens.delete(key);
  for (const [key, value] of googleRateBuckets) if (!value || value.resetAt <= now) googleRateBuckets.delete(key);
}

function googleClientKey(req) {
  return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 120);
}

function enforceGoogleRateLimit(req) {
  const now = Date.now();
  pruneGoogleEphemeral(now);
  const key = googleClientKey(req);
  let bucket = googleRateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + GOOGLE_RATE_WINDOW_MS };
  bucket.count += 1;
  googleRateBuckets.set(key, bucket);
  if (bucket.count > GOOGLE_RATE_MAX) throw Object.assign(new Error('Google 로그인을 잠시 후 다시 시도해주세요.'), { statusCode: 429 });
}

function issueGoogleChallenge(req) {
  enforceGoogleRateLimit(req);
  const challengeId = crypto.randomBytes(24).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + GOOGLE_CHALLENGE_TTL_MS;
  googleChallenges.set(challengeId, { nonce, expiresAt, clientKey: googleClientKey(req) });
  return { challengeId, nonce, expiresAt: new Date(expiresAt).toISOString() };
}

function issueGoogleOnboarding(claims) {
  const token = crypto.randomBytes(32).toString('base64url');
  googleOnboardingTokens.set(token, { ...claims, expiresAt: Date.now() + GOOGLE_ONBOARDING_TTL_MS });
  return token;
}

function decodeGoogleJwtPart(part, label) {
  try {
    return JSON.parse(Buffer.from(String(part || ''), 'base64url').toString('utf8'));
  } catch {
    throw Object.assign(new Error(`invalid Google ${label}`), { statusCode: 401 });
  }
}

async function googleJwkForKid(kid) {
  const now = Date.now();
  if (googleJwksCache.expiresAt > now && googleJwksCache.keys.has(kid)) return googleJwksCache.keys.get(kid);
  let response;
  try {
    response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { headers: { accept: 'application/json' } });
  } catch {
    throw Object.assign(new Error('Google 인증 서버에 연결할 수 없습니다.'), { statusCode: 503 });
  }
  if (!response.ok) throw Object.assign(new Error('Google 인증 키를 확인할 수 없습니다.'), { statusCode: 503 });
  const payload = await response.json();
  const keys = new Map((payload.keys || []).filter(key => key?.kid).map(key => [String(key.kid), key]));
  const maxAge = Number(String(response.headers.get('cache-control') || '').match(/max-age=(\d+)/i)?.[1] || 3600);
  googleJwksCache = { expiresAt: now + Math.max(300, Math.min(maxAge, 86400)) * 1000, keys };
  const key = keys.get(kid);
  if (!key) throw Object.assign(new Error('Google 인증 키가 일치하지 않습니다.'), { statusCode: 401 });
  return key;
}

async function verifyGoogleIdToken(credential, expectedNonce) {
  const raw = String(credential || '');
  if (!raw || raw.length > 16000) throw Object.assign(new Error('Google 로그인 응답이 올바르지 않습니다.'), { statusCode: 401 });
  const parts = raw.split('.');
  if (parts.length !== 3) throw Object.assign(new Error('Google 로그인 응답이 올바르지 않습니다.'), { statusCode: 401 });
  const header = decodeGoogleJwtPart(parts[0], 'header');
  const claims = decodeGoogleJwtPart(parts[1], 'claims');
  if (header.alg !== 'RS256' || !header.kid) throw Object.assign(new Error('지원하지 않는 Google 인증 방식입니다.'), { statusCode: 401 });
  const jwk = await googleJwkForKid(String(header.kid));
  let verified = false;
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    verified = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  } catch {}
  if (!verified) throw Object.assign(new Error('Google 서명을 확인하지 못했습니다.'), { statusCode: 401 });
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud || '')];
  if (!audience.includes(GOOGLE_CLIENT_ID) || (claims.azp && String(claims.azp) !== GOOGLE_CLIENT_ID)) {
    throw Object.assign(new Error('다른 앱에서 발급된 Google 로그인입니다.'), { statusCode: 401 });
  }
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(String(claims.iss || ''))) throw Object.assign(new Error('Google 발급자를 확인하지 못했습니다.'), { statusCode: 401 });
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= now - 30) throw Object.assign(new Error('Google 로그인이 만료되었습니다.'), { statusCode: 401 });
  if (Number.isFinite(Number(claims.iat)) && Number(claims.iat) > now + 300) throw Object.assign(new Error('Google 로그인 시간이 올바르지 않습니다.'), { statusCode: 401 });
  if (!expectedNonce || String(claims.nonce || '') !== String(expectedNonce)) throw Object.assign(new Error('Google 로그인 요청이 만료되었거나 일치하지 않습니다.'), { statusCode: 401 });
  if (!(claims.email_verified === true || claims.email_verified === 'true')) throw Object.assign(new Error('확인된 Google 이메일이 필요합니다.'), { statusCode: 401 });
  const sub = String(claims.sub || '').trim();
  const email = String(claims.email || '').trim().toLowerCase();
  if (!sub || sub.length > 255 || !email || email.length > 320) throw Object.assign(new Error('Google 계정 정보를 확인하지 못했습니다.'), { statusCode: 401 });
  return { googleSub: sub, email, displayName: normalizeOfficialName(claims.name || '') };
}

function recordAuthAudit(eventType, values = {}) {
  insertAuthAuditStmt.run(
    String(eventType || '').slice(0, 80),
    values.googleSub ? String(values.googleSub).slice(0, 255) : null,
    values.userId ? String(values.userId).slice(0, 120) : null,
    values.studentNo ? normalizeStudentNo(values.studentNo).slice(0, 40) : null,
    nowIso(),
    JSON.stringify(values.detail || {}).slice(0, 4000)
  );
}

function timingSafePassword(input) {
  if (!SHARED_PASSWORD) return false;
  const a = Buffer.from(String(input || ''));
  const b = Buffer.from(String(SHARED_PASSWORD || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function bearerToken(req, url) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || url.searchParams.get('token') || '';
}

function requestHostname(req) {
  const raw = String(req.headers.host || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('[')) return raw.slice(1, raw.indexOf(']'));
  return raw.split(':')[0];
}

function isLoopbackRequest(req) {
  const forwarded = req.headers['cf-connecting-ip']
    || req.headers['x-forwarded-for']
    || req.headers.forwarded
    || req.headers['x-forwarded-host'];
  if (forwarded) return false;
  const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  return ['127.0.0.1', 'localhost', '::1'].includes(requestHostname(req))
    && ['127.0.0.1', '::1'].includes(remote);
}

function requireAuth(req, url) {
  const token = bearerToken(req, url);
  if (!token) throw Object.assign(new Error('login required'), { statusCode: 401 });
  const th = tokenHash(token);
  const row = getSessionStmt.get(th);
  if (!row) throw Object.assign(new Error('invalid session'), { statusCode: 401 });
  if (!isActiveAccountStatus(row.account_status)) throw Object.assign(new Error('이 계정은 현재 이용할 수 없습니다.'), { statusCode: 403 });
  if (A4_GOOGLE_ONLY && row.auth_provider !== 'google' && !isLoopbackRequest(req)) {
    throw Object.assign(new Error('이제 Google 계정으로만 로그인할 수 있습니다.'), { statusCode: 403 });
  }
  const at = nowIso();
  touchSessionStmt.run(at, th);
  touchUserStmt.run(at, row.user_id);
  const googleUser = row.auth_provider === 'google';
  return { userId: row.user_id, nickname: row.nickname, studentNo: row.student_no, studentMasked: row.student_masked, officialName: row.official_name, authProvider: row.auth_provider || 'password', accountStatus: row.account_status || 'active', a4Role: row.a4_role || 'student', passwordChanged: googleUser || !!row.password_changed, mustChangePassword: !googleUser && row.password_changed === 0, recoverySchoolSet: googleUser || !!row.recovery_school_hash, tokenHash: th };
}

function publicUser(row, token, extra = {}) {
  const googleUser = row.auth_provider === 'google';
  return {
    id: row.user_id,
    userId: row.user_id,
    nickname: row.nickname,
    studentMasked: row.student_masked || undefined,
    officialName: row.official_name || undefined,
    authProvider: row.auth_provider || 'password',
    accountStatus: row.account_status || 'active',
    a4Role: row.a4_role || 'student',
    token,
    mustChangePassword: !googleUser && row.password_changed === 0,
    recoverySchoolSet: googleUser || !!row.recovery_school_hash,
    ...extra,
  };
}

function publicRow(row) {
  if (!row) return null;
  let parsed = null;
  try { parsed = JSON.parse(row.state_json); } catch {}
  return {
    user_id: row.user_id,
    state_json: parsed ?? row.state_json,
    state_version: row.state_version,
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  };
}

function stateRowJsonBody(row) {
  if (!row) return 'null';
  const rawState = String(row.state_json || 'null').trim() || 'null';
  const stateValue = /^[\[{]/.test(rawState) ? rawState : JSON.stringify(rawState);
  return `{"user_id":${JSON.stringify(row.user_id)},"state_json":${stateValue},"state_version":${JSON.stringify(row.state_version)},"updated_by":${JSON.stringify(row.updated_by)},"updated_at":${JSON.stringify(row.updated_at)}}`;
}

function jsonStateRow(res, status, row) {
  return jsonRaw(res, status, stateRowJsonBody(row));
}

function isPersonalizedA4Board(userId) {
  return A4_PERSONAL_OVERLAYS_ENABLED && A4_USER_IDS.has(String(userId || ''));
}

function parseJsonObject(value, label = 'stored JSON') {
  try {
    const parsed = JSON.parse(String(value || ''));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  throw Object.assign(new Error(`${label} is not a valid JSON object`), { statusCode: 500 });
}

function personalOverlayFromRow(row) {
  if (!row?.overlay_json) {
    return {
      format: PERSONAL_OVERLAY_FORMAT,
      docs: {},
      settings: { values: {}, deleted: [], collections: {} },
    };
  }
  return parseJsonObject(row.overlay_json, 'personal overlay');
}

function personalOverlaySessionConflict(current, metadata = {}, summary = { hasChanges: true }) {
  if (!current?.updated_at || !summary?.hasChanges) return null;
  const baseOverlayUpdatedAt = String(metadata.baseOverlayUpdatedAt || '').trim();
  if (baseOverlayUpdatedAt && baseOverlayUpdatedAt === String(current.updated_at || '')) return null;
  const incomingSessionId = normalizeClientSessionId(metadata.clientSessionId);
  const currentSessionId = normalizeClientSessionId(current.client_session_id);
  if (incomingSessionId && currentSessionId && incomingSessionId === currentSessionId) return null;
  return {
    updated_at: current.updated_at,
    updated_by: current.updated_by || null,
    client_session_id: currentSessionId || null,
  };
}

function savePersonalOverlay(boardUserId, auth, masterRow, incomingState, metadata = {}) {
  const masterState = parseJsonObject(masterRow.state_json, 'stored state_json');
  const updatedAt = String(metadata.updatedAt || incomingState.updatedAt || nowIso());
  const updatedBy = metadata.updatedBy || auth.nickname || auth.userId;
  const current = getPersonalOverlayStmt.get(boardUserId, auth.userId);
  const overlay = buildPersonalOverlay(masterState, incomingState, {
    updatedAt,
    updatedBy,
    saveEvent: metadata.saveEvent || incomingState.saveEvent || null,
    clientBuild: metadata.clientBuild || incomingState.clientBuild || null,
    previousOverlay: personalOverlayFromRow(current),
  });
  const summary = overlaySummary(overlay);
  const conflict = !metadata.force && personalOverlaySessionConflict(current, metadata, summary);
  if (conflict) {
    throw Object.assign(new Error('같은 계정의 다른 탭에서 더 최신 개인 대본이 저장되었습니다. 최신 내용을 확인한 뒤 다시 저장해주세요.'), {
      statusCode: 409,
      conflict,
    });
  }
  upsertPersonalOverlayStmt.run(
    boardUserId,
    auth.userId,
    JSON.stringify(overlay),
    masterRow.updated_at || null,
    metadata.stateVersion || masterRow.state_version || null,
    current?.created_at || updatedAt,
    updatedAt,
    updatedBy,
    normalizeClientSessionId(metadata.clientSessionId) || null
  );
  clearStateResponseCache(boardUserId);
  return { overlay, summary, updatedAt, updatedBy };
}

function latestIso(a, b) {
  const aMs = Date.parse(a || '') || 0;
  const bMs = Date.parse(b || '') || 0;
  return bMs >= aMs ? (b || a || null) : (a || b || null);
}

function personalizedStateRow(masterRow, authUserId) {
  if (!masterRow || !authUserId || !isPersonalizedA4Board(masterRow.user_id)) return masterRow;
  const overlayRow = getPersonalOverlayStmt.get(masterRow.user_id, authUserId);
  const masterState = parseJsonObject(masterRow.state_json, 'stored state_json');
  const overlay = personalOverlayFromRow(overlayRow);
  const state = applyPersonalOverlay(masterState, overlay);
  const updatedAt = latestIso(masterRow.updated_at, overlayRow?.updated_at);
  const overlayWins = overlayRow?.updated_at && updatedAt === overlayRow.updated_at;
  return {
    ...masterRow,
    state_json: JSON.stringify(state),
    updated_at: updatedAt || masterRow.updated_at,
    updated_by: overlayWins ? (overlayRow.updated_by || masterRow.updated_by) : masterRow.updated_by,
  };
}

function stateCacheKey(userId, authUserId = '') {
  return `${String(userId || DEFAULT_USER_ID)}\u0000${String(authUserId || '')}`;
}

function pruneStateResponseCache(now = Date.now()) {
  for (const [key, value] of stateResponseCache.entries()) {
    if (!value || value.expiresAt <= now) stateResponseCache.delete(key);
  }
  while (STATE_RESPONSE_CACHE_MAX_ENTRIES >= 0 && stateResponseCache.size >= STATE_RESPONSE_CACHE_MAX_ENTRIES && stateResponseCache.size) {
    stateResponseCache.delete(stateResponseCache.keys().next().value);
  }
}

function stateRowPayloadForUser(userId, authUserId = '') {
  const key = String(userId || DEFAULT_USER_ID);
  const cacheKey = stateCacheKey(key, isPersonalizedA4Board(key) ? authUserId : '');
  const now = Date.now();
  pruneStateResponseCache(now);
  const cached = stateResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached;
  const masterRow = getStateStmt.get(key);
  const row = personalizedStateRow(masterRow, authUserId);
  const payload = {
    found: !!row,
    status: row ? 200 : 404,
    body: row ? stateRowJsonBody(row) : JSON.stringify({ error: 'state not found', user_id: key }),
    expiresAt: now + STATE_RESPONSE_CACHE_MS,
  };
  if (STATE_RESPONSE_CACHE_MAX_ENTRIES > 0) stateResponseCache.set(cacheKey, payload);
  return payload;
}

function clearStateResponseCache(userId) {
  const prefix = `${String(userId || DEFAULT_USER_ID)}\u0000`;
  for (const key of stateResponseCache.keys()) if (key.startsWith(prefix)) stateResponseCache.delete(key);
}

function sharedRecordTime(value) {
  return Math.max(
    Date.parse(value?.deletedAt || value?.deleted_at || 0) || 0,
    Date.parse(value?.updatedAt || value?.updated_at || 0) || 0,
    Date.parse(value?.createdAt || value?.created_at || value?.at || 0) || 0
  );
}

function mergeSharedRecords(existingValue, incomingValue) {
  const existing = existingValue && typeof existingValue === 'object' && !Array.isArray(existingValue) ? existingValue : {};
  const incoming = incomingValue && typeof incomingValue === 'object' && !Array.isArray(incomingValue) ? incomingValue : {};
  const out = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    const old = out[key];
    if (!old || sharedRecordTime(value) >= sharedRecordTime(old)) out[key] = value;
  }
  return out;
}

function mergeA4SharedState(masterState, incomingState, updatedAt, updatedBy) {
  const master = masterState && typeof masterState === 'object' ? masterState : {};
  const incoming = incomingState && typeof incomingState === 'object' ? incomingState : {};
  const currentSettings = master.settings && typeof master.settings === 'object' ? master.settings : {};
  const incomingSettings = incoming.settings && typeof incoming.settings === 'object' ? incoming.settings : {};
  const settings = { ...currentSettings };
  if (incomingSettings.profiles && typeof incomingSettings.profiles === 'object') {
    settings.profiles = mergeProfilesByUpdatedAt(currentSettings.profiles || {}, incomingSettings.profiles);
  }
  if (incomingSettings.communityPosts && typeof incomingSettings.communityPosts === 'object') {
    settings.communityPosts = mergeSharedRecords(currentSettings.communityPosts, incomingSettings.communityPosts);
  }
  if (incomingSettings.comments && typeof incomingSettings.comments === 'object') {
    settings.comments = mergeSharedRecords(currentSettings.comments, incomingSettings.comments);
  }
  const changed = !isDeepStrictEqual(currentSettings.profiles || {}, settings.profiles || {})
    || !isDeepStrictEqual(currentSettings.communityPosts || {}, settings.communityPosts || {})
    || !isDeepStrictEqual(currentSettings.comments || {}, settings.comments || {});
  if (!changed) return { state: master, changed: false };
  return {
    state: {
      ...master,
      settings,
      updatedAt,
      updatedBy,
      updatedByUserId: incoming.updatedByUserId || null,
      saveEvent: incoming.saveEvent || master.saveEvent || null,
    },
    changed: true,
  };
}

function a4PersonalStateShapeGuard(masterState, incomingState) {
  const masterDocs = masterState?.docs && typeof masterState.docs === 'object' ? Object.keys(masterState.docs).length : 0;
  const incomingDocs = incomingState?.docs && typeof incomingState.docs === 'object' ? Object.keys(incomingState.docs).length : 0;
  const masterSettings = masterState?.settings && typeof masterState.settings === 'object' ? Object.keys(masterState.settings).length : 0;
  const incomingSettings = incomingState?.settings && typeof incomingState.settings === 'object' ? Object.keys(incomingState.settings).length : 0;
  if (masterDocs >= 50 && incomingDocs < Math.floor(masterDocs * 0.6)) {
    throw Object.assign(new Error('개인 대본 저장 데이터가 불완전합니다. 최신 화면을 다시 불러온 뒤 저장해주세요.'), { statusCode: 409 });
  }
  if (masterSettings >= 100 && incomingSettings < Math.floor(masterSettings * 0.5)) {
    throw Object.assign(new Error('개인 서식 저장 데이터가 불완전합니다. 최신 화면을 다시 불러온 뒤 저장해주세요.'), { statusCode: 409 });
  }
}

function objectKeyCount(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).length
    : 0;
}

function a4StateLossGuard(userId, nextState, nextText, currentRow) {
  if (!A4_USER_IDS.has(userId) || !currentRow?.state_json) return;
  let currentState = null;
  try { currentState = JSON.parse(currentRow.state_json); } catch { return; }
  if (!currentState || typeof currentState !== 'object' || !nextState || typeof nextState !== 'object') return;

  const currentBytes = Buffer.byteLength(currentRow.state_json, 'utf8');
  const nextBytes = Buffer.byteLength(nextText || '', 'utf8');
  const currentSettings = currentState.settings && typeof currentState.settings === 'object' ? currentState.settings : {};
  const nextSettings = nextState.settings && typeof nextState.settings === 'object' ? nextState.settings : {};
  const currentSettingsCount = objectKeyCount(currentSettings);
  const nextSettingsCount = objectKeyCount(nextSettings);
  const currentImageCount = objectKeyCount(currentSettings.imageAssets);
  const nextImageCount = objectKeyCount(nextSettings.imageAssets);
  const currentDocMetaCount = objectKeyCount(currentSettings.docMeta);
  const nextDocMetaCount = objectKeyCount(nextSettings.docMeta);

  const largeExistingState = currentBytes > 5 * 1024 * 1024;
  const suspiciousShrink = nextBytes > 0 && nextBytes < currentBytes * 0.35;
  const lostImages = currentImageCount >= 20 && nextImageCount < currentImageCount * 0.5;
  const lostSettings = currentSettingsCount >= 100 && nextSettingsCount < currentSettingsCount * 0.5;
  const lostDocMeta = currentDocMetaCount >= 30 && nextDocMetaCount < currentDocMetaCount * 0.5;

  if (largeExistingState && suspiciousShrink && (lostImages || lostSettings || lostDocMeta)) {
    const err = new Error('state loss guard: suspicious compact A4 state rejected; reload the editor before saving');
    err.statusCode = 409;
    err.details = {
      current_bytes: currentBytes,
      incoming_bytes: nextBytes,
      current_settings: currentSettingsCount,
      incoming_settings: nextSettingsCount,
      current_images: currentImageCount,
      incoming_images: nextImageCount,
      current_doc_meta: currentDocMetaCount,
      incoming_doc_meta: nextDocMetaCount,
    };
    throw err;
  }
}

function broadcast(userId, type, event) {
  const clients = clientsByUser.get(userId);
  if (!clients) return;
  const payload = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of Array.from(clients)) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

function activePresence(userId) {
  prunePresenceStmt.run(new Date(Date.now() - PRESENCE_TTL_MS).toISOString());
  return listPresenceStmt.all(userId, new Date(Date.now() - PRESENCE_TTL_MS).toISOString());
}

function activeDocEditors(userId, docId) {
  return activePresence(userId)
    .filter(u => String(u.cc_id) === String(docId) && u.status === 'editing')
    .sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')));
}

function docEditBlockers(userId, docId, authUserId) {
  const editors = activeDocEditors(userId, docId);
  if (!editors.length) return [];
  if (String(editors[0].user_id) === String(authUserId)) return [];
  return editors.filter(u => String(u.user_id) !== String(authUserId));
}

function lockedDocResponse(res, editors) {
  const names = editors.map(u => u.nickname || '다른 사용자').filter(Boolean).join(', ') || '다른 사용자';
  return json(res, 423, {
    error: `현재 ${names}님이 이 CC를 수정 중입니다. 수정이 끝나면 다시 저장해주세요.`,
    editors,
  });
}

function addSseClient(userId, auth, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive',
    'access-control-allow-origin': '*',
    'x-accel-buffering': 'no',
  });
  res.write(`: connected ${nowIso()}\n\n`);
  res.write(`event: presence\ndata: ${JSON.stringify({ users: activePresence(userId), self: auth.userId })}\n\n`);
  let clients = clientsByUser.get(userId);
  if (!clients) {
    clients = new Set();
    clientsByUser.set(userId, clients);
  }
  clients.add(res);
  const ping = setInterval(() => {
    try { res.write(`event: ping\ndata: ${JSON.stringify({ at: nowIso() })}\n\n`); }
    catch { clearInterval(ping); clients.delete(res); }
  }, 25000);
  res.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
    if (!clients.size) clientsByUser.delete(userId);
  });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '/cpx' || pathname === '/cpx-local') pathname = '/cpx-script-board-local.html';
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT + path.sep)) return text(res, 403, 'Forbidden');
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return text(res, 404, 'Not found');
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  res.writeHead(200, {
    'content-type': types[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=60',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    });
    res.end();
    return;
  }

  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        pid: process.pid,
        uptime_s: Math.round(process.uptime()),
        db_path: DB_PATH,
        now: nowIso(),
      });
    }

    if (url.pathname === '/api/cloud/status' && req.method === 'GET') {
      requireAuth(req, url);
      return json(res, 200, cloudStatusPayload());
    }

    if (url.pathname === '/api/cloud/list' && req.method === 'GET') {
      const auth = requireAuth(req, url);
      return json(res, 200, listCloudDir(url.searchParams.get('path') || '/', auth));
    }

    if (url.pathname === '/api/cloud/like' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      ensureCloudBase();
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const target = cloudAbs(body.path || '');
      if (!canReadCloudPath(target.rel, auth)) return json(res, 403, { error: 'TF 전용 폴더는 TF만 열 수 있습니다.' });
      if (!target.rel || !fs.existsSync(target.abs)) return json(res, 404, { error: 'file not found' });
      const st = fs.statSync(target.abs);
      if (!st.isFile()) return json(res, 400, { error: 'folders cannot be liked' });
      const displayPath = cloudDisplayPath(target.rel);
      const likeKey = cloudLikeKey(target.rel);
      const alreadyLiked = Boolean(getCloudLikeStmt.get(likeKey, auth.userId));
      const desiredLiked = typeof body.liked === 'boolean' ? body.liked : !alreadyLiked;
      let changed = false;
      if (desiredLiked && !alreadyLiked) {
        insertCloudLikeStmt.run(likeKey, auth.userId, auth.nickname || null, nowIso());
        changed = true;
      } else if (!desiredLiked && alreadyLiked) {
        deleteCloudLikeStmt.run(likeKey, auth.userId);
        changed = true;
      }
      if (changed) {
        recordCloudEvent(desiredLiked ? 'like' : 'unlike', target.rel, null, auth, st.size, { likeCount: cloudLikeMeta(displayPath, auth).likeCount });
      }
      const parentRel = path.dirname(target.rel) === '.' ? '' : path.dirname(target.rel);
      return json(res, 200, {
        ok: true,
        path: displayPath,
        ...cloudLikeMeta(displayPath, auth),
        listing: listCloudDir(parentRel, auth),
      });
    }

    if (url.pathname === '/api/cloud/folder' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      ensureCloudBase();
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const parent = cloudAbs(body.path || '/');
      if (!canReadCloudPath(parent.rel, auth)) return json(res, 403, { error: 'TF 전용 폴더는 TF만 열 수 있습니다.' });
      if (!fs.statSync(parent.abs).isDirectory()) return json(res, 400, { error: 'parent is not a folder' });
      const name = safeCloudName(body.name || '새 폴더', '새 폴더');
      const targetAbs = uniqueChildPath(parent.abs, name);
      const relPath = path.relative(CLOUD_ROOT, targetAbs);
      if (!canReadCloudPath(relPath, auth)) return json(res, 403, { error: 'TF 전용 폴더는 TF만 만들 수 있습니다.' });
      fs.mkdirSync(targetAbs, { recursive: false });
      markCloudOwner(relPath, auth);
      recordCloudEvent('mkdir', relPath, null, auth, 0, { requestedName: body.name || '' });
      return json(res, 200, { ok: true, folder: { name: path.basename(targetAbs), path: cloudDisplayPath(relPath), type: 'folder', ...cloudEntryControls(relPath, auth) }, listing: listCloudDir(body.path || '/', auth) });
    }

    if (url.pathname === '/api/cloud/upload' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      ensureCloudBase();
      const contentLength = Number(req.headers['content-length'] || 0);
      if (contentLength && contentLength > CLOUD_MAX_FILE_BYTES + 2 * 1024 * 1024) {
        return json(res, 413, { error: '파일당 200MB까지만 업로드할 수 있습니다.', maxFileBytes: CLOUD_MAX_FILE_BYTES });
      }
      const buffer = await readBinaryBody(req, CLOUD_MAX_FILE_BYTES + 2 * 1024 * 1024);
      const parts = parseMultipart(buffer, req.headers['content-type'] || '');
      const file = parts.find(part => part.filename && part.data);
      if (!file) return json(res, 400, { error: 'file required' });
      const formPath = parts.find(part => part.name === 'path')?.data?.toString('utf8') || url.searchParams.get('path') || '/';
      if (file.data.length > CLOUD_MAX_FILE_BYTES) {
        return json(res, 413, { error: '파일당 200MB까지만 업로드할 수 있습니다.', maxFileBytes: CLOUD_MAX_FILE_BYTES });
      }
      const parent = cloudAbs(formPath);
      if (!canReadCloudPath(parent.rel, auth)) return json(res, 403, { error: 'TF 전용 폴더는 TF만 열 수 있습니다.' });
      if (!fs.statSync(parent.abs).isDirectory()) return json(res, 400, { error: 'upload path is not a folder' });
      const status = cloudStatusPayload();
      if (status.usedBytes + file.data.length > CLOUD_CAPACITY_BYTES) {
        return json(res, 507, { error: 'CPX Cloud 300GB 용량 제한을 넘습니다.', capacityBytes: CLOUD_CAPACITY_BYTES, usedBytes: status.usedBytes });
      }
      if (status.diskFreeBytes != null && file.data.length > status.diskFreeBytes) {
        return json(res, 507, { error: 'SSD 여유 공간이 부족합니다.', diskFreeBytes: status.diskFreeBytes });
      }
      const filename = safeCloudName(file.filename, 'upload.bin');
      const targetAbs = uniqueChildPath(parent.abs, filename);
      const tempAbs = path.join(parent.abs, `.upload-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`);
      fs.writeFileSync(tempAbs, file.data, { flag: 'wx' });
      fs.renameSync(tempAbs, targetAbs);
      const relPath = path.relative(CLOUD_ROOT, targetAbs);
      markCloudOwner(relPath, auth);
      recordCloudEvent('upload', relPath, null, auth, file.data.length, { mime: file.type, requestedName: file.filename });
      return json(res, 200, {
        ok: true,
        file: { name: path.basename(targetAbs), path: cloudDisplayPath(relPath), type: 'file', size: file.data.length, modifiedAt: fs.statSync(targetAbs).mtime.toISOString(), likeCount: 0, likedByMe: false, featured: false, ...cloudEntryControls(relPath, auth) },
        listing: listCloudDir(formPath, auth),
      });
    }

    if (url.pathname === '/api/cloud/move' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      ensureCloudBase();
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const rawPaths = Array.isArray(body.paths) ? body.paths : [body.path];
      const destination = cloudAbs(body.destinationPath || body.destination || body.targetPath || '/');
      if (!canReadCloudPath(destination.rel, auth)) return json(res, 403, { error: 'TF 전용 폴더로는 TF만 이동할 수 있습니다.' });
      if (!fs.existsSync(destination.abs)) return json(res, 404, { error: '이동할 폴더를 찾을 수 없습니다.' });
      if (!fs.statSync(destination.abs).isDirectory()) return json(res, 400, { error: '이동 위치는 폴더여야 합니다.' });
      const destinationAbs = path.resolve(destination.abs);
      const seen = new Set();
      const targets = [];
      for (const itemPath of rawPaths) {
        const target = cloudAbs(itemPath || '');
        if (!canReadCloudPath(target.rel, auth)) return json(res, 403, { error: 'TF 전용 폴더는 TF만 열 수 있습니다.' });
        const key = cloudMetaKey(target.rel);
        if (!target.rel || seen.has(key)) continue;
        seen.add(key);
        if (!fs.existsSync(target.abs)) return json(res, 404, { error: '이동할 파일을 찾을 수 없습니다.' });
        const st = fs.lstatSync(target.abs);
        if (st.isSymbolicLink()) return json(res, 400, { error: 'symbolic links are not supported' });
        if (!st.isFile() && !st.isDirectory()) return json(res, 400, { error: 'unsupported file type' });
        if (!canDeleteCloudTree(target.rel, auth)) return json(res, 403, { error: '업로더 또는 TF만 이동할 수 있습니다.' });
        const sourceAbs = path.resolve(target.abs);
        if (path.dirname(sourceAbs) === destinationAbs) return json(res, 400, { error: '이미 같은 폴더에 있습니다.' });
        if (st.isDirectory() && (destinationAbs === sourceAbs || destinationAbs.startsWith(sourceAbs + path.sep))) {
          return json(res, 400, { error: '폴더를 자기 자신이나 하위 폴더로 이동할 수 없습니다.' });
        }
        targets.push({ ...target, st });
      }
      if (!targets.length) return json(res, 400, { error: '이동할 항목을 선택해 주세요.' });
      const parentRels = new Set(targets.map(target => path.dirname(target.rel) === '.' ? '' : path.dirname(target.rel)));
      const currentRel = normalizeCloudRel(body.currentPath || (parentRels.size === 1 ? [...parentRels][0] : '/'));
      const moved = [];
      for (const target of targets) {
        const targetAbs = uniqueChildPath(destination.abs, path.basename(target.abs));
        fs.renameSync(target.abs, targetAbs);
        const nextRel = path.relative(CLOUD_ROOT, targetAbs);
        rewriteCloudMetadataPrefix(target.rel, nextRel);
        if (!cloudOwnerMeta(nextRel)) markCloudOwner(nextRel, auth);
        recordCloudEvent('move', target.rel, nextRel, auth, target.st.isFile() ? target.st.size : null, {
          kind: target.st.isDirectory() ? 'folder' : 'file',
          destinationPath: cloudDisplayPath(destination.rel),
        });
        moved.push({ from: cloudDisplayPath(target.rel), to: cloudDisplayPath(nextRel), name: path.basename(targetAbs), type: target.st.isDirectory() ? 'folder' : 'file' });
      }
      return json(res, 200, {
        ok: true,
        moved,
        listing: listCloudDir(currentRel || '/', auth),
        destinationListing: listCloudDir(destination.rel || '/', auth),
      });
    }

    if (url.pathname === '/api/cloud/delete' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      ensureCloudBase();
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const target = cloudAbs(body.path || '');
      if (!canReadCloudPath(target.rel, auth)) return json(res, 403, { error: 'TF 전용 폴더는 TF만 열 수 있습니다.' });
      if (!target.rel) return json(res, 400, { error: 'root folder cannot be deleted' });
      if (!fs.existsSync(target.abs)) return json(res, 404, { error: 'file not found' });
      const st = fs.lstatSync(target.abs);
      if (st.isSymbolicLink()) return json(res, 400, { error: 'symbolic links are not supported' });
      if (!canDeleteCloudTree(target.rel, auth)) return json(res, 403, { error: '업로더 또는 TF만 삭제할 수 있습니다.' });
      const parentRel = path.dirname(target.rel) === '.' ? '' : path.dirname(target.rel);
      const trashRoot = path.join(CLOUD_ROOT, CLOUD_TRASH_DIRNAME);
      fs.mkdirSync(trashRoot, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
      const trashAbs = uniqueChildPath(trashRoot, `${stamp}__${path.basename(target.abs)}`);
      fs.renameSync(target.abs, trashAbs);
      const trashRel = path.relative(CLOUD_ROOT, trashAbs);
      const likeKey = cloudLikeKey(target.rel);
      const metaKey = cloudMetaKey(target.rel);
      deleteCloudLikesForPathStmt.run(likeKey, `${likeKey}/%`);
      deleteCloudEntriesForPathStmt.run(metaKey, `${metaKey}/%`);
      recordCloudEvent('trash', target.rel, trashRel, auth, st.isFile() ? st.size : null, { kind: st.isDirectory() ? 'folder' : 'file' });
      return json(res, 200, { ok: true, trashedPath: cloudInternalDisplayPath(trashRel), listing: listCloudDir(parentRel, auth) });
    }

    if (url.pathname === '/api/cloud/download-zip' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const paths = Array.isArray(body.paths) ? body.paths : [];
      const filename = body.filename || (paths.length === 1 ? path.basename(normalizeCloudRel(paths[0] || '')) : 'CPX_Cloud_선택');
      const zip = await buildCloudZip(paths, auth, filename);
      return streamDownload(res, zip.zipAbs, zip.filename, 'application/zip', zip.size, () => fs.rmSync(zip.zipAbs, { force: true }));
    }

    if (url.pathname === '/api/cloud/download' && req.method === 'GET') {
      const auth = requireAuth(req, url);
      ensureCloudBase();
      const target = cloudAbs(url.searchParams.get('path') || '');
      if (!canReadCloudPath(target.rel, auth)) return json(res, 403, { error: 'TF 전용 폴더는 TF만 열 수 있습니다.' });
      if (!target.rel || !fs.existsSync(target.abs)) return json(res, 404, { error: 'file not found' });
      const st = fs.statSync(target.abs);
      if (st.isDirectory()) {
        const zip = await buildCloudZip([cloudDisplayPath(target.rel)], auth, path.basename(target.abs));
        return streamDownload(res, zip.zipAbs, zip.filename, 'application/zip', zip.size, () => fs.rmSync(zip.zipAbs, { force: true }));
      }
      if (!st.isFile()) return json(res, 400, { error: 'unsupported file type' });
      const ext = path.extname(target.abs).toLowerCase();
      const types = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.txt': 'text/plain; charset=utf-8',
        '.md': 'text/markdown; charset=utf-8',
        '.zip': 'application/zip',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.hwp': 'application/x-hwp',
      };
      const filename = path.basename(target.abs);
      recordCloudEvent('download', target.rel, null, auth, st.size, {});
      return streamDownload(res, target.abs, filename, types[ext] || 'application/octet-stream', st.size);
    }

    if (url.pathname === '/api/bug-reports' && req.method === 'GET') {
      const auth = requireAuth(req, url);
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 80) || 80));
      const admin = isBugReportAdmin(auth);
      const rows = admin ? listBugReportsAllStmt.all(limit) : listBugReportsForUserStmt.all(auth.userId, limit);
      return json(res, 200, { ok: true, admin, reports: rows.map(publicBugReport) });
    }

    if (url.pathname === '/api/bug-reports' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const title = String(body.title || '').trim().slice(0, 160);
      const text = String(body.body || body.text || '').trim().slice(0, 5000);
      if (!title) return json(res, 400, { error: '제목을 입력해주세요.' });
      if (!text) return json(res, 400, { error: '내용을 입력해주세요.' });
      const at = nowIso();
      const id = `br_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
      const reporterName = normalizeNickname(body.reporter_name || body.reporterName || auth.nickname || '익명') || '익명';
      const captureImageRaw = String(body.capture_image || body.captureImage || '');
      const captureImage = captureImageRaw.startsWith('data:image/') ? captureImageRaw.slice(0, 900000) : '';
      const captureRect = body.capture_rect || body.captureRect || null;
      const captureMeta = body.capture_meta || body.captureMeta || null;
      insertBugReportStmt.run(
        id,
        title,
        text,
        normalizeBugSeverity(body.severity),
        'open',
        String(body.page_url || body.pageUrl || '').slice(0, 500),
        String(body.context_doc_id ?? body.contextDocId ?? '').slice(0, 80),
        String(body.context_title ?? body.contextTitle ?? '').slice(0, 200),
        auth.userId,
        reporterName,
        String(auth.studentMasked || body.reporter_student_masked || body.reporterStudentMasked || '').slice(0, 40),
        String(req.headers['user-agent'] || '').slice(0, 500),
        String(body.client_build || body.clientBuild || '').slice(0, 120),
        captureImage,
        captureRect ? JSON.stringify(captureRect).slice(0, 4000) : '',
        captureMeta ? JSON.stringify(captureMeta).slice(0, 4000) : '',
        '',
        at,
        at
      );
      const row = getBugReportStmt.get(id);
      broadcast(DEFAULT_USER_ID, 'bug_report', { id, created_at: at, reporter_name: reporterName, title });
      return json(res, 201, { ok: true, report: publicBugReport(row) });
    }

    if (url.pathname.startsWith('/api/bug-reports/') && req.method === 'PATCH') {
      const auth = requireAuth(req, url);
      if (!isBugReportAdmin(auth)) return json(res, 403, { error: '버그리포트 관리는 TF 관리자만 가능합니다.' });
      const id = decodeURIComponent(url.pathname.slice('/api/bug-reports/'.length));
      const current = getBugReportStmt.get(id);
      if (!current) return json(res, 404, { error: '리포트를 찾지 못했습니다.' });
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const nextStatus = normalizeBugStatus(body.status || current.status);
      const adminNote = body.admin_note == null && body.adminNote == null ? (current.admin_note || '') : String(body.admin_note ?? body.adminNote ?? '').slice(0, 2000);
      const at = nowIso();
      updateBugReportStmt.run(nextStatus, adminNote, at, id);
      return json(res, 200, { ok: true, report: publicBugReport(getBugReportStmt.get(id)) });
    }

    if (url.pathname === '/api/health' && req.method === 'GET') {
      return json(res, 200, { ok: true, dbPath: DB_PATH, cloud: cloudStatusPayload(), now: new Date().toISOString() });
    }

    if (url.pathname === '/api/auth/google/config' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        enabled: GOOGLE_AUTH_ENABLED,
        clientId: GOOGLE_AUTH_ENABLED ? GOOGLE_CLIENT_ID : '',
        loginMode: A4_GOOGLE_ONLY ? 'google_only' : 'google_and_password',
        passwordLoginEnabled: !A4_GOOGLE_ONLY,
        personalizedEditing: A4_PERSONAL_OVERLAYS_ENABLED,
        registrationMode: GOOGLE_REGISTRATION_MODE,
        registrationOpen: GOOGLE_REGISTRATION_MODE === 'open_provisional',
      });
    }

    if (url.pathname === '/api/auth/google/challenge' && req.method === 'POST') {
      if (!GOOGLE_AUTH_ENABLED) return json(res, 503, { error: 'Google 로그인이 아직 준비되지 않았습니다.' });
      return json(res, 201, { ok: true, ...issueGoogleChallenge(req) });
    }

    if (url.pathname === '/api/auth/google/login' && req.method === 'POST') {
      if (!GOOGLE_AUTH_ENABLED) return json(res, 503, { error: 'Google 로그인이 아직 준비되지 않았습니다.' });
      enforceGoogleRateLimit(req);
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const challengeId = String(body.challengeId || '').trim();
      const challenge = googleChallenges.get(challengeId);
      googleChallenges.delete(challengeId);
      if (!challenge || challenge.expiresAt <= Date.now()) return json(res, 401, { error: 'Google 로그인 요청이 만료되었습니다. 다시 눌러주세요.' });
      const claims = await verifyGoogleIdToken(body.credential, challenge.nonce);
      const at = nowIso();
      const identity = getGoogleIdentityStmt.get(claims.googleSub);
      if (identity) {
        if (identity.revoked_at || !isActiveAccountStatus(identity.account_status)) return json(res, 403, { error: '이 Google 계정은 현재 이용할 수 없습니다.' });
        touchGoogleIdentityStmt.run(claims.email, claims.displayName || identity.google_display_name || '', at, claims.googleSub);
        const token = issueSession(identity.user_id, at);
        const row = getUserStmt.get(identity.user_id);
        recordAuthAudit('google_login', { googleSub: claims.googleSub, userId: identity.user_id, studentNo: identity.student_no });
        return json(res, 200, { ok: true, token, user: publicUser(row, token), needsRegistration: false });
      }
      if (GOOGLE_REGISTRATION_MODE !== 'open_provisional') {
        recordAuthAudit('google_registration_closed', { googleSub: claims.googleSub });
        return json(res, 403, { error: '현재 신규 Google 등록 기간이 아닙니다.', registrationClosed: true });
      }
      const onboardingToken = issueGoogleOnboarding(claims);
      recordAuthAudit('google_onboarding_started', { googleSub: claims.googleSub });
      return json(res, 200, {
        ok: true,
        needsRegistration: true,
        onboardingToken,
        googleProfile: { displayName: claims.displayName || '' },
      });
    }

    if (url.pathname === '/api/auth/google/register' && req.method === 'POST') {
      if (!GOOGLE_AUTH_ENABLED) return json(res, 503, { error: 'Google 로그인이 아직 준비되지 않았습니다.' });
      enforceGoogleRateLimit(req);
      if (GOOGLE_REGISTRATION_MODE !== 'open_provisional') return json(res, 403, { error: '현재 신규 Google 등록 기간이 아닙니다.' });
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const onboardingToken = String(body.onboardingToken || '').trim();
      const onboarding = googleOnboardingTokens.get(onboardingToken);
      if (!onboarding || onboarding.expiresAt <= Date.now()) {
        googleOnboardingTokens.delete(onboardingToken);
        return json(res, 401, { error: 'Google 등록 시간이 만료되었습니다. 다시 로그인해주세요.' });
      }
      const officialName = normalizeOfficialName(body.name || body.officialName || '');
      const studentNo = normalizeStudentNo(body.studentNo || '');
      if (officialName.length < 2) return json(res, 400, { error: '본인 이름을 2글자 이상 입력해주세요.' });
      if (!/^\d{6,12}$/.test(studentNo)) return json(res, 400, { error: '학번을 숫자로 정확히 입력해주세요.' });
      const at = nowIso();
      let userId = stableStudentUserId(studentNo);
      let row = null;
      let registrationStatus = 'provisional_active';
      try {
        db.exec('BEGIN IMMEDIATE');
        const existingIdentity = getGoogleIdentityStmt.get(onboarding.googleSub);
        if (existingIdentity) throw Object.assign(new Error('이미 등록된 Google 계정입니다. 다시 로그인해주세요.'), { statusCode: 409 });
        const studentUser = getUserByStudentNoStmt.get(studentNo);
        if (studentUser) userId = studentUser.user_id;
        const linkedToUser = getGoogleIdentityByUserStmt.get(userId);
        if (linkedToUser && linkedToUser.google_sub !== onboarding.googleSub && !linkedToUser.revoked_at) {
          throw Object.assign(new Error('이미 다른 Google 계정에 연결된 학번입니다. 관리자에게 문의해주세요.'), { statusCode: 409 });
        }
        row = getUserStmt.get(userId);
        if (!row) {
          const rec = makePasswordRecord(crypto.randomBytes(32).toString('base64url'));
          createOrUpdateStudentUserStmt.run(userId, officialName, at, at, studentNo, maskStudent(studentNo), rec.passwordHash, rec.salt, 1);
        } else {
          createOrUpdateStudentUserStmt.run(userId, officialName, row.created_at || at, at, studentNo, maskStudent(studentNo), row.password_hash, row.password_salt, row.password_changed || 1);
        }
        row = getUserStmt.get(userId);
        const googleProfile = googleRegistrationProfile(row, officialName);
        registrationStatus = googleProfile.registrationStatus;
        setGoogleUserStmt.run(googleProfile.nickname, officialName, googleProfile.accountStatus, googleProfile.a4Role, at, userId);
        insertGoogleIdentityStmt.run(onboarding.googleSub, userId, onboarding.email, 1, onboarding.displayName || '', at, at);
        insertGoogleRegistrationStmt.run(crypto.randomUUID(), onboarding.googleSub, userId, studentNo, officialName, officialName, registrationStatus, at, at);
        deleteUserSessionsStmt.run(userId);
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        if (error?.statusCode) throw error;
        if (/UNIQUE|constraint/i.test(String(error?.message || error))) {
          throw Object.assign(new Error('이미 등록된 Google 계정 또는 학번입니다. 관리자에게 문의해주세요.'), { statusCode: 409 });
        }
        throw error;
      }
      googleOnboardingTokens.delete(onboardingToken);
      const token = issueSession(userId, at);
      row = getUserStmt.get(userId);
      recordAuthAudit('google_registration_completed', { googleSub: onboarding.googleSub, userId, studentNo, detail: { status: registrationStatus } });
      return json(res, 201, { ok: true, token, user: publicUser(row, token), provisional: registrationStatus === 'provisional_active' });
    }

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const studentNo = normalizeStudentNo(body.studentNo || '');
      if (A4_GOOGLE_ONLY && studentNo) {
        return json(res, 410, { error: '학번·비밀번호 로그인은 종료되었습니다. Google 계정으로 로그인해주세요.', googleOnly: true });
      }
      if (A4_GOOGLE_ONLY && !isLoopbackRequest(req)) {
        return json(res, 410, { error: '이제 Google 계정으로만 로그인할 수 있습니다.', googleOnly: true });
      }
      const nickname = normalizeNickname(body.nickname || body.name || (studentNo ? maskStudent(studentNo) : ''));
      if (!nickname && !studentNo) return json(res, 400, { error: 'nickname or studentNo required' });
      const at = nowIso();
      let userRow = null;
      let userId = studentNo ? stableStudentUserId(studentNo) : stableUserId(nickname);
      const displayName = nickname || maskStudent(studentNo) || userId;

      if (studentNo) {
        userRow = getUserStmt.get(userId);
        if (userRow?.auth_provider === 'google') return json(res, 409, { error: '이 학번은 Google 계정으로 로그인해주세요.' });
        if (userRow && !isActiveAccountStatus(userRow.account_status)) return json(res, 403, { error: '이 계정은 현재 이용할 수 없습니다.' });
        if (!userRow) {
          if (String(body.password || '') !== INITIAL_STUDENT_PASSWORD) return json(res, 401, { error: '처음 비밀번호는 cnu2026입니다.' });
          const rec = makePasswordRecord(INITIAL_STUDENT_PASSWORD);
          createOrUpdateStudentUserStmt.run(userId, displayName, at, at, studentNo, maskStudent(studentNo), rec.passwordHash, rec.salt, 0);
          userRow = getUserStmt.get(userId);
        } else if (!userRow.password_hash || !userRow.password_salt) {
          if (String(body.password || '') !== INITIAL_STUDENT_PASSWORD) return json(res, 401, { error: '처음 비밀번호는 cnu2026입니다.' });
          const rec = makePasswordRecord(INITIAL_STUDENT_PASSWORD);
          setUserPasswordStmt.run(rec.passwordHash, rec.salt, 0, at, userId);
          createOrUpdateStudentUserStmt.run(userId, displayName, at, at, studentNo, maskStudent(studentNo), rec.passwordHash, rec.salt, 0);
          userRow = getUserStmt.get(userId);
        } else if (!verifyPassword(body.password, userRow)) {
          return json(res, 401, { error: '비밀번호가 맞지 않습니다.' });
        } else {
          createOrUpdateStudentUserStmt.run(userId, userRow.nickname || displayName, at, at, studentNo, maskStudent(studentNo), userRow.password_hash, userRow.password_salt, userRow.password_changed || 0);
          userRow = getUserStmt.get(userId);
        }
      } else {
        if (!SHARED_PASSWORD) return json(res, 503, { error: 'server password is not configured' });
        if (!timingSafePassword(body.password)) return json(res, 401, { error: 'wrong password' });
        upsertUserStmt.run(userId, displayName, at, at, null, null, null, null, 1);
        userRow = getUserStmt.get(userId);
      }

      const token = issueSession(userId, at);
      return json(res, 200, {
        ok: true,
        token,
        user: publicUser(userRow, token),
        mustChangePassword: userRow.password_changed === 0,
        boardUserId: DEFAULT_USER_ID,
      });
    }

    if (url.pathname === '/api/me' && req.method === 'GET') {
      const auth = requireAuth(req, url);
      return json(res, 200, { ok: true, user: { id: auth.userId, userId: auth.userId, nickname: auth.nickname, studentMasked: auth.studentMasked || undefined, officialName: auth.officialName || undefined, authProvider: auth.authProvider, accountStatus: auth.accountStatus, a4Role: auth.a4Role, mustChangePassword: auth.mustChangePassword, recoverySchoolSet: auth.recoverySchoolSet, cloudTf: isCloudTf(auth), bugReportAdmin: isBugReportAdmin(auth) } });
    }

    if (url.pathname === '/api/recovery-school' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      if (A4_GOOGLE_ONLY && auth.authProvider === 'google') return json(res, 410, { error: 'Google 로그인 계정에는 비밀번호 찾기 설정이 필요하지 않습니다.', googleOnly: true });
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const at = nowIso();
      const currentRow = getUserStmt.get(auth.userId);
      const row = setRecoverySchoolForUser(currentRow, body.recoverySchool || body.school || body.elementarySchool || '', at);
      return json(res, 200, { ok: true, user: publicUser(row, bearerToken(req, url), { mustChangePassword: auth.mustChangePassword, recoverySchoolSet: true }) });
    }

    if (url.pathname === '/api/reset-password' && req.method === 'POST') {
      if (A4_GOOGLE_ONLY) return json(res, 410, { error: '학번 비밀번호는 더 이상 사용하지 않습니다. Google 계정으로 로그인해주세요.', googleOnly: true });
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const studentNo = normalizeStudentNo(body.studentNo || '');
      const newPassword = String(body.newPassword || body.password || '');
      if (!studentNo) return json(res, 400, { error: '학번을 입력해주세요.' });
      if (newPassword.length < 4) return json(res, 400, { error: '새 비밀번호는 4자 이상으로 해주세요.' });
      if (newPassword === INITIAL_STUDENT_PASSWORD) return json(res, 400, { error: '초기 비밀번호 cnu2026 말고 개인 비밀번호로 바꿔주세요.' });
      const userId = stableStudentUserId(studentNo);
      let row = getUserStmt.get(userId);
      if (!row) return json(res, 404, { error: '해당 학번 계정을 찾지 못했습니다.' });
      if (!row.recovery_school_hash || !row.recovery_school_salt) return json(res, 400, { error: '이 계정에는 아직 출신 초등학교 정보가 등록되어 있지 않습니다.' });
      if (!verifyRecoverySchool(body.recoverySchool || body.school || body.elementarySchool || '', row)) return json(res, 401, { error: '학번 또는 출신 초등학교가 맞지 않습니다.' });
      const at = nowIso();
      const rec = makePasswordRecord(newPassword);
      setUserPasswordStmt.run(rec.passwordHash, rec.salt, 1, at, userId);
      deleteUserSessionsStmt.run(userId);
      const token = issueSession(userId, at);
      row = getUserStmt.get(userId);
      return json(res, 200, { ok: true, token, user: publicUser(row, token, { mustChangePassword: false, recoverySchoolSet: true }) });
    }

    if (url.pathname === '/api/change-password' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      if (A4_GOOGLE_ONLY && auth.authProvider === 'google') return json(res, 410, { error: 'Google 로그인 계정은 이 사이트의 별도 비밀번호를 사용하지 않습니다.', googleOnly: true });
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const newPassword = String(body.newPassword || body.password || '');
      if (newPassword.length < 4) return json(res, 400, { error: '비밀번호는 4자 이상으로 해주세요.' });
      if (newPassword === INITIAL_STUDENT_PASSWORD) return json(res, 400, { error: '초기 비밀번호 cnu2026 말고 개인 비밀번호로 바꿔주세요.' });
      const at = nowIso();
      const rec = makePasswordRecord(newPassword);
      setUserPasswordStmt.run(rec.passwordHash, rec.salt, 1, at, auth.userId);
      let row = getUserStmt.get(auth.userId);
      const recoverySchool = body.recoverySchool || body.school || body.elementarySchool || '';
      if (String(recoverySchool || '').trim()) row = setRecoverySchoolForUser(row, recoverySchool, at);
      return json(res, 200, { ok: true, user: publicUser(row, bearerToken(req, url), { mustChangePassword: false }) });
    }

    if (url.pathname === '/api/state' && req.method === 'GET') {
      const auth = requireAuth(req, url);
      const userId = safeUserId(url);
      const payload = stateRowPayloadForUser(userId, auth.userId);
      return jsonRaw(res, payload.status, payload.body);
    }

    if (url.pathname === '/api/export' && req.method === 'GET') {
      const auth = requireAuth(req, url);
      const userId = safeUserId(url);
      const payload = stateRowPayloadForUser(userId, auth.userId);
      return jsonRaw(res, payload.status, payload.body);
    }

    if (url.pathname === '/api/presence' && req.method === 'GET') {
      requireAuth(req, url);
      const userId = safeUserId(url);
      return json(res, 200, { users: activePresence(userId) });
    }

    if (url.pathname === '/api/presence' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const boardUserId = body.user_id || body.userId || DEFAULT_USER_ID;
      const at = nowIso();
      const status = body.status === 'idle' ? 'idle' : (body.status || 'editing');
      const clientSessionId = presenceClientSessionId(body.client_session_id ?? body.clientSessionId ?? body.tab_session_id ?? body.tabSessionId);
      upsertPresenceStmt.run(
        boardUserId,
        auth.userId,
        clientSessionId,
        normalizeNickname(body.nickname || body.name || auth.nickname),
        body.cc_id == null && body.ccId == null ? null : String(body.cc_id ?? body.ccId),
        body.field_key == null && body.fieldKey == null ? null : String(body.field_key ?? body.fieldKey),
        status,
        at
      );
      const event = { users: activePresence(boardUserId), changed: { user_id: auth.userId, client_session_id: clientSessionId, nickname: normalizeNickname(body.nickname || body.name || auth.nickname), status, cc_id: body.cc_id == null && body.ccId == null ? null : String(body.cc_id ?? body.ccId), field_key: body.field_key == null && body.fieldKey == null ? null : String(body.field_key ?? body.fieldKey), updated_at: at } };
      broadcast(boardUserId, 'presence', event);
      return json(res, 200, { ok: true, ...event.changed });
    }

    if (url.pathname === '/api/events' && req.method === 'GET') {
      const auth = requireAuth(req, url);
      return addSseClient(safeUserId(url), auth, res);
    }

    if (url.pathname === '/api/doc' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const userId = body.user_id || body.userId || DEFAULT_USER_ID;
      const docId = String(body.doc_id ?? body.docId ?? '').trim();
      if (!docId) return json(res, 400, { error: 'doc_id required' });
      const nextText = String(body.text ?? body.doc_text ?? body.docText ?? '');
      const baseText = String(body.base_text ?? body.baseText ?? '');
      const clientSessionId = normalizeClientSessionId(body.client_session_id ?? body.clientSessionId ?? body.save_event?.clientSessionId ?? body.saveEvent?.clientSessionId);
      const baseOverlayUpdatedAt = String(body.base_overlay_updated_at ?? body.baseOverlayUpdatedAt ?? '').trim();
      const personalized = isPersonalizedA4Board(userId);
      if (!personalized) {
        const blockers = docEditBlockers(userId, docId, auth.userId);
        if (blockers.length && !body.force) return lockedDocResponse(res, blockers);
      }
      const masterRow = getStateStmt.get(userId);
      if (!masterRow) return json(res, 404, { error: 'state not found', user_id: userId });
      let state = null;
      try {
        const masterState = JSON.parse(masterRow.state_json);
        state = personalized
          ? applyPersonalOverlay(masterState, personalOverlayFromRow(getPersonalOverlayStmt.get(userId, auth.userId)))
          : masterState;
      } catch {
        return json(res, 500, { error: 'stored state_json is not valid JSON' });
      }
      if (!state || typeof state !== 'object') return json(res, 500, { error: 'stored state_json object required' });
      if (A4_USER_IDS.has(userId) && auth.mustChangePassword) {
        return json(res, 403, { error: 'password change required before saving' });
      }
      const stateVersion = body.state_version || body.stateVersion || state.stateVersion || masterRow.state_version || 'cpx-a4-state.v2';
      if (A4_STRICT_CLIENT_BUILD && A4_REQUIRED_CLIENT_BUILD && A4_USER_IDS.has(userId) && stateVersion === 'cpx-a4-state.v2' && body.client_build !== A4_REQUIRED_CLIENT_BUILD && body.clientBuild !== A4_REQUIRED_CLIENT_BUILD) {
        return json(res, 409, { error: 'client update required; reload the Vercel CPX editor', required_client_build: A4_REQUIRED_CLIENT_BUILD });
      }
      state.docs = state.docs && typeof state.docs === 'object' ? state.docs : {};
      state.settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
      state.settings.docMeta = state.settings.docMeta && typeof state.settings.docMeta === 'object' ? state.settings.docMeta : {};
      const remoteText = String(state.docs[docId] ?? '');
      const merged = mergeDocText(baseText, nextText, remoteText);
      if (!merged.ok) {
        return json(res, 409, {
          error: '동시 수정이 있어 자동 병합하지 않았습니다. 최신 원문을 확인한 뒤 다시 저장해주세요.',
          current_text: remoteText,
          merge_mode: merged.mode,
          doc_id: docId,
        });
      }
      const updatedAt = body.updated_at || body.updatedAt || nowIso();
      const updatedBy = body.updated_by || body.updatedBy || auth.nickname || null;
      const oldVer = Number(state.settings.docMeta?.[docId]?.version || 0) || 0;
      state.docs[docId] = merged.text;
      state.settings.docMeta[docId] = {
        ...(state.settings.docMeta[docId] || {}),
        version: oldVer + 1,
        updatedAt,
        updatedBy,
        updatedById: auth.userId,
        patchMode: merged.mode,
      };
      const saveEvent = body.save_event || body.saveEvent || {};
      state.saveEvent = {
        id: saveEvent.id || `${updatedAt}-${Math.random().toString(36).slice(2, 8)}`,
        docId,
        updatedAt,
        updatedBy,
        actorId: auth.userId,
        deviceId: saveEvent.deviceId || saveEvent.device_id || null,
        clientSessionId,
        scope: 'doc_patch',
        mergeMode: merged.mode,
      };
      state.updatedAt = updatedAt;
      state.updatedBy = updatedBy;
      state.updatedByUserId = auth.userId;
      state.stateVersion = stateVersion;
      state.clientBuild = body.client_build || body.clientBuild || state.clientBuild;
      const stateText = JSON.stringify(state);
      if (personalized) {
        const saved = savePersonalOverlay(userId, auth, masterRow, state, {
          updatedAt,
          updatedBy,
          stateVersion,
          saveEvent: state.saveEvent,
          clientBuild: state.clientBuild,
          clientSessionId,
          baseOverlayUpdatedAt,
          force: !!body.force,
        });
        const event = { user_id: userId, state_version: stateVersion, updated_by: updatedBy, updated_by_user_id: auth.userId, updated_by_session_id: clientSessionId || null, updated_at: updatedAt, doc_id: docId, scope: 'personal_doc_patch', merge_mode: merged.mode, personalized: true, audience_user_id: auth.userId };
        broadcast(userId, 'state', event);
        return json(res, 200, {
          ok: true,
          ...event,
          text: merged.text,
          doc_meta: state.settings.docMeta[docId],
          save_event_id: state.saveEvent.id,
          history_saved: false,
          personal_overlay: { ...saved.summary, updatedAt: saved.updatedAt },
          op_count: merged.opCount || 0,
        });
      }
      upsertStateStmt.run(userId, stateText, stateVersion, updatedBy, updatedAt);
      clearStateResponseCache(userId);
      const event = { user_id: userId, state_version: stateVersion, updated_by: updatedBy, updated_by_user_id: auth.userId, updated_at: updatedAt, doc_id: docId, scope: 'doc_patch', merge_mode: merged.mode };
      broadcast(userId, 'state', event);
      return json(res, 200, {
        ok: true,
        ...event,
        text: merged.text,
        doc_meta: state.settings.docMeta[docId],
        save_event_id: state.saveEvent.id,
        history_saved: false,
        op_count: merged.opCount || 0,
      });
    }

    if (url.pathname === '/api/state' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const userId = body.user_id || body.userId || DEFAULT_USER_ID;
      const state = body.state_json ?? body.state ?? null;
      if (!state || typeof state !== 'object') return json(res, 400, { error: 'state_json object required' });
      const updatedAt = body.updated_at || state.updatedAt || new Date().toISOString();
      const updatedBy = body.updated_by || state.updatedBy || auth.nickname || null;
      const stateVersion = body.state_version || body.stateVersion || state.stateVersion || 'cpx-script-board.local.v1';
      const clientSessionId = normalizeClientSessionId(body.client_session_id ?? body.clientSessionId ?? state.saveEvent?.clientSessionId ?? state.saveEvent?.client_session_id);
      const baseOverlayUpdatedAt = String(body.base_overlay_updated_at ?? body.baseOverlayUpdatedAt ?? '').trim();
      const eventDocId = state?.saveEvent?.docId == null ? '' : String(state.saveEvent.docId);
      const personalized = isPersonalizedA4Board(userId);
      if (eventDocId && !personalized) {
        const blockers = docEditBlockers(userId, eventDocId, auth.userId);
        if (blockers.length && !body.force) return lockedDocResponse(res, blockers);
      }
      if (A4_USER_IDS.has(userId) && auth.mustChangePassword) {
        return json(res, 403, { error: 'password change required before saving' });
      }
      if (A4_STRICT_CLIENT_BUILD && A4_REQUIRED_CLIENT_BUILD && A4_USER_IDS.has(userId) && stateVersion === 'cpx-a4-state.v2' && state.clientBuild !== A4_REQUIRED_CLIENT_BUILD) {
        return json(res, 409, { error: 'client update required; reload the Vercel CPX editor', required_client_build: A4_REQUIRED_CLIENT_BUILD });
      }
      if (personalized) {
        const masterRow = getStateStmt.get(userId);
        if (!masterRow) return json(res, 404, { error: 'state not found', user_id: userId });
        const masterState = parseJsonObject(masterRow.state_json, 'stored state_json');
        a4PersonalStateShapeGuard(masterState, state);
        if (state.saveEvent && typeof state.saveEvent === 'object') state.saveEvent.clientSessionId = state.saveEvent.clientSessionId || clientSessionId || null;
        const ownProfile = state?.settings?.profiles?.[auth.userId];
        const ownNickname = normalizeNickname(ownProfile?.nickname || '');
        if (ownNickname && ownNickname !== auth.nickname) setUserNicknameStmt.run(ownNickname, updatedAt, auth.userId);

        state.updatedBy = updatedBy;
        state.updatedByUserId = auth.userId;
        const shared = mergeA4SharedState(masterState, state, updatedAt, updatedBy);
        shared.state.updatedByUserId = auth.userId;
        let effectiveMasterRow = masterRow;
        let historySaved = false;
        let historyKind = 'skipped';
        let historyPrune = { deleted: 0, kept: 0 };
        if (shared.changed) {
          const sharedText = JSON.stringify(shared.state);
          a4StateLossGuard(userId, shared.state, sharedText, masterRow);
          upsertStateStmt.run(userId, sharedText, stateVersion, updatedBy, updatedAt);
          const nowMs = Date.now();
          historyKind = historyKindFromBody(body);
          historySaved = shouldInsertStateHistory(userId, body, nowMs);
          if (historySaved) insertHistoryStmt.run(userId, sharedText, stateVersion, updatedBy, updatedAt, historyKind);
          historyPrune = pruneAutoStateHistory(userId, nowMs);
          effectiveMasterRow = { ...masterRow, state_json: sharedText, state_version: stateVersion, updated_by: updatedBy, updated_at: updatedAt };
        }
        const saved = savePersonalOverlay(userId, auth, effectiveMasterRow, state, {
          updatedAt,
          updatedBy,
          stateVersion,
          saveEvent: state.saveEvent,
          clientBuild: state.clientBuild,
          clientSessionId,
          baseOverlayUpdatedAt,
          force: !!body.force,
        });
        const event = {
          user_id: userId,
          state_version: stateVersion,
          updated_by: updatedBy,
          updated_by_user_id: auth.userId,
          updated_by_session_id: clientSessionId || null,
          updated_at: updatedAt,
          scope: 'personal_state',
          personalized: true,
          shared_changed: shared.changed,
          ...(shared.changed ? {} : { audience_user_id: auth.userId }),
        };
        broadcast(userId, 'state', event);
        return json(res, 200, {
          ok: true,
          ...event,
          personal_overlay: { ...saved.summary, updatedAt: saved.updatedAt },
          history_saved: historySaved,
          history_kind: historySaved ? historyKind : 'skipped',
          history_prune: historyPrune,
        });
      }
      preserveNewestProfiles(userId, state);
      const ownProfile = state?.settings?.profiles?.[auth.userId];
      const ownNickname = normalizeNickname(ownProfile?.nickname || '');
      if (ownNickname && ownNickname !== auth.nickname) setUserNicknameStmt.run(ownNickname, updatedAt, auth.userId);
      state.updatedBy = updatedBy;
      state.updatedByUserId = auth.userId;
      const stateText = JSON.stringify(state);
      a4StateLossGuard(userId, state, stateText, getStateStmt.get(userId));
      upsertStateStmt.run(userId, stateText, stateVersion, updatedBy, updatedAt);
      clearStateResponseCache(userId);
      const nowMs = Date.now();
      const historyKind = historyKindFromBody(body);
      const historySaved = shouldInsertStateHistory(userId, body, nowMs);
      if (historySaved) insertHistoryStmt.run(userId, stateText, stateVersion, updatedBy, updatedAt, historyKind);
      const historyPrune = pruneAutoStateHistory(userId, nowMs);
      const event = { user_id: userId, state_version: stateVersion, updated_by: updatedBy, updated_by_user_id: auth.userId, updated_at: updatedAt };
      broadcast(userId, 'state', event);
      return json(res, 200, { ok: true, ...event, history_saved: historySaved, history_kind: historySaved ? historyKind : 'skipped', history_prune: historyPrune });
    }

    return serveStatic(req, res, url);
  } catch (err) {
    const status = err.statusCode || 500;
    return json(res, status, { error: err.message || String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CPX local DB server running: http://${HOST}:${PORT}/`);
  console.log(`SQLite DB: ${DB_PATH}`);
});
