'use strict';

// Clicking the resting pill expands the island in place ('panel' mode). The
// pill and the panel live in different views, painted by different renderer
// processes. Screen recordings of real clicks showed the island gone for two
// to four frames on every click (pill already hidden, panel still fading in
// from transparent), and, when the overlay was briefly starved of frames, the
// panel freezing and then jumping most of the way to full size. These tests
// run the shipped handlers, lifted from the source, against fakes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const styles = read('src/renderer/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
const renderer = read('src/renderer/renderer.js');
const overlay = read('src/renderer/overlay.js');
const main = read('src/main/main.js');

/** Source between two markers; fails rather than lifting nothing. */
function lift(source, start, end, label) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from > 0 && to > from, `${label} not found in the source`);
  return source.slice(from, to + end.length);
}

function rulesFor(predicate) {
  const rules = [];
  for (const [, selectors, body] of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const list = selectors.split(',').map((s) => s.trim());
    if (list.some(predicate)) rules.push({ selectors: list, body });
  }
  return rules;
}

function fakeClassList() {
  const set = new Set();
  return {
    set,
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n)),
    toggle: (name, on) => (on ? set.add(name) : set.delete(name)),
    contains: (name) => set.has(name),
  };
}

function frameQueue() {
  let nextId = 1;
  const pending = [];
  return {
    request: (fn) => { const id = nextId++; pending.push({ id, fn }); return id; },
    cancel: (id) => { const i = pending.findIndex((f) => f.id === id); if (i >= 0) pending.splice(i, 1); },
    /** Run every callback queued for the next frame at time `now`. */
    tick(now) { const due = pending.splice(0); due.forEach((f) => f.fn(now)); return due.length; },
    get size() { return pending.length; },
  };
}

// --- Strip: the pill hides only when main reports the panel drawn over it ---

const UNCOVER = "if (mode !== 'panel') islandPill.classList.remove('covered');";

function stripCover() {
  const block = lift(renderer, '  window.browserAPI.onIslandCovered(', '\n  });\n', 'onIslandCovered handler');
  const handler = lift(renderer, '  window.browserAPI.onIslandState(', '\n  });\n', 'onIslandState handler');
  assert.ok(handler.includes(UNCOVER), 'onIslandState uncovers the pill for every other mode');
  const classList = fakeClassList();
  let covered = null;
  const sandbox = {
    islandPill: { classList },
    window: { browserAPI: { onIslandCovered: (fn) => { covered = fn; } } },
  };
  const api = vm.runInNewContext(`let islandMode = null;\n${block}
    ({ state: (mode) => { islandMode = mode; ${UNCOVER} } });`, sandbox);
  assert.equal(typeof covered, 'function', 'lifted block did not subscribe to onIslandCovered');
  return { ...api, covered: () => covered(), hidden: () => classList.contains('covered') };
}

test('the pill stays visible until the panel is reported drawn over it', () => {
  const pill = stripCover();
  pill.state('panel');
  assert.equal(pill.hidden(), false, 'island-state alone must not hide the pill');
  pill.covered();
  assert.equal(pill.hidden(), true);
  pill.state('panel'); // main re-sends the same mode (e.g. after a popup teardown)
  assert.equal(pill.hidden(), true, 'a repeated panel state keeps it covered');
  pill.state(null);
  assert.equal(pill.hidden(), false, 'closing uncovers at once');
  pill.covered(); // late report after the island closed
  assert.equal(pill.hidden(), false, 'a late report cannot hide a resting pill');
  pill.state('palette');
  pill.covered();
  assert.equal(pill.hidden(), false, 'the palette never covers the pill');
  pill.state('panel');
  assert.equal(pill.hidden(), false, 'each opening waits for its own report');
});

test('expanding rests the pill\'s proximity, and the covered class hides it', () => {
  const handler = lift(renderer, '  window.browserAPI.onIslandState(', '\n  });\n', 'onIslandState handler');
  assert.match(handler, /if \(mode === 'panel' \|\| mode === 'palette'\) restIsland\(\);/);
  assert.ok(rulesFor((s) => s === '#islandPill.covered').some((rule) => /visibility\s*:\s*hidden/.test(rule.body)));
});

