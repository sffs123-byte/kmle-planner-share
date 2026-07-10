#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FIXTURE = [
  '# Enter persistence fixture',
  '',
  '| 항목 | 질문 |',
  '|---|---|',
  '| O | 첫 질문둘째 질문 |',
].join('\n');

function serveRoot() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
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

async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!fs.existsSync(SYSTEM_CHROME)) throw error;
    return chromium.launch({ headless: true, executablePath: SYSTEM_CHROME });
  }
}

async function prepare(page, port, file, reset) {
  const errors = [];
  page.on('pageerror', error => errors.push(error));
  await page.goto('http://127.0.0.1:' + port + '/' + file, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.openDoc === 'function');
  await page.evaluate(({ fixture, reset }) => {
    if (reset) localStorage.clear();
    saveAuth({ id: 'inline-enter-test', token: 'test-token', nickname: 'Inline test', a4Role: 'student' });
    shouldPullStateOnDocOpen = () => false;
    updatePresence = async () => {};
    pushState = async () => {};
    setupReferenceComparison = async () => {};
    if (reset) docs['42'] = fixture;
  }, { fixture: FIXTURE, reset });
  await page.evaluate(() => openDoc('42', { route: false }));
  await page.waitForSelector('.inlineEditCell[data-r="1"][data-c="1"][contenteditable="true"]');
  assert.deepEqual(errors.map(error => error.message), [], file + ' page errors');
}

async function exerciseVariant(browser, port, file) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  await prepare(page, port, file, true);

  const before = await page.evaluate(() => ({
    styleCount: Object.keys(settings.tableStyles || {}).length,
    source: $('sourceText').value,
  }));
  assert.equal(before.source, FIXTURE);

  await page.evaluate(() => {
    const cell = document.querySelector('.inlineEditCell[data-r="1"][data-c="1"]');
    if (!cell) throw new Error('editable cell missing');
    const text = [...cell.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (!text) throw new Error('editable cell text node missing');
    const range = document.createRange();
    range.setStart(text, '첫 질문'.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    cell.focus();
  });
  await page.keyboard.press('Enter');
  await page.keyboard.type('가나다라마');

  const live = await page.evaluate(() => {
    const cell = document.querySelector('.inlineEditCell[data-r="1"][data-c="1"]');
    const emergency = JSON.parse(localStorage.getItem('cpxA4EmergencyDraft.v1') || 'null');
    return {
      source: $('sourceText').value,
      docsText: docs['42'],
      emergency,
      dirty: dirtyState,
      pending: hasPendingLocalState(),
      active: document.activeElement === cell,
      html: cell.innerHTML,
      styleCount: Object.keys(settings.tableStyles || {}).length,
    };
  });
  const expectedBreak = '첫 질문<br>가나다라마둘째 질문';
  assert.ok(live.source.includes(expectedBreak), file + ': source missing live <br>: ' + live.source);
  assert.equal(live.docsText, live.source, file + ': docs/source mismatch');
  assert.equal(live.emergency && live.emergency.format, 'cpx-emergency-doc-text.v2');
  assert.equal(live.emergency && live.emergency.docId, '42');
  assert.equal(live.emergency && live.emergency.text, live.source, file + ': emergency draft mismatch');
  assert.equal(live.dirty, true, file + ': input did not mark dirty');
  assert.equal(live.pending, true, file + ': local input was not protected from remote render');
  assert.equal(live.active, true, file + ': live sync moved focus out of the cell');
  assert.ok(live.styleCount - before.styleCount <= 6, file + ': live edits leaked table style keys (' + before.styleCount + ' -> ' + live.styleCount + ')');

  const remote = await page.evaluate(remoteText => {
    const beforeNode = document.querySelector('.inlineEditCell[data-r="1"][data-c="1"]');
    applyRemoteState({
      docs: { ...seed.docs, '42': remoteText },
      settings: {},
      updatedAt: '2026-07-11T00:00:00.000Z',
      updatedBy: 'remote-test',
      stateVersion: 'cpx-a4-state.v2',
    });
    const afterNode = document.querySelector('.inlineEditCell[data-r="1"][data-c="1"]');
    return {
      sameNode: beforeNode === afterNode,
      source: $('sourceText').value,
      pendingRemoteDocText,
    };
  }, FIXTURE.replace('첫 질문둘째 질문', '원격 이전 문장'));
  assert.equal(remote.sameNode, true, file + ': remote state re-rendered the active edit');
  assert.ok(remote.source.includes(expectedBreak), file + ': remote state replaced the local line break');
  assert.equal(remote.pendingRemoteDocText && remote.pendingRemoteDocText.includes('원격 이전 문장'), true, file + ': remote conflict was not retained for review');

  await page.evaluate(() => saveLocal());
  const reload = await context.newPage();
  await prepare(reload, port, file, false);
  const reloaded = await reload.evaluate(() => ({
    source: $('sourceText').value,
    docsText: docs['42'],
    cellText: document.querySelector('.inlineEditCell[data-r="1"][data-c="1"]')?.innerText,
  }));
  assert.ok(reloaded.source.includes(expectedBreak), file + ': local reload lost the <br>');
  assert.equal(reloaded.docsText, reloaded.source, file + ': reloaded docs/source mismatch');
  assert.ok(reloaded.cellText.includes('첫 질문') && reloaded.cellText.includes('가나다라마둘째 질문'), file + ': reloaded cell did not render both lines');

  await context.close();
  return { file, styleDelta: live.styleCount - before.styleCount, html: live.html };
}

async function main() {
  const opened = await serveRoot();
  const browser = await launch();
  try {
    const results = [];
    for (const file of ['index.html', 'cpx-a4-editor-local.html']) {
      results.push(await exerciseVariant(browser, opened.port, file));
    }
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => opened.server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
