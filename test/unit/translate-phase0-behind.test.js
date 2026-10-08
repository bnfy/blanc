'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeBehind, behindVerdict, renderBehindTable } = require('../../bench/translate/lib/behind-report.js');

const EN = Array(10).fill('The tower was built in the city of Paris and it is tall.').join(' ');
const host = (arch = 'x64', platform = 'darwin') => ({ platform, arch, cpuModel: 'cpu', cpuCount: 4, electron: '44.5.1' });

function raw(over = {}) {
  return {
    host: host(),
    mode: 'behind',
    rendererBackgroundingDisabled: false,
    readyMs: 400,
    viewportWords: 260,
    articleWords: 2062,
    viewportMs: {
      foreground: [2000, 2100, 1900, 2200, 2050],
      'after-tab-switch': [2000, 2100, 1950],
      'other-window': [2600, 2700, 2650],
      minimized: [5000, 5100, 4900],
      restored: [2000, 2050, 1980],
    },
    fullColdMs: 9000,
    fullWarmMs: [8000, 8200, 7900, 8100, 8300],
    fullOut: [EN],
    engineStates: { idle: { hasFocus: false, visibility: 'visible' } },
    structure: { order: ['engine', 'page'] },
    interaction: { pageEvents: ['mousedown', 'keydown'], engineEvents: [], engineFocused: false, nativeInputError: null },
    pixels: { tealPixels: 50000, magentaPixels: 0, total: 100000, error: null },
    ax: { engineFound: false, pageFound: true, error: null },
    cpu: [
      { phase: 'engine-idle', engineCpu: 0.2 },
      { phase: 'engine-idle', engineCpu: 0.4 },
      { phase: 'full-warm', engineCpu: 98 },
    ],
    bgRates: [
      { phase: 'bg-noengine', ops: 1000, intervalMs: 1000 },
      { phase: 'bg-noengine', ops: 1010, intervalMs: 1001 },
      { phase: 'engine-idle', ops: 990, intervalMs: 1002 },
      { phase: 'engine-idle', ops: 1000, intervalMs: 1000 },
      { phase: 'full-warm', ops: 600, intervalMs: 1004 },
    ],
    ...over,
  };
}

test('summarizeBehind normalizes medians and derives checks', () => {
  const s = summarizeBehind(raw());
  assert.equal(s.viewportPer250.foreground, 1971); // 2050 * 250 / 260
  assert.equal(s.viewportPer250.minimized, 4808);
  assert.equal(s.fullWarmMedianMs, 8100);
  assert.equal(s.fullPer2000, 7856);
  assert.equal(s.english, true);
  assert.equal(s.engineIdleCpuPct, 0.3);
  assert.deepEqual(s.backgroundTab, {
    opsMedian: { noEngine: 1005, engineIdle: 995, translating: 600 },
    idleRatio: 0.99,
    translatingRatio: 0.597,
    intervalMedianMs: { noEngine: 1000.5, engineIdle: 1001, translating: 1004 },
  });
  assert.deepEqual(s.hidden, {
    pixels: 'not-visible', input: 'not-received', focus: 'not-focused', accessibility: 'not-exposed',
  });
});

test('summarizeBehind marks unmeasurable checks instead of passing them', () => {
  const s = summarizeBehind(raw({
    pixels: { tealPixels: 0, magentaPixels: 0, total: 100000, error: null },
    interaction: { pageEvents: [], engineEvents: [], engineFocused: false, nativeInputError: 'not permitted' },
    ax: { engineFound: false, pageFound: false, error: null },
  }));
  assert.deepEqual(s.hidden, { pixels: 'not-measured', input: 'not-measured', focus: 'not-focused', accessibility: 'not-measured' });
});

test('synthetic Tab keydowns on the page do not count as native input delivery', () => {
  const s = summarizeBehind(raw({
    interaction: { pageEvents: ['focus', 'keydown', 'keydown'], engineEvents: [], engineFocused: false, nativeInputError: null },
  }));
  assert.equal(s.hidden.input, 'not-measured');
});

