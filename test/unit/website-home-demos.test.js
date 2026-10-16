const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const home = read('site/src/pages/index.astro');
const css = read('site/src/styles/home.css');

test('the homepage keeps the live demos in the redesign, each working without the script', () => {
  // Spaces: the app's own Island and menu in place of a capture.
  const spaces = home.slice(home.indexOf('id="spaces"'), home.indexOf('id="privacy"'));
  assert.match(spaces, /<div class="spaces-demo">\s*<SpacesDemo \/>/);
  assert.doesNotMatch(spaces, /<img/);
  // Tools: Glance and the gestures in compact cards; the Start Page card shows
  // Billboard until the script reveals the four layouts.
  const tools = home.slice(home.indexOf('id="tools"'), home.indexOf('id="compare"'));
  assert.match(tools, /<GlanceDemo compact \/>/);
  assert.match(tools, /<article class="tool-card tool-card-wide rise">\s*<div class="tool-media tool-demo"><GestureDemo compact \/>/);
  assert.match(tools, /id="layout-image" src="\/feature-captures\/billboard-[^"]+\.webp"/);
  assert.match(tools, /data-layouts hidden>/);
  assert.match(tools, /\["Ledger", "Billboard", "Shelf", "Tally"\]/);
  const script = read('site/src/scripts/home.js');
  for (const call of ['initHorizonShield', 'initGlanceDemo', 'initGestureDemo', 'initLayouts(']) assert.ok(script.includes(call), call);
  // The compact demos drop their own headings, tool switch and Replay.
  const glance = read('site/src/components/GlanceDemo.astro');
  assert.match(glance, /\{!compact && <h3 id="glance-title">/);
  assert.match(glance, /compact \? <p class="sr-only" id="glance-hint">Drag the divider to resize\.<\/p>/);
  const gestures = read('site/src/components/GestureDemo.astro');
  assert.match(gestures, /\{!compact && <button class="gesture-replay"/);
  assert.match(gestures, /\{!compact && <p class="gesture-setup">/);
});

test('the MacBook screen moves from dawn to night only with scroll-driven motion, and says so', () => {
  const device = home.slice(home.indexOf('class="device"'), home.indexOf('id="first-launch"'));
  // A heading and one line say what the screen shows; the phase labels light
  // with the wallpaper and are hidden where it does not move.
  assert.match(device, /<h2 id="wallpaper-title">Your Start Page, from dawn to night\.<\/h2>/);
  assert.match(device, /<div class="device-phases" aria-hidden="true">(<span class="phase-(dawn|day|dusk|night)">[A-Z][a-z]+<\/span>){4}<\/div>/);
  assert.match(css, /\.device-phases \{\s*display: none;/);
  assert.match(device, /src="\/feature-captures\/home-wallpaper-dawn-[^"]+\.webp"/);
  assert.match(device, /\["day", "dusk", "night"\]\.map/);
  assert.match(device, /loading="lazy"/);
  // Without the motion, the later wallpapers stay hidden over dawn.
  assert.match(css, /\.device-screen :is\(\.wallpaper-day, \.wallpaper-dusk, \.wallpaper-night\) \{\s*opacity: 0;/);
  const motion = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference) {\n  @supports (animation-timeline: view())'));
  assert.ok(motion.length > 0, 'scroll-driven motion block found');
  assert.match(motion, /view-timeline: --device block;/);
  assert.match(motion, /overflow: clip;/);
  for (const time of ['day', 'dusk', 'night']) assert.match(motion, new RegExp(`\\.device-screen \\.wallpaper-${time} \\{\\s*animation-range: entry 0% contain 10%, contain \\d+% contain \\d+%;`));
  assert.match(motion, /\.device-stage \{\s*position: sticky;/);
  for (const time of ['dawn', 'day', 'dusk', 'night']) {
    assert.match(motion, new RegExp(`\\.device-phases \\.phase-${time} \\{ animation-name: phase-${time}; \\}`));
    assert.match(css, new RegExp(`@keyframes phase-${time} \\{`));
  }
});

function glanceFixture({ compact = true } = {}) {
  const element = (extra = {}) => ({
    attributes: {}, events: {}, hidden: false, style: { props: {}, setProperty(name, value) { this.props[name] = value; } },
    classList: { set: new Set(), add(n) { this.set.add(n); }, remove(n) { this.set.delete(n); }, toggle(n, on) { if (on) this.set.add(n); else this.set.delete(n); } },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, handler) { this.events[type] = handler; },
    getBoundingClientRect: () => ({ left: 0, width: 960 }),
    focus() {}, setPointerCapture() {}, releasePointerCapture() {},
    ...extra,
  });
  const nodes = {
    '#glance-window': element(),
    '#glance-divider': element(),
    '#glance-viewport': element(),
    '#glance-hint': element(),
    '#glance-status': element(),
  };
  if (!compact) for (const id of ['#glance-swap', '#glance-reset', '#glance-close', '#glance-reopen']) nodes[id] = element();
  const demo = { querySelector: selector => nodes[selector] || null };
  const view = {
    matchMedia: () => ({ matches: false }),
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } },
  };
  return { demo, view, nodes };
}

test('the compact Glance demo resizes from its divider alone, within the app’s limits', async () => {
  const { initGlanceDemo } = await import(pathToFileURL(path.join(root, 'site/src/scripts/glance-demo.js')));
  const { demo, view, nodes } = glanceFixture();
  initGlanceDemo(demo, { view });
  const divider = nodes['#glance-divider'];
  assert.equal(divider.attributes['aria-valuenow'], '62');
  assert.equal(nodes['#glance-viewport'].style.props['--glance-scale'], '1');
  const key = (name, shiftKey = false) => divider.events.keydown({ key: name, shiftKey, preventDefault() {} });
  key('End');
  assert.equal(divider.attributes['aria-valuenow'], '78');
  key('ArrowRight', true);
  assert.equal(divider.attributes['aria-valuenow'], '78');
  key('Home');
  key('ArrowLeft');
  assert.equal(divider.attributes['aria-valuenow'], '50');
  assert.equal(divider.attributes['aria-valuetext'], 'Main page 50 percent, reference 50 percent');
  // A drag follows the pointer across the 960px drawing.
  divider.events.pointerdown({ button: 0, pointerId: 1, clientX: 600, preventDefault() {} });
  assert.equal(divider.attributes['aria-valuenow'], '63');
  assert.ok(nodes['#glance-window'].classList.set.has('is-dragging'));
  divider.events.pointerup({ pointerId: 1 });
  assert.ok(!nodes['#glance-window'].classList.set.has('is-dragging'));
});

test('the full Glance demo still closes and reopens its reference', async () => {
  const { initGlanceDemo } = await import(pathToFileURL(path.join(root, 'site/src/scripts/glance-demo.js')));
  const { demo, view, nodes } = glanceFixture({ compact: false });
  initGlanceDemo(demo, { view });
  nodes['#glance-close'].events.click();
  assert.ok(nodes['#glance-window'].classList.set.has('is-closed'));
  assert.equal(nodes['#glance-reopen'].hidden, false);
  assert.equal(nodes['#glance-status'].textContent, 'Glance view closed.');
  nodes['#glance-reopen'].events.click();
  assert.ok(!nodes['#glance-window'].classList.set.has('is-closed'));
  assert.equal(nodes['#glance-hint'].textContent, 'Drag the divider to resize.');
});
