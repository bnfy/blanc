# On-device Translation — Phase 0 Feasibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Mozilla's Bergamot translation engine from a pinned commit, run it in an unattached sandboxed `WebContentsView` under Electron 44.5.1 exactly as the F43 design places it, and measure end-to-end latency, repeated warm speed, process-tree memory (including reclamation after destroy and a recreate cycle), sizes, and markup fidelity on Apple Silicon, Intel Mac and Windows — ending in a go/no-go gate for the owner.

**Architecture:** A CI job compiles the WASM engine from `mozilla/translations` at a pinned commit and publishes it with a hash manifest. A Node fetch script downloads the pinned fr→en model and a pinned-hash French Wikipedia revision. A standalone Electron harness under `bench/translate/harness/` creates an **unattached** `WebContentsView` (no window) served from a custom scheme with the F43 CSP, runs the engine in a dedicated worker, and runs two cycles: a full measurement cycle, then destroy, then a recreate cycle, then destroy — sampling every Electron process throughout. A pure, unit-tested `bench/translate/lib/report.js` computes the summary, structural markup checks, an English-output check, the markdown table, and the gate verdict.

**Tech Stack:** Electron 44.5.1 (repo devDependency), Node 22, Emscripten 3.1.8 via upstream `inference/scripts/build-wasm.py`, GitHub Actions (`ubuntu-22.04`, `macos-15`, `macos-15-intel`, `windows-latest`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-08-on-device-translation-design.md` (section "Phase 0 — feasibility gate").

## Global Constraints

- **Research-only sources.** Phase 0 downloads the model directly from Mozilla's GCS bucket and the fixture from Wikipedia. This is for feasibility measurement only and does **not** weaken the production requirement in the spec: shipped Blanc fetches only approved, pinned artifacts mirrored on Blanc infrastructure (R2), never Mozilla's or Google's hosts.
- Engine source: `https://github.com/mozilla/translations` at commit `69455acaecbe8650cdba988dbcf7c10ca20e7c48` (`inference/BERGAMOT_VERSION` = `v0.6.0`), built with upstream `inference/scripts/build-wasm.py` (Emscripten `3.1.8`). MPL-2.0.
- Model: fr→en `base-memory`, release status `Release`. Decompressed SHA-256 pins (identical in Mozilla's GCS `models.json` and Firefox Remote Settings `translations-models-v2` v3.0 on 2026-10-08):
  - `model.fren.intgemm.alphas.bin` — `15f997bc0d13808b0b0fbd0786e684a3c8a52adcd8071844b76123fdacbf2b90`, 31561787 bytes
  - `lex.50.50.fren.s2t.bin` — `87c6752ea908f5f0347c10ac0cf7d80d9c2f4f20c81c90168f3e8230b56d4440`, 4824120 bytes
  - `vocab.fren.spm` — `783abf3abe075afdf8d85d233994bef2c3a064e935ab1bed946820aff6ac002a`, 814404 bytes
- Article fixture: French Wikipedia "Tour Eiffel", revision `240161358`, CC BY-SA 4.0, REST HTML response pinned at SHA-256 `4680cf2e2bd1cb342f623a773390a6a5ce6d1c32474a43c5242ebdfe69c79507`, 765654 bytes (identical across three fetches with curl and Node on 2026-10-08). Fetched at run time, verified, **never committed**. A mismatch fails the run; re-pinning or switching to a committed, attributed CC BY-SA excerpt requires owner approval (it would need a `THIRD-PARTY-NOTICES.md` carve-out).
- Markup fixtures: Blanc-authored French sentences in `bench/translate/fixtures/markup.json` (MIT, first-party).
- Engine config (verbatim from upstream `inference/wasm/tests/engine/translations-engine.worker.mjs`): `beam-size 1`, `normalize 1.0`, `word-penalty 0`, `max-length-break 128`, `mini-batch-words 1024`, `workspace 128`, `max-length-factor 2.0`, `skip-cost true`, `cpu-threads 0`, `quiet true`, `quiet-translation true`, `gemm-precision int8shiftAlphaAll`, `alignment soft`; `INITIAL_MEMORY 234291200`; alignment `model 256`, `lex 64`, `vocab 64`; `BlockingService({ cacheSize: 0 })`.
- Engine host: **unattached `WebContentsView`** (never added to any window) with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `backgroundThrottling: false`. If the unattached view does not start, the harness fails with an explicit message; the `--host=window` fallback (view attached to a hidden `BrowserWindow`) may then be used, and the evidence must record the divergence and report the host window's renderer memory separately.
- CSP on every harness response: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'none'; style-src 'unsafe-inline'`.
- Batch size 64 blocks. Warm translations: 5 runs; the gate uses the median; every sample is preserved.
- Gate: Intel Mac (darwin x64) median warm time normalized to 2,000 words ≤ 10,000 ms, at least 5 warm samples, and the English-output check passes on every host. Markup fidelity is an owner judgement informed by the structural checks. Any failure → stop and return to the owner.
- Every outbound request uses User-Agent `BlancTranslatePhase0/0 (https://blancbrowser.com)`. Never put personal data in requests.
- GitHub Actions are commit-SHA pinned: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`, `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1`, `actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2`.
- Raw results and caches are gitignored; only the evidence README and the four `summary.json` files are committed.
- Nothing in `src/` changes in Phase 0.

## File Structure

| File | Responsibility |
|---|---|
| `bench/translate/inputs.json` | All pins: engine commit, model paths/hashes/sizes, fixture revision/hash, run parameters. |
| `bench/translate/fixtures/markup.json` | Blanc-authored markup cases with protected strings. |
| `bench/translate/lib/report.js` | Pure (CommonJS, no Electron/DOM): stats, `structureSignature`, `checkMarkupCase`, `languageCheck`, `summarize`, `gateVerdict`, `renderMarkdownTable`, `renderQualityReport`. |
| `test/unit/translate-phase0-report.test.js` | Unit tests for `report.js`. |
| `bench/translate/fetch-inputs.mjs` | Downloads and verifies model files and the fixture into `.cache/`. |
| `bench/translate/wrap-engine.mjs` | Turns upstream build output into a `loadBergamot(Module)` script + wasm + `engine-manifest.json`. |
| `bench/translate/harness/main.js` | Electron main: scheme, engine view lifecycle (two cycles), input delivery, process-tree sampling, result writing. |
| `bench/translate/harness/preload.js` | Minimal `benchAPI` bridge. |
| `bench/translate/harness/engine.html` / `engine.js` | Engine page: block extraction, marker transform, worker orchestration, end-to-end timing. |
| `bench/translate/harness/engine.worker.js` | Loads Bergamot, builds the model, translates batches. |
| `bench/translate/verdict.mjs` | Prints the markdown table and the gate verdict. |
| `bench/translate/README.md` | How to run Phase 0. |
| `.github/workflows/translate-phase0.yml` | Build engine, then measure on three hosted runners. |
| `.gitignore` | Ignore `bench/translate/.cache/` and `bench/translate/results/`. |
| `docs/evidence/translate-phase0-<run date>/` | README with results, verdict, provenance; the four `summary.json` files. |

---

### Task 0: Workspace on a current base

**Files:** none. The main checkout (with its uncommitted `.claude/launch.json`) is never touched; everything happens in the new worktree.

- [ ] **Step 1: Create the worktree and rebase the spike branch onto current `origin/main`**

```bash
cd "/Users/anthonyjloria/Projects/Blanc Browser"
git fetch origin
git worktree add ../blanc-translate-phase0 -b spike/translate-phase0 spec/on-device-translation
cd ../blanc-translate-phase0
git rebase origin/main
```

Expected: the rebase applies the spec/plan commits cleanly (they touch only `docs/superpowers/`). On a conflict, stop and report.

- [ ] **Step 2: Prove the base**

Run: `git merge-base --is-ancestor origin/main HEAD && echo based-on-current-main; git rev-list --left-right --count origin/main...HEAD`
Expected: `based-on-current-main` and `0	<n>` (zero behind).

- [ ] **Step 3: Install dependencies**

Run: `npm ci`
Expected: completes. Use a real `npm ci`, never a symlinked `node_modules`.

---

### Task 1: Pure report module (TDD)

**Files:**
- Create: `bench/translate/lib/report.js`
- Test: `test/unit/translate-phase0-report.test.js`

**Interfaces:**
- Produces (CommonJS exports of `bench/translate/lib/report.js`):
  - `countWords(text: string): number`
  - `median(nums: number[]): number | null`
  - `structureSignature(html: string): string` — element tree with tag names and sorted `name=value` attributes, text ignored; `'!unbalanced'` for mismatched tags
  - `checkMarkupCase(c: MarkupCase, mode: 'html' | 'markers', src: string, out: string): { id, mode, structureKept: boolean, protectedMissing: string[] }`
  - `languageCheck(texts: string[]): { words, englishRatio, frenchRatio, isEnglish }`
  - `summarize(input: SummaryInput): Summary`
  - `gateVerdict(summaries: Summary[]): { pass: boolean, reasons: string[] }`
  - `renderMarkdownTable(summaries: Summary[]): string`
  - `renderQualityReport(full: FullCycle, fixtures: MarkupCase[]): string`
- `MarkupCase`: `{ id: string, html: string, protected: string[], noTranslate: string[] }`
- `Timing`: `{ inputTransferMs, workerStartMs, engineLoadMs, modelLoadMs, endToEndReadyMs }`
- `FullCycle` (engine page report, `mode: 'full'`): `{ mode, timing: Timing, articleWords, articleBlocks: string[], articleOut: string[], coldMs, warmMs: number[], markup: { wikipedia: Array<{ src, out }>, fixtures: Array<{ id, mode, src, out }> } }`
- `ShortCycle` (`mode: 'short'`): `{ mode, timing: Timing, firstTranslateMs }`
- `Sample`: `{ t: number, phase: string, mainKB: number, engineKB: number | null, hostKB: number | null, totalKB: number }`
- `SummaryInput`: `{ host: { platform, arch, cpuModel, cpuCount, totalMemMB, electron, engineHost: 'view' | 'window' }, sizes, cycles: [FullCycle, ShortCycle], samples: Sample[], fixtures: MarkupCase[] }`
- Phases: `pre` (no engine view yet), `idle`, `engine`, `cold`, `warm`, `markup`, `settle`, `worker-terminated`, `destroyed`, then the recreate cycle's `idle-2`, `engine-2`, `first-2`, `worker-terminated-2`, `destroyed-2`.

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/translate-phase0-report.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  countWords, median, structureSignature, checkMarkupCase, languageCheck,
  summarize, gateVerdict, renderMarkdownTable, renderQualityReport,
} = require('../../bench/translate/lib/report.js');

const MB = 1024;
const host = (arch, platform = 'darwin') => ({
  platform, arch, cpuModel: 'cpu', cpuCount: 4, totalMemMB: 16384, electron: '44.5.1', engineHost: 'view',
});
const sizes = { engine: { jsBytes: 1, wasmBytes: 2, wasmGzBytes: 1 }, model: {} };
const EN = Array(10).fill('The tower was built in the city of Paris and it is tall.').join(' ');
const FR = Array(10).fill('La tour est dans la ville de Paris et elle est grande.').join(' ');
const fixtures = [
  { id: 'link', html: '<a href="x" class="c">un <b>lien</b></a>', protected: [], noTranslate: [] },
  { id: 'ph', html: 'Vous avez {count} messages', protected: ['{count}'], noTranslate: [] },
];
const full = (over = {}) => ({
  mode: 'full',
  timing: { inputTransferMs: 120.4, workerStartMs: 40.2, engineLoadMs: 900.1, modelLoadMs: 300.3, endToEndReadyMs: 1400.6 },
  articleWords: 2100,
  articleBlocks: ['Bonjour.'],
  articleOut: [EN],
  coldMs: 6000,
  warmMs: [4300, 4100, 4200, 4500, 4000],
  markup: {
    wikipedia: [{ src: '<a href="w">Paris</a> est <b>belle</b>', out: '<a href="w">Paris</a> is <b>beautiful</b>' }],
    fixtures: [
      { id: 'link', mode: 'html', src: fixtures[0].html, out: '<a href="x" class="c">a <b>link</b></a>' },
      { id: 'link', mode: 'markers', src: '<a id="m0">un <b id="m1">lien</b></a>', out: '<a id="m0">a link</a>' },
      { id: 'ph', mode: 'html', src: fixtures[1].html, out: 'You have messages' },
      { id: 'ph', mode: 'markers', src: fixtures[1].html, out: 'You have {count} messages' },
    ],
  },
  ...over,
});
const short = { mode: 'short', timing: { inputTransferMs: 100, workerStartMs: 30, engineLoadMs: 800, modelLoadMs: 250, endToEndReadyMs: 1200 }, firstTranslateMs: 5000 };
const s = (t, phase, mainMB, engineMB, totalMB) => ({ t, phase, mainKB: mainMB * MB, engineKB: engineMB == null ? null : engineMB * MB, hostKB: null, totalKB: totalMB * MB });
const samples = [
  s(0, 'pre', 100, null, 300), s(100, 'pre', 100, null, 300),
  s(200, 'idle', 100, 50, 350), s(300, 'idle', 100, 50, 350),
  s(400, 'engine', 110, 200, 520),
  s(500, 'warm', 110, 420, 760),
  s(5000, 'settle', 108, 380, 700), s(6000, 'settle', 108, 380, 700),
  s(7000, 'worker-terminated', 108, 120, 450),
  s(9000, 'destroyed', 105, null, 310),
  s(12000, 'engine-2', 112, 410, 740),
  s(15000, 'destroyed-2', 106, null, 312),
];
const summary = (over = {}, h = host('arm64')) => summarize({ host: h, sizes, cycles: [full(over), short], samples, fixtures });

test('countWords and median', () => {
  assert.equal(countWords('  un  deux\ntrois\t'), 3);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('structureSignature captures nesting, order and attributes, ignoring text', () => {
  assert.equal(structureSignature('<a href="x" class="c">t <b>u</b></a><br>'), 'a[class=c,href=x](b[]())br[]()');
  assert.equal(structureSignature('<b>x</b><i>y</i>'), 'b[]()i[]()');
  assert.notEqual(structureSignature('<b><i>x</i></b>'), structureSignature('<b></b><i>x</i>'));
  assert.notEqual(structureSignature('<a href="x">t</a>'), structureSignature('<a href="y">t</a>'));
  assert.equal(structureSignature('<b>x</i>'), '!unbalanced');
  assert.equal(structureSignature('<b>x'), '!unbalanced');
  assert.equal(structureSignature('plain'), '');
});

test('checkMarkupCase reports structure and protected strings per mode', () => {
  const c = { id: 'n', html: 'Par <span translate="no">Jean</span> {n}', protected: ['{n}'], noTranslate: ['Jean'] };
  assert.deepEqual(
    checkMarkupCase(c, 'html', c.html, 'By <span translate="no">Jean</span> {n}'),
    { id: 'n', mode: 'html', structureKept: true, protectedMissing: [] },
  );
  assert.deepEqual(
    checkMarkupCase(c, 'html', c.html, 'By <span translate="no">John</span>'),
    { id: 'n', mode: 'html', structureKept: true, protectedMissing: ['{n}', 'Jean'] },
  );
  // In marker mode the no-translate content is not sent, so it is not checked.
  assert.deepEqual(
    checkMarkupCase(c, 'markers', 'Par <span id="m0"></span> {n}', 'By <span id="m0"></span> {n}'),
    { id: 'n', mode: 'markers', structureKept: true, protectedMissing: [] },
  );
});

test('languageCheck distinguishes English from French output', () => {
  assert.equal(languageCheck([EN]).isEnglish, true);
  assert.equal(languageCheck([FR]).isEnglish, false);
  assert.equal(languageCheck(['too short']).isEnglish, false);
});

test('summarize: timing, warm median, recreate cycle', () => {
  const r = summary();
  assert.deepEqual(r.timing, { inputTransferMs: 120, workerStartMs: 40, engineLoadMs: 900, modelLoadMs: 300, endToEndReadyMs: 1401 });
  assert.deepEqual(r.warmMsSamples, [4300, 4100, 4200, 4500, 4000]);
  assert.equal(r.warmMedianMs, 4200);
  assert.equal(r.warmMsPer2000, 4000);
  assert.equal(r.wordsPerSecWarm, 500);
  assert.deepEqual(r.recreate, { endToEndReadyMs: 1200, firstTranslateMs: 5000 });
});

test('summarize: process-tree memory and reclamation deltas', () => {
  const m = summary().memory;
  assert.deepEqual(m.preMB, { main: 100, total: 300 });
  assert.deepEqual(m.baselineMB, { main: 100, engine: 50, total: 350 });
  assert.deepEqual(m.peakMB, { main: 110, engine: 420, total: 760 });
  assert.deepEqual(m.settledMB, { engine: 380, total: 700 });
  assert.deepEqual(m.afterWorkerTerminateMB, { engine: 120, total: 450 });
  assert.deepEqual(m.afterDestroyMB, { main: 105, total: 310 });
  assert.deepEqual(m.afterRecreateDestroyMB, { main: 106, total: 312 });
  assert.deepEqual(m.deltaMB, { enginePeak: 370, totalPeak: 410, totalSettled: 350, totalAfterDestroyVsPre: 10, totalAfterRecreateDestroyVsPre: 12 });
});

test('summarize: markup checks and English check', () => {
  const r = summary();
  assert.deepEqual(r.markup.counts, { html: { kept: 2, total: 2 }, markers: { kept: 1, total: 2 }, wikipedia: { kept: 1, total: 1 }, protectedFailures: 1 });
  assert.equal(r.markup.cases.length, 4);
  assert.equal(r.language.isEnglish, true);
});

test('gateVerdict passes when Intel Mac median is within budget', () => {
  assert.deepEqual(gateVerdict([summary({}, host('x64'))]), { pass: true, reasons: [] });
});

test('gateVerdict fails on slow Intel median, too few warm runs, non-English output, or missing Intel', () => {
  const slow = summary({ warmMs: [12000, 12500, 11800, 12100, 12200], articleWords: 2000 }, host('x64'));
  assert.match(gateVerdict([slow]).reasons[0], /Intel Mac median warm 12100 ms per 2,000 words exceeds 10000 ms/);
  const few = summary({ warmMs: [4000, 4100] }, host('x64'));
  assert.match(gateVerdict([few]).reasons[0], /darwin x64: only 2 warm samples/);
  const french = summary({ articleOut: [FR] }, host('x64'));
  assert.match(gateVerdict([french]).reasons[0], /darwin x64: output failed the English check/);
  assert.deepEqual(gateVerdict([summary()]), { pass: false, reasons: ['No Intel Mac (darwin x64) result.'] });
});

test('renderMarkdownTable has one row per summary', () => {
  const md = renderMarkdownTable([summary(), summary({}, host('x64', 'win32'))]);
  assert.equal(md.trim().split('\n').length, 4);
  assert.match(md, /darwin arm64 \(view\)/);
  assert.match(md, /win32 x64 \(view\)/);
});

test('renderQualityReport escapes page and engine text and uses no inline styles', () => {
  const html = renderQualityReport(full({ articleOut: ['<script>alert(1)</script>'] }), fixtures);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!/ style="/.test(html));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/translate-phase0-report.test.js`
Expected: FAIL with `Cannot find module '../../bench/translate/lib/report.js'`.

- [ ] **Step 3: Implement `report.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/translate-phase0-report.test.js`
Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add bench/translate/lib/report.js test/unit/translate-phase0-report.test.js
git commit -m "Add Phase 0 translation report helpers"
```

---

### Task 2: Pinned inputs, markup fixtures, fetch script

**Files:**
- Create: `bench/translate/inputs.json`
- Create: `bench/translate/fixtures/markup.json`
- Create: `bench/translate/fetch-inputs.mjs`
- Modify: `.gitignore` (after the `bench/tab-import/results/` line)

**Interfaces:**
- Produces in `bench/translate/.cache/`: `model`, `lex`, `vocab` (decompressed, hash-verified), `fixture.html` (hash-verified), `inputs-meta.json` = `{ model: { <kind>: { bytes, gzBytes } }, fixture: { revid, sha256, bytes } }`.
- `markup.json` is an array of `MarkupCase` (Task 1).

- [ ] **Step 1: Write `inputs.json`**

```json
{
  "engine": {
    "repo": "https://github.com/mozilla/translations",
    "commit": "69455acaecbe8650cdba988dbcf7c10ca20e7c48",
    "bergamotVersion": "v0.6.0",
    "emsdk": "3.1.8",
    "license": "MPL-2.0"
  },
  "model": {
    "pair": "fr-en",
    "architecture": "base-memory",
    "license": "MPL-2.0",
    "researchOnlySource": true,
    "baseUrl": "https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data",
    "files": {
      "model": {
        "path": "models/fr-en/retrain_hr_EFgIftH_RrCyzl5gjemVNg/exported/model.fren.intgemm.alphas.bin.gz",
        "sha256": "15f997bc0d13808b0b0fbd0786e684a3c8a52adcd8071844b76123fdacbf2b90",
        "size": 31561787
      },
      "lex": {
        "path": "models/fr-en/retrain_hr_EFgIftH_RrCyzl5gjemVNg/exported/lex.50.50.fren.s2t.bin.gz",
        "sha256": "87c6752ea908f5f0347c10ac0cf7d80d9c2f4f20c81c90168f3e8230b56d4440",
        "size": 4824120
      },
      "vocab": {
        "path": "models/fr-en/retrain_hr_EFgIftH_RrCyzl5gjemVNg/exported/vocab.fren.spm.gz",
        "sha256": "783abf3abe075afdf8d85d233994bef2c3a064e935ab1bed946820aff6ac002a",
        "size": 814404
      }
    }
  },
  "fixture": {
    "title": "Tour Eiffel",
    "revid": 240161358,
    "license": "CC BY-SA 4.0",
    "researchOnlySource": true,
    "url": "https://fr.wikipedia.org/api/rest_v1/page/html/Tour_Eiffel/240161358",
    "sha256": "4680cf2e2bd1cb342f623a773390a6a5ce6d1c32474a43c5242ebdfe69c79507",
    "size": 765654
  },
  "run": {
    "articleWords": 2000,
    "wikipediaMarkupBlocks": 40,
    "warmRuns": 5,
    "batchSize": 64
  }
}
```

- [ ] **Step 2: Write `fixtures/markup.json` (Blanc-authored, MIT)**

```json
[
  { "id": "nested-emphasis", "html": "Ce point est <b>très <i>important</i> pour</b> la suite du projet.", "protected": [], "noTranslate": [] },
  { "id": "link-attributes", "html": "Lisez <a href=\"https://exemple.fr/guide?x=1&amp;y=2\" class=\"lien-externe\" data-id=\"42\" title=\"Le guide\" rel=\"noopener\">le guide complet</a> avant de commencer.", "protected": [], "noTranslate": [] },
  { "id": "list", "html": "<ul><li>Achetez des pommes.</li><li>Lavez les <em>poires</em>.</li><li>Préparez la <a href=\"/recette\">recette</a>.</li></ul>", "protected": [], "noTranslate": [] },
  { "id": "inline-spans", "html": "Le prix est de <span class=\"prix\">vingt euros</span> et la livraison est <span class=\"gratuit\">gratuite</span>.", "protected": [], "noTranslate": [] },
  { "id": "entities", "html": "Le service R&amp;D annonce un prix &lt; 10&nbsp;€ pour l&#39;été.", "protected": ["R&amp;D"], "noTranslate": [] },
  { "id": "placeholders", "html": "Vous avez {count} nouveaux messages de %s dans {{dossier}}.", "protected": ["{count}", "%s", "{{dossier}}"], "noTranslate": [] },
  { "id": "no-translate", "html": "Envoyé par <span translate=\"no\">Jean-Pierre Dupont</span> depuis la gare de Lyon.", "protected": [], "noTranslate": ["Jean-Pierre Dupont"] },
  { "id": "link-wrapping-strong", "html": "Cliquez <a href=\"#aide\"><strong>ici</strong></a> ou appuyez sur <kbd>Ctrl</kbd>+<kbd>S</kbd> pour enregistrer.", "protected": [], "noTranslate": [] }
]
```

- [ ] **Step 3: Write `fetch-inputs.mjs`**

```js
// bench/translate/fetch-inputs.mjs
// Phase 0 research-only download: the pinned fr→en model from Mozilla's GCS
// bucket and the pinned Wikipedia revision. Production Blanc never fetches from
// these hosts (spec: Blanc-mirrored, approved artifacts only).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, '.cache');
mkdirSync(cache, { recursive: true });
const inputs = JSON.parse(readFileSync(path.join(here, 'inputs.json'), 'utf8'));
const UA = 'BlancTranslatePhase0/0 (https://blancbrowser.com)';
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'error' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function verify(label, buf, want) {
  const got = sha(buf);
  if (buf.length !== want.size || got !== want.sha256) {
    throw new Error(`${label}: expected ${want.sha256} (${want.size} bytes), got ${got} (${buf.length} bytes)`);
  }
}

const meta = { model: {} };
for (const [kind, f] of Object.entries(inputs.model.files)) {
  const gz = await get(`${inputs.model.baseUrl}/${f.path}`);
  const raw = gunzipSync(gz);
  verify(kind, raw, f);
  writeFileSync(path.join(cache, kind), raw);
  meta.model[kind] = { bytes: raw.length, gzBytes: gz.length };
  console.log(`ok ${kind}: ${raw.length} bytes (${gz.length} gzipped), sha256 verified`);
}

const html = await get(inputs.fixture.url);
verify('fixture (Wikipedia re-rendered this revision; re-pin only with owner approval)', html, inputs.fixture);
writeFileSync(path.join(cache, 'fixture.html'), html);
meta.fixture = { revid: inputs.fixture.revid, sha256: sha(html), bytes: html.length };
console.log(`ok fixture: revision ${inputs.fixture.revid}, ${html.length} bytes, sha256 verified`);

writeFileSync(path.join(cache, 'inputs-meta.json'), JSON.stringify(meta, null, 2) + '\n');
```

- [ ] **Step 4: Ignore caches and raw results**

Add after `bench/tab-import/results/` in `.gitignore`:

```
bench/translate/.cache/
bench/translate/results/
```

- [ ] **Step 5: Run the fetch**

Run: `node bench/translate/fetch-inputs.mjs`
Expected: `ok model|lex|vocab … sha256 verified` and `ok fixture … sha256 verified`; `git status --short` lists nothing under `bench/translate/.cache/`.

- [ ] **Step 6: Negative control — a wrong pin must fail**

Change the last hex digit of `model.files.vocab.sha256` in `inputs.json`, run the fetch again.
Expected: non-zero exit with `vocab: expected …`. Undo the edit and re-run Step 5. Repeat once with the last digit of `fixture.sha256` (expected: `fixture (Wikipedia re-rendered …): expected …`), then undo.

- [ ] **Step 7: Commit**

```bash
git add bench/translate/inputs.json bench/translate/fixtures/markup.json bench/translate/fetch-inputs.mjs .gitignore
git commit -m "Pin Phase 0 translation inputs and add markup fixtures"
```

---

### Task 3: Engine build in CI

**Files:**
- Create: `bench/translate/wrap-engine.mjs`
- Create: `.github/workflows/translate-phase0.yml` (build job only in this task)

**Interfaces:**
- Produces the workflow artifact `translate-engine`: `bergamot-translator.js` (defines global `function loadBergamot(Module)`), `bergamot-translator.wasm`, `engine-manifest.json` = `{ upstreamCommit, wrap: "upstream" | "blanc", files: { "bergamot-translator.js": { bytes, sha256 }, "bergamot-translator.wasm": { bytes, gzBytes, sha256 } } }`.

- [ ] **Step 1: Write `wrap-engine.mjs`**

Upstream `build-wasm.py` defines `prepare_js_artifact()` (wrapping Emscripten output in `function loadBergamot(Module)`) but its `main()` does not call it at the pinned commit, so this script applies the same wrap when the symbol is missing.

```js
// bench/translate/wrap-engine.mjs
// Usage: node bench/translate/wrap-engine.mjs <upstream build-wasm dir> <out dir>
// Mirrors mozilla/translations inference/scripts/build-wasm.py prepare_js_artifact().
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: wrap-engine.mjs <build-wasm dir> <out dir>');
const here = path.dirname(fileURLToPath(import.meta.url));
const { engine } = JSON.parse(readFileSync(path.join(here, 'inputs.json'), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');

let js = readFileSync(path.join(src, 'bergamot-translator.js'), 'utf8');
const wasm = readFileSync(path.join(src, 'bergamot-translator.wasm'));
const alreadyWrapped = js.includes('function loadBergamot(');
if (!alreadyWrapped) {
  const header = [
    '/* AUTO-GENERATED. DO NOT MODIFY.',
    ' * Built from https://github.com/mozilla/translations at ' + engine.commit,
    ' * and wrapped by bench/translate/wrap-engine.mjs (mirrors upstream prepare_js_artifact).',
    ' *',
    ' * This Source Code Form is subject to the terms of the Mozilla Public',
    ' * License, v. 2.0. If a copy of the MPL was not distributed with this',
    ' * file, You can obtain one at http://mozilla.org/MPL/2.0/. */',
    '',
    'function loadBergamot(Module) {',
    '',
  ].join('\n');
  const body = js.split('\n').map((l) => '  ' + l).join('\n').replace(/console\.log\(/g, 'Module.print(');
  js = `${header}\n${body}\n  return Module;\n}\n`;
}

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'bergamot-translator.js'), js);
writeFileSync(path.join(out, 'bergamot-translator.wasm'), wasm);
const manifest = {
  upstreamCommit: engine.commit,
  wrap: alreadyWrapped ? 'upstream' : 'blanc',
  files: {
    'bergamot-translator.js': { bytes: Buffer.byteLength(js), sha256: sha(js) },
    'bergamot-translator.wasm': { bytes: wasm.length, gzBytes: gzipSync(wasm, { level: 9 }).length, sha256: sha(wasm) },
  },
};
writeFileSync(path.join(out, 'engine-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
```

- [ ] **Step 2: Write the workflow with the build job**

```yaml
# .github/workflows/translate-phase0.yml
# F43 Phase 0 feasibility: build Bergamot from a pinned commit, then measure it
# in an unattached sandboxed WebContentsView on Apple Silicon, Intel Mac and Windows.
# Spec: docs/superpowers/specs/2026-10-08-on-device-translation-design.md
name: translate-phase0

on:
  push:
    branches: [spike/translate-phase0]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build-engine:
    runs-on: ubuntu-22.04
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          repository: mozilla/translations
          ref: 69455acaecbe8650cdba988dbcf7c10ca20e7c48
          path: upstream
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 22
      - name: Build Bergamot WASM (upstream script, emsdk 3.1.8)
        working-directory: upstream
        env:
          ALLOW_RUN_ON_HOST: '1'
        run: python3 inference/scripts/build-wasm.py
      - name: Wrap and hash engine
        run: node bench/translate/wrap-engine.mjs upstream/inference/build-wasm engine-out
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: translate-engine
          path: engine-out
          retention-days: 14
          if-no-files-found: error
```

- [ ] **Step 3: Commit, then push (first push needs owner approval)**

```bash
git add bench/translate/wrap-engine.mjs .github/workflows/translate-phase0.yml
git commit -m "Build Bergamot engine for Phase 0 in CI"
```

Ask the owner to approve the first push of `spike/translate-phase0`, then:

```bash
git push -u origin spike/translate-phase0
```

- [ ] **Step 4: Wait for the build job**

Run: `gh run list --workflow=translate-phase0.yml --branch spike/translate-phase0 --limit 1`, then `gh run watch <run-id> --exit-status`.
Expected: `build-engine` succeeds; the "Wrap and hash engine" log prints a manifest with a wasm of roughly 4–6 MB.
If the upstream build fails, do not patch upstream sources: read the log, use superpowers:systematic-debugging, and report to the owner before trying another build route.

- [ ] **Step 5: Download the engine locally**

```bash
rm -rf bench/translate/.cache/engine
gh run download <run-id> --name translate-engine --dir bench/translate/.cache/engine
grep -c "function loadBergamot(" bench/translate/.cache/engine/bergamot-translator.js
```

Expected: `1`.

---

### Task 4: Electron harness, run locally on Apple Silicon

**Files:**
- Create: `bench/translate/harness/main.js`
- Create: `bench/translate/harness/preload.js`
- Create: `bench/translate/harness/engine.html`
- Create: `bench/translate/harness/engine.js`
- Create: `bench/translate/harness/engine.worker.js`

**Interfaces:**
- Consumes: `report.js` (Task 1); `.cache/*` and `fixtures/markup.json` (Task 2); `.cache/engine/*` (Task 3).
- `window.benchAPI` (preload):
  - `hello(): void` — page loaded (startup watchdog)
  - `getInputs(): Promise<{ mode: 'full' | 'short', wasm, model, lex, vocab: Uint8Array, fixtureHtml: string, fixtures: MarkupCase[], run: { articleWords, wikipediaMarkupBlocks, warmRuns, batchSize } }>`
  - `mark(phase: string): void`
  - `report(cycle: FullCycle | ShortCycle): void`
  - `onTerminate(cb: () => void): void` — main asks the page to terminate its worker
  - `terminated(): void`
  - `fail(message: string): void`
- Worker messages: out `{ type: 'booted', at }` after script import; in `{ type: 'init', wasm, files }` → out `{ type: 'ready', engineLoadMs, modelLoadMs }`; in `{ type: 'translate', blocks, html, batchSize }` → out `{ type: 'translated', ms, out }`; failure → `{ type: 'error', message }`. `at` is `performance.timeOrigin + performance.now()` (epoch ms, comparable across page and worker).
- Produces in `--out` dir: `summary.json` (`Summary` + `provenance`), `run.json` (raw cycles + samples), `quality.html`.

- [ ] **Step 1: Write `preload.js`**

```js
// bench/translate/harness/preload.js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('benchAPI', {
  hello: () => ipcRenderer.send('bench:hello'),
  getInputs: () => ipcRenderer.invoke('bench:inputs'),
  mark: (phase) => ipcRenderer.send('bench:mark', String(phase)),
  report: (cycle) => ipcRenderer.send('bench:report', cycle),
  onTerminate: (cb) => ipcRenderer.on('bench:terminate', () => cb()),
  terminated: () => ipcRenderer.send('bench:terminated'),
  fail: (message) => ipcRenderer.send('bench:fail', String(message)),
});
```

- [ ] **Step 2: Write `engine.html`**

```html
<!doctype html>
<meta charset="utf-8">
<title>Phase 0 engine</title>
<script src="engine.js"></script>
```

The CSP arrives as a response header from the scheme handler, as planned for F43's engine document.

- [ ] **Step 3: Write `engine.worker.js`**

```js
// bench/translate/harness/engine.worker.js
/* global loadBergamot */
'use strict';
importScripts('bergamot-translator.js');

// Values copied from mozilla/translations
// inference/wasm/tests/engine/translations-engine.worker.mjs at the pinned commit.
const ALIGNMENT = { model: 256, lex: 64, vocab: 64 };
const CONFIG = {
  'beam-size': '1', normalize: '1.0', 'word-penalty': '0', 'max-length-break': '128',
  'mini-batch-words': '1024', workspace: '128', 'max-length-factor': '2.0', 'skip-cost': 'true',
  'cpu-threads': '0', quiet: 'true', 'quiet-translation': 'true',
  'gemm-precision': 'int8shiftAlphaAll', alignment: 'soft',
};
const textConfig = () => {
  const indent = '            ';
  return '\n' + Object.entries(CONFIG).map(([k, v]) => `${indent}${k}: ${v}\n`).join('') + indent;
};

let bergamot = null;
let service = null;
let model = null;

function loadEngine(wasmBinary) {
  return new Promise((resolve, reject) => {
    const mod = loadBergamot({
      INITIAL_MEMORY: 234_291_200,
      print: () => {},
      onAbort: () => reject(new Error('Bergamot aborted while loading')),
      onRuntimeInitialized: () => resolve(mod),
      wasmBinary,
    });
  });
}

function buildModel(files) {
  const aligned = {};
  for (const [kind, buf] of Object.entries(files)) {
    const mem = new bergamot.AlignedMemory(buf.byteLength, ALIGNMENT[kind]);
    mem.getByteArrayView().set(new Uint8Array(buf));
    aligned[kind] = mem;
  }
  const vocabs = new bergamot.AlignedMemoryList();
  vocabs.push_back(aligned.vocab);
  return new bergamot.TranslationModel('fr', 'en', textConfig(), aligned.model, aligned.lex, vocabs, null);
}

function translate(blocks, html, batchSize) {
  const out = [];
  for (let i = 0; i < blocks.length; i += batchSize) {
    const messages = new bergamot.VectorString();
    const options = new bergamot.VectorResponseOptions();
    for (const block of blocks.slice(i, i + batchSize)) {
      messages.push_back(block);
      options.push_back({ qualityScores: false, alignment: true, html });
    }
    const responses = service.translate(model, messages, options);
    for (let j = 0; j < responses.size(); j++) out.push(responses.get(j).getTranslatedText());
    messages.delete();
    options.delete();
    responses.delete();
  }
  return out;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const t0 = performance.now();
      bergamot = await loadEngine(data.wasm);
      const t1 = performance.now();
      model = buildModel(data.files);
      service = new bergamot.BlockingService({ cacheSize: 0 });
      self.postMessage({ type: 'ready', engineLoadMs: t1 - t0, modelLoadMs: performance.now() - t1 });
    } else if (data.type === 'translate') {
      const t0 = performance.now();
      const out = translate(data.blocks, data.html, data.batchSize);
      self.postMessage({ type: 'translated', ms: performance.now() - t0, out });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.stack) || err) });
  }
};

self.postMessage({ type: 'booted', at: performance.timeOrigin + performance.now() });
```

- [ ] **Step 4: Write `engine.js`**

```js
// bench/translate/harness/engine.js
'use strict';

const api = window.benchAPI;
const now = () => performance.timeOrigin + performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toArrayBuffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const countWords = (t) => t.split(/\s+/).filter(Boolean).length;
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function extractWikipedia(html, articleWords, markupBlocks) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('sup.reference, style, .mw-ref, .noprint').forEach((n) => n.remove());
  const paras = [...doc.querySelectorAll('section p')].filter((p) => p.textContent.trim().length > 40);
  const article = [];
  let total = 0;
  for (const p of paras) {
    if (total >= articleWords) break;
    const text = p.textContent.replace(/\s+/g, ' ').trim();
    article.push(text);
    total += countWords(text);
  }
  const markup = paras
    .filter((p) => p.querySelector('a, b, i, em, strong'))
    .slice(0, markupBlocks)
    .map((p) => p.innerHTML.replace(/\s+/g, ' ').trim());
  return { article, articleWords: total, markup };
}

