'use strict';

// The homepage hero's device tour (site/src/scripts/device-tour.js): Blanc on
// the desktop, iPhone, iPad and iPhone Duo, one at a time.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const loadTour = () => import(pathToFileURL(path.join(root, 'site/src/scripts/device-tour.js')));

const DEVICES = ['desktop', 'iphone', 'ipad', 'duo'];

// A tour, a window and timers advanced by hand.
function fakeTour({ reducedMotion = false, userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints = 0 } = {}) {
  const timers = new Map();
  let nextId = 1, now = 0;
  const listeners = {}, docListeners = {}, observers = [];
  const on = (store) => (type, fn) => { (store[type] ||= []).push(fn); };
  const off = (store) => (type, fn) => { store[type] = (store[type] || []).filter((f) => f !== fn); };
  const element = (extra = {}) => {
    const own = {};
    return { dataset: {}, attrs: {}, listeners: own, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      addEventListener: on(own), removeEventListener: off(own), ...extra };
  };
  let focusedTab = null;
  const tabs = DEVICES.map((device) => {
    const tab = element({ focus() { focusedTab = device; } });
    tab.dataset.deviceTab = device;
    tab.attrs['aria-controls'] = `device-${device}`;
    return tab;
  });
  const panels = Object.fromEntries(DEVICES.map((device) => [`#device-${device}`, element()]));
  const toggle = element({ hidden: true });
  const controls = element({ hidden: true });
  const style = new Map();
  const tour = {
    dataset: {},
    style: { setProperty: (k, v) => style.set(k, v) },
    querySelectorAll: (sel) => (sel === '[role="tab"]' ? tabs : []),
    querySelector: (sel) => panels[sel] || { '[data-device-controls]': controls, '[data-device-toggle]': toggle }[sel] || null,
    contains: () => false,
    addEventListener: on(listeners),
    removeEventListener: off(listeners),
  };
  const view = {
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }),
    IntersectionObserver: class { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} disconnect() {} },
    navigator: { userAgent, maxTouchPoints },
    document: { visibilityState: 'visible', addEventListener: on(docListeners), removeEventListener: off(docListeners) },
  };
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); now = due[1].at; due[1].fn();
    }
    now = end;
  };
  const fire = (target, type, event = {}) => (target.listeners?.[type] || listeners[type] || []).forEach((fn) => fn({ preventDefault() {}, currentTarget: target, ...event }));
  return {
    tour, tabs, panels, toggle, controls, timers, advance, style,
    focusedTab: () => focusedTab,
    fireTour: (type, event = {}) => (listeners[type] || []).forEach((fn) => fn(event)),
    fire,
    intersect: (isIntersecting) => observers.forEach((o) => o.cb([{ isIntersecting }])),
    setVisibility: (state) => { view.document.visibilityState = state; (docListeners.visibilitychange || []).forEach((fn) => fn()); },
    view,
    shown: () => tour.dataset.device,
  };
}

test('the tour shows each device in turn, the desktop for one whole Island loop', async () => {
  const { initDeviceTour, DWELL } = await loadTour();
  const { TIMING } = await import(pathToFileURL(path.join(root, 'site/src/scripts/floating-island-hero.js')));
  assert.ok(DWELL.desktop >= TIMING.rest + TIMING.approach + TIMING.shown + TIMING.leave, 'the desktop slide waits for the Island to float back');
  const t = fakeTour();
  initDeviceTour(t.tour, { view: t.view });
  assert.equal(t.controls.hidden, false, 'the tabs show once the script runs');
  assert.equal(t.timers.size, 0, 'nothing moves before it is on screen');
  t.intersect(true);
  assert.equal(t.shown(), 'desktop');
  assert.equal(t.tour.dataset.running, '');
  t.advance(DWELL.desktop - 1);
  assert.equal(t.shown(), 'desktop');
  t.advance(1);
  assert.equal(t.shown(), 'iphone');
  t.advance(DWELL.other);
  assert.equal(t.shown(), 'ipad');
  t.advance(DWELL.other);
  assert.equal(t.shown(), 'duo');
  t.advance(DWELL.other);
  assert.equal(t.shown(), 'desktop', 'and starts over');
});

