import assert from 'node:assert/strict';
import fs from 'node:fs';
import {after, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {chromium} from 'playwright';
import {LANGUAGES} from './interface-strings.mjs';

const assets = new URL('../blanc/island/', import.meta.url);
const origin = 'https://island.test';
let browser;
after(() => browser?.close());

async function openIsland(t, platform = 'Linux x86_64', early = false) {
  browser ??= await chromium.launch({chromiumSandbox: true, ...(fs.existsSync(chromium.executablePath())
    ? {executablePath: chromium.executablePath()} : {channel: 'chrome'})});
  const page = await browser.newPage({reducedMotion: 'reduce'});
  t.after(() => page.close());
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === '/restartToUpdate') {
      const frame = route.request().frame();
      const path = new URL(frame.url());
      await page.evaluate(action => window.restarts.push(action),
        {path: path.pathname + path.search, version: url.search.slice(1)});
      return route.fulfill({status: 204});
    }
    const file = new URL(url.pathname.slice(1), assets);
    return url.origin === origin && file.href.startsWith(assets.href) && fs.existsSync(file)
      ? route.fulfill({path: fileURLToPath(file)}) : route.abort();
  });
  await page.addInitScript(({platform, early}) => {
    Object.defineProperty(navigator, 'platform', {value: platform});
    window.restarts = [];
    window.chrome.send = (_, [id, method, args]) => {
      if (method === 'restartToUpdate') window.restarts.push(args);
      if (early && method === 'observeWindowButtons') window.blancPrototypeEvent('update-ready', '158.0.8127.905');
      const value = method === 'snapshot' ? {activeTabId: '1', groups: [], splits: [], closed: [], extensionsWidth: 0,
        tabs: [{id: '1', url: 'https://example.test/', title: 'Example'}]}
        : method === 'syncSurface' ? [] : method === 'copyTabLink' ? true : null;
      queueMicrotask(() => window.blancPrototypeReply(id, true, value));
    };
    if (location.pathname === '/index.html' || location.pathname === '/overlay.html')
      window.browserAPI = parent.BlancPrototypeHost.apiForDocument(document);
  }, {platform, early});
  await page.goto(origin + '/host.html');
  const strip = page.frameLocator('#strip');
  await strip.locator('#pillHeart').waitFor({state: 'attached'});
  return {page, strip};
}

const proof = fs.readFileSync(new URL('../tests/linux-relaunch.mjs', import.meta.url), 'utf8');
const update = page => page.evaluate(() => window.blancPrototypeEvent('update-ready', '158.0.8127.905'));
const restart = frame => frame.locator('#islandPill').getByRole('button', {name: 'Restart to update', exact: true});

test('the update button survives transient notices and activates by keyboard without opening the Island', async t => {
  const {page, strip} = await openIsland(t);
  const button = restart(strip);
  assert.equal(await button.count(), 0);
  await update(page);
  await button.waitFor({timeout: 2500});
  await update(page);
  await page.evaluate(() => window.BlancPrototypeHost.refresh());
  assert.equal(await page.evaluate(() => window.BlancPrototypeHost.api.copyActiveLink(false)), true);
  const transient = strip.locator('#pillDomain.notice');
  await transient.waitFor({timeout: 1500});
  await transient.waitFor({state: 'hidden', timeout: 4000});
  assert.equal(await button.count(), 1);
  // Start at the pill, then reach the named control by actual Tab traversal.
  await strip.locator('#islandPill').focus();
  for (let i = 0; i < 30 && !await button.evaluate(el => el.matches(':focus')); i++)
    await page.keyboard.press('Tab');
  assert.ok(await button.evaluate(el => el.matches(':focus')));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.restarts.length === 1);
  const action = {path: '/index.html', version: '158.0.8127.905'};
  assert.deepEqual(await page.evaluate(() => window.restarts), [action]);
  assert.ok(await page.locator('#overlay').isHidden());
  await button.click();
  await page.waitForFunction(() => window.restarts.length === 2);
  assert.deepEqual(await page.evaluate(() => window.restarts), [action, action]);
  assert.ok(await page.locator('#overlay').isHidden());
});