// The F43 marker form: every element keeps its tag name, loses all original
// attributes, and gains an opaque id; translate="no" content is not sent.
function toMarkers(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  let n = 0;
  const ser = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.data);
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.localName;
    const id = `m${n++}`;
    if (node.getAttribute('translate') === 'no') return `<${tag} id="${id}"></${tag}>`;
    return `<${tag} id="${id}">${[...node.childNodes].map(ser).join('')}</${tag}>`;
  };
  return [...doc.body.childNodes].map(ser).join('');
}

function startWorker() {
  const worker = new Worker('engine.worker.js');
  let pending = null;
  worker.onmessage = ({ data }) => {
    const p = pending;
    pending = null;
    if (!p) return;
    if (data.type === 'error') p.reject(new Error(data.message));
    else p.resolve(data);
  };
  worker.onerror = (e) => pending && pending.reject(new Error(e.message || 'worker error'));
  const next = () => new Promise((resolve, reject) => { pending = { resolve, reject }; });
  const call = (message, transfer = []) => {
    const p = next();
    worker.postMessage(message, transfer);
    return p;
  };
  return { worker, booted: next(), call };
}

async function boot(inputs, tStart) {
  const tInputs = now();
  const tWorker = now();
  const { worker, booted, call } = startWorker();
  const { at } = await booted;
  const wasm = toArrayBuffer(inputs.wasm);
  const files = { model: toArrayBuffer(inputs.model), lex: toArrayBuffer(inputs.lex), vocab: toArrayBuffer(inputs.vocab) };
  api.mark('engine');
  const ready = await call({ type: 'init', wasm, files }, [wasm, files.model, files.lex, files.vocab]);
  const timing = {
    inputTransferMs: tInputs - tStart,
    workerStartMs: at - tWorker,
    engineLoadMs: ready.engineLoadMs,
    modelLoadMs: ready.modelLoadMs,
    endToEndReadyMs: now() - tStart,
  };
  api.onTerminate(() => { worker.terminate(); api.terminated(); });
  return { call, timing };
}