test('only the shown slide can be reached; the others are inert', async () => {
  const { initDeviceTour, DWELL } = await loadTour();
  const t = fakeTour();
  initDeviceTour(t.tour, { view: t.view });
  t.intersect(true);
  t.advance(DWELL.desktop);
  for (const device of DEVICES) {
    const panel = t.panels[`#device-${device}`];
    const tab = t.tabs[DEVICES.indexOf(device)];
    const on = device === 'iphone';
    assert.equal(panel.dataset.state, on ? 'on' : 'off', device);
    assert.equal(panel.inert, !on, device);
    assert.equal(tab.attrs['aria-selected'], String(on), device);
    assert.equal(tab.tabIndex, on ? 0 : -1, device);
  }
});

test('reduced motion never moves on, and hides the pause button', async () => {
  const { initDeviceTour } = await loadTour();
  const t = fakeTour({ reducedMotion: true });
  initDeviceTour(t.tour, { view: t.view });
  t.intersect(true);
  assert.equal(t.timers.size, 0);
  assert.equal(t.tour.dataset.running, undefined);
  assert.equal(t.toggle.hidden, true);
  assert.equal(t.shown(), 'desktop');
});

test('picking a tab shows it and holds the tour there until play', async () => {
  const { initDeviceTour, DWELL } = await loadTour();
  const t = fakeTour();
  initDeviceTour(t.tour, { view: t.view });
  t.intersect(true);
  t.fire(t.tabs[2], 'click');
  assert.equal(t.shown(), 'ipad');
  assert.equal(t.timers.size, 0);
  assert.equal(t.toggle.dataset.state, 'paused');
  assert.equal(t.toggle.attrs['aria-label'], 'Play the device tour');
  t.advance(DWELL.desktop * 3);
  assert.equal(t.shown(), 'ipad');
  t.fire(t.toggle, 'click');
  assert.equal(t.toggle.dataset.state, 'playing');
  assert.equal(t.toggle.attrs['aria-label'], 'Pause the device tour');
  t.advance(DWELL.other);
  assert.equal(t.shown(), 'duo', 'play moves on from where it stood');
});

test('the pause button holds the tour', async () => {
  const { initDeviceTour, DWELL } = await loadTour();
  const t = fakeTour();
  initDeviceTour(t.tour, { view: t.view });
  t.intersect(true);
  assert.equal(t.toggle.hidden, false);
  t.fire(t.toggle, 'click');
  t.advance(DWELL.desktop * 2);
  assert.equal(t.shown(), 'desktop');
  assert.equal(t.tour.dataset.running, undefined, 'the tab’s bar stops filling');
});

test('arrow keys, Home and End move between tabs and keep focus on the chosen one', async () => {
  const { initDeviceTour } = await loadTour();
  const t = fakeTour();
  initDeviceTour(t.tour, { view: t.view });
  t.intersect(true);
  t.fire(t.tabs[0], 'keydown', { key: 'ArrowLeft' });
  assert.equal(t.shown(), 'duo', 'wraps to the last');
  assert.equal(t.focusedTab(), 'duo');
  t.fire(t.tabs[3], 'keydown', { key: 'ArrowRight' });
  assert.equal(t.shown(), 'desktop');
  t.fire(t.tabs[0], 'keydown', { key: 'End' });
  assert.equal(t.shown(), 'duo');
  t.fire(t.tabs[3], 'keydown', { key: 'Home' });
  assert.equal(t.shown(), 'desktop');
  t.fire(t.tabs[0], 'keydown', { key: 'a' });
  assert.equal(t.shown(), 'desktop');
  assert.equal(t.timers.size, 0, 'a key choice holds the tour too');
});

test('the visitor’s pointer or focus inside the tour holds it, then lets it go', async () => {
  const { initDeviceTour, DWELL } = await loadTour();
  const t = fakeTour();
  initDeviceTour(t.tour, { view: t.view });
  t.intersect(true);
  t.fireTour('pointerenter', { pointerType: 'mouse' });
  assert.equal(t.timers.size, 0);
  t.advance(DWELL.desktop * 2);
  assert.equal(t.shown(), 'desktop');
  t.fireTour('pointerleave', { pointerType: 'mouse' });
  assert.equal(t.timers.size, 1);
  t.fireTour('focusin');
  assert.equal(t.timers.size, 0);
  t.fireTour('focusout', { relatedTarget: null });
  assert.equal(t.timers.size, 1);
  // A touch passing over doesn't hold it.
  t.fireTour('pointerenter', { pointerType: 'touch' });
  assert.equal(t.timers.size, 1);
});

