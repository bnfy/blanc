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
  // An ordinary window's panel never waits on the list.
  assert.match(list, /^async function listMiniSwitchTabs\(\) \{\n    \/\/ An ordinary window never waits; a new window has no snapshot yet\.\n    if \(snapshot && !snapshot\.miniWindow\) return \[\];\n    await refresh\(\);/);
  assert.match(list, /if \(!snapshot\?\.miniWindow \|\| snapshot\.tabs\.find\(\(tab\) => tab\.id === snapshot\.activeTabId\)\?\.private\) return \[\];/);
  // One native read, and a failure lists nothing rather than failing the panel.
  assert.match(list, /try \{ state = await miniSwitchState\(\); \} catch \{ return \[\]; \}/);
  assert.doesNotMatch(list, /spaceMeta/);
  assert.match(body('miniSwitchState'), /request\('miniSwitchList'\)/);
  assert.match(list, /if \(!tab\.private && miniSwitchListed\(tab\.url\)\) add\(tab, window\.space \? `t:\$\{tab\.id\}:\$\{window\.space\}` : `t:\$\{tab\.id\}`, window\.space\);/);
  assert.match(list, /for \(const tab of tabs\) if \(!tab\.private && miniSwitchListed\(tab\.url\)\) add\(tab, `t:\$\{tab\.id\}:\$\{space\}`, space\);/);
  assert.match(list, /add\(tab, `s:\$\{space\}:\$\{index\}`, space\)/);
  assert.match(host, /const miniSwitchListed = \(url\) => typeof url === 'string' && url !== '' && url !== 'blanc:\/\/newtab\/' && url !== 'chrome:\/\/newtab\/';/);
  assert.match(host, /listMiniSwitchTabs: \(\) => listMiniSwitchTabs\(\),/);
  assert.match(host, /goToMiniSwitchTab: \(key\) => goToMiniSwitchTab\(key\),/);
});

test('a mini window offers other profiles\' Spaces too', () => {
  assert.doesNotMatch(body('spacesAcrossProfiles'), /miniWindow/);
});

test('the host goes to a tab or its Space, and an untouched mini window then closes', () => {
  const go = body('goToMiniSwitchTab');
  assert.match(go, /return miniSwitchOnce\(async \(\) => \{/);
  assert.match(go, /if \(await request\('miniSwitchFocus', \[id\]\) === true\) return miniSwitchArrived\(\);/);
  // A Space on screen only lost the tab: say so rather than show it.
  assert.match(go, /if \(!space \|\| !state\.exists\(space\) \|\| \(state\.elsewhere \?\? \[\]\)\.includes\(space\)\) return gone;/);
  // A held page rebuilt after a crash is found by its address and place.
  assert.match(go, /if \(!error && await request\('miniSwitchFocus', \[id\]\) !== true\) await request\('miniSwitchFocusUrl', \[space, was\.url, was\.slot \?\? 0\]\);/);
  assert.match(go, /if \(!error\) await request\('miniSwitchFocusUrl', \[space, url, index\]\);/);
  assert.match(go, /error === 'not-found' \? gone : error \? \{ ok: false, error: 'busy' \} : miniSwitchArrived\(\)/);
  // One pick at a time.
  assert.match(body('miniSwitchOnce'), /miniSwitchGoing \?\?= run\(\)\.finally\(\(\) => \{ miniSwitchGoing = null; \}\);/);
  // A Space a closing window still holds is not opened twice.
  const show = body('showSpace');
  assert.match(show, /return 'not-found';/);
  assert.match(show, /if \(list\.elsewhere\.has\(space\)\) return await request\('spaceFocus', \[space\]\) === true \? null : 'activation-failed';/);
  const arrived = body('miniSwitchArrived');
  assert.match(arrived, /focusLeftWindow = true;/);
  assert.match(arrived, /if \(!miniMoveRuns\(snapshot\.tabs\)\.length\) request\('closeWindow'\)/);
  // A Space picked by name goes there; only the menu's move mode moves.
  const open = body('openSpace');
  assert.match(open, /if \(snapshot\?\.miniWindow\) \{\s*if \(options\.move === true\) return otherProfileTarget\(options\) \? \{ ok: false, error: 'busy' \} : moveMiniWindowToSpace\(id, null\);/);
  assert.match(open, /return miniSwitchOnce\(async \(\) => \{/);
  assert.match(open, /const went = target \? await inOtherProfile\('spaceOpenInProfile', \[target, id\]\) : error \? \{ ok: false, error \} : \{ ok: true, workspaceId: id, action: 'focus' \};/);
  assert.match(open, /if \(went\.ok\) await miniSwitchArrived\(\);/);
});

test('native lists other windows\' tabs and focuses a tab by id or by its Space and address', () => {
  const native = read('blanc/browser/ui/blanc_prototype_ui.cc');
  assert.match(native, /if \(method == "miniSwitchList" && args\.empty\(\)\) \{/);
  assert.match(native, /if \(!other_browser \|\| other == owner \|\| other_browser->GetProfile\(\) != profile\) continue;\s*if \(!other->space_name\.empty\(\)\) elsewhere\.Append\(other->space_name\);\s*if \(IsMiniWindow\(other_browser\) \|\| IsHoldWindow\(other_browser\) \|\| other_browser->IsDeleteScheduled\(\)\) continue;/);
  assert.match(native, /"sharedRecords"/);
  // Held Spaces, the Spaces list and every Space another window shows.
  assert.match(native, /\.Set\("elsewhere", std::move\(elsewhere\)\)\.Set\("meta", profile->GetPrefs\(\)->GetDict\(kSpacesMetaPref\)\.Clone\(\)\);/);
  assert.match(native, /if \(auto\* page = hold->Contents\(tab\)\) rows\.Append\(row\(page, slot\)\.Set\("id", tab\.id\)\);/);
  // A renamed tab by its name; addresses as the snapshot reads them.
  assert.match(native, /\.Set\("title", custom\.empty\(\) \? base::UTF16ToUTF8\(page->GetTitle\(\)\) : custom\)\.Set\("url", MiniSwitchUrl\(page\)\)/);
  assert.match(native, /if \(MiniSwitchUrl\(other_model->GetWebContentsAt\(i\)\) == args\[1\]\.GetString\(\) &&/);
  assert.match(native, /if \(method == "miniSwitchFocus" && args\.size\(\) == 1 && args\[0\]\.is_int\(\)\) \{/);
  assert.match(native, /if \(method == "miniSwitchFocusUrl" && args\.size\(\) == 3 && args\[0\]\.is_string\(\) && args\[1\]\.is_string\(\) && args\[2\]\.is_int\(\)\) \{/);
});