async function fullCycle(inputs, tStart) {
  const { run } = inputs;
  const { article, articleWords, markup } = extractWikipedia(inputs.fixtureHtml, run.articleWords, run.wikipediaMarkupBlocks);
  if (articleWords < run.articleWords) throw new Error(`fixture too short: ${articleWords} words`);
  const { call, timing } = await boot(inputs, tStart);
  const translate = (blocks, html) => call({ type: 'translate', blocks, html, batchSize: run.batchSize });

  api.mark('cold');
  const cold = await translate(article, false);
  api.mark('warm');
  const warmMs = [];
  let warm = null;
  for (let i = 0; i < run.warmRuns; i++) {
    warm = await translate(article, false);
    warmMs.push(warm.ms);
  }
  api.mark('markup');
  const wiki = await translate(markup, true);
  const htmlSrc = inputs.fixtures.map((c) => c.html);
  const markerSrc = inputs.fixtures.map((c) => toMarkers(c.html));
  const htmlOut = await translate(htmlSrc, true);
  const markerOut = await translate(markerSrc, true);

  return {
    mode: 'full',
    timing,
    articleWords,
    articleBlocks: article,
    articleOut: warm.out,
    coldMs: cold.ms,
    warmMs,
    markup: {
      wikipedia: markup.map((src, i) => ({ src, out: wiki.out[i] })),
      fixtures: [
        ...inputs.fixtures.map((c, i) => ({ id: c.id, mode: 'html', src: htmlSrc[i], out: htmlOut.out[i] })),
        ...inputs.fixtures.map((c, i) => ({ id: c.id, mode: 'markers', src: markerSrc[i], out: markerOut.out[i] })),
      ],
    },
  };
}

