'use strict';

// The homepage's first screen: a published v1.40.0 capture with the app's own
// Island floating over it (docs/superpowers/specs/2026-10-21-floating-island-homepage-hero-design.md).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the hero window draws the app’s own Island over a published capture', () => {
  const src = read('site/src/components/FloatingIslandWindow.astro');
  assert.match(src, /nativeIslandArt\(\{ styles, document, renderer \}\)/);
  assert.match(src, /var\(--shadow-island-float\)/); // the float view's own shadow
  assert.match(src, /float-island-hidden-v1\.40\.0/);
  assert.match(src, /float-island-lights-v1\.40\.0/);
  assert.doesNotMatch(src, /<svg[^>]*class="[^"]*island/); // no hand-drawn pill
});

test('the Island and buttons sit where the published app put them', () => {
  const { measured } = JSON.parse(read('docs/website-captures-float-island-v1.40.0.json'));
  const src = read('site/src/components/FloatingIslandWindow.astro');
  assert.match(src, /website-captures-float-island-v1\.40\.0\.json/); // positions come from the ledger, not typed in
  assert.ok(measured.islandRect.width > 300 && measured.islandRect.y >= 0);
  // The pill's sample state is the measured one, not typed in.
  for (const field of ['domain', 'dots', 'activeDot', 'shieldCount']) assert.match(src, new RegExp(`measured\\.pill\\.${field}`));
});

// A window and timers advanced by hand.
function fakeHero({ reducedMotion = false } = {}) {
  const timers = new Map();
  let nextId = 1, now = 0;
  const listeners = {}, docListeners = {}, observers = [];
  const pointerStyle = new Map();
  const pointer = { style: { setProperty: (k, v) => pointerStyle.set(k, v), getPropertyValue: k => pointerStyle.get(k) } };
  const root = {
    dataset: { state: 'shown' },
    querySelector: sel => (sel === '.float-window-pointer' ? pointer : null),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    getBoundingClientRect: () => ({ left: 0, top: 100, width: 1000, height: 625 }),
  };
  const view = {
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }),
    IntersectionObserver: class { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} disconnect() {} },
    document: {
      visibilityState: 'visible',
      addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); },
      removeEventListener: (type, fn) => { docListeners[type] = (docListeners[type] || []).filter(f => f !== fn); },
    },
  };
  const advance = ms => {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = due[1].at; due[1].fn();
    }
    now = end;
  };
  const fire = (type, event = {}) => (listeners[type] || []).forEach(fn => fn(event));
  const intersect = isIntersecting => observers.forEach(o => o.cb([{ isIntersecting }]));
  const setVisibility = state => { view.document.visibilityState = state; (docListeners.visibilitychange || []).forEach(fn => fn()); };
  return { root, view, timers, advance, fire, intersect, setVisibility, pointerY: () => parseFloat(pointerStyle.get('--pointer-y')) };
}

const loadHero = () => import(pathToFileURL(path.join(root, 'site/src/scripts/floating-island-hero.js')));

test('the peek loops: hidden, the pointer reaches the top, shown, hidden', async () => {
  const { initFloatingIslandHero, TIMING } = await loadHero();
  const h = fakeHero();
  initFloatingIslandHero(h.root, { view: h.view });
  h.intersect(true);
  assert.equal(h.root.dataset.state, 'hidden');
  assert.ok(h.pointerY() > 30, 'the pointer rests in the page');
  h.advance(TIMING.rest);
  assert.ok(h.pointerY() <= 2, 'then moves to the top edge');
  assert.equal(h.root.dataset.state, 'hidden');
  h.advance(TIMING.approach);
  assert.equal(h.root.dataset.state, 'shown');
  h.advance(TIMING.shown);
  assert.ok(h.pointerY() > 30, 'the pointer leaves into the page');
  h.advance(TIMING.leave);
  assert.equal(h.root.dataset.state, 'hidden');
  h.advance(TIMING.rest + TIMING.approach);
  assert.equal(h.root.dataset.state, 'shown', 'and it loops');
});

test('reduced motion shows the Island at rest and never loops', async () => {
  const { initFloatingIslandHero } = await loadHero();
  const h = fakeHero({ reducedMotion: true });
  initFloatingIslandHero(h.root, { view: h.view });
  h.intersect(true);
  assert.equal(h.root.dataset.state, 'shown');
  assert.equal(h.timers.size, 0);
  assert.equal(h.root.dataset.loop, undefined, 'no drawn pointer');
});

