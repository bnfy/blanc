'use strict';

// The website roadmap (site/src/pages/roadmap.astro) renders straight from
// site/src/data/roadmap.json. These checks keep that file in a shape the page
// can render: three fixed stages, unique item ids, every item in a known stage
// and product, and internal links that point at real pages.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/src/data/roadmap.json'), 'utf8'));
const PRODUCTS = new Set(['Blanc Browser', 'Blanc Mail', 'Mobile']);

test('roadmap keeps the Now, Next and Later stages in order', () => {
  assert.deepEqual(roadmap.stages.map((stage) => stage.id), ['now', 'next', 'later']);
  for (const stage of roadmap.stages) {
    assert.ok(stage.label && stage.summary, stage.id);
  }
});

test('roadmap records the date it was last updated', () => {
  assert.match(roadmap.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!Number.isNaN(Date.parse(`${roadmap.updated}T00:00:00Z`)));
});

test('every roadmap item is complete, unique and in a known stage and product', () => {
  const stageIds = new Set(roadmap.stages.map((stage) => stage.id));
  const ids = new Set();
  assert.ok(roadmap.items.length > 0);
  for (const item of roadmap.items) {
    assert.match(item.id, /^[a-z0-9-]+$/, item.id);
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
    ids.add(item.id);
    assert.ok(stageIds.has(item.stage), `${item.id} stage ${item.stage}`);
    assert.ok(PRODUCTS.has(item.product), `${item.id} product ${item.product}`);
    assert.ok(item.title?.trim(), `${item.id} title`);
    assert.ok(item.line?.trim(), `${item.id} line`);
  }
  for (const stage of roadmap.stages) {
    assert.ok(roadmap.items.some((item) => item.stage === stage.id), `${stage.id} has no items`);
  }
});

test('roadmap links point at real site pages', () => {
  for (const item of roadmap.items.filter((entry) => entry.link)) {
    const { href, label } = item.link;
    assert.ok(label?.trim(), `${item.id} link label`);
    assert.match(href, /^\/[a-z0-9/-]*$/, `${item.id} links outside the site`);
    const page = href === '/' ? 'index' : href.slice(1);
    const candidates = [`${page}.astro`, `${page}/index.astro`].map((file) => path.join(ROOT, 'site/src/pages', file));
    assert.ok(candidates.some((file) => fs.existsSync(file)), `${item.id} links to missing page ${href}`);
  }
});
