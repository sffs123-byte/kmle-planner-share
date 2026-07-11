const { chromium } = require('playwright');

const files = ['index.html', 'cpx-a4-editor-local.html'];
const baseUrl = String(process.env.CPX_BASE_URL || 'http://127.0.0.1:8766').replace(/\/$/, '');
const desktopWidths = [700, 820, 899, 1130];

async function prepareReference(page) {
  return page.evaluate(() => {
    document.querySelector('#home')?.classList.add('hidden');
    document.querySelector('#work')?.classList.remove('hidden');
    document.body.dataset.activeView = 'work';
    current = { id: '1', title: '반응형 참고자료 시험' };
    referenceManifest = {
      items: {
        1: {
          hankeut: { title: '한끝 시험 자료', pdf: 'assets/cpx-references/hankeut/1/excerpt.pdf' },
        },
      },
    };
    applyMobileMode();
    document.body.classList.add('view-mode');
    const shell = referenceShell();
    shell.dataset.slotOpen = '0';
    syncReferenceComparisonVisibility();
    ensureReferenceSlotUi();
    updateReferenceControls();
    const button = document.querySelector('#referenceRightBtn');
    const rect = button.getBoundingClientRect();
    return {
      enabled: referenceViewportEnabled(),
      compact: document.body.classList.contains('reference-compact-viewport'),
      mobileRead: document.body.classList.contains('mobile-read-mode'),
      available: shell.classList.contains('reference-available'),
      buttonDisplay: getComputedStyle(button).display,
      buttonRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      label: button.textContent.trim(),
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const file of files) {
      for (const width of desktopWidths) {
        const page = await browser.newPage({ viewport: { width, height: 780 } });
        await page.goto(`${baseUrl}/${file}?reference-responsive-test=${Date.now()}`, { waitUntil: 'domcontentloaded' });
        const initial = await prepareReference(page);
        if (!initial.enabled || !initial.available || initial.mobileRead || initial.buttonDisplay === 'none'
          || initial.buttonRect.right <= initial.buttonRect.left || !initial.label.includes('참고자료')) {
          throw new Error(`${file} ${width}px desktop launcher missing: ${JSON.stringify(initial)}`);
        }
        if ((width < 900) !== initial.compact) {
          throw new Error(`${file} ${width}px compact mode mismatch: ${JSON.stringify(initial)}`);
        }

        await page.click('#referenceRightBtn');
        await page.waitForFunction(() => {
          const frame = document.querySelector('#team4RefPanel iframe[data-ref-pdf-path]');
          return frame?.getAttribute('src')?.includes('excerpt.pdf');
        }, null, { timeout: 2500 });
        const opened = await page.evaluate(() => {
          const shell = referenceShell();
          const panel = document.querySelector('#team4RefPanel');
          const rect = panel.getBoundingClientRect();
          const close = document.querySelector('#referenceCloseBtn');
          const frame = panel.querySelector('iframe[data-ref-pdf-path]');
          return {
            ready: shell.classList.contains('reference-ready'),
            locked: document.body.classList.contains('reference-scroll-lock'),
            panelDisplay: getComputedStyle(panel).display,
            panelPosition: getComputedStyle(panel).position,
            panelRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
            closeDisplay: close ? getComputedStyle(close).display : 'missing',
            framePath: frame?.dataset.refPdfPath || '',
            frameSrc: frame?.getAttribute('src') || '',
            viewportWidth: window.innerWidth,
            overflow: document.documentElement.scrollWidth - window.innerWidth,
          };
        });
        const compactOutOfBounds = width < 900
          && (opened.panelRect.left < -1 || opened.panelRect.right > opened.viewportWidth + 1);
        const wideNotVisible = width >= 900
          && (opened.panelRect.right <= 0 || opened.panelRect.left >= opened.viewportWidth);
        if (!opened.ready || !opened.locked || opened.panelDisplay === 'none' || opened.closeDisplay === 'none'
          || !opened.framePath.includes('excerpt.pdf') || !opened.frameSrc.includes('excerpt.pdf')
          || compactOutOfBounds || wideNotVisible || opened.overflow > 1) {
          throw new Error(`${file} ${width}px reference open failed: ${JSON.stringify(opened)}`);
        }
        if (width < 900 && opened.panelPosition !== 'fixed') {
          throw new Error(`${file} ${width}px compact reference is not a drawer: ${JSON.stringify(opened)}`);
        }
        if (process.env.CPX_REFERENCE_SCREENSHOT && file === 'index.html' && width === 700) {
          await page.screenshot({ path: process.env.CPX_REFERENCE_SCREENSHOT, fullPage: false });
        }
        await page.click('#referenceCloseBtn');
        await page.waitForTimeout(340);
        const closed = await page.evaluate(() => ({
          ready: referenceShell().classList.contains('reference-ready'),
          launcher: getComputedStyle(document.querySelector('#referenceRightBtn')).display,
        }));
        if (closed.ready || closed.launcher === 'none') {
          throw new Error(`${file} ${width}px reference close failed: ${JSON.stringify(closed)}`);
        }
        console.log(`${file} ${width}px desktop reference PASS (${initial.compact ? 'drawer' : 'wide'})`);
        await page.close();
      }

      const mobile = await browser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      await mobile.goto(`${baseUrl}/${file}?reference-mobile-test=${Date.now()}`, { waitUntil: 'domcontentloaded' });
      const state = await prepareReference(mobile);
      if (state.enabled || state.available || !state.mobileRead || state.buttonDisplay !== 'none') {
        throw new Error(`${file} mobile reference controls regressed: ${JSON.stringify(state)}`);
      }
      console.log(`${file} 390px touch mobile reference hidden PASS`);
      await mobile.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