test('restIsland drops a swollen pill to rest in the same frame', () => {
  const block = lift(renderer, '  const ISLAND_EASE_MS = ', '\n  });\n})();', 'proximity block');
  const props = new Map();
  const classes = fakeClassList();
  const frames = frameQueue();
  let send = null;
  let now = 1000;
  const sandbox = {
    islandPill: {
      style: { setProperty: (n, v) => props.set(n, v), getPropertyValue: (n) => props.get(n) ?? '' },
      classList: classes,
    },
    window: { matchMedia: () => ({ matches: false }), browserAPI: { onIslandProximity: (fn) => { send = fn; } } },
    requestAnimationFrame: frames.request,
    cancelAnimationFrame: frames.cancel,
    performance: { now: () => now },
    Math, Number, String,
  };
  const restIsland = vm.runInNewContext(`${block.slice(0, -'\n})();'.length)}\nrestIsland`, sandbox);
  send({ k: 1 });
  for (let i = 0; i < 60 && frames.size; i += 1) frames.tick((now += 8));
  assert.equal(Number(props.get('--island-k')), 1, 'positive control: the pill swelled');
  assert.ok(classes.contains('proximity-active'));
  restIsland();
  assert.equal(Number(props.get('--island-k')), 0);
  assert.equal(classes.contains('proximity-active'), false);
  assert.equal(frames.size, 0, 'no easing left to run');
});

// --- Overlay: stepped expand and the drawn report ---------------------------

function overlayMorph({ reducedMotion = false } = {}) {
  const block = lift(overlay, '  const MORPH_MS = ', '\n  const prefersReducedMotion = () =>', 'morph block')
    .replace(/\n  const prefersReducedMotion = \(\) =>$/, '');
  const clear = lift(overlay, '  function clearMorphStyles() {', '\n  }\n', 'clearMorphStyles');
  assert.ok(block.includes('function morphEase('), 'the easing curve is inside the lifted block');
  const frames = frameQueue();
  const props = new Map();
  const classList = fakeClassList();
  const style = {
    width: '', height: '', borderRadius: '',
    setProperty: (n, v) => props.set(n, v),
    removeProperty: (n) => props.delete(n),
  };
  const reports = [];
  const sandbox = {
    islandPanel: {
      classList,
      style,
      getBoundingClientRect: () => ({ left: 100, top: 12, width: 620, height: 400 }),
    },
    window: { browserAPI: { reportPanelDrawn: () => reports.push('drawn') } },
    prefersReducedMotion: () => reducedMotion,
    requestAnimationFrame: frames.request,
    cancelAnimationFrame: frames.cancel,
    setTimeout, clearTimeout, Math, Number,
  };
  const api = vm.runInNewContext(`let mode = 'panel';\n${block}\n${clear}
    ({ morphPanelFromPill, reportPanelDrawn, clearMorphStyles, MORPH_MS, MORPH_MAX_STEP_MS,
       setMode: (m) => { mode = m; }, hide: () => { drawnGeneration += 1; } });`, sandbox);
  for (const name of ['morphPanelFromPill', 'reportPanelDrawn', 'clearMorphStyles']) {
    assert.equal(typeof api[name], 'function', `${name} was not lifted`);
  }
  return {
    ...api,
    frames,
    reports,
    width: () => parseFloat(style.width) || null,
    classes: classList,
  };
}

const PILL = { x: 120, y: 12, width: 580, height: 44 };

test('the expand starts on the pill, steps every frame, and hands the box back', () => {
  const m = overlayMorph();
  m.morphPanelFromPill(PILL);
  assert.equal(m.width(), 580, 'starts at the pill width');
  assert.ok(m.classes.contains('morph-start'));
  let now = 0;
  m.frames.tick((now += 8));
  m.frames.tick((now += 8)); // second frame leaves the start state
  assert.ok(m.classes.contains('morph-run'));
  const widths = [];
  for (let i = 0; i < 100 && m.frames.size; i += 1) {
    m.frames.tick((now += 8));
    if (m.width() !== null) widths.push(m.width());
  }
  assert.ok(widths.length >= 30, `stepped over many frames (got ${widths.length})`);
  for (let i = 1; i < widths.length; i += 1) assert.ok(widths[i] >= widths[i - 1], 'never shrinks');
  assert.equal(m.width(), null, 'inline size cleared at the end');
  assert.equal(m.classes.contains('morph-run'), false);
});

