const { chromium, webkit } = require('playwright');

const files = ['index.html', 'cpx-a4-editor-local.html'];
const widths = [320, 390];
const baseUrl = String(process.env.CPX_BASE_URL || 'http://127.0.0.1:8766').replace(/\/$/, '');

function overlaps(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) > 0
    && Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) > 0;
}

async function prepare(page) {
  await page.evaluate(() => {
    document.querySelectorAll('body > section').forEach(el => el.classList.add('hidden'));
    document.getElementById('communityPage')?.classList.remove('hidden');
    document.body.dataset.activeView = 'communityPage';
    communityState.ccId = String(seed.topics[0].id);
    communityState.selectedId = null;
    renderCommunityPage();
  });
}

async function mobileCase(browserType, browser, file, width) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/${file}?mobile-memo-nav=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await prepare(page);
  await page.waitForSelector('#mobileMemoNavigator', { state: 'visible' });

  const initial = await page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
    };
    return {
      nav: rect('#mobileMemoNavigator'),
      prev: rect('#mobileMemoPrev'),
      current: rect('#mobileMemoCurrent'),
      next: rect('#mobileMemoNext'),
      memoTab: rect('#mobileMemoTabMemo'),
      feedTab: rect('#mobileMemoTabFeed'),
      mainDisplay: getComputedStyle(document.querySelector('.community-main')).display,
      detailDisplay: getComputedStyle(document.querySelector('.community-detail')).display,
      sidebarDisplay: getComputedStyle(document.querySelector('.community-sidebar')).display,
      overflow: document.documentElement.scrollWidth - innerWidth,
      title: document.getElementById('mobileMemoCurrentTitle')?.textContent,
      firstTitle: seed.topics[0].title,
      topicCount: seed.topics.length,
      prevDisabled: document.getElementById('mobileMemoPrev')?.disabled,
    };
  });
  if (!initial.nav || initial.nav.width > width || initial.overflow > 0) throw new Error(`${browserType} ${file} ${width}: navigator overflow ${JSON.stringify(initial)}`);
  if (initial.sidebarDisplay !== 'none' || initial.mainDisplay === 'none' || initial.detailDisplay !== 'none') throw new Error(`${browserType} ${file} ${width}: wrong initial mobile panels ${JSON.stringify(initial)}`);
  if (initial.title !== initial.firstTitle || !initial.prevDisabled) throw new Error(`${browserType} ${file} ${width}: wrong initial topic/boundary ${JSON.stringify(initial)}`);
  if ([initial.prev, initial.current, initial.next, initial.memoTab, initial.feedTab].some(r => !r || r.height < 40)) throw new Error(`${browserType} ${file} ${width}: touch target too small`);
  if (overlaps(initial.prev, initial.current) || overlaps(initial.current, initial.next) || overlaps(initial.memoTab, initial.feedTab)) throw new Error(`${browserType} ${file} ${width}: controls overlap`);

  await page.click('#mobileMemoNext');
  const moved = await page.evaluate(() => ({
    title: document.getElementById('mobileMemoCurrentTitle')?.textContent,
    expected: seed.topics[1].title,
    prevDisabled: document.getElementById('mobileMemoPrev')?.disabled,
  }));
  if (moved.title !== moved.expected || moved.prevDisabled) throw new Error(`${browserType} ${file} ${width}: next navigation failed ${JSON.stringify(moved)}`);
  await page.click('#mobileMemoPrev');

  await page.click('#mobileMemoCurrent');
  await page.waitForSelector('#mobileMemoSheet.open', { state: 'visible' });
  const sheet = await page.evaluate(() => ({
    options: document.querySelectorAll('#mobileMemoSheetList .mobile-memo-option').length,
    panel: (() => { const r = document.querySelector('.mobile-memo-sheet-panel').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; })(),
    hidden: document.getElementById('mobileMemoSheet')?.getAttribute('aria-hidden'),
  }));
  if (sheet.options !== initial.topicCount + 1 || sheet.hidden !== 'false' || sheet.panel.bottom > 845) throw new Error(`${browserType} ${file} ${width}: sheet failed ${JSON.stringify(sheet)}`);

  await page.fill('#mobileMemoSheetSearch', '고혈압');
  const filtered = await page.evaluate(() => Array.from(document.querySelectorAll('#mobileMemoSheetList .mobile-memo-option')).map(el => el.textContent.trim()));
  if (!filtered.length || filtered.some(text => !text.includes('고혈압'))) throw new Error(`${browserType} ${file} ${width}: search failed ${JSON.stringify(filtered)}`);
  await page.click('#mobileMemoSheetList .mobile-memo-option');
  const selected = await page.evaluate(() => ({
    sheetOpen: document.getElementById('mobileMemoSheet').classList.contains('open'),
    title: document.getElementById('mobileMemoCurrentTitle')?.textContent,
    ccId: String(communityState.ccId || ''),
  }));
  if (selected.sheetOpen || !selected.title.includes('고혈압') || !selected.ccId) throw new Error(`${browserType} ${file} ${width}: selection failed ${JSON.stringify(selected)}`);

  await page.click('#mobileMemoTabFeed');
  const feed = await page.evaluate(() => ({
    main: getComputedStyle(document.querySelector('.community-main')).display,
    detail: getComputedStyle(document.querySelector('.community-detail')).display,
    selected: document.getElementById('mobileMemoTabFeed')?.getAttribute('aria-selected'),
  }));
  if (feed.main !== 'none' || feed.detail === 'none' || feed.selected !== 'true') throw new Error(`${browserType} ${file} ${width}: feed tab failed ${JSON.stringify(feed)}`);
  if (process.env.CPX_SCREENSHOT_DIR && browserType === 'chromium' && file === 'index.html' && width === 390) {
    await page.screenshot({ path: `${process.env.CPX_SCREENSHOT_DIR}/mobile-memo-feed-390.png`, fullPage: true });
    await page.click('#mobileMemoCurrent');
    await page.screenshot({ path: `${process.env.CPX_SCREENSHOT_DIR}/mobile-memo-selector-390.png`, fullPage: false });
    await page.click('.mobile-memo-sheet-close');
  }
  await page.click('#mobileMemoTabMemo');
  if (errors.length) throw new Error(`${browserType} ${file} ${width}: page errors ${errors.join(' | ')}`);
  await context.close();
  return { browserType, file, width, options: sheet.options, selected: selected.title };
}

async function desktopCase(browser, file) {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  await page.goto(`${baseUrl}/${file}?desktop-memo-nav=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await prepare(page);
  const state = await page.evaluate(() => ({
    navigator: getComputedStyle(document.getElementById('mobileMemoNavigator')).display,
    sidebar: getComputedStyle(document.querySelector('.community-sidebar')).display,
    main: getComputedStyle(document.querySelector('.community-main')).display,
    detail: getComputedStyle(document.querySelector('.community-detail')).display,
    columns: getComputedStyle(document.querySelector('.community-layout')).gridTemplateColumns,
  }));
  await page.close();
  if (state.navigator !== 'none' || state.sidebar === 'none' || state.main === 'none' || state.detail === 'none' || state.columns === 'none') throw new Error(`${file}: desktop layout changed ${JSON.stringify(state)}`);
  return state;
}

(async () => {
  const results = [];
  for (const [browserType, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await launcher.launch({ headless: true });
    try {
      for (const file of files) {
        for (const width of widths) results.push(await mobileCase(browserType, browser, file, width));
        if (browserType === 'chromium') await desktopCase(browser, file);
      }
    } finally {
      await browser.close();
    }
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
