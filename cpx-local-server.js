#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || process.env.CPX_LOCAL_PORT || 8787);
const HOST = process.env.HOST || process.env.CPX_LOCAL_HOST || '127.0.0.1';
const DB_PATH = process.env.CPX_DB_PATH || path.join(ROOT, '.local', 'cpx-local.sqlite');
const DEFAULT_USER_ID = 'gangryeol-cpx-scripts';
const SHARED_PASSWORD = process.env.CPX_BOARD_PASSWORD || process.env.CPX_LOCAL_PASSWORD || '';
const INITIAL_STUDENT_PASSWORD = process.env.CPX_INITIAL_PASSWORD || 'cnu2026';
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const PRESENCE_TTL_MS = 30_000;
const A4_USER_ID = 'gangryeol-cpx-a4-editor';
const A4_REQUIRED_CLIENT_BUILD = process.env.CPX_A4_REQUIRED_CLIENT_BUILD || 'a4-localdb-authfix-20260512-1658';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
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
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_no ON users(student_no) WHERE student_no IS NOT NULL');

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
  INSERT INTO state_history (user_id, state_json, state_version, updated_by, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);
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
const getUserStmt = db.prepare('SELECT user_id, nickname, student_no, student_masked, password_hash, password_salt, password_changed FROM users WHERE user_id = ?');
const setUserPasswordStmt = db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, password_changed = ?, last_seen_at = ? WHERE user_id = ?');
const insertSessionStmt = db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)');
const getSessionStmt = db.prepare(`
  SELECT sessions.token_hash, users.user_id, users.nickname, users.student_masked, users.password_changed
  FROM sessions JOIN users ON users.user_id = sessions.user_id
  WHERE sessions.token_hash = ?
`);
const touchSessionStmt = db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?');
const touchUserStmt = db.prepare('UPDATE users SET last_seen_at = ? WHERE user_id = ?');
const upsertPresenceStmt = db.prepare(`
  INSERT INTO presence (board_user_id, user_id, nickname, cc_id, field_key, status, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(board_user_id, user_id) DO UPDATE SET
    nickname = excluded.nickname,
    cc_id = excluded.cc_id,
    field_key = excluded.field_key,
    status = excluded.status,
    updated_at = excluded.updated_at
`);
const listPresenceStmt = db.prepare(`
  SELECT board_user_id, user_id, nickname, cc_id, field_key, status, updated_at
  FROM presence
  WHERE board_user_id = ? AND status != 'idle' AND updated_at >= ?
  ORDER BY updated_at DESC
`);
const prunePresenceStmt = db.prepare('DELETE FROM presence WHERE updated_at < ? OR status = \'idle\'');

const clientsByUser = new Map();

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
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
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeUserId(url) {
  return url.searchParams.get('user_id') || url.searchParams.get('userId') || DEFAULT_USER_ID;
}

function nowIso() { return new Date().toISOString(); }

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function tokenHash(token) { return hash(`cpx-session:${token}`); }

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

function normalizeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 32);
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

function requireAuth(req, url) {
  const token = bearerToken(req, url);
  if (!token) throw Object.assign(new Error('login required'), { statusCode: 401 });
  const th = tokenHash(token);
  const row = getSessionStmt.get(th);
  if (!row) throw Object.assign(new Error('invalid session'), { statusCode: 401 });
  const at = nowIso();
  touchSessionStmt.run(at, th);
  touchUserStmt.run(at, row.user_id);
  return { userId: row.user_id, nickname: row.nickname, studentMasked: row.student_masked, passwordChanged: !!row.password_changed, mustChangePassword: row.password_changed === 0, tokenHash: th };
}

