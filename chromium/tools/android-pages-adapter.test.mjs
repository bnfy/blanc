// The adapter Blanc for Android loads first in every page at chrome://blanc/
// (A1 Task 6). It does what the iPhone's PagesBridge user script does: defines
// window.bowserPages from bridges.json's members for the page's host, posts
// calls to the browser (chrome.send here, a WebKit message handler there), and
// marks the document for the phone layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {PAGES, PAGES_DIR, ADAPTER, adapterMembers} from './android-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bridges = JSON.parse(fs.readFileSync(path.join(root, 'browser-api/bridges.json'), 'utf8')).bowserPages.members;

// A page at `url` with just enough DOM for the adapter, after it ran.
function load(url) {
  const sent = [], appended = [], listeners = {};
  const element = tag => ({tagName: tag, dataset: {}, setAttribute(k, v) { this[k] = v; }});
  const documentElement = {dataset: {}, append: (...n) => appended.push(...n)};
  const document = {
    documentElement,
    head: {append: (...n) => appended.push(...n)},
    body: {append: (...n) => appended.push(...n)},
    createElement: element,
    addEventListener: (type, fn, opts) => { (listeners[type] ||= []).push(fn); },
  };
  const location = new URL(url);
  const window = {chrome: {send: (name, args) => sent.push([name, args])}, location, document};
  window.window = window;
  window.globalThis = window;
  vm.runInNewContext(fs.readFileSync(ADAPTER, 'utf8'), window);
  const fire = type => (listeners[type] || []).forEach(fn => fn({type}));
  return {window, sent, appended, listeners, fire};
}

test('the adapter is generated from the template and bridges.json', () => {
  assert.ok(fs.existsSync(ADAPTER));
});

test('each page gets exactly its bridges.json members, as on the iPhone', () => {
  const members = adapterMembers();
  for (const m of members) {
    const contract = bridges.find(b => b.name === m.name);
    assert.ok(contract, m.name);
    assert.equal(m.kind, contract.kind, m.name);
    for (const host of m.hosts) assert.ok(contract.hosts.includes(host), `${m.name} on ${host}`);
    assert.ok(m.hosts.every(h => PAGES.includes(h)), m.name);
  }
  for (const page of PAGES) {
    const want = bridges.filter(b => b.hosts.includes(page)).map(b => b.name).sort();
    const have = members.filter(m => m.hosts.includes(page)).map(m => m.name).sort();
    assert.deepEqual(have, want, page);
  }
});

test('a call goes to the browser and resolves with its reply', async () => {
  const {window, sent} = load('chrome://blanc/history.html');
  const reply = window.bowserPages.history.list({query: 'a', limit: 5});
  assert.equal(sent.length, 1);
  const [name, [id, group, method, args]] = sent[0];
  assert.equal(name, 'blancPages');
  assert.equal(group, 'history');
  assert.equal(method, 'list');
  assert.equal(JSON.stringify(args), JSON.stringify([{query: 'a', limit: 5}]));
  window.__blancResolve(id, true, [{url: 'https://example.com/'}]);
  assert.equal(JSON.stringify(await reply), JSON.stringify([{url: 'https://example.com/'}]));
});

test('a rejected call rejects with the browser\'s message', async () => {
  const {window, sent} = load('chrome://blanc/history.html');
  const reply = window.bowserPages.archive.list();
  window.__blancResolve(sent[0][1][0], false, 'not-yet');
  await assert.rejects(reply, /not-yet/);
});

test('top-level members post with a null group', () => {
  const {window, sent} = load('chrome://blanc/newtab.html');
  window.bowserPages.appVersion();
  assert.equal(sent[0][1][1], null);
  assert.equal(sent[0][1][2], 'appVersion');
});

test('a page sees only its own members', () => {
  const {window} = load('chrome://blanc/history.html');
  assert.equal(window.bowserPages.start, undefined);
  assert.equal(window.bowserPages.bookmarks, undefined);
  assert.equal(typeof window.bowserPages.surface.close, 'function');
});

test('events register listeners the browser calls, and unsubscribe', () => {
  const {window} = load('chrome://blanc/bookmarks.html');
  const seen = [];
  const off = window.bowserPages.pins.onChanged(v => seen.push(v));
  window.__blancEmit('pins.onChanged', 1);
  off();
  window.__blancEmit('pins.onChanged', 2);
  assert.deepEqual(seen, [1]);
});

test('nothing happens outside chrome://blanc/', () => {
  for (const url of ['https://example.com/newtab.html', 'chrome://history/', 'chrome://blanc/unknown.html']) {
    const {window, sent, appended} = load(url);
    assert.equal(window.bowserPages, undefined, url);
    assert.equal(window.__blancResolve, undefined, url);
    assert.equal(sent.length + appended.length, 0, url);
  }
});

test('utility pages get the iPhone\'s phone layout before their scripts run', () => {
  for (const page of ['history', 'bookmarks', 'shortcuts']) {
    const {window, appended} = load(`chrome://blanc/${page}.html`);
    assert.equal(window.document.documentElement.dataset.platform, 'ios', page);
    assert.ok(appended.some(n => n.name === 'viewport' && /width=device-width/.test(n.content)), page);
    assert.ok(appended.some(n => n.rel === 'stylesheet' && n.href === 'ios-pages.css'), page);
  }
});

test('the Start Page gets the phone stylesheet and script once its body exists', () => {
  const {window, appended, fire} = load('chrome://blanc/newtab.html?private=1');
  assert.equal(appended.length, 0);
  fire('DOMContentLoaded');
  assert.equal(window.document.documentElement.dataset.platform, 'ios');
  assert.ok(appended.some(n => n.name === 'viewport'));
  assert.ok(appended.some(n => n.rel === 'stylesheet' && n.href === 'ios-start-page.css'));
  assert.ok(appended.some(n => n.tagName === 'script' && n.src === 'ios-start-page.js'));
});

test('blanc:// links go to the served pages; others go nowhere', () => {
  const {window} = load('chrome://blanc/newtab.html');
  const to = window.__blancPageUrl;
  assert.equal(to('blanc://history/'), 'chrome://blanc/history.html');
  assert.equal(to('blanc://newtab/?private=1'), 'chrome://blanc/newtab.html?private=1');
  assert.equal(to('blanc://mahjong/?deal=a-1'), 'chrome://blanc/mahjong.html?deal=a-1');
  assert.equal(to('blanc://bookmarks/#x'), 'chrome://blanc/bookmarks.html#x');
  assert.equal(to('blanc://settings/'), null);
  assert.equal(to('blanc://tab-import/'), null);
  assert.equal(to('https://example.com/'), undefined);
});

test('every page\'s CSP allows only its own origin and data: images', () => {
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(PAGES_DIR, `${page}.html`), 'utf8');
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
    assert.ok(csp, page);
    for (const source of csp[1].split(/[;\s]+/).filter(t => t && !/-src$|-uri$|-action$/.test(t)))
      assert.ok(["'self'", "'none'", 'data:'].includes(source), `${page}: ${source}`);
  }
});
