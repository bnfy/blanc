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

async function fixture({ stored = null, blocked = false, reduced = false, systemDark = false, schemeThrows = false } = {}) {
  const { restoreHomeAppearance, initHomeAppearance } = await moduleAt('home-appearance.js');
  const { initWallpaperPreview } = await moduleAt('wallpaper-preview.js');
  // The header toggle ships hidden with a stable label; script reveals it.
  const button = element({ hidden: true });
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
    getElementById: id => ({ 'home-appearance': button, 'hero-time': time, 'hero-daylight-play': play, 'hero-daylight-screen': screen })[id],
  });
  const motion = element({ matches: reduced });
  const scheme = element({ matches: systemDark });
  const frames = [];
  const writes = [];
  const timers = new Map();
  let nextTimer = 0;
  let intersect;
  const view = element({
    requestAnimationFrame: callback => frames.push(callback),
    matchMedia: query => {
      if (!query.includes('prefers-color-scheme')) return motion;
      if (schemeThrows) throw new Error('Media queries unavailable');
      return scheme;
    },
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
  return { document, view, button, play, time, screen, meta, hero, models, scenes, daylight, restored, frames, writes, timers, motion, scheme,
    enter: visible => intersect([{ isIntersecting: visible }]),
    active: () => Object.keys(scenes).filter(key => scenes[key].classList.current),
    advance() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); },
  };
}

test('prepaint restoration accepts only exact saved themes, otherwise follows the system, and stores no default', async () => {
  const cases = [
    [null, false, 'light'], ['light', false, 'light'], ['dark', false, 'dark'], ['DARK', false, 'light'], ['system', false, 'light'], ['', false, 'light'],
    [null, true, 'dark'], ['light', true, 'light'], ['dark', true, 'dark'], ['DARK', true, 'dark'], ['system', true, 'dark'], ['', true, 'dark'],
  ];
  for (const [stored, systemDark, expected] of cases) {
    const p = await fixture({ stored, systemDark });
    assert.equal(p.restored, expected, `${stored} with system ${systemDark ? 'dark' : 'light'}`);
    assert.equal(p.document.documentElement.dataset.homeAppearanceReady, undefined);
    assert.deepEqual(p.writes, []);
    assert.equal(p.button.hidden, false);
    assert.equal(p.meta.attributes.content, expected === 'dark' ? '#1b1a18' : '#ffffff');
    assert.equal(p.button.attributes['aria-pressed'], String(expected === 'dark'));
    // The toggle keeps its stable "Dark mode" name; only aria-pressed changes.
    assert.equal(p.button.attributes['aria-label'], undefined);
    assert.ok(p.models.every(model => model.dataset.appearance === expected));
    assert.equal(p.hero.dataset.appearance, 'light');
    p.frames.forEach(callback => callback());
    assert.equal(p.document.documentElement.dataset.homeAppearanceReady, 'true');
  }
});

test('without a saved choice the page follows live system theme changes without storing them', async () => {
  const p = await fixture();
  assert.equal(p.restored, 'light');
  p.scheme.matches = true; p.scheme.events.change(); await settle();
  assert.equal(p.document.documentElement.dataset.homeAppearance, 'dark');
  assert.equal(p.button.attributes['aria-pressed'], 'true');
  assert.equal(p.meta.attributes.content, '#1b1a18');
  assert.deepEqual(p.active(), ['dawn-dark']);
  p.scheme.matches = false; p.scheme.events.change(); await settle();
  assert.equal(p.document.documentElement.dataset.homeAppearance, 'light');
  assert.deepEqual(p.active(), ['dawn']);
  assert.deepEqual(p.writes, []);
});

test('a saved choice wins over the system theme and its live changes', async () => {
  const p = await fixture({ stored: 'light', systemDark: true });
  assert.equal(p.restored, 'light');
  p.scheme.matches = false; p.scheme.events.change();
  p.scheme.matches = true; p.scheme.events.change(); await settle();
  assert.equal(p.document.documentElement.dataset.homeAppearance, 'light');
  assert.deepEqual(p.active(), ['dawn']);
  assert.deepEqual(p.writes, []);
});

test('after a manual toggle, live system changes no longer move the page', async () => {
  const p = await fixture();
  p.button.events.click(); await settle();
  assert.deepEqual(p.writes, [['blanc-home-appearance', 'dark']]);
  p.scheme.matches = true; p.scheme.events.change();
  p.scheme.matches = false; p.scheme.events.change(); await settle();
  assert.equal(p.document.documentElement.dataset.homeAppearance, 'dark');
  assert.deepEqual(p.active(), ['dawn-dark']);
  // Blocked storage still records the manual choice for the rest of the visit.
  const blocked = await fixture({ blocked: true });
  blocked.button.events.click(); await settle();
  blocked.scheme.matches = false; blocked.scheme.events.change(); await settle();
  assert.equal(blocked.document.documentElement.dataset.homeAppearance, 'dark');
});

test('when the system theme cannot be queried, the page starts light and the toggle still works', async () => {
  const p = await fixture({ schemeThrows: true });
  assert.equal(p.restored, 'light');
  assert.equal(p.button.hidden, false);
  p.button.events.click(); await settle();
  assert.equal(p.document.documentElement.dataset.homeAppearance, 'dark');
  assert.deepEqual(p.writes, [['blanc-home-appearance', 'dark']]);
  assert.deepEqual(p.active(), ['dawn-dark']);
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
