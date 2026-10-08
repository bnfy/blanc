# On-device Translation — Phase 0 Feasibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Mozilla's Bergamot translation engine from a pinned commit, run it inside a sandboxed hidden Electron 44.5.1 view exactly as the F43 design places it, and measure speed, memory, sizes and markup quality on Apple Silicon, Intel Mac and Windows, ending in a go/no-go gate for the owner.

**Architecture:** A CI job compiles the WASM engine from `mozilla/translations` at a pinned commit and publishes it as a workflow artifact with a hash manifest. A Node fetch script downloads the pinned fr→en model files and a pinned French Wikipedia revision, verifying hashes. A small standalone Electron app under `bench/translate/harness/` loads the engine in a hidden `sandbox: true` window served from a custom scheme with the F43 CSP (`'wasm-unsafe-eval'`, `connect-src 'none'`), runs it in a dedicated worker, samples the renderer's memory, and writes a summary JSON plus a quality report. A pure, unit-tested `bench/translate/lib/report.js` computes the summary, the markdown table and the gate verdict.

**Tech Stack:** Electron 44.5.1 (repo devDependency), Node 22, Emscripten 3.1.8 via upstream `inference/scripts/build-wasm.py`, GitHub Actions (`ubuntu-22.04`, `macos-15`, `macos-15-intel`, `windows-latest`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-08-on-device-translation-design.md` (section "Phase 0 — feasibility gate").

## Global Constraints

- Engine source: `https://github.com/mozilla/translations` at commit `69455acaecbe8650cdba988dbcf7c10ca20e7c48` (`inference/BERGAMOT_VERSION` = `v0.6.0`), built with upstream `inference/scripts/build-wasm.py` (Emscripten `3.1.8`). MPL-2.0.
- Model: fr→en `base-memory`, release status `Release`. Decompressed SHA-256 pins (cross-checked between Mozilla's GCS `models.json` and Firefox Remote Settings `translations-models-v2` v3.0 on 2026-10-08):
  - `model.fren.intgemm.alphas.bin` — `15f997bc0d13808b0b0fbd0786e684a3c8a52adcd8071844b76123fdacbf2b90`, 31561787 bytes
  - `lex.50.50.fren.s2t.bin` — `87c6752ea908f5f0347c10ac0cf7d80d9c2f4f20c81c90168f3e8230b56d4440`, 4824120 bytes
  - `vocab.fren.spm` — `783abf3abe075afdf8d85d233994bef2c3a064e935ab1bed946820aff6ac002a`, 814404 bytes
- Fixture: French Wikipedia "Tour Eiffel", revision `240161358`, CC BY-SA 4.0. Fetched at run time and **never committed** (keeps CC BY-SA text out of the MIT tree). Its fetched SHA-256 is recorded in the evidence (Parsoid HTML for a fixed revision is not guaranteed byte-stable over time, so it is recorded rather than pinned).
- Engine config (verbatim from upstream `inference/wasm/tests/engine/translations-engine.worker.mjs`): `beam-size 1`, `normalize 1.0`, `word-penalty 0`, `max-length-break 128`, `mini-batch-words 1024`, `workspace 128`, `max-length-factor 2.0`, `skip-cost true`, `cpu-threads 0`, `quiet true`, `quiet-translation true`, `gemm-precision int8shiftAlphaAll`, `alignment soft`; `INITIAL_MEMORY 234291200`; aligned-memory alignment `model 256`, `lex 64`, `vocab 64`; `BlockingService({ cacheSize: 0 })`.
- Engine view: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `show: false`. CSP on every harness response: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'none'; style-src 'unsafe-inline'`.
- Batch size 64 blocks (spec cap).
- Gate: Intel Mac warm time normalized to 2,000 words must be ≤ 10,000 ms, and the owner must judge markup quality usable. Otherwise stop and return to the owner.
- Every outbound request uses User-Agent `BlancTranslatePhase0/0 (https://blancbrowser.com)`. Never put personal data (names, emails) in requests.
- GitHub Actions are commit-SHA pinned. Pins: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`, `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1`, `actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2`.
- Raw results and caches are gitignored; only the evidence README and the four `summary.json` files are committed.
- Nothing in `src/` changes in Phase 0.

## File Structure

| File | Responsibility |
|---|---|
| `bench/translate/inputs.json` | All pins: engine commit, model paths/hashes/sizes, fixture revision, run sizes. |
| `bench/translate/lib/report.js` | Pure (CommonJS, no Electron): word count, median, tag signature, `summarize`, `gateVerdict`, `renderMarkdownTable`, `renderQualityReport`. |
| `test/unit/translate-phase0-report.test.js` | Unit tests for `report.js`. |
| `bench/translate/fetch-inputs.mjs` | Downloads and verifies model files; downloads the fixture; writes `.cache/`. |
| `bench/translate/wrap-engine.mjs` | Turns upstream build output into a `loadBergamot(Module)` script + wasm + `engine-manifest.json`. |
| `bench/translate/harness/main.js` | Electron main: custom scheme, hidden sandboxed window, input delivery, memory sampling, result writing. |
| `bench/translate/harness/preload.js` | Minimal `benchAPI` bridge. |
| `bench/translate/harness/engine.html` / `engine.js` | Engine page: block extraction from the fixture, worker orchestration, timing. |
| `bench/translate/harness/engine.worker.js` | Loads Bergamot, builds the model, translates batches. |
| `bench/translate/verdict.mjs` | Reads summaries, prints the markdown table and the gate verdict. |
| `bench/translate/README.md` | How to run Phase 0 locally and in CI. |
| `.github/workflows/translate-phase0.yml` | Build engine, then measure on three hosted runners. |
| `.gitignore` | Ignore `bench/translate/.cache/` and `bench/translate/results/`. |
| `docs/evidence/translate-phase0-<run date>/` | README with results, verdict, provenance; the four `summary.json` files. |

---

### Task 0: Workspace

**Files:** none.

- [ ] **Step 1: Create an isolated worktree on a spike branch from the spec branch**

```bash
cd "/Users/anthonyjloria/Projects/Blanc Browser"
git fetch origin
git worktree add ../blanc-translate-phase0 -b spike/translate-phase0 spec/on-device-translation
cd ../blanc-translate-phase0
npm ci
```

Expected: `npm ci` completes. Use a real `npm ci`, never a symlinked `node_modules`.

- [ ] **Step 2: Confirm the base**

Run: `git log --oneline -3`
Expected: the top commits are the spec commits on top of `origin/main`.

---

### Task 1: Pure report module (TDD)

**Files:**
- Create: `bench/translate/lib/report.js`
- Test: `test/unit/translate-phase0-report.test.js`

**Interfaces:**
- Produces (CommonJS exports of `bench/translate/lib/report.js`):
  - `countWords(text: string): number`
  - `median(nums: number[]): number | null`
  - `tagSignature(html: string): string` — e.g. `"a:2,b:1"`, sorted by tag name, lowercase
  - `summarize(input: SummaryInput): Summary`
  - `gateVerdict(summaries: Summary[]): { pass: boolean, reasons: string[] }`
  - `renderMarkdownTable(summaries: Summary[]): string`
  - `renderQualityReport(run: RunResult): string`
- `RunResult` (from the engine page): `{ engineLoadMs, modelLoadMs, articleWords, articleBlocks: string[], articleOut: string[], coldMs, warmMs, markupIn: string[], markupOut: string[], markupMs }`
- `SummaryInput`: `{ host: { platform, arch, cpuModel, cpuCount, totalMemMB, electron }, sizes: { engine: {jsBytes, wasmBytes, wasmGzBytes}, model: { model:{bytes,gzBytes}, lex:{bytes,gzBytes}, vocab:{bytes,gzBytes} } }, run: RunResult, samples: Array<{ t: number, phase: string, kb: number }> }`
- `Summary`: `{ host, sizes, engineLoadMs, modelLoadMs, articleWords, coldMs, warmMs, warmMsPer2000, wordsPerSecWarm, markupMs, markupTagMatch: { matched, total }, baselineRssMB, peakRssMB, settledRssMB }`

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/translate-phase0-report.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  countWords, median, tagSignature, summarize, gateVerdict,
  renderMarkdownTable, renderQualityReport,
} = require('../../bench/translate/lib/report.js');

const host = (arch, platform = 'darwin') => ({
  platform, arch, cpuModel: 'cpu', cpuCount: 4, totalMemMB: 16384, electron: '44.5.1',
});
const sizes = {
  engine: { jsBytes: 100, wasmBytes: 5_000_000, wasmGzBytes: 1_500_000 },
  model: {
    model: { bytes: 31561787, gzBytes: 23_200_000 },
    lex: { bytes: 4824120, gzBytes: 2_600_000 },
    vocab: { bytes: 814404, gzBytes: 400_000 },
  },
};
const run = (over = {}) => ({
  engineLoadMs: 900, modelLoadMs: 300, articleWords: 2100,
  articleBlocks: ['Bonjour le monde.'], articleOut: ['Hello world.'],
  coldMs: 6000, warmMs: 4200,
  markupIn: ['<a href="x">Paris</a> est <b>belle</b>.', '<i>Oui</i>'],
  markupOut: ['<a href="x">Paris</a> is <b>beautiful</b>.', 'Yes'],
  markupMs: 800, ...over,
});

test('countWords splits on any whitespace and ignores empties', () => {
  assert.equal(countWords('  un  deux\ntrois\t'), 3);
  assert.equal(countWords(''), 0);
});

test('median handles odd, even and empty input', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('tagSignature counts opening tags only, sorted and lowercased', () => {
  assert.equal(tagSignature('<A href="x">a</A> <b>c</b><a>d</a><br/>'), 'a:2,b:1,br:1');
  assert.equal(tagSignature('plain'), '');
});

test('summarize computes memory phases, throughput and tag matches', () => {
  const samples = [
    { t: 0, phase: 'idle', kb: 100 * 1024 },
    { t: 100, phase: 'idle', kb: 102 * 1024 },
    { t: 200, phase: 'engine', kb: 400 * 1024 },
    { t: 300, phase: 'markup', kb: 450 * 1024 },
    { t: 5000, phase: 'settle', kb: 300 * 1024 },
    { t: 6000, phase: 'settle', kb: 290 * 1024 },
    { t: 7000, phase: 'settle', kb: 280 * 1024 },
  ];
  const s = summarize({ host: host('arm64'), sizes, run: run(), samples });
  assert.equal(s.baselineRssMB, 101);
  assert.equal(s.peakRssMB, 450);
  assert.equal(s.settledRssMB, 290); // median of settle samples at or after (last t - 2000 ms)
  assert.equal(s.warmMsPer2000, 4000);
  assert.equal(s.wordsPerSecWarm, 500);
  assert.deepEqual(s.markupTagMatch, { matched: 1, total: 2 });
  assert.equal(s.host.arch, 'arm64');
});

test('gateVerdict passes when Intel Mac is within 10 s per 2,000 words', () => {
  const ok = summarize({ host: host('x64'), sizes, run: run(), samples: [] });
  assert.deepEqual(gateVerdict([ok]), { pass: true, reasons: [] });
});

test('gateVerdict fails when Intel Mac is too slow', () => {
  const slow = summarize({ host: host('x64'), sizes, run: run({ warmMs: 12000, articleWords: 2000 }), samples: [] });
  const v = gateVerdict([slow]);
  assert.equal(v.pass, false);
  assert.match(v.reasons[0], /Intel Mac warm 12000 ms per 2,000 words exceeds 10000 ms/);
});

test('gateVerdict fails when no Intel Mac result exists', () => {
  const arm = summarize({ host: host('arm64'), sizes, run: run(), samples: [] });
  assert.deepEqual(gateVerdict([arm]), { pass: false, reasons: ['No Intel Mac (darwin x64) result.'] });
});

test('renderMarkdownTable has one row per summary', () => {
  const a = summarize({ host: host('arm64'), sizes, run: run(), samples: [] });
  const b = summarize({ host: host('x64', 'win32'), sizes, run: run(), samples: [] });
  const md = renderMarkdownTable([a, b]);
  assert.equal(md.trim().split('\n').length, 4); // header, rule, two rows
  assert.match(md, /darwin arm64/);
  assert.match(md, /win32 x64/);
});

test('renderQualityReport escapes all page and engine text', () => {
  const html = renderQualityReport(run({ markupOut: ['<script>alert(1)</script>', 'x'] }));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!/ style="/.test(html)); // CSS lives in a <style> block, not inline attributes
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/translate-phase0-report.test.js`
Expected: FAIL with `Cannot find module '../../bench/translate/lib/report.js'`.

- [ ] **Step 3: Implement `report.js`**

```js
// bench/translate/lib/report.js
'use strict';

// Pure helpers for the F43 Phase 0 feasibility harness. No Electron imports, so
// test/unit can exercise every number that reaches the evidence file.

const GATE_MS_PER_2000_WORDS = 10_000;
const SETTLE_WINDOW_MS = 2000;

function countWords(text) {
  return String(text).split(/\s+/).filter(Boolean).length;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function tagSignature(html) {
  const counts = new Map();
  for (const m of String(html).matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b/g)) {
    const tag = m[1].toLowerCase();
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.keys()].sort().map((t) => `${t}:${counts.get(t)}`).join(',');
}

const mb = (kb) => (kb == null ? null : Math.round(kb / 1024));

function summarize({ host, sizes, run, samples }) {
  const idle = samples.filter((s) => s.phase === 'idle').map((s) => s.kb);
  const settle = samples.filter((s) => s.phase === 'settle');
  const lastT = settle.length ? settle[settle.length - 1].t : 0;
  const settled = settle.filter((s) => s.t >= lastT - SETTLE_WINDOW_MS).map((s) => s.kb);
  const peak = samples.length ? Math.max(...samples.map((s) => s.kb)) : null;
  const matched = run.markupIn.filter((src, i) => tagSignature(src) === tagSignature(run.markupOut[i] || '')).length;
  return {
    host,
    sizes,
    engineLoadMs: Math.round(run.engineLoadMs),
    modelLoadMs: Math.round(run.modelLoadMs),
    articleWords: run.articleWords,
    coldMs: Math.round(run.coldMs),
    warmMs: Math.round(run.warmMs),
    warmMsPer2000: Math.round((run.warmMs * 2000) / run.articleWords),
    wordsPerSecWarm: Math.round(run.articleWords / (run.warmMs / 1000)),
    markupMs: Math.round(run.markupMs),
    markupTagMatch: { matched, total: run.markupIn.length },
    baselineRssMB: mb(median(idle)),
    peakRssMB: mb(peak),
    settledRssMB: mb(median(settled)),
  };
}

function gateVerdict(summaries) {
  const intel = summaries.filter((s) => s.host.platform === 'darwin' && s.host.arch === 'x64');
  if (!intel.length) return { pass: false, reasons: ['No Intel Mac (darwin x64) result.'] };
  const reasons = intel
    .filter((s) => s.warmMsPer2000 > GATE_MS_PER_2000_WORDS)
    .map((s) => `Intel Mac warm ${s.warmMsPer2000} ms per 2,000 words exceeds ${GATE_MS_PER_2000_WORDS} ms.`);
  return { pass: reasons.length === 0, reasons };
}

function renderMarkdownTable(summaries) {
  const head = '| Host | CPU | Engine load ms | Model load ms | Cold ms | Warm ms | Warm ms / 2,000 words | Words/s (warm) | Markup tags kept | Baseline MB | Peak MB | Settled MB |';
  const rule = '|' + '---|'.repeat(12);
  const rows = summaries.map((s) => `| ${s.host.platform} ${s.host.arch} | ${s.host.cpuModel} ×${s.host.cpuCount} | ${s.engineLoadMs} | ${s.modelLoadMs} | ${s.coldMs} | ${s.warmMs} | ${s.warmMsPer2000} | ${s.wordsPerSecWarm} | ${s.markupTagMatch.matched}/${s.markupTagMatch.total} | ${s.baselineRssMB} | ${s.peakRssMB} | ${s.settledRssMB} |`);
  return [head, rule, ...rows].join('\n') + '\n';
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderQualityReport(run) {
  const row = (src, out, sig) => `<tr${sig === false ? ' class="mismatch"' : ''}><td>${esc(src)}</td><td>${esc(out)}</td>${sig === undefined ? '' : `<td>${sig ? 'kept' : 'changed'}</td>`}</tr>`;
  const markupRows = run.markupIn.map((src, i) => row(src, run.markupOut[i] || '', tagSignature(src) === tagSignature(run.markupOut[i] || ''))).join('\n');
  const articleRows = run.articleBlocks.slice(0, 20).map((src, i) => row(src, run.articleOut[i] || '')).join('\n');
  return `<!doctype html>
<meta charset="utf-8">
<title>Phase 0 translation quality</title>
<style>
body { font: 14px/1.45 system-ui, sans-serif; margin: 24px; }
table { border-collapse: collapse; width: 100%; margin-bottom: 32px; }
td, th { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; text-align: left; }
tr.mismatch td { background: #fff1f0; }
</style>
<h1>Markup-heavy blocks (HTML mode)</h1>
<table><tr><th>French source (HTML)</th><th>English output (HTML)</th><th>Tags</th></tr>
${markupRows}
</table>
<h1>Article blocks (first 20, text mode)</h1>
<table><tr><th>French</th><th>English</th></tr>
${articleRows}
</table>
`;
}

module.exports = {
  countWords, median, tagSignature, summarize, gateVerdict,
  renderMarkdownTable, renderQualityReport,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/translate-phase0-report.test.js`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add bench/translate/lib/report.js test/unit/translate-phase0-report.test.js
git commit -m "Add Phase 0 translation report helpers"
```

---

### Task 2: Pinned inputs and fetch script

**Files:**
- Create: `bench/translate/inputs.json`
- Create: `bench/translate/fetch-inputs.mjs`
- Modify: `.gitignore` (after the `bench/tab-import/results/` line)

**Interfaces:**
- Produces in `bench/translate/.cache/`: `model`, `lex`, `vocab` (decompressed, hash-verified), `fixture.html`, `inputs-meta.json` with `{ model: { <kind>: { bytes, gzBytes } }, fixture: { revid, sha256, bytes } }`.

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
    "url": "https://fr.wikipedia.org/api/rest_v1/page/html/Tour_Eiffel/240161358"
  },
  "run": {
    "articleWords": 2000,
    "markupBlocks": 60,
    "batchSize": 64
  }
}
```

- [ ] **Step 2: Write `fetch-inputs.mjs`**

```js
// bench/translate/fetch-inputs.mjs
// Downloads the pinned fr→en model files (verifying decompressed SHA-256 and
// size) and the pinned Wikipedia fixture into bench/translate/.cache/.
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

const meta = { model: {} };
for (const [kind, f] of Object.entries(inputs.model.files)) {
  const gz = await get(`${inputs.model.baseUrl}/${f.path}`);
  const raw = gunzipSync(gz);
  const got = sha(raw);
  if (raw.length !== f.size || got !== f.sha256) {
    throw new Error(`${kind}: expected ${f.sha256} (${f.size} bytes), got ${got} (${raw.length} bytes)`);
  }
  writeFileSync(path.join(cache, kind), raw);
  meta.model[kind] = { bytes: raw.length, gzBytes: gz.length };
  console.log(`ok ${kind}: ${raw.length} bytes (${gz.length} gzipped), sha256 verified`);
}

const html = await get(inputs.fixture.url);
writeFileSync(path.join(cache, 'fixture.html'), html);
meta.fixture = { revid: inputs.fixture.revid, sha256: sha(html), bytes: html.length };
console.log(`ok fixture: revision ${inputs.fixture.revid}, ${html.length} bytes, sha256 ${meta.fixture.sha256}`);

writeFileSync(path.join(cache, 'inputs-meta.json'), JSON.stringify(meta, null, 2) + '\n');
```

- [ ] **Step 3: Ignore caches and raw results**

Add after `bench/tab-import/results/` in `.gitignore`:

```
bench/translate/.cache/
bench/translate/results/
```

- [ ] **Step 4: Run the fetch and verify hashes**

Run: `node bench/translate/fetch-inputs.mjs`
Expected: three `ok model|lex|vocab … sha256 verified` lines and one `ok fixture` line; `git status --short` shows no files under `bench/translate/.cache/`.

- [ ] **Step 5: Negative control — a wrong pin must fail**

Temporarily change the last hex digit of `model.files.vocab.sha256` in `inputs.json`, run `node bench/translate/fetch-inputs.mjs`.
Expected: exits non-zero with `vocab: expected …`. Revert the change (`git checkout bench/translate/inputs.json` if already committed, otherwise undo the edit) and re-run Step 4.

- [ ] **Step 6: Commit**

```bash
git add bench/translate/inputs.json bench/translate/fetch-inputs.mjs .gitignore
git commit -m "Pin Phase 0 translation inputs and add verified fetch"
```

---

### Task 3: Engine build in CI

**Files:**
- Create: `bench/translate/wrap-engine.mjs`
- Create: `.github/workflows/translate-phase0.yml` (build job only in this task)

**Interfaces:**
- Produces the workflow artifact `translate-engine` containing `bergamot-translator.js` (defines global `function loadBergamot(Module)`), `bergamot-translator.wasm`, and `engine-manifest.json`:
  `{ upstreamCommit, wrap: "upstream" | "blanc", files: { "bergamot-translator.js": { bytes, sha256 }, "bergamot-translator.wasm": { bytes, gzBytes, sha256 } } }`

- [ ] **Step 1: Write `wrap-engine.mjs`**

Upstream's `prepare_js_artifact()` (wrapping the Emscripten output in `function loadBergamot(Module)`) exists in `build-wasm.py` but is not called by `main()` at the pinned commit, so the harness applies the same wrap when the symbol is missing.

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
# in a hidden sandboxed Electron view on Apple Silicon, Intel Mac and Windows.
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

- [ ] **Step 3: Commit and push the spike branch to run the build**

```bash
git add bench/translate/wrap-engine.mjs .github/workflows/translate-phase0.yml
git commit -m "Build Bergamot engine for Phase 0 in CI"
git push -u origin spike/translate-phase0
```

- [ ] **Step 4: Wait for the build job and inspect it**

Run: `gh run list --workflow=translate-phase0.yml --branch spike/translate-phase0 --limit 1` then `gh run watch <run-id> --exit-status`.
Expected: `build-engine` succeeds; its "Wrap and hash engine" log prints the manifest with a wasm of roughly 4–6 MB.
If the upstream build fails on the hosted runner, do not patch upstream sources: read the failing log, use superpowers:systematic-debugging, and report the failure to the owner before trying another build route (e.g. upstream's Docker image).

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
- Consumes: `report.js` exports (Task 1); `.cache/{model,lex,vocab,fixture.html,inputs-meta.json}` (Task 2); `.cache/engine/{bergamot-translator.js,bergamot-translator.wasm,engine-manifest.json}` (Task 3).
- `window.benchAPI` (preload): `getInputs(): Promise<{ wasm: Uint8Array, model: Uint8Array, lex: Uint8Array, vocab: Uint8Array, fixtureHtml: string, articleWords: number, markupBlocks: number, batchSize: number }>`, `mark(phase: string): void`, `report(run: RunResult): void`, `fail(message: string): void`.
- Worker messages: in `{ type: 'init', wasm: ArrayBuffer, files: { model, lex, vocab: ArrayBuffer } }` → out `{ type: 'ready', engineLoadMs, modelLoadMs }`; in `{ type: 'translate', blocks: string[], html: boolean, batchSize: number }` → out `{ type: 'translated', ms, out: string[] }`; any failure → `{ type: 'error', message }`.
- Produces in `--out` dir: `summary.json` (a `Summary`), `run.json` (raw `RunResult` + samples, gitignored), `quality.html`.

- [ ] **Step 1: Write `preload.js`**

```js
// bench/translate/harness/preload.js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('benchAPI', {
  getInputs: () => ipcRenderer.invoke('bench:inputs'),
  mark: (phase) => ipcRenderer.send('bench:mark', String(phase)),
  report: (run) => ipcRenderer.send('bench:report', run),
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

(The CSP arrives as a response header from the scheme handler, matching how F43's engine document is planned.)

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
```

- [ ] **Step 4: Write `engine.js`**

```js
// bench/translate/harness/engine.js
'use strict';

const toArrayBuffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const words = (t) => t.split(/\s+/).filter(Boolean).length;

function extractBlocks(html, articleWords, markupBlocks) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('sup.reference, style, .mw-ref, .noprint').forEach((n) => n.remove());
  const paras = [...doc.querySelectorAll('section p')].filter((p) => p.textContent.trim().length > 40);
  const article = [];
  let total = 0;
  for (const p of paras) {
    if (total >= articleWords) break;
    const text = p.textContent.replace(/\s+/g, ' ').trim();
    article.push(text);
    total += words(text);
  }
  const markup = paras
    .filter((p) => p.querySelector('a, b, i, em, strong'))
    .slice(0, markupBlocks)
    .map((p) => p.innerHTML.replace(/\s+/g, ' ').trim());
  return { article, articleWordCount: total, markup };
}

function makeWorker() {
  const worker = new Worker('engine.worker.js');
  return (message, transfer = []) => new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => (data.type === 'error' ? reject(new Error(data.message)) : resolve(data));
    worker.onerror = (e) => reject(new Error(e.message || 'worker error'));
    worker.postMessage(message, transfer);
  });
}

async function main() {
  const api = window.benchAPI;
  // One second of idle samples (main's default phase) before anything loads.
  await new Promise((r) => setTimeout(r, 1000));
  const inputs = await api.getInputs();
  const { article, articleWordCount, markup } = extractBlocks(inputs.fixtureHtml, inputs.articleWords, inputs.markupBlocks);
  if (articleWordCount < inputs.articleWords) throw new Error(`fixture too short: ${articleWordCount} words`);
  const call = makeWorker();
  const wasm = toArrayBuffer(inputs.wasm);
  const files = { model: toArrayBuffer(inputs.model), lex: toArrayBuffer(inputs.lex), vocab: toArrayBuffer(inputs.vocab) };

  api.mark('engine');
  const ready = await call({ type: 'init', wasm, files }, [wasm, files.model, files.lex, files.vocab]);
  api.mark('cold');
  const cold = await call({ type: 'translate', blocks: article, html: false, batchSize: inputs.batchSize });
  api.mark('warm');
  const warm = await call({ type: 'translate', blocks: article, html: false, batchSize: inputs.batchSize });
  api.mark('markup');
  const mk = await call({ type: 'translate', blocks: markup, html: true, batchSize: inputs.batchSize });

  api.report({
    engineLoadMs: ready.engineLoadMs,
    modelLoadMs: ready.modelLoadMs,
    articleWords: articleWordCount,
    articleBlocks: article,
    articleOut: warm.out,
    coldMs: cold.ms,
    warmMs: warm.ms,
    markupIn: markup,
    markupOut: mk.out,
    markupMs: mk.ms,
  });
}

main().catch((err) => window.benchAPI.fail(String((err && err.stack) || err)));
```

- [ ] **Step 5: Write `main.js`**

```js
// bench/translate/harness/main.js
// Usage: npx electron bench/translate/harness/main.js --out=<dir>
'use strict';
const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { summarize, renderQualityReport } = require('../lib/report.js');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const ENGINE = path.join(CACHE, 'engine');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT = path.resolve(outArg ? outArg.slice('--out='.length) : path.join(ROOT, 'results', 'local'));
const RUN_CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'inputs.json'), 'utf8')).run;
const SCHEME = 'bench-translate';
const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'none'; style-src 'unsafe-inline'";
const FILES = {
  'engine.html': path.join(__dirname, 'engine.html'),
  'engine.js': path.join(__dirname, 'engine.js'),
  'engine.worker.js': path.join(__dirname, 'engine.worker.js'),
  'bergamot-translator.js': path.join(ENGINE, 'bergamot-translator.js'),
};
const TIMEOUT_MS = 10 * 60 * 1000;
const SETTLE_MS = 5000;

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true } }]);

let win = null;
let phase = 'idle';
const samples = [];

function sample() {
  if (!win || win.isDestroyed()) return;
  const pid = win.webContents.getOSProcessId();
  const metric = app.getAppMetrics().find((m) => m.pid === pid);
  if (metric) samples.push({ t: Date.now(), phase, kb: metric.memory.workingSetSize });
}

function fail(message) {
  console.error(`Phase 0 harness failed: ${message}`);
  app.exit(1);
}

app.whenReady().then(async () => {
  protocol.handle(SCHEME, (req) => {
    const name = new URL(req.url).pathname.replace(/^\//, '');
    const file = FILES[name];
    if (!file) return new Response('not found', { status: 404 });
    const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8';
    return new Response(fs.readFileSync(file), { headers: { 'content-type': type, 'content-security-policy': CSP } });
  });

  ipcMain.handle('bench:inputs', () => ({
    wasm: fs.readFileSync(path.join(ENGINE, 'bergamot-translator.wasm')),
    model: fs.readFileSync(path.join(CACHE, 'model')),
    lex: fs.readFileSync(path.join(CACHE, 'lex')),
    vocab: fs.readFileSync(path.join(CACHE, 'vocab')),
    fixtureHtml: fs.readFileSync(path.join(CACHE, 'fixture.html'), 'utf8'),
    articleWords: RUN_CFG.articleWords,
    markupBlocks: RUN_CFG.markupBlocks,
    batchSize: RUN_CFG.batchSize,
  }));
  ipcMain.on('bench:mark', (_e, p) => { phase = p; sample(); });
  ipcMain.on('bench:fail', (_e, m) => fail(m));
  ipcMain.on('bench:report', async (_e, run) => {
    phase = 'settle';
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    sample();
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
      },
      sizes: {
        engine: {
          jsBytes: engineManifest.files['bergamot-translator.js'].bytes,
          wasmBytes: engineManifest.files['bergamot-translator.wasm'].bytes,
          wasmGzBytes: engineManifest.files['bergamot-translator.wasm'].gzBytes,
        },
        model: inputsMeta.model,
      },
      run,
      samples,
    });
    summary.provenance = { engine: engineManifest, fixture: inputsMeta.fixture };
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify({ run, samples }, null, 2) + '\n');
    fs.writeFileSync(path.join(OUT, 'quality.html'), renderQualityReport(run));
    console.log(JSON.stringify(summary, null, 2));
    app.exit(0);
  });

  setTimeout(() => fail('timed out after 10 minutes'), TIMEOUT_MS).unref();

  win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.webContents.on('render-process-gone', (_e, d) => fail(`engine renderer gone: ${d.reason}`));
  win.webContents.on('console-message', (e) => console.log(`[engine] ${e.message}`));
  setInterval(sample, 100).unref();
  await win.loadURL(`${SCHEME}://harness/engine.html`);
});
```

The baseline (`phase === 'idle'`) is the loaded engine page during the one-second wait at the top of `engine.js`, before any input or engine bytes reach the renderer.

- [ ] **Step 6: Run locally (Apple Silicon)**

Run: `npx electron bench/translate/harness/main.js --out=bench/translate/results/local-arm64`
Expected: exits 0 within a few minutes and prints a summary JSON with non-null `engineLoadMs`, `modelLoadMs`, `coldMs`, `warmMs`, `peakRssMB`, `settledRssMB`, and `articleWords` ≥ 2000.

- [ ] **Step 7: Positive control — prove translation actually happened**

Run: `node -e "const r=require('./bench/translate/results/local-arm64/run.json').run; console.log(r.articleBlocks[0]); console.log('---'); console.log(r.articleOut[0]); const same=r.articleOut.filter((o,i)=>o===r.articleBlocks[i]).length; console.log('unchanged blocks:', same, 'of', r.articleOut.length)"`
Expected: the second paragraph is readable English, and `unchanged blocks` is near 0 (a large count means the engine echoed its input and the timing numbers are meaningless — stop and debug).

- [ ] **Step 8: Negative control — the CSP is really enforced**

Temporarily change `CSP` in `main.js` to drop `'wasm-unsafe-eval'`, rerun Step 6.
Expected: the run fails (`Phase 0 harness failed: … CompileError` or `Bergamot aborted while loading`). Restore the CSP and rerun Step 6 to confirm it passes again.

- [ ] **Step 9: Open the quality report**

Run: `open bench/translate/results/local-arm64/quality.html`
Expected: two tables; markup rows whose tags changed are tinted.

- [ ] **Step 10: Commit**

```bash
git add bench/translate/harness
git commit -m "Add sandboxed Electron harness for Phase 0 translation measurements"
```

---

### Task 5: Measure on hosted Apple Silicon, Intel Mac and Windows

**Files:**
- Modify: `.github/workflows/translate-phase0.yml` (append the `measure` job)
- Create: `bench/translate/verdict.mjs`
- Create: `bench/translate/README.md`

**Interfaces:**
- Consumes: workflow artifact `translate-engine` (Task 3); `report.js` `gateVerdict`, `renderMarkdownTable` (Task 1).
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
console.log(`\nSpeed gate: ${verdict.pass ? 'PASS' : 'FAIL'}`);
for (const r of verdict.reasons) console.log(`- ${r}`);
process.exitCode = verdict.pass ? 0 : 2;
```

- [ ] **Step 3: Write `bench/translate/README.md`**

```markdown
# Translation feasibility harness (F43 Phase 0)

Measures Mozilla's Bergamot engine inside a hidden, sandboxed Electron view, the
placement the F43 design uses. Spec: `docs/superpowers/specs/2026-10-08-on-device-translation-design.md`.

Pins live in `inputs.json`. Downloads and results stay in the gitignored
`.cache/` and `results/` directories; the fixture is CC BY-SA Wikipedia text
and is never committed.

## Run

1. Engine: the `translate-phase0` workflow's `build-engine` job builds it from
   the pinned `mozilla/translations` commit. Download it:
   `gh run download <run-id> --name translate-engine --dir bench/translate/.cache/engine`
2. Inputs: `node bench/translate/fetch-inputs.mjs`
3. Measure: `npx electron bench/translate/harness/main.js --out=bench/translate/results/<label>`
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
Expected: `build-engine` and all three `measure` jobs succeed. A failing measure job is a finding, not something to retry blindly: read its log and record the failure.

- [ ] **Step 6: Download the results and print the verdict**

```bash
rm -rf bench/translate/results/ci
for l in macos-arm64 macos-x64 windows-x64; do
  gh run download <run-id> --name translate-results-$l --dir bench/translate/results/ci/$l
done
node bench/translate/verdict.mjs bench/translate/results/local-arm64/summary.json bench/translate/results/ci/*/summary.json
```

Expected: a four-row table and `Speed gate: PASS` or `FAIL` with reasons.

---

### Task 6: Evidence and owner gate

**Files:**
- Create: `docs/evidence/translate-phase0-<run date YYYY-MM-DD>/README.md`
- Create: `docs/evidence/translate-phase0-<run date>/summary-{local-arm64,macos-arm64,macos-x64,windows-x64}.json` (copies of the four `summary.json` files)

- [ ] **Step 1: Copy the summaries**

```bash
D=docs/evidence/translate-phase0-$(date +%F)
mkdir -p "$D"
cp bench/translate/results/local-arm64/summary.json "$D/summary-local-arm64.json"
for l in macos-arm64 macos-x64 windows-x64; do cp bench/translate/results/ci/$l/summary.json "$D/summary-$l.json"; done
```

- [ ] **Step 2: Write the evidence README**

Fill every bracketed value from the summaries and the run; leave nothing bracketed.

```markdown
# F43 Phase 0 — on-device translation feasibility (<run date>)

Spec: `docs/superpowers/specs/2026-10-08-on-device-translation-design.md`
Plan: `docs/superpowers/plans/2026-10-08-translation-phase0-feasibility.md`
Workflow run: <run URL>; spike branch `spike/translate-phase0` at <commit SHA>.

## Provenance

- Engine: mozilla/translations `69455acaecbe8650cdba988dbcf7c10ca20e7c48` (Bergamot v0.6.0), emsdk 3.1.8; wrap: <upstream|blanc>; wasm sha256 <hash>, <bytes> bytes (<gz bytes> gzipped).
- Model: fr→en base-memory; decompressed hashes match the pins in `bench/translate/inputs.json` (verified by `fetch-inputs.mjs`).
- Fixture: fr.wikipedia "Tour Eiffel" revision 240161358 (CC BY-SA 4.0), fetched sha256 <hash>; <N> words used; text not committed.
- Electron 44.5.1, hidden `sandbox: true` window, CSP as in the spec; fallback GEMM (no `mozIntGemm`).
- Hosted runners are shared VMs; the local row is the owner's Apple Silicon Mac.

## Results

<paste the table printed by verdict.mjs>

Download size per language (model + lex + vocab, gzipped): <MB>. Engine: <MB> gzipped.

## Speed gate

<PASS|FAIL> — <reasons, or "Intel Mac warm time was N ms per 2,000 words (limit 10,000 ms)">.

## Markup quality (owner judgement required)

<matched>/<total> markup blocks kept their tags exactly. Notable problems seen in `quality.html`: <list, with two or three short examples; quote at most a few words of the source>.

Owner verdict: pending.

## Decision

Pending owner review. If both gates pass, the next step is the F43 feature implementation plan.
```

- [ ] **Step 3: Commit and push**

```bash
git add docs/evidence/translate-phase0-*
git commit -m "Record F43 Phase 0 translation feasibility evidence"
git push
```

- [ ] **Step 4: Stop for the owner**

Send the owner the evidence README path, the four-row table, the speed verdict, and `bench/translate/results/local-arm64/quality.html` (local file, not committed). Ask for the markup-quality judgement and a go/no-go. Do not start the feature plan until the owner answers.

- [ ] **Step 5: Clean up**

Delete the Electron `results/` and `.cache/` directories only after the owner has reviewed `quality.html`; do not open a PR for the spike branch until the owner decides what (harness, workflow, evidence) is kept.