test('the tour waits while off screen or in a hidden tab', async () => {
  const { initDeviceTour } = await loadTour();
  const t = fakeTour();
  initDeviceTour(t.tour, { view: t.view });
  t.intersect(true);
  t.intersect(false);
  assert.equal(t.timers.size, 0);
  t.intersect(true);
  t.setVisibility('hidden');
  assert.equal(t.timers.size, 0);
  t.setVisibility('visible');
  assert.equal(t.timers.size, 1);
});

test('stop() ends the tour and lets go of the page', async () => {
  const { initDeviceTour } = await loadTour();
  const t = fakeTour();
  const tour = initDeviceTour(t.tour, { view: t.view });
  t.intersect(true);
  tour.stop();
  assert.equal(t.timers.size, 0);
  t.setVisibility('visible');
  assert.equal(t.timers.size, 0);
});

test('on an iPhone or iPad the tour opens on that device', async () => {
  const { firstDevice, initDeviceTour } = await loadTour();
  assert.equal(firstDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)' }), 'iphone');
  assert.equal(firstDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_4 like Mac OS X)' }), 'ipad');
  // iPadOS asks for desktop sites with a Mac user agent; touch gives it away.
  assert.equal(firstDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }), 'ipad');
  assert.equal(firstDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }), 'desktop');
  assert.equal(firstDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)' }), 'desktop');
  const t = fakeTour({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)' });
  initDeviceTour(t.tour, { view: t.view });
  assert.equal(t.shown(), 'iphone');
});

test('the homepage starts the tour, and without script shows only the desktop slide', () => {
  const home = read('site/src/scripts/home.js');
  assert.match(home, /import \{ initDeviceTour \} from "\.\/device-tour\.js";/);
  assert.match(home, /initDeviceTour\(document\.querySelector\("\[data-device-tour\]"\), \{ view \}\);/);
  const page = read('site/src/pages/index.astro');
  const tour = page.slice(page.indexOf('data-device-tour'), page.indexOf('data-device-controls'));
  const panels = [...tour.matchAll(/<div class="tour-panel" id="device-(\w+)"[^>]*>/g)].map((m) => [m[1], m[0]]);
  assert.deepEqual(panels.map(([device]) => device), DEVICES);
  for (const [device, tag] of panels) {
    assert.match(tag, new RegExp(`data-state="${device === 'desktop' ? 'on' : 'off'}"`), device);
    assert.equal(/\binert\b/.test(tag), device !== 'desktop', device);
    assert.match(tag, new RegExp(`aria-labelledby="device-tab-${device}"`), device);
  }
  assert.match(page, /<div class="tour-controls" data-device-controls hidden>/);
  assert.match(read('site/src/styles/home.css'), /\.tour-panel\[data-state="off"\] \{[^}]*visibility: hidden;/);
});

test('the desktop slide is the floating Island window, without its traffic lights', () => {
  const page = read('site/src/pages/index.astro');
  assert.match(page, /<FloatingIslandWindow lights=\{false\} \/>/);
  const window = read('site/src/components/FloatingIslandWindow.astro');
  assert.match(window, /\{showLights && <img class="float-window-lights"/);
});

test('each device image is its 1.1 App Store capture, resized only', async () => {
  const { DEVICE_HERO_IMAGES, outputFile } = await import(pathToFileURL(path.join(root, 'scripts/build-device-hero-images.mjs')));
  const page = read('site/src/pages/index.astro');
  for (const image of DEVICE_HERO_IMAGES) {
    const capture = await sharp(path.join(root, image.capture)).metadata();
    for (const width of image.widths) {
      const file = outputFile(image, width);
      const shown = await sharp(path.join(root, file)).metadata();
      assert.equal(shown.width, width, file);
      assert.ok(Math.abs(shown.height - Math.round((capture.height * width) / capture.width)) <= 1, `${file}: not cropped`);
      assert.ok(page.includes(file.replace('site/public', '')), `${file} is on the page`);
      // The markup's width and height give the browser the capture's shape.
      for (const [, w, h] of page.matchAll(new RegExp(`src="${image.out.replace('site/public', '')}-\\d+\\.webp"[^>]*?width="(\\d+)" height="(\\d+)"`, 'g'))) {
        assert.ok(Math.abs(Number(h) / Number(w) - capture.height / capture.width) < 0.002, `${file}: width and height`);
      }
    }
  }
});
