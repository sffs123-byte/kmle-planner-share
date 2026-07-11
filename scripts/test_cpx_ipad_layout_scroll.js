const { chromium, webkit } = require('playwright');

const files = ['index.html', 'cpx-a4-editor-local.html'];
const baseUrl = String(process.env.CPX_BASE_URL || 'http://127.0.0.1:8766').replace(/\/$/, '');
const iPadUA = 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

async function openSeedDoc(page, id = '42') {
  return page.evaluate(async docId => {
    document.querySelector('#gate')?.classList.add('hidden');
    document.querySelector('#home')?.classList.add('hidden');
    document.querySelector('#work')?.classList.remove('hidden');
    document.body.dataset.activeView = 'work';
    const title = seed.items?.find?.(item => String(item.id) === String(docId))?.title || `CC ${docId}`;
    current = { id: String(docId), title };
    const source = docs[String(docId)] || seed.docs?.[String(docId)] || '';
    const textarea = document.querySelector('#sourceText');
    if (textarea) textarea.value = source;
    document.body.classList.add('view-mode');
    renderDoc();
    applyMobileMode();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const stage = document.querySelector('.stage');
    const papers = [...document.querySelectorAll('.doc-wrap > .paper')];
    stage.scrollTop = stage.scrollHeight;
    await new Promise(resolve => requestAnimationFrame(resolve));
    const stageRect = stage.getBoundingClientRect();
    const lastRect = papers.at(-1)?.getBoundingClientRect();
    return {
      mobileRead: document.body.classList.contains('mobile-read-mode'),
      bodyClass: document.body.className,
      work: (() => { const work = document.querySelector('.work'); const style = getComputedStyle(work); return { clientHeight: work.clientHeight, height: style.height, rows: style.gridTemplateRows }; })(),
      viewport: viewportSize(),
      stage: {
        clientHeight: stage.clientHeight,
        scrollHeight: stage.scrollHeight,
        scrollTop: stage.scrollTop,
        bottom: stageRect.bottom,
      },
      wrap: {
        cssHeight: getComputedStyle(document.querySelector('.doc-wrap')).height,
        scrollHeight: document.querySelector('.doc-wrap').scrollHeight,
      },
      paperCount: papers.length,
      papers: papers.map(paper => {
        const body = paper.querySelector('.doc-body');
        const rect = paper.getBoundingClientRect();
        const bodyRect = body?.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          clientHeight: paper.clientHeight,
          scrollHeight: paper.scrollHeight,
          bodyClientHeight: body?.clientHeight || 0,
          bodyScrollHeight: body?.scrollHeight || 0,
          bodyBottom: bodyRect?.bottom || 0,
          innerBottom: rect.bottom - parseFloat(getComputedStyle(paper).paddingBottom || '0'),
          fontSize: getComputedStyle(body).fontSize,
          lineHeight: getComputedStyle(body).lineHeight,
        };
      }),
      lastVisibleAtMax: !!lastRect && lastRect.bottom <= stageRect.bottom + 1,
      lastBottom: lastRect?.bottom || 0,
    };
  }, id);
}

async function prepareReference(page, kind) {
  return page.evaluate(async requestedKind => {
    document.querySelector('#gate')?.classList.add('hidden');
    if (!referenceManifest) {
      referenceManifest = await fetch('data/cpx-reference-manifest.json').then(response => response.json());
    }
    const item = referenceManifest?.items?.['1'] || null;
    if (!item) throw new Error('reference manifest item 1 missing');
    current = { id: '1', title: '급성 복통' };
    document.querySelector('#home')?.classList.add('hidden');
    document.querySelector('#work')?.classList.remove('hidden');
    document.body.dataset.activeView = 'work';
    document.body.classList.add('view-mode');
    applyMobileMode();
    const shell = referenceShell();
    shell.dataset.refType = requestedKind;
    shell.dataset.slotOpen = '1';
    shell.classList.add('reference-available', 'reference-ready');
    setReferenceScrollLock(true);
    const ref = requestedKind === 'hankeut' ? item.hankeut : item.checklist;
    referenceRenderPdfSlot(requestedKind, ref, ref?.title || requestedKind, requestedKind);
    const body = document.querySelector('#team4RefBody');
    for (let i = 0; i < 120; i++) {
      if (body?.querySelectorAll?.('.reference-pdf-canvas-page').length) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    for (let i = 0; i < 200; i++) {
      if (body?.querySelector?.('.reference-pdf-canvas-page[data-rendered="1"]')) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const frame = body.querySelector('iframe[data-ref-pdf-path]');
    const images = [...body.querySelectorAll('.reference-page img')];
    body.scrollTop = body.scrollHeight;
    await new Promise(resolve => setTimeout(resolve, 180));
    body.scrollTop = body.scrollHeight;
    for (let i = 0; i < 200; i++) {
      const last = body.querySelector('.reference-pdf-canvas-page:last-child');
      if (last?.dataset.rendered === '1') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      enabled: referenceViewportEnabled(),
      mobileRead: document.body.classList.contains('mobile-read-mode'),
      pdfFrame: !!frame,
      imageCount: images.length,
      canvasPageCount: body.querySelectorAll('.reference-pdf-canvas-page').length,
      renderedCanvasCount: body.querySelectorAll('.reference-pdf-canvas-page[data-rendered="1"]').length,
      lastCanvasRendered: body.querySelector('.reference-pdf-canvas-page:last-child')?.dataset.rendered === '1',
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyScrollTop: body.scrollTop,
      canReachBottom: body.scrollHeight <= body.clientHeight + body.scrollTop + 2,
      firstImageSrc: images[0]?.currentSrc || images[0]?.src || '',
    };
  }, kind);
}

(async () => {
  const engines = [
    ['chromium', chromium],
    ['webkit', webkit],
  ];
  for (const [engineName, engine] of engines) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const file of files) {
        for (const spec of [
          { name: 'portrait', width: 820, height: 1180 },
          { name: 'landscape', width: 1180, height: 820 },
        ]) {
          const page = await browser.newPage({
            viewport: { width: spec.width, height: spec.height },
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 2,
            userAgent: iPadUA,
          });
          await page.goto(`${baseUrl}/${file}?ipad-layout-scroll-test=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForFunction(() => typeof renderDoc === 'function' && typeof referenceViewportEnabled === 'function');
          const doc = await openSeedDoc(page, '42');
          const multiPageDoc = await openSeedDoc(page, '40-1');
          const reference = spec.name === 'landscape' ? {
            hankeut: await prepareReference(page, 'hankeut'),
            checklist: await prepareReference(page, 'checklist'),
          } : null;
          console.log(JSON.stringify({ engineName, file, spec: spec.name, doc, multiPageDoc, reference }));
          if (spec.name === 'landscape') {
            if (doc.stage.clientHeight > spec.height + 2 || !doc.lastVisibleAtMax) {
              throw new Error(`${engineName} ${file} iPad A4 bottom is clipped: ${JSON.stringify(doc)}`);
            }
            if (multiPageDoc.paperCount < 2 || multiPageDoc.stage.clientHeight > spec.height + 2 || !multiPageDoc.lastVisibleAtMax) {
              throw new Error(`${engineName} ${file} iPad multi-page A4 bottom is clipped: ${JSON.stringify(multiPageDoc)}`);
            }
            for (const [kind, state] of Object.entries(reference)) {
              if (state.pdfFrame || state.canvasPageCount < 2 || !state.canReachBottom || !state.lastCanvasRendered) {
                throw new Error(`${engineName} ${file} iPad ${kind} scroll failed: ${JSON.stringify(state)}`);
              }
            }
          }
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
