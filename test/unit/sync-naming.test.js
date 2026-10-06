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
  ...fs.readdirSync(path.join(root, 'site/src/components/guides')).filter((f) => f.endsWith('.astro')).map((f) => `site/src/components/guides/${f}`),
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

test('Sync remains a clearly named and reachable consolidated topic', () => {
  const topics=JSON.parse(read('site/src/data/guide-topics.json'));
  assert.deepEqual(topics.find(topic=>topic.id==='sync'), {id:'sync',label:'Sync',page:'support'});
  assert.match(read('site/src/components/guides/sync.astro'), /sync/);
});
