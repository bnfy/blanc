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
  // the one Start Page with its widgets (v1.51.0).
  const tools = home.slice(home.indexOf('id="tools"'), home.indexOf('id="compare"'));
  assert.match(tools, /<GlanceDemo compact \/>/);
  assert.match(tools, /<article class="tool-card tool-card-wide rise">\s*<div class="tool-media tool-demo"><GestureDemo compact \/>/);
  assert.match(tools, /src="\/feature-captures\/start-widgets-v1\.51\.0\.webp"/);
  assert.doesNotMatch(tools, /Ledger|Billboard|Shelf|Tally|data-layouts/);
  const script = read('site/src/scripts/home.js');
  for (const call of ['initHorizonShield', 'initGlanceDemo', 'initGestureDemo']) assert.ok(script.includes(call), call);
  // The compact demos drop their own headings, tool switch and Replay.
  const glance = read('site/src/components/GlanceDemo.astro');
  assert.match(glance, /\{!compact && <h3 id="glance-title">/);
  assert.match(glance, /<p class="sr-only" id="glance-hint">Drag the card’s header to move it\./);
  // Since v1.40.0 Glance is a card over the page: the app's own card and
  // header (GlanceCard.astro, from index.html and styles.css), no divider.
  assert.match(glance, /<GlanceCard host="louisiana\.dk"/);
  assert.doesNotMatch(glance, /glance-divider|glance-reference/);
  assert.match(read('site/src/components/GlanceCard.astro'), /nativeGlanceCardArt\(\{ styles, document, renderer, host, icon \}\)/);
  // Every drawn Island and coded illustration uses the app's interface text
  // since #840: Instrument Sans at width 98 and +0.01em.
  assert.match(read('site/src/components/GlanceIsland.astro'), /:host \{[^}]*font-family:var\(--font-text\);[^}]*letter-spacing:var\(--text-tracking\);/);
  assert.match(css, /\.tool-illustration \{[^}]*font-family: "Instrument Sans", var\(--font-ui\);\s*font-variation-settings: "wdth" 98;\s*letter-spacing: 0\.01em;/);
  // The app's Spaces list contains its overscroll; the demo's copy must let
  // a page scroll through, or wheeling over the (scaled-up) menu sticks.
  assert.match(read('site/src/components/SpacesDemo.astro'), /#workspaceSwitcherList \{overflow:visible; overscroll-behavior:auto;\}/);
  const gestures = read('site/src/components/GestureDemo.astro');
  assert.match(gestures, /\{!compact && <button class="gesture-replay"/);
  assert.match(gestures, /\{!compact && <p class="gesture-setup">/);
});

test('the tools grid carries a wide Bangs card after 1Password that links to /bangs', () => {
  const tools = home.slice(home.indexOf('id="tools"'), home.indexOf('id="compare"'));
  const at = tools.indexOf('<h3>Bangs</h3>');
  assert.ok(at > tools.indexOf('<h3>1Password</h3>') && at < tools.indexOf('<h3>Mouse gestures</h3>'), 'Bangs sits between 1Password and Mouse gestures');
  const card = tools.slice(tools.lastIndexOf('<article', at), tools.indexOf('</article>', at));
  assert.match(card, /^<article class="tool-card tool-card-wide rise">\s*<div class="tool-media tool-illustration bang-scene" role="img" aria-label="[^"]+">/);
  // The drawing keeps .tool-illustration's Instrument Sans, and the selected
  // row's code sits in the app's chip.
  assert.doesNotMatch(css, /\.bang-scene \{[^}]*font-family/);
  assert.match(css, /\.bang-row b \{[^}]*border-radius: 6px;[^}]*background: color-mix\(in srgb, var\(--ink\) 12%, transparent\);/);
  assert.match(card, /<h3>Bangs<\/h3>\s*<p>Type a site’s code before your search, like <kbd class="bang-chip">!yt lofi<\/kbd>, to go straight to its results\.<\/p>\s*<p class="tool-limit">Works with any search engine\.<\/p>\s*<a class="more-link" href="\/bangs">How bangs work <span aria-hidden="true">›<\/span><\/a>/);
});

test('the homepage no longer has the time-of-day MacBook section', () => {
  // The owner removed it on November 23, 2026; its sentences moved to the
  // ledgers' supersededClaims. The Start Page tool card and the Features page
  // still show the wallpaper.
  assert.doesNotMatch(home, /id="wallpaper"|class="device"|from dawn to night/);
  assert.doesNotMatch(css, /\.device(-|\b)|--device|@keyframes (phase-|screen-tint|home-device|home-screen)/);
  assert.match(home, /<a class="more-link" href="\/features\/start-page">Start Page widgets and wallpaper/);
});

function glanceFixture() {
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
    '#glance-viewport': element(),
    '#glance-card': element(),
    '#glance-handle': element(),
    '#glance-status': element(),
  };
  const demo = { querySelector: selector => nodes[selector] || null };
  const view = {
    matchMedia: () => ({ matches: false }),
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } },
  };
  return { demo, view, nodes };
}

