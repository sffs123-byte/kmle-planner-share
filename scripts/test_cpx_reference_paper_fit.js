const { chromium, webkit } = require('playwright');

const baseUrl = process.env.CPX_BASE_URL || 'http://127.0.0.1:8771';
const files = ['index.html', 'cpx-a4-editor-local.html'];
const iPadUA = 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

async function openReferenceLayout(page, docId = '42') {
  return page.evaluate(async selectedId => {
    document.querySelector('#gate')?.classList.add('hidden');
    const item = seed.items?.find?.(entry => String(entry.id) === String(selectedId));
    current = { id: String(selectedId), title: item?.title || `CC ${selectedId}` };
    const textarea = document.querySelector('#sourceText');
    if (textarea) textarea.value = docs[String(selectedId)] || seed.docs?.[String(selectedId)] || '';
    document.querySelector('#home')?.classList.add('hidden');
    document.querySelector('#work')?.classList.remove('hidden');
    document.body.dataset.activeView = 'work';
    document.body.classList.add('view-mode');
    renderDoc();
    applyMobileMode();
    if (typeof syncReferenceViewportMode === 'function') syncReferenceViewportMode();

    const fingerprint = () => {
      const shell = referenceShell();
      const wrap = shell.querySelector('.doc-wrap');
      const papers = [...wrap.querySelectorAll(':scope > .paper')];
      const sample = [...wrap.querySelectorAll('.doc-body p, .doc-body td, .doc-body th, .doc-body .para, .doc-body .mdList, .doc-body .block')]
        .filter(element => (element.textContent || '').trim().length >= 12)
        .slice(0, 12)
        .map(element => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const rect = element.getBoundingClientRect();
          return {
            text: (element.textContent || '').trim().slice(0, 36),
            offsetWidth: element.offsetWidth,
            offsetHeight: element.offsetHeight,
            scrollHeight: element.scrollHeight,
            visualWidth: rect.width,
            visualHeight: rect.height,
            rangeRects: range.getClientRects().length,
          };
        });
      return {
        shellWidth: shell.getBoundingClientRect().width,
        wrapClientWidth: wrap.clientWidth,
        wrapClientHeight: wrap.clientHeight,
        wrapScrollWidth: wrap.scrollWidth,
        wrapScrollHeight: wrap.scrollHeight,
        wrapVisualWidth: wrap.getBoundingClientRect().width,
        paperCount: papers.length,
        papers: papers.map(paper => {
          const rect = paper.getBoundingClientRect();
          const body = paper.querySelector('.doc-body');
          const bodyRect = body?.getBoundingClientRect();
          return {
            offsetWidth: paper.offsetWidth,
            offsetHeight: paper.offsetHeight,
            visualWidth: rect.width,
            visualHeight: rect.height,
            zoom: getComputedStyle(paper).zoom,
            bodyOffsetWidth: body?.offsetWidth || 0,
            bodyOffsetHeight: body?.offsetHeight || 0,
            bodyScrollHeight: body?.scrollHeight || 0,
            bodyVisualWidth: bodyRect?.width || 0,
            bodyVisualHeight: bodyRect?.height || 0,
          };
        }),
        sample,
      };
    };

    const before = fingerprint();
    history.replaceState({}, '', `/doc/${encodeURIComponent(selectedId)}`);
    const shell = referenceShell();
    if (typeof ensureReferenceSlotUi === 'function') ensureReferenceSlotUi();
    shell.dataset.side = 'team4';
    shell.dataset.refType = 'hankeut';
    shell.dataset.slotOpen = '1';
    shell.classList.add('reference-available', 'reference-ready');
    setReferenceScrollLock(true);
    if (typeof updateReferenceControls === 'function') updateReferenceControls();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    syncReferenceFitScale();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = fingerprint();
    const wrap = shell.querySelector('.doc-wrap');
    const papers = [...wrap.querySelectorAll(':scope > .paper')];
    wrap.scrollTop = wrap.scrollHeight;
    await new Promise(resolve => requestAnimationFrame(resolve));
    const wrapRect = wrap.getBoundingClientRect();
    const lastRect = papers.at(-1)?.getBoundingClientRect();
    const panel = shell.querySelector('.reference-panel.team4');
    const panelRect = panel.getBoundingClientRect();
    const closeButton = shell.querySelector('.reference-close-btn');
    const closeRect = closeButton?.getBoundingClientRect();
    const slider = document.querySelector('.slider-rail');
    const sliderRect = slider?.getBoundingClientRect();
    return {
      bodyClass: document.body.className,
      before,
      after,
      reach: {
        scrollTop: wrap.scrollTop,
        scrollHeight: wrap.scrollHeight,
        clientHeight: wrap.clientHeight,
        lastBottom: lastRect?.bottom || 0,
        viewportBottom: wrapRect.bottom,
        canReachBottom: !!lastRect && lastRect.bottom <= wrapRect.bottom + 2,
      },
      panel: {
        display: getComputedStyle(panel).display,
        position: getComputedStyle(panel).position,
        width: panelRect.width,
        left: panelRect.left,
        right: panelRect.right,
      },
      closeButton: closeRect ? { left: closeRect.left, right: closeRect.right, top: closeRect.top, bottom: closeRect.bottom, width: closeRect.width, height: closeRect.height } : null,
      slider: sliderRect ? { display: getComputedStyle(slider).display, left: sliderRect.left, right: sliderRect.right, top: sliderRect.top, bottom: sliderRect.bottom } : null,
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, docId);
}

function assertLayoutInvariant(label, state) {
  const { before, after } = state;
  if (before.paperCount !== after.paperCount) throw new Error(`${label} page count changed: ${JSON.stringify(state)}`);
  after.papers.forEach((paper, index) => {
    const original = before.papers[index];
    if (Math.abs(paper.offsetWidth - original.offsetWidth) > 1
      || Math.abs(paper.offsetHeight - original.offsetHeight) > 1
      || Math.abs(paper.bodyOffsetWidth - original.bodyOffsetWidth) > 1
      || Math.abs(paper.bodyScrollHeight - original.bodyScrollHeight) > 1) {
      throw new Error(`${label} A4 layout reflowed: ${JSON.stringify({ before, after })}`);
    }
  });
  after.sample.forEach((entry, index) => {
    const original = before.sample[index];
    if (!original || entry.text !== original.text
      || Math.abs(entry.offsetWidth - original.offsetWidth) > 1
      || Math.abs(entry.offsetHeight - original.offsetHeight) > 1
      || Math.abs(entry.scrollHeight - original.scrollHeight) > 1
      || entry.rangeRects !== original.rangeRects) {
      throw new Error(`${label} text line layout changed: ${JSON.stringify({ original, entry })}`);
    }
  });
}

function assertUniformScale(label, state) {
  const paper = state.after.papers[0];
  const paperScale = paper.visualWidth / Math.max(1, paper.offsetWidth);
  const bodyScale = paper.bodyVisualWidth / Math.max(1, paper.bodyOffsetWidth);
  if (Math.abs(paperScale - bodyScale) > 0.015) {
    throw new Error(`${label} paper/content scale diverged: ${JSON.stringify({ paperScale, bodyScale, state })}`);
  }
  const slotRequiresScale = state.after.wrapClientWidth < paper.offsetWidth - 2;
  if (slotRequiresScale && paperScale >= 0.995) {
    throw new Error(`${label} A4 did not scale to reference slot: ${JSON.stringify({ paperScale, state })}`);
  }
  if (paper.visualWidth > state.after.wrapClientWidth + 2) {
    throw new Error(`${label} scaled A4 exceeds reference slot: ${JSON.stringify({ paperScale, state })}`);
  }
  if (paperScale < 0.34 || paperScale > 1.01) {
    throw new Error(`${label} invalid A4 scale: ${JSON.stringify({ paperScale, state })}`);
  }
  if (!state.reach.canReachBottom || state.reach.scrollHeight > state.reach.clientHeight + state.reach.scrollTop + 2) {
    throw new Error(`${label} scaled A4 bottom is unreachable: ${JSON.stringify(state.reach)}`);
  }
  if (state.panel.right > state.viewport.width + 1 || !state.closeButton || state.closeButton.right > state.viewport.width + 1) {
    throw new Error(`${label} reference panel controls leave viewport: ${JSON.stringify({ panel: state.panel, closeButton: state.closeButton, viewport: state.viewport })}`);
  }
  if (state.closeButton.width < 43.5 || state.closeButton.height < 43.5) {
    throw new Error(`${label} reference close target is smaller than 44px: ${JSON.stringify(state.closeButton)}`);
  }
  if (state.slider?.display !== 'none' && state.closeButton
    && state.closeButton.right > state.slider.left
    && state.closeButton.left < state.slider.right
    && state.closeButton.bottom > state.slider.top
    && state.closeButton.top < state.slider.bottom) {
    throw new Error(`${label} reference close button overlaps size controls: ${JSON.stringify({ closeButton: state.closeButton, slider: state.slider })}`);
  }
  if (state.bodyClass.includes('touch-tablet-mode') && state.viewport.width >= 900 && state.panel.width < 280) {
    throw new Error(`${label} iPad reference panel is too narrow: ${JSON.stringify(state.panel)}`);
  }
  return paperScale;
}

(async () => {
  const requestedEngines = new Set(String(process.env.CPX_ENGINES || 'chromium,webkit').split(',').map(value => value.trim()).filter(Boolean));
  const engines = [['chromium', chromium], ['webkit', webkit]].filter(([name]) => requestedEngines.has(name));
  const specs = [
    { name: 'desktop-1180', width: 1180, height: 820, touch: false, shouldFit: true },
    { name: 'desktop-1024', width: 1024, height: 768, touch: false, shouldFit: true },
    { name: 'desktop-900', width: 900, height: 768, touch: false, shouldFit: true },
    { name: 'desktop-drawer-820', width: 820, height: 780, touch: false, shouldFit: false },
    { name: 'ipad-1180', width: 1180, height: 820, touch: true, shouldFit: true },
    { name: 'ipad-1024', width: 1024, height: 768, touch: true, shouldFit: true },
  ];
  for (const [engineName, engine] of engines) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const file of files) {
        for (const spec of specs) {
          const docIds = spec.name.endsWith('1024') ? ['42', '40-1'] : ['42'];
          for (const docId of docIds) {
            const page = await browser.newPage({
              viewport: { width: spec.width, height: spec.height },
              isMobile: spec.touch,
              hasTouch: spec.touch,
              deviceScaleFactor: spec.touch ? 2 : 1,
              userAgent: spec.touch ? iPadUA : undefined,
              serviceWorkers: 'block',
            });
            await page.goto(`${baseUrl}/${file}?reference-paper-fit=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForFunction(() => typeof renderDoc === 'function' && typeof referenceShell === 'function');
            const state = await openReferenceLayout(page, docId);
            const label = `${engineName} ${file} ${spec.name} doc${docId}`;
            assertLayoutInvariant(label, state);
            const scale = assertUniformScale(label, state);
            if (docId === '40-1' && state.after.paperCount < 2) {
              throw new Error(`${label} expected multiple A4 pages: ${JSON.stringify(state.after)}`);
            }
            if (process.env.CPX_REFERENCE_PAPER_SCREENSHOT && engineName === 'chromium' && file === 'index.html' && spec.name === 'ipad-1180' && docId === '42') {
              await page.screenshot({ path: process.env.CPX_REFERENCE_PAPER_SCREENSHOT, fullPage: false });
            }
            await page.locator('#referenceCloseBtn').click({ timeout: 5000 });
            await page.waitForFunction(() => {
              const shell = document.querySelector('#referenceShell');
              return shell?.dataset.slotOpen === '0' && !shell.classList.contains('reference-ready');
            }, null, { timeout: 5000 });
            console.log(`${label} PASS scale=${scale.toFixed(4)} paper=${state.after.papers[0].visualWidth.toFixed(1)} slot=${state.after.wrapClientWidth}`);
            await page.close();
          }
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