async function shortCycle(inputs, tStart) {
  const { run } = inputs;
  const { article } = extractWikipedia(inputs.fixtureHtml, run.articleWords, 0);
  const { call, timing } = await boot(inputs, tStart);
  api.mark('first');
  const first = await call({ type: 'translate', blocks: article, html: false, batchSize: run.batchSize });
  return { mode: 'short', timing, firstTranslateMs: first.ms };
}

async function main() {
  api.hello();
  await sleep(1000); // idle baseline: the loaded page before any engine bytes arrive
  const tStart = now();
  const inputs = await api.getInputs();
  const cycle = inputs.mode === 'full' ? await fullCycle(inputs, tStart) : await shortCycle(inputs, tStart);
  api.report(cycle);
}

main().catch((err) => api.fail(String((err && err.stack) || err)));
```

- [ ] **Step 5: Write `main.js`**

```js
// bench/translate/harness/main.js
// Usage: npx electron bench/translate/harness/main.js --out=<dir> [--host=view|window]
'use strict';
const { app, BrowserWindow, WebContentsView, protocol, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { summarize, renderQualityReport } = require('../lib/report.js');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const ENGINE = path.join(CACHE, 'engine');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = path.resolve(arg('out', path.join(ROOT, 'results', 'local')));
const HOST = arg('host', 'view');
if (!['view', 'window'].includes(HOST)) throw new Error(`--host must be view or window, got ${HOST}`);
const INPUTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'inputs.json'), 'utf8'));
const FIXTURES = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', 'markup.json'), 'utf8'));
const SCHEME = 'bench-translate';
const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'none'; style-src 'unsafe-inline'";
const FILES = {
  'engine.html': path.join(__dirname, 'engine.html'),
  'engine.js': path.join(__dirname, 'engine.js'),
  'engine.worker.js': path.join(__dirname, 'engine.worker.js'),
  'bergamot-translator.js': path.join(ENGINE, 'bergamot-translator.js'),
};
const TIMEOUT_MS = 15 * 60 * 1000;
const STARTUP_MS = 30 * 1000;
const SETTLE_MS = 5000;

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true } }]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const samples = [];
let phase = 'pre';
let suffix = '';
let engine = null; // { view, hostWindow, contents, pid, hostPid }
let waiters = {};
let currentMode = 'full';

