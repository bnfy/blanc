// bench/translate/lib/report.js
'use strict';

// Pure helpers for the F43 Phase 0 feasibility harness. No Electron or DOM
// imports, so test/unit exercises every number and check in the evidence.

const GATE_MS_PER_2000_WORDS = 10_000;
const MIN_WARM_SAMPLES = 5;
const SETTLE_WINDOW_MS = 2000;
const ACTIVE_PHASES = new Set(['engine', 'cold', 'warm', 'markup']);
const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'wbr', 'meta', 'link', 'source']);
const EN_WORDS = new Set('the and of to in is was that it for with as on by which its this from at are be has were their'.split(' '));
const FR_WORDS = new Set('le la les des du et est une dans que qui pour sur au aux par avec ce sont été un'.split(' '));

function countWords(text) {
  return String(text).split(/\s+/).filter(Boolean).length;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function attrSignature(raw) {
  const attrs = [];
  for (const m of raw.matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs.push(`${m[1].toLowerCase()}=${m[2] ?? m[3] ?? m[4] ?? ''}`);
  }
  return attrs.sort().join(',');
}

function structureSignature(html) {
  let out = '';
  const stack = [];
  for (const m of String(html).matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, rawTag, rawAttrs, selfClosing] = m;
    const tag = rawTag.toLowerCase();
    if (closing) {
      if (stack.pop() !== tag) return '!unbalanced';
      out += ')';
      continue;
    }
    out += `${tag}[${attrSignature(rawAttrs)}](`;
    if (selfClosing || VOID_TAGS.has(tag)) out += ')';
    else stack.push(tag);
  }
  return stack.length ? '!unbalanced' : out;
}

function checkMarkupCase(c, mode, src, out) {
  const required = mode === 'html' ? [...c.protected, ...c.noTranslate] : c.protected;
  return {
    id: c.id,
    mode,
    structureKept: structureSignature(src) === structureSignature(out),
    protectedMissing: required.filter((p) => !out.includes(p)),
  };
}

const round3 = (n) => Math.round(n * 1000) / 1000;

function languageCheck(texts) {
  const words = texts.join(' ').toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœæ']+/g) || [];
  const n = words.length || 1;
  const englishRatio = round3(words.filter((w) => EN_WORDS.has(w)).length / n);
  const frenchRatio = round3(words.filter((w) => FR_WORDS.has(w)).length / n);
  return { words: words.length, englishRatio, frenchRatio, isEnglish: words.length >= 100 && englishRatio >= 0.15 && frenchRatio <= 0.03 };
}

const mb = (kb) => (kb == null ? null : Math.round(kb / 1024));
const diff = (a, b) => (a == null || b == null ? null : a - b);

function phaseMedian(samples, phase, key, windowed = false) {
  let rows = samples.filter((x) => x.phase === phase && x[key] != null);
  if (windowed && rows.length) {
    const last = rows[rows.length - 1].t;
    rows = rows.filter((x) => x.t >= last - SETTLE_WINDOW_MS);
  }
  return mb(median(rows.map((x) => x[key])));
}

function activePeak(samples, key) {
  const values = samples.filter((x) => ACTIVE_PHASES.has(x.phase) && x[key] != null).map((x) => x[key]);
  return values.length ? mb(Math.max(...values)) : null;
}

