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
    const papers = [...document.querySelectorAll('.doc-wrap > .paper, .doc-wrap > .ref-paper-slot > .paper')];
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

async function prepareReference(page, kind, docId = '42') {
  return page.evaluate(async ({ requestedKind, docId }) => {
    document.querySelector('#gate')?.classList.add('hidden');
    if (!referenceManifest) {
      referenceManifest = await fetch('data/cpx-reference-manifest.json').then(response => response.json());
    }
    const item = referenceManifest?.items?.[String(docId)] || null;
    if (!item) throw new Error(`reference manifest item ${docId} missing`);
    const title = seed.items?.find?.(entry => String(entry.id) === String(docId))?.title || `CC ${docId}`;
    current = { id: String(docId), title };
    const source = docs[String(docId)] || seed.docs?.[String(docId)] || '';
    const textarea = document.querySelector('#sourceText');
    if (textarea) textarea.value = source;
    document.querySelector('#home')?.classList.add('hidden');
    document.querySelector('#work')?.classList.remove('hidden');
    document.body.dataset.activeView = 'work';
    document.body.classList.add('view-mode');
    renderDoc();
    applyMobileMode();
    const layoutFingerprint = () => {
      const wrap = document.querySelector('.doc-wrap');
      const papers = [...wrap.querySelectorAll(':scope > .paper, :scope > .ref-paper-slot > .paper')];
      return {
        wrapClientWidth: wrap.clientWidth,
        wrapScrollWidth: wrap.scrollWidth,
        paperCount: papers.length,
        papers: papers.map(paper => ({
          hasSlot: paper.parentElement?.classList.contains('ref-paper-slot') || false,
          slotWidth: paper.parentElement?.classList.contains('ref-paper-slot') ? paper.parentElement.getBoundingClientRect().width : 0,
          slotHeight: paper.parentElement?.classList.contains('ref-paper-slot') ? paper.parentElement.getBoundingClientRect().height : 0,
          offsetWidth: paper.offsetWidth,
          offsetHeight: paper.offsetHeight,
          visualWidth: paper.getBoundingClientRect().width,
          visualHeight: paper.getBoundingClientRect().height,
          scale: paper.offsetWidth ? paper.getBoundingClientRect().width / paper.offsetWidth : 1,
          transform: getComputedStyle(paper).transform,
          zoom: getComputedStyle(paper).zoom,
          bodyScrollHeight: paper.querySelector('.doc-body')?.scrollHeight || 0,
          bodyClientHeight: paper.querySelector('.doc-body')?.clientHeight || 0,
        })),
      };
    };
    const before = layoutFingerprint();
    history.replaceState({}, '', `/doc/${encodeURIComponent(docId)}`);
    const shell = referenceShell();
    shell.dataset.refType = requestedKind;
    shell.dataset.slotOpen = '1';
    shell.classList.add('reference-available', 'reference-ready');
    setReferenceScrollLock(true);
    const ref = requestedKind === 'hankeut' ? item.hankeut : item.checklist;
    referenceRenderPdfSlot(requestedKind, ref, ref?.title || requestedKind, requestedKind);
    syncReferenceFitScale();
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
    const after = layoutFingerprint();
    const main = shell.querySelector('.doc-wrap');
    const mainPapers = [...main.querySelectorAll(':scope > .paper, :scope > .ref-paper-slot > .paper')];
    main.scrollTop = main.scrollHeight;
    await new Promise(resolve => requestAnimationFrame(resolve));
    const mainRect = main.getBoundingClientRect();
    const lastMainRect = mainPapers.at(-1)?.getBoundingClientRect();
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
      layout: { before, after },
      main: {
        overflowY: getComputedStyle(main).overflowY,
        touchAction: getComputedStyle(main).touchAction,
        clientHeight: main.clientHeight,
        scrollHeight: main.scrollHeight,
        scrollTop: main.scrollTop,
        paperCount: mainPapers.length,
        canReachBottom: main.scrollHeight <= main.clientHeight + main.scrollTop + 2,
        lastVisibleAtMax: !!lastMainRect && lastMainRect.bottom <= mainRect.bottom + 2,
      },
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
  }, { requestedKind: kind, docId });
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
          { name: 'portrait-820', width: 820, height: 1180 },
          { name: 'portrait-1024', width: 1024, height: 1180 },
          { name: 'landscape-1180', width: 1180, height: 820 },
          { name: 'landscape-1024', width: 1024, height: 768 },
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
          const shouldOpenReference = spec.name !== 'portrait-820';
          const reference = shouldOpenReference ? {
            hankeut: await prepareReference(page, 'hankeut', '42'),
            checklist: await prepareReference(page, 'checklist', '42'),
          } : null;
          console.log(JSON.stringify({ engineName, file, spec: spec.name, doc, multiPageDoc, reference }));
          if (shouldOpenReference) {
            if (doc.stage.clientHeight > spec.height + 2 || !doc.lastVisibleAtMax) {
              throw new Error(`${engineName} ${file} iPad A4 bottom is clipped: ${JSON.stringify(doc)}`);
            }
            if (multiPageDoc.paperCount < 2 || multiPageDoc.stage.clientHeight > spec.height + 2 || !multiPageDoc.lastVisibleAtMax) {
              throw new Error(`${engineName} ${file} iPad multi-page A4 bottom is clipped: ${JSON.stringify(multiPageDoc)}`);
            }
            for (const [kind, state] of Object.entries(reference)) {
              if (!state.enabled || state.mobileRead) {
                throw new Error(`${engineName} ${file} iPad reference viewport disabled for ${spec.name} ${kind}: ${JSON.stringify(state)}`);
              }
              if (state.layout.before.paperCount !== state.layout.after.paperCount
                || state.layout.after.papers.some((paper, index) => {
                  const before = state.layout.before.papers[index];
                  const scaled = paper.scale < 0.995;
                  return Math.abs(paper.offsetWidth - before.offsetWidth) > 1
                    || Math.abs(paper.offsetHeight - before.offsetHeight) > 1
                    || Math.abs(paper.bodyScrollHeight - before.bodyScrollHeight) > 1
                    || paper.zoom !== '1'
                    || !paper.hasSlot
                    || !scaled
                    || paper.transform === 'none'
                    || Math.abs(paper.slotWidth - paper.visualWidth) > 2
                    || Math.abs(paper.slotHeight - paper.visualHeight) > 2;
                })) {
                throw new Error(`${engineName} ${file} iPad A4 transform footprint failed after opening ${kind}: ${JSON.stringify(state.layout)}`);
              }
              if (!state.main.canReachBottom || !state.main.lastVisibleAtMax || state.main.overflowY === 'hidden' || state.main.touchAction !== 'pan-y') {
                throw new Error(`${engineName} ${file} iPad main A4 comparison scroll failed: ${JSON.stringify(state.main)}`);
              }
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
