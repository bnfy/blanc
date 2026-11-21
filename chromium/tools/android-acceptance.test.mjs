// The Android acceptance harness (tests/android/acceptance/) reads Blanc's state from UI Automator
// dumps of the tab grid and the palette, names fixture sites, and runs only scenarios that exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {devtoolsSocket, withPref, gridState, paletteRows, fixtureUrl, pageTitle, rawPixel} from '../tests/android/acceptance/support/parse.mjs';
import {RUNNABLE} from '../tests/android/acceptance/cucumber.mjs';
import {boundsAfter} from '../tests/android/tab-store.mjs';
import {fixturePage} from '../tests/android/acceptance/support/fixture-server.mjs';

const card = (title, selected = false) =>
  `<node text="" content-desc="Switch to ${title}" selected="${selected}" bounds="[0,0][10,10]" />`;
const header = (name, count, folded = false) =>
  `<node text="" content-desc="${name}, ${count} ${count === 1 ? 'tab' : 'tabs'}, ${folded ? 'Unfold' : 'Fold'} group" bounds="[0,0][10,10]" />`;

test('the grid puts the N cards after a group header in that group, then the ungrouped run', () => {
  const xml = card('New Tab') + header('work', 2) + card('a.example') + card('b.example', true) + card('c.example');
  assert.deepEqual(gridState(xml).tabs, [
    {title: 'New Tab', group: null, private: false, selected: false},
    {title: 'a.example', group: 'work', private: false, selected: false},
    {title: 'b.example', group: 'work', private: false, selected: true},
    {title: 'c.example', group: null, private: false, selected: false},
  ]);
  assert.deepEqual(gridState(xml).groups, [{name: 'work', count: 2, collapsed: false}]);
});

test('a folded group has its tucked row and no cards; private tabs follow their heading', () => {
  const xml = header('work', 3, true) + '<node text="3 tabs tucked away" bounds="[0,0][1,1]" />'
    + card('New Tab') + '<node text="Private" bounds="[0,0][1,1]" />' + card('secret.example', true);
  const state = gridState(xml);
  assert.deepEqual(state.groups, [{name: 'work', count: 3, collapsed: true}]);
  assert.deepEqual(state.tabs.map(t => [t.title, t.group, t.private]),
    [['New Tab', null, false], ['secret.example', null, true]]);
});

test('palette rows keep their kind, title and subtitle in order', () => {
  const row = (title, subtitle) => `<node text="${title}" bounds="[0,0][1,1]" /><node text="${subtitle}" bounds="[0,0][1,1]" />`;
  const xml = '<node class="android.widget.EditText" text="exa" bounds="[0,0][1,1]" />'
    + row('research', '2 tabs') + row('news.example', 'news.example') + row('docs.example', 'https://docs.example/')
    + '<node text="/group" bounds="[0,0][1,1]" /><node text="Put this tab in a group" bounds="[0,0][1,1]" />';
  assert.deepEqual(paletteRows(xml), [
    {kind: 'group', title: 'research', subtitle: '2 tabs'},
    {kind: 'tab', title: 'news.example', subtitle: 'news.example'},
    {kind: 'favorite', title: 'docs.example', subtitle: 'https://docs.example/'},
    {kind: 'command', title: '/group', subtitle: 'Put this tab in a group'},
  ]);
});

test('palette rows are read from the list, above the field (Island at the bottom) or below it (at the top)', () => {
  const text = (t, y) => `<node text="${t}" class="android.widget.TextView" bounds="[192,${y}][990,${y + 40}]" />`;
  const rows = text('research', 220) + text('2 tabs', 270) + text('news.example', 360) + text('news.example', 410);
  const scroll = top => `<node class="android.widget.ScrollView" bounds="[60,${top}][1020,${top + 400}]" />`;
  const field = y => `<node class="android.widget.EditText" text="res" bounds="[84,${y}][756,${y + 130}]" />`;
  const actions = y => `<node text="" content-desc="Back" bounds="[48,${y}][180,${y + 130}]" />`;
  const expected = [
    {kind: 'group', title: 'research', subtitle: '2 tabs'},
    {kind: 'tab', title: 'news.example', subtitle: 'news.example'},
  ];
  // At the bottom: list, field, actions, in that order.
  assert.deepEqual(paletteRows(scroll(200) + rows + field(640) + actions(780)), expected);
  // At the top: actions, field, list. The rows shift down with the list.
  const shifted = rows.replace(/\[192,(\d+)\]\[990,(\d+)\]/g, (_, a, b) => `[192,${+a + 400}][990,${+b + 400}]`);
  assert.deepEqual(paletteRows(actions(0) + field(140) + scroll(600) + shifted), expected);
});

