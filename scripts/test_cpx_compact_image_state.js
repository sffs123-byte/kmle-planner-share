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
const TOKEN = 'compact-image-test-token';
const USER_ID = 'compact-image-user';

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
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch {}
        resolve({ status: res.statusCode, headers: res.headers, buffer, text, json });
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
  const at = '2026-07-11T02:00:00.000Z';
  const pngBytes = Buffer.from('compact-image-payload');
  const dataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;
  const rawTableKey = '| 질문 | 답변 |\n|---|---|\n| 오래된 원문 키 | 저장된 서식 |#0';
  const master = {
    docs: { '42': '# 42\n\n{{upload:master-image width=50%}}' },
    settings: {
      imageAssets: {
        'master-image': { id: 'master-image', name: 'master.png', dataUrl, w: 100, h: 80, bytes: pngBytes.length },
        'external-image': { id: 'external-image', name: 'external.png', dataUrl: 'https://example.com/image.png', external: true, w: 100, h: 80, bytes: 0 },
      },
      tableStyles: {
        [rawTableKey]: { colWidths: [120, 180] },
        '42:tableSig:master:0': { colWidths: [120, 180] },
      },
      profiles: {}, communityPosts: {}, comments: {}, docMeta: {}, flowAssets: {}, quizFieldOverrides: {},
    },
    updatedAt: at,
    updatedBy: 'master',
    stateVersion: 'cpx-a4-state.v2',
    clientBuild: 'test-build',
  };
  db.prepare('INSERT INTO board_state (user_id, state_json, state_version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(BOARD_ID, JSON.stringify(master), 'cpx-a4-state.v2', 'master', at);
  db.prepare(`
    INSERT INTO users (user_id, nickname, created_at, last_seen_at, student_no, student_masked, password_changed, auth_provider, account_status, a4_role)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'google', 'verified_active', 'admin')
  `).run(USER_ID, 'Safari image test', at, at, '20200001', '2020****');
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash(TOKEN), USER_ID, at, at);
  db.close();
  return { master, pngBytes, rawTableKey };
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpx-compact-image-test-'));
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
    const { master, pngBytes, rawTableKey } = seed(dbPath);
    const statePath = `/api/state?user_id=${encodeURIComponent(BOARD_ID)}`;
    const full = await request(port, statePath, { token: TOKEN });
    const compact = await request(port, `${statePath}&compact_images=1`, { token: TOKEN });
    assert.equal(full.status, 200, full.text);
    assert.equal(compact.status, 200, compact.text);
    assert.match(full.json.state_json.settings.imageAssets['master-image'].dataUrl, /^data:image\/png;base64,/);
    assert.equal(compact.json.state_json.settings.imageAssets['master-image'].dataUrl, undefined);
    assert.equal(compact.json.state_json.settings.imageAssets['master-image'].remoteData, true);
    assert.equal(compact.json.state_json.settings.imageAssets['external-image'].dataUrl, 'https://example.com/image.png');
    assert.equal(compact.json.state_json.imageAssetsRemote, true);
    assert.equal(compact.json.state_json.settings.tableStyles[rawTableKey], undefined);
    assert.deepEqual(compact.json.state_json.settings.tableStyles['42:tableSig:master:0'], { colWidths: [120, 180] });
    assert.equal(compact.json.state_json.tableStylesRemoteCompacted, true);
    assert.ok(compact.buffer.length < full.buffer.length, 'compact response was not smaller');

    const binary = await request(port, `/api/image-asset?user_id=${encodeURIComponent(BOARD_ID)}&asset_id=master-image&token=${encodeURIComponent(TOKEN)}`);
    assert.equal(binary.status, 200, binary.text);
    assert.equal(binary.headers['content-type'], 'image/png');
    assert.deepEqual(binary.buffer, pngBytes);

    const newBytes = Buffer.from('new-personal-image');
    const nextState = structuredClone(compact.json.state_json);
    nextState.docs['42'] += '\n{{upload:new-image width=40%}}';
    nextState.settings.imageAssets['new-image'] = {
      id: 'new-image', name: 'new.png', dataUrl: `data:image/png;base64,${newBytes.toString('base64')}`, w: 90, h: 60, bytes: newBytes.length,
    };
    nextState.settings.tableStyles['42:tableSig:new:0'] = { colWidths: [100, 200] };
    const saved = await request(port, '/api/state', {
      method: 'POST', token: TOKEN,
      body: {
        user_id: BOARD_ID,
        state_json: nextState,
        state_version: 'cpx-a4-state.v2',
        updated_by: 'Safari image test',
        updated_at: '2026-07-11T02:01:00.000Z',
        client_session_id: 'safari-image-tab',
        force: true,
      },
    });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.json.personalized, true);

    const readback = await request(port, `${statePath}&compact_images=1`, { token: TOKEN });
    assert.equal(readback.status, 200, readback.text);
    assert.equal(readback.json.state_json.settings.imageAssets['master-image'].remoteData, true);
    assert.equal(readback.json.state_json.settings.imageAssets['new-image'].remoteData, true);
    const newBinary = await request(port, `/api/image-asset?user_id=${encodeURIComponent(BOARD_ID)}&asset_id=new-image&token=${encodeURIComponent(TOKEN)}`);
    assert.equal(newBinary.status, 200, newBinary.text);
    assert.deepEqual(newBinary.buffer, newBytes);

    const db = new DatabaseSync(dbPath, { readOnly: true });
    const overlay = JSON.parse(db.prepare('SELECT overlay_json FROM a4_personal_overlays WHERE board_user_id = ? AND user_id = ?').get(BOARD_ID, USER_ID).overlay_json);
    const masterReadback = JSON.parse(db.prepare('SELECT state_json FROM board_state WHERE user_id = ?').get(BOARD_ID).state_json);
    db.close();
    const imagePatch = overlay.settings.collections.imageAssets;
    const tablePatch = overlay.settings.collections.tableStyles;
    assert.deepEqual(Object.keys(imagePatch.values), ['new-image']);
    assert.deepEqual(imagePatch.deleted, []);
    assert.deepEqual(Object.keys(tablePatch.values), ['42:tableSig:new:0']);
    assert.deepEqual(tablePatch.deleted, []);
    assert.equal(masterReadback.settings.imageAssets['new-image'], undefined);
    assert.deepEqual(masterReadback.settings.imageAssets['master-image'], master.settings.imageAssets['master-image']);

    console.log(JSON.stringify({
      ok: true,
      fullBytes: full.buffer.length,
      compactBytes: compact.buffer.length,
      masterImageLazy: true,
      newPersonalImageLazy: true,
      placeholderHydration: true,
      compactTableStylesHydration: true,
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
