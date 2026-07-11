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

function request(port, pathname, { method = 'GET', token = '', body = null, host = 'editor.example', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        host,
        ...headers,
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
      const result = await request(port, '/api/health');
      if (result.status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('test server did not become healthy');
}

function seedDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  const at = '2026-07-11T00:00:00.000Z';
  const docs = {};
  for (let i = 1; i <= 72; i++) docs[String(i)] = `master-${i}`;
  docs['5'] = 'master-5 long-form CPX document\n'.repeat(80);
  const productionSizedAsset = {
    id: 'production-size-fixture',
    name: 'production-size-fixture.png',
    w: 1200,
    h: 800,
    bytes: 27 * 1024 * 1024,
    dataUrl: `data:image/png;base64,${'A'.repeat(27 * 1024 * 1024)}`,
  };
  const master = {
    docs,
    settings: {
      '1:page:0': { fontSize: 10 },
      tableStyles: { master: { width: 100 } },
      imageAssets: { 'production-size-fixture': productionSizedAsset },
      flowAssets: {},
      docMeta: {},
      quizFieldOverrides: {},
      comments: {},
      profiles: {},
      communityPosts: {},
    },
    updatedAt: at,
    updatedBy: 'master',
    stateVersion: 'cpx-a4-state.v2',
  };
  db.prepare('INSERT INTO board_state (user_id, state_json, state_version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(BOARD_ID, JSON.stringify(master), 'cpx-a4-state.v2', 'master', at);

  const users = [
    ['google-a', 'User A', '20200001', '2020****', 'google', 'provisional_active', 'student'],
    ['google-b', 'User B', '20200002', '2020****', 'google', 'provisional_active', 'student'],
    ['legacy-user', 'Legacy', '20200003', '2020****', 'password', 'active', 'student'],
  ];
  const insertUser = db.prepare(`
    INSERT INTO users (user_id, nickname, created_at, last_seen_at, student_no, student_masked, password_changed, auth_provider, account_status, a4_role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [id, nickname, studentNo, masked, provider, status, role] of users) {
    insertUser.run(id, nickname, at, at, studentNo, masked, 1, provider, status, role);
  }
  const tokens = { a: 'token-google-a', b: 'token-google-b', legacy: 'token-legacy' };
  const insertSession = db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)');
  insertSession.run(tokenHash(tokens.a), 'google-a', at, at);
  insertSession.run(tokenHash(tokens.b), 'google-b', at, at);
  insertSession.run(tokenHash(tokens.legacy), 'legacy-user', at, at);
  db.close();
  return { tokens, master };
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpx-personal-test-'));
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
      CPX_GOOGLE_REGISTRATION_MODE: 'closed',
      CPX_BOARD_PASSWORD: 'local-admin-test',
      CPX_A4_GOOGLE_ONLY: '1',
      CPX_A4_PERSONAL_OVERLAYS_ENABLED: '1',
      CPX_STATE_HISTORY_MIN_INTERVAL_MS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => logs.push(chunk.toString('utf8')));
  child.stderr.on('data', chunk => logs.push(chunk.toString('utf8')));

  try {
    await waitForServer(port, child);
    const { tokens, master } = seedDatabase(dbPath);

    const config = await request(port, '/api/auth/google/config');
    assert.equal(config.status, 200);
    assert.equal(config.json.loginMode, 'google_only');
    assert.equal(config.json.passwordLoginEnabled, false);
    assert.equal(config.json.personalizedEditing, true);

    const legacyLogin = await request(port, '/api/login', {
      method: 'POST',
      body: { studentNo: '20200001', password: 'cnu2026' },
    });
    assert.equal(legacyLogin.status, 410);
    assert.equal(legacyLogin.json.googleOnly, true);

    const forwardedAdminLogin = await request(port, '/api/login', {
      method: 'POST',
      host: 'localhost',
      headers: { 'x-forwarded-for': '203.0.113.10' },
      body: { nickname: 'Emergency Admin', password: 'local-admin-test' },
    });
    assert.equal(forwardedAdminLogin.status, 410);
    assert.equal(forwardedAdminLogin.json.googleOnly, true);

    const localAdminLogin = await request(port, '/api/login', {
      method: 'POST',
      host: 'localhost',
      body: { nickname: 'Emergency Admin', password: 'local-admin-test' },
    });
    assert.equal(localAdminLogin.status, 200);

    const legacySession = await request(port, '/api/me', { token: tokens.legacy });
    assert.equal(legacySession.status, 403);

    const initialA = await request(port, `/api/state?user_id=${encodeURIComponent(BOARD_ID)}`, { token: tokens.a });
    const initialB = await request(port, `/api/state?user_id=${encodeURIComponent(BOARD_ID)}`, { token: tokens.b });
    assert.equal(initialA.status, 200);
    assert.equal(initialB.status, 200);
    assert.equal(initialA.json.state_json.docs['1'], 'master-1');
    assert.equal(initialA.json.state_json.personalized, false);

    const docSave = await request(port, '/api/doc', {
      method: 'POST',
      token: tokens.a,
      body: {
        user_id: BOARD_ID,
        doc_id: '1',
        text: 'user-a-doc-1',
        base_text: 'master-1',
        state_version: 'cpx-a4-state.v2',
        updated_at: '2026-07-11T00:01:00.000Z',
        updated_by: 'User A',
        save_event: { id: 'save-a-1', docId: '1' },
      },
    });
    assert.equal(docSave.status, 200, docSave.text);
    assert.equal(docSave.json.personalized, true);

    const afterDocA = await request(port, `/api/state?user_id=${encodeURIComponent(BOARD_ID)}`, { token: tokens.a });
    const afterDocB = await request(port, `/api/state?user_id=${encodeURIComponent(BOARD_ID)}`, { token: tokens.b });
    assert.equal(afterDocA.json.state_json.docs['1'], 'user-a-doc-1');
    assert.equal(afterDocB.json.state_json.docs['1'], 'master-1');

    const staleSnapshot = structuredClone(afterDocA.json.state_json);
    staleSnapshot.docs['2'] = 'user-a-doc-2';
    staleSnapshot.docs['5'] = master.docs['4'];
    staleSnapshot.updatedAt = '2026-07-11T00:01:30.000Z';
    staleSnapshot.updatedBy = 'User A';
    staleSnapshot.saveEvent = { id: 'save-a-stale-snapshot', docId: '2', updatedAt: staleSnapshot.updatedAt, actorId: 'google-a', clientSessionId: 'test-a-tab' };
    const staleSnapshotSave = await request(port, '/api/state', {
      method: 'POST',
      token: tokens.a,
      body: { user_id: BOARD_ID, state_json: staleSnapshot, state_version: 'cpx-a4-state.v2', updated_at: staleSnapshot.updatedAt, updated_by: 'User A', client_session_id: 'test-a-tab', base_overlay_updated_at: afterDocA.json.updated_at },
    });
    assert.equal(staleSnapshotSave.status, 200, staleSnapshotSave.text);
    const afterStaleSnapshotA = await request(port, `/api/state?user_id=${encodeURIComponent(BOARD_ID)}`, { token: tokens.a });
    assert.equal(afterStaleSnapshotA.json.state_json.docs['2'], 'user-a-doc-2');
    assert.equal(afterStaleSnapshotA.json.state_json.docs['5'], master.docs['5']);

    const foreignClone = structuredClone(afterStaleSnapshotA.json.state_json);
    foreignClone.docs['6'] = master.docs['5'];
    foreignClone.updatedAt = '2026-07-11T00:01:45.000Z';
    foreignClone.updatedBy = 'User A';
    foreignClone.saveEvent = { id: 'save-a-foreign-clone', docId: '6', updatedAt: foreignClone.updatedAt, actorId: 'google-a', clientSessionId: 'test-a-tab' };
    const foreignCloneSave = await request(port, '/api/state', {
      method: 'POST',
      token: tokens.a,
      body: { user_id: BOARD_ID, state_json: foreignClone, state_version: 'cpx-a4-state.v2', updated_at: foreignClone.updatedAt, updated_by: 'User A', client_session_id: 'test-a-tab', base_overlay_updated_at: afterStaleSnapshotA.json.updated_at },
    });
    assert.equal(foreignCloneSave.status, 409, foreignCloneSave.text);
    assert.equal(foreignCloneSave.json.code, 'foreign_personal_overlay_document_copy');

    const fullA = structuredClone(afterStaleSnapshotA.json.state_json);
    fullA.docs['2'] = 'user-a-doc-2';
    fullA.settings['2:page:0'] = { fontSize: 12 };
    fullA.settings.tableStyles.personal = { width: 222 };
    fullA.settings.imageAssets.personal = { name: 'personal.png', dataUrl: 'data:image/png;base64,cGVyc29uYWw=' };
    fullA.settings.communityPosts.post1 = {
      id: 'post1',
      body: 'shared post',
      createdAt: '2026-07-11T00:02:00.000Z',
      updatedAt: '2026-07-11T00:02:00.000Z',
    };
    fullA.updatedAt = '2026-07-11T00:02:00.000Z';
    fullA.updatedBy = 'User A';
    fullA.saveEvent = { id: 'save-a-2', docId: '2', updatedAt: fullA.updatedAt, actorId: 'google-a', clientSessionId: 'test-a-tab' };
    const fullSaveBody = {
      user_id: BOARD_ID,
      state_json: fullA,
      state_version: 'cpx-a4-state.v2',
      updated_at: fullA.updatedAt,
      updated_by: 'User A',
      client_session_id: 'test-a-tab',
      base_overlay_updated_at: afterStaleSnapshotA.json.updated_at,
    };
    assert.ok(Buffer.byteLength(JSON.stringify(fullSaveBody)) > 25 * 1024 * 1024, 'fixture must exceed the former 25 MiB request limit');
    const fullSave = await request(port, '/api/state', {
      method: 'POST',
      token: tokens.a,
      body: fullSaveBody,
    });
    assert.equal(fullSave.status, 200, fullSave.text);
    assert.equal(fullSave.json.personalized, true);
    assert.equal(fullSave.json.shared_changed, true);

    const finalA = await request(port, `/api/state?user_id=${encodeURIComponent(BOARD_ID)}`, { token: tokens.a });
    const finalB = await request(port, `/api/state?user_id=${encodeURIComponent(BOARD_ID)}`, { token: tokens.b });
    assert.equal(finalA.json.state_json.docs['1'], 'user-a-doc-1');
    assert.equal(finalA.json.state_json.docs['2'], 'user-a-doc-2');
    assert.equal(finalA.json.state_json.settings['2:page:0'].fontSize, 12);
    assert.equal(finalA.json.state_json.settings.tableStyles.personal.width, 222);
    assert.equal(finalA.json.state_json.settings.imageAssets.personal.name, 'personal.png');
    assert.equal(finalB.json.state_json.docs['1'], 'master-1');
    assert.equal(finalB.json.state_json.docs['2'], 'master-2');
    assert.equal(finalB.json.state_json.settings['2:page:0'], undefined);
    assert.equal(finalB.json.state_json.settings.tableStyles.personal, undefined);
    assert.equal(finalB.json.state_json.settings.imageAssets.personal, undefined);
    assert.equal(finalB.json.state_json.settings.communityPosts.post1.body, 'shared post');

    const omittedCollectionA = structuredClone(finalA.json.state_json);
    delete omittedCollectionA.settings.imageAssets;
    omittedCollectionA.docs['3'] = 'user-a-doc-3';
    omittedCollectionA.updatedAt = '2026-07-11T00:03:00.000Z';
    omittedCollectionA.updatedBy = 'User A';
    omittedCollectionA.saveEvent = { id: 'save-a-3', docId: '3', updatedAt: omittedCollectionA.updatedAt, actorId: 'google-a', clientSessionId: 'test-a-tab' };
    const omittedCollectionSave = await request(port, '/api/state', {
      method: 'POST',
      token: tokens.a,
      body: {
        user_id: BOARD_ID,
        state_json: omittedCollectionA,
        state_version: 'cpx-a4-state.v2',
        updated_at: omittedCollectionA.updatedAt,
        updated_by: 'User A',
        client_session_id: 'test-a-tab',
        base_overlay_updated_at: finalA.json.updated_at,
      },
    });
    assert.equal(omittedCollectionSave.status, 200, omittedCollectionSave.text);
    const afterOmittedCollectionA = await request(port, `/api/state?user_id=${encodeURIComponent(BOARD_ID)}`, { token: tokens.a });
    assert.equal(afterOmittedCollectionA.json.state_json.docs['3'], 'user-a-doc-3');
    assert.equal(afterOmittedCollectionA.json.state_json.settings.imageAssets.personal.name, 'personal.png');

    const db = new DatabaseSync(dbPath);
    const central = JSON.parse(db.prepare('SELECT state_json FROM board_state WHERE user_id = ?').get(BOARD_ID).state_json);
    const overlayCount = db.prepare('SELECT COUNT(*) AS count FROM a4_personal_overlays WHERE board_user_id = ?').get(BOARD_ID).count;
    db.close();
    assert.deepEqual(central.docs, master.docs);
    assert.equal(central.settings['2:page:0'], undefined);
    assert.equal(central.settings.tableStyles.personal, undefined);
    assert.equal(central.settings.communityPosts.post1.body, 'shared post');
    assert.equal(overlayCount, 1);

    for (const filename of ['index.html', 'cpx-a4-editor-local.html']) {
      const html = fs.readFileSync(path.join(ROOT, filename), 'utf8');
      assert.match(html, /googleOnlyLogin/);
      assert.doesNotMatch(html, /placeholder="학번 입력"/);
      assert.doesNotMatch(html, /placeholder="비밀번호 입력"/);
      assert.match(html, /function canEditDocs\(\)\{return !!currentUser\?\.token\}/);
      assert.match(html, /수정 내용은 내 개인 대본/);
      assert.match(html, /cpx-emergency-doc-text\.v2/);
      assert.match(html, /statePayloadForTransport/);
    }

    console.log('CPX Google-only + personal overlay integration: ok');
  } catch (error) {
    if (logs.length) process.stderr.write(`\n--- server log ---\n${logs.join('')}\n`);
    throw error;
  } finally {
    if (child.exitCode == null) child.kill('SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode != null) return resolve();
      const timer = setTimeout(() => {
        if (child.exitCode == null) child.kill('SIGKILL');
        resolve();
      }, 2000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
