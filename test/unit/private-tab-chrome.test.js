'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');
const overlaySource = fs.readFileSync(path.join(ROOT, 'src/renderer/overlay.js'), 'utf8');
const tabRowSource = overlaySource.match(/function tabRow\(tab\) \{[\s\S]*?\n {2}\}/)?.[0];

test('the panel tabRow could be lifted from source', () => {
  assert.ok(tabRowSource, 'tabRow not found in overlay.js — update this test with it');
});

// Just enough DOM for tabRow to build a row whose children can be inspected.
function fakeElement(tag) {
  return {
    tag,
    children: [],
    attrs: {},
    dataset: {},
    className: '',
    textContent: '',
    innerHTML: '',
    title: '',
    type: '',
    append(...nodes) { this.children.push(...nodes); },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener() {},
  };
}

const englishT = (() => {
  const { createTranslator } = require('../../src/renderer/pages/i18n.js');
  const strings = require('../../src/renderer/pages/strings.en.js');
  return createTranslator({ locale: 'en', messages: strings.messages });
})();

function buildRow(tab, { activeTabId = 'active', splits = [] } = {}) {
  const sandbox = {
    document: { createElement: fakeElement },
    state: { activeTabId, glanceTabId: null, splits },
    ICONS: { pin: '', mute: '', close: '', glance: '<svg data-glyph="glance"></svg>' },
    setFavicon() {},
    tabDomain: () => 'example.com',
    window: { browserAPI: {} },
    // Interface strings as every chrome document loads them (F44); English.
    blancI18n: { t: englishT },
  };
  vm.runInNewContext(`${tabRowSource}\nthis.__row = tabRow(${JSON.stringify(tab)});`, sandbox);
  return sandbox.__row;
}

const TAB = {
  id: 'background', title: 'Docs', url: 'https://example.com/', private: true,
  pinned: false, muted: false, audible: false, asleep: false, isLoading: false,
};

const classes = (row) => row.children.map((child) => child.className.split(' ')[0]);

test('the private tag sits directly before ✕ on active and background rows alike', () => {
  for (const activeTabId of ['active', TAB.id]) {
    const order = classes(buildRow(TAB, { activeTabId }));
    assert.deepEqual(order.slice(-2), ['row-private', 'row-close'], order.join(', '));
  }
});

test('the private tag is visual only ("Private"); the switch button says "private"', () => {
  const row = buildRow(TAB);
  const tag = row.children.find((child) => child.className === 'row-private');
  assert.equal(tag.textContent, 'Private');
  assert.equal(tag.attrs['aria-hidden'], 'true');
  const primary = row.children.find((child) => child.className === 'row-primary');
  assert.equal(primary.attrs['aria-label'], 'Switch to Docs, example.com, private');
});

test('an ordinary row has no private tag or private name', () => {
  const row = buildRow({ ...TAB, private: false });
  assert.ok(!classes(row).includes('row-private'));
  const primary = row.children.find((child) => child.className === 'row-primary');
  assert.doesNotMatch(primary.attrs['aria-label'], /private/);
});

test('the Glance action is an icon, not a word', () => {
  const row = buildRow({ ...TAB, private: false });
  const glance = row.children.find((child) => child.className.split(' ')[0] === 'row-glance');
  assert.ok(glance, 'a background row offers Glance');
  assert.equal(glance.textContent, '');
  assert.match(glance.innerHTML, /<svg/);
  assert.equal(glance.dataset.tooltip, 'Open this tab in Glance');
});

// #1441: Glance floats over a visible split, so rows keep their Glance
// button while one shows.
const glanceOf = (row) => row.children.find((child) => child.className.split(' ')[0] === 'row-glance');

test('with a split showing, other rows and the two-pane split\'s other pane offer Glance', () => {
  for (const splits of [
    [{ id: 'split', tabIds: ['active', 'other'] }],
    [{ id: 'split', tabIds: ['active', 'background'] }],
    [{ id: 'split', tabIds: ['elsewhere', 'other'] }],
  ]) {
    const glance = glanceOf(buildRow({ ...TAB, private: false }, { splits }));
    assert.ok(glance, JSON.stringify(splits));
    assert.equal(glance.dataset.tooltip, 'Open this tab in Glance');
  }
});

test('a pane of a larger visible split has no Glance button', () => {
  const splits = [{ id: 'split', tabIds: ['active', 'background', 'third'] }];
  assert.equal(glanceOf(buildRow({ ...TAB, private: false }, { splits })), undefined);
});

test('the row button and the tab menu share main\'s split-aware Glance path', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
  assert.match(main, /chromeHandle\('tabs:set-glance', \(_e, id\) => openTabMenuGlance\(id\)\);/);
});
