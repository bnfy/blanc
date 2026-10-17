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
  // Google's other site limits, and DuckDuckGo's own bang redirects.
  assert.equal(engineSearchVia('https://www.google.com/search?sitesearch=http://www.freedesktop.org/wiki/&q=%s&gws_rd=ssl'), 'Google');
  assert.equal(engineSearchVia('https://www.google.com/search?domains=NewsMax.com&sitesearch=Newsmax.com&q=%s'), 'Google');
  assert.equal(engineSearchVia('https://www.google.com/search?q=+[inurl:http://stackoverflow.com]+%s'), 'Google');
  assert.equal(engineSearchVia('https://duckduckgo.com/?q=!node+%s', 'Node.js Documentation'), 'DuckDuckGo');
  for (const own of [
    'https://maps.google.com/maps?q=%s',
    'https://google.com/search?tbm=isch&q=%s&tbs=imgo:1',
    'https://www.youtube.com/results?search_query=%s',
    'https://duckduckgo.com/?q=%s',
    // An exclusion searches the engine itself, not one site.
    'https://duckduckgo.com/?q=-site:pinterest.com+%s&iar=images&iax=images&ia=images',
    'https://www.google.com/search?site=imghp&tbm=isch&q=%s',
  ]) assert.equal(engineSearchVia(own), null, own);
  // DuckDuckGo's own setting bangs are DuckDuckGo, not another site.
  assert.equal(engineSearchVia('https://duckduckgo.com/?q=!safeoff+%s', 'DuckDuckGo (safeoff)'), null);
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
  assert.equal(vias.length, 40);
  assert.equal(vias.filter((v) => v === 'Google').length, 36);
  assert.equal(vias.filter((v) => v === 'DuckDuckGo').length, 4);
  for (const code of ['fdo', 'newsmax', 'gso', 'nodejs']) assert.ok(code in d.via, code);
  for (const code of ['inp', 'ns', 'gis']) assert.ok(!(code in d.via), code);
  const byCode = new Map(d.entries.map((e) => [e[0], e]));
  for (const [code, via] of Object.entries(d.via)) assert.equal(engineSearchVia(byCode.get(code)[4], byCode.get(code)[2]), via, code);
  for (const e of d.entries) if (!(e[0] in d.via)) assert.equal(engineSearchVia(e[4], e[2]), null, e[0]);
});

test('the try-it labels are the app’s English copy at the same ref', () => {
  const d = data();
  const messages = JSON.parse(gitShow(d.ref, 'copy/messages/en.json'));
  assert.deepEqual(d.labels, {
    search: messages['bang.search'].message,
    open: messages['bang.open'].message,
    popular: messages['bang.section.popular'].message,
    all: messages['bang.section.all'].message,
    hintBang: messages['hint.bang'].message,
    hintPrivate: messages['hint.private'].message,
  });
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

test('the byte-checked bangs page files keep LF line endings on every checkout', () => {
  const attributes = read('.gitattributes').toString('utf8').split(/\r?\n/);
  for (const rule of [
    '/site/src/data/bangs.json text eol=lf',
    '/site/src/scripts/bangs.js text eol=lf',
    '/site/public/licenses/kagi-bangs-MIT.txt text eol=lf',
    '/site/public/bang-hosts.json text eol=lf',
  ]) assert.ok(attributes.includes(rule), `missing Git attribute: ${rule}`);
});

// The icon server (cloudflare/bang-icons-worker) answers only for these hosts.
test('the bang host list is every host in the data, once, sorted', async () => {
  const d = data();
  const list = JSON.parse(read('site/public/bang-hosts.json'));
  const hosts = [...new Set(d.entries.map((entry) => entry[3].toLowerCase()))].sort();
  assert.deepEqual(list.hosts, hosts);
  assert.equal(list.count, hosts.length);
  assert.equal(list.ref, d.ref);
  assert.equal(list.release, d.release);
  for (const host of list.hosts) assert.match(host, /^[a-z0-9.-]+$/, host);
  const { renderHosts } = await load();
  assert.equal(read('site/public/bang-hosts.json').toString('utf8'), renderHosts(d));
});
