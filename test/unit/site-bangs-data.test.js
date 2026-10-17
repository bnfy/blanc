'use strict';

// The /bangs page shows exactly the bang list a pinned build ships: the bangs
// merge commit while the page is a candidate, the release tag after it.
// Never main's working tree (spec: docs/superpowers/specs/2026-10-17-bangs-page-design.md).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file));
const gitShow = (ref, file) => execFileSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
const CANDIDATE = '081c965bb35058be5fc4d789e53c11c6ce38d607';
const load = () => import('../../site/scripts/build-bangs-data.mjs');
const data = () => JSON.parse(read('site/src/data/bangs.json'));

test('engineSearchVia tags only site-limited searches on a search engine', async () => {
  const { engineSearchVia } = await load();
  assert.equal(engineSearchVia('https://www.google.fr/search?q=%s+site:ubuntu-fr.org&gws_rd=ssl'), 'Google');
  assert.equal(engineSearchVia('https://www.google.com/cse?cx=partner-pub-1:x&q=%s&siteurl=www.boingboing.net/'), 'Google');
  assert.equal(engineSearchVia('https://cse.google.com/cse?cx=0084:3wy&q=%s'), 'Google');
  assert.equal(engineSearchVia('https://duckduckgo.com/?sites=www.aamulehti.fi&kh=1&q=%s&ia=web'), 'DuckDuckGo');
  assert.equal(engineSearchVia('https://duckduckgo.com/?q=%s&sites=hard2mano.com'), 'DuckDuckGo');
  for (const own of [
    'https://maps.google.com/maps?q=%s',
    'https://google.com/search?tbm=isch&q=%s&tbs=imgo:1',
    'https://www.youtube.com/results?search_query=%s',
    'https://duckduckgo.com/?q=%s',
  ]) assert.equal(engineSearchVia(own), null, own);
});

test('the committed data is the catalog at its ref, byte for byte', () => {
  const d = data();
  assert.equal(execFileSync('git', ['rev-parse', `${d.ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim(), d.ref);
  const bytes = gitShow(d.ref, 'src/renderer/pages/bangs-catalog.js');
  const context = { module: { exports: null } };
  vm.runInNewContext(bytes.toString('utf8'), context);
  const catalog = context.module.exports;
  assert.equal(d.catalogSha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(d.count, 10624);
  assert.equal(d.entries.length, d.count);
  assert.deepEqual(d.entries, JSON.parse(JSON.stringify([...catalog])));
  assert.deepEqual(d.popular, [...catalog.popular]);
});

test('engine-search tags cover exactly the site-limited engine searches', async () => {
  const { engineSearchVia } = await load();
  const d = data();
  const vias = Object.values(d.via);
  assert.equal(vias.length, 37);
  assert.equal(vias.filter((v) => v === 'Google').length, 33);
  assert.equal(vias.filter((v) => v === 'DuckDuckGo').length, 4);
  const byCode = new Map(d.entries.map((e) => [e[0], e]));
  for (const [code, via] of Object.entries(d.via)) assert.equal(engineSearchVia(byCode.get(code)[4]), via, code);
  for (const e of d.entries) if (!(e[0] in d.via)) assert.equal(engineSearchVia(e[4]), null, e[0]);
});

test('the try-it module and the Kagi license are byte copies from the same ref', () => {
  const d = data();
  assert.ok(read('site/src/scripts/bangs.js').equals(gitShow(d.ref, 'src/renderer/pages/bangs.js')));
  assert.ok(read('site/public/licenses/kagi-bangs-MIT.txt').equals(gitShow(d.ref, 'bangs/sources/kagi-bangs-LICENSE.txt')));
});

test('candidate data is pinned to the bangs merge commit; release data to the latest release', () => {
  const d = data();
  if (d.release === null) {
    assert.equal(d.ref, CANDIDATE);
  } else {
    const [latest] = JSON.parse(read('site/src/data/releases.json'));
    assert.equal(d.release, latest.tag);
    assert.equal(execFileSync('git', ['rev-parse', `${d.release}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim(), d.ref);
  }
});