test('the visitor’s pointer in the top band brings it in and pauses the loop', async () => {
  const { initFloatingIslandHero, TIMING, TOP_BAND } = await loadHero();
  const h = fakeHero();
  initFloatingIslandHero(h.root, { view: h.view });
  h.intersect(true);
  h.fire('pointermove', { pointerType: 'mouse', clientY: 100 + 625 * TOP_BAND * 0.5 });
  assert.equal(h.root.dataset.state, 'shown');
  assert.equal(h.timers.size, 0, 'the loop waits');
  assert.equal(h.root.dataset.loop, undefined, 'the drawn pointer steps aside');
  h.fire('pointermove', { pointerType: 'mouse', clientY: 100 + 625 * 0.5 });
  assert.equal(h.root.dataset.state, 'hidden');
  h.advance(TIMING.resumeAfterVisitor - 1);
  assert.equal(h.root.dataset.loop, undefined);
  h.advance(1);
  assert.equal(h.root.dataset.loop, '', 'the loop resumes');
});

test('the pointer leaving the window hides the Island', async () => {
  const { initFloatingIslandHero, TOP_BAND } = await loadHero();
  const h = fakeHero();
  initFloatingIslandHero(h.root, { view: h.view });
  h.intersect(true);
  h.fire('pointermove', { pointerType: 'mouse', clientY: 100 + 625 * TOP_BAND * 0.5 });
  h.fire('pointerleave', { pointerType: 'mouse' });
  assert.equal(h.root.dataset.state, 'hidden');
});

test('keyboard focus on the window shows it', async () => {
  const { initFloatingIslandHero, TIMING } = await loadHero();
  const h = fakeHero();
  initFloatingIslandHero(h.root, { view: h.view });
  h.intersect(true);
  h.fire('focusin');
  assert.equal(h.root.dataset.state, 'shown');
  h.advance(TIMING.rest + TIMING.approach + TIMING.shown + TIMING.leave);
  assert.equal(h.root.dataset.state, 'shown', 'and keeps it while focused');
  h.fire('focusout');
  assert.equal(h.root.dataset.state, 'hidden');
});

test('touch pointers do not take over the loop', async () => {
  const { initFloatingIslandHero } = await loadHero();
  const h = fakeHero();
  initFloatingIslandHero(h.root, { view: h.view });
  h.intersect(true);
  h.fire('pointermove', { pointerType: 'touch', clientY: 101 });
  h.fire('pointerleave', { pointerType: 'touch' });
  assert.equal(h.root.dataset.state, 'hidden');
  assert.equal(h.timers.size, 1);
  assert.equal(h.root.dataset.loop, '');
});

test('the loop pauses while off screen or in a hidden tab, and restarts from rest', async () => {
  const { initFloatingIslandHero, TIMING } = await loadHero();
  const h = fakeHero();
  initFloatingIslandHero(h.root, { view: h.view });
  assert.equal(h.timers.size, 0, 'nothing runs before it is on screen');
  h.intersect(true);
  h.advance(TIMING.rest + TIMING.approach);
  h.intersect(false);
  assert.equal(h.timers.size, 0);
  h.intersect(true);
  assert.equal(h.root.dataset.state, 'hidden');
  h.setVisibility('hidden');
  assert.equal(h.timers.size, 0);
  h.setVisibility('visible');
  assert.equal(h.timers.size, 1);
  h.advance(TIMING.rest);
  assert.ok(h.pointerY() <= 2);
});

test('stop() ends the loop and lets go of the window', async () => {
  const { initFloatingIslandHero } = await loadHero();
  const h = fakeHero();
  const hero = initFloatingIslandHero(h.root, { view: h.view });
  h.intersect(true);
  hero.stop();
  assert.equal(h.timers.size, 0);
  h.fire('focusin');
  assert.equal(h.root.dataset.state, 'hidden');
});

test('the homepage starts the peek', () => {
  const home = read('site/src/scripts/home.js');
  assert.match(home, /import \{ initFloatingIslandHero \} from "\.\/floating-island-hero\.js";/);
  assert.match(home, /initFloatingIslandHero\(document\.querySelector\("\[data-float-window\]"\), \{ view \}\);/);
});
