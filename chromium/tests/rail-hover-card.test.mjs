import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({URL});
for (const file of ['rail-hover.js', 'rail-hover-card.js'])
  vm.runInContext(fs.readFileSync(new URL('../blanc/island/' + file, import.meta.url), 'utf8'), context);
const card = context.BlancRailHoverCard;
const plain = value => JSON.parse(JSON.stringify(value));

const tabs = [
  {id: 1, title: 'Inbox (3) – Mail', url: 'https://mail.example.com/x', favicon: 'data:mail'},
  {id: 2, title: 'Notes', url: 'https://notes.example.com/', favicon: null, asleep: true},
  {id: 3, title: 'Secret', url: 'https://bank.example.com/', private: true},
  {id: 4, title: 'Left', url: 'https://a.example.com/', groupId: 'g'},
  {id: 5, title: 'Right', url: 'https://b.example.com/', groupId: 'g'},
  {id: 6, title: 'Start', url: 'blanc://newtab/'},
];
const snapshot = {tabs, activeTabId: 4, groups: [{id: 'g', name: 'Reading', collapsed: true, color: 'blue'}],
  splits: [{id: 's', tabIds: [4, 5]}]};

test('a tab card: title, host and what picture it may show', () => {
  const mail = plain(card.cardModel(snapshot, {kind: 'tab', tabId: '1'}, {image: 'data:image/jpeg;base64,AA'}));
  assert.equal(mail.kind, 'picture');
  assert.equal(mail.title, 'Inbox (3) – Mail');
  assert.equal(mail.host, 'mail.example.com');
  assert.equal(mail.picture, 'live');
  assert.equal(mail.image, 'data:image/jpeg;base64,AA');
  assert.equal(plain(card.cardModel(snapshot, {kind: 'tab', tabId: 2}, {})).picture, 'quiet');
  assert.equal(plain(card.cardModel(snapshot, {kind: 'tab', tabId: 6}, {})).host, '');
});

test('a private tab never carries a picture, even one passed in', () => {
  const secret = plain(card.cardModel(snapshot, {kind: 'tab', tabId: 3}, {image: 'data:image/jpeg;base64,AA'}));
  assert.equal(secret.picture, 'private');
  assert.equal(secret.image, null);
  assert.equal(secret.private, true);
});

test('the current tab and a visible split pane show no picture', () => {
  assert.equal(plain(card.cardModel(snapshot, {kind: 'tab', tabId: 4}, {image: 'x'})).image, null);
  assert.equal(plain(card.cardModel(snapshot, {kind: 'tab', tabId: 5}, {})).picture, 'none');
});

test('a split card has one pane per tab, in order', () => {
  const split = plain(card.cardModel(snapshot, {kind: 'split', splitId: 's'}, {label: 'Left + Right'}));
  assert.equal(split.title, 'Left + Right');
  assert.deepEqual(split.panes.map(pane => [pane.tabId, pane.picture]), [[4, 'none'], [5, 'none']]);
});

test('a list card lists every tab of the group in tab order', () => {
  const many = Array.from({length: 14}, (_, i) => ({id: 100 + i, title: 't' + i, url: 'https://x.example/', groupId: 'big'}));
  const list = plain(card.cardModel({tabs: many, activeTabId: null, groups: [{id: 'big', name: 'Big', collapsed: true}], splits: []},
    {kind: 'group', groupId: 'big'}, {}));
  assert.equal(list.kind, 'list');
  assert.equal(list.name, 'Big');
  assert.deepEqual(list.rows.map(row => row.tabId), many.map(tab => tab.id));
});

test('a missing tab or group gives no card', () => {
  assert.equal(card.cardModel(snapshot, {kind: 'tab', tabId: 99}, {}), null);
  assert.equal(card.cardModel(snapshot, {kind: 'group', groupId: 'nope'}, {}), null);
});

test('placement: beside the rail, centered on the row, kept inside the window', () => {
  const viewport = {width: 1200, height: 760};
  assert.deepEqual(plain(card.place({top: 700, height: 32}, {width: 280, height: 220}, viewport, {left: 256, align: 'center'})),
    {left: 264, top: 532});
  assert.deepEqual(plain(card.place({top: 100, height: 32}, {width: 280, height: 200}, viewport, {left: 256, align: 'center'})),
    {left: 264, top: 16});
  assert.deepEqual(plain(card.place({top: 40, height: 32}, {width: 220, height: 300}, viewport, {left: 256, align: 'top'})),
    {left: 264, top: 40});
  assert.deepEqual(plain(card.place({top: 40, height: 32}, {width: 280, height: 200}, {width: 400, height: 760}, {left: 256, align: 'top'})),
    {left: 112, top: 40}, 'a narrow window keeps the card inside');
});

test('host and native agree on the request names', () => {
  const native = fs.readFileSync(new URL('../blanc/browser/ui/blanc_prototype_ui.cc', import.meta.url), 'utf8');
  const host = ['host.js', 'rail-hover-card.js'].map(file => fs.readFileSync(new URL(`../blanc/island/${file}`, import.meta.url), 'utf8')).join('\n');
  for (const name of ['tabThumbnail', 'watchThumbnail', 'unwatchThumbnail', 'hoverCardBounds']) {
    assert.ok(native.includes(`method == "${name}"`), `native handles ${name}`);
    assert.ok(host.includes(`'${name}'`), `the host asks for ${name}`);
  }
  assert.match(host, /tabThumbnail: \(/, 'the host takes pictures the watch sends (window.BlancPrototypeHost.tabThumbnail)');
});