function sample() {
  const metrics = app.getAppMetrics();
  const kbOf = (pid) => {
    const m = pid ? metrics.find((x) => x.pid === pid) : null;
    return m ? m.memory.workingSetSize : null;
  };
  const main = metrics.find((m) => m.type === 'Browser');
  samples.push({
    t: Date.now(),
    phase,
    mainKB: main ? main.memory.workingSetSize : null,
    engineKB: engine ? kbOf(engine.pid) : null,
    hostKB: engine && engine.hostWindow ? kbOf(engine.hostPid) : null,
    totalKB: metrics.reduce((sum, m) => sum + m.memory.workingSetSize, 0),
  });
}

function fail(message) {
  console.error(`Phase 0 harness failed: ${message}`);
  app.exit(1);
}

const waitFor = (name) => new Promise((resolve) => { waiters[name] = resolve; });
const settle = (name, value) => { const w = waiters[name]; delete waiters[name]; if (w) w(value); };

function setPhase(p) {
  phase = p + suffix;
  sample();
}

async function createEngine() {
  const webPreferences = {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false,
    preload: path.join(__dirname, 'preload.js'),
  };
  const view = new WebContentsView({ webPreferences });
  let hostWindow = null;
  if (HOST === 'window') {
    hostWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    await hostWindow.loadURL('about:blank');
    hostWindow.contentView.addChildView(view);
  }
  const contents = view.webContents;
  contents.on('render-process-gone', (_e, d) => fail(`engine renderer gone: ${d.reason}`));
  contents.on('console-message', (e) => console.log(`[engine] ${e.message}`));
  const hello = waitFor('hello');
  const timer = setTimeout(() => fail(`engine view (host=${HOST}) did not start within ${STARTUP_MS} ms; rerun with --host=window and record the divergence`), STARTUP_MS);
  await contents.loadURL(`${SCHEME}://harness/engine.html`);
  engine = { view, hostWindow, contents, pid: contents.getOSProcessId(), hostPid: hostWindow ? hostWindow.webContents.getOSProcessId() : null };
  await hello;
  clearTimeout(timer);
}

