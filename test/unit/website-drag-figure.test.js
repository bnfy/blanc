const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function fixture({ supported = true } = {}) {
  const { initDragFigure } = await import(pathToFileURL(path.resolve(__dirname, '../../site/src/scripts/drag-figure.js')));
  const listeners = {};
  const root = {
    attributes: new Set(),
    toggleAttribute(name, force) { if (force) this.attributes.add(name); else this.attributes.delete(name); },
  };
  const document = { hidden: false, addEventListener: (name, callback) => { listeners[`document:${name}`] = callback; } };
  let intersect;
  let disconnected = false;
  const view = {
    document,
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };
  if (supported) {
    view.IntersectionObserver = class {
      constructor(callback) { intersect = callback; }
      observe(target) { assert.equal(target, root); }
      disconnect() { disconnected = true; }
    };
  }
  initDragFigure(root, { view });
  return { root, document, listeners, intersect: isIntersecting => intersect([{ isIntersecting }]), disconnected: () => disconnected };
}

test('the drag figure runs only while it is on screen and the page is visible', async () => {
  const f = await fixture();
  assert.ok(f.root.attributes.has('data-paused'), 'paused until the observer reports it in view');
  f.intersect(true);
  assert.ok(!f.root.attributes.has('data-paused'));
  f.document.hidden = true;
  f.listeners['document:visibilitychange']();
  assert.ok(f.root.attributes.has('data-paused'), 'paused in a hidden tab');
  f.document.hidden = false;
  f.listeners['document:visibilitychange']();
  assert.ok(!f.root.attributes.has('data-paused'));
  f.intersect(false);
  assert.ok(f.root.attributes.has('data-paused'), 'paused once scrolled away');
  f.listeners.pagehide();
  assert.ok(f.disconnected());
});

test('without IntersectionObserver the figure is left running rather than frozen', async () => {
  const f = await fixture({ supported: false });
  assert.equal(f.root.attributes.size, 0);
});
