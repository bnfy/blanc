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

function buildRow(tab, { activeTabId = 'active' } = {}) {
  const sandbox = {
    document: { createElement: fakeElement },
    state: { activeTabId, glanceTabId: null },
    ICONS: { pin: '', mute: '', close: '' },
    setFavicon() {},
    tabDomain: () => 'example.com',
    window: { browserAPI: {} },
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

test('the private tag is visual only; the switch button says "private"', () => {
  const row = buildRow(TAB);
  const tag = row.children.find((child) => child.className === 'row-private');
  assert.equal(tag.textContent, 'private');
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
