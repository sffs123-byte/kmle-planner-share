const { chromium } = require('playwright');

const files = ['index.html', 'cpx-a4-editor-local.html'];

async function runCase(browser, file, mobile) {
  const page = await browser.newPage({
    viewport: { width: mobile ? 390 : 1024, height: mobile ? 844 : 768 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  await page.goto(`http://127.0.0.1:8766/${file}`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async ({ mobile }) => {
    document.querySelector('#work')?.classList.remove('hidden');
    document.body.classList.toggle('mobile-read-mode', mobile);
    current = seed.topics[0];
    document.querySelector('#sourceText').value = 'render-only mismatch';
    currentDocBaseText = 'server baseline';
    dirtyState = false;
    savingState = false;
    let markCalls = 0;
    let pushCalls = 0;
    const originalMarkDirty = markDirty;
    const originalPushState = pushState;
    markDirty = () => { markCalls += 1; dirtyState = true; };
    pushState = async () => {
      pushCalls += 1;
      currentDocBaseText = document.querySelector('#sourceText').value;
      dirtyState = false;
      savingState = false;
    };
    let allowed;
    try {
      allowed = await waitForPendingSaveBeforeDocSwitch(seed.topics[1].id);
    } finally {
      markDirty = originalMarkDirty;
      pushState = originalPushState;
    }
    current = seed.topics[0];
    dirtyState = true;
    savingState = false;
    let navigationPushCalls = 0;
    let openedId = null;
    const originalOpenDoc = openDoc;
    const originalUpdatePresence = updatePresence;
    pushState = async () => { navigationPushCalls += 1; dirtyState = false; };
    updatePresence = async () => {};
    openDoc = async id => { openedId = String(id); return true; };
    try {
      await navigateDoc(1);
    } finally {
      openDoc = originalOpenDoc;
      updatePresence = originalUpdatePresence;
      pushState = originalPushState;
    }
    return {
      mobile,
      allowed,
      markCalls,
      pushCalls,
      dirtyState,
      locked: isMobileReadOnlyDocOpen(),
      navigationPushCalls,
      openedId,
      expectedOpenedId: String(seed.topics[1].id),
    };
  }, { mobile });
  await page.close();
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const file of files) {
      const mobile = await runCase(browser, file, true);
      if (!mobile.allowed || mobile.markCalls !== 0 || mobile.pushCalls !== 0 || !mobile.locked
        || mobile.navigationPushCalls !== 0 || mobile.openedId !== mobile.expectedOpenedId) {
        throw new Error(`${file}: mobile doc switch entered desktop save flow: ${JSON.stringify(mobile)}`);
      }
      const desktop = await runCase(browser, file, false);
      if (!desktop.allowed || desktop.markCalls !== 1 || desktop.pushCalls !== 1 || desktop.locked
        || desktop.navigationPushCalls !== 1 || desktop.openedId !== desktop.expectedOpenedId) {
        throw new Error(`${file}: desktop save guard regressed: ${JSON.stringify(desktop)}`);
      }
      console.log(`${file}: mobile read-only switch PASS; desktop save guard PASS`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
