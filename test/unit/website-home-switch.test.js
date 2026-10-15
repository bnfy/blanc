const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const site = path.resolve(__dirname, '../../site');
const home = fs.readFileSync(path.join(site, 'src/pages/index.astro'), 'utf8');
const load = () => import(pathToFileURL(path.join(site, 'src/scripts/home.js')));

// Just enough of an element for the switchers: attributes, dataset, hidden,
// listeners, and a parent chain for closest().
class Element {
  constructor(attributes = {}, parent = null) {
    this.attributes = { ...attributes };
    this.dataset = {};
    this.hidden = 'hidden' in attributes;
    this.parent = parent;
    this.listeners = {};
    this.children = [];
    parent?.children.push(this);
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type) { (this.listeners[type] || []).forEach(listener => listener({ type })); }
  click() { this.dispatch('click'); }
  closest(selector) {
    for (let node = this; node; node = node.parent) if (node.attributes.class === selector.slice(1)) return node;
    return null;
  }
  querySelectorAll(selector) { return selector === 'button' ? this.children.filter(child => child.tag === 'button') : []; }
}

function fixture() {
  const section = new Element({ class: 'switch' });
  const group = new Element({ hidden: '' }, section);
  const buttons = ['chromium', 'arc', 'safari', 'firefox'].map(id => {
    const button = new Element({}, group);
    button.tag = 'button';
    button.dataset.source = id;
    return button;
  });
  const panels = ['chromium', 'arc', 'safari', 'firefox'].map(id => {
    const panel = new Element({}, section);
    panel.dataset.sourcePanel = id;
    return panel;
  });
  return { section, group, buttons, panels };
}

test('without the script every switching path, system and answer stays in the page', () => {
  // The switchers ship hidden and the script reveals them; the panels never do.
  assert.match(home, /role="group" aria-label="Choose the browser you’re coming from" data-switch-sources hidden>/);
  assert.match(home, /role="group" aria-label="Choose your system" data-switch-systems hidden>/);
  assert.match(home, /<div class="switch-panel" data-source-panel=\{source\.id\}>/);
  assert.match(home, /<div class="default-panel" data-os-panel=\{system\.id\}>/);
  assert.doesNotMatch(home, /data-(source|os)-panel=[^>]*hidden/);
  // Questions are native disclosures, and Expand all only appears with the script.
  assert.match(home, /<details>\s*<summary><h3>\{question\}<\/h3>/);
  assert.match(home, /data-faq-toggle hidden>Expand all</);
});

test('choosing a browser shows only its steps and marks the choice pressed', async () => {
  const { initSwitcher } = await load();
  const f = fixture();
  const select = initSwitcher(f.group, f.panels, 'source', 'chromium');
  assert.equal(f.group.hidden, false);
  assert.equal(f.section.getAttribute('data-enhanced'), '');
  assert.deepEqual(f.panels.map(panel => panel.hidden), [false, true, true, true]);
  f.buttons[1].click();
  assert.deepEqual(f.panels.map(panel => panel.hidden), [true, false, true, true]);
  assert.deepEqual(f.buttons.map(button => button.getAttribute('aria-pressed')), ['false', 'true', 'false', 'false']);
  select('firefox');
  assert.deepEqual(f.panels.map(panel => panel.hidden), [true, true, true, false]);
});

test('the system is read on the page, falls back to macOS, and never mistakes Android for Linux', async () => {
  const { localSystem } = await load();
  assert.equal(localSystem({ userAgentData: { platform: 'Windows' } }), 'win');
  assert.equal(localSystem({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'win');
  assert.equal(localSystem({ platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), 'linux');
  assert.equal(localSystem({ platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 15)' }), 'mac');
  assert.equal(localSystem({ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)' }), 'mac');
  assert.equal(localSystem({}), 'mac');
  // Nothing about the visitor's system leaves the page.
  assert.doesNotMatch(fs.readFileSync(path.join(site, 'src/scripts/home.js'), 'utf8'), /fetch\(|sendBeacon|gtag|XMLHttpRequest/);
});

test('Expand all opens every answer, then reads Collapse all', async () => {
  const { initFaq } = await load();
  const toggle = new Element({ hidden: '' });
  const questions = [0, 1, 2].map(() => Object.assign(new Element(), { open: false }));
  initFaq(toggle, questions);
  assert.equal(toggle.hidden, false);
  assert.equal(toggle.textContent, 'Expand all');
  toggle.click();
  assert.deepEqual(questions.map(item => item.open), [true, true, true]);
  assert.equal(toggle.textContent, 'Collapse all');
  questions[1].open = false;
  questions[1].dispatch('toggle');
  assert.equal(toggle.textContent, 'Expand all');
  toggle.click();
  assert.deepEqual(questions.map(item => item.open), [true, true, true]);
});
