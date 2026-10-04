const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const vm = require('node:vm');

const moduleAt = name => import(pathToFileURL(path.resolve(__dirname, '../../site/src/scripts', name)));
const settle = () => new Promise(resolve => setImmediate(resolve));
const element = (extras = {}) => ({
  events: {}, attributes: {}, dataset: {}, textContent: '',
  addEventListener(name, callback) { this.events[name] = callback; },
  setAttribute(name, value) { this.attributes[name] = value; },
  classList: { current: false, toggle(_, value) { this.current = value; } },
  ...extras,
});

async function fixture({ stored = null, blocked = false, reduced = false } = {}) {
  const { restoreHomeAppearance, initHomeAppearance } = await moduleAt('home-appearance.js');
  const { initWallpaperPreview } = await moduleAt('wallpaper-preview.js');
  const label = element();
  const button = element({ querySelector: () => label });
  const playLabel = element();
  const play = element({ querySelector: () => playLabel, contains: target => target === play });
  const time = element({ value: '0' });
  const screen = element();
  const meta = element();
  const hero = element({ localName: 'blanc-native-island', dataset: { appearance: 'light' } });
  const models = [element({ localName: 'blanc-glance-island' }), element({ localName: 'blanc-glance-island' })];
  const phases = ['dawn', 'day', 'dusk', 'night'];
  const scenes = Object.fromEntries(phases.flatMap(phase => [phase, `${phase}-dark`]).map(key => {
    const img = { decode: () => Promise.resolve() };
    return [key, element({ img, querySelector: () => img })];
  }));
  scenes.dawn.classList.current = true;
  const auras = phases.map(aura => element({ dataset: { aura } }));
  const ticks = phases.map(() => element());
  const daylight = element({ dataset: { phase: 'dawn', appearance: 'light' },
    querySelector: selector => scenes[selector.match(/"([^"]+)"/)[1]],
    querySelectorAll: selector => selector === '[data-hero-scene]' ? Object.values(scenes) : selector === '[data-aura]' ? auras : ticks,
  });
  const document = element({ documentElement: element(), hidden: false,
    querySelector: () => meta,
    querySelectorAll: selector => [hero, ...models].filter(model => selector.split(',').map(s => s.trim()).includes(model.localName)),
    getElementById: id => ({ 'hero-appearance': button, 'hero-time': time, 'hero-daylight-play': play, 'hero-daylight-screen': screen })[id],
  });
  const motion = element({ matches: reduced });
  const frames = [];
  const writes = [];
  const timers = new Map();
  let nextTimer = 0;
  let intersect;
  const view = element({
    requestAnimationFrame: callback => frames.push(callback),
    matchMedia: () => motion,
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    IntersectionObserver: class { constructor(callback) { intersect = callback; } observe() {} },
  });
  Object.defineProperty(view, 'localStorage', { get() {
    if (blocked) throw new Error('Storage disabled');
    return { getItem: () => stored, setItem: (key, value) => { writes.push([key, value]); stored = value; } };
  } });
  // Execute the exact self-contained bootstrap shape used by BaseLayout in a
  // separate realm, before the deferred controller has any opportunity to run.
  vm.runInNewContext(`(${restoreHomeAppearance.toString()})(document, window)`, { document, window: view });
  const restored = document.documentElement.dataset.homeAppearance;
  const wallpaper = initWallpaperPreview(daylight, { document, view });
  initHomeAppearance({ document, view, onChange: options => wallpaper.refreshAppearance(options) });
  await settle();
  return { document, view, button, label, play, time, screen, meta, hero, models, scenes, daylight, restored, frames, writes, timers, motion,
    enter: visible => intersect([{ isIntersecting: visible }]),
    active: () => Object.keys(scenes).filter(key => scenes[key].classList.current),
    advance() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); },
  };
}

test('prepaint restoration accepts only the exact dark value and does not store a default', async () => {
  for (const [stored, expected] of [[null, 'light'], ['light', 'light'], ['dark', 'dark'], ['DARK', 'light'], ['system', 'light'], ['', 'light']]) {
    const p = await fixture({ stored });
    assert.equal(p.restored, expected);
    assert.equal(p.document.documentElement.dataset.homeAppearanceReady, undefined);
    assert.deepEqual(p.writes, []);
    assert.equal(p.label.textContent, expected === 'dark' ? 'Dark' : 'Light');
    assert.equal(p.meta.attributes.content, expected === 'dark' ? '#1b1a18' : '#ffffff');
    assert.equal(p.button.attributes['aria-pressed'], String(expected === 'dark'));
    assert.equal(p.button.attributes['aria-label'], `Switch page to ${expected === 'dark' ? 'light' : 'dark'} mode`);
    assert.ok(p.models.every(model => model.dataset.appearance === expected));
    assert.equal(p.hero.dataset.appearance, 'light');
    p.frames.forEach(callback => callback());
    assert.equal(p.document.documentElement.dataset.homeAppearanceReady, 'true');
  }
});

