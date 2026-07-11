#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const redirectHandler = require('../api/google-signin-redirect.js');

const ROOT = path.resolve(__dirname, '..');
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILES = ['index.html', 'cpx-a4-editor-local.html'];

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    send(value) { this.body = String(value); return this; },
  };
}

async function testRedirectHandler() {
  const credential = 'header.payload.signature';
  const ok = mockResponse();
  await redirectHandler({
    method: 'POST',
    headers: { cookie: 'g_csrf_token=safari-csrf' },
    body: { g_csrf_token: 'safari-csrf', credential },
  }, ok);
  assert.equal(ok.statusCode, 200);
  assert.match(ok.headers['cache-control'], /no-store/);
  assert.match(ok.body, /cpxGoogleRedirectCredential\.v1/);
  assert.doesNotMatch(ok.body, new RegExp(credential.replaceAll('.', '\\.')));
  assert.match(ok.body, /location\.replace\('\/\?google_redirect=1'\)/);

  const badCsrf = mockResponse();
  await redirectHandler({
    method: 'POST',
    headers: { cookie: 'g_csrf_token=one' },
    body: { g_csrf_token: 'two', credential },
  }, badCsrf);
  assert.equal(badCsrf.statusCode, 403);

  const wrongMethod = mockResponse();
  await redirectHandler({ method: 'GET', headers: {} }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  return { csrf: true, noStore: true, credentialNotInUrl: true };
}

function serveRoot() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end('not found');
        return;
      }
      const ext = path.extname(file);
      const type = ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.json' ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function launch(engine) {
  if (engine === 'webkit') return webkit.launch({ headless: true });
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!fs.existsSync(SYSTEM_CHROME)) throw error;
    return chromium.launch({ headless: true, executablePath: SYSTEM_CHROME });
  }
}

async function exercise(browser, engine, port, file) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const loginBodies = [];
  let challengeRequests = 0;

  await context.route('https://accounts.google.com/gsi/client*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: `window.__googleInit=[];window.google={accounts:{id:{initialize:function(config){window.__googleInit.push(config)},renderButton:function(el){el.dataset.googleRendered='1'}}}};`,
    });
  });

  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/events') {
      await route.fulfill({ status: 200, contentType: 'text/event-stream; charset=utf-8', body: ': ready\n\n' });
      return;
    }
    let body = { ok: true };
    let status = 200;
    if (url.pathname === '/api/auth/google/config') {
      body = { ok: true, enabled: true, clientId: 'test-client.apps.googleusercontent.com', registrationOpen: true, personalizedEditing: true };
    } else if (url.pathname === '/api/auth/google/challenge') {
      challengeRequests += 1;
      status = 201;
      body = { ok: true, challengeId: `challenge-${challengeRequests}`, nonce: `nonce-${challengeRequests}` };
    } else if (url.pathname === '/api/auth/google/login') {
      loginBodies.push(request.postDataJSON());
      body = {
        ok: true,
        token: `session-${engine}-${file}`,
        user: {
          id: 'stu-safari',
          userId: 'stu-safari',
          nickname: '강렬',
          authProvider: 'google',
          accountStatus: 'verified_active',
          a4Role: 'admin',
          studentMasked: '2020****',
        },
      };
    } else if (url.pathname === '/api/me') {
      body = { ok: true, user: { id: 'stu-safari', userId: 'stu-safari', nickname: '강렬', authProvider: 'google', accountStatus: 'verified_active', a4Role: 'admin', studentMasked: '2020****' } };
    } else if (url.pathname === '/api/state') {
      body = {
        user_id: 'board',
        state_version: 'cpx-a4-state.v2',
        updated_at: '2026-07-11T04:00:00.000Z',
        state_json: { docs: { '42': '# 42' }, settings: { profiles: {} }, stateVersion: 'cpx-a4-state.v2' },
      };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const url = `http://127.0.0.1:${port}/${file}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__googleInit?.length === 1);

  const config = await page.evaluate(() => {
    const value = window.__googleInit[0];
    return { uxMode: value.ux_mode, loginUri: value.login_uri || '', itpSupport: value.itp_support, hasCallback: typeof value.callback === 'function' };
  });

  if (engine === 'webkit') {
    assert.equal(config.uxMode, 'redirect', `${file}: Safari did not use redirect UX`);
    assert.equal(config.loginUri, `http://127.0.0.1:${port}/api/google-signin-redirect`, `${file}: Safari redirect URI`);
    assert.equal(config.itpSupport, true, `${file}: ITP support disabled`);
    assert.equal(config.hasCallback, false, `${file}: redirect path retained popup callback`);
    const storedChallenge = await page.evaluate(() => sessionStorage.getItem(GOOGLE_REDIRECT_CHALLENGE_KEY));
    assert.equal(storedChallenge, 'challenge-1', `${file}: redirect challenge not stored`);
    await page.evaluate(() => sessionStorage.setItem(GOOGLE_REDIRECT_CREDENTIAL_KEY, 'header.payload.signature'));
    await page.reload({ waitUntil: 'domcontentloaded' });
  } else {
    assert.equal(config.uxMode, 'popup', `${file}: Chromium popup UX changed`);
    assert.equal(config.loginUri, '', `${file}: Chromium received redirect URI`);
    assert.equal(config.hasCallback, true, `${file}: Chromium callback missing`);
    await page.evaluate(async () => window.__googleInit[0].callback({ credential: 'header.payload.signature' }));
  }

  await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser?.token && document.getElementById('gate').classList.contains('hidden'), null, { timeout: 30000 });
  assert.equal(loginBodies.length, 1, `${file}: credential exchange count`);
  assert.equal(loginBodies[0].credential, 'header.payload.signature', `${file}: credential handoff`);
  assert.equal(loginBodies[0].challengeId, 'challenge-1', `${file}: challenge handoff`);
  if (engine === 'webkit') {
    assert.equal(challengeRequests, 1, `${file}: redirect bootstrap replaced the original challenge`);
    const cleared = await page.evaluate(() => ({
      credential: sessionStorage.getItem(GOOGLE_REDIRECT_CREDENTIAL_KEY),
      challenge: sessionStorage.getItem(GOOGLE_REDIRECT_CHALLENGE_KEY),
    }));
    assert.deepEqual(cleared, { credential: null, challenge: null }, `${file}: redirect handoff was not cleared`);
  }
  assert.deepEqual(pageErrors, [], `${file}: page errors`);
  await context.close();
  return { engine, file, uxMode: config.uxMode, loginBodies: loginBodies.length };
}

async function main() {
  const endpoint = await testRedirectHandler();
  const opened = await serveRoot();
  const results = [];
  try {
    for (const engine of ['chromium', 'webkit']) {
      const browser = await launch(engine);
      try {
        for (const file of FILES) results.push(await exercise(browser, engine, opened.port, file));
      } finally {
        await browser.close();
      }
    }
  } finally {
    await new Promise(resolve => opened.server.close(resolve));
  }
  console.log(JSON.stringify({ ok: true, endpoint, results }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
