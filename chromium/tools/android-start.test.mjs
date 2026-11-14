// Blanc for Android's Start Page script (A5b): the desktop fork's page on a phone. It marks the page,
// gives it a phone viewport, centers the clock's figures on the screen (#1504), opens Customize from
// #customize and takes the blanc:// links the fork's adapter leaves.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../blanc/android/pages-adapter/android-start.js');

// The page as the script sees it before the fork's scripts run. `page` adds a clock: {screen,
// innerHeight, font: computed style, metrics: measureText's}.
function load(page = {}, hash = '') {
  const appended = [], listeners = {}, rootStyle = {}, opened = [], assigned = [], replaced = [];
  const canvas = {getContext: () => ({font: '', measureText: () => page.metrics})};
  const row = {getBoundingClientRect: () => ({height: 300})};
  const clock = page.metrics ? {textContent: '5:49', closest: () => row} : null;
  const popover = {showPopover: () => opened.push('customize')};
  const document = {
    documentElement: {dataset: {}, style: {setProperty: (k, v) => { rootStyle[k] = v; }}},
    head: {append: (...n) => appended.push(...n)},
    createElement: tag => tag === 'canvas' ? canvas : {tagName: tag},
    getElementById: id => ({bbClock: clock, customizePopover: popover})[id] ?? null,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    fonts: {addEventListener: (type, fn) => { (listeners[`fonts.${type}`] ||= []).push(fn); }},
  };
  class Observer { observe() {} }
  const window = {
    document, screen: page.screen, get innerHeight() { return page.innerHeight; },
    location: {hash, pathname: '/newtab.html', search: '', assign: url => assigned.push(url)},
    history: {replaceState: (s, t, url) => replaced.push(url)},
    getComputedStyle: () => page.font, MutationObserver: Observer, ResizeObserver: Observer,
    addEventListener: (type, fn) => { (listeners[`window.${type}`] ||= []).push(fn); },
    setTimeout: fn => fn(),
  };
  window.window = window;
  vm.runInNewContext(fs.readFileSync(SCRIPT, 'utf8'), window);
  const fire = (type, event = {type}) => (listeners[type] || []).forEach(fn => fn(event));
  return {window, appended, listeners, fire, rootStyle, opened, assigned, replaced};
}

test('the page is marked for Android and laid out at the phone\'s width before anything runs', () => {
  const {window, appended} = load();
  assert.equal(window.document.documentElement.dataset.platform, 'android');
  assert.ok(appended.some(n => n.name === 'viewport' && /width=device-width/.test(n.content)));
});

// The Pixel 10 Pro's Start Page (412 × 919 CSS px, a 65 px status bar above the page), its
// first-run clock in Roboto Flex at 360 px, as measured there on November 13, 2026 (the face's
// ascent and descent are 300 and 80 of 324).
const PIXEL = {
  screen: {height: 919, availTop: 65, availHeight: 817}, innerHeight: 852,
  font: {fontWeight: '245', fontSize: '360px', fontFamily: '"Blanc Clock Flex", sans-serif'},
  metrics: {fontBoundingBoxAscent: 333.33, fontBoundingBoxDescent: 88.89, actualBoundingBoxAscent: 263.6, actualBoundingBoxDescent: 6.4},
};
const figuresAt = innerHeight => {
  const {fontBoundingBoxAscent: a, fontBoundingBoxDescent: d, actualBoundingBoxAscent: ia, actualBoundingBoxDescent: id} = PIXEL.metrics;
  return innerHeight / 2 + (a - d) / 2 + (id - ia) / 2;
};

test('the clock\'s figures center on the screen, not its box in the page', () => {
  const {fire, rootStyle} = load(PIXEL);
  fire('DOMContentLoaded');
  // The box's middle is the page's (426 px); the figures' is 6.4 px above it; the screen's middle
  // is 459.5 − 65 = 394.5 px down the page, so the clock moves up 25 px.
  assert.equal(Math.round(figuresAt(852) * 10) / 10, 419.6);
  const nudge = parseFloat(rootStyle['--android-clock-nudge']);
  assert.ok(Math.abs(figuresAt(852) + nudge - (919 / 2 - 65)) < 0.01, `moved ${nudge}`);
  assert.equal(rootStyle['--android-clock-height'], undefined, 'set by the ResizeObserver, not before');
});

test('the clock is measured again when the window resizes or a font loads', () => {
  const page = {...PIXEL};
  const {fire, listeners, rootStyle} = load(page);
  fire('DOMContentLoaded');
  const before = rootStyle['--android-clock-nudge'];
  page.innerHeight = 800;
  listeners['window.resize'].forEach(fn => fn());
  assert.notEqual(rootStyle['--android-clock-nudge'], before);
  page.metrics = {...page.metrics, actualBoundingBoxAscent: 219.4};
  const resized = rootStyle['--android-clock-nudge'];
  listeners['fonts.loadingdone'].forEach(fn => fn());
  assert.notEqual(rootStyle['--android-clock-nudge'], resized);
});

test('a page that stops above the navigation bar still centers the clock on the screen', () => {
  const {fire, rootStyle} = load({...PIXEL, screen: {height: 919, availTop: 65, availHeight: 806}, innerHeight: 806});
  fire('DOMContentLoaded');
  assert.ok(Math.abs(figuresAt(806) + parseFloat(rootStyle['--android-clock-nudge']) - (919 / 2 - 65)) < 0.01);
});

test('a page sharing the screen (split screen, the keyboard up) centers the clock on itself', () => {
  const {fire, rootStyle} = load({...PIXEL, innerHeight: 420});
  fire('DOMContentLoaded');
  assert.ok(Math.abs(figuresAt(420) + parseFloat(rootStyle['--android-clock-nudge']) - 210) < 0.01);
});

test('a page without the clock is left alone', () => {
  const {fire, rootStyle} = load();
  fire('DOMContentLoaded');
  assert.equal(rootStyle['--android-clock-nudge'], undefined);
});

test('#customize opens Customize once the page is ready, and leaves the address', () => {
  const {fire, opened, replaced} = load({}, '#customize');
  assert.deepEqual(opened, []);
  fire('DOMContentLoaded');
  assert.deepEqual(opened, ['customize']);
  assert.deepEqual(replaced, ['/newtab.html']);
});

test('a page opened without #customize keeps Customize closed', () => {
  const {fire, opened} = load({}, '#other');
  fire('DOMContentLoaded');
  assert.deepEqual(opened, []);
});

test('blanc:// links open the pages Android serves, and nothing else', () => {
  const {fire, assigned} = load();
  const click = href => {
    let prevented = false;
    const anchor = {getAttribute: () => href};
    fire('click', {target: {closest: () => anchor}, defaultPrevented: false, preventDefault: () => { prevented = true; }});
    return prevented;
  };
  assert.ok(click('blanc://history/'));
  assert.ok(click('blanc://mahjong/?deal=a-1'));
  assert.ok(click('blanc://tab-import/'));
  assert.deepEqual(assigned, ['/history.html', '/mahjong.html?deal=a-1']);
});
