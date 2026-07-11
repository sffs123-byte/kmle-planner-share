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
  '# 42 성장/발달지연',
  '',
  '## 개요',
  '',
  '현재 환아의 키를 설명하고 기록지를 확인합니다.',
].join('\n');

function loadActualDoc42() {
  const dbPath = process.env.CPX_TEST_DB_PATH;
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db.prepare("SELECT state_json FROM board_state WHERE user_id='gangryeol-cpx-a4-editor-reset-20260515'").get();
    const state = JSON.parse(row?.state_json || '{}');
    return typeof state.docs?.['42'] === 'string' ? state.docs['42'] : null;
  } finally {
    db.close();
  }
}

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

async function prepare(page, port, file, reset, fixture) {
  const errors = [];
  page.on('pageerror', error => errors.push(error));
  await page.goto('http://127.0.0.1:' + port + '/' + file, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.openDoc === 'function');
  await page.evaluate(({ fixture, reset }) => {
    if (reset) localStorage.clear();
    saveAuth({ id: 'rendered-enter-test', token: 'test-token', nickname: 'Rendered test', a4Role: 'student' });
    shouldPullStateOnDocOpen = () => false;
    updatePresence = async () => {};
    setupReferenceComparison = async () => {};
    window.__savedSource = null;
    pushState = async () => {
      window.__savedSource = $('sourceText').value;
      dirtyState = false;
    };
    if (reset) docs['42'] = fixture;
  }, { fixture, reset });
  await page.evaluate(() => openDoc('42', { route: false }));
  await page.waitForSelector('.para.renderedBlockEdit[contenteditable="true"]');
  assert.deepEqual(errors.map(error => error.message), [], file + ' page errors');
}

async function exerciseVariant(browser, port, file, fixture, needle, inserted, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  await prepare(page, port, file, true, fixture);

  await page.evaluate(needle => {
    const para = [...document.querySelectorAll('.para.renderedBlockEdit')]
      .find(el => el.textContent.includes(needle));
    if (!para) throw new Error('editable paragraph missing');
    const text = [...para.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (!text) throw new Error('paragraph text node missing');
    const range = document.createRange();
    range.setStart(text, text.nodeValue.indexOf(needle) + needle.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    para.focus();
  }, needle);
  await page.keyboard.press('Enter');
  await page.keyboard.type(inserted);

  const live = await page.evaluate(async () => {
    const para = document.activeElement;
    await pushState({ manual: false });
    const emergency = JSON.parse(localStorage.getItem('cpxA4EmergencyDraft.v1') || 'null');
    return {
      source: $('sourceText').value,
      docsText: docs['42'],
      savedSource: window.__savedSource,
      emergency,
      active: para?.matches?.('.para.renderedBlockEdit') || false,
      pending: hasPendingLocalState(),
      html: para?.innerHTML || '',
    };
  });
  const expectedBreak = needle + '\n' + inserted;
  assert.ok(live.source.includes(expectedBreak), file + ': source missing live newline: ' + live.source);
  assert.equal(live.docsText, live.source, file + ': docs/source mismatch');
  assert.equal(live.savedSource, live.source, file + ': autosave captured stale source');
  assert.equal(live.emergency && live.emergency.text, live.source, file + ': emergency draft mismatch');
  assert.equal(live.active, true, file + ': live commit moved focus out of paragraph');
  assert.equal(live.pending, true, file + ': active rendered edit was not protected');

  const remote = await page.evaluate(savedSource => {
    const beforeNode = document.activeElement;
    applyRemoteState({
      docs: { ...seed.docs, '42': savedSource },
      settings: {},
      updatedAt: '2026-07-11T01:00:00.000Z',
      updatedBy: 'remote-test',
      stateVersion: 'cpx-a4-state.v2',
    });
    return {
      sameNode: beforeNode === document.activeElement,
      source: $('sourceText').value,
    };
  }, live.savedSource);
  assert.equal(remote.sameNode, true, file + ': remote state re-rendered the active paragraph');
  assert.ok(remote.source.includes(expectedBreak), file + ': remote state replaced the local newline');

  await page.evaluate(() => saveLocal());
  const reload = await context.newPage();
  await prepare(reload, port, file, false, fixture);
  const reloaded = await reload.evaluate(() => ({
    source: $('sourceText').value,
    docsText: docs['42'],
    texts: [...document.querySelectorAll('.para')].map(el => el.innerText),
  }));
  assert.ok(reloaded.source.includes(expectedBreak), file + ': local reload lost the newline');
  assert.equal(reloaded.docsText, reloaded.source, file + ': reloaded docs/source mismatch');
  assert.ok(reloaded.texts.some(text => text.includes(expectedBreak)), file + ': reloaded paragraph did not render both lines');

  await context.close();
  return { file, label, html: live.html };
}

async function main() {
  const opened = await serveRoot();
  const browser = await launch();
  try {
    const actual = loadActualDoc42();
    const cases = [
      { label: 'synthetic', fixture: FIXTURE, needle: '현재 환아의 키를 설명하고', inserted: '추가 줄' },
      ...(actual ? [{ label: 'actual-42', fixture: actual, needle: '현재 환아의 키가 몇 백분위수인지 설명', inserted: '실제42줄' }] : []),
    ];
    const results = [];
    for (const file of ['index.html', 'cpx-a4-editor-local.html']) {
      for (const testCase of cases) {
        results.push(await exerciseVariant(browser, opened.port, file, testCase.fixture, testCase.needle, testCase.inserted, testCase.label));
      }
    }
    console.log(JSON.stringify({ ok: true, actualDoc42: !!actual, results }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => opened.server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
