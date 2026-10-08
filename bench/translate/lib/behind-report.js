'use strict';

// Pure helpers for the F43 Phase 0 "engine behind the page" round. No Electron
// or DOM imports, so test/unit exercises every gate decision.

const { median, languageCheck } = require('./report.js');

const FULL_LIMIT_MS = 10_000;
const FULL_MARGIN_MS = 9_000; // within 10% of the limit is marginal, not a pass
const VIEWPORT_LIMIT_MS = 3_000;
const BG_IDLE_MIN_RATIO = 0.9;
const MIN_TEAL_PIXELS = 1000; // capture really contains the page
const MAX_MAGENTA_PIXELS = 100; // tolerance for edge anti-aliasing
const INPUT_KINDS = new Set(['mousedown', 'pointerdown', 'keydown', 'wheel']);

const round = (n, places = 0) => (n == null ? null : Math.round(n * 10 ** places) / 10 ** places);
const per = (ms, words, target) => (ms == null ? null : Math.round((ms * target) / words));

function opsMedian(rates, phase) {
  return median(rates.filter((r) => r.phase === phase).map((r) => r.ops));
}
function intervalMedian(rates, phase) {
  return median(rates.filter((r) => r.phase === phase).map((r) => r.intervalMs));
}

function hiddenChecks({ pixels, interaction, ax, engineStates }) {
  let pixelState = 'not-measured';
  if (!pixels.error && pixels.tealPixels >= MIN_TEAL_PIXELS) {
    pixelState = pixels.magentaPixels > MAX_MAGENTA_PIXELS ? 'VISIBLE' : 'not-visible';
  }
  let input = 'not-measured';
  if (interaction.engineEvents.some((k) => INPUT_KINDS.has(k))) input = 'RECEIVED';
  else if (interaction.pageEvents.some((k) => INPUT_KINDS.has(k))) input = 'not-received';
  const focused = interaction.engineFocused
    || interaction.engineEvents.includes('focus')
    || Object.values(engineStates).some((s) => s.hasFocus);
  let accessibility = 'not-measured';
  if (!ax.error && ax.pageFound) accessibility = ax.engineFound ? 'EXPOSED' : 'not-exposed';
  return { pixels: pixelState, input, focus: focused ? 'FOCUSED' : 'not-focused', accessibility };
}

function summarizeBehind(r) {
  const viewportPer250 = Object.fromEntries(
    Object.entries(r.viewportMs).map(([state, ms]) => [state, per(median(ms), r.viewportWords, 250)]),
  );
  const fullWarmMedianMs = Math.round(median(r.fullWarmMs));
  const idleCpu = r.cpu.filter((c) => c.phase === 'engine-idle' && c.engineCpu != null).map((c) => c.engineCpu);
  const ops = {
    noEngine: opsMedian(r.bgRates, 'bg-noengine'),
    engineIdle: opsMedian(r.bgRates, 'engine-idle'),
    translating: opsMedian(r.bgRates, 'full-warm'),
  };
  return {
    host: r.host,
    mode: r.mode,
    rendererBackgroundingDisabled: r.rendererBackgroundingDisabled,
    readyMs: Math.round(r.readyMs),
    viewportWords: r.viewportWords,
    viewportMsSamples: r.viewportMs,
    viewportPer250,
    articleWords: r.articleWords,
    fullColdMs: Math.round(r.fullColdMs),
    fullWarmMsSamples: r.fullWarmMs.map(Math.round),
    fullWarmMedianMs,
    fullPer2000: per(fullWarmMedianMs, r.articleWords, 2000),
    english: languageCheck(r.fullOut).isEnglish,
    engineIdleCpuPct: idleCpu.length ? round(idleCpu.reduce((a, b) => a + b, 0) / idleCpu.length, 1) : null,
    backgroundTab: {
      opsMedian: ops,
      idleRatio: ops.noEngine ? round(ops.engineIdle / ops.noEngine, 3) : null,
      translatingRatio: ops.noEngine && ops.translating != null ? round(ops.translating / ops.noEngine, 3) : null,
      intervalMedianMs: {
        noEngine: intervalMedian(r.bgRates, 'bg-noengine'),
        engineIdle: intervalMedian(r.bgRates, 'engine-idle'),
        translating: intervalMedian(r.bgRates, 'full-warm'),
      },
    },
    engineStates: r.engineStates,
    structure: r.structure,
    hidden: hiddenChecks(r),
    diagnostics: { pixels: r.pixels, ax: r.ax, interaction: r.interaction },
  };
}

