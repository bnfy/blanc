'use strict';

// Every utility sheet carries the same four nav links in the same order, so
// the nav never shifts between sheets (spec 2026-09-26 §5.4). The tab
// handoff is a one-time security confirmation and deliberately has no links.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PAGES = path.join(__dirname, '../../src/renderer/pages');
const ORDER = ['blanc://settings/', 'blanc://bookmarks/', 'blanc://history/', 'blanc://downloads/'];
const CURRENT = {
  settings: 'blanc://settings/',
  bookmarks: 'blanc://bookmarks/',
  history: 'blanc://history/',
  downloads: 'blanc://downloads/',
  shortcuts: null,
  'tab-import': null,
};

function navBlock(page) {
  const html = fs.readFileSync(path.join(PAGES, `${page}.html`), 'utf8');
  const block = html.match(/<nav class="page-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(block, `${page}.html has no .page-nav`);
  return block;
}

function nav(page) {
  const links = [...navBlock(page).matchAll(/<a href="([^"]+)"([^>]*)>/g)]
    .map(([, href, rest]) => ({ href, current: /class="current"/.test(rest) }));
  return { hrefs: links.map((link) => link.href), current: links.find((link) => link.current)?.href ?? null };
}

for (const [page, current] of Object.entries(CURRENT)) {
  test(`${page} shows the shared nav`, () => {
    const found = nav(page);
    assert.deepEqual(found.hrefs, ORDER);
    assert.equal(found.current, current);
  });
}

test('the tab handoff keeps its one-time label and no links', () => {
  assert.doesNotMatch(navBlock('tab-handoff'), /<a /);
});