const cardAt = (nodes) => {
  const props = nodes['#glance-card'].style.props;
  return { x: parseFloat(props['--card-x']), y: parseFloat(props['--card-y']), width: parseFloat(props['--card-w']), height: parseFloat(props['--card-h']) };
};

test('the Glance demo opens the card where the app does and moves it by its header', async () => {
  const { initGlanceDemo, START } = await import(pathToFileURL(path.join(root, 'site/src/scripts/glance-demo.js')));
  const { demo, view, nodes } = glanceFixture();
  initGlanceDemo(demo, { view });
  // The app's first-open frame: 80% of the page area, centered, 16 px below the band.
  assert.deepEqual(cardAt(nodes), { x: 96, y: 68, width: 768, height: 420 });
  assert.deepEqual({ ...START }, cardAt(nodes));
  assert.equal(nodes['#glance-viewport'].style.props['--glance-scale'], '1');
  const handle = nodes['#glance-handle'];
  handle.events.pointerdown({ button: 0, pointerId: 1, clientX: 400, clientY: 90, preventDefault() {} });
  assert.ok(nodes['#glance-window'].classList.set.has('is-dragging'));
  handle.events.pointermove({ pointerId: 1, clientX: 340, clientY: 110 });
  assert.deepEqual(cardAt(nodes), { x: 36, y: 88, width: 768, height: 420 });
  handle.events.pointerup({ pointerId: 1 });
  assert.ok(!nodes['#glance-window'].classList.set.has('is-dragging'));
  // A later move from another pointer is ignored.
  handle.events.pointermove({ pointerId: 2, clientX: 0, clientY: 0 });
  assert.deepEqual(cardAt(nodes), { x: 36, y: 88, width: 768, height: 420 });
});

test('the Glance demo keeps the card inside the page area, as the app does', async () => {
  const { initGlanceDemo } = await import(pathToFileURL(path.join(root, 'site/src/scripts/glance-demo.js')));
  const { demo, view, nodes } = glanceFixture();
  initGlanceDemo(demo, { view });
  const handle = nodes['#glance-handle'];
  handle.events.pointerdown({ button: 0, pointerId: 1, clientX: 400, clientY: 90, preventDefault() {} });
  handle.events.pointermove({ pointerId: 1, clientX: -2000, clientY: -2000 });
  assert.deepEqual(cardAt(nodes), { x: 0, y: 52, width: 768, height: 420 }, 'never above the Island band or past the left edge');
  handle.events.pointermove({ pointerId: 1, clientX: 4000, clientY: 4000 });
  assert.deepEqual(cardAt(nodes), { x: 192, y: 100, width: 768, height: 420 }, 'never past the window’s right or bottom edge');
});

test('the Glance demo moves 16 px per arrow key (64 with Shift) and Enter or a double-click puts it back', async () => {
  const { initGlanceDemo } = await import(pathToFileURL(path.join(root, 'site/src/scripts/glance-demo.js')));
  const { demo, view, nodes } = glanceFixture();
  initGlanceDemo(demo, { view });
  const key = (name, shiftKey = false) => nodes['#glance-handle'].events.keydown({ key: name, shiftKey, preventDefault() {} });
  key('ArrowRight');
  assert.equal(cardAt(nodes).x, 112);
  key('ArrowLeft', true);
  assert.equal(cardAt(nodes).x, 48);
  assert.equal(nodes['#glance-status'].textContent, 'Glance card moved.');
  key('Enter');
  assert.deepEqual(cardAt(nodes), { x: 96, y: 68, width: 768, height: 420 });
  key('ArrowDown');
  nodes['#glance-handle'].events.dblclick();
  assert.deepEqual(cardAt(nodes), { x: 96, y: 68, width: 768, height: 420 });
  assert.equal(nodes['#glance-status'].textContent, 'Glance card put back.');
});

test('homepage titles are phrases without a closing period; section headlines keep theirs', () => {
  // Card, step and privacy titles, the switching steps' data titles and the
  // Island stage's lead-ins end without a period (owner, October 16, 2026).
  for (const [, title] of home.matchAll(/<h3\b[^>]*>([^<]+)<\/h3>/g)) assert.doesNotMatch(title.trim(), /\.$/, title);
  for (const [, title] of home.matchAll(/title: "([^"]+)"/g)) assert.doesNotMatch(title, /\.$/, title);
  const pin = home.split('id="island"')[1].split('</section>')[0];
  for (const [, lead] of pin.matchAll(/<strong>([^<]+)<\/strong>/g)) assert.doesNotMatch(lead, /\.$/, lead);
  assert.match(css, /\.pin-media figcaption strong \{\s*display: block;/);
  assert.match(home, /<h1 id="opening-title">A little less browser\.<\/h1>/);
  // The first screen: the floating Island window below Download.
  assert.match(home, /<FloatingIslandWindow \/>/);
});