function behindVerdict(summaries) {
  const fail = [];
  const marginal = [];
  const unmeasured = [];
  const label = (s) => `${s.host.platform} ${s.host.arch}`;
  for (const s of summaries) {
    if (s.rendererBackgroundingDisabled) fail.push(`${label(s)}: app-wide renderer-backgrounding switch present.`);
  }
  const behind = summaries.filter((s) => s.mode === 'behind' && !s.rendererBackgroundingDisabled);
  for (const s of behind) {
    for (const [key, value] of Object.entries(s.hidden)) {
      if (value === 'not-measured') unmeasured.push(`${label(s)} behind: ${key}`);
      else if (value === value.toUpperCase()) fail.push(`${label(s)} behind: engine ${key}: ${value}.`);
    }
    const ratio = s.backgroundTab.idleRatio;
    if (ratio != null && ratio < BG_IDLE_MIN_RATIO) {
      fail.push(`${label(s)} behind: background tab ran at ${Math.round(ratio * 100)}% of its no-engine rate while the engine was idle.`);
    }
    if (!s.english) fail.push(`${label(s)} behind: output failed the English check.`);
  }
  // Speed failures lead the list: they are the gate this round exists for.
  const speed = [];
  const intel = behind.filter((s) => s.host.platform === 'darwin' && s.host.arch === 'x64');
  if (!intel.length) speed.push('No Intel Mac (darwin x64) behind-page result.');
  for (const s of intel) {
    if (s.fullPer2000 > FULL_LIMIT_MS) speed.push(`Intel Mac full article ${s.fullPer2000} ms per 2,000 words exceeds ${FULL_LIMIT_MS} ms.`);
    else if (s.fullPer2000 > FULL_MARGIN_MS) marginal.push(`Intel Mac full article ${s.fullPer2000} ms per 2,000 words is within 10% of the ${FULL_LIMIT_MS} ms limit.`);
    const vp = s.viewportPer250.foreground;
    if (vp > VIEWPORT_LIMIT_MS) speed.push(`Intel Mac first viewport ${vp} ms per 250 words exceeds ${VIEWPORT_LIMIT_MS} ms.`);
  }
  const failures = [...speed, ...fail];
  let status = 'pass';
  if (failures.length) status = 'fail';
  else if (marginal.length) status = 'marginal';
  else if (unmeasured.length) status = 'incomplete';
  return { status, reasons: [...failures, ...marginal], unmeasured };
}

function renderBehindTable(summaries) {
  const head = '| Host | Mode | CPU | Ready ms | First viewport ms/250: foreground / tab switch / other window / minimized / restored | Full ms/2,000 (median of n) | Engine idle CPU % | Background tab rate: idle / translating | Pixels | Input | Focus | Accessibility | English |';
  const rule = '|' + '---|'.repeat(13);
  const rows = summaries.map((s) => {
    const v = s.viewportPer250;
    const bg = s.backgroundTab;
    const h = s.hidden;
    return `| ${s.host.platform} ${s.host.arch} | ${s.mode}${s.rendererBackgroundingDisabled ? ' (switch!)' : ''} | ${s.host.cpuModel} ×${s.host.cpuCount} | ${s.readyMs} | ${v.foreground} / ${v['after-tab-switch']} / ${v['other-window']} / ${v.minimized} / ${v.restored} | ${s.fullPer2000} (${s.fullWarmMsSamples.length}) | ${s.engineIdleCpuPct} | ${bg.idleRatio} / ${bg.translatingRatio} | ${h.pixels} | ${h.input} | ${h.focus} | ${h.accessibility} | ${s.english ? 'yes' : 'NO'} |`;
  });
  return [head, rule, ...rows].join('\n') + '\n';
}

module.exports = { summarizeBehind, behindVerdict, renderBehindTable };
