#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SYNTHETIC = [
  '# 48 locator fixture',
  '',
  '|||',
  '',
  '| 첫 표 | 값 |',
  '|---|---|',
  '| 유지 | alpha |',
  '',
  '중간 문단',
  '',
  '| 두번째 표 | 값 |',
  '|---|---|',
  '| 대상 | beta |',
].join('\n');

function loadActualDoc48() {
  const dbPath = process.env.CPX_TEST_DB_PATH;
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db.prepare('SELECT overlay_json FROM a4_personal_overlays ORDER BY updated_at DESC').all();
    for (const row of rows) {
      const overlay = JSON.parse(row.overlay_json || '{}');
      if (typeof overlay.docs?.['48'] === 'string' && overlay.docs['48']) return overlay.docs['48'];
    }
    return null;
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

async function prepare(page, port, file, source) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.openDoc === 'function');
  await page.evaluate(sourceText => {
    localStorage.clear();
    saveAuth({ id: 'locator-test', token: 'test-token', nickname: 'Locator test', a4Role: 'student' });
    shouldPullStateOnDocOpen = () => false;
    updatePresence = async () => {};
    pushState = async () => {};
    setupReferenceComparison = async () => {};
    docs['48'] = sourceText;
  }, source);
  await page.evaluate(async () => { await openDoc('48', { route: false }); });
  await page.waitForSelector('.table-wrap');
  assert.deepEqual(errors, [], `${file}: page errors`);
}

async function exercise(browser, port, file, source, targetNeedle, expectedTables, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  await prepare(page, port, file, source);
  const result = await page.evaluate(({ targetNeedle, marker }) => {
    const sourceBefore = $('sourceText').value;
    const registry = Object.entries(tableRegistry || {});
    const chosen = targetNeedle
      ? registry.find(([, info]) => String(info.raw || '').includes(targetNeedle))
      : registry.sort((a, b) => String(b[1].raw || '').length - String(a[1].raw || '').length)[0];
    if (!chosen) throw new Error('target table not found');
    openTableEditor(chosen[0]);
    const edit = activeTableEdit;
    if (!edit?.sourceLocator) throw new Error('source locator missing: ' + JSON.stringify({
      sourceChars: sourceBefore.length,
      sourceBlocks: tableSourceBlocks(sourceBefore).map(block => block.raw.length),
      registryTables: registry.map(([, info]) => ({ chars: String(info.raw || '').length, occurrence: info.occurrence })),
      chosenChars: String(edit?.raw || '').length,
      chosenOccurrence: edit?.occurrence,
      exactInSource: sourceBefore.includes(String(edit?.raw || '')),
    }));

    const driftLines = String(edit.raw).split('\n');
    const driftRow = Math.max(2, driftLines.length - 1);
    driftLines[driftRow] = driftLines[driftRow].replace(/\|\s*$/, '<br>동시변경 |');
    const driftRaw = driftLines.join('\n');
    if (driftRaw === edit.raw) throw new Error('failed to create stale table raw');
    const driftedSource = sourceBefore.replace(edit.raw, driftRaw);
    if (driftedSource === sourceBefore) throw new Error('table raw not found in source');

    let changed = false;
    for (let r = 1; r < edit.model.length && !changed; r++) {
      for (let c = 0; c < edit.model[r].length; c++) {
        const cell = edit.model[r][c];
        if (cell && !cell.covered && String(cell.text || '').trim()) {
          cell.text = String(cell.text) + marker;
          changed = true;
          break;
        }
      }
    }
    if (!changed) throw new Error('editable data cell not found');
    edit.selected = [];
    const replacement = modelToMarkdown(edit.model);
    const preview = replaceTableEditSourceRebased(driftedSource, edit, replacement);
    $('sourceText').value = driftedSource;
    docs['48'] = driftedSource;
    $('applyTableEditor').click();
    const sourceAfter = $('sourceText').value;
    return {
      validBlocksBefore: tableSourceBlocks(sourceBefore).length,
      validBlocksAfter: tableSourceBlocks(sourceAfter).length,
      rawPipeMarkersBefore: (sourceBefore.match(/^\|\|\|$/gm) || []).length,
      rawPipeMarkersAfter: (sourceAfter.match(/^\|\|\|$/gm) || []).length,
      locatorOrdinal: edit.sourceLocator.ordinal,
      previewMethod: preview.method,
      markerCount: sourceAfter.split(marker).length - 1,
      modalHidden: $('tableModal').classList.contains('hidden'),
      errorShown: /표 원본 위치를 찾지 못/.test($('docStatus')?.textContent || ''),
    };
  }, { targetNeedle, marker: ` [${label}]` });

  assert.equal(result.validBlocksBefore, expectedTables, `${file}/${label}: ||| was counted as a table`);
  assert.equal(result.validBlocksAfter, expectedTables, `${file}/${label}: table count changed`);
  assert.equal(result.rawPipeMarkersAfter, result.rawPipeMarkersBefore, `${file}/${label}: ||| marker changed`);
  assert.match(result.previewMethod, /^locator-(?:anchor|rebase)$/, `${file}/${label}: stale raw did not use locator rebase`);
  assert.equal(result.markerCount, 1, `${file}/${label}: edited table was not applied exactly once`);
  assert.equal(result.modalHidden, true, `${file}/${label}: modal stayed open after apply`);
  assert.equal(result.errorShown, false, `${file}/${label}: missing-source error was shown`);
  await context.close();
  return { file, label, tables: result.validBlocksAfter, locatorOrdinal: result.locatorOrdinal };
}

async function main() {
  const opened = await serveRoot();
  const browser = await launch();
  const actual = loadActualDoc48();
  try {
    const results = [];
    for (const file of ['index.html', 'cpx-a4-editor-local.html']) {
      results.push(await exercise(browser, opened.port, file, SYNTHETIC, '두번째 표', 2, 'synthetic'));
      if (actual) results.push(await exercise(browser, opened.port, file, actual, '', 1, 'actual-doc48'));
    }
    console.log(JSON.stringify({ ok: true, actualDoc48: !!actual, results }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => opened.server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