test('explicit changes persist only a theme value; blocked storage still allows toggling', async () => {
  const p = await fixture();
  p.button.events.click(); await settle();
  assert.deepEqual(p.writes, [['blanc-home-appearance', 'dark']]);
  assert.equal((await fixture({ stored: p.writes[0][1] })).restored, 'dark');
  p.button.events.click(); await settle();
  assert.deepEqual(p.writes[1], ['blanc-home-appearance', 'light']);
  const blocked = await fixture({ blocked: true });
  assert.equal(blocked.restored, 'light');
  blocked.button.events.click(); await settle();
  assert.equal(blocked.document.documentElement.dataset.homeAppearance, 'dark');
  assert.deepEqual(blocked.active(), ['dawn-dark']);
});

test('all four phases select real captures in both appearances and preserve phase when toggled', async () => {
  const p = await fixture();
  const phases = ['dawn', 'day', 'dusk', 'night'];
  for (let i = 0; i < phases.length; i++) {
    p.time.value = String(i); p.time.events.input(); await settle();
    assert.deepEqual(p.active(), [phases[i]]);
    p.button.events.click(); await settle();
    assert.deepEqual(p.active(), [`${phases[i]}-dark`]);
    assert.equal(p.hero.dataset.appearance, 'light');
    assert.ok(p.models.every(model => model.dataset.appearance === 'dark'));
    assert.equal(p.time.value, String(i));
    assert.match(p.screen.attributes['aria-label'], new RegExp(`${phases[i]} wallpaper in dark appearance`));
    p.button.events.click(); await settle();
    assert.deepEqual(p.active(), [phases[i]]);
    assert.match(p.screen.attributes['aria-label'], new RegExp(`${phases[i]} wallpaper in light appearance`));
  }
});

test('rapid toggles cannot let a stale image decode override the latest page choice', async () => {
  const p = await fixture();
  let finishDark;
  p.scenes['dawn-dark'].img.decode = () => new Promise(resolve => { finishDark = resolve; });
  p.button.events.click();
  p.button.events.click(); await settle();
  finishDark(); await settle();
  assert.deepEqual(p.active(), ['dawn']);
  assert.equal(p.document.documentElement.dataset.homeAppearance, 'light');
  assert.equal(p.daylight.dataset.appearance, 'light');
  assert.equal(p.button.attributes['aria-pressed'], 'false');
  assert.ok(p.models.every(model => model.dataset.appearance === 'light'));
});

test('a failed theme/phase capture keeps the previous valid image and its accurate description', async () => {
  const p = await fixture();
  p.time.value = '2'; p.time.events.input(); await settle();
  const description = p.screen.attributes['aria-label'];
  p.scenes['dusk-dark'].img.decode = () => Promise.reject(new Error('Image missing'));
  p.button.events.click(); await settle();
  assert.equal(p.document.documentElement.dataset.homeAppearance, 'dark');
  assert.deepEqual(p.active(), ['dusk']);
  assert.equal(p.screen.attributes['aria-label'], description);
  p.scenes['night-dark'].img.decode = () => Promise.reject(new Error('Image missing'));
  p.time.value = '3'; p.time.events.input(); await settle();
  assert.equal(p.time.value, '2');
  assert.equal(p.screen.attributes['aria-label'], description);
  p.scenes['dusk-dark'].img.decode = () => Promise.resolve();
  p.button.events.click(); p.button.events.click(); await settle();
  assert.deepEqual(p.active(), ['dusk-dark']);
});

test('manual appearance changes pause playback and do not restart it on re-entry', async () => {
  const p = await fixture(); p.enter(true);
  assert.equal(p.timers.size, 1);
  p.button.events.click(); await settle();
  assert.equal(p.timers.size, 0);
  assert.equal(p.play.attributes['aria-label'], 'Play the wallpaper day');
  p.enter(false); p.enter(true);
  assert.equal(p.timers.size, 0);
  assert.deepEqual(p.active(), ['dawn-dark']);
});

test('pausing during an autoplay decode prevents a late scene change', async () => {
  const p = await fixture();
  let finish;
  p.scenes.day.img.decode = () => new Promise(resolve => { finish = resolve; });
  p.enter(true); p.advance();
  p.play.events.click(); finish(); await settle();
  assert.deepEqual(p.active(), ['dawn']);
  assert.equal(p.timers.size, 0);
});

test('reduced motion has no autoplay and still selects each theme and phase', async () => {
  const p = await fixture({ reduced: true }); p.enter(true); p.play.events.click();
  p.time.value = '3'; p.time.events.input(); await settle();
  p.button.events.click(); await settle();
  assert.deepEqual(p.active(), ['night-dark']);
  assert.equal(p.timers.size, 0);
  const running = await fixture(); running.enter(true);
  running.motion.matches = true; running.motion.events.change();
  assert.equal(running.timers.size, 0);
});