function memorySummary(samples) {
  const preMB = { main: phaseMedian(samples, 'pre', 'mainKB'), total: phaseMedian(samples, 'pre', 'totalKB') };
  const baselineMB = {
    main: phaseMedian(samples, 'idle', 'mainKB'),
    engine: phaseMedian(samples, 'idle', 'engineKB'),
    total: phaseMedian(samples, 'idle', 'totalKB'),
  };
  const peakMB = { main: activePeak(samples, 'mainKB'), engine: activePeak(samples, 'engineKB'), total: activePeak(samples, 'totalKB') };
  const settledMB = { engine: phaseMedian(samples, 'settle', 'engineKB', true), total: phaseMedian(samples, 'settle', 'totalKB', true) };
  const afterWorkerTerminateMB = {
    engine: phaseMedian(samples, 'worker-terminated', 'engineKB', true),
    total: phaseMedian(samples, 'worker-terminated', 'totalKB', true),
  };
  const afterDestroyMB = { main: phaseMedian(samples, 'destroyed', 'mainKB', true), total: phaseMedian(samples, 'destroyed', 'totalKB', true) };
  const afterRecreateDestroyMB = { main: phaseMedian(samples, 'destroyed-2', 'mainKB', true), total: phaseMedian(samples, 'destroyed-2', 'totalKB', true) };
  return {
    preMB, baselineMB, peakMB, settledMB, afterWorkerTerminateMB, afterDestroyMB, afterRecreateDestroyMB,
    hostWindowPeakMB: (() => {
      const v = samples.filter((x) => x.hostKB != null).map((x) => x.hostKB);
      return v.length ? mb(Math.max(...v)) : null;
    })(),
    deltaMB: {
      enginePeak: diff(peakMB.engine, baselineMB.engine),
      totalPeak: diff(peakMB.total, baselineMB.total),
      totalSettled: diff(settledMB.total, baselineMB.total),
      totalAfterDestroyVsPre: diff(afterDestroyMB.total, preMB.total),
      totalAfterRecreateDestroyVsPre: diff(afterRecreateDestroyMB.total, preMB.total),
    },
  };
}

function markupSummary(full, fixtures) {
  const byId = new Map(fixtures.map((c) => [c.id, c]));
  const cases = full.markup.fixtures.map((r) => ({ ...checkMarkupCase(byId.get(r.id), r.mode, r.src, r.out), src: r.src, out: r.out }));
  const count = (mode) => ({ kept: cases.filter((c) => c.mode === mode && c.structureKept).length, total: cases.filter((c) => c.mode === mode).length });
  const wiki = full.markup.wikipedia.map((r) => structureSignature(r.src) === structureSignature(r.out));
  return {
    cases,
    wikipediaKept: wiki,
    counts: {
      html: count('html'),
      markers: count('markers'),
      wikipedia: { kept: wiki.filter(Boolean).length, total: wiki.length },
      protectedFailures: cases.filter((c) => c.protectedMissing.length).length,
    },
  };
}

const roundTiming = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)]));

function summarize({ host, sizes, cycles, samples, fixtures }) {
  const [full, short] = cycles;
  const warmMedianMs = Math.round(median(full.warmMs));
  return {
    host,
    sizes,
    timing: roundTiming(full.timing),
    articleWords: full.articleWords,
    coldMs: Math.round(full.coldMs),
    warmMsSamples: full.warmMs.map(Math.round),
    warmMedianMs,
    warmMsPer2000: Math.round((warmMedianMs * 2000) / full.articleWords),
    wordsPerSecWarm: Math.round(full.articleWords / (warmMedianMs / 1000)),
    recreate: { endToEndReadyMs: Math.round(short.timing.endToEndReadyMs), firstTranslateMs: Math.round(short.firstTranslateMs) },
    memory: memorySummary(samples),
    markup: markupSummary(full, fixtures),
    language: languageCheck(full.articleOut),
  };
}

function gateVerdict(summaries) {
  const reasons = [];
  const label = (s) => `${s.host.platform} ${s.host.arch}`;
  for (const s of summaries) {
    if (s.warmMsSamples.length < MIN_WARM_SAMPLES) reasons.push(`${label(s)}: only ${s.warmMsSamples.length} warm samples (need ${MIN_WARM_SAMPLES}).`);
    if (!s.language.isEnglish) reasons.push(`${label(s)}: output failed the English check.`);
  }
  const intel = summaries.filter((s) => s.host.platform === 'darwin' && s.host.arch === 'x64');
  if (!intel.length) reasons.push('No Intel Mac (darwin x64) result.');
  for (const s of intel) {
    if (s.warmMsPer2000 > GATE_MS_PER_2000_WORDS) {
      reasons.unshift(`Intel Mac median warm ${s.warmMsPer2000} ms per 2,000 words exceeds ${GATE_MS_PER_2000_WORDS} ms.`);
    }
  }
  return { pass: reasons.length === 0, reasons };
}