async function destroyEngine() {
  const { contents, hostWindow } = engine;
  const terminated = waitFor('terminated');
  contents.send('bench:terminate');
  await terminated;
  setPhase('worker-terminated');
  await sleep(SETTLE_MS);
  const gone = new Promise((r) => contents.once('destroyed', r));
  contents.close();
  await gone;
  if (hostWindow) hostWindow.destroy();
  engine = null;
  setPhase('destroyed');
  await sleep(SETTLE_MS);
}

async function runCycle(mode) {
  currentMode = mode;
  setPhase('idle');
  await createEngine();
  const report = waitFor('report');
  return report;
}

app.whenReady().then(async () => {
  protocol.handle(SCHEME, (req) => {
    const name = new URL(req.url).pathname.replace(/^\//, '');
    const file = FILES[name];
    if (!file) return new Response('not found', { status: 404 });
    const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8';
    return new Response(fs.readFileSync(file), { headers: { 'content-type': type, 'content-security-policy': CSP } });
  });

  ipcMain.on('bench:hello', () => settle('hello'));
  ipcMain.handle('bench:inputs', () => ({
    mode: currentMode,
    wasm: fs.readFileSync(path.join(ENGINE, 'bergamot-translator.wasm')),
    model: fs.readFileSync(path.join(CACHE, 'model')),
    lex: fs.readFileSync(path.join(CACHE, 'lex')),
    vocab: fs.readFileSync(path.join(CACHE, 'vocab')),
    fixtureHtml: fs.readFileSync(path.join(CACHE, 'fixture.html'), 'utf8'),
    fixtures: FIXTURES,
    run: INPUTS.run,
  }));
  ipcMain.on('bench:mark', (_e, p) => setPhase(p));
  ipcMain.on('bench:report', (_e, cycle) => settle('report', cycle));
  ipcMain.on('bench:terminated', () => settle('terminated'));
  ipcMain.on('bench:fail', (_e, m) => fail(m));

  setTimeout(() => fail('timed out after 15 minutes'), TIMEOUT_MS).unref();
  setInterval(sample, 100).unref();

  // 'pre': the bare Electron process tree before any engine view exists.
  await sleep(1000);

  const full = await runCycle('full');
  setPhase('settle');
  await sleep(SETTLE_MS);
  await destroyEngine();

  suffix = '-2';
  const short = await runCycle('short');
  await destroyEngine();

  const engineManifest = JSON.parse(fs.readFileSync(path.join(ENGINE, 'engine-manifest.json'), 'utf8'));
  const inputsMeta = JSON.parse(fs.readFileSync(path.join(CACHE, 'inputs-meta.json'), 'utf8'));
  const summary = summarize({
    host: {
      platform: process.platform,
      arch: process.arch,
      cpuModel: os.cpus()[0].model.trim(),
      cpuCount: os.cpus().length,
      totalMemMB: Math.round(os.totalmem() / 1048576),
      electron: process.versions.electron,
      engineHost: HOST,
    },
    sizes: {
      engine: {
        jsBytes: engineManifest.files['bergamot-translator.js'].bytes,
        wasmBytes: engineManifest.files['bergamot-translator.wasm'].bytes,
        wasmGzBytes: engineManifest.files['bergamot-translator.wasm'].gzBytes,
      },
      model: inputsMeta.model,
    },
    cycles: [full, short],
    samples,
    fixtures: FIXTURES,
  });
  summary.provenance = { engine: engineManifest, fixture: inputsMeta.fixture, researchOnlySources: true };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify({ cycles: [full, short], samples }, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'quality.html'), renderQualityReport(full, FIXTURES));
  console.log(JSON.stringify({ ...summary, markup: summary.markup.counts }, null, 2));
  app.exit(0);
}).catch((err) => fail(String((err && err.stack) || err)));
```

Notes for the implementer:
- `getAppMetrics()` reports the dedicated worker inside the engine renderer's process (workers have no separate PID), so `engineKB` is "engine renderer + worker". `totalKB` sums every Electron process (browser, GPU, utility, renderers).
- `phase` stays `pre` for one second with no engine view, then `idle` while the page waits one second before requesting inputs; the recreate cycle's phases carry the `-2` suffix.
- No `BrowserWindow` exists in `--host=view` mode, so `window-all-closed` never fires and the app stays alive until `app.exit`.

- [ ] **Step 6: Run locally (Apple Silicon)**

Run: `npx electron bench/translate/harness/main.js --out=bench/translate/results/local-arm64`
Expected: exits 0 and prints a summary with `engineHost: "view"`, five `warmMsSamples`, non-null `timing.endToEndReadyMs`, `recreate.endToEndReadyMs`, `memory.deltaMB.*`, and `language.isEnglish: true`.
If it fails with `engine view (host=view) did not start`, rerun with `--host=window`, and record in the evidence that the unattached view needed a native host, with `memory.hostWindowPeakMB` reported separately.

- [ ] **Step 7: English check is a real check; owner review is still required**

`summary.language` must show `isEnglish: true` (≥15% common English function words, ≤3% common French ones, ≥100 words). This proves the output is English-like, not that it is a good translation; translation quality is the owner's judgement from `quality.html`.
Positive control for the check itself: run `node -e "const {languageCheck}=require('./bench/translate/lib/report.js'); const r=require('./bench/translate/results/local-arm64/run.json').cycles[0]; console.log(languageCheck(r.articleBlocks), languageCheck(r.articleOut))"`.
Expected: the French source blocks report `isEnglish: false` and the output reports `isEnglish: true`.

- [ ] **Step 8: Negative control — the CSP is really enforced**

Temporarily drop `'wasm-unsafe-eval'` from `CSP` in `main.js` and rerun Step 6.
Expected: exit 1 with `Phase 0 harness failed: … CompileError …` or `Bergamot aborted while loading`. Restore the CSP; rerun Step 6 and confirm it passes again.

- [ ] **Step 9: Reclamation sanity**

Read `memory.deltaMB.totalAfterDestroyVsPre` and `totalAfterRecreateDestroyVsPre` in the summary. Record both in the evidence. If either is more than 50 MB, note it as possible retained memory for the owner (it is a finding, not a harness failure).

- [ ] **Step 10: Open the quality report**

Run: `open bench/translate/results/local-arm64/quality.html`
Expected: three tables; rows with changed structure or missing protected strings are tinted.

- [ ] **Step 11: Commit**

```bash
git add bench/translate/harness
git commit -m "Add unattached-view Electron harness for Phase 0 translation measurements"
```

---

### Task 5: Measure on hosted Apple Silicon, Intel Mac and Windows

**Files:**
- Modify: `.github/workflows/translate-phase0.yml` (append the `measure` job)
- Create: `bench/translate/verdict.mjs`
- Create: `bench/translate/README.md`

**Interfaces:**
- Consumes: workflow artifact `translate-engine`; `gateVerdict`, `renderMarkdownTable` from `report.js`.
- Produces: workflow artifacts `translate-results-macos-arm64`, `translate-results-macos-x64`, `translate-results-windows-x64`.

- [ ] **Step 1: Append the measure job**

```yaml
  measure:
    needs: build-engine
    strategy:
      fail-fast: false
      matrix:
        include:
          - label: macos-arm64
            runner: macos-15
          - label: macos-x64
            runner: macos-15-intel
          - label: windows-x64
            runner: windows-latest
    runs-on: ${{ matrix.runner }}
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: translate-engine
          path: bench/translate/.cache/engine
      - run: node bench/translate/fetch-inputs.mjs
      - run: npx electron bench/translate/harness/main.js --out=bench/translate/results/${{ matrix.label }}
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: translate-results-${{ matrix.label }}
          path: bench/translate/results/${{ matrix.label }}
          retention-days: 14
          if-no-files-found: error
