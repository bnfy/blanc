const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const element = (extras = {}) => ({
  events: {}, attributes: {}, dataset: {}, hidden: true, animations: [],
  addEventListener(name, callback) { this.events[name] = callback; },
  setAttribute(name, value) { this.attributes[name] = value; },
  animate() {
    const animation = { cancelled: false, cancel() { this.cancelled = true; } };
    this.animations.push(animation);
    return animation;
  },
  ...extras,
});
async function fixture({ reduced = false } = {}) {
  const { initGestureDemo } = await import(pathToFileURL(path.resolve(__dirname, '../../site/src/scripts/gesture-demo.js')));
  const nodes = Object.fromEntries([
    '.gesture-demo', '.gesture-visual', '.gesture-replay', '.gesture-cursor',
    '.gesture-trail', '.gesture-trail-halo', '.gesture-origin', '.gesture-controls',
    '[data-gesture-status]', '[data-gesture-title]', '[data-gesture-direction]', '[data-gesture-description]',
  ].map(key => [key, element()]));
  const choices = ['back', 'forward', 'new'].map(id => element({ dataset: { gesturePreview: id } }));
  const root = { querySelector: key => nodes[key], querySelectorAll: () => choices };
  const motion = element({ matches: reduced });
  const document = element({ hidden: false });
  const timers = new Map();
  let nextId = 0;
  let intersect;
  const view = element({ document, matchMedia: () => motion,
    setTimeout(callback) { timers.set(++nextId, callback); return nextId; },
    clearTimeout(id) { timers.delete(id); },
    IntersectionObserver: class {
      constructor(callback) { intersect = callback; }
      observe() {}
      disconnect() {}
    },
  });
  initGestureDemo(root, { view });
  return { nodes, choices, timers, motion, document,
    enter(visible) { intersect([{ isIntersecting: visible }]); },
    finish() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
  };
}

test('gesture demo shows the navigation result after release and introduces itself only once', async () => {
  const p = await fixture();
  assert.equal(p.timers.size, 0);
  p.enter(true);
  assert.equal(p.nodes['.gesture-demo'].dataset.page, 'nasa');
  assert.equal(p.nodes['.gesture-demo'].dataset.phase, 'drawing');
  p.finish();
  assert.equal(p.nodes['.gesture-demo'].dataset.page, 'start');
  assert.equal(p.nodes['.gesture-demo'].dataset.phase, 'result');
  assert.equal(p.nodes['[data-gesture-status]'].textContent, '');
  p.enter(false); p.enter(true);
  assert.equal(p.timers.size, 0);
  p.choices[1].events.click();
  assert.equal(p.nodes['.gesture-demo'].dataset.page, 'start');
  p.finish();
  assert.equal(p.nodes['.gesture-demo'].dataset.page, 'nasa');
  assert.match(p.nodes['[data-gesture-status]'].textContent, /right.*forward/);
  p.choices[2].events.click(); p.finish();
  assert.equal(p.nodes['.gesture-demo'].dataset.page, 'start');
  assert.match(p.nodes['[data-gesture-status]'].textContent, /up.*new tab/);
});

test('changing gestures cancels earlier motion and ignores a stale completion', async () => {
  const p = await fixture(); p.enter(true);
  const stale = [...p.timers.values()][0];
  const oldAnimation = p.nodes['.gesture-cursor'].animations[0];
  p.choices[1].events.click();
  assert.equal(oldAnimation.cancelled, true);
  stale();
  assert.equal(p.nodes['.gesture-demo'].dataset.phase, 'drawing');
  assert.equal(p.nodes['.gesture-demo'].dataset.gesture, 'forward');
  p.finish();
  assert.equal(p.choices[1].attributes['aria-pressed'], 'true');
  assert.equal(p.choices[0].attributes['aria-pressed'], 'false');
  p.nodes['.gesture-replay'].events.click();
  assert.equal(p.nodes['.gesture-demo'].dataset.page, 'start');
  assert.equal(p.timers.size, 1);
});

test('reduced motion renders every outcome without animation, including replay', async () => {
  const p = await fixture({ reduced: true }); p.enter(true);
  p.choices[1].events.click(); p.nodes['.gesture-replay'].events.click();
  assert.equal(p.nodes['.gesture-demo'].dataset.page, 'nasa');
  assert.equal(p.nodes['.gesture-demo'].dataset.phase, 'result');
  assert.equal(p.nodes['.gesture-cursor'].animations.length, 0);
  assert.equal(p.timers.size, 0);
  assert.match(p.nodes['[data-gesture-status]'].textContent, /right.*forward/);
});

test('offscreen, hidden-document and reduced-motion changes cancel running work', async () => {
  const p = await fixture(); p.enter(true); p.enter(false);
  assert.equal(p.timers.size, 0);
  assert.equal(p.nodes['.gesture-cursor'].animations[0].cancelled, true);
  p.choices[1].events.click(); p.document.hidden = true; p.document.events.visibilitychange();
  assert.equal(p.timers.size, 0);
  assert.equal(p.nodes['.gesture-demo'].dataset.page, 'nasa');
  p.document.hidden = false; p.choices[2].events.click();
  p.motion.matches = true; p.motion.events.change();
  assert.equal(p.timers.size, 0);
  assert.equal(p.nodes['.gesture-demo'].dataset.page, 'start');
});
