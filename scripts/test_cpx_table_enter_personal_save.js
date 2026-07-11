#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.CPX_TEST_DB_PATH || [
  path.join(ROOT, '.local', 'cpx-local.sqlite'),
  path.resolve(ROOT, '..', 'kmle-planner-share', '.local', 'cpx-local.sqlite'),
].find(candidate => fs.existsSync(candidate));
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BOARD_ID = 'gangryeol-cpx-a4-editor-reset-20260515';

function actualDoc42() {
  if (!DB_PATH) throw new Error('set CPX_TEST_DB_PATH to the CPX local SQLite database');
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    const row = db.prepare('SELECT state_json FROM board_state WHERE user_id = ?').get(BOARD_ID);
    const state = JSON.parse(row?.state_json || '{}');
    const text = state.docs?.['42'];
    if (typeof text !== 'string' || !text.includes('아이 이름, 생년월일이 언제인가요?')) {
      throw new Error('actual doc 42 question table not found');
    }
    // The current central doc may already contain the desired break. Remove only
    // this fixture break so the test can exercise inserting it again.
    return text.replace(/\s*<br\s*\/?\s*>\s*(관계가 어떻게 되나요\?)/i, ', $1');
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

async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!fs.existsSync(SYSTEM_CHROME)) throw error;
    return chromium.launch({ headless: true, executablePath: SYSTEM_CHROME });
  }
}

async function exercise(browser, port, file, doc42) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.openDoc === 'function');
  await page.evaluate(docText => {
    localStorage.clear();
    saveAuth({ id: 'table-enter-personal-test', token: 'test-token', nickname: 'Table Enter test', a4Role: 'student' });
    shouldPullStateOnDocOpen = () => false;
    updatePresence = async () => {};
    hasOtherEditorsOnCurrent = () => false;
    setupReferenceComparison = async () => {};
    localDbAvailable = () => true;
    window.__saveRequests = [];
    fetchApi = async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      window.__saveRequests.push({ url, body });
      if (url === '/api/doc') {
        return new Response(JSON.stringify({
          ok: true,
          personalized: true,
          text: body.text,
          updated_at: body.updated_at,
          state_version: body.state_version,
          merge_mode: 'exact',
          save_event_id: body.save_event?.id,
          doc_meta: { version: 1, updatedAt: body.updated_at, updatedBy: body.updated_by },
          personal_overlay: { docCount: 1, settingCount: 0, updatedAt: body.updated_at },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500, headers: { 'content-type': 'application/json' } });
    };
    docs['42'] = docText;
  }, doc42);
  await page.evaluate(() => openDoc('42', { route: false }));
  await page.waitForSelector('.inlineEditCell[contenteditable="true"]');

  await page.evaluate(() => {
    const cell = [...document.querySelectorAll('.inlineEditCell[contenteditable="true"]')]
      .find(el => el.textContent.includes('아이 이름, 생년월일이 언제인가요?'));
    if (!cell) throw new Error('actual doc 42 question cell missing');
    const text = [...cell.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.includes('(만 나이 확인), 관계'));
    if (!text) throw new Error('question cell insertion point missing');
    const offset = text.nodeValue.indexOf('(만 나이 확인), 관계') + '(만 나이 확인),'.length;
    const range = document.createRange();
    range.setStart(text, offset);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    cell.focus();
  });
  await page.keyboard.press('Enter');
  await page.keyboard.type('줄바꿈검증');

  const live = await page.evaluate(() => {
    const cell = document.activeElement;
    const id = cell?.dataset?.inlineBid || '';
    const pack = cell ? inlineCellFromRegistry(cell) : null;
    return {
      source: $('sourceText').value,
      docsText: docs['42'],
      html: cell?.innerHTML || '',
      pendingDocOnlySave,
      pendingFullSave,
      dirtyState,
      emergency: JSON.parse(localStorage.getItem('cpxA4EmergencyDraft.v1') || 'null'),
      debug: { id, r: cell?.dataset?.r, c: cell?.dataset?.c, registry: !!tableRegistry[id], pack: !!pack, oninput: typeof cell?.oninput, touched: cell?.dataset?.inlineTouched, next: cell ? inlineCellMarkdown(cell) : '' },
    };
  });
  const expected = '(만 나이 확인),<br>줄바꿈검증 관계가 어떻게 되나요?';
  const actualQuestionLine = live.source.split('\n').find(line => line.includes('아이 이름, 생년월일이 언제인가요?')) || '';
  assert.ok(live.source.includes(expected), `${file}: source missing lowercase <br>: ${actualQuestionLine}; active html=${live.html}; debug=${JSON.stringify(live.debug)}`);
  assert.equal(live.docsText, live.source, `${file}: docs/source mismatch`);
  assert.ok(live.html.toLowerCase().includes('<br>') || live.html.includes('\n'), `${file}: rendered cell missing visual line break`);
  assert.equal(live.pendingDocOnlySave, true, `${file}: table edit did not select personal doc patch`);
  assert.equal(live.pendingFullSave, false, `${file}: table edit incorrectly selected full-state save`);
  assert.equal(live.dirtyState, true, `${file}: table edit not dirty`);
  assert.equal(live.emergency?.text, live.source, `${file}: emergency draft missing table <br>`);

  const localAfterBlur = await page.evaluate(() => {
    $('saveBtn').focus({ preventScroll: true });
    const stored = JSON.parse(localStorage.getItem(LOCAL_DOCS_KEY) || '{}');
    return stored['42'] || '';
  });
  assert.ok(localAfterBlur.includes(expected), `${file}: blur did not synchronously persist the <br> locally`);

  await page.evaluate(() => pushState({ manual: false }));
  const saved = await page.evaluate(() => ({
    requests: window.__saveRequests,
    source: $('sourceText').value,
    dirtyState,
    overlayBase: currentOverlayUpdatedAt,
  }));
  assert.equal(saved.requests.length, 1, `${file}: unexpected save request count`);
  assert.equal(saved.requests[0].url, '/api/doc', `${file}: table edit did not use /api/doc`);
  assert.equal(saved.requests[0].body.doc_id, '42', `${file}: wrong doc id`);
  assert.ok(saved.requests[0].body.text.includes(expected), `${file}: personal save payload lost <br>`);
  assert.equal(saved.source, saved.requests[0].body.text, `${file}: saved/source mismatch`);
  assert.equal(saved.dirtyState, false, `${file}: save did not complete`);
  assert.ok(saved.overlayBase, `${file}: personal overlay base was not advanced`);
  assert.deepEqual(pageErrors, [], `${file}: page errors`);

  await context.close();
  return { file, route: saved.requests[0].url, expected };
}

async function main() {
  const doc42 = actualDoc42();
  const opened = await serveRoot();
  const browser = await launch();
  try {
    const results = [];
    for (const file of ['index.html', 'cpx-a4-editor-local.html']) {
      results.push(await exercise(browser, opened.port, file, doc42));
    }
    console.log(JSON.stringify({ ok: true, actualDoc42: true, results }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => opened.server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