```

If Task 4 needed `--host=window`, use it here too and say so in the evidence.

- [ ] **Step 2: Write `verdict.mjs`**

```js
// bench/translate/verdict.mjs
// Usage: node bench/translate/verdict.mjs <summary.json> [<summary.json> ...]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { gateVerdict, renderMarkdownTable } = require('./lib/report.js');

const files = process.argv.slice(2);
if (!files.length) throw new Error('usage: verdict.mjs <summary.json> ...');
const summaries = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
process.stdout.write(renderMarkdownTable(summaries));
const verdict = gateVerdict(summaries);
console.log(`\nSpeed and output gate: ${verdict.pass ? 'PASS' : 'FAIL'}`);
for (const r of verdict.reasons) console.log(`- ${r}`);
console.log('Markup fidelity: owner judgement (see quality.html and the markup counts).');
process.exitCode = verdict.pass ? 0 : 2;
```

- [ ] **Step 3: Write `bench/translate/README.md`**

```markdown
# Translation feasibility harness (F43 Phase 0)

Measures Mozilla's Bergamot engine inside an unattached, sandboxed Electron
`WebContentsView`, the placement the F43 design uses. Spec:
`docs/superpowers/specs/2026-10-08-on-device-translation-design.md`.

Pins live in `inputs.json`; Blanc-authored markup cases in `fixtures/markup.json`.
Downloads from Mozilla's bucket and Wikipedia are research-only: shipped Blanc
fetches only approved artifacts mirrored on Blanc infrastructure. Downloads and
results stay in the gitignored `.cache/` and `results/` directories; the
Wikipedia fixture is CC BY-SA and is never committed.

