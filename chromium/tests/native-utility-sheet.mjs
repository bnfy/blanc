// Utility pages never open as tabs (shipping's isUtilityUrl, owner
// 2026-11-14): Settings, at any of its pages, and Downloads, Favorites and
// History open in the sheet from wherever a tab would have loaded them. A tab
// opened only for one closes, an existing tab stays on its page, and no tab
// ends up showing Chromium's page (and its blue Settings icon in the Island).
//   node chromium/tests/native-utility-sheet.mjs CONFIG OUT
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering, assertNodeRuntime} from './lib/render-guard.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
import {createWorld} from './world.mjs';
const [configFile, out] = process.argv.slice(2), config = JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime(); assert.equal(fs.existsSync(out), false); fs.mkdirSync(out, {recursive: true});
const f = new NativeFixture(), w = createWorld(f), result = {candidate: config.candidate, checks: []};
const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-utility-sheet-'));

// What the window shows: its tabs, and which sheet is up.
const state = async () => {
  const tabs = (await f.snapshot()).tabs.map(t => ({id: t.id, url: t.url}));
  const sheet = await f.host.eval(`(() => { const settings = document.getElementById('settingsSheet');
    const frame = [...document.querySelectorAll('iframe')].find(e => /(^|\\/)pages\\/(downloads|bookmarks|history)\\.html/.test(e.getAttribute('src') || '') && !e.hidden);
    return {settings: !!settings && !settings.hidden, page: frame ? frame.getAttribute('src').match(/pages\\/(\\w+)\\.html/)[1] : null}; })()`);
  const settingsUrls = (await f.targets()).filter(t => t.url.startsWith('chrome://settings')).map(t => t.url);
  return {tabs, sheet, settingsUrls};
};
const noChromiumTab = s => s.tabs.every(t => !/^chrome:\/\/(settings|downloads|bookmarks|history)/.test(t.url));
const closeSheet = async () => {
  await f.host.eval('window.BlancPrototypeHost.closeSheet()');
  await w.waitFor(state, x => !x.sheet.settings && !x.sheet.page, 'the sheet closes', 10000);
};
try {
  await f.launch(config, path.join(parent, 'fixture'), {testHooks: true, diskAssets: false});
  await installDriver(f.host); await assertRendering(e => f.host.eval(e)); await w.reset();
  const before = await state();

  // 1. A new tab opened straight at a Settings page (as Chromium's own
  //    "Manage …" links and DevTools do).
  await f.browser.send('Target.createTarget', {url: 'chrome://settings/sync'});
  let s = await w.waitFor(state, x => x.sheet.settings && x.tabs.length === before.tabs.length &&
    x.settingsUrls.some(u => u.startsWith('chrome://settings/sync')), 'Settings → Sync in the sheet, no new tab', 20000);
  assert.ok(noChromiumTab(s), 'no tab shows Chromium\'s Settings');
  result.checks.push('a new tab opened at chrome://settings/sync becomes Settings → Sync in the sheet, and the tab closes');
  await closeSheet();

  // 2. An existing tab sent to History keeps its page; History is the sheet.
  const first = (await state()).tabs[0];
  await f.host.eval(`window.BlancPrototypeHost.api.navigate(${jsLiteral(String(first.id))}, ${jsLiteral(f.base + '/stay')})`);
  const page = (await w.waitFor(state, x => x.tabs.some(t => t.url === f.base + '/stay'), 'an ordinary page in the tab', 15000)).tabs.find(t => t.url === f.base + '/stay');
  const target = (await f.targets()).find(t => t.type === 'page' && t.url === page.url);
  const tab = await f.connectTarget(target);
  await tab.send('Page.navigate', {url: 'chrome://history'});
  s = await w.waitFor(state, x => x.sheet.page === 'history', 'History in the sheet', 15000);
  assert.equal(s.tabs.find(t => t.id === page.id)?.url, page.url, 'the tab stays on its own page');
  assert.ok(noChromiumTab(s), 'no tab shows Chromium\'s History');
  result.checks.push('an existing tab sent to chrome://history stays on its page and History opens in the sheet');
  await closeSheet();

  // 3. Typed into the Island's address field, as shipping's people type it
  //    (chrome:// addresses are refused there, as in shipping).
  await f.host.eval(`window.BlancPrototypeHost.api.navigate(${jsLiteral(String(page.id))}, 'blanc://downloads')`);
  s = await w.waitFor(state, x => x.sheet.page === 'downloads', 'Downloads in the sheet', 15000);
  assert.equal(s.tabs.find(t => t.id === page.id)?.url, page.url, 'the tab stays on its own page');
  assert.ok(noChromiumTab(s), 'no tab shows Chromium\'s Downloads');
  result.checks.push('blanc://downloads typed in the address field opens Downloads in the sheet');
  await closeSheet();
  await assertRendering(e => f.host.eval(e)); result.result = 'pass';
} catch (error) { result.result = error.code === 'BLANC_ENVIRONMENT_STOP' ? 'blocked-environment' : 'fail'; result.error = String(error.stack); process.exitCode = 1; }
finally {
  const exit = await f.close(); if (exit?.code !== 0) { result.exit = exit; result.result = 'fail'; process.exitCode = 1; }
  if (f.directory && fs.existsSync(path.join(f.directory, 'browser.log'))) fs.copyFileSync(path.join(f.directory, 'browser.log'), path.join(out, 'browser.log'));
  fs.rmSync(parent, {recursive: true, force: true}); fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
}
