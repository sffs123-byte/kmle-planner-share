#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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

async function exercise(browser, port, file, engine) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/events') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        headers: {
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
        body: ': test event stream\n\n',
      });
      return;
    }
    if (url.pathname === '/api/image-asset') {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
      await route.fulfill({ status: 200, contentType: 'image/png', body: png });
      return;
    }
    let body = { ok: true };
    if (url.pathname === '/api/auth/google/config') body = { ok: true, enabled: false };
    else if (url.pathname === '/api/me') body = { ok: true, user: { id: 'safari-test', userId: 'safari-test', nickname: 'Safari test', authProvider: 'google', accountStatus: 'verified_active', a4Role: 'admin' } };
    else if (url.pathname === '/api/state') body = { user_id: 'board', state_version: 'cpx-a4-state.v2', updated_at: '2026-07-11T02:00:00.000Z', state_json: { docs: { '42': '# 42\n\n{{upload:remote-test-image width=50%}}' }, settings: { imageAssets: { 'remote-test-image': { id: 'remote-test-image', name: 'remote-test.png', remoteData: true, w: 1, h: 1, bytes: 68 } } }, stateVersion: 'cpx-a4-state.v2', imageAssetsRemote: true } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.finishGoogleAuth === 'function');

  const result = await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify({ tableStyles: { legacy: { width: 100 } } }));
    localStorage.setItem(LOCAL_DOCS_KEY, JSON.stringify({ '42': 'cached doc' }));
    localStorage.setItem(LOCAL_META_KEY, JSON.stringify({ updatedAt: 'old' }));

    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function authQuotaFailure(key, value) {
      if (this === localStorage && key === AUTH_KEY) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    };

    let thrown = '';
    try {
      await finishGoogleAuth({
        token: 'safari-session-token',
        user: { id: 'safari-test', userId: 'safari-test', nickname: 'Safari test', authProvider: 'google', a4Role: 'admin' },
      });
    } catch (error) {
      thrown = String(error?.message || error);
    }
    Storage.prototype.setItem = nativeSetItem;

    const rawTableKey = '| 질문 | 답 |\n|---|---|\n| 첫 질문 | 첫 답 |#0';
    const compact = settingsForLocalStorage({
      imageAssets: { image: { dataUrl: 'data:image/png;base64,AAAA' } },
      tableStyles: {
        [rawTableKey]: { colWidths: [100, 100] },
        '42:tableSig:abc:0': { colWidths: [100, 100] },
        '42:top:0:t:0': { colWidths: [100, 100] },
      },
    });

    return {
      thrown,
      currentToken: currentUser?.token || '',
      sessionToken: JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null')?.token || '',
      authReady: sessionStorage.getItem(AUTH_READY_KEY),
      gateHidden: $('gate').classList.contains('hidden'),
      homeHidden: $('home').classList.contains('hidden'),
      cacheSettings: localStorage.getItem(LOCAL_SETTINGS_KEY),
      cacheDocs: localStorage.getItem(LOCAL_DOCS_KEY),
      cacheMeta: localStorage.getItem(LOCAL_META_KEY),
      rawStyleKept: Object.hasOwn(compact.tableStyles, rawTableKey),
      sigStyleKept: Object.hasOwn(compact.tableStyles, '42:tableSig:abc:0'),
      idStyleKept: Object.hasOwn(compact.tableStyles, '42:top:0:t:0'),
      imageAssetsOmitted: compact.imageAssetsOmitted === true && Object.keys(compact.imageAssets).length === 0,
    };
  });

  assert.equal(result.thrown, '', `${file}: quota error escaped Google auth`);
  assert.equal(result.currentToken, 'safari-session-token', `${file}: in-memory auth missing`);
  assert.equal(result.sessionToken, 'safari-session-token', `${file}: session auth fallback missing`);
  assert.equal(result.authReady, '1', `${file}: session auth marker missing`);
  assert.equal(result.gateHidden, true, `${file}: login gate remained visible`);
  assert.equal(result.homeHidden, false, `${file}: home did not open`);
  assert.equal(result.cacheSettings, null, `${file}: oversized settings cache was not evicted`);
  assert.equal(result.cacheDocs, null, `${file}: docs cache was not evicted`);
  assert.equal(result.cacheMeta, null, `${file}: meta cache was not evicted`);
  assert.equal(result.rawStyleKept, false, `${file}: raw markdown table-style key was not compacted`);
  assert.equal(result.sigStyleKept, true, `${file}: signature table style was lost`);
  assert.equal(result.idStyleKept, true, `${file}: rendered table style was lost`);
  assert.equal(result.imageAssetsOmitted, true, `${file}: image asset cache was not omitted`);

  await page.waitForFunction(() => settings?.imageAssets?.['remote-test-image']?.remoteData === true);
  await page.evaluate(() => openDoc('42', { route: false }));
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-image-id="remote-test-image"] img');
    return image && image.complete && image.naturalWidth === 1;
  });
  const lazyImage = await page.evaluate(() => {
    const image = document.querySelector('[data-image-id="remote-test-image"] img');
    return { src: image?.src || '', width: image?.naturalWidth || 0 };
  });
  assert.match(lazyImage.src, /\/api\/image-asset\?/i, `${file}: remote image did not use lazy endpoint`);
  assert.equal(lazyImage.width, 1, `${file}: remote image did not render`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser?.token === 'safari-session-token' && !document.getElementById('home').classList.contains('hidden'));
  const afterReload = await page.evaluate(() => ({ token: currentUser?.token || '', gateHidden: $('gate').classList.contains('hidden'), homeHidden: $('home').classList.contains('hidden') }));
  assert.equal(afterReload.token, 'safari-session-token', `${file}: session auth did not survive reload`);
  assert.equal(afterReload.gateHidden, true, `${file}: reload returned to login gate`);
  assert.equal(afterReload.homeHidden, false, `${file}: reload did not return home`);
  assert.deepEqual(pageErrors, [], `${file}: page errors`);

  await context.close();
  return { engine, file, sessionFallback: true, reload: true, compactTableStyles: true, lazyImage: true };
}

async function main() {
  const opened = await serveRoot();
  try {
    const results = [];
    for (const engine of ['chromium', 'webkit']) {
      const browser = await launch(engine);
      try {
        for (const file of ['index.html', 'cpx-a4-editor-local.html']) results.push(await exercise(browser, opened.port, file, engine));
      } finally {
        await browser.close();
      }
    }
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    await new Promise(resolve => opened.server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
