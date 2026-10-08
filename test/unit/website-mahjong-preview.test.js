const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const element = (extras = {}) => ({
  events: {}, attributes: {}, hidden: true,
  addEventListener(name, callback) { this.events[name] = callback; },
  setAttribute(name, value) { this.attributes[name] = value; },
  getAttribute(name) { return this.attributes[name] ?? null; },
  ...extras,
});
async function fixture({ reduced = false, rejectPlayback = false } = {}) {
  const { initMahjongPreview } = await import(pathToFileURL(path.resolve(__dirname, '../../site/src/scripts/mahjong-preview.js')));
  let intersect;
  const video = element({
    paused: true, loads: 0, plays: 0,
    load() { this.loads++; this.pause(); },
    play() {
      this.plays++;
      if (rejectPlayback) return Promise.reject(new Error('Autoplay unavailable'));
      this.paused = false; this.events.play?.(); return Promise.resolve();
    },
    pause() { this.paused = true; this.events.pause?.(); },
  });
  Object.defineProperty(video, 'src', {
    set(value) { this.attributes.src = value; },
    get() { return this.attributes.src; },
  });
  const toggle = element();
  const choices = ['peaks', 'butterfly', 'fortress'].map(id => element({ dataset: { mahjongScene: id } }));
  const controls = element({ querySelector: () => toggle, querySelectorAll: () => choices });
  const motion = element({ matches: reduced });
  const document = element({ hidden: false });
  const view = { document, matchMedia: () => motion, IntersectionObserver: class {
    constructor(callback) { intersect = callback; }
    observe() {}
  } };
  const preview = initMahjongPreview(video, controls, { view });
  return { video, controls, choices, toggle, motion, document, preview,
    enter(visible) { intersect([{ isIntersecting: visible }]); } };
}

test('Mahjong video loads on opening, cycles three boards, and stops when closed', async () => {
  const p = await fixture();
  p.enter(true);
  assert.equal(p.video.loads, 0);
  p.preview.show();
  assert.match(p.video.src, /peaks-v1.27.0.mp4$/);
  assert.equal(p.video.paused, false);
  assert.equal(p.controls.hidden, false);
  p.video.events.ended(); assert.match(p.video.src, /butterfly-v1.27.0.mp4$/);
  p.video.events.ended(); assert.match(p.video.src, /fortress-v1.27.0.mp4$/);
  p.video.events.ended(); assert.match(p.video.src, /peaks-v1.27.0.mp4$/);
  p.preview.hide();
  assert.equal(p.video.paused, true);
  assert.equal(p.controls.hidden, true);
  assert.equal(p.video.hidden, true);
});

test('pause survives viewport changes and selecting another board', async () => {
  const p = await fixture(); p.preview.show(); p.enter(true);
  p.enter(false); assert.equal(p.video.paused, true);
  p.enter(true); assert.equal(p.video.paused, false);
  p.toggle.events.click(); assert.equal(p.video.paused, true);
  p.choices[1].events.click(); assert.match(p.video.src, /butterfly/);
  assert.equal(p.choices[1].attributes['aria-pressed'], 'true');
  assert.equal(p.choices[0].attributes['aria-pressed'], 'false');
  p.enter(false); p.enter(true); assert.equal(p.video.paused, true);
  p.toggle.events.click(); assert.equal(p.video.paused, false);
  p.document.hidden = true; p.document.events.visibilitychange();
  assert.equal(p.video.paused, true);
});

test('reduced motion shows a poster until explicit playback and pauses on preference change', async () => {
  const p = await fixture({ reduced: true }); p.preview.show(); p.enter(true);
  assert.equal(p.video.plays, 0); assert.match(p.video.poster, /peaks-v1.27.0.webp$/);
  p.choices[2].events.click(); assert.equal(p.video.plays, 0);
  p.toggle.events.click(); assert.equal(p.video.paused, false);
  p.motion.events.change(); assert.equal(p.video.paused, true);
});

test('blocked autoplay leaves a usable play control and the poster', async () => {
  const p = await fixture({ rejectPlayback: true }); p.preview.show(); p.enter(true);
  await Promise.resolve();
  assert.equal(p.toggle.textContent, 'Play demo');
  assert.equal(p.video.paused, true);
  assert.match(p.video.poster, /peaks/);
});