## Run

1. Engine: the `translate-phase0` workflow's `build-engine` job builds it from
   the pinned `mozilla/translations` commit. Download it:
   `gh run download <run-id> --name translate-engine --dir bench/translate/.cache/engine`
2. Inputs: `node bench/translate/fetch-inputs.mjs`
3. Measure: `npx electron bench/translate/harness/main.js --out=bench/translate/results/<label>`
   (add `--host=window` only if the unattached view cannot start; record that divergence)
4. Verdict: `node bench/translate/verdict.mjs bench/translate/results/*/summary.json`

Pushing `spike/translate-phase0` (or dispatching the workflow) runs steps 1–3 on
`macos-15`, `macos-15-intel` and `windows-latest`.
```

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/translate-phase0.yml bench/translate/verdict.mjs bench/translate/README.md
git commit -m "Measure Phase 0 translation on hosted Apple Silicon, Intel Mac and Windows"
git push
```

- [ ] **Step 5: Wait for all four jobs**

Run: `gh run list --workflow=translate-phase0.yml --branch spike/translate-phase0 --limit 1`, then `gh run watch <run-id> --exit-status`.
Expected: `build-engine` and all three `measure` jobs succeed. A failing measure job is a finding: read its log and record it; do not retry blindly.

- [ ] **Step 6: Download the results and print the verdict**

```bash
rm -rf bench/translate/results/ci
for l in macos-arm64 macos-x64 windows-x64; do
  gh run download <run-id> --name translate-results-$l --dir bench/translate/results/ci/$l
done
node bench/translate/verdict.mjs bench/translate/results/local-arm64/summary.json bench/translate/results/ci/*/summary.json
```

Expected: a four-row table, `Speed and output gate: PASS` or `FAIL` with reasons.

---

### Task 6: Evidence and owner gate

**Files:**
- Create: `docs/evidence/translate-phase0-<run date YYYY-MM-DD>/README.md`
- Create: `docs/evidence/translate-phase0-<run date>/summary-{local-arm64,macos-arm64,macos-x64,windows-x64}.json`

- [ ] **Step 1: Copy the summaries**

```bash
D=docs/evidence/translate-phase0-$(date +%F)
mkdir -p "$D"
cp bench/translate/results/local-arm64/summary.json "$D/summary-local-arm64.json"
for l in macos-arm64 macos-x64 windows-x64; do cp bench/translate/results/ci/$l/summary.json "$D/summary-$l.json"; done
```

These summaries contain fixture-derived markup cases (Blanc-authored, MIT) but no Wikipedia text: `summarize` keeps only Wikipedia structure booleans. Confirm with `grep -c "Tour Eiffel\|tour Eiffel" "$D"/*.json` → `0` for each file; if not, strip the offending fields before committing.

- [ ] **Step 2: Write the evidence README**

Fill every bracketed value from the summaries and the run; leave nothing bracketed.

```markdown
# F43 Phase 0 — on-device translation feasibility (<run date>)

Spec: `docs/superpowers/specs/2026-10-08-on-device-translation-design.md`
Plan: `docs/superpowers/plans/2026-10-08-translation-phase0-feasibility.md`
Workflow run: <run URL>; branch `spike/translate-phase0` at <commit SHA>, based on `origin/main` <SHA>.

## Provenance

- Engine: mozilla/translations `69455acaecbe8650cdba988dbcf7c10ca20e7c48` (Bergamot v0.6.0), emsdk 3.1.8; wrap: <upstream|blanc>; wasm sha256 <hash>, <bytes> bytes (<gz bytes> gzipped).
- Model: fr→en base-memory; decompressed hashes match `bench/translate/inputs.json`.
- Article fixture: fr.wikipedia "Tour Eiffel" revision 240161358 (CC BY-SA 4.0), response sha256 `4680cf2e…9507` verified; <N> words; text not committed.
- Markup fixtures: `bench/translate/fixtures/markup.json` (Blanc-authored).
- Sources are research-only; production requires Blanc-mirrored approved artifacts.
- Engine host: <unattached WebContentsView | WebContentsView in hidden BrowserWindow — divergence: …>. Electron 44.5.1, `sandbox: true`, `backgroundThrottling: false`, CSP as in the spec; fallback GEMM (no `mozIntGemm`).
- Hosted runners are shared VMs; the local row is the owner's Apple Silicon Mac.

## Results

<paste the table printed by verdict.mjs>

Warm samples per host (ms): <host: five values>.
End-to-end readiness breakdown per host (input transfer / worker start / engine load / model load): <values>.
Memory per host (MB): pre total <>, baseline main/engine/total <>, peak main/engine/total <>, settled engine/total <>, after worker terminate engine/total <>, after destroy main/total <>, after recreate+destroy main/total <>.
Download size per language (model + lex + vocab, gzipped): <MB>. Engine: <MB> gzipped.

## Speed and output gate

<PASS|FAIL> — <reasons, or "Intel Mac median warm time was N ms per 2,000 words (limit 10,000 ms); English check passed on all hosts">.

## Reclamation

After destroying the engine view, total process-tree memory was <+/−N MB> versus before the view existed; after a destroy-and-recreate cycle, <+/−N MB>. <Interpretation; flag anything over 50 MB.>

## Markup fidelity (owner judgement required)

HTML mode: <kept>/<total> fixtures kept structure; marker mode: <kept>/<total>; Wikipedia paragraphs: <kept>/<total>. Protected-string failures: <n> (<which cases>). Observations from `quality.html`: <list>.

Owner verdict: pending.

## Decision

Pending owner review. If both gates pass, the next step is the F43 feature implementation plan, which must also choose between HTML mode and marker mode based on these results.
```

- [ ] **Step 3: Commit and push**

```bash
git add docs/evidence/translate-phase0-*
git commit -m "Record F43 Phase 0 translation feasibility evidence"
git push
```

- [ ] **Step 4: Stop for the owner**

Send the owner the evidence README path, the table, the gate verdict, the reclamation numbers, and `bench/translate/results/local-arm64/quality.html` (local file, not committed). Ask for the markup-fidelity judgement and a go/no-go. Do not start the feature plan until the owner answers.

- [ ] **Step 5: Clean up**

Delete `bench/translate/results/` and `bench/translate/.cache/` only after the owner has reviewed `quality.html`. Do not open a PR for the spike branch until the owner decides what (harness, workflow, evidence) is kept.