test('a recommendation before frame load reaches both pill documents and excludes other documents', async t => {
  const {page, strip} = await openIsland(t, 'Linux x86_64', true);
  await restart(strip).waitFor({timeout: 2500});
  await page.frameLocator('#floatPill').locator('#pillRestartToUpdate').waitFor({state: 'attached'});
  assert.equal(await page.evaluate(() => typeof window.BlancPrototypeHost.apiForDocument(
    document.querySelector('#overlay').contentDocument).restartToUpdate), 'undefined');
  const frame = page.frames().find(frame => frame.url() === origin + '/index.html');
  await frame.evaluate(() => { parent.oldButton = document.getElementById('pillRestartToUpdate'); });
  await frame.goto(origin + '/index.html');
  await restart(strip).waitFor({timeout: 2500});
  await page.evaluate(() => window.oldButton.click());
  assert.deepEqual(await page.evaluate(() => window.restarts), []);
  await frame.goto(origin + '/overlay.html');
  assert.equal(await frame.evaluate(() => typeof window.browserAPI.restartToUpdate), 'undefined');
});

test('withdrawing an update removes it from both pills and from late subscribers', async t => {
  const {page, strip} = await openIsland(t, 'Linux x86_64', true);
  const floating = page.frameLocator('#floatPill');
  await restart(strip).waitFor();
  await floating.locator('#pillRestartToUpdate').waitFor({state: 'attached'});
  await page.evaluate(() => window.blancPrototypeEvent('update-ready', ''));
  assert.equal(await restart(strip).count(), 0);
  assert.equal(await floating.locator('#pillRestartToUpdate').count(), 0);
  const frame = await (await page.locator('#strip').elementHandle()).contentFrame();
  await frame.goto(origin + '/index.html');
  await strip.locator('#pillHeart').waitFor({state: 'attached'});
  assert.equal(await restart(strip).count(), 0);
  await update(page);
  await restart(strip).waitFor();
});

test('only a trusted activation sends the advertised version from the pill itself', async t => {
  const {page, strip} = await openIsland(t);
  await update(page);
  const button = restart(strip);
  await button.waitFor();
  await button.evaluate(el => el.click());
  assert.deepEqual(await page.evaluate(() => window.restarts), []);
  await button.click();
  await page.waitForFunction(() => window.restarts.length === 1);
  assert.deepEqual(await page.evaluate(() => window.restarts), [
    {path: '/index.html', version: '158.0.8127.905'},
  ]);
});

test('an overlay document has no host-proxied restart authority, even for the live strip', async t => {
  const {page, strip} = await openIsland(t);
  await update(page);
  await restart(strip).waitFor();
  const overlay = await (await page.locator('#overlay').elementHandle()).contentFrame();
  const hasAction = await overlay.evaluate(() => typeof parent.BlancPrototypeHost.apiForDocument(
    parent.document.getElementById('strip').contentDocument).restartToUpdate === 'function');
  assert.equal(hasAction, false);
});

test('the proof issues its negative request from the focused overlay document', {timeout: 8000}, async t => {
  const {requestFromOverlay} = await import('../tests/linux-relaunch.mjs');
  const {page} = await openIsland(t);
  await update(page);
  await page.evaluate(() => window.BlancPrototypeHost.open());
  const frame = await (await page.locator('#overlay').elementHandle()).contentFrame();
  await frame.evaluate(requestFromOverlay, '158.0.8127.905');
  await page.waitForFunction(() => window.restarts.length === 1);
  assert.deepEqual(await page.evaluate(() => window.restarts), [{path: '/overlay.html', version: '158.0.8127.905'}]);
});