function publicUser(row, token, extra = {}) {
  return {
    id: row.user_id,
    userId: row.user_id,
    nickname: row.nickname,
    studentMasked: row.student_masked || undefined,
    token,
    mustChangePassword: row.password_changed === 0,
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
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    });
    res.end();
    return;
  }

  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      return json(res, 200, { ok: true, dbPath: DB_PATH, now: new Date().toISOString() });
    }

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const studentNo = normalizeStudentNo(body.studentNo || '');
      const nickname = normalizeNickname(body.nickname || body.name || (studentNo ? maskStudent(studentNo) : ''));
      if (!nickname && !studentNo) return json(res, 400, { error: 'nickname or studentNo required' });
      const at = nowIso();
      let userRow = null;
      let userId = studentNo ? stableStudentUserId(studentNo) : stableUserId(nickname);
      const displayName = nickname || maskStudent(studentNo) || userId;

      if (studentNo) {
        userRow = getUserStmt.get(userId);
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

      const token = crypto.randomBytes(32).toString('base64url');
      insertSessionStmt.run(tokenHash(token), userId, at, at);
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
      return json(res, 200, { ok: true, user: { id: auth.userId, userId: auth.userId, nickname: auth.nickname, studentMasked: auth.studentMasked || undefined, mustChangePassword: auth.mustChangePassword } });
    }

    if (url.pathname === '/api/change-password' && req.method === 'POST') {
      const auth = requireAuth(req, url);
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const newPassword = String(body.newPassword || body.password || '');
      if (newPassword.length < 4) return json(res, 400, { error: '비밀번호는 4자 이상으로 해주세요.' });
      if (newPassword === INITIAL_STUDENT_PASSWORD) return json(res, 400, { error: '초기 비밀번호 cnu2026 말고 개인 비밀번호로 바꿔주세요.' });
      const at = nowIso();
      const rec = makePasswordRecord(newPassword);
      setUserPasswordStmt.run(rec.passwordHash, rec.salt, 1, at, auth.userId);
      const row = getUserStmt.get(auth.userId);
      return json(res, 200, { ok: true, user: publicUser(row, bearerToken(req, url), { mustChangePassword: false }) });
    }

    if (url.pathname === '/api/state' && req.method === 'GET') {
      requireAuth(req, url);
      const userId = safeUserId(url);
      const row = getStateStmt.get(userId);
      return json(res, 200, publicRow(row));
    }

    if (url.pathname === '/api/export' && req.method === 'GET') {
      requireAuth(req, url);
      const userId = safeUserId(url);
      const row = getStateStmt.get(userId);
      return json(res, row ? 200 : 404, row ? publicRow(row) : { error: 'state not found', user_id: userId });
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
      upsertPresenceStmt.run(
        boardUserId,
        auth.userId,
        normalizeNickname(body.nickname || body.name || auth.nickname),
        body.cc_id == null && body.ccId == null ? null : String(body.cc_id ?? body.ccId),
        body.field_key == null && body.fieldKey == null ? null : String(body.field_key ?? body.fieldKey),
        status,
        at
      );
      const event = { users: activePresence(boardUserId), changed: { user_id: auth.userId, nickname: normalizeNickname(body.nickname || body.name || auth.nickname), status, cc_id: body.cc_id == null && body.ccId == null ? null : String(body.cc_id ?? body.ccId), field_key: body.field_key == null && body.fieldKey == null ? null : String(body.field_key ?? body.fieldKey), updated_at: at } };
      broadcast(boardUserId, 'presence', event);
      return json(res, 200, { ok: true, ...event.changed });
    }

    if (url.pathname === '/api/events' && req.method === 'GET') {
      const auth = requireAuth(req, url);
      return addSseClient(safeUserId(url), auth, res);
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
      if (userId === A4_USER_ID && auth.mustChangePassword) {
        return json(res, 403, { error: 'password change required before saving' });
      }
      if (userId === A4_USER_ID && stateVersion === 'cpx-a4-state.v2' && state.clientBuild !== A4_REQUIRED_CLIENT_BUILD) {
        return json(res, 409, { error: 'client update required; reload the Vercel CPX editor', required_client_build: A4_REQUIRED_CLIENT_BUILD });
      }
      state.updatedBy = updatedBy;
      state.updatedByUserId = auth.userId;
      const stateText = JSON.stringify(state);
      upsertStateStmt.run(userId, stateText, stateVersion, updatedBy, updatedAt);
      insertHistoryStmt.run(userId, stateText, stateVersion, updatedBy, updatedAt);
      const event = { user_id: userId, state_version: stateVersion, updated_by: updatedBy, updated_by_user_id: auth.userId, updated_at: updatedAt };
      broadcast(userId, 'state', event);
      return json(res, 200, { ok: true, ...event });
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
