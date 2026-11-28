// Mini window: Move to Space (#1734, plan Part B): the fork's Island carries
// shipping's Spaces button and the Spaces menu's move mode from #1763's merge.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const KEYS = ['mini.moveToSpace.label', 'mini.moveToSpace.title', 'mini.moveToSpace.menu', 'ws.moveMode.header', 'ws.error.miniUnmovable'];

test('the Spaces menu pin is #1763\'s merge and brings its messages', () => {
  const pin = JSON.parse(read('blanc/spaces-menu.json'));
  assert.equal(pin.commit, '870c400deee96f1a25c2ba8bc0edb5227ae9c583');
  for (const key of KEYS) assert.ok(pin.messages.includes(key), key);
  assert.match(pin.note, /#1734/);
});

test('the Island has the mini window\'s Spaces button and the menu its move mode', () => {
  assert.match(read('blanc/island/index.html'), /<button id="pillMiniSpaces" class="mini-spaces" type="button"[^>]*hidden>/);
  const renderer = read('blanc/island/renderer.js');
  assert.match(renderer, /pillMiniSpaces\.hidden = !miniWindow;/);
  assert.match(renderer, /pillMiniSpaces\.disabled = !state\.miniWindowCanMove;/);
  assert.match(renderer, /const anchor = !pillMiniSpaces\.hidden \? pillMiniSpaces : pillSpace\.hidden \? islandPill : pillSpace;/);
  assert.match(renderer, /pillMiniSpaces\.setAttribute\('aria-expanded', String\(mode === 'spaces'\)\);/);
  assert.match(renderer, /window\.browserAPI\.openSpacesMenu\(\{ \.\.\.spacesAnchor\(\), closing \}\);\n  \}\);\n\n  for \(const chip of/);
  const css = read('blanc/island/styles.css');
  assert.match(css, /#pillMiniOpen,\n#pillMiniSpaces,\n:root\[data-platform="linux"\] #pillRestartToUpdate \{/);
  assert.match(css, /#pillMiniSpaces:disabled \{ opacity: 0\.45; cursor: default; \}/);
  assert.match(read('blanc/island/workspace-ui.js'), /setMoveMode\(on, \{ tabCount = 0 \} = \{\}\)/);
  assert.match(read('blanc/island/overlay.js'), /workspaceUI\.setMoveMode\(payload\.miniWindow === true, \{ tabCount: movingTabCount\(payload\) \}\);/);
  // The editor counts the tabs the host moves (no tabOrder in this payload).
  assert.match(read('blanc/island/overlay.js'), /return \(payload\.tabs \?\? \[\]\)\.filter\(\(tab\) => tab\.private \|\| tab\.url !== 'blanc:\/\/newtab\/'\)\.length;/);
});

// The host (blanc/island/host.js) does the move with the native batch move
// it already has: one spaceMoveTabs per run of tabs, each run keeping its group.
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

test('a mini window moves in runs of tabs, each keeping its group; an unused start page stays', () => {
  const staying = host.match(/  const stayingStartPage = [^\n]+\n/)[0];
  const miniMoveRuns = new Function(`${staying}${body('miniMoveRuns')}; return miniMoveRuns;`)();
  const tab = (id, extra = {}) => ({ id, url: `https://example.com/${id}`, groupId: null, canGoBack: false, canGoForward: false, ...extra });
  // Every start page stays, used or not: the fork's Space records hold only
  // web pages (CanMoveTabToSpace), so one would refuse the whole move.
  assert.deepEqual(miniMoveRuns([
    tab('1', { url: 'blanc://newtab/' }),
    tab('2'), tab('3', { groupId: 'g' }), tab('4', { groupId: 'g' }), tab('5'),
    tab('6', { url: 'blanc://newtab/', canGoBack: true }),
  ]), [{ ids: ['2'], groupId: null }, { ids: ['3', '4'], groupId: 'g' }, { ids: ['5'], groupId: null }]);
  assert.deepEqual(miniMoveRuns([tab('1', { url: 'blanc://newtab/' })]), []);
  // A private tab's start page reads as blanc://newtab/ too, but it is never
  // left behind: it goes into the run, where canPlace refuses it (found on
  // the Mac Studio's candidate, F61-7).
  assert.deepEqual(miniMoveRuns([tab('1'), tab('2', { url: 'blanc://newtab/', private: true })]), [{ ids: ['1', '2'], groupId: null }]);
  // A start page inside a group stays too; the move takes it out of the
  // group first, since a group moves only with all its members.
  assert.deepEqual(miniMoveRuns([tab('1', { url: 'blanc://newtab/', groupId: 'g' }), tab('2', { groupId: 'g' })]),
    [{ ids: ['2'], groupId: 'g' }]);
});

test('only the menu\'s move mode moves a mini window; switching by name stays refused', () => {
  assert.match(body('openSpace'), /if \(snapshot\?\.miniWindow\) return options\.move === true && !otherProfileTarget\(options\) \? moveMiniWindowToSpace\(id, null\) : \{ ok: false, error: 'busy' \};/);
  assert.match(body('createBlankSpace'), /if \(snapshot\?\.miniWindow\) return options\.move === true && !otherProfileTarget\(options\) \? moveMiniWindowToSpace\(null, \{ name: rawName, color: options\.color, symbol: options\.symbol \}\) : \{ ok: false, error: 'busy' \};/);
  // The menu lists this profile's Spaces in a mini window; saving and
  // switching the window itself stay refused.
  assert.ok(!host.slice(host.indexOf('const spaceList = async'), host.indexOf('const savedTabCount')).includes('miniWindow'), 'a mini window reads the list');
  for (const name of ['saveSpaceAs', 'swapToSpace']) assert.match(body(name), /if \(snapshot\?\.miniWindow\) return \{ok:false,error:'busy'\};/);
  assert.match(body('refreshNow'), /snapshot\.miniWindowCanMove = !!snapshot\.miniWindow && miniMoveRuns\(snapshot\.tabs\)\.length > 0;/);
});

test('the move is all or nothing, writes the new Space after its first run, then closes the mini window', () => {
  const move = body('moveMiniWindowToSpace');
  assert.match(move, /request\('batchTabsMenuState', \[ids\.map\(nativeId\)\]\)/);
  assert.match(move, /if \(!state\?\.canPlace\) return \{ ok: false, error: 'unmovable', movedCount: 0 \};/);
  assert.match(move, /request\('spaceMoveTabs', \[run\.ids\.map\(nativeId\), target, create, \.\.\.\(run\.groupId \? \[run\.groupId\] : \[\]\)\]\)/);
  assert.match(move, /error: moved \? 'moved-partly' : /);
  // Grouped start pages leave their group only once every check has passed,
  // so a refused move leaves the window as it was.
  assert.match(move, /request\('setTabGroup', \[nativeId\(tab\.id\), null\]\)/);
  const ungroup = move.indexOf("request('setTabGroup'");
  for (const check of ["request('batchTabsMenuState'", 'checkSpaceName(', "error: 'not-found'"])
    assert.ok(move.indexOf(check) < ungroup, `${check} runs before the ungroup`);
  // A later run waits out another window's Space write instead of stopping.
  assert.match(move, /for \(let attempt = 0; index > 0 && attempt < 10 && !result\.ok && !result\.movedCount && \['busy', 'refused'\]\.includes\(result\.error\); attempt\+\+\)/);
  // A new Space saved before anything moved is reported as saved, not failed.
  assert.match(move, /create && result\.saved && !moved \? 'saved-not-moved'/);
  assert.match(move, /request\('spaceFocus', \[target\]\)/);
  assert.match(move, /openSpaceElsewhere\(target\)/);
  assert.match(move, /request\('closeWindow'\)/);
});
