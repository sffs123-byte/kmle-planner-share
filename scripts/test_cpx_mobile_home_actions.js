const { chromium } = require('playwright');

const files = ['index.html', 'cpx-a4-editor-local.html'];
const widths = [320, 390];

function overlap(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) > 0
    && Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) > 0;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const file of files) {
      for (const width of widths) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
        await page.goto(`http://127.0.0.1:8766/${file}`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
          document.body.classList.add('mobile-capable', 'mobile-read-mode');
          document.body.dataset.activeView = 'home';
          document.querySelectorAll('body > section').forEach(el => el.classList.add('hidden'));
          document.querySelector('#home')?.classList.remove('hidden');
          window.ensureMobileControls?.();
          window.updateMobileMenu?.();
        });
        await page.waitForSelector('#mobileMenuWrap', { state: 'visible' });
        const state = await page.evaluate(() => {
          const ids = ['mobileBugReportBtn', 'mobileCaseQuickBtn', 'mobileSettingsBtn'];
          const boxes = Object.fromEntries(ids.map(id => {
            const r = document.getElementById(id).getBoundingClientRect();
            return [id, { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }];
          }));
          const title = document.querySelector('.home-head > div:first-child')?.getBoundingClientRect();
          const toolbar = document.getElementById('mobileMenuWrap')?.getBoundingClientRect();
          return {
            boxes,
            title: title && { left: title.left, right: title.right, top: title.top, bottom: title.bottom },
            toolbar: toolbar && { left: toolbar.left, right: toolbar.right, top: toolbar.top, bottom: toolbar.bottom },
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            removed: ['mobileMenuBtn', 'mobileModeBtn', 'mobileDocSaveBtn', 'mobileDocHomeBtn', 'mobileDocBoardBtn', 'mobileDocPostBtn', 'mobileDocPdfBtn', 'mobileBugInboxBtn'].filter(id => document.getElementById(id)),
            visibleLabels: ids.map(id => document.getElementById(id)?.getAttribute('aria-label') || document.getElementById(id)?.textContent.trim()),
          };
        });
        const boxList = Object.values(state.boxes);
        if (state.removed.length) throw new Error(`${file} ${width}: removed mobile controls still exist: ${state.removed.join(', ')}`);
        if (state.overflow > 0) throw new Error(`${file} ${width}: horizontal overflow ${state.overflow}px`);
        if (state.title && state.toolbar && overlap(state.title, state.toolbar)) throw new Error(`${file} ${width}: title overlaps toolbar`);
        for (let i = 0; i < boxList.length; i++) for (let j = i + 1; j < boxList.length; j++) {
          if (overlap(boxList[i], boxList[j])) throw new Error(`${file} ${width}: toolbar controls overlap`);
        }
        if (boxList.some(b => b.width < 44 || b.height < 44)) throw new Error(`${file} ${width}: touch target below 44px`);
        await page.click('#mobileSettingsBtn');
        await page.waitForTimeout(220);
        const settingsOpen = await page.locator('#mobileSettingsPanel').evaluate(el => getComputedStyle(el).pointerEvents !== 'none' && Number(getComputedStyle(el).opacity) > 0.9);
        if (!settingsOpen) throw new Error(`${file} ${width}: settings panel did not open`);
        if (width === 320) {
          await page.evaluate(() => {
            window.startBugCaptureMode = () => { document.body.dataset.mobileBugAction = 'ok'; };
            window.openCpxCaseFromContext = () => { document.body.dataset.mobileCaseAction = 'ok'; };
          });
          await page.click('#mobileBugReportBtn');
          await page.click('#mobileCaseQuickBtn');
          const actions = await page.evaluate(() => ({ bug: document.body.dataset.mobileBugAction, casebook: document.body.dataset.mobileCaseAction }));
          if (actions.bug !== 'ok' || actions.casebook !== 'ok') throw new Error(`${file} ${width}: quick action binding failed`);
        }
        results.push({ file, width, overflow: state.overflow, controls: state.visibleLabels, boxes: state.boxes });
        await page.close();
      }
      const desktop = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      await desktop.goto(`http://127.0.0.1:8766/${file}`, { waitUntil: 'domcontentloaded' });
      await desktop.evaluate(() => {
        document.body.classList.remove('mobile-capable', 'mobile-read-mode');
        document.body.dataset.activeView = 'home';
        document.querySelectorAll('body > section').forEach(el => el.classList.add('hidden'));
        document.querySelector('#home')?.classList.remove('hidden');
        window.ensureMobileControls?.();
      });
      const desktopState = await desktop.evaluate(() => ({
        mobileToolbar: getComputedStyle(document.getElementById('mobileMenuWrap')).display,
        homeActions: getComputedStyle(document.querySelector('.home-actions')).display,
      }));
      if (desktopState.mobileToolbar !== 'none' || desktopState.homeActions === 'none') throw new Error(`${file}: desktop header changed unexpectedly`);
      await desktop.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