function renderMarkdownTable(summaries) {
  const head = '| Host | CPU | Ready ms (end-to-end) | Cold ms | Warm median ms (n) | Warm ms / 2,000 words | Words/s | Recreate ready ms | Engine peak Δ MB | Total peak Δ MB | Total after destroy vs pre MB | Markup kept html / markers / wiki | English |';
  const rule = '|' + '---|'.repeat(13);
  const rows = summaries.map((s) => {
    const c = s.markup.counts;
    const d = s.memory.deltaMB;
    return `| ${s.host.platform} ${s.host.arch} (${s.host.engineHost}) | ${s.host.cpuModel} ×${s.host.cpuCount} | ${s.timing.endToEndReadyMs} | ${s.coldMs} | ${s.warmMedianMs} (${s.warmMsSamples.length}) | ${s.warmMsPer2000} | ${s.wordsPerSecWarm} | ${s.recreate.endToEndReadyMs} | ${d.enginePeak} | ${d.totalPeak} | ${d.totalAfterDestroyVsPre} / ${d.totalAfterRecreateDestroyVsPre} | ${c.html.kept}/${c.html.total} / ${c.markers.kept}/${c.markers.total} / ${c.wikipedia.kept}/${c.wikipedia.total} | ${s.language.isEnglish ? 'yes' : 'NO'} |`;
  });
  return [head, rule, ...rows].join('\n') + '\n';
}

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderQualityReport(full, fixtures) {
  const m = markupSummary(full, fixtures);
  const fixtureRows = m.cases.map((c) => `<tr class="${c.structureKept && !c.protectedMissing.length ? 'ok' : 'bad'}"><td>${esc(c.id)}</td><td>${esc(c.mode)}</td><td>${esc(c.src)}</td><td>${esc(c.out)}</td><td>${c.structureKept ? 'kept' : 'changed'}</td><td>${esc(c.protectedMissing.join(' '))}</td></tr>`).join('\n');
  const wikiRows = full.markup.wikipedia.map((r, i) => `<tr class="${m.wikipediaKept[i] ? 'ok' : 'bad'}"><td>${esc(r.src)}</td><td>${esc(r.out)}</td><td>${m.wikipediaKept[i] ? 'kept' : 'changed'}</td></tr>`).join('\n');
  const articleRows = full.articleBlocks.slice(0, 20).map((src, i) => `<tr><td>${esc(src)}</td><td>${esc(full.articleOut[i] || '')}</td></tr>`).join('\n');
  return `<!doctype html>
<meta charset="utf-8">
<title>Phase 0 translation quality</title>
<style>
body { font: 14px/1.45 system-ui, sans-serif; margin: 24px; }
table { border-collapse: collapse; width: 100%; margin-bottom: 32px; }
td, th { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; text-align: left; }
tr.bad td { background: #fff1f0; }
</style>
<h1>Blanc markup fixtures</h1>
<table><tr><th>Case</th><th>Mode</th><th>Source</th><th>Output</th><th>Structure</th><th>Protected missing</th></tr>
${fixtureRows}
</table>
<h1>Wikipedia paragraphs (HTML mode)</h1>
<table><tr><th>Source</th><th>Output</th><th>Structure</th></tr>
${wikiRows}
</table>
<h1>Article blocks (first 20, text mode)</h1>
<table><tr><th>French</th><th>English</th></tr>
${articleRows}
</table>
`;
}

module.exports = {
  countWords, median, structureSignature, checkMarkupCase, languageCheck,
  summarize, gateVerdict, renderMarkdownTable, renderQualityReport,
};
