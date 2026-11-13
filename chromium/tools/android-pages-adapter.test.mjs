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

// A page at `url` with just enough DOM for the adapter, after it ran. `page` adds a Start Page's
// clock: {elements: {id: element}, screen, innerHeight, font: computed style, metrics: measureText's}.
function load(url, page = {}) {
  const sent = [], appended = [], listeners = {}, rootStyle = {};
  const canvas = {getContext: () => ({font: '', measureText: () => page.metrics})};
  const element = tag => tag === 'canvas' ? canvas : {tagName: tag, dataset: {}, setAttribute(k, v) { this[k] = v; }};
  const documentElement = {
    dataset: {}, append: (...n) => appended.push(...n),
    style: {setProperty: (k, v) => { rootStyle[k] = v; }, getPropertyValue: k => rootStyle[k] || ''},
  };
  const document = {
    documentElement,
    head: {append: (...n) => appended.push(...n)},
    body: {append: (...n) => appended.push(...n)},
    createElement: element,
    getElementById: id => page.elements?.[id] ?? null,
    addEventListener: (type, fn, opts) => { (listeners[type] ||= []).push(fn); },
    fonts: {addEventListener: (type, fn) => { (listeners[`fonts.${type}`] ||= []).push(fn); }},
  };
  const location = new URL(url);
  class Observer { observe() {} }
  const window = {
    chrome: {send: (name, args) => sent.push([name, args])}, location, document,
    screen: page.screen, get innerHeight() { return page.innerHeight; },
    getComputedStyle: () => page.font, BlancStartRules: page.rules,
    MutationObserver: Observer, ResizeObserver: Observer,
    addEventListener: (type, fn) => { (listeners[`window.${type}`] ||= []).push(fn); },
  };
  window.window = window;
  window.globalThis = window;
  vm.runInNewContext(fs.readFileSync(ADAPTER, 'utf8'), window);
  const fire = type => (listeners[type] || []).forEach(fn => fn({type}));
  return {window, sent, appended, listeners, fire, rootStyle};
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

// The Pixel 10 Pro's Start Page (412 × 919 CSS px, a 65 px status bar above the page), its
// first-run clock in Roboto Flex at 360 px, as measured there on November 13, 2026 (the face's
// ascent and descent are 300 and 80 of 324).
const PIXEL = {
  screen: {height: 919, availTop: 65}, innerHeight: 852,
  font: {fontWeight: '245', fontSize: '360px', fontFamily: '"Blanc Clock Flex", sans-serif'},
  metrics: {fontBoundingBoxAscent: 333.33, fontBoundingBoxDescent: 88.89, actualBoundingBoxAscent: 263.6, actualBoundingBoxDescent: 6.4},
};
const clockRow = {};
const withClock = page => ({...page, elements: {bbClock: {textContent: '5:49', closest: () => clockRow}}});

test('the Start Page centers the clock\'s figures on the screen, not its box in the page', () => {
  const {appended, fire, rootStyle} = load('chrome://blanc/newtab.html', withClock(PIXEL));
  fire('DOMContentLoaded');
  assert.ok(appended.some(n => n.rel === 'stylesheet' && n.href === 'android-start-page.css'));
  // The box's middle is the page's (426 px); the figures' is 6.4 px above it; the screen's middle
  // is 459.5 − 65 = 394.5 px down the page, so the clock moves up 25 px.
  const {fontBoundingBoxAscent: a, fontBoundingBoxDescent: d, actualBoundingBoxAscent: ia, actualBoundingBoxDescent: id} = PIXEL.metrics;
  const figures = 852 / 2 + (a - d) / 2 + (id - ia) / 2;
  assert.equal(Math.round(figures * 10) / 10, 419.6);
  const nudge = parseFloat(rootStyle['--android-clock-nudge']);
  assert.ok(Math.abs(figures + nudge - (919 / 2 - 65)) < 0.01, `moved ${nudge}`);
});

test('the clock is measured again when it changes, the window resizes or a font loads', () => {
  const page = withClock(PIXEL);
  const {fire, listeners, rootStyle} = load('chrome://blanc/newtab.html', page);
  fire('DOMContentLoaded');
  const before = rootStyle['--android-clock-nudge'];
  page.innerHeight = 800;
  listeners['window.resize'].forEach(fn => fn());
  assert.notEqual(rootStyle['--android-clock-nudge'], before);
  page.font = {...page.font, fontSize: '300px'};
  page.metrics = {...page.metrics, actualBoundingBoxAscent: 219.4};
  const resized = rootStyle['--android-clock-nudge'];
  listeners['fonts.loadingdone'].forEach(fn => fn());
  assert.notEqual(rootStyle['--android-clock-nudge'], resized);
});

test('a page sharing the screen (split screen, the keyboard up) centers the clock on itself', () => {
  const {fire, rootStyle} = load('chrome://blanc/newtab.html', withClock({...PIXEL, innerHeight: 420}));
  fire('DOMContentLoaded');
  const {fontBoundingBoxAscent: a, fontBoundingBoxDescent: d, actualBoundingBoxAscent: ia, actualBoundingBoxDescent: id} = PIXEL.metrics;
  const figures = 420 / 2 + (a - d) / 2 + (id - ia) / 2;
  assert.ok(Math.abs(figures + parseFloat(rootStyle['--android-clock-nudge']) - 210) < 0.01);
});

test('a Start Page without the clock is left alone', () => {
  const {fire, rootStyle} = load('chrome://blanc/newtab.html', PIXEL);
  fire('DOMContentLoaded');
  assert.equal(rootStyle['--android-clock-nudge'], undefined);
});

// The iPhone's Start Page rules, as far as the appearance projection reads them.
const RULES = {
  clock: {clockStyleFromSettings: settings => ({font: 'flex', style: settings.newtabClockStyle ?? 'glass'})},
  presets: [], paint: {colorWallpaper: () => ({})},
};

test('the Android clock is solid even where the synced setting says glass', async () => {
  const {window, sent} = load('chrome://blanc/newtab.html', {rules: RULES});
  const data = window.bowserPages.start.data();
  window.__blancResolve(sent[0][1][0], true, {appearance: {settings: {newtabClockStyle: 'glass'}}});
  assert.equal((await data).clock.style, 'solid');
});

test('Android never saves a clock style, and shows what it saves as solid', async () => {
  const {window, sent} = load('chrome://blanc/newtab.html', {rules: RULES});
  const saved = window.bowserPages.start.setClock({style: 'glass', font: 'inter'});
  const [, [id, group, method, [change]]] = sent[0];
  assert.equal(`${group}.${method}`, 'start.setClock');
  assert.equal(JSON.stringify(change), JSON.stringify({font: 'inter'}));
  window.__blancResolve(id, true, {font: 'inter', style: 'glass'});
  assert.equal((await saved).style, 'solid');
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
