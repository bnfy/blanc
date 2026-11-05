// The Android acceptance harness (tests/android/acceptance/) reads Blanc's state from UI Automator
// dumps of the tab grid and the palette, names fixture sites, and runs only scenarios that exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gridState, paletteRows, fixtureUrl, pageTitle, rawPixel} from '../tests/android/acceptance/support/parse.mjs';
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
