const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.resolve(__dirname, '../../site/src/scripts/tool-demos.js')));

function fixture(hash = '') {
  const panels = { glance: { id: 'glance', hidden: false }, gestures: { id: 'gestures', hidden: false } };
  const button = id => ({
    attributes: { 'aria-controls': id, 'aria-pressed': 'false' }, events: {},
    getAttribute(name) { return this.attributes[name]; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, handler) { this.events[type] = handler; },
  });
  const buttons = [button('glance'), button('gestures')];
  const controls = { hidden: true };
  const root = {
    querySelector: selector => (selector === '[data-tool-switch]' ? controls : null),
    querySelectorAll: selector => (selector === '[data-tool-switch] button' ? buttons : []),
  };
  const document = { getElementById: id => panels[id] };
  return { root, document, view: { location: { hash } }, panels, buttons, controls };
}

test('the switch shows one demo at a time and starts on Glance', async () => {
  const { initToolDemos } = await load();
  const f = fixture();
  initToolDemos(f.root, f);
  assert.equal(f.controls.hidden, false);
  assert.deepEqual([f.panels.glance.hidden, f.panels.gestures.hidden], [false, true]);
  assert.deepEqual(f.buttons.map(b => b.attributes['aria-pressed']), ['true', 'false']);
  f.buttons[1].events.click();
  assert.deepEqual([f.panels.glance.hidden, f.panels.gestures.hidden], [true, false]);
  assert.deepEqual(f.buttons.map(b => b.attributes['aria-pressed']), ['false', 'true']);
});

test('a link to #gestures opens the gestures demo', async () => {
  const { initToolDemos } = await load();
  const f = fixture('#gestures');
  initToolDemos(f.root, f);
  assert.deepEqual([f.panels.glance.hidden, f.panels.gestures.hidden], [true, false]);
});

test('without the script both demos stay visible and the switch stays hidden', () => {
  const home = fs.readFileSync(path.resolve(__dirname, '../../site/src/pages/index.astro'), 'utf8');
  assert.match(home, /<div class="gallery-controls tool-switch" role="group" aria-label="Choose a demo" data-tool-switch hidden>/);
  assert.match(home, /<button type="button" aria-controls="glance" aria-pressed="true">Glance<\/button>/);
  assert.match(home, /<button type="button" aria-controls="gestures" aria-pressed="false">Mouse gestures<\/button>/);
  assert.match(fs.readFileSync(path.resolve(__dirname, '../../site/src/scripts/home.js'), 'utf8'), /initToolDemos\(document\.getElementById\("tools"\)\)/);
});