test('the proof takes native focus and waits for button focus before Enter', () => {
  const start = proof.indexOf("'Island update recommendation'");
  const key = proof.indexOf("type: 'keyDown'", start);
  const focus = proof.slice(start, key);
  assert.match(focus, /focusIsland[\s\S]+\.focus\(\)[\s\S]+waitFor\([\s\S]+:focus/);
  assert.match(focus, /hasFocus\(\)/);
});

test('the proof checks the rendered marker before restart and on restored tabs', async () => {
  const {loadedTabs} = await import('../tests/linux-relaunch.mjs');
  const url = 'http://127.0.0.1:1234/after-install';
  let body = 'fixture unavailable';
  const tab = {id: '1', url, isLoading: false};
  let closed = 0;
  const session = {
    host: {eval: async () => [tab]},
    pageForUrl: async requested => {
      assert.equal(requested, url);
      return {
        eval: expression => vm.runInNewContext(expression, {
          document: {readyState: 'complete', body: {innerText: body}}, location: {href: url},
        }),
        close: () => closed++,
      };
    },
  };
  assert.equal(typeof loadedTabs, 'function', 'the session check must inspect the page target');
  await assert.rejects(loadedTabs(session, [url]), /fixture response/i);
  body = '/after-install';
  assert.deepEqual(await loadedTabs(session, [url]), [url]);
  assert.equal(closed, 2);
  assert.match(proof, /await loadedTabs\(before, tabs\)/);
  assert.match(proof, /await loadedTabs\(after, tabs\)/);
});

test('the proof starts and queries the desktop launcher and checks the process image separately', () => {
  const launcher = proof.match(/const (\w+) = '\/usr\/bin\/blanc-beta'/)?.[1];
  assert.ok(launcher, 'expected the installed desktop launcher');
  assert.ok(proof.includes('spawn(' + launcher + ','));
  assert.equal(proof.split('execFileSync(' + launcher + ", ['--product-version']").length - 1, 2);
  assert.match(proof, /readlinkSync\('\/proc\/' \+ pid \+ '\/exe'\) === executable/);
  assert.ok(proof.includes("const executable = '/opt/bnfy/blanc-beta/chrome'"));
});

test('Mac and Windows ignore a Linux recommendation', async t => {
  for (const platform of ['MacIntel', 'Win32']) {
    const {page, strip} = await openIsland(t, platform);
    await update(page);
    assert.equal(await restart(strip).count(), 0);
  }
});

test('every shipped Island catalog names the update action in its own language', () => {
  const script = fs.readFileSync(new URL('strings.js', assets), 'utf8');
  const labels = LANGUAGES.map(language => {
    const context = {navigator: {language}};
    vm.runInNewContext(script, context);
    const label = context.blancStrings.messages['pill.restartToUpdate'];
    assert.ok(label?.trim(), language);
    return label;
  });
  assert.equal(labels[0], 'Restart to update');
  assert.equal(new Set(labels).size, LANGUAGES.length);
});

test('the native Linux beta receiver checks the calling pill, activation and live recommendation', () => {
  const cc = fs.readFileSync(new URL('../blanc/browser/ui/blanc_prototype_ui.cc', import.meta.url), 'utf8');
  const guarded = [...cc.matchAll(/^#if BUILDFLAG\(IS_LINUX\) && BUILDFLAG\(BLANC_BETA_CHANNEL\)\n([\s\S]*?)^#endif/gm)]
    .map(match => match[1]).join('\n');
  assert.ok(guarded.includes('OnUpgradeRecommended() override'));
  assert.ok(guarded.includes('chrome::AttemptRestart()'));
  assert.equal(cc.split('chrome::AttemptRestart()').length, 2);
  assert.match(guarded, /GetRenderFrameHost\(\)[\s\S]{0,100}GetPrimaryMainFrame\(\)/);
  assert.ok(guarded.includes('OnUpdate(const BuildState*'));
  assert.ok(guarded.includes('BuildState::UpdateType::kNormalUpdate'));
  assert.ok(guarded.includes('version_info::GetVersion()'));
  const action = guarded.match(/class RestartToUpdateGate[^]*?chrome::AttemptRestart\(\);/)?.[0];
  assert.ok(action, 'the browser must authorize the frame that initiated the command');
  assert.ok(guarded.includes('base::Value("update-refused")'));
  for (const check of ['GetInitiatorFrameToken()', 'GetFrameToken()', 'GetFrameTreeNodeId()', 'HasUserGesture()',
    'GetParent()', 'GetPrimaryMainFrame()',
    'GetLastCommittedURL()', 'HasTransientUserActivation()', 'CurrentRecommendedVersion()',
    'chrome://blanc-prototype/index.html', 'chrome://blanc-prototype/index.html?surface=float']) {
    assert.ok(action.includes(check), check);
  }
});

test('the relaunch proof requires a complete log with the control request and refuses update hosts', async () => {
  const {checkUpdateNetLog} = await import('../tests/linux-relaunch.mjs');
  const control = 'http://127.0.0.1:1234/after-relaunch';
  const log = (...urls) => JSON.stringify({events: urls.map(url => ({params: {url}}))});
  assert.doesNotThrow(() => checkUpdateNetLog(log(control), control));
  assert.throws(() => checkUpdateNetLog(log(control).slice(0, -1), control));
  assert.throws(() => checkUpdateNetLog(log(control + '-other'), control), /control/i);
  for (const host of ['update.googleapis.com', 'clients2.google.com', 'dl.google.com', 'another.googleapis.com', 'other.google.com',
      'chromereleases.googleblog.com', 'googlechromereleases.blogspot.com',
      'chromiumdash.appspot.com', 'versionhistory.googleapis.com']) {
    assert.throws(() => checkUpdateNetLog(log(control, 'https://' + host + '/'), control),
      error => error.message.includes(host));
  }
});
