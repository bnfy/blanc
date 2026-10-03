// Dedicated uBO suite: BLANC_TEST exposes fixture controls; the additional
// unpackaged-only flag explicitly keeps real network/cosmetic blocking ON.
// Original controls are driven through their DOM handlers inside actual native
// extension documents. Installed-platform mouse/keyboard acceptance is separate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import popupFocusTrace from './support/popup-focus-trace.js';
import testCalls from './support/test-hook-call.js';
const { waitForValue } = poll;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ubo-desktop-'));
fs.mkdirSync(dir + '-Dev', { recursive: true });
fs.writeFileSync(path.join(dir + '-Dev', 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockProvider: 'ublock-origin', adblockEnabled: true,
  searchSuggestions: false, usagePing: false, onePasswordEnabled: false,
}));
const hits = [];
const methods = [];
const socketUpgrades = [];
let subscriptionRevision = 1;
const subscriptionResponses = [];
const server = http.createServer((request, response) => {
  hits.push(request.url);
  methods.push({ url: request.url, method: request.method });
  const pathname = new URL(request.url, 'http://fixture').pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (pathname === '/slow-document') {
    response.write('<!doctype html><script>window.slowDocumentStarted=true</script><div id=slow-marker>Slow fixture</div>');
    setTimeout(() => response.end('<p>Finished</p>'), 5000); return;
  }
  if (pathname === '/fixture-sw.js') { response.setHeader('Content-Type', 'application/javascript'); response.end("self.addEventListener('install',e=>e.waitUntil(self.skipWaiting())); self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));"); return; }
  if (pathname === '/redirect-start') { response.writeHead(302, { Location: '/redirect-final' }); response.end(); return; }
  if (pathname.endsWith('.js')) {
    response.setHeader('Content-Type', 'application/javascript');
    response.end('window.fixtureAllowed = true;'); return;
  }
  response.setHeader('Content-Type', 'text/html');
  if (pathname === '/nested') { response.end('<!doctype html><iframe src="/frame-one"></iframe>'); return; }
  if (pathname === '/frame-one') { response.end('<!doctype html><iframe src="/frame-two"></iframe>'); return; }
  if (pathname === '/frame-two') { response.end('<!doctype html><script src="/blocked-ubo.js?nested"></script><p>Nested frame</p>'); return; }
  if (pathname === '/permissions-fixture') { response.end('<!doctype html><p>Permissions Policy fixture</p>'); return; }
  if (pathname === '/csp-fixture') { response.end('<!doctype html><script>window.cspFixtureRan=true</script><p>Header fixture</p>'); return; }
  if (pathname === '/dynamic-fixture') { response.end('<!doctype html><script src="/dynamic-target.js"></script><p>Dynamic fixture</p>'); return; }
  if (pathname === '/post-form') { response.end('<!doctype html><form method="post" action="/post-result"><input name="token" value="test"><button>Submit</button></form>'); return; }
  if (pathname === '/oauth-opener') { response.end('<!doctype html><button onclick="window.open(\'/oauth-child\',\'OAuth\',\'popup,width=480,height=500\')">Sign in</button>'); return; }
  if (pathname === '/fixture-list.txt') { subscriptionResponses.push(subscriptionRevision); response.end('! Title: Blanc fixture list\n! Expires: 1 hour\n/subscription-blocked.js$script\n' + (subscriptionRevision > 1 ? '/subscription-new.js$script\n' : '')); return; }
  if (pathname === '/subscription-fixture') { response.end('<!doctype html><script src="/subscription-blocked.js"></script><p>Subscription fixture</p>'); return; }
  response.end('<!doctype html><title>uBO acceptance fixture</title><div id="ad">Cosmetic fixture</div><div id="procedure">Procedural fixture</div><div id="control">Allowed</div><script src="/blocked-ubo.js"></script><script src="/redirect-ubo.js"></script><script src="/allowed-control.js"></script>' + (request.url.includes('private-marker') ? '<script src="/ads/cbr.js?private-network-marker"></script>' : ''));
});
server.on('upgrade', (request, socket) => {
  socketUpgrades.push(request.url);
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const fixture = `http://127.0.0.1:${server.address().port}/`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
void ignored;
let electron;
let errors = '';
const uncaughtLog = path.join(dir, 'uncaught.txt');
const started = Date.now();
const timing = {};
let stage = 'cold launch';
const watchdog = setTimeout(() => { console.error('uBO suite exceeded 120 seconds at stage: ' + stage); electron?.process().kill('SIGKILL'); }, 120000);
try {
  electron = await _electron.launch({
    ...(process.env.BLANC_UBLOCK_ELECTRON ? { executablePath: process.env.BLANC_UBLOCK_ELECTRON } : {}),
    // Keep fixture updates deterministic: external first-install lists use
    // their bundled cache, while the local subscription still updates over HTTP.
    args: [path.resolve('.'), `--user-data-dir=${dir}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'], chromiumSandbox: true,
    env: { ...env, BLANC_TEST: '1', BLANC_UBLOCK_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaughtLog }, timeout: 30000,
  });
  electron.context().setDefaultTimeout(10000);
  electron.context().setDefaultNavigationTimeout(15000);
  electron.process().stderr.on('data', data => { errors = (errors + data).slice(-16000); });
  console.log('uBO test Electron PID', electron.process().pid);
  electron.process().once('exit', (code, signal) => console.log('uBO fixture process exit:', { stage, code, signal }));
  await electron.evaluate(({ app, BrowserWindow }) => {
    for (const event of ['before-quit', 'window-all-closed', 'will-quit']) app.on(event, () => console.log('uBO fixture app lifecycle:', event));
    const observe = win => { const id = win.id; win.on('closed', () => console.log('uBO fixture window closed:', id)); };
    for (const win of BrowserWindow.getAllWindows()) observe(win);
    app.on('browser-window-created', (_event, win) => observe(win));
  });
  await popupFocusTrace.install(electron);
  await electron.firstWindow();
  await electron.evaluate(({ app, webContents }) => {
    globalThis.uboDesktopLog = [];
    const observe = wc => wc.on('console-message', event => { uboDesktopLog.push({ url: wc.getURL().slice(0,200), message: event.message.slice(0,500) }); if (uboDesktopLog.length > 256) uboDesktopLog.shift(); });
    webContents.getAllWebContents().forEach(observe);
    app.on('web-contents-created', (_event, wc) => observe(wc));
  });
  const call = (method, ...args) => testCalls.callTestHook(electron, method, args);
  const openFixturePopup = async () => {
    await popupFocusTrace.focusFixtureWindow(electron);
    return call('blockingPopup');
  };
  await waitForValue(() => call('blockingStatus'), state => state.phase === 'ready', 'real uBO ready', 20000);
  timing.startupReadyMs = Date.now() - started;
  assert.equal((await call('blockingStatus')).active, 'ublock-origin');
  assert.equal(await electron.evaluate(({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage').getBackgroundThrottling()), false);
  await call('blockingOpen', 'dashboard');
  const dashboard = await waitForValue(async () => (await electron.windows()).find(page => page.url().includes('/dashboard.html')), Boolean, 'original dashboard');
  await dashboard.frameLocator('#iframe').locator('[data-setting-name="collapseBlocked"]').waitFor({ timeout: 5000 });
  const dashboardId = (await call('state')).tabs.find(tab => tab.url.includes('/dashboard.html')).id;
  await call('blockingOpen', 'dashboard');
  assert.deepEqual((await call('state')).tabs.filter(tab => tab.url.includes('/dashboard.html')).map(tab => tab.id), [dashboardId], 'repeat dashboard actions reuse the owning profile tab');
  // Upstream enables/disables these controls after its asynchronous settings
  // response; visible HTML alone does not establish that initialization ended.
  await waitForValue(async () => Promise.all(['cloudStorageEnabled', 'prefetchingDisabled'].map(name =>
    dashboard.frameLocator('#iframe').locator(`[data-setting-name="${name}"]`).isDisabled())),
  disabled => disabled.every(Boolean), 'unsupported controls disabled after settings response', 5000);
  await dashboard.locator('[data-pane="1p-filters.html"]').dispatchEvent('click');
  const filters = await waitForValue(async () => dashboard.frames().find(frame => frame.url().endsWith('/1p-filters.html')), Boolean, 'original My filters');
  await filters.locator('.CodeMirror').waitFor();
  await filters.waitForFunction(() => typeof self.hasUnsavedData === 'function' && self.hasUnsavedData() === false);
  await filters.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setValue('/blocked-ubo.js$script\n/redirect-ubo.js$script,redirect=noop.js\n127.0.0.1###ad\n127.0.0.1##div:has-text(Procedural fixture)\n127.0.0.1##+js(set, fixturePinned, true)\n/strict-fixture$document\n/blocked-websocket$websocket\n/csp-fixture$csp=script-src \'none\'\n/permissions-fixture$permissions=camera=()|microphone=()|geolocation=()\n'));
  await filters.locator('#userFiltersApply').dispatchEvent('click');
  await filters.locator('#userFiltersApply').waitFor({ state: 'visible' });
  await waitForValue(() => filters.locator('#userFiltersApply').isDisabled(), Boolean, 'filters applied');
  const regular = await call('openTab', fixture);
  const page = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture), Boolean, 'ordinary fixture');
  await page.waitForFunction(() => window.fixtureAllowed === true && getComputedStyle(document.querySelector('#ad')).display === 'none');
  assert(!hits.includes('/blocked-ubo.js'));
  assert(!hits.includes('/redirect-ubo.js'));
  assert(hits.includes('/allowed-control.js'));
  await page.waitForFunction(() => window.fixturePinned === true && getComputedStyle(document.querySelector('#procedure')).display === 'none');
  stage = 'WebSocket filtering';
  for (const name of ['blocked-websocket', 'allowed-websocket']) {
    await page.evaluate(url => new Promise(resolve => {
      const socket = new WebSocket(url); socket.onerror = () => resolve(); socket.onopen = () => { socket.close(); resolve(); };
    }), fixture.replace('http:', 'ws:') + name);
  }
  assert(!socketUpgrades.includes('/blocked-websocket'), 'blocked WebSocket must never reach fixture upgrade handler');
  assert(socketUpgrades.includes('/allowed-websocket'), 'allowed WebSocket proves native upgrade observation');
  stage = 'slow document injection';
  const slowTab = await call('openTab', fixture + 'slow-document');
  const slowPage = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + 'slow-document'), Boolean, 'streaming document');
  await slowPage.waitForFunction(() => window.slowDocumentStarted === true);
  const slowWC = (await call('state')).tabs.find(tab => tab.id === slowTab).webContentsId;
  const slowStableId = (await call('blockingMapping')).find(item => item.webContentsId === slowWC).tabId;
  await electron.evaluate(async ({ webContents }) => {
    const cssHost = webContents.getAllWebContents().find(wc => wc.getURL().endsWith('/bridge.html'));
    await cssHost.executeJavaScript(`self.fixtureNativeCSS = chrome.scripting.executeScript.bind(chrome.scripting); chrome.scripting.executeScript = async options => { self.fixtureCSSStarted = true; await new Promise(resolve => setTimeout(resolve, 2500)); return self.fixtureNativeCSS(options); }; true`);
  });
  const delayedCSS = electron.evaluate(async ({ webContents }, id) => {
    const background = webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage');
    await background.executeJavaScript(`chrome.tabs.insertCSS(${id}, {code:'#slow-marker { display: none !important; }',cssOrigin:'user'})`);
  }, slowStableId);
  await waitForValue(() => electron.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(wc => wc.getURL().endsWith('/bridge.html')).executeJavaScript('self.fixtureCSSStarted === true')), Boolean, 'delayed CSS operation started');
  await slowPage.evaluate(() => fetch('/allowed-control.js?during-css').then(response => response.text()));
  assert(hits.includes('/allowed-control.js?during-css'), 'network filtering remains usable during slow non-network work');
  await delayedCSS;
  await electron.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(wc => wc.getURL().endsWith('/bridge.html')).executeJavaScript('chrome.scripting.executeScript = self.fixtureNativeCSS; true'));

  await slowPage.waitForFunction(() => getComputedStyle(document.querySelector('#slow-marker')).display === 'none');
  assert.equal(await slowPage.evaluate(() => document.readyState), 'loading', 'CSS must apply before parsing completes');
  const idleResults = await electron.evaluate(async ({ webContents }, id) => {
    const background = webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage');
    return background.executeJavaScript(`chrome.tabs.executeScript(${id}, {code:'window.slowIdleInjection=true',runAt:'document_idle'})`);
  }, slowStableId);
  assert.deepEqual(idleResults, [true], 'script completes in uBO’s isolated world on the current document');
  assert.equal((await call('blockingStatus')).phase, 'ready');
  await call('closeTab', slowTab);
  await call('activateTab', regular);
  stage = 'web-accessible resource guard';
  const resourceIdentity = await electron.evaluate(async ({ webContents }) => {
    const bg = webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage');
    return bg.executeJavaScript('({id:chrome.runtime.id, secret:vAPI.warSecret.short()})');
  });
  const resourceLoaded = url => page.evaluate(url => new Promise(resolve => {
    const image = new Image(); image.onload = () => resolve(true); image.onerror = () => resolve(false); image.src = url;
  }), url);
  const resourceURL = `chrome-extension://${resourceIdentity.id}/web_accessible_resources/1x1.gif`;
  assert.equal(await resourceLoaded(resourceURL + '?probe=missing'), false, 'a page cannot fetch a managed resource without a secret');
  assert.equal(await resourceLoaded(resourceURL.replace('/web_', '/%77eb_') + '?probe=encoded'), false, 'an encoded path cannot bypass resource authorization');
  assert.equal(await resourceLoaded(resourceURL.replace('/web_', '//web_') + '?probe=repeated-separator'), false, 'a repeated separator cannot bypass resource authorization');
  assert.equal(await resourceLoaded(resourceURL.replace('/1x1.gif', String.fromCharCode(92) + '1x1.gif') + '?probe=backslash'), false, 'a backslash cannot bypass resource authorization');
  assert.equal(await resourceLoaded(resourceURL + '?secret=invalid'), false, 'a page cannot fetch a managed resource with a forged secret');
  assert.equal(await resourceLoaded(resourceURL + '?secret=' + resourceIdentity.secret), true, 'upstream permits a valid resource capability');
  assert.equal(await resourceLoaded(resourceURL + '?secret=' + resourceIdentity.secret + '&reuse=1'), false, 'a short resource capability is one-use');
  const mapping = await call('blockingMapping');
  const regularWC = (await call('state')).tabs.find(tab => tab.id === regular).webContentsId;
  const stableId = mapping.find(item => item.webContentsId === regularWC).tabId;
  await openFixturePopup();
  const popup = await waitForValue(async () => (await electron.windows()).find(item => item.url().includes('/popup-fenix.html')), Boolean, 'original popup');
  await popup.locator('body:not(.loading)').waitFor();
  await popup.waitForFunction(() => {
    const mark = document.querySelector('#blancMark');
    return mark?.src === 'blanc://ubo-brand/sunrise.png' && mark.complete && mark.naturalWidth > 0;
  });
  await popup.locator('#switch').waitFor();
  assert.match(await popup.locator('body').innerText(), /1/);
  await popup.locator('#switch').dispatchEvent('click');
  await page.reload();
  await waitForValue(() => hits.includes('/blocked-ubo.js'), Boolean, 'trusted site allowed control');
  await call('toggleAdblock');
  await page.waitForFunction(() => document.querySelector('#ad') && getComputedStyle(document.querySelector('#ad')).display === 'none');
  const privateId = await call('openTab', fixture + '?private-marker', { private: true });
  const privateTab = await waitForValue(async () => (await call('state')).tabs.find(tab => tab.id === privateId && !tab.isLoading), Boolean, 'private fixture');
  assert.equal(privateTab.sessionPersistent, false);
  assert(!(await call('blockingMapping')).some(item => item.webContentsId === privateTab.webContentsId));
  const extensions = await electron.evaluate(({ webContents }, id) => webContents.fromId(id).session.extensions.getAllExtensions(), privateTab.webContentsId);
  // Official Electron redirects extension *enumeration* for off-the-record
  // contexts to Personal. Native incognito execution is disabled; additionally
  // our host refuses unmapped/private contents. Assert actual page behavior.
  assert(extensions.every(item => typeof item.id === 'string'));
  const privateContent = await electron.evaluate(async ({ webContents }, id) => {
    const wc = webContents.fromId(id);
    return { persistent: wc.session.isPersistent(), display: await wc.executeJavaScript('getComputedStyle(document.querySelector("#ad")).display'), sessionPath: wc.session.getStoragePath() };
  }, privateTab.webContentsId);
  assert.equal(privateContent.display, 'block');
  assert.equal(privateContent.sessionPath, null);
  assert(!hits.includes('/ads/cbr.js?private-network-marker'));
  await call('setAdblock', false);
  assert.equal(await resourceLoaded(resourceURL + '?secret=forged-disabled'), false, 'disabling filtering does not disable resource authorization');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#ad')).display !== 'none' && getComputedStyle(document.querySelector('#procedure')).display !== 'none');
  await page.evaluate(() => { const item = document.createElement('div'); item.id = 'newProcedure'; item.textContent = 'Procedural fixture'; document.body.append(item); });
  assert.equal(await page.locator('#newProcedure').evaluate(item => getComputedStyle(item).display), 'block');
  await call('openTab', fixture + '?disabled-new-page');
  const unfiltered = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + '?disabled-new-page'), Boolean, 'disabled fixture');
  await unfiltered.waitForFunction(() => window.fixtureAllowed === true);
  assert.equal(await unfiltered.evaluate(() => window.fixturePinned), undefined);
  assert.equal(await unfiltered.locator('#ad').evaluate(item => getComputedStyle(item).display), 'block');
  await call('setAdblock', true);
  await call('activateTab', regular);
  await page.reload();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#ad')).display === 'none');
  console.log('uBO core and isolation passed; exercising tools');
  stage = 'original tools';
  await page.evaluate(() => {
    window.uboForgedPortReplies = 0;
    window.uboForgedPortAttempts = 0;
    const timer = setInterval(() => {
      for (const frame of document.querySelectorAll('iframe')) {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => { window.uboForgedPortReplies++; };
        frame.contentWindow.postMessage({ what: 'epickerStart', blancToolCapability: '0'.repeat(32) }, '*', [channel.port2]);
        window.uboForgedPortAttempts++;
        setTimeout(() => channel.port1.close(), 1000);
      }
      if (window.uboForgedPortAttempts >= 16) clearInterval(timer);
    }, 5);
    setTimeout(() => clearInterval(timer), 15000);
  });
  await openFixturePopup();
  let toolsPopup = await waitForValue(async () => (await electron.windows()).find(item => item.url().includes('/popup-fenix.html')), Boolean, 'picker popup');
  await toolsPopup.locator('body:not(.loading)').waitFor();
  await Promise.all([toolsPopup.waitForEvent('close'), toolsPopup.locator('#gotoPick').dispatchEvent('click')]);
  console.log('picker launched');
  const picker = await waitForValue(async () => page.frames().find(frame => frame.url().includes('/epicker-ui.html')), Boolean, 'original element picker', 10000);
  await picker.waitForFunction(() => document.querySelector('svg#sea path')?.getAttribute('d')?.length > 0);
  await waitForValue(() => page.evaluate(() => window.uboForgedPortAttempts), count => count > 0, 'hostile parent handoff attempted');
  assert.equal(await page.evaluate(() => window.uboForgedPortReplies), 0, 'a forged parent port cannot receive picker data');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })));
  // Exercise the original handler without CDP waiting for an input ack from
  // the iframe that this same handler destroys. Native keyboard UI remains
  // part of the installed-candidate platform gate.
  await waitForValue(async () => page.frames().some(frame => frame.url().includes('/epicker-ui.html')), value => !value, 'picker dismissed');
  await openFixturePopup();
  toolsPopup = await waitForValue(async () => (await electron.windows()).find(item => item.url().includes('/popup-fenix.html')), Boolean, 'zapper popup');
  stage = 'original zapper';
  await toolsPopup.locator('body:not(.loading)').waitFor();
  await Promise.all([toolsPopup.waitForEvent('close'), toolsPopup.locator('#gotoZap').dispatchEvent('click')]);
  const zapper = await waitForValue(async () => page.frames().find(frame => frame.url().includes('/epicker-ui.html') && frame.url().includes('zap=1')), Boolean, 'original element zapper');
  await zapper.waitForFunction(() => document.querySelector('svg#sea path')?.getAttribute('d')?.length > 0);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })));
  // Exercise the original handler without CDP waiting for an input ack from
  // the iframe that this same handler destroys. Native keyboard UI remains
  // part of the installed-candidate platform gate.
  await waitForValue(async () => page.frames().some(frame => frame.url().includes('/epicker-ui.html')), value => !value, 'zapper dismissed');
  stage = 'native context-menu handler';
  await electron.evaluate(({ Menu }) => {
    const original = Menu.prototype.popup;
    globalThis.uboFixtureMenu = null;
    Menu.prototype.popup = function(...args) { uboFixtureMenu = this; return undefined; };
    globalThis.uboRestoreMenu = () => { Menu.prototype.popup = original; };
  });
  await page.locator('#control').click({ button: 'right' });
  await waitForValue(() => electron.evaluate(() => !!uboFixtureMenu?.getMenuItemById('uBlock0-blockElement')), Boolean, 'native uBO menu item');
  await electron.evaluate(() => { const item = uboFixtureMenu.getMenuItemById('uBlock0-blockElement'); item.click(); uboRestoreMenu(); });
  const contextPicker = await waitForValue(async () => page.frames().find(frame => frame.url().includes('/epicker-ui.html')), Boolean, 'context-menu element picker');
  await contextPicker.waitForFunction(() => document.querySelector('svg#sea path')?.getAttribute('d')?.length > 0);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })));
  // Exercise the original handler without CDP waiting for an input ack from
  // the iframe that this same handler destroys. Native keyboard UI remains
  // part of the installed-candidate platform gate.
  stage = 'original logger';
  await call('blockingOpen', 'logger');
  const logger = await waitForValue(async () => (await electron.windows()).find(item => item.url().includes('/logger-ui.html')), Boolean, 'original logger');
  await logger.locator('#netInspector').waitFor();
  await waitForValue(() => electron.evaluate(async ({ webContents }) => {
    const bg = webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage');
    return bg.executeJavaScript("import('/js/logger.js').then(module => module.default.enabled)");
  }), Boolean, 'logger registered with background', 10000);
  await call('activateTab', regular);
  await page.reload();
  // The detached logger view does not paint on every platform. Return to it
  // before expecting upstream's animation-frame DOM updates to appear.
  await call('activateTab', (await call('state')).tabs.find(tab => tab.url.includes('/logger-ui.html')).id);
  await waitForValue(async () => logger.locator('body').innerText(), text => text.includes('blocked-ubo.js'), 'logger blocked request', 10000);
  assert(!(await logger.locator('body').innerText()).includes('private-marker'));
  assert(!(await logger.locator('body').innerText()).includes('private-network-marker'));
  stage = 'original DOM inspector';
  const inspectorTab = await logger.locator('#pageSelector option').evaluateAll(options => options.find(option => Number(option.value) > 0 && option.textContent.includes('uBO acceptance fixture'))?.value);
  assert(inspectorTab, 'fixture tab appears in the original logger selector');
  await logger.locator('#pageSelector').selectOption(inspectorTab);
  await logger.locator('#showdom').dispatchEvent('click');
  const inspector = await waitForValue(async () => page.frames().find(frame => frame.url().includes('/dom-inspector.html')), Boolean, 'original DOM inspector');
  await waitForValue(() => logger.locator('#domTree').innerText(), text => text.includes('body'), 'DOM inspector tree populated');
  assert(inspector);
  // A new document must reconnect the original logger channel through the
  // host's sender-validated DOMContentLoaded event, without exposing private tabs.
  await page.reload();
  await waitForValue(async () => page.frames().find(frame => frame.url().includes('/dom-inspector.html')), Boolean, 'DOM inspector after navigation');
  await waitForValue(() => logger.locator('#domTree').innerText(), text => text.includes('body'), 'DOM inspector reconnected tree');
  await logger.locator('#showdom').dispatchEvent('click');
  await waitForValue(async () => page.frames().some(frame => frame.url().includes('/dom-inspector.html')), value => !value, 'DOM inspector dismissed');
  stage = 'original popup tool reuse';
  for (const [tool, pathname] of [['dashboard', '/dashboard.html'], ['logger', '/logger-ui.html']]) {
    const original = (await call('state')).tabs.find(tab => tab.url.includes(pathname));
    for (let attempt = 0; attempt < 2; attempt++) {
      await call('activateTab', regular);
      await openFixturePopup();
      const controls = await waitForValue(async () => (await electron.windows()).find(item => item.url().includes('/popup-fenix.html')), Boolean, tool + ' native popup');
      await controls.locator('body:not(.loading)').waitFor();
      // Upstream closes this document synchronously after opening the tool.
      // On ARM macOS that can precede CDP's dispatch acknowledgement. Require
      // closure and the intended owned-tab selection below, even in that case.
      await Promise.all([
        controls.waitForEvent('close'),
        controls.locator(`a[href^="${pathname.slice(1)}"]`).dispatchEvent('click').catch(error => {
          if (!controls.isClosed() || !error.message.includes('Target page, context or browser has been closed')) throw error;
        }),
      ]);
      await waitForValue(() => call('state'), state => state.activeTabId === original.id, tool + ' selected by original popup');
      assert.deepEqual((await call('state')).tabs.filter(tab => tab.url.includes(pathname)).map(tab => tab.id), [original.id], tool + ' popup reuses one tab across fragments');
    }
  }
  await call('activateTab', (await call('state')).tabs.find(tab => tab.url.includes('/dashboard.html')).id);
  // The original popup can reload an existing dashboard to its requested URL.
  // Its tab-click handlers are installed only after async dashboardConfig and
  // the initial pane selection; static navigation HTML is not readiness.
  await dashboard.waitForLoadState('load');
  await dashboard.locator('.tabButton.selected').waitFor();
  await dashboard.frameLocator('#iframe').locator('body').waitFor();
  await dashboard.locator('[data-pane="3p-filters.html"]').dispatchEvent('click');
  const lists = await waitForValue(async () => dashboard.frames().find(frame => frame.url().endsWith('/3p-filters.html')), Boolean, 'filter lists');
  await lists.locator('#autoUpdate').waitFor();
  await waitForValue(() => lists.locator('#autoUpdate').isChecked(), Boolean, 'filter-list preferences hydrated');
  await lists.locator('[data-role="import"] .listExpander').dispatchEvent('click');
  await lists.locator('[data-role="import"] textarea').fill(fixture + 'fixture-list.txt');
  stage = 'subscription data';
  await electron.evaluate(async ({ webContents }, url) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage').executeJavaScript(`(async () => {
    const io = (await import('./js/assets.js')).default;
    self.fixtureListEvents = [];
    self.fixtureUpdateTrace = [];
    const note = details => {
      if (self.fixtureUpdateTrace.length < 128) self.fixtureUpdateTrace.push({ at: Date.now(), ...details });
    };
    const timers = new WeakSet();
    for (const method of ['on', 'off']) {
      const original = vAPI.defer.Client.prototype[method];
      vAPI.defer.Client.prototype[method] = function(...args) {
        if (this.callback.name === 'updateNext' && !timers.has(this)) {
          timers.add(this);
          const callback = this.callback;
          this.callback = function(...values) { note({ event: 'timer-fired' }); return callback.apply(this, values); };
        }
        if (timers.has(this)) note({ event: method, pending: this.ongoing(), delay: method === 'on' ? args[0] : undefined });
        return original.apply(this, args);
      };
    }
    for (const method of ['updateStart', 'updateStop']) {
      const original = io[method];
      io[method] = function(...args) {
        note({ event: method, delay: args[0]?.fetchDelay, auto: args[0]?.auto });
        return original.apply(this, args);
      };
    }
    const fetchAsset = io.fetch;
    io.fetch = function(url, ...args) {
      const parsed = new URL(url);
      const kind = parsed.protocol === 'chrome-extension:' ? 'bundled' : parsed.hostname === '127.0.0.1' ? 'fixture' : 'remote';
      const at = Date.now();
      if (kind !== 'bundled') note({ event: 'fetch-start', kind });
      return fetchAsset.call(this, url, ...args).then(value => {
        if (kind !== 'bundled') note({ event: 'fetch-end', kind, elapsed: Date.now() - at, status: value.statusCode });
        return value;
      }, error => {
        if (kind !== 'bundled') note({ event: 'fetch-failed', kind, elapsed: Date.now() - at });
        throw error;
      });
    };
    io.addObserver((topic, details) => {
      if (topic === 'after-assets-updated') note({ event: 'cycle-ended', count: details?.assetKeys?.length || 0 });
      if ((topic === 'after-asset-updated' && !details?.assetKey?.startsWith('compiled/')) || topic === 'asset-update-failed' || (topic === 'before-asset-updated' && (details?.assetKey === ${JSON.stringify(url)} || ['assets.json', 'public_suffix_list.dat', 'ublock-badlists'].includes(details?.assetKey)))) {
        note({ event: topic, asset: details?.assetKey === ${JSON.stringify(url)} ? 'fixture' : details?.assetKey?.startsWith('compiled/') ? 'compiled' : details?.assetKey?.includes('://') ? 'external' : details?.assetKey });
      }
      if (details?.assetKey !== ${JSON.stringify(url)} && !details?.assetKeys?.includes(${JSON.stringify(url)})) return;
      if (self.fixtureListEvents.length < 32) self.fixtureListEvents.push({ topic,
        newRule: details.content?.includes('/subscription-new.js$script') ?? null });
    });
  })()`), fixture + 'fixture-list.txt');
  await lists.locator('#buttonApply').dispatchEvent('click');
  await waitForValue(() => hits.some(url => new URL(url, fixture).pathname === '/fixture-list.txt'), Boolean, 'user subscription fetched', 10000);
  await waitForValue(() => electron.evaluate(async ({ webContents }, url) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage')
    .executeJavaScript(`µBlock.availableFilterLists[${JSON.stringify(url)}]?.entryCount || 0`), fixture + 'fixture-list.txt'), value => value > 0, 'subscription compiled');
  await call('openTab', fixture + 'subscription-fixture');
  const subscriptionPage = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + 'subscription-fixture'), Boolean, 'subscription fixture');
  await subscriptionPage.waitForLoadState('load');
  assert(!hits.includes('/subscription-blocked.js'));
  // Use the original selection controls to isolate the fixture update from
  // unrelated remote lists; their CDN timing is not the behavior under test.
  await lists.evaluate(url => {
    for (const input of document.querySelectorAll('.listEntry[data-role="leaf"] input:checked')) {
      const key = input.closest('.listEntry').dataset.key;
      if (key !== 'user-filters' && key !== url) input.click();
    }
  }, fixture + 'fixture-list.txt');
  await lists.locator('#buttonApply').dispatchEvent('click');
  await waitForValue(() => lists.locator('#buttonApply').evaluate(item => item.classList.contains('disabled')), Boolean, 'fixture list selection saved');
  await call('activateTab', (await call('state')).tabs.find(tab => tab.url.includes('/dashboard.html')).id);
  // Do not call updateStop here: it is a shutdown operation, not an awaitable
  // barrier. An in-flight fetch can survive it and install a two-minute timer
  // after the cycle state resets, delaying the subsequent manual update. Let
  // the original dashboard-started cycle finish before exercising its clock.
  await waitForValue(() => electron.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage')
    .executeJavaScript("import('./js/assets.js').then(({ default: io }) => !io.isUpdating())")), Boolean, 'native updater cycle complete', 30000);
  await electron.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage')
    .executeJavaScript('µBlock.loadFilterLists().then(() => true)'));
  subscriptionRevision = 2;
  const listRequests = hits.filter(url => new URL(url, fixture).pathname === '/fixture-list.txt').length;
  const subscriptionRow = lists.locator(`[data-key="${fixture}fixture-list.txt"]`).first();
  const customGroup = lists.locator('[data-role="node"][data-key="custom"]').first();
  if (!(await customGroup.evaluate(item => item.classList.contains('expanded')))) await customGroup.locator(':scope > .detailbar .listExpander').dispatchEvent('click');
  await subscriptionRow.locator('.cache').dispatchEvent('click', { shiftKey: true });
  await waitForValue(() => hits.filter(url => new URL(url, fixture).pathname === '/fixture-list.txt').length, count => count > listRequests, 'original list update fetched', 30000);
  await waitForValue(() => electron.evaluate(async ({ webContents }, url) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage')
    .executeJavaScript(`µBlock.availableFilterLists[${JSON.stringify(url)}]?.entryCount || 0`), fixture + 'fixture-list.txt'), count => count > 1, 'updated subscription compiled', 30000);
  if (process.env.BLANC_UBLOCK_UPDATE_TRACE) console.log('Subscription update trace:', await electron.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage').executeJavaScript('self.fixtureUpdateTrace')));
  const beforeUpdated = hits.filter(url => url === '/subscription-new.js').length;
  await subscriptionPage.evaluate(() => new Promise(resolve => { const script = document.createElement('script'); script.src = '/subscription-new.js'; script.onload = script.onerror = resolve; document.body.append(script); }));
  assert.equal(hits.filter(url => url === '/subscription-new.js').length, beforeUpdated);

  for (const pane of ['dyna-rules.html', 'whitelist.html', 'support.html', 'about.html']) {
    await dashboard.locator(`[data-pane="${pane}"]`).dispatchEvent('click');
    const frame = await waitForValue(async () => dashboard.frames().find(frame => frame.url().endsWith('/' + pane)), Boolean, pane);
    await frame.locator('body').waitFor();
    assert((await frame.locator('body').innerText()).length > 20);
  }
  await dashboard.locator('[data-pane="dyna-rules.html"]').dispatchEvent('click');
  const rules = await waitForValue(async () => dashboard.frames().find(frame => frame.url().endsWith('/dyna-rules.html')), Boolean, 'dynamic rule editor');
  await rules.locator('.CodeMirror').first().waitFor();
  await rules.evaluate(url => {
    const editor = [...document.querySelectorAll('.CodeMirror')].map(item => item.CodeMirror).find(item => item.getOption('readOnly') !== 'nocursor');
    editor.setValue(editor.getValue() + '\n* ' + url + ' script block\n');
  }, fixture + 'dynamic-target.js');
  await rules.locator('#editSaveButton:not(.disabled)').dispatchEvent('click');
  await rules.locator('#commitButton:not(.disabled)').dispatchEvent('click');
  await call('openTab', fixture + 'dynamic-fixture');
  const dynamicPage = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + 'dynamic-fixture'), Boolean, 'dynamic fixture');
  await dynamicPage.waitForLoadState('load');
  assert(!hits.includes('/dynamic-target.js'));
  await call('openTab', fixture + 'csp-fixture');
  const cspPage = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + 'csp-fixture'), Boolean, 'CSP fixture');
  await cspPage.waitForLoadState('load');
  assert.equal(await cspPage.evaluate(() => window.cspFixtureRan), undefined);
  stage = 'combined Permissions Policy';
  const featurePolicy = target => target.evaluate(() => Object.fromEntries(
    ['camera', 'microphone', 'geolocation'].map(name => [name, document.featurePolicy.allowsFeature(name)])
  ));
  assert.deepEqual(await featurePolicy(page), { camera: true, microphone: true, geolocation: true }, 'allowed page proves the feature-policy control');
  await call('openTab', fixture + 'permissions-fixture');
  const permissionsPage = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + 'permissions-fixture'), Boolean, 'Permissions Policy fixture');
  await permissionsPage.waitForLoadState('load');
  assert.deepEqual(await featurePolicy(permissionsPage), { camera: false, microphone: false, geolocation: false }, 'every combined directive must be enforced by the native browser');
  const nestedId = await call('openTab', fixture + 'nested');
  const nestedPage = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + 'nested'), Boolean, 'nested frames');
  await waitForValue(() => nestedPage.frames().map(frame => frame.url()), urls => urls.length === 3 && urls.some(url => url.endsWith('/frame-two')), 'three committed frames');
  assert(!hits.includes('/blocked-ubo.js?nested'));
  const nestedWC = (await call('state')).tabs.find(tab => tab.id === nestedId).webContentsId;
  const nestedStableId = (await call('blockingMapping')).find(item => item.webContentsId === nestedWC).tabId;
  const frames = await electron.evaluate(async ({ webContents }, id) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage')
    .executeJavaScript(`chrome.webNavigation.getAllFrames({tabId:${id}})`), nestedStableId);
  assert.equal(frames.length, 3);
  const firstFrame = frames.find(frame => frame.url.endsWith('/frame-one'));
  const secondFrame = frames.find(frame => frame.url.endsWith('/frame-two'));
  assert.equal(firstFrame.parentFrameId, 0); assert.equal(secondFrame.parentFrameId, firstFrame.frameId);
  await call('openTab', fixture + 'redirect-start');
  await waitForValue(() => hits.includes('/redirect-final'), Boolean, 'redirect lifecycle');
  await call('openTab', fixture + 'post-form');
  const postPage = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + 'post-form'), Boolean, 'POST form');
  await postPage.locator('button').click();
  await postPage.waitForURL(fixture + 'post-result');
  const postWC = (await call('state')).tabs.find(tab => tab.url === fixture + 'post-result').webContentsId;
  const postStableId = (await call('blockingMapping')).find(item => item.webContentsId === postWC).tabId;
  assert.equal(await electron.evaluate(async ({ webContents }, id) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage')
    .executeJavaScript(`chrome.tabs.reload(${id}).then(()=>false,()=>true)`), postStableId), true);
  assert.equal(methods.filter(item => item.url === '/post-result').length, 1);
  assert.equal(methods.find(item => item.url === '/post-result').method, 'POST');
  await call('activateTab', (await call('state')).tabs.find(tab => tab.url.includes('/dashboard.html')).id);
  await dashboard.locator('[data-pane="settings.html"]').dispatchEvent('click');
  const settingsPane = await waitForValue(async () => dashboard.frames().find(frame => frame.url().endsWith('/settings.html')), Boolean, 'backup settings');
  stage = 'backup and restore';
  stage = 'backup import and native reload';
  const backupFile = path.join(dir, 'ubo-backup.txt');
  await electron.evaluate(({ session }, savePath) => {
    session.defaultSession.once('will-download', (_event, item) => item.setSavePath(savePath));
  }, backupFile);
  await settingsPane.locator('#export').click();
  await waitForValue(() => fs.existsSync(backupFile) && fs.statSync(backupFile).size > 10, Boolean, 'original backup downloaded');
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  assert(backup.userFilters.includes('/blocked-ubo.js'));
  assert(!JSON.stringify(backup).includes('private-marker'));
  backup.hiddenSettings = { ...backup.hiddenSettings, userResourcesLocation: fixture + 'forbidden-resource.js' };
  fs.writeFileSync(backupFile, JSON.stringify(backup));
  dashboard.on('dialog', dialog => dialog.accept());
  await settingsPane.locator('#restoreFilePicker').setInputFiles(backupFile);
  await waitForValue(async () => call('blockingStatus'), state => state.phase === 'initializing', 'restore reload started');
  await waitForValue(async () => call('blockingStatus'), state => state.phase === 'ready', 'backup restore ready', 20000);
  await call('activateTab', regular);
  await page.reload();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#ad')).display === 'none');
  assert(!hits.includes('/forbidden-resource.js'));
  assert.equal(await electron.evaluate(async ({ webContents }) => {
    const bg = webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage');
    return bg.executeJavaScript('µBlock.hiddenSettings.userResourcesLocation');
  }), 'unset');
  await call('openTab', fixture + 'strict-fixture');
  await waitForValue(async () => (await electron.windows()).some(item => item.url().includes('/document-blocked.html')), Boolean, 'strict-block page');
  assert(!hits.includes('/strict-fixture'));
  stage = 'quiet tab wake';
  assert(await call('sleepTab', regular));
  assert(!(await call('blockingMapping')).some(item => item.webContentsId === regularWC));
  // Native destruction precedes Playwright's target-detached notification.
  // Wait for that old page to leave before resolving a new page by the same URL.
  await waitForValue(() => page.isClosed(), Boolean, 'quiet fixture renderer detached');
  await call('activateTab', regular);
  const awake = await waitForValue(async () => (await electron.windows()).find(item => item !== page && item.url() === fixture), Boolean, 'quiet fixture awakened');
  await awake.waitForFunction(() => getComputedStyle(document.querySelector('#ad')).display === 'none');
  console.log('uBO lifecycle passed; exercising profiles and restart persistence');
  stage = 'profiles and OAuth';
  const primaryRuntime = (await call('windowRuntimes'))[0].id;
  const initialProfileUrl = fixture + '?named-profile-first-load';
  await call('setHomePage', initialProfileUrl);
  const profileStarted = Date.now();
  const named = await call('createProfileWindow', 'uBO isolated profile');
  await call('setHomePage', '');
  assert(named.ok);
  // The provider has successive CSS/background/bridge waits (2/15/15 s),
  // in addition to extraction and native load time. Give this test 40 s, but
  // surface a provider failure immediately and record the observed latency.
  await waitForValue(async () => {
    const state = await call('blockingStatusInWindow', named.runtimeId);
    assert.notEqual(state.phase, 'failed', `named profile provider failed: ${JSON.stringify(state)}`);
    return state;
  }, state => state.phase === 'ready', 'named profile ready', 40000);
  timing.namedProfileReadyMs = Date.now() - profileStarted;
  console.log('Named profile initialization:', timing.namedProfileReadyMs, 'ms');
  const initialProfilePage = await waitForValue(async () => (await electron.windows()).find(item => item.url() === initialProfileUrl), Boolean, 'named profile first navigation after readiness');
  await initialProfilePage.waitForFunction(() => window.fixtureAllowed === true);
  assert.equal(hits.filter(url => url === '/?named-profile-first-load').length, 1, 'first profile GET must reach the server once after readiness');
  await call('blockingOpenInWindow', named.runtimeId, 'dashboard');
  const namedDashboard = await waitForValue(async () => (await electron.windows()).find(item => item.url().includes('/dashboard.html') && item !== dashboard), Boolean, 'named dashboard');
  assert.equal(new URL(namedDashboard.url()).host, new URL(dashboard.url()).host, 'profiles share the pinned extension identity');
  await namedDashboard.frameLocator('#iframe').locator('[data-setting-name="collapseBlocked"]').waitFor();
  await namedDashboard.locator('[data-pane="1p-filters.html"]').dispatchEvent('click');
  const namedFilters = await waitForValue(async () => namedDashboard.frames().find(frame => frame.url().endsWith('/1p-filters.html')), Boolean, 'named filters');
  await namedFilters.locator('.CodeMirror').waitFor();
  assert.equal(await namedFilters.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue().trim()), '');
  const namedUrl = fixture + '?named-profile';
  await call('openTabInWindow', named.runtimeId, namedUrl);
  const namedPage = await waitForValue(async () => (await electron.windows()).find(item => item.url() === namedUrl), Boolean, 'named fixture');
  await namedPage.waitForFunction(() => window.fixtureAllowed === true);
  assert.equal(await namedPage.locator('#ad').evaluate(item => getComputedStyle(item).display), 'block');
  const deletionPrincipal = await electron.evaluate(async ({ webContents }, url) => {
    const page = webContents.getAllWebContents().find(wc => wc.getURL() === url);
    const background = webContents.getAllWebContents().find(wc => wc.session === page.session && wc.getType() === 'backgroundPage');
    await background.executeJavaScript("chrome.storage.local.set({blancDeletionFixture:'must-be-erased'})");
    return { id: background.getURL().split('/')[2], path: page.session.storagePath };
  }, namedUrl);
  console.log('named profile isolated; deleting');
  await electron.evaluate(({ BrowserWindow, webContents }, url) => {
    globalThis.uboDeletionEvents = [];
    const wc = webContents.getAllWebContents().find(item => item.getURL() === url);
    for (const win of BrowserWindow.getAllWindows()) {
      win.on('hide', () => uboDeletionEvents.push('hide'));
      win.on('closed', () => uboDeletionEvents.push('closed'));
      for (const name of ['hide', 'destroy']) {
        const original = win[name].bind(win);
        win[name] = (...args) => { uboDeletionEvents.push(name + ':called'); const result = original(...args); uboDeletionEvents.push(name + ':returned'); return result; };
      }
    }
    for (const name of ['clearStorageData', 'clearCache', 'clearAuthCache']) {
      const original = wc.session[name].bind(wc.session);
      wc.session[name] = async (...args) => { uboDeletionEvents.push(name); const result = await original(...args); uboDeletionEvents.push(name + ':done'); return result; };
    }
  }, namedUrl);
  let deletionTimer;
  try {
    await Promise.race([call('deleteProfile', named.profile.id, named.profile.name), new Promise((_, reject) => {
      deletionTimer = setTimeout(async () => reject(new Error('Profile deletion timed out: ' + JSON.stringify(await electron.evaluate(() => uboDeletionEvents)))), 15000);
    })]);
  } finally { clearTimeout(deletionTimer); }
  assert(!fs.existsSync(path.join(dir + '-Dev', 'managed-ublock', named.profile.id)));
  assert.equal(await electron.evaluate(({ webContents }) => webContents.getAllWebContents().filter(wc => wc.getType() === 'backgroundPage').length), 1);
  const erased = await electron.evaluate(async ({ session, app, webContents }, { profileId, expectedId }) => {
    const fs = process.getBuiltinModule('node:fs'), path = process.getBuiltinModule('node:path');
    const require = process.getBuiltinModule('node:module').createRequire(path.join(app.getAppPath(), 'package.json'));
    const packageApi = require(path.join(app.getAppPath(), 'src/main/ublock-package'));
    const installed = packageApi.installVerifiedPackage({ root: path.join(app.getAppPath(), 'ublock'),
      destination: path.join(app.getPath('userData'), 'managed-ublock', profileId, 'extension'),
      hostSources: packageApi.readHostSources(app.getAppPath()) });
    const owned = session.fromPartition('persist:blanc-profile-' + profileId);
    const extension = await owned.extensions.loadExtension(installed.path);
    if (extension.id !== expectedId) throw new Error('Deleted native principal identity changed');
    const deadline = Date.now() + 5000; let background;
    while (Date.now() < deadline) {
      background = webContents.getAllWebContents().find(wc => wc.session === owned && wc.getType() === 'backgroundPage');
      if (background?.getURL().includes('/background.html')) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    try { return await background.executeJavaScript("chrome.storage.local.get('blancDeletionFixture')"); }
    finally { owned.extensions.removeExtension(extension.id); fs.rmSync(path.join(app.getPath('userData'), 'managed-ublock', profileId), { recursive: true, force: true }); }
  }, { profileId: named.profile.id, expectedId: deletionPrincipal.id });
  assert.equal(erased.blancDeletionFixture, undefined, 'Deleted profile native uBO storage must be empty');
  console.log('named profile deleted with native storage erased; checking OAuth child');
  await call('openTabInWindow', primaryRuntime, fixture + 'oauth-opener');
  const opener = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + 'oauth-opener'), Boolean, 'OAuth opener');
  const blockedBeforeChild = hits.filter(url => url === '/blocked-ubo.js').length;
  await opener.locator('button').click();
  const child = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + 'oauth-child'), Boolean, 'OAuth child');
  await child.waitForFunction(() => window.fixturePinned === true && getComputedStyle(document.querySelector('#ad')).display === 'none');
  assert.equal(hits.filter(url => url === '/blocked-ubo.js').length, blockedBeforeChild);
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/oauth-child')).close());
  stage = 'bounded request capacity';
  await call('activateTab', regular);
  await electron.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage').executeJavaScript(
    "chrome.webRequest.onBeforeRequest.addListener(details => details.url.includes('/capacity-allowed.js') ? new Promise(resolve => setTimeout(() => resolve({}), 750)) : {}, {urls:['<all_urls>']}, ['blocking']); true"));
  const burst = await awake.evaluate(async () => Promise.all(Array.from({ length: 300 }, (_, index) => fetch('/capacity-allowed.js?request=' + index).then(() => true, () => false))));
  assert(burst.some(value => value === false), 'excess decisions must be cancelled rather than bypass filtering');
  assert(burst.some(Boolean), 'admitted decisions still complete');
  assert.equal((await call('blockingStatus')).phase, 'ready', 'queue pressure alone must not fail the profile');
  assert.equal(await awake.evaluate(() => new Promise(resolve => { const script = document.createElement('script'); script.onload = () => resolve(true); script.onerror = () => resolve(false); script.src = '/blocked-ubo.js?after-capacity'; document.body.append(script); })), false);
  assert(!hits.includes('/blocked-ubo.js?after-capacity'));
  assert.equal(await awake.evaluate(() => fetch('/allowed-control.js?after-capacity').then(() => true, () => false)), true);
  assert(hits.includes('/allowed-control.js?after-capacity'));
  stage = 'decision deadline';
  // Suspending the real request listener proves the two-second boundary:
  // requests cannot reach the server while the provider is unresponsive.
  await electron.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage').executeJavaScript(
    "chrome.webRequest.onBeforeRequest.addListener(() => new Promise(() => {}), {urls:['<all_urls>']}, ['blocking']); true"));
  const deadlineStarted = Date.now();
  const deadlineId = await call('openTab', fixture + 'deadline-gated');
  await waitForValue(() => call('blockingStatus'), state => state.phase === 'failed', 'request deadline', 6000);
  assert(Date.now() - deadlineStarted < 5000);
  assert(!(hits.includes('/deadline-gated')));
  await waitForValue(async () => (await call('state')).tabs.find(tab => tab.id === deadlineId)?.isLoading, value => value === false, 'deadline recovery page');
  await call('blockingRetry');
  await waitForValue(() => call('blockingStatus'), state => state.phase === 'ready', 'deadline retry', 20000);
  await waitForValue(() => electron.evaluate(({ webContents }) => webContents.getAllWebContents().filter(wc => wc.getType() === 'backgroundPage').length), count => count === 1, 'one background after retry');
  const awakeWC = (await call('state')).tabs.find(tab => tab.id === regular).webContentsId;
  assert.equal((await call('blockingMapping')).find(item => item.webContentsId === awakeWC).tabId, stableId);
  await awake.evaluate(() => { window.heldFixtureToken = Math.random(); });
  const heldToken = await awake.evaluate(() => window.heldFixtureToken);
  await call('closeTab', regular);
  await call('reopenClosed');
  await waitForValue(async () => call('state'), state => state.tabs.some(tab => tab.webContentsId === awakeWC), 'held view reopened');
  assert.equal(await awake.evaluate(() => window.heldFixtureToken), heldToken);
  await call('setAdblock', false);
  await awake.waitForFunction(() => getComputedStyle(document.querySelector('#ad')).display !== 'none');
  await call('setAdblock', true);
  await awake.reload();
  await awake.waitForFunction(() => getComputedStyle(document.querySelector('#ad')).display === 'none');
  // A native background loss must cancel requests instead of substituting a
  // different provider or releasing website traffic.
  await electron.evaluate(({ app, webContents }) => {
    const bg = webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage');
    if (process.platform !== 'linux') { bg.forcefullyCrashRenderer(); return; }
    // Electron's Linux crash-injection API did not emit renderer loss in CI.
    // Terminate the actual fixture-owned renderer to exercise a real loss.
    const pid = bg.getOSProcessId();
    if (pid <= 0 || pid === process.pid || !app.getAppMetrics().some(item => item.pid === pid)) throw new Error('Invalid fixture renderer PID');
    process.kill(pid, 'SIGKILL');
  });
  await waitForValue(() => call('blockingStatus'), state => state.phase === 'failed', 'background failure');
  const failedId = await call('openTab', fixture + 'failure-gated');
  await waitForValue(async () => (await call('state')).tabs.find(tab => tab.id === failedId)?.isLoading, value => value === false, 'failed navigation settled');
  assert(!hits.includes('/failure-gated'));
  assert.equal((await call('allowAdsOnActive')).error, 'blocking-not-ready');
  const recovery = await waitForValue(async () => (await electron.windows()).find(item => item.url().startsWith('blanc://settings/')), Boolean, '/allow-ads recovery');
  await recovery.locator('#ublockRetry').waitFor({ state: 'visible' });
  await call('toggleAdblock');
  assert.equal((await call('blockingStatus')).enabled, false, '/block-ads must disable a failed provider');
  await call('setAdblock', true);
  await call('blockingRetry');
  await waitForValue(() => call('blockingStatus'), state => state.phase === 'ready', 'background retry', 20000);
  await call('activateTab', (await call('state')).tabs.find(tab => tab.webContentsId === awakeWC).id);
  await awake.reload();
  await awake.waitForFunction(() => getComputedStyle(document.querySelector('#ad')).display === 'none');
  const sandbox = await electron.evaluate(({ app, webContents }) => webContents.getAllWebContents().map(wc => ({
    type: wc.getType(), extension: wc.getURL().startsWith('chrome-extension://'),
    sandboxed: app.getAppMetrics().find(metric => metric.pid === wc.getOSProcessId())?.sandboxed,
    nativeStatus: process.platform === 'linux' ? process.getBuiltinModule('node:fs').readFileSync('/proc/' + wc.getOSProcessId() + '/status', 'utf8').match(/^(Seccomp|NoNewPrivs):.*$/gm) : null,
    prefs: wc.getLastWebPreferences(),
  })));
  for (const view of sandbox) {
    if (process.platform !== 'linux') assert.equal(view.sandboxed, true);
    else { assert(view.nativeStatus.some(line => /^Seccomp:\s+2$/.test(line))); assert(view.nativeStatus.some(line => /^NoNewPrivs:\s+1$/.test(line))); }
    if (view.prefs) { assert.equal(view.prefs.sandbox, true); assert.equal(view.prefs.nodeIntegration, false); }
  }
  assert(!errors.includes('preloadScripts'));
  assert(!(await electron.evaluate(() => uboDesktopLog)).some(item => item.message.includes('getUserMedia')));
  assert.equal(await electron.evaluate(({ session }) => session.defaultSession.extensions.getAllExtensions().length), 2);
  assert.equal(await electron.evaluate(({ webContents }) => webContents.getAllWebContents().filter(wc => wc.getType() === 'backgroundPage' || /\/(blanc-bridge|bridge)\.html$/.test(wc.getURL())).length), 3);
  timing.rendererMemoryKiB = await electron.evaluate(({ app }) => app.getAppMetrics().filter(item => item.type === 'Tab').reduce((total, item) => total + (item.memory?.workingSetSize || 0), 0));
  timing.allowedRequestMs = await awake.evaluate(() => performance.getEntriesByType('resource').find(item => item.name.endsWith('/allowed-control.js'))?.duration ?? null);
  await awake.evaluate(async () => { await navigator.serviceWorker.register('/fixture-sw.js'); await navigator.serviceWorker.ready; });
  stage = 'managed tool reopen';
  for (const [tool, pathname] of [['dashboard', '/dashboard.html'], ['logger', '/logger-ui.html']]) {
    await call('blockingOpen', tool);
    const toolTab = (await call('state')).tabs.find(tab => tab.url.includes(pathname));
    assert(toolTab, tool);
    await call('duplicateActive');
    const duplicate = await waitForValue(async () => (await call('state')).tabs.find(tab => tab.url.includes(pathname) && tab.id !== toolTab.id), Boolean, tool + ' duplicated');
    assert.notEqual(duplicate.webContentsId, toolTab.webContentsId);
    await call('activateTab', duplicate.id);
    await waitForValue(async () => electron.evaluate(async ({ webContents }, id) => {
      const wc = webContents.fromId(id);
      return wc?.executeJavaScript('Boolean(document.body && document.body.innerText.length > 0)').catch(() => false);
    }, duplicate.webContentsId), Boolean, tool + ' duplicate document');
    await call('closeTab', duplicate.id);
    await call('activateTab', toolTab.id);
    await call('closeTab', toolTab.id);
    await call('reopenClosed');
    await waitForValue(async () => (await call('state')).tabs.some(tab => tab.url.includes(pathname)), Boolean, tool + ' reopened');
    // Playwright keeps a crashed-page flag after native extension reloads the
    // same WebContents. Check the actual reopened native document, rather than
    // the driver object retained from our earlier deliberate renderer crash.
    await waitForValue(async () => {
      const current = (await call('state')).tabs.find(tab => tab.url.includes(pathname));
      return electron.evaluate(async ({ webContents }, id) => {
        const wc = webContents.getAllWebContents().find(item => item.id === id);
        if (!wc || wc.isDestroyed() || wc.isCrashed()) return false;
        return wc.executeJavaScript('Boolean(document.body && document.body.getBoundingClientRect().height > 0 && document.body.innerText.length > 0)').catch(() => false);
      }, current.webContentsId);
    }, Boolean, tool + ' native document reopened');
  }
  await call('activateTab', (await call('state')).tabs.find(tab => tab.webContentsId === awakeWC).id);
  stage = 'offline restart';
  const originalIdentity = await electron.evaluate(({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage').getURL().split('/')[2]);
  const closeTimer = setTimeout(() => electron.process().kill('SIGKILL'), 5000);
  try { await electron.close(); } finally { clearTimeout(closeTimer); }
  electron = await _electron.launch({
    ...(process.env.BLANC_UBLOCK_ELECTRON ? { executablePath: process.env.BLANC_UBLOCK_ELECTRON } : {}),
    args: [path.resolve('.'), `--user-data-dir=${dir}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'], chromiumSandbox: true,
    env: { ...env, BLANC_TEST: '1', BLANC_UBLOCK_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaughtLog }, timeout: 30000,
  });
  electron.context().setDefaultTimeout(10000);
  electron.context().setDefaultNavigationTimeout(15000);
  await electron.firstWindow();
  await waitForValue(() => call('blockingStatus'), state => state.phase === 'ready', 'offline cold launch', 20000);
  assert.equal(await electron.evaluate(({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage').getURL().split('/')[2]), originalIdentity);
  for (const [tool, pathname] of [['dashboard', '/dashboard.html'], ['logger', '/logger-ui.html']]) {
    const restored = await waitForValue(async () => (await call('state')).tabs.find(tab => tab.url.includes(pathname)), Boolean, pathname + ' restored after restart');
    assert.equal(restored.asleep, true, tool + ' starts quiet after cold restore');
    await openFixturePopup();
    const restoredPopup = await waitForValue(async () => (await electron.windows()).find(item => item.url().includes('/popup-fenix.html')), Boolean, tool + ' cold restore popup');
    await restoredPopup.locator('body:not(.loading)').waitFor();
    await Promise.all([
      restoredPopup.waitForEvent('close'),
      restoredPopup.locator(`a[href^="${pathname.slice(1)}"]`).dispatchEvent('click').catch(error => {
        if (!restoredPopup.isClosed() || !error.message.includes('Target page, context or browser has been closed')) throw error;
      }),
    ]);
    await waitForValue(() => call('state'), state => state.activeTabId === restored.id && state.tabs.find(tab => tab.id === restored.id)?.asleep === false, tool + ' quiet tab selected by original popup');
    assert.deepEqual((await call('state')).tabs.filter(tab => tab.url.includes(pathname)).map(tab => tab.id), [restored.id]);
    assert.equal(await call('allowAdsOnActive'), null, 'tools never become site exceptions');
    const restoredPage = await waitForValue(async () => (await electron.windows()).find(item => item.url().includes(pathname)), Boolean, tool + ' restored document');
    await restoredPage.locator('body').waitFor();
    await call('activateTab', (await call('state')).tabs.find(tab => tab.url === fixture).id);
  }
  await call('openTab', fixture + '?restart-persistence');
  const restartedPage = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + '?restart-persistence'), Boolean, 'restart fixture');
  await restartedPage.waitForFunction(() => window.fixturePinned === true && getComputedStyle(document.querySelector('#ad')).display === 'none');
  assert((await restartedPage.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(item => item.active?.scriptURL))).some(url => url?.endsWith('/fixture-sw.js')));
  const dynamicHits = hits.filter(url => url === '/dynamic-target.js').length;
  await call('openTab', fixture + 'dynamic-fixture');
  const restoredRules = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + 'dynamic-fixture'), Boolean, 'persistent rule fixture');
  await restoredRules.waitForLoadState('load');
  assert.equal(hits.filter(url => url === '/dynamic-target.js').length, dynamicHits);
  await call('openTab', fixture + 'subscription-fixture');
  const cachedSubscription = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + 'subscription-fixture'), Boolean, 'cached subscription fixture');
  await cachedSubscription.waitForLoadState('load');
  assert(!hits.includes('/subscription-blocked.js'));
  assert(!fs.existsSync(uncaughtLog), fs.existsSync(uncaughtLog) ? fs.readFileSync(uncaughtLog, 'utf8') : '');
  console.log('uBO desktop passed: original tools and backup/restore, blocking/redirects/CSP/scriptlets/dynamic rules, nested frames, POST protection, quiet/held tabs, private isolation, deadlines/crash recovery, sandboxed views.');
  console.log('uBO fixture performance:', JSON.stringify(timing));
} catch (error) {
  if (fs.existsSync(uncaughtLog)) console.error(fs.readFileSync(uncaughtLog, 'utf8'));
  console.error('uBO test failure:', { stage, processExitCode: electron?.process().exitCode, processSignal: electron?.process().signalCode }, error);
  if (electron) console.error('Dashboard state:', await electron.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find(item => item.getURL().includes('/dashboard.html'));
    return wc?.executeJavaScript(`({ hash: location.hash, ready: !document.body.classList.contains('notReady'), selected: document.querySelector('.tabButton.selected')?.dataset.pane, frame: document.querySelector('#iframe')?.contentWindow.location.pathname, unsavedPrompt: document.querySelector('#unsavedWarning')?.classList.contains('on'), unsaved: document.querySelector('#iframe')?.contentWindow.hasUnsavedData?.() })`);
  }).catch(() => null));
  if (electron) console.error('Popup focus events:', await popupFocusTrace.read(electron).catch(() => []));
  console.error('Subscription response revisions:', subscriptionResponses);
  if (electron && stage === 'subscription data') console.error('Subscription state:', await electron.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage')?.executeJavaScript(`(async () => {
    const io = (await import('./js/assets.js')).default;
    const url = µBlock.selectedFilterLists.find(value => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && parsed.pathname === '/fixture-list.txt';
      } catch { return false; }
    });
    return { events: self.fixtureListEvents, trace: self.fixtureUpdateTrace, updating: io.isUpdating(), metadata: (await io.metadata())[url], entry: µBlock.availableFilterLists[url], selected: url !== undefined };
  })()`)).catch(() => null));
  if (electron) console.error('Provider state:', await testCalls.callTestHook(electron, 'blockingStatus', []).catch(() => null));
  console.error(errors);
  if (electron) console.log(await electron.evaluate(({ app, BrowserWindow }) => ({ ready: app.isReady(), userData: app.getPath('userData'), hook: typeof __blanc, windows: BrowserWindow.getAllWindows().length })).catch(() => ({ processClosed: true })));
  if (electron) console.log(JSON.stringify(await electron.evaluate(async ({webContents}) => ({
    log: globalThis.uboDesktopLog,
    contents: await Promise.all(webContents.getAllWebContents().filter(wc=>wc.getURL().startsWith('chrome-extension://')).map(async wc=>({
      type:wc.getType(),url:wc.getURL(),
      page: await wc.executeJavaScript('({text:document.body?.innerText?.slice(0,500),frames:[...document.querySelectorAll("iframe")].map(f=>({url:f.contentWindow.location.href,text:f.contentDocument?.body?.innerText?.slice(0,500)}))})').catch(()=>null)
    })))
  })).catch(() => ({ unavailable: true })),null,2));
  console.error(errors); throw error;
} finally {
  clearTimeout(watchdog);
  if (electron) {
    const timer = setTimeout(() => electron.process().kill('SIGKILL'), 5000);
    try { await electron.close(); } catch {} finally { clearTimeout(timer); }
  }
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(dir + '-Dev', { recursive: true, force: true });
}
