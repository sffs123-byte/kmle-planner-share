#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const BOARD_ID = 'gangryeol-cpx-a4-editor-reset-20260515';

function tokenHash(token) {
  return crypto.createHash('sha256').update(`cpx-session:${token}`).digest('hex');
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function request(port, pathname, { method = 'GET', token = '', body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        host: 'editor.example',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch {}
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.once('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForServer(port, child) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode != null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      const response = await request(port, '/api/health');
      if (response.status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('test server did not become healthy');
}

function seed(dbPath) {
  const db = new DatabaseSync(dbPath);
  const at = '2026-07-11T00:00:00.000Z';
  const master = {
    docs: { '48': 'master-48' },
    settings: { docMeta: {}, tableStyles: {}, imageAssets: {}, profiles: {}, communityPosts: {}, comments: {} },
    updatedAt: at,
    updatedBy: 'master',
    stateVersion: 'cpx-a4-state.v2',
    clientBuild: 'test-build',
  };
  db.prepare('INSERT INTO board_state (user_id, state_json, state_version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(BOARD_ID, JSON.stringify(master), 'cpx-a4-state.v2', 'master', at);
  const addUser = db.prepare(`
    INSERT INTO users (user_id, nickname, created_at, last_seen_at, student_no, student_masked, password_changed, auth_provider, account_status, a4_role)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'google', 'provisional_active', 'student')
  `);
  addUser.run('google-a', 'User A', at, at, '20200001', '2020****');
  addUser.run('google-b', 'User B', at, at, '20200002', '2020****');
  const tokens = { a: 'tab-test-google-a', b: 'tab-test-google-b' };
  const addSession = db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)');
  addSession.run(tokenHash(tokens.a), 'google-a', at, at);
  addSession.run(tokenHash(tokens.b), 'google-b', at, at);
  db.close();
  return { tokens, master };
}

function docBody(text, baseText, tab, updatedAt, baseOverlayUpdatedAt = '') {
  return {
    user_id: BOARD_ID,
    doc_id: '48',
    text,
    base_text: baseText,
    state_version: 'cpx-a4-state.v2',
    client_build: 'test-build',
    client_session_id: tab,
    base_overlay_updated_at: baseOverlayUpdatedAt,
    updated_at: updatedAt,
    updated_by: 'User A',
    save_event: { id: `${tab}-${updatedAt}`, docId: '48', clientSessionId: tab },
  };
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpx-tab-guard-test-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  const port = await reservePort();
  const logs = [];
  const child = spawn(process.execPath, [path.join(ROOT, 'cpx-local-server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      CPX_DB_PATH: dbPath,
      CPX_GOOGLE_AUTH_ENABLED: '0',
      CPX_A4_GOOGLE_ONLY: '1',
      CPX_A4_PERSONAL_OVERLAYS_ENABLED: '1',
      CPX_A4_STRICT_CLIENT_BUILD: '0',
      CPX_STATE_HISTORY_MIN_INTERVAL_MS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => logs.push(chunk.toString('utf8')));
  child.stderr.on('data', chunk => logs.push(chunk.toString('utf8')));

  try {
    await waitForServer(port, child);
    const { tokens, master } = seed(dbPath);

    const firstText = '첫 줄<br>둘째 줄';
    const first = await request(port, '/api/doc', {
      method: 'POST', token: tokens.a,
      body: docBody(firstText, master.docs['48'], 'tab-a', '2026-07-11T00:01:00.000Z'),
    });
    assert.equal(first.status, 200, first.text);
    assert.equal(first.json.personalized, true);

    const secondText = `${firstText}<br>셋째 줄`;
    const sameTab = await request(port, '/api/doc', {
      method: 'POST', token: tokens.a,
      body: docBody(secondText, firstText, 'tab-a', '2026-07-11T00:02:00.000Z'),
    });
    assert.equal(sameTab.status, 200, sameTab.text);

    let db = new DatabaseSync(dbPath, { readOnly: true });
    const current = db.prepare('SELECT updated_at, client_session_id FROM a4_personal_overlays WHERE board_user_id = ? AND user_id = ?')
      .get(BOARD_ID, 'google-a');
    db.close();
    assert.equal(current.updated_at, '2026-07-11T00:02:00.000Z');
    assert.equal(current.client_session_id, 'tab-a');

    const staleTab = await request(port, '/api/doc', {
      method: 'POST', token: tokens.a,
      body: docBody(`${secondText}<br>stale`, secondText, 'tab-b', '2026-07-11T00:03:00.000Z', '2026-07-11T00:01:00.000Z'),
    });
    assert.equal(staleTab.status, 409, staleTab.text);
    assert.match(staleTab.json.error, /다른 탭/);

    const finalText = `${secondText}<br>새 탭 확인 저장`;
    const freshTab = await request(port, '/api/doc', {
      method: 'POST', token: tokens.a,
      body: docBody(finalText, secondText, 'tab-b', '2026-07-11T00:04:00.000Z', current.updated_at),
    });
    assert.equal(freshTab.status, 200, freshTab.text);

    await request(port, '/api/presence', {
      method: 'POST', token: tokens.a,
      body: { user_id: BOARD_ID, client_session_id: 'tab-a', cc_id: '48', field_key: 'source', status: 'editing', nickname: 'User A' },
    });
    await request(port, '/api/presence', {
      method: 'POST', token: tokens.a,
      body: { user_id: BOARD_ID, client_session_id: 'tab-b', cc_id: '48', field_key: null, status: 'viewing', nickname: 'User A' },
    });
    const presence = await request(port, `/api/presence?user_id=${encodeURIComponent(BOARD_ID)}`, { token: tokens.a });
    assert.equal(presence.status, 200, presence.text);
    assert.deepEqual(new Set(presence.json.users.map(user => user.client_session_id)), new Set(['tab-a', 'tab-b']));

    const own = await request(port, `/api/state?user_id=${encodeURIComponent(BOARD_ID)}`, { token: tokens.a });
    const other = await request(port, `/api/state?user_id=${encodeURIComponent(BOARD_ID)}`, { token: tokens.b });
    assert.equal(own.status, 200, own.text);
    assert.equal(other.status, 200, other.text);
    assert.equal(own.json.state_json.docs['48'], finalText);
    assert.equal(other.json.state_json.docs['48'], master.docs['48']);

    db = new DatabaseSync(dbPath, { readOnly: true });
    const masterReadback = JSON.parse(db.prepare('SELECT state_json FROM board_state WHERE user_id = ?').get(BOARD_ID).state_json);
    db.close();
    assert.equal(masterReadback.docs['48'], master.docs['48']);
    console.log(JSON.stringify({
      ok: true,
      sameTabAllowed: true,
      staleTabStatus: staleTab.status,
      freshBaseAccepted: true,
      presenceTabs: presence.json.users.length,
      brReadback: (own.json.state_json.docs['48'].match(/<br>/g) || []).length,
      masterUnchanged: true,
    }, null, 2));
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode != null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 1000).unref();
    });
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
