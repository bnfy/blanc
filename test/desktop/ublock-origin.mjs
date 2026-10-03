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
let subscriptionRevision = 1;
const subscriptionResponses = [];
const server = http.createServer((request, response) => {
  hits.push(request.url);
  methods.push({ url: request.url, method: request.method });
  const pathname = new URL(request.url, 'http://fixture').pathname;
  response.setHeader('Cache-Control', 'no-store');
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
  if (pathname === '/csp-fixture') { response.end('<!doctype html><script>window.cspFixtureRan=true</script><p>Header fixture</p>'); return; }
  if (pathname === '/dynamic-fixture') { response.end('<!doctype html><script src="/dynamic-target.js"></script><p>Dynamic fixture</p>'); return; }
  if (pathname === '/post-form') { response.end('<!doctype html><form method="post" action="/post-result"><input name="token" value="test"><button>Submit</button></form>'); return; }
  if (pathname === '/oauth-opener') { response.end('<!doctype html><button onclick="window.open(\'/oauth-child\',\'OAuth\',\'popup,width=480,height=500\')">Sign in</button>'); return; }
  if (pathname === '/fixture-list.txt') { subscriptionResponses.push(subscriptionRevision); response.end('! Title: Blanc fixture list\n! Expires: 1 hour\n/subscription-blocked.js$script\n' + (subscriptionRevision > 1 ? '/subscription-new.js$script\n' : '')); return; }
  if (pathname === '/subscription-fixture') { response.end('<!doctype html><script src="/subscription-blocked.js"></script><p>Subscription fixture</p>'); return; }
  response.end('<!doctype html><title>uBO acceptance fixture</title><div id="ad">Cosmetic fixture</div><div id="procedure">Procedural fixture</div><div id="control">Allowed</div><script src="/blocked-ubo.js"></script><script src="/redirect-ubo.js"></script><script src="/allowed-control.js"></script>' + (request.url.includes('private-marker') ? '<script src="/ads/cbr.js?private-network-marker"></script>' : ''));
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
  await popupFocusTrace.install(electron);
  await electron.firstWindow();
  await electron.evaluate(({ app, webContents }) => {
    globalThis.uboDesktopLog = [];
    const observe = wc => wc.on('console-message', event => { uboDesktopLog.push({ url: wc.getURL().slice(0,200), message: event.message.slice(0,500) }); if (uboDesktopLog.length > 256) uboDesktopLog.shift(); });
    webContents.getAllWebContents().forEach(observe);
    app.on('web-contents-created', (_event, wc) => observe(wc));
  });
  const call = (method, ...args) => testCalls.callTestHook(electron, method, args);
  await waitForValue(() => call('blockingStatus'), state => state.phase === 'ready', 'real uBO ready', 20000);
  timing.startupReadyMs = Date.now() - started;
  assert.equal((await call('blockingStatus')).active, 'ublock-origin');
  await call('blockingOpen', 'dashboard');
  const dashboard = await waitForValue(async () => (await electron.windows()).find(page => page.url().includes('/dashboard.html')), Boolean, 'original dashboard');
  await dashboard.frameLocator('#iframe').locator('[data-setting-name="collapseBlocked"]').waitFor({ timeout: 5000 });
  assert.equal(await dashboard.frameLocator('#iframe').locator('[data-setting-name="cloudStorageEnabled"]').isDisabled(), true);
  assert.equal(await dashboard.frameLocator('#iframe').locator('[data-setting-name="prefetchingDisabled"]').isDisabled(), true);
  await dashboard.locator('[data-pane="1p-filters.html"]').dispatchEvent('click');
  const filters = await waitForValue(async () => dashboard.frames().find(frame => frame.url().endsWith('/1p-filters.html')), Boolean, 'original My filters');
  await filters.locator('.CodeMirror').waitFor();
  await filters.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setValue('/blocked-ubo.js$script\n/redirect-ubo.js$script,redirect=noop.js\n127.0.0.1###ad\n127.0.0.1##div:has-text(Procedural fixture)\n127.0.0.1##+js(set, fixturePinned, true)\n/strict-fixture$document\n/csp-fixture$csp=script-src \'none\'\n'));
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
  await call('blockingPopup');
  const popup = await waitForValue(async () => (await electron.windows()).find(item => item.url().includes('/popup-fenix.html')), Boolean, 'original popup');
  await popup.locator('body:not(.loading)').waitFor();
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
  await call('blockingPopup');
  let toolsPopup = await waitForValue(async () => (await electron.windows()).find(item => item.url().includes('/popup-fenix.html')), Boolean, 'picker popup');
  await toolsPopup.locator('body:not(.loading)').waitFor();
  await toolsPopup.locator('#gotoPick').dispatchEvent('click');
  console.log('picker launched');
  const picker = await waitForValue(async () => page.frames().find(frame => frame.url().includes('/epicker-ui.html')), Boolean, 'original element picker', 10000);
  await picker.waitForFunction(() => document.querySelector('svg#sea path')?.getAttribute('d')?.length > 0);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })));
  // Exercise the original handler without CDP waiting for an input ack from
  // the iframe that this same handler destroys. Native keyboard UI remains
  // part of the installed-candidate platform gate.
  await waitForValue(async () => page.frames().some(frame => frame.url().includes('/epicker-ui.html')), value => !value, 'picker dismissed');
  await call('blockingPopup');
  toolsPopup = await waitForValue(async () => (await electron.windows()).find(item => item.url().includes('/popup-fenix.html')), Boolean, 'zapper popup');
  stage = 'original zapper';
  await toolsPopup.locator('#gotoZap').dispatchEvent('click');
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
  await call('activateTab', (await call('state')).tabs.find(tab => tab.url.includes('/dashboard.html')).id);
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
    io.addObserver((topic, details) => {
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
  // Finish the unrelated first-install updater cycle before starting this
  // single-list fixture, including the reload started by updateStop. Upstream
  // coalesces concurrent reloads; a new update must begin after that load,
  // otherwise its completion can join the preceding snapshot.
  await electron.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage').executeJavaScript("(async () => { (await import('./js/assets.js')).default.updateStop(); await µBlock.loadFilterLists(); return true; })()"));
  subscriptionRevision = 2;
  const listRequests = hits.filter(url => new URL(url, fixture).pathname === '/fixture-list.txt').length;
  const subscriptionRow = lists.locator(`[data-key="${fixture}fixture-list.txt"]`).first();
  const customGroup = lists.locator('[data-role="node"][data-key="custom"]').first();
  if (!(await customGroup.evaluate(item => item.classList.contains('expanded')))) await customGroup.locator(':scope > .detailbar .listExpander').dispatchEvent('click');
  await subscriptionRow.locator('.cache').dispatchEvent('click', { shiftKey: true });
  await waitForValue(() => hits.filter(url => new URL(url, fixture).pathname === '/fixture-list.txt').length, count => count > listRequests, 'original list update fetched', 30000);
  await waitForValue(() => electron.evaluate(async ({ webContents }, url) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage')
    .executeJavaScript(`µBlock.availableFilterLists[${JSON.stringify(url)}]?.entryCount || 0`), fixture + 'fixture-list.txt'), count => count > 1, 'updated subscription compiled', 30000);
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
  assert(await call('sleepTab', regular));
  assert(!(await call('blockingMapping')).some(item => item.webContentsId === regularWC));
  await call('activateTab', regular);
  const awake = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture), Boolean, 'quiet fixture awakened');
  await awake.waitForFunction(() => getComputedStyle(document.querySelector('#ad')).display === 'none');
  console.log('uBO lifecycle passed; exercising profiles and restart persistence');
  stage = 'profiles and OAuth';
  const primaryRuntime = (await call('windowRuntimes'))[0].id;
  const named = await call('createProfileWindow', 'uBO isolated profile');
  assert(named.ok);
  await waitForValue(() => call('blockingStatusInWindow', named.runtimeId), state => state.phase === 'ready', 'named profile ready', 20000);
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
  stage = 'deadline and crash recovery';
  // Suspending the real request listener proves the two-second boundary;
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
  console.error('uBO test failure:', error);
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
    return { events: self.fixtureListEvents, updating: io.isUpdating(), metadata: (await io.metadata())[url], entry: µBlock.availableFilterLists[url], selected: url !== undefined };
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
