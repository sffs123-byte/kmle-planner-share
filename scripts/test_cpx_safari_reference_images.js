const { chromium, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const files = ['index.html', 'cpx-a4-editor-local.html'];
const baseUrl = String(process.env.CPX_BASE_URL || 'http://127.0.0.1:8766').replace(/\/$/, '');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cpx-reference-manifest.json'), 'utf8'));
const itemKey = String(process.env.CPX_REFERENCE_ITEM || '1');
const fixture = manifest.items[itemKey];
const expectedPages = {
  hankeut: fixture?.hankeut?.pages?.length || 0,
  checklist: fixture?.checklist?.pages?.length || 0,
  team4: fixture?.team4?.[0]?.pages?.length || 0,
};

if (!fixture || Object.values(expectedPages).some(count => count < 2)) {
  throw new Error(`reference item ${itemKey} is incomplete: ${JSON.stringify(expectedPages)}`);
}

async function prepareReference(page) {
  await page.evaluate((item) => {
    document.querySelector('#home')?.classList.add('hidden');
    document.querySelector('#work')?.classList.remove('hidden');
    document.body.dataset.activeView = 'work';
    document.body.classList.add('view-mode');
    current = { id: '1', title: 'Safari 참고자료 시험' };
    referenceManifest = { items: { 1: item } };
    applyMobileMode();
    const shell = referenceShell();
    shell.dataset.slotOpen = '0';
    shell.dataset.refType = 'hankeut';
    shell.classList.add('reference-available');
    ensureReferenceSlotUi();
    renderReferenceSlotPicker(item);
    updateReferenceControls();
    openReferenceSlot('hankeut');
  }, fixture);
}

async function waitForSlot(page, kind, expectedMode, expectedPages) {
  await page.waitForFunction(({ kind, expectedMode, expectedPages }) => {
    const shell = referenceShell();
    if (shell.dataset.refType !== kind || !shell.classList.contains('reference-ready')) return false;
    const body = document.querySelector('#team4RefBody');
    if (expectedMode === 'iframe') {
      const frame = body?.querySelector('iframe[data-ref-pdf-path]');
      return !!frame && frame.dataset.refPdfPath && frame.getAttribute('src') !== 'about:blank';
    }
    return body?.querySelectorAll('.reference-image-view .reference-page').length === expectedPages
      && body.querySelectorAll('iframe').length === 0;
  }, { kind, expectedMode, expectedPages }, { timeout: 5000 });
}

async function slotSnapshot(page, kind) {
  return page.evaluate((kind) => {
    const body = document.querySelector('#team4RefBody');
    const view = body.querySelector('.reference-image-view');
    const images = [...body.querySelectorAll('.reference-image-view img')];
    const scroller = body.scrollHeight > body.clientHeight ? body : view;
    if (scroller) scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const link = body.querySelector('.reference-pdf-link');
    return {
      kind,
      macSafari: referenceIsMacSafari(),
      iframeCount: body.querySelectorAll('iframe').length,
      pageCount: body.querySelectorAll('.reference-image-view .reference-page').length,
      eagerImages: images.filter(img => img.getAttribute('src')).length,
      zoomButtons: body.querySelectorAll('.reference-zoombar button').length,
      originalPdf: link?.getAttribute('href') || '',
      scrollContainer: scroller === body ? 'body' : 'image-view',
      scrollHeight: scroller?.scrollHeight || 0,
      clientHeight: scroller?.clientHeight || 0,
      scrollTop: scroller?.scrollTop || 0,
    };
  }, kind);
}

async function switchSlot(page, kind, expectedMode, expectedPages) {
  await page.evaluate(kind => setReferenceSlotType(kind, true), kind);
  await waitForSlot(page, kind, expectedMode, expectedPages);
  return slotSnapshot(page, kind);
}

async function runEngine(engine, browserType) {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const file of files) {
      const errors = [];
      const page = await browser.newPage({ viewport: { width: 1130, height: 780 } });
      await page.route(/\.pdf(?:[?#]|$)/i, route => route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: '%PDF-1.4\n%%EOF\n',
      }));
      await page.route('**/api/auth/google/challenge', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ challengeId: 'reference-test', nonce: 'reference-test' }),
      }));
      page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
      page.on('console', message => {
        const url = message.location().url || '';
        const localGoogleOriginNoise = /(?:accounts\.google\.com|ssl\.gstatic\.com)/.test(url)
          && /(?:403|GSI_LOGGER|origin is not allowed)/i.test(message.text());
        if (message.type() === 'error' && !localGoogleOriginNoise) {
          errors.push(`console: ${message.text()} @ ${url || 'unknown'}`);
        }
      });
      await page.goto(`${baseUrl}/${file}?safari-reference-images=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await prepareReference(page);

      const expectedMode = engine === 'webkit' ? 'images' : 'iframe';
      const expectedSafari = engine === 'webkit';
      const results = [];
      await waitForSlot(page, 'hankeut', expectedMode, expectedPages.hankeut);
      results.push(await slotSnapshot(page, 'hankeut'));
      results.push(await switchSlot(page, 'checklist', expectedMode, expectedPages.checklist));
      results.push(await switchSlot(page, 'team4', expectedMode, expectedPages.team4));

      for (const result of results) {
        if (result.macSafari !== expectedSafari) {
          throw new Error(`${engine} ${file} Safari detection mismatch: ${JSON.stringify(result)}`);
        }
        if (expectedMode === 'iframe') {
          if (result.iframeCount !== 1 || result.pageCount !== 0 || result.originalPdf) {
            throw new Error(`${engine} ${file} ${result.kind} native iframe changed: ${JSON.stringify(result)}`);
          }
        } else {
          const expectedCount = expectedPages[result.kind];
          if (result.iframeCount !== 0 || result.pageCount !== expectedCount || result.eagerImages < 2
            || result.zoomButtons !== 2 || !result.originalPdf.includes('.pdf') || result.scrollHeight <= result.clientHeight
            || result.scrollTop <= 0) {
            throw new Error(`${engine} ${file} ${result.kind} image stack failed: ${JSON.stringify(result)}`);
          }
        }
      }
      if (errors.length) {
        throw new Error(`${engine} ${file} browser errors: ${errors.join(' | ')}`);
      }
      console.log(`${file} ${engine} ${expectedMode} PASS (${itemKey}: 한끝 ${expectedPages.hankeut} · 체크 ${expectedPages.checklist} · 4조 ${expectedPages.team4})`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

(async () => {
  await runEngine('chromium', chromium);
  await runEngine('webkit', webkit);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
