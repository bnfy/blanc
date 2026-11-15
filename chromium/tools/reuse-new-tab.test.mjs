// #1505, as shipping's openOrReuseNewTab: ⌘T, ⌘⇧N and the Island's blank
// New Tab go to an unused Start Page in the window before opening another.
// Source-level: the reconstructed desktop lane (patch 0086) and Blanc's own
// helper, no Chromium build.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-reuse-new-tab-'));
after(() => fs.rmSync(staging, {recursive: true, force: true}));
const lane = JSON.parse(fs.readFileSync(path.join(root, 'chromium/lanes/desktop.json')));
fs.cpSync(path.join(root, 'chromium/upstream'), staging, {recursive: true});
for (const patch of lane.patches) execFileSync('git', ['apply', path.join(root, 'chromium', patch)], {cwd: staging});
const read = (file) => fs.readFileSync(path.join(staging, file), 'utf8');
const ui = fs.readFileSync(path.join(root, 'chromium/blanc/browser/ui/blanc_prototype_ui.cc'), 'utf8');
const helper = ui.slice(ui.indexOf('\ncontent::WebContents* ReuseNewTab('), ui.indexOf('\nbool MakePrivateWindow('));

test('⌘T tries an unused Start Page before adding a tab', () => {
  const commands = read('chrome/browser/ui/browser_commands.cc');
  const body = commands.slice(commands.indexOf('content::WebContents& NewTab('));
  const reuse = body.indexOf('blanc_prototype::ReuseNewTab(browser, /*is_private=*/false)');
  const add = body.indexOf('AddAndReturnTabAt(browser, GURL(), -1');
  assert.ok(reuse > 0 && reuse < add, 'reuse comes first');
  assert.ok(body.lastIndexOf('context == NewTabTypes::kNewTabCommand', reuse) > 0, 'only for the New Tab command');
});

test('⌘⇧N tries an unused private Start Page before opening one', () => {
  const controller = read('chrome/browser/ui/browser_command_controller.cc');
  assert.match(controller, /if \(!blanc_prototype::ReuseNewTab\(browser_, \/\*is_private=\*\/true\)\) \{\n\s*blanc_prototype::NewPrivateTab\(browser_, GURL\(\)\);/);
});

test('the setting is a boolean profile pref, on by default, shown in Appearance', () => {
  assert.match(read('chrome/browser/prefs/browser_prefs.cc'), /RegisterBooleanPref\("blanc\.tabs\.reuse_new_tab", true\)/);
  assert.match(read('chrome/browser/extensions/api/settings_private/prefs_util.cc'),
    /\["blanc\.tabs\.reuse_new_tab"\] = settings_api::PrefType::kBoolean/);
  const page = read('chrome/browser/resources/settings/appearance_page/appearance_page.html.ts');
  assert.match(page, /<settings-toggle-button id="blancReuseNewTab"[^>]*pref-key="blanc\.tabs\.reuse_new_tab"[^>]*label="\$i18n\{blancReuseNewTab\}"[^>]*sub-label="\$i18n\{blancReuseNewTabHint\}">/);
  assert.match(ui, /constexpr char kReuseNewTabPref\[\] = "blanc\.tabs\.reuse_new_tab";/);
  assert.match(helper, /GetPrefs\(\)->GetBoolean\(kReuseNewTabPref\)/);
});

test('only an unused plain Start Page of the asked-for kind is reused', () => {
  assert.match(helper, /"chrome:\/\/blanc-prototype\/pages\/newtab\.html\?private=1"/);
  assert.match(helper, /IsPrivateTab\(tab\) != is_private/);
  for (const exclusion of ['TabPinned(model, i)', 'GetTabGroupForTab(i)', 'GetSplitForTab(i)', 'id == glance',
    'id == overlay_glance', 'HasInheritedDocumentPolicy(tab)', 'GetEntryCount() > 1']) {
    assert.ok(helper.includes(exclusion), exclusion);
  }
  assert.ok(!helper.includes('IsRegularStartPage'), 'the tour and preview variants never count');
});

test('the Island\'s blank New Tab reuses without opening the Island itself', () => {
  const start = ui.indexOf('if (method == "createTab"');
  const create = ui.slice(start, ui.indexOf('auto* returned = make_private', start));
  assert.match(create, /const bool reuse = args\.size\(\) == 3 && args\[2\]\.GetBool\(\);/);
  assert.match(create, /if \(reuse && url == GURL\("chrome:\/\/newtab\/"\)\) \{\n\s*if \(auto\* reused = ReuseNewTab\(browser, make_private, \/\*open_island=\*\/false\)\)/);
  // Only a blank request from the Island asks; the test adapters' direct
  // native createTab calls keep opening new tabs, like shipping's hook.
  const host = fs.readFileSync(path.join(root, 'chromium/blanc/island/host.js'), 'utf8');
  assert.match(host, /url \? \[String\(url\), options\?\.private === true\] : \['chrome:\/\/newtab\/', options\?\.private === true, true\]/);
  assert.match(create, /result\.Set\("status", "switched"\)/);
});
