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

test('gateVerdict ignores diagnostic runs with renderer backgrounding disabled for the Intel speed gate', () => {
  const diagnostic = { ...host('x64'), rendererBackgrounding: false };
  const fastDiagnostic = summary({}, diagnostic);
  assert.deepEqual(gateVerdict([fastDiagnostic]), { pass: false, reasons: ['No Intel Mac (darwin x64) result.'] });
  const slowProduction = summary({ warmMs: [12000, 12500, 11800, 12100, 12200], articleWords: 2000 }, host('x64'));
  assert.match(gateVerdict([slowProduction, fastDiagnostic]).reasons[0], /Intel Mac median warm 12100 ms/);
});

test('renderMarkdownTable has one row per summary and labels diagnostic runs', () => {
  const md = renderMarkdownTable([summary(), summary({}, host('x64', 'win32')), summary({}, { ...host('x64'), rendererBackgrounding: false })]);
  assert.equal(md.trim().split('\n').length, 5);
  assert.match(md, /darwin arm64 \(view\)/);
  assert.match(md, /win32 x64 \(view\)/);
  assert.match(md, /darwin x64 \(view, backgrounding off — diagnostic\)/);
});

test('renderQualityReport escapes page and engine text and uses no inline styles', () => {
  const html = renderQualityReport(full({ articleOut: ['<script>alert(1)</script>'] }), fixtures);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!/ style="/.test(html));
});
