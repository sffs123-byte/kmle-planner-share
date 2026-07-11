const { chromium } = require('playwright');

const files = ['index.html', 'cpx-a4-editor-local.html'];
const widths = [320, 390];
const baseUrl = String(process.env.CPX_BASE_URL || 'http://127.0.0.1:8766').replace(/\/$/, '');

function closeEnough(actual, expected, tolerance = 2.5) {
  return Math.abs(actual - expected) <= tolerance;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const file of files) {
      for (const width of widths) {
        const page = await browser.newPage({
          viewport: { width, height: 844 },
          isMobile: true,
          hasTouch: true,
        });
        await page.goto(`${baseUrl}/${file}?mobile-pinch-anchor-test=${Date.now()}`, {
          waitUntil: 'domcontentloaded',
        });
        const result = await page.evaluate(async () => {
          document.querySelector('#home')?.classList.add('hidden');
          document.querySelector('#work')?.classList.remove('hidden');
          document.body.classList.add('mobile-capable', 'mobile-read-mode', 'mobile-doc-open');
          mobileZoom = 2.4;
          commitMobileZoom();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const stage = document.querySelector('.stage');
          stage.scrollLeft = Math.min(160, stage.scrollWidth - stage.clientWidth);
          stage.scrollTop = Math.min(240, stage.scrollHeight - stage.clientHeight);
          const from = { x: stage.clientWidth * 0.76, y: stage.clientHeight * 0.67 };
          const to = { x: stage.clientWidth * 0.58, y: stage.clientHeight * 0.56 };
          mobileAppliedPinchAnchor = from;
          mobileLastPinchAnchor = from;
          const before = {
            scale: mobileLayoutScale,
            left: stage.scrollLeft,
            top: stage.scrollTop,
          };

          setMobileZoom(mobileZoom * 1.18, { anchor: to, fast: true });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const after = {
            scale: mobileLayoutScale,
            left: stage.scrollLeft,
            top: stage.scrollTop,
          };
          const ratio = after.scale / before.scale;
          const expected = {
            left: (before.left + from.x) * ratio - to.x,
            top: (before.top + from.y) * ratio - to.y,
          };
          return {
            before,
            after,
            from,
            to,
            expected,
            contentPointDelta: {
              x: (after.left + to.x) / after.scale - (before.left + from.x) / before.scale,
              y: (after.top + to.y) / after.scale - (before.top + from.y) / before.scale,
            },
            wrapWidth: getComputedStyle(document.querySelector('.doc-wrap')).width,
            hScrollNeeded: document.body.classList.contains('mobile-hscroll-needed'),
          };
        });

        if (!closeEnough(result.after.left, result.expected.left)
          || !closeEnough(result.after.top, result.expected.top)
          || Math.abs(result.contentPointDelta.x) > 2.5
          || Math.abs(result.contentPointDelta.y) > 2.5
          || !result.hScrollNeeded) {
          throw new Error(`${file} ${width}px: pinch focal point drifted: ${JSON.stringify(result)}`);
        }
        console.log(`${file} ${width}px: pinch focal point PASS ${JSON.stringify(result.contentPointDelta)}`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
