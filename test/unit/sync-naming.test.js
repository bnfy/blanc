'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// One-name decision (design 2026-09-17 §3): the user-facing feature is "Sync".
// "Profile Sync" and "Tab Sync" are retired everywhere a person can read them,
// including breadcrumbs, page titles, and structured data. Historical release
// records (release-feature-names.json, releases.json) keep their original
// wording and are deliberately out of scope.
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const SURFACES = [
  ...fs.readdirSync(path.join(root, 'site/src/pages')).filter((f) => f.endsWith('.astro')).map((f) => `site/src/pages/${f}`),
  ...fs.readdirSync(path.join(root, 'site/src/pages/features')).filter((f) => f.endsWith('.astro')).map((f) => `site/src/pages/features/${f}`),
  'site/src/data/navigation.mjs',
  'src/renderer/pages/settings.html',
  'src/renderer/pages/newtab.html',
  'src/renderer/index.html',
];

test('no user-facing surface says Profile Sync or Tab Sync', () => {
  for (const file of SURFACES) {
    const source = read(file);
    for (const retired of [/profile sync/i, /tab sync/i]) {
      assert.doesNotMatch(source, retired, `${file} must say "Sync"`);
    }
  }
});

test('the sync feature page names itself Sync in its breadcrumb and structured data', () => {
  const source = read('site/src/pages/features/sync.astro');
  assert.match(source, /<span aria-current="page">sync<\/span>/);
  // The JSON-LD block is one line; find it rather than matching across the
  // whole file, which needs a dot-all lazy scan.
  const ld = source.split('\n').find((line) => line.includes('"@type":"BreadcrumbList"'));
  const breadcrumb = JSON.parse(ld ?? '{}');
  const last = breadcrumb.itemListElement?.at(-1);
  assert.equal(last?.name, 'Sync');
  assert.equal(last?.item, 'https://blancbrowser.com/features/sync');
});
