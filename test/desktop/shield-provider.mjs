// Real Island controls and provider persistence, with actual blocking enabled
// for supported runs. Never touches the user's profile or the installed app.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import popupFocusTrace from './support/popup-focus-trace.js';
import hooks from './support/test-hook-call.js';
const { waitForValue } = poll;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-shield-provider-'));
fs.mkdirSync(dir + '-Dev');
const settingsFile = path.join(dir + '-Dev', 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify({
  onboardingVersion: 1, adblockProvider: 'blanc', adblockEnabled: true,
  searchSuggestions: false, usagePing: false, onePasswordEnabled: false,
}));
const persistedProvider = () => JSON.parse(fs.readFileSync(settingsFile, 'utf8')).adblockProvider;
let visits = 0;
const server = http.createServer((_request, response) => {
  visits++;
  response.end('<!doctype html><title>Shield fixture</title><p>Provider switching fixture</p>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const { ELECTRON_RUN_AS_NODE: ignored, BLANC_UBLOCK_TEST: ignoredFlag, ...env } = process.env;
void ignored; void ignoredFlag;
let electron;
let stage = 'launch';
let stderr = '';
const uiErrors = [];
const observedPages = new WeakSet();
function observePageErrors(page) {
  if (observedPages.has(page)) return;
  observedPages.add(page);
  page.on('pageerror', error => {
    if ((page.url().startsWith('blanc-chrome://') || page.url().includes('/popup-fenix.html')) && uiErrors.length < 20) {
      uiErrors.push({ stage, surface: page.url(), message: error.message });
    }
  });
}
const watchdog = setTimeout(() => {
  console.error('Shield suite deadline at ' + stage);
  electron?.process().kill('SIGKILL');
}, 120000);
const call = (method, ...args) => hooks.callTestHook(electron, method, args);
const providerRadio = (overlay, provider) => overlay.locator(`[name="shieldProvider"][value="${provider}"]`);
async function launch(supported) {
  electron = await _electron.launch({
    args: [path.resolve('.'), `--user-data-dir=${dir}`], chromiumSandbox: true,
    // Playwright otherwise forces light media in every attached renderer,
    // masking Electron's real nativeTheme propagation after a settings change.
    colorScheme: null,
    env: { ...env, BLANC_TEST: '1', ...(supported ? { BLANC_UBLOCK_TEST: '1' } : {}) },
  });
  electron.context().setDefaultTimeout(8000);
  electron.context().on('page', observePageErrors);
  for (const page of electron.context().pages()) observePageErrors(page);
  electron.process().stderr.on('data', data => { stderr = (stderr + data).slice(-8000); });
  await popupFocusTrace.install(electron);
  await electron.firstWindow();
  await waitForValue(() => call('startupReady'), Boolean, 'browser startup complete', 20000);
  await waitForValue(() => call('blockingStatus'), state => supported ? state.phase === 'ready' : state.phase === 'disabled', 'provider settled', 20000);
}
async function openShield() {
  await popupFocusTrace.focusFixtureWindow(electron);
  const chrome = await waitForValue(async () => (await electron.windows()).find(page => page.url() === 'blanc-chrome://index/'), Boolean, 'chrome');
  await chrome.locator('#pillShield').click();
  const overlay = await waitForValue(async () => (await electron.windows()).find(page => page.url() === 'blanc-chrome://overlay/'), Boolean, 'overlay');
  await overlay.locator('#shieldPop').waitFor({ state: 'visible' });
  await summary(overlay);
  await assertAnchored(overlay);
  return overlay;
}
async function assertAnchored(overlay) {
  const chrome = (await electron.windows()).find(page => page.url() === 'blanc-chrome://index/');
  await overlay.locator('#shieldPopPointer').waitFor({ state: 'visible' });
  await waitForValue(async () => {
    const anchor = await chrome.locator('#pillShield').boundingBox();
    const bounds = await call('overlayBounds');
    const pointer = await overlay.locator('#shieldPopPointer').boundingBox();
    const card = await overlay.locator('#shieldPop').boundingBox();
    return { dx: Math.abs(bounds.x + pointer.x + pointer.width / 2 - anchor.x - anchor.width / 2),
      gap: bounds.y + card.y - anchor.y - anchor.height };
  }, value => value.dx < 1 && value.gap >= 9 && value.gap <= 11,
  'pointer follows the shield with a short circle-to-card join');
  await overlay.mouse.move(200, 180);
  assert.notEqual(await chrome.locator('#pillShield').evaluate(button => getComputedStyle(button).backgroundColor),
    'rgba(0, 0, 0, 0)', 'hover circle remains visible while its panel is open');
}
async function summary(overlay, expectFocus = false) {
  await overlay.locator('#shieldPopChooser').waitFor({ state: 'hidden' });
  await overlay.locator('#shieldPopChangeProvider').waitFor({ state: 'visible' });
  if (expectFocus) await overlay.waitForFunction(() => document.activeElement?.id === 'shieldPopChangeProvider');
}
async function chooser(overlay, selected, keyboard = false) {
  const button = overlay.locator('#shieldPopChangeProvider');
  if (keyboard) {
    await button.focus();
    await button.press('Enter');
  } else await button.click();
  await overlay.locator('#shieldPopChooser').waitFor({ state: 'visible' });
  assert.equal(await overlay.locator('.shield-pop-mark').getAttribute('src'), 'sunrise-hero-mark.png');
  await overlay.waitForFunction(() => {
    const mark = document.querySelector('.shield-pop-mark');
    return mark?.complete && mark.naturalWidth > 0;
  });
  assert(await providerRadio(overlay, selected).isChecked(), 'chooser starts with the saved provider');
  await overlay.waitForFunction(value => document.activeElement?.name === 'shieldProvider' && document.activeElement.value === value, selected);
}
async function closeShield(overlay, key = false) {
  if (key) await overlay.locator(':focus').press('Escape');
  else await overlay.locator('#shieldPopClose').click();
  await waitForValue(() => call('overlayMode'), mode => mode === null, 'shield dismissed');
  const chrome = (await electron.windows()).find(page => page.url() === 'blanc-chrome://index/');
  assert(chrome);
  await chrome.waitForFunction(() => document.activeElement?.id === 'pillShield' && document.querySelector('#pillShield').getAttribute('aria-expanded') === 'false');
}
async function fixture(privateTab = false) {
  const id = await call('openTab', url, { private: privateTab });
  const page = await waitForValue(async () => (await electron.windows()).find(item => item.url() === url), Boolean, 'fixture navigation committed');
  await page.getByText('Provider switching fixture', { exact: true }).waitFor();
  await waitForValue(async () => (await call('state')).tabs.find(tab => tab.id === id && !tab.isLoading), Boolean, 'fixture loaded');
  return id;
}
async function assertDraftOnly(provider) {
  assert.equal((await call('blockingStatus')).selected, provider, 'draft choice does not change provider state');
  assert.equal(persistedProvider(), provider, 'draft choice does not write settings');
}
async function setAppearance(overlay, theme) {
  assert.equal(await call('setAppearance', theme), theme, 'appearance preference accepted');
  assert.deepEqual(await electron.evaluate(({ nativeTheme }) => ({
    source: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors,
  })), { source: theme, dark: theme === 'dark' }, 'real Electron theme follows the preference');
  await overlay.waitForFunction(value => matchMedia(`(prefers-color-scheme: ${value})`).matches, theme);
}
async function assertShortWindow(overlay) {
  const original = await call('windowContentBounds');
  await call('setWindowContentSize', 640, 480);
  try {
    await waitForValue(() => call('windowContentBounds'), bounds => bounds.width === 640 && bounds.height === 480, 'minimum content size applied');
    await overlay.waitForFunction(() => {
      const card = document.querySelector('#shieldPop');
      return card.getBoundingClientRect().bottom <= innerHeight;
    });
    await assertAnchored(overlay);
    assert(await providerRadio(overlay, 'ublock-origin').isChecked(), 'resizing preserves the pending choice');
    await assertDraftOnly('blanc');
    // Native Tab navigation must reach the single contextual action.
    await providerRadio(overlay, 'ublock-origin').press('Tab');
    await overlay.waitForFunction(() => document.activeElement?.id === 'shieldPopApply');
    for (const id of ['shieldPopApply']) {
      await overlay.waitForFunction(value => document.activeElement?.id === value, id);
      assert(await overlay.locator('#' + id).isEnabled(), id + ' remains enabled in a short window');
      const reachable = await overlay.locator('#' + id).evaluate(button => {
        const bounds = button.getBoundingClientRect();
        const card = document.querySelector('#shieldPop').getBoundingClientRect();
        const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return bounds.top >= Math.max(0, card.top) - 1 && bounds.bottom <= Math.min(innerHeight, card.bottom) + 1
          && (target === button || button.contains(target));
      });
      assert(reachable, id + ' scrolls into view and receives pointer input');
    }
    assert(await providerRadio(overlay, 'ublock-origin').isChecked(), 'keyboard scrolling preserves the pending choice');
    await assertDraftOnly('blanc');
    await overlay.screenshot({ animations: 'disabled', path: 'output/playwright/shield-provider-short.png' });
  } finally {
    await call('setWindowContentSize', original.width, original.height);
    await waitForValue(() => call('windowContentBounds'), bounds => bounds.width === original.width && bounds.height === original.height, 'original content size restored');
  }
  await assertFits(overlay);
  await assertAnchored(overlay);
  await providerRadio(overlay, 'ublock-origin').click();
  await assertDraftOnly('blanc');
}
async function restartFromChooser(overlay, keyboard = false) {
  assert.equal(await overlay.locator('#shieldPopApply').innerText(), 'Restart Blanc');
  const marker = path.join(dir, 'restart-call.json');
  fs.rmSync(marker, { force: true });
  // Let the real app quit normally. Capture only the final spawn request so
  // the harness can launch/reconnect deterministically without orphaning a
  // debug process. A separate native smoke exercises actual app.relaunch.
  await electron.evaluate(({ app }, marker) => {
    app.relaunch = () => process.mainModule.require('node:fs').writeFileSync(marker, JSON.stringify({ requested: true }));
  }, marker);
  const closed = new Promise(resolve => electron.once('close', resolve));
  const button = overlay.locator('#shieldPopApply');
  if (keyboard) await button.focus();
  await (keyboard ? button.press('Enter') : button.click()).catch(error => {
    if (!/closed|destroyed/i.test(error.message)) throw error;
  });
  await closed;
  assert.equal(JSON.parse(fs.readFileSync(marker)).requested, true, 'normal quit schedules one relaunch');
  electron = null;
}
async function assertFits(overlay) {
  const geometry = await overlay.locator('#shieldPop').evaluate(card => ({
    bottom: card.getBoundingClientRect().bottom, height: innerHeight,
    scrollHeight: card.scrollHeight, clientHeight: card.clientHeight,
  }));
  assert(geometry.bottom <= geometry.height, 'switcher fits the overlay');
  if (geometry.scrollHeight > geometry.clientHeight) {
    fs.mkdirSync('output/playwright', { recursive: true });
    await overlay.screenshot({ animations: 'disabled', path: 'output/playwright/shield-provider-overflow.png' });
  }
  assert(geometry.scrollHeight <= geometry.clientHeight, `normal-height dialog needs no scrolling: ${JSON.stringify(geometry)}`);
}
try {
  stage = 'unavailable provider';
  await launch(false);
  await fixture();
  let overlay = await openShield();
  assert(await overlay.locator('#shieldPopChangeProvider').isEnabled(), 'unavailable uBO still permits inspecting provider choices');
  await chooser(overlay, 'blanc');
  assert(await providerRadio(overlay, 'ublock-origin').isDisabled());
  assert.match(await overlay.locator('#shieldPopChooser').innerText(), /unavailable/i);
  assert.equal(await overlay.evaluate(() => window.browserAPI.selectBlockingProvider('ublock-origin')), false);
  assert.equal(await overlay.evaluate(() => window.browserAPI.selectBlockingProvider('forged-provider')), false);
  assert.equal(await overlay.evaluate(() => window.browserAPI.selectBlockingProvider('blanc', 'yes')), false);
  await assertDraftOnly('blanc');
  await overlay.locator('#shieldPopBack').click();
  await summary(overlay, true);
  await closeShield(overlay);
  await electron.close(); electron = null;

  stage = 'Blanc to uBO draft and cancellation';
  await launch(true);
  const initial = await fixture();
  overlay = await openShield();
  const before = visits;
  await chooser(overlay, 'blanc', true);
  assert.equal(await overlay.locator('#shieldPopApply').innerText(), 'Done');
  await overlay.locator('#shieldPopApply').click();
  await waitForValue(() => call('overlayMode'), mode => mode === null, 'Done closes the unchanged chooser');
  await assertDraftOnly('blanc');
  overlay = await openShield();
  await chooser(overlay, 'blanc', true);
  assert.match(await overlay.locator('#shieldPopProvider').innerText(), /EasyList\s*\+\s*EasyPrivacy/);
  await providerRadio(overlay, 'blanc').press('ArrowDown');
  assert(await providerRadio(overlay, 'ublock-origin').isChecked(), 'keyboard can select uBO');
  await assertDraftOnly('blanc');
  // Observe a real tabs broadcast after a harmless tab mutation. Background
  // loading/count updates must not reset a choice the user has not applied yet.
  await overlay.evaluate(() => {
    window.__shieldTestBroadcastReceived = false;
    const off = window.browserAPI.onTabsUpdated(() => {
      off();
      window.__shieldTestBroadcastReceived = true;
    });
  });
  await call('pinTab', initial);
  await overlay.waitForFunction(() => window.__shieldTestBroadcastReceived === true);
  assert(await providerRadio(overlay, 'ublock-origin').isChecked(), 'tabs broadcast preserves the draft');
  await assertDraftOnly('blanc');
  await overlay.locator('#shieldPopBack').click();
  await summary(overlay, true);
  await assertDraftOnly('blanc');
  await chooser(overlay, 'blanc');
  await providerRadio(overlay, 'ublock-origin').check();
  await overlay.locator('#shieldPopBack').click();
  await summary(overlay, true);
  await assertDraftOnly('blanc');
  await chooser(overlay, 'blanc');
  await providerRadio(overlay, 'ublock-origin').check();
  await closeShield(overlay);
  await assertDraftOnly('blanc');

  stage = 'Blanc to uBO apply';
  overlay = await openShield();
  await chooser(overlay, 'blanc');
  await providerRadio(overlay, 'ublock-origin').check();
  await assertFits(overlay);
  fs.mkdirSync('output/playwright', { recursive: true });
  await setAppearance(overlay, 'light');
  stage = 'short window chooser';
  await assertShortWindow(overlay);
  stage = 'Blanc to uBO apply';
  await overlay.screenshot({ animations: 'disabled', path: 'output/playwright/shield-provider-chooser.png' });
  await setAppearance(overlay, 'dark');
  assert(await providerRadio(overlay, 'ublock-origin').isChecked(), 'appearance updates preserve draft');
  await overlay.screenshot({ animations: 'disabled', path: 'output/playwright/shield-provider-dark.png' });
  await setAppearance(overlay, 'light');
  assert.equal(await overlay.locator('#shieldPopApply').innerText(), 'Restart Blanc');
  await electron.evaluate(() => {
    const settings = process.mainModule.require(process.mainModule.require('electron').app.getAppPath() + '/src/main/settings.js');
    globalThis.__restoreSettingsFlush = settings.flushSettings;
    settings.flushSettings = () => false;
  });
  await overlay.locator('#shieldPopApply').click();
  await overlay.locator('#shieldPopChooserError').waitFor({ state: 'visible' });
  assert.equal((await call('blockingStatus')).selected, 'blanc', 'failed persistence does not change provider or quit');
  assert.equal(await overlay.locator('#shieldPopApply').innerText(), 'Restart Blanc');
  await electron.evaluate(() => {
    process.mainModule.require(process.mainModule.require('electron').app.getAppPath() + '/src/main/settings.js').flushSettings = globalThis.__restoreSettingsFlush;
    delete globalThis.__restoreSettingsFlush;
  });
  assert.equal(await overlay.evaluate(() => window.browserAPI.selectBlockingProvider('ublock-origin')), true);
  await overlay.locator('#shieldPopBack').click();
  await summary(overlay, true);
  await waitForValue(() => call('blockingStatus'), state => state.selected === 'ublock-origin' && state.active === 'blanc' && state.restartPending, 'uBO pending');
  await waitForValue(persistedProvider, value => value === 'ublock-origin', 'uBO selection persisted');
  await waitForValue(() => overlay.locator('#shieldPopProviderStatus').innerText(), text => text.includes('Restart Blanc'), 'restart guidance');
  assert.equal(visits, before, 'drafts, cancellation and apply must not reload the page');
  await assertFits(overlay);
  await overlay.screenshot({ animations: 'disabled', path: 'output/playwright/shield-provider-restart.png' });
  await chooser(overlay, 'ublock-origin');
  await restartFromChooser(overlay);

  stage = 'uBO active and original popup';
  await launch(true);
  assert.equal((await call('blockingStatus')).active, 'ublock-origin');
  const regular = await fixture();
  const regularContents = (await call('state')).tabs.find(tab => tab.id === regular).webContentsId;
  const outsideListeners = await electron.evaluate(({ webContents }, id) => webContents.fromId(id).listenerCount('before-mouse-event'), regularContents);
  overlay = await openShield();
  assert(await overlay.locator('#shieldPopToggle').isHidden());
  assert.equal(await overlay.locator('#shieldPopProviderStatus').innerText(), 'Active');
  assert.equal(await overlay.locator('#shieldPopChangeProvider').innerText(), 'Change');
  assert.equal(await overlay.locator('#shieldPopUblock').innerText(), 'Open controls');
  const summaryText = await overlay.locator('#shieldPopSummary').innerText();
  assert.equal((summaryText.match(/uBlock Origin/g) || []).length, 1, 'provider is named once in the ready summary');
  assert.match(summaryText, /Each blocker keeps its own site settings/);
  const summaryOrder = await overlay.evaluate(() => ['shieldPopCurrentProvider', 'shieldPopCount', 'shieldPopUblock', 'shieldPopConnection', 'shieldPopSettings', 'shieldPopProviderScope']
    .map(id => document.getElementById(id).getBoundingClientRect().top));
  assert(summaryOrder.every((top, index) => !index || top > summaryOrder[index - 1]), 'summary follows the selected provider-first hierarchy');
  await assertFits(overlay);
  await setAppearance(overlay, 'dark');
  await overlay.screenshot({ animations: 'disabled', path: 'output/playwright/shield-summary-dark.png' });
  await setAppearance(overlay, 'light');
  await chooser(overlay, 'ublock-origin');
  await overlay.locator('#shieldPopBack').click();
  await summary(overlay, true);
  await overlay.screenshot({ animations: 'disabled', path: 'output/playwright/shield-provider-ubo.png' });
  await overlay.locator('#shieldPopUblock').click();
  const popup = await waitForValue(async () => (await electron.windows()).find(page => page.url().includes('/popup-fenix.html')), Boolean, 'original popup');
  await popup.locator('body:not(.loading)').waitFor();
  await popup.locator('#switch').waitFor();
  assert.equal(await electron.evaluate(async ({ webContents }, id) => {
    webContents.fromId(id).focus();
    await new Promise(resolve => setImmediate(resolve));
    return webContents.getAllWebContents().some(wc => !wc.isDestroyed() && wc.getURL().includes('/popup-fenix.html'));
  }, regularContents), true, 'a webpage focus transition cannot dismiss controls');
  assert.equal(await electron.evaluate(({ webContents }, id) => webContents.fromId(id).listenerCount('before-mouse-event'), regularContents), outsideListeners + 1);
  assert.equal(await popup.locator('#blancMore').getAttribute('aria-expanded'), 'false');
  await popup.locator('#blancMore').press('Enter');
  await popup.locator('#no-scripting').waitFor({ state: 'visible' });
  assert.equal(await popup.locator('body').evaluate(body => body.classList.contains('advancedUser')), false, 'More controls never enables advanced-user mode');
  await popup.locator('#no-scripting').press('Space');
  await popup.waitForFunction(() => document.querySelector('#no-scripting').classList.contains('on'));
  await popup.locator('#no-scripting').press('Space');
  await popup.waitForFunction(() => !document.querySelector('#no-scripting').classList.contains('on'));
  await popup.locator('#blancMore').click();
  await popup.locator('#no-scripting').waitFor({ state: 'hidden' });
  await popup.locator('#switch').press('Space');
  await popup.waitForFunction(() => document.body.classList.contains('off'));
  assert.equal(await popup.locator('#switch').getAttribute('aria-checked'), 'false');
  await popup.locator('#switch').press('Space');
  await popup.waitForFunction(() => !document.body.classList.contains('off'));
  await Promise.all([popup.waitForEvent('close'), popup.locator('#blancBack').click()]);
  await overlay.locator('#shieldPop').waitFor({ state: 'visible' });
  assert.equal(await electron.evaluate(({ webContents }, id) => webContents.fromId(id).listenerCount('before-mouse-event'), regularContents), outsideListeners, 'Back removes outside input observers');
  await overlay.locator('#shieldPopUblock').click();
  const dashboardPopup = await waitForValue(async () => (await electron.windows()).find(page => page.url().includes('/popup-fenix.html')), Boolean, 'styled popup reopened');
  await dashboardPopup.locator('body:not(.loading)').waitFor();
  await Promise.all([dashboardPopup.waitForEvent('close'), dashboardPopup.locator('a[href="dashboard.html"] span').last().click()]);
  await waitForValue(async () => (await electron.windows()).some(page => page.url().includes('/dashboard.html')), Boolean, 'Dashboard link opens a managed tab');
  await call('activateTab', regular);
  overlay = await openShield(); await overlay.locator('#shieldPopUblock').click();
  const loggerPopup = await waitForValue(async () => (await electron.windows()).find(page => page.url().includes('/popup-fenix.html')), Boolean, 'popup for logger');
  await loggerPopup.locator('body:not(.loading)').waitFor();
  await Promise.all([loggerPopup.waitForEvent('close'), loggerPopup.locator('a[href="logger-ui.html#_"] span').last().click()]);
  await waitForValue(async () => (await electron.windows()).some(page => page.url().includes('/logger-ui.html')), Boolean, 'Logger link opens a managed tab');
  await call('activateTab', regular);
  overlay = await openShield(); await overlay.locator('#shieldPopUblock').click();
  const outsidePopup = await waitForValue(async () => (await electron.windows()).find(page => page.url().includes('/popup-fenix.html')), Boolean, 'popup for outside click');
  await outsidePopup.locator('body:not(.loading)').waitFor();
  await electron.evaluate(({ webContents }, id) => {
    const wc = webContents.fromId(id);
    wc.sendInputEvent({ type: 'mouseDown', x: 1000, y: 150, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: 1000, y: 150, button: 'left', clickCount: 1 });
  }, regularContents);
  await waitForValue(async () => (await electron.windows()).some(page => page.url().includes('/popup-fenix.html')), open => !open, 'outside click dismisses native popup');
  assert.equal(await electron.evaluate(({ webContents }, id) => webContents.fromId(id).listenerCount('before-mouse-event'), regularContents), outsideListeners, 'outside dismissal removes its observers');
  stage = 'outside input on a later woken view';
  overlay = await openShield(); await overlay.locator('#shieldPopUblock').click();
  const laterPopup = await waitForValue(async () => (await electron.windows()).find(page => page.url().includes('/popup-fenix.html')), Boolean, 'popup before later tab creation');
  await laterPopup.locator('body:not(.loading)').waitFor();
  const laterTab = await call('createQuietTab', url, 'Later outside-click fixture');
  assert.equal(await call('wakeTab', laterTab), true);
  const laterContents = (await call('state')).tabs.find(tab => tab.id === laterTab).webContentsId;
  assert.equal(await electron.evaluate(({ webContents }, id) => webContents.fromId(id).listenerCount('before-mouse-event'), laterContents), outsideListeners + 1, 'newly woken view is observed while controls remain open');
  assert((await electron.windows()).some(page => page.url().includes('/popup-fenix.html')), 'creating and waking a background tab does not dismiss controls');
  await electron.evaluate(({ webContents }, id) => {
    const wc = webContents.fromId(id);
    wc.sendInputEvent({ type: 'mouseDown', x: 300, y: 150, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: 300, y: 150, button: 'left', clickCount: 1 });
  }, laterContents);
  await waitForValue(async () => (await electron.windows()).some(page => page.url().includes('/popup-fenix.html')), open => !open, 'later view outside click dismisses popup');
  assert.equal(await electron.evaluate(({ webContents }, id) => webContents.fromId(id).listenerCount('before-mouse-event'), laterContents), outsideListeners, 'later view observers removed after dismissal');
  await call('closeTab', laterTab);
  overlay = await openShield(); await overlay.locator('#shieldPopUblock').click();
  const escapePopup = await waitForValue(async () => (await electron.windows()).find(page => page.url().includes('/popup-fenix.html')), Boolean, 'popup for Escape');
  await escapePopup.locator('body:not(.loading)').waitFor();
  await escapePopup.locator('#switch').waitFor();
  await electron.evaluate(({ webContents }) => {
    const wc = webContents.getAllWebContents().find(item => item.getURL().includes('/popup-fenix.html'));
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  });
  await waitForValue(async () => (await electron.windows()).some(page => page.url().includes('/popup-fenix.html')), open => !open, 'popup dismissed');
  const uboChrome = (await electron.windows()).find(page => page.url() === 'blanc-chrome://index/');
  await uboChrome.waitForFunction(() => document.activeElement?.id === 'pillShield' && document.querySelector('#pillShield').getAttribute('aria-expanded') === 'false');

  stage = 'original uBO popup to Island panel';
  overlay = await openShield();
  await uboChrome.evaluate(() => {
    window.__shieldIslandStates = [];
    window.__shieldIslandStateOff = window.browserAPI.onIslandState(({ mode }) => window.__shieldIslandStates.push(mode));
  });
  await overlay.locator('#shieldPopUblock').click();
  const secondPopup = await waitForValue(async () => (await electron.windows()).find(page => page.url().includes('/popup-fenix.html')), Boolean, 'original popup reopened');
  await secondPopup.locator('body:not(.loading)').waitFor();
  await secondPopup.locator('#switch').waitFor();
  await call('openPanel');
  await overlay.locator('#islandPanel').waitFor({ state: 'visible' });
  await waitForValue(async () => (await electron.windows()).some(page => page.url().includes('/popup-fenix.html')), open => !open, 'popup teardown completed');
  assert.equal(await call('overlayMode'), 'panel', 'popup teardown preserves the live Island mode');
  await uboChrome.waitForFunction(() => getComputedStyle(document.querySelector('#islandPill')).visibility === 'hidden');
  const panelModes = await uboChrome.evaluate(() => {
    window.__shieldIslandStateOff();
    return window.__shieldIslandStates;
  });
  const panelStart = panelModes.indexOf('panel');
  assert(panelStart !== -1, 'chrome received the panel state');
  assert(panelModes.slice(panelStart).every(mode => mode === 'panel'), 'popup teardown never resets chrome to a dismissed Island');
  await overlay.waitForFunction(() => document.activeElement?.id === 'addressInput');
  await call('closeOverlay');
  await waitForValue(() => call('overlayMode'), mode => mode === null, 'panel dismissed');

  stage = 'private tabs keep Blanc';
  await fixture(true);
  overlay = await openShield();
  assert(await overlay.locator('#shieldPopChangeProvider').isDisabled());
  assert(await overlay.locator('#shieldPopUblock').isHidden());
  assert.match(await overlay.locator('#shieldPopProviderStatus').innerText(), /can’t load uBO in temporary private sessions/);
  assert.equal(await overlay.evaluate(() => window.browserAPI.selectBlockingProvider('blanc')), false);
  assert.equal((await call('blockingStatus')).selected, 'ublock-origin');
  await overlay.screenshot({ animations: 'disabled', path: 'output/playwright/shield-provider-private.png' });
  await closeShield(overlay);

  stage = 'uBO to Blanc selection';
  await call('activateTab', regular);
  overlay = await openShield();
  await chooser(overlay, 'ublock-origin', true);
  await providerRadio(overlay, 'ublock-origin').press('ArrowUp');
  assert(await providerRadio(overlay, 'blanc').isChecked(), 'keyboard can select Blanc');
  await assertDraftOnly('ublock-origin');
  await restartFromChooser(overlay, true);
  assert.equal(persistedProvider(), 'blanc');
  await launch(true);
  assert.equal((await call('blockingStatus')).active, 'blanc');
  assert.equal((await call('blockingStatus')).restartPending, false);
  assert.deepEqual(uiErrors, [], 'Blanc chrome UI has no uncaught renderer errors');
  console.log('Shield provider desktop passed: two-step chooser, draft/broadcast preservation, Done/back/close, saved and draft restart actions in both directions, original uBO popup and panel teardown, outside input on newly created/woken views, native appearance, small-window actions, authentic Sunrise asset, keyboard/focus, private and unavailable guards, no selection reload.');
} catch (error) {
  console.error('Shield stage:', stage, stderr, uiErrors);
  if (electron) {
    console.error('Popup focus events:', await popupFocusTrace.read(electron).catch(() => []));
    console.error('Shield overlay mode:', await call('overlayMode').catch(() => 'unavailable'));
    const chrome = (await Promise.resolve().then(() => electron.windows()).catch(() => [])).find(page => page.url() === 'blanc-chrome://index/');
    console.error('Shield geometry:', await chrome?.evaluate(() => ['islandPill', 'pillShield'].map(id => {
      const element = document.getElementById(id); const css = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return { id, hidden: element.hidden, visibility: css.visibility, display: css.display, transform: css.transform, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })).catch(() => []));
  }
  throw error;
} finally {
  clearTimeout(watchdog);
  await electron?.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(dir + '-Dev', { recursive: true, force: true });
}