test('summarizeBehind reports exposure when the engine shows through', () => {
  const s = summarizeBehind(raw({
    pixels: { tealPixels: 40000, magentaPixels: 900, total: 100000, error: null },
    interaction: { pageEvents: ['mousedown'], engineEvents: ['mousedown'], engineFocused: true, nativeInputError: null },
    ax: { engineFound: true, pageFound: true, error: null },
  }));
  assert.deepEqual(s.hidden, { pixels: 'VISIBLE', input: 'RECEIVED', focus: 'FOCUSED', accessibility: 'EXPOSED' });
});

test('behindVerdict passes with margin', () => {
  const v = behindVerdict([summarizeBehind(raw())]);
  assert.equal(v.status, 'pass');
  assert.deepEqual(v.reasons, []);
  assert.deepEqual(v.unmeasured, []);
});

test('behindVerdict treats 9.0–10.0 s as marginal, not a pass', () => {
  const v = behindVerdict([summarizeBehind(raw({ fullWarmMs: [9700, 9800, 9750, 9600, 9900], articleWords: 2000 }))]);
  assert.equal(v.status, 'marginal');
  assert.match(v.reasons[0], /Intel Mac full article 9750 ms per 2,000 words is within 10% of the 10000 ms limit/);
});

test('behindVerdict fails slow full article, slow first viewport, switch, background slowdown, exposure', () => {
  const slow = behindVerdict([summarizeBehind(raw({ fullWarmMs: [12000, 12000, 12000, 12000, 12000], articleWords: 2000 }))]);
  assert.equal(slow.status, 'fail');
  assert.match(slow.reasons[0], /Intel Mac full article 12000 ms per 2,000 words exceeds 10000 ms/);
  const vp = behindVerdict([summarizeBehind(raw({ viewportMs: { ...raw().viewportMs, foreground: [3500, 3500, 3500, 3500, 3500] }, viewportWords: 250 }))]);
  assert.match(vp.reasons[0], /Intel Mac first viewport 3500 ms per 250 words exceeds 3000 ms/);
  const sw = behindVerdict([summarizeBehind(raw({ rendererBackgroundingDisabled: true }))]);
  assert.match(sw.reasons.join(' '), /app-wide renderer-backgrounding switch/);
  const bg = behindVerdict([summarizeBehind(raw({ bgRates: [
    { phase: 'bg-noengine', ops: 1000, intervalMs: 1000 },
    { phase: 'engine-idle', ops: 800, intervalMs: 1000 },
  ] }))]);
  assert.match(bg.reasons.join(' '), /background tab ran at 80% of its no-engine rate while the engine was idle/);
  const exposed = behindVerdict([summarizeBehind(raw({ ax: { engineFound: true, pageFound: true, error: null } }))]);
  assert.match(exposed.reasons.join(' '), /engine accessibility: EXPOSED/);
});

test('behindVerdict lists unmeasured checks and never passes on them', () => {
  const v = behindVerdict([summarizeBehind(raw({ ax: { engineFound: false, pageFound: false, error: 'denied' } }))]);
  assert.equal(v.status, 'incomplete');
  assert.deepEqual(v.unmeasured, ['darwin x64 behind: accessibility']);
});

test('behindVerdict ignores unattached control runs for the gates and requires an Intel behind run', () => {
  const control = summarizeBehind(raw({ mode: 'unattached', fullWarmMs: [20000, 20000, 20000, 20000, 20000] }));
  const v = behindVerdict([control]);
  assert.equal(v.status, 'fail');
  assert.deepEqual(v.reasons, ['No Intel Mac (darwin x64) behind-page result.']);
});

test('renderBehindTable has one row per summary', () => {
  const md = renderBehindTable([summarizeBehind(raw()), summarizeBehind(raw({ mode: 'unattached', host: host('arm64') }))]);
  assert.equal(md.trim().split('\n').length, 4);
  assert.match(md, /darwin x64 \| behind/);
  assert.match(md, /darwin arm64 \| unattached/);
});