test('fixture names become hosts under .example and pages title themselves by host and path', () => {
  assert.equal(fixtureUrl('a.example'), 'https://a.example/');
  assert.equal(fixtureUrl('plain'), 'https://plain.example/');
  assert.equal(fixtureUrl('research-2', '/second'), 'https://research-2.example/second');
  assert.equal(pageTitle('a.example', '/'), 'a.example');
  assert.equal(pageTitle('a.example', '/second'), 'a.example/second');
});

test('a raw screencap pixel is read past its header', () => {
  // 2x1 RGBA with a 16-byte header: width, height, format, color space.
  const header = Buffer.alloc(16);
  header.writeUInt32LE(2, 0); header.writeUInt32LE(1, 4); header.writeUInt32LE(1, 8);
  const raw = Buffer.concat([header, Buffer.from([1, 2, 3, 255, 31, 31, 31, 255])]);
  assert.deepEqual(rawPixel(raw, 1, 0), [31, 31, 31]);
});

test('a group\'s own options button is the first one after its header', () => {
  const button = y => `<node content-desc="Group options" bounds="[0,${y}][10,${y + 10}]" />`;
  const xml = header('one', 1) + button(0) + header('two', 2) + button(50);
  assert.equal(boundsAfter(xml, /content-desc="two, 2 tabs, Fold group"/, /Group options/).top, 50);
  assert.equal(boundsAfter(xml, /content-desc="three/, /Group options/), null);
});

test('a fixture page shows what it was asked for as text, never as markup', () => {
  const page = fixturePage(new URL('https://a.example/<b>?w=<script>&n=1'));
  assert.ok(!page.includes('<script>'), page);
  assert.ok(!page.includes('<b>'), page);
  assert.ok(page.includes('&lt;script&gt; number 1'), page);
});

test('every runnable id names a scenario in spec/acceptance', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../spec/acceptance');
  const text = fs.readdirSync(dir).filter(f => f.endsWith('.feature'))
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  for (const id of RUNNABLE) assert.match(text, new RegExp(`${id}(\\s|$)`), id);
  assert.equal(new Set(RUNNABLE).size, RUNNABLE.length);
});

// Chromium names its DevTools socket chrome_devtools_remote, or chrome_devtools_remote_<pid> when
// another Chromium app holds that name: on the gate's emulator the debug app often does.
test('the DevTools socket is the app\'s own, by its process id when the plain name is taken', () => {
  const unix = ['Num RefCount Protocol Flags Type St Inode Path',
    '0000: 00000002 00000000 00010000 0001 01 810976 @chrome_devtools_remote',
    '0000: 00000002 00000000 00010000 0001 01 873387 @chrome_devtools_remote_11772'].join('\n');
  assert.equal(devtoolsSocket('11772', unix), 'chrome_devtools_remote_11772');
  assert.equal(devtoolsSocket('11772', unix.replaceAll('\n', '\r\n')), 'chrome_devtools_remote_11772');
  assert.equal(devtoolsSocket('500', unix), 'chrome_devtools_remote');
  assert.equal(devtoolsSocket('', unix), 'chrome_devtools_remote');
  assert.equal(devtoolsSocket('1177', unix), 'chrome_devtools_remote', 'a pid that only prefixes another never matches');
});

// setPref edits the app's preferences file. Android writes a file with no entries as <map />, which
// a fresh app can still have when the edit runs: the entry must land there too, or the edit is lost.
test('a preference entry replaces an old one of that name, and lands in an empty <map />', () => {
  const entry = '<int name="blanc.x" value="2" />';
  const full = "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n    <int name=\"blanc.x\" value=\"1\" />\n    <boolean name=\"other\" value=\"true\" />\n</map>\n";
  const out = withPref(full, entry, 'blanc.x');
  assert.equal(out.match(/name="blanc\.x"/g).length, 1);
  assert.match(out, /<int name="blanc\.x" value="2" \/>\n<\/map>/);
  assert.match(out, /name="other"/);
  const empty = "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map />\n";
  assert.match(withPref(empty, entry, 'blanc.x'), /<map>\n    <int name="blanc\.x" value="2" \/>\n<\/map>/);
  assert.throws(() => withPref('', entry, 'blanc.x'), /preferences file/);
});