test('a stalled frame pauses the expand instead of jumping ahead', () => {
  const m = overlayMorph();
  m.morphPanelFromPill(PILL);
  let now = 0;
  m.frames.tick((now += 8));
  m.frames.tick((now += 8));
  for (let i = 0; i < 6; i += 1) m.frames.tick((now += 8));
  const before = m.width();
  m.frames.tick((now += 400)); // the overlay got no frame for 400 ms
  const after = m.width();
  assert.ok(after < 620, `a 400 ms gap must not finish a ${m.MORPH_MS} ms expand (width ${after})`);
  // Positive control: the same gap with no cap would have reached full width.
  assert.ok(400 > m.MORPH_MS && m.MORPH_MAX_STEP_MS < 400);
  const capped = m.MORPH_MAX_STEP_MS / m.MORPH_MS;
  assert.ok((after - before) / (620 - 580) <= capped + 0.35, 'advanced by at most one capped step');
});

test('the panel reports itself drawn two frames after opening, and never after closing', () => {
  const m = overlayMorph();
  m.reportPanelDrawn();
  m.frames.tick(8);
  assert.deepEqual(m.reports, [], 'not before the start frame has been produced');
  m.frames.tick(16);
  assert.deepEqual(m.reports, ['drawn']);

  const closed = overlayMorph();
  closed.reportPanelDrawn();
  closed.frames.tick(8);
  closed.hide();
  closed.frames.tick(16);
  assert.deepEqual(closed.reports, [], 'a close in between cancels the report');

  const palette = overlayMorph();
  palette.setMode('palette');
  palette.reportPanelDrawn();
  palette.frames.tick(8);
  palette.frames.tick(16);
  assert.deepEqual(palette.reports, [], 'the palette keeps its pill and does not report');
});

test('the panel box is opaque from its first frame; only its contents fade in', () => {
  const isBox = (s) => /^#islandPanel\.morph-(start|run)$/.test(s);
  const boxRules = rulesFor(isBox);
  assert.ok(boxRules.length >= 1, 'found the morph-start / morph-run rule');
  for (const rule of boxRules) {
    assert.doesNotMatch(rule.body, /(^|[;\s])opacity\s*:/, `${rule.selectors.join(', ')} must not fade the panel box`);
    assert.doesNotMatch(rule.body, /transition\s*:[^;]*\b(width|height)\b/, 'the expand is stepped in JS, not transitioned');
  }
  const contents = rulesFor((s) => s === '#islandPanel.morph-start > *');
  assert.ok(contents.some((rule) => /opacity\s*:\s*0\b/.test(rule.body)), 'contents still start hidden');
});

test('main forwards the drawn report only for the overlay\'s open panel, and re-reads proximity on close', () => {
  const handler = lift(main, "  chromeOn('overlay:panel-drawn', (event) => {", '\n  });\n', 'panel-drawn handler');
  assert.match(handler, /event\.sender !== rt\(\)\.overlayView\?\.webContents\) return;/);
  assert.match(handler, /rt\(\)\.overlayMode !== 'panel'\) return;/);
  assert.match(handler, /send\('chrome:island-covered'\)/);
  const show = lift(main, 'function showOverlay(', '\n}\n', 'showOverlay');
  assert.match(show, /mode === 'panel' \|\| mode === 'palette'\) \{[\s\S]*?cancelPendingIslandProximity\(rt\(\)\);\s*\n\s*if \(rt\(\)\.islandProximity\.k !== 0\) sendIslandProximity\(rt\(\), \{ k: 0 \}\);/);
  const hide = lift(main, 'function hideOverlay(', '\n}\n', 'hideOverlay');
  assert.match(hide, /if \(retracts\) \{[\s\S]*?screen\.getCursorScreenPoint\(\)[\s\S]*?updateIslandProximity\(/);
});
