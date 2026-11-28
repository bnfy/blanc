// Mini window: switch to tabs and Spaces (#1734 part 2, shipping bnfy/blanc#1791).
// The fork's Spaces menu pin (870c400de) predates #1791, so its panel changes
// arrive as MENU_EDITS on the pinned overlay.js and its three strings as fork
// strings; both go when the pin moves past #1791 (the fork-strings check then
// refuses the duplicates).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const KEYS = ['mini.switch.anotherWindow', 'mini.switch.gone', 'mini.switch.busy'];

test('the panel lists tabs elsewhere in a mini window and offers Spaces again', () => {
  const overlay = read('blanc/island/overlay.js');
  assert.match(overlay, /let elsewhereTabs = \[\];\n  let elsewhereNotice = '';/);
  assert.match(overlay, /elsewhere: blancI18n\.t\('result\.tag\.tab'\),/);
  assert.ok(!overlay.includes('spaceResults'), 'Spaces are offered again in a mini window');
  assert.match(overlay, /if \(state\.miniWindow === true\) \{\s*for \(const e of elsewhereTabs\) \{/);
  assert.match(overlay, /r\.kind === 'elsewhere' \? `elsewhere:\$\{r\.key\}` : r\.url;/);
  assert.match(overlay, /if \(result\.kind === 'elsewhere'\) return `elsewhere:\$\{result\.key\}`;/);
  assert.match(overlay, /Promise\.resolve\(window\.browserAPI\.goToMiniSwitchTab\(result\.key\)\)/);
  assert.match(overlay, /if \(elsewhereNotice\) \{\s*const notice = emptyRow\(elsewhereNotice\);/);
  assert.match(overlay, /addressInput\.addEventListener\('input', \(e\) => \{\n    elsewhereNotice = '';/);
  assert.match(overlay, /window\.browserAPI\.listMiniSwitchTabs\(\),\n    \]\);\n    elsewhereTabs = Array\.isArray\(elsewhereList\) \? elsewhereList : \[\];/);
  // The fork keeps its own count (every start page but a private one stays).
  assert.match(overlay, /return \(payload\.tabs \?\? \[\]\)\.filter\(\(tab\) => tab\.private \|\| tab\.url !== 'blanc:\/\/newtab\/'\)\.length;/);
});

test('the three switcher strings resolve in all six languages', () => {
  const own = JSON.parse(read('blanc/fork-strings.json'));
  for (const key of KEYS) assert.ok(own[key]?.en, key);
  const source = read('blanc/island/strings.js');
  for (const language of ['en', 'de', 'es', 'fr', 'it', 'pt-BR']) {
    const context = {navigator: {languages: [language], language}, __blancUiLanguage: language, Intl};
    context.self = context;
    vm.runInNewContext(source, context);
    for (const key of KEYS) assert.equal(typeof context.blancStrings.messages[key], 'string', `${language} ${key}`);
  }
});

// The host (blanc/island/host.js): the list and going there, on two native
// requests (miniSwitchList, miniSwitchFocus / miniSwitchFocusUrl) and the
// Spaces calls it already had.
const host = read('blanc/island/host.js');
function body(name) {
  const start = host.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} is in host.js`);
  let depth = 0;
  for (let i = host.indexOf('{', host.indexOf(')', start)); i < host.length; i++) {
    if (host[i] === '{') depth++;
    else if (host[i] === '}' && --depth === 0) return host.slice(start, i + 1);
  }
  throw Error(`${name} has no end`);
}

test('the host lists other windows, Spaces held and Spaces saved, never private tabs or start pages', () => {
  const list = body('listMiniSwitchTabs');
  assert.match(list, /if \(!snapshot\?\.miniWindow \|\| snapshot\.tabs\.find\(\(tab\) => tab\.id === snapshot\.activeTabId\)\?\.private\) return \[\];/);
  assert.match(list, /request\('miniSwitchList'\)/);
  assert.match(list, /request\('spaceMeta'\)/);
  assert.match(list, /if \(tab\.private \|\| !miniSwitchListed\(tab\.url\)\) continue;/);
  assert.match(list, /key: window\.space \? `t:\$\{tab\.id\}:\$\{window\.space\}` : `t:\$\{tab\.id\}`/);
  assert.match(list, /key: `s:\$\{space\}:\$\{index\}`/);
  assert.match(host, /const miniSwitchListed = \(url\) => typeof url === 'string' && url !== '' && url !== 'blanc:\/\/newtab\/' && url !== 'chrome:\/\/newtab\/';/);
  assert.match(host, /listMiniSwitchTabs: \(\) => listMiniSwitchTabs\(\),/);
  assert.match(host, /goToMiniSwitchTab: \(key\) => goToMiniSwitchTab\(key\),/);
});

test('the host goes to a tab or its Space, and an untouched mini window then closes', () => {
  const go = body('goToMiniSwitchTab');
  assert.match(go, /if \(await request\('miniSwitchFocus', \[id\]\) === true\) return miniSwitchArrived\(\);/);
  // A Space on screen only lost the tab: say so rather than show it.
  assert.match(go, /if \(!space \|\| !exists\(space\) \|\| \(meta\.elsewhere \?\? \[\]\)\.includes\(space\)\) return gone;/);
  assert.match(go, /if \(!await showSpace\(space\)\) return \{ ok: false, error: 'busy' \};/);
  assert.match(go, /request\('miniSwitchFocusUrl', \[space, url, index\]\)/);
  const arrived = body('miniSwitchArrived');
  assert.match(arrived, /focusLeftWindow = true;/);
  assert.match(arrived, /if \(!miniMoveRuns\(snapshot\.tabs\)\.length\) request\('closeWindow'\)/);
  // A Space picked by name goes there; only the menu's move mode moves.
  const open = body('openSpace');
  assert.match(open, /if \(snapshot\?\.miniWindow\) \{\s*if \(options\.move === true\) return otherProfileTarget\(options\) \? \{ ok: false, error: 'busy' \} : moveMiniWindowToSpace\(id, null\);/);
  assert.match(open, /const went = target \? await inOtherProfile\('spaceOpenInProfile', \[target, id\]\) : \(await showSpace\(id\)\) \? \{ ok: true, workspaceId: id, action: 'focus' \} : \{ ok: false, error: 'activation-failed' \};/);
  assert.match(open, /if \(went\.ok\) await miniSwitchArrived\(\);/);
});

test('native lists other windows\' tabs and focuses a tab by id or by its Space and address', () => {
  const native = read('blanc/browser/ui/blanc_prototype_ui.cc');
  assert.match(native, /if \(method == "miniSwitchList" && args\.empty\(\)\) \{/);
  assert.match(native, /if \(!other_browser \|\| other == owner \|\| other_browser->GetProfile\(\) != profile \|\| IsMiniWindow\(other_browser\) \|\|\s*IsHoldWindow\(other_browser\) \|\| other_browser->IsDeleteScheduled\(\)\) continue;/);
  assert.match(native, /"sharedRecords"/);
  assert.match(native, /if \(method == "miniSwitchFocus" && args\.size\(\) == 1 && args\[0\]\.is_int\(\)\) \{/);
  assert.match(native, /if \(method == "miniSwitchFocusUrl" && args\.size\(\) == 3 && args\[0\]\.is_string\(\) && args\[1\]\.is_string\(\) && args\[2\]\.is_int\(\)\) \{/);
});
