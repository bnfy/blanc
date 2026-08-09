const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const measure = require('../../bench/memory/lib/measure');
const proctree = require('../../bench/memory/lib/proctree');
const stats = require('../../bench/memory/lib/stats');
const settle = require('../../bench/memory/lib/settle');
const launch = require('../../bench/memory/lib/launch');
const registry = require('../../bench/memory/lib/registry');
const pageload = require('../../bench/memory/lib/pageload');
const report = require('../../bench/memory/lib/report');
const run = require('../../bench/memory/run');

const MiB = 1024 * 1024;

test('size tokens parse with binary suffixes, and an exact byte count wins', () => {
  assert.equal(measure.parseSizeToBytes('512'), 512);
  assert.equal(measure.parseSizeToBytes('1K'), 1024);
  assert.equal(measure.parseSizeToBytes('123.4M'), Math.round(123.4 * MiB));
  assert.equal(measure.parseSizeToBytes('2G'), 2 * 1024 ** 3);
  // A rounded suffix next to an exact count must never win over the exact one.
  assert.equal(measure.parseSizeToBytes('1.2M (1234567 bytes)'), 1234567);
  assert.equal(measure.parseSizeToBytes('1,234,567 bytes'), 1234567);
  assert.equal(measure.parseSizeToBytes('not a size'), null);
  assert.equal(measure.parseSizeToBytes(undefined), null);
});

test('vmmap summary reads current footprint, never the peak line beneath it', () => {
  const stdout = [
    'Process:         Google Chrome [123]',
    'Physical footprint:         431.4M',
    'Physical footprint (peak):  902.7M',
  ].join('\n');
  assert.equal(measure.parseVmmapSummary(stdout), Math.round(431.4 * MiB));
  assert.equal(measure.parseVmmapSummary('no footprint here'), null);
});

test('footprint output skips peak/lifetime lines and prefers exact bytes', () => {
  const stdout = [
    'Blanc [456]:',
    '  peak footprint: 900M',
    '  phys_footprint: 220.5M (231211008 bytes)',
  ].join('\n');
  assert.equal(measure.parseFootprint(stdout), 231211008);
  assert.equal(measure.parseFootprint('lifetime max footprint: 900M'), null);
});

test('footprint page-size annotation is never mistaken for the footprint', () => {
  // Real footprint(1) output. A naive "prefer an exact byte count" rule matches
  // the "16384 bytes" page size and reports a 142 MB process as 16 KB — small
  // enough to look like a win, non-zero enough to pass a liveness check.
  const real = 'com.apple.WebKit.WebContent [27416]: 64-bit Footprint: 142 MB (16384 bytes per page)';
  assert.equal(measure.parseFootprint(real), 142 * MiB);
});

test('the footprint backend uses -pid, and top does not ask for zero processes', () => {
  const byId = Object.fromEntries(measure.BACKENDS.map((b) => [b.id, b]));
  // Captured by stubbing the child process layer would be heavier than needed;
  // the argv is asserted through the backend's own source, which is the thing
  // that was wrong: `-p` is not a footprint(1) flag, and `-n 0` makes top print
  // zero rows rather than all of them.
  const source = require('node:fs').readFileSync(
    require.resolve('../../bench/memory/lib/measure.js'), 'utf8'
  );
  assert.match(source, /'\/usr\/bin\/footprint', \['-pid', String\(pid\)\]/);
  assert.doesNotMatch(source, /'-p',\s*String\(pid\)/);
  assert.match(source, /'\/usr\/bin\/top', \['-l', '1', '-stats', 'pid,mem'\]/);
  assert.doesNotMatch(source, /'-n', '0'/);
  assert.equal(byId.ps.metric, 'rss');
  assert.equal(byId.vmmap.metric, 'phys_footprint');
});

test('canReadPid reports whether a backend can actually read a process', async () => {
  const working = { sample: async (pids) => new Map(pids.map((p) => [p, 1024])) };
  const denied = { sample: async () => new Map() };
  assert.equal(await measure.canReadPid(working, 42), true);
  // A hardened, signed browser denying task_for_pid looks exactly like this.
  assert.equal(await measure.canReadPid(denied, 42), false);
  assert.equal(await measure.canReadPid({ sample: async () => new Map([[42, 0]]) }, 42), false);
});

// Selection can only probe our own unhardened Node process, so the backend it
// picks may read nothing at all for a signed browser. Aborting there would
// strand a run that `top` — no elevation needed, footprint-equivalent column —
// could have measured perfectly well.
const fakeBackends = (readable) =>
  ['footprint', 'vmmap', 'top', 'ps'].map((id) => ({
    id,
    metric: id === 'ps' ? 'rss' : 'phys_footprint',
    sample: async (pids) =>
      readable.includes(id) ? new Map(pids.map((p) => [p, 1024])) : new Map(),
  }));

test('a backend denied by a hardened browser falls back to the next one down', async () => {
  const candidates = fakeBackends(['top', 'ps']);
  const resolved = await measure.resolveReadableBackend(candidates[1], 42, { candidates });
  assert.equal(resolved.backend.id, 'top');
  assert.equal(resolved.downgradedFrom, 'vmmap');
  // Fidelity order is preserved: ps is never reached while top works.
  assert.deepEqual(resolved.tried, ['vmmap', 'top']);
});

test('a backend that reads the browser is used as-is, with nothing tried below it', async () => {
  const candidates = fakeBackends(['vmmap', 'top', 'ps']);
  const resolved = await measure.resolveReadableBackend(candidates[1], 42, { candidates });
  assert.equal(resolved.backend.id, 'vmmap');
  assert.equal(resolved.downgradedFrom, null);
  assert.deepEqual(resolved.tried, ['vmmap']);
});

test('an explicitly pinned backend is never downgraded', async () => {
  const candidates = fakeBackends(['ps']);
  const resolved = await measure.resolveReadableBackend(candidates[1], 42, {
    candidates,
    pinned: true,
  });
  // Substituting rss for phys_footprint under a --backend= pin would collect a
  // different metric than the caller asked for.
  assert.equal(resolved.backend, null);
  assert.deepEqual(resolved.tried, ['vmmap']);
});

test('a run where every backend is denied resolves to nothing, listing what it tried', async () => {
  const candidates = fakeBackends([]);
  const resolved = await measure.resolveReadableBackend(candidates[0], 42, { candidates });
  assert.equal(resolved.backend, null);
  assert.equal(resolved.downgradedFrom, null);
  assert.deepEqual(resolved.tried, ['footprint', 'vmmap', 'top', 'ps']);
});

test('top output parses pid/mem rows and ignores its header block', () => {
  const stdout = [
    'Processes: 500 total, 2 running',
    '2026/08/09 10:00:00',
    'PID    MEM',
    '123    431M',
    '456    12M+',
    'garbage line',
  ].join('\n');
  const parsed = measure.parseTopMem(stdout);
  assert.equal(parsed.get(123), 431 * MiB);
  // A trailing growth marker must not defeat the parse.
  assert.equal(parsed.get(456), 12 * MiB);
  assert.equal(parsed.size, 2);
});

test('ps rss is converted from kilobytes to bytes', () => {
  const parsed = measure.parsePsRss(' 123  2048\n 456  1024\n');
  assert.equal(parsed.get(123), 2 * MiB);
  assert.equal(parsed.get(456), 1 * MiB);
});

test('sampleTotal sums present pids and reports vanished ones instead of zeroing them', async () => {
  const backend = { sample: async () => new Map([[1, 100], [2, 200]]) };
  const result = await measure.sampleTotal(backend, [1, 2, 3]);
  assert.equal(result.totalBytes, 300);
  assert.deepEqual(result.missing, [3]);
  assert.equal(result.perPid.length, 2);
});

test('ps snapshot keeps executable paths that contain spaces intact', () => {
  const rows = proctree.parsePsSnapshot(
    '  123     1 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n' +
    '  124   123 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)\n' +
    'noise\n'
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].pid, 123);
  assert.equal(rows[1].ppid, 123);
  assert.match(rows[1].command, /Helper \(Renderer\)$/);
});

test('descendantsOf walks transitively, includes the root, and survives a parent cycle', () => {
  const rows = [
    { pid: 1, ppid: 0 },
    { pid: 10, ppid: 1 },
    { pid: 11, ppid: 10 },
    { pid: 12, ppid: 11 },
    { pid: 20, ppid: 1 },
  ];
  assert.deepEqual(proctree.descendantsOf(rows, 10), [10, 11, 12]);
  assert.deepEqual(proctree.descendantsOf(rows, 999), []);
  assert.deepEqual(proctree.descendantsOf([{ pid: 5, ppid: 5 }], 5), [5]);
});

test('bundle matching respects path boundaries', () => {
  const rows = [
    { pid: 1, command: '/Applications/Arc.app/Contents/MacOS/Arc' },
    { pid: 2, command: '/Applications/Arcade.app/Contents/MacOS/Arcade' },
    { pid: 3, command: '/Applications/Arc.app.backup/Contents/MacOS/Arc' },
  ];
  // Only the genuine Arc.app subtree — not Arcade.app, not Arc.app.backup.
  assert.deepEqual(proctree.matchingBundle(rows, '/Applications/Arc.app'), [1]);
  assert.deepEqual(proctree.matchingBundle(rows, ''), []);
});

test('the browser process set excludes pre-existing processes but never the root', () => {
  const rows = [
    { pid: 100, ppid: 1, command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    { pid: 101, ppid: 100, command: '/Applications/Google Chrome.app/Contents/MacOS/Helper' },
    // The tester's own Chrome, running before the benchmark started.
    { pid: 900, ppid: 1, command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    { pid: 901, ppid: 900, command: '/Applications/Google Chrome.app/Contents/MacOS/Helper' },
  ];
  const pids = proctree.browserProcessSet(rows, {
    rootPid: 100,
    bundlePath: '/Applications/Google Chrome.app',
    excludePids: [900, 901],
  });
  assert.deepEqual(pids, [100, 101]);
});

test('a re-parented helper is still attributed via the bundle path', () => {
  const rows = [
    { pid: 100, ppid: 1, command: '/Applications/Blanc.app/Contents/MacOS/Blanc' },
    // Parent died, launchd adopted it — no longer a descendant of the root.
    { pid: 105, ppid: 1, command: '/Applications/Blanc.app/Contents/MacOS/Blanc Helper' },
  ];
  const pids = proctree.browserProcessSet(rows, {
    rootPid: 100,
    bundlePath: '/Applications/Blanc.app',
    excludePids: [],
  });
  assert.deepEqual(pids, [100, 105]);
});

test('median and MAD resist a single outlier', () => {
  assert.equal(stats.median([3, 1, 2]), 2);
  assert.equal(stats.median([4, 1, 2, 3]), 2.5);
  assert.equal(stats.median([]), null);
  assert.equal(stats.medianAbsoluteDeviation([10, 10, 10, 1000]), 0);
  const summary = stats.summarize([100, 200, 150]);
  assert.equal(summary.n, 3);
  assert.equal(summary.median, 150);
  assert.equal(summary.min, 100);
  assert.equal(summary.max, 200);
});

test('per-tab cost subtracts the idle baseline and rejects nonsense tab counts', () => {
  assert.equal(stats.perTabBytes(1000, 200, 8), 100);
  assert.equal(stats.perTabBytes(1000, 200, 0), null);
  assert.equal(stats.perTabBytes(NaN, 200, 8), null);
});

test('mixing measurement metrics in one table is refused, not silently rendered', () => {
  assert.equal(stats.requireConsistentMetric([{ metric: 'rss' }, { metric: 'rss' }]), 'rss');
  assert.equal(stats.requireConsistentMetric([]), null);
  assert.throws(
    () => stats.requireConsistentMetric([{ metric: 'rss' }, { metric: 'phys_footprint' }]),
    /different metrics/
  );
});

test('bytes format with binary units', () => {
  assert.equal(stats.formatBytes(512), '512 B');
  assert.equal(stats.formatBytes(2 * MiB), '2.0 MiB');
  assert.equal(stats.formatBytes(1536 * MiB), '1.5 GiB');
  assert.equal(stats.formatBytes(NaN), '—');
});

test('settle detection needs a full flat window', () => {
  assert.equal(settle.isSettled([100, 100], { window: 3 }), false);
  assert.equal(settle.isSettled([100, 500, 100], { window: 3 }), false);
  assert.equal(settle.isSettled([500, 100, 101, 102], { window: 3, tolerance: 0.05 }), true);
  assert.equal(settle.isSettled([0, 0, 0], { window: 3 }), false);
});

test('sampleUntilSettled honours the minimum duration before declaring a flat series settled', async () => {
  let clock = 0;
  const options = {
    intervalMs: 5000,
    minMs: 20_000,
    maxMs: 100_000,
    window: 3,
    tolerance: 0.02,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
  };
  // Perfectly flat from the first sample: without minMs this would settle at
  // sample 3 (t=10s), while the browser is still starting up.
  const flat = await settle.sampleUntilSettled(async () => 100, options);
  assert.equal(flat.settled, true);
  assert.ok(flat.elapsedMs >= 20_000, `settled too early at ${flat.elapsedMs}ms`);

  clock = 0;
  const climbing = await settle.sampleUntilSettled(
    (() => { let v = 100; return async () => (v *= 1.5); })(),
    options
  );
  assert.equal(climbing.settled, false);
  assert.ok(climbing.elapsedMs >= 100_000);
});

test('chromium and blanc launches pass URLs positionally with an isolated profile', () => {
  const plan = launch.buildLaunchPlan(
    { id: 'chrome', family: 'chromium' },
    { profileDir: '/tmp/p', urls: ['https://a.test', 'https://b.test'] }
  );
  assert.ok(plan.args.includes('--user-data-dir=/tmp/p'));
  assert.ok(plan.args.includes('--no-first-run'));
  assert.deepEqual(plan.args.slice(-2), ['https://a.test', 'https://b.test']);
  assert.equal(plan.tabCount, 2);
  assert.deepEqual(plan.files, []);

  // Blanc opens one extra blank tab of its own at startup; the plan must say so
  // rather than let the report compare 2 tabs against 3.
  const blanc = launch.buildLaunchPlan(
    { id: 'blanc', family: 'blanc', extraBlankTabs: 1 },
    { profileDir: '/tmp/p', urls: ['https://a.test', 'https://b.test'] }
  );
  assert.equal(blanc.tabCount, 3);
});

test('gecko launches seed tabs through the profile rather than positional URLs', () => {
  const plan = launch.buildLaunchPlan(
    { id: 'zen', family: 'gecko' },
    { profileDir: '/tmp/p', urls: ['https://a.test', 'https://b.test'] }
  );
  // Positional URLs are unreliable in Gecko, so none are passed.
  assert.ok(!plan.args.some((a) => a.startsWith('https://')));
  assert.deepEqual(plan.args.slice(0, 2), ['--profile', '/tmp/p']);
  assert.ok(plan.args.includes('--no-remote'));
  assert.equal(plan.files.length, 1);
  assert.match(plan.files[0].path, /user\.js$/);
  assert.match(plan.files[0].contents, /"browser\.startup\.homepage", "https:\/\/a\.test\|https:\/\/b\.test"/);
  assert.match(plan.files[0].contents, /"browser\.startup\.page", 1/);
  assert.equal(plan.tabCount, 2);
});

test('gecko profiles disable the tab unloader and accept per-browser extra prefs', () => {
  const plan = launch.buildLaunchPlan(
    { id: 'zen', family: 'gecko', extraPrefs: { 'zen.welcome-screen.seen': true } },
    { profileDir: '/tmp/p', urls: ['https://a.test'] }
  );
  const prefs = plan.files[0].contents;
  // Gecko's tab unloader would discard measured tabs under memory pressure —
  // and discarding helps the series flatten, so settle detection would record
  // it as a clean result. Chromium has no equivalent at these timescales, so
  // leaving it on would discount the Gecko rows alone.
  assert.match(prefs, /"browser\.tabs\.unloadOnLowMemory", false/);
  // A fork whose onboarding is not Mozilla's must be suppressible by JSON edit.
  assert.match(prefs, /"zen\.welcome-screen\.seen", true/);
  // Extra prefs are written last so they can override the shared defaults.
  assert.ok(
    prefs.indexOf('zen.welcome-screen.seen') > prefs.indexOf('browser.startup.homepage'),
    'extraPrefs must be applied last'
  );
});

test('Zen registry entries cover onboarding and keep the nightly channel separate', () => {
  const { browsers } = registry.loadRegistry({ exists: () => false });
  const zen = browsers.find((b) => b.id === 'zen');
  const twilight = browsers.find((b) => b.id === 'zen-twilight');

  assert.equal(zen.extraPrefs['zen.welcome-screen.seen'], true);
  // Twilight.app must NOT be a candidate on the stable entry: resolution takes
  // the first existing candidate and labels the row from the entry, so that
  // would publish a nightly under the label "Zen Browser".
  assert.ok(!JSON.stringify(zen.bundlePath).includes('Twilight'));
  assert.ok(twilight, 'the nightly channel needs its own id');
  assert.deepEqual(twilight.bundlePath, ['/Applications/Twilight.app']);
  // Zen's blocking string must not imply ad blocking.
  assert.match(zen.blocking, /does NOT block ads/i);
});

test('an unknown browser family fails loudly instead of launching something wrong', () => {
  assert.throws(
    () => launch.buildLaunchPlan({ id: 'x', family: 'webkit' }, { profileDir: '/tmp/p', urls: [] }),
    /No launch driver/
  );
});

test('registry resolution tries every bundle and executable candidate', () => {
  const present = new Set([
    '/Applications/Zen.app',
    '/Applications/Zen.app/Contents/MacOS/zen',
  ]);
  const resolved = registry.resolveBrowserPaths(
    {
      id: 'zen',
      bundlePath: ['/Applications/Zen Browser.app', '/Applications/Zen.app'],
      executableName: ['zen', 'Zen'],
    },
    (p) => present.has(p)
  );
  assert.equal(resolved.installed, true);
  assert.equal(resolved.binary, '/Applications/Zen.app/Contents/MacOS/zen');

  const missing = registry.resolveBrowserPaths(
    { id: 'nope', bundlePath: ['/Applications/Nope.app'], executableName: 'Nope' },
    () => false
  );
  assert.equal(missing.installed, false);
  assert.match(missing.resolutionError, /not found/);

  const unsupported = registry.resolveBrowserPaths({ id: 'safari', supported: false }, () => true);
  assert.equal(unsupported.installed, false);
});

test('an explicitly requested but missing browser is an error, not a silent omission', () => {
  const browsers = [
    { id: 'chrome', label: 'Chrome', installed: true },
    { id: 'zen', label: 'Zen', installed: false, resolutionError: 'not found' },
  ];
  assert.throws(() => registry.selectBrowsers(browsers, ['zen']), /not runnable/);
  assert.throws(() => registry.selectBrowsers(browsers, ['nope']), /Unknown browser id/);
  assert.equal(registry.selectBrowsers(browsers, ['chrome']).selected.length, 1);

  // With no explicit selection, missing browsers are skipped and reported.
  const auto = registry.selectBrowsers(browsers, null);
  assert.equal(auto.selected.length, 1);
  assert.deepEqual(auto.skipped, [{ id: 'zen', reason: 'not found' }]);
});

test('the shipped registry is internally consistent', () => {
  const { browsers } = registry.loadRegistry({ exists: () => false });
  const ids = browsers.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate browser ids');
  for (const b of browsers) {
    assert.ok(b.label, `${b.id} needs a label`);
    if (b.supported === false) {
      assert.ok(b.unsupportedReason, `${b.id} must say why it is unsupported`);
    } else {
      assert.ok(
        ['chromium', 'gecko', 'blanc'].includes(b.family),
        `${b.id} has family ${b.family}, which has no launch driver`
      );
    }
  }
  // Blanc must declare its startup blank tab, or every Blanc row is off by one.
  assert.equal(browsers.find((b) => b.id === 'blanc').extraBlankTabs, 1);
});

test('rotation spreads first-position bias across repetitions', () => {
  const items = ['a', 'b', 'c'];
  assert.deepEqual(run.rotate(items, 0), ['a', 'b', 'c']);
  assert.deepEqual(run.rotate(items, 1), ['b', 'c', 'a']);
  assert.deepEqual(run.rotate(items, 3), ['a', 'b', 'c']);
  assert.deepEqual(run.rotate([], 2), []);
});

test('the plan covers every cell and rotates browser order per repetition', () => {
  const browsers = [{ id: 'a' }, { id: 'b' }];
  const plan = run.buildPlan(browsers, ['baseline', 'mixed'], 2);
  assert.equal(plan.length, 8);
  assert.equal(plan[0].browserId, 'a');
  // Second repetition starts with the other browser.
  assert.equal(plan.find((c) => c.rep === 1).browserId, 'b');
});

test('argument parsing rejects unknown flags and bad repetition counts', () => {
  const parsed = run.parseArgs(['--browsers=blanc,chrome', '--reps=5', '--dry-run']);
  assert.deepEqual(parsed.browsers, ['blanc', 'chrome']);
  assert.equal(parsed.reps, 5);
  assert.equal(parsed.dryRun, true);
  assert.throws(() => run.parseArgs(['--nope']), /Unknown option/);
  assert.throws(() => run.parseArgs(['--reps=0']), /positive integer/);
});

test('the report ranks by median, marks unsettled rows, and warns loudly on RSS', () => {
  const makeResult = (id, label, bytes, workload, extra = {}) => ({
    browserId: id,
    label,
    engine: 'Test',
    blocking: 'none',
    workload,
    workloadLabel: workload,
    tabCount: 2,
    metric: 'rss',
    backend: 'ps',
    repetitions: [{ totalBytes: bytes, processCount: 4, settled: true }],
    ...extra,
  });

  const markdown = report.buildMarkdown({
    meta: {
      startedAt: '2026-08-09T10:00:00Z',
      osVersion: '25.0.0',
      arch: 'arm64',
      totalRamGiB: 32,
      backend: 'ps',
      metric: 'rss',
      repetitions: 1,
      skipped: [],
    },
    results: [
      makeResult('blanc', 'Blanc', 300 * MiB, 'mixed', {
        repetitions: [{ totalBytes: 300 * MiB, processCount: 4, settled: false }],
      }),
      makeResult('chrome', 'Chrome', 200 * MiB, 'mixed'),
      makeResult('blanc', 'Blanc', 100 * MiB, 'baseline'),
    ],
  });

  assert.match(markdown, /These numbers are RSS, not phys_footprint/);
  // Lower median ranks first.
  assert.ok(markdown.indexOf('| Chrome |') < markdown.indexOf('| Blanc ⚠️1 |'));
  assert.match(markdown, /⚠️1/);
  // Per-tab column: (300 MiB loaded - 100 MiB idle) / 2 tabs.
  assert.match(markdown, /\| 100 MiB \| 4 \|/);
  assert.match(markdown, /Idle baseline/);
});

test('load verification is driven by observed page visits, not by memory growth', () => {
  const idle = 200 * MiB;
  const baseline = { bytes: idle, processCount: 5 };
  const allPages = { ok: true, requested: 10, loaded: 10, missing: [] };
  const cell = (over) => ({
    workload: 'mixed', processCount: 12, baseline, totalBytes: idle * 3, pages: allPages, ...over,
  });

  assert.equal(run.verifyLoaded(cell()).ok, true);

  // The case memory growth alone could never catch: two of ten pages loaded is
  // comfortably above a 15% floor, and would have been published as a very
  // efficient browser.
  const partial = run.verifyLoaded(cell({
    pages: { ok: false, requested: 10, loaded: 2, missing: ['cnn.com', 'forbes.com'] },
  }));
  assert.equal(partial.ok, false);
  assert.match(partial.reason, /load not confirmed/);
  assert.match(partial.reason, /cnn\.com/);

  // A backend reading nothing must never pass as a very efficient browser.
  const zero = run.verifyLoaded(cell({ totalBytes: 0 }));
  assert.equal(zero.ok, false);
  assert.match(zero.reason, /read nothing/);

  // Navigations recorded but nothing rendered still fails, as a net under the
  // page check.
  const flat = run.verifyLoaded(cell({ totalBytes: idle * 1.02 }));
  assert.equal(flat.ok, false);
  assert.match(flat.reason, /nothing rendered/);
});

test('unreadable processes anywhere in the reported window fail the cell', () => {
  // The reported figure is the median of the last 3 samples, so checking only
  // the final sample would let an undercounted sample sit inside that median
  // while a later, fully-readable one cleared the check.
  const meta = [
    { processCount: 12, missing: 0 },
    { processCount: 12, missing: 4 },
    { processCount: 12, missing: 0 },
    { processCount: 12, missing: 0 },
  ];
  assert.equal(run.summarizeWindow(meta).unreadable, 4);
  // Older samples outside the window are not the reported figure's problem.
  assert.equal(run.summarizeWindow([{ processCount: 9, missing: 7 }, ...meta.slice(1)]).unreadable, 4);

  // Process count is the window's minimum, so a briefly-incomplete tree cannot
  // be papered over by a later sample.
  assert.equal(run.summarizeWindow([
    { processCount: 12, missing: 0 },
    { processCount: 2, missing: 0 },
    { processCount: 12, missing: 0 },
  ]).processCount, 2);

  assert.deepEqual(run.summarizeWindow([]), { unreadable: 0, processCount: 0 });
});

test('an unverifiable cell is rejected, not published with a soft marker', () => {
  // Previously this passed with an "unverified" note attached, so any browser
  // whose baseline cell had failed got its loaded rows through unchecked.
  const verdict = run.verifyLoaded({
    workload: 'mixed', totalBytes: 500 * MiB, processCount: 12, baseline: null,
    pages: { ok: true, requested: 10, loaded: 10, missing: [] },
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /not publishable/);
});

test('a browser tree of one process is broken attribution, not a frugal browser', () => {
  // Applies to the idle baseline too — it is the subtrahend of per-page cost
  // and the denominator of the growth net, so understating it weakens both.
  const idleCell = run.verifyLoaded({
    workload: 'baseline', totalBytes: 50 * MiB, processCount: 1, baseline: null, pages: null,
  });
  assert.equal(idleCell.ok, false);
  assert.match(idleCell.reason, /multi-process even at idle/);

  // A healthy baseline passes without needing pages or a prior baseline.
  assert.equal(run.verifyLoaded({
    workload: 'baseline', totalBytes: 200 * MiB, processCount: 5, baseline: null, pages: null,
  }).ok, true);
});

test('no comparative process-count rule is asserted, since preallocated counts vary', () => {
  // A loaded cell having fewer processes than its own idle baseline is NOT
  // treated as failure: engines preallocate content processes and those counts
  // vary by engine and version, so a monotonicity rule would be unsound.
  const verdict = run.verifyLoaded({
    workload: 'mixed',
    totalBytes: 900 * MiB,
    processCount: 4,
    baseline: { bytes: 200 * MiB, processCount: 9 },
    pages: { ok: true, requested: 10, loaded: 10, missing: [] },
  });
  assert.equal(verdict.ok, true);
});

test('each repetition verifies against its own baseline, not repetition 1\'s', () => {
  // Reusing rep 1's baseline compares a cell measured half an hour later
  // against an idle figure from the start of the run — and if rep 1's baseline
  // came out low, every later repetition's growth ratio is inflated and
  // understated cells sail through.
  assert.notEqual(run.baselineKey('blanc', 0), run.baselineKey('blanc', 1));
  assert.equal(run.baselineKey('blanc', 2), run.baselineKey('blanc', 2));
  assert.notEqual(run.baselineKey('blanc', 0), run.baselineKey('chrome', 0));
});

test('visited pages are matched by host, so redirects and query strings do not read as failures', () => {
  assert.equal(pageload.hostOf('https://www.theverge.com/some/path?utm=x'), 'theverge.com');
  assert.equal(pageload.hostOf('https://theverge.com/'), 'theverge.com');
  assert.equal(pageload.hostOf('not a url'), null);

  const observed = new Set(['theverge.com', 'cnn.com', 'consent.cnn.com']);
  const compared = pageload.comparePages(observed, [
    'https://www.theverge.com/',
    'https://www.cnn.com/',
    'https://www.forbes.com/',
  ]);
  assert.equal(compared.requested, 3);
  assert.equal(compared.loaded, 2);
  assert.deepEqual(compared.missing, ['forbes.com']);
});

test('Blanc visit logs are read from its own history store', () => {
  const hosts = pageload.hostsFromBlancHistory(JSON.stringify({
    entries: [
      { url: 'https://news.ycombinator.com/', title: 'HN' },
      { url: 'https://en.wikipedia.org/wiki/Web_browser', title: 'W' },
      { url: 'not-a-url', title: 'junk' },
    ],
  }));
  assert.ok(hosts.has('news.ycombinator.com'));
  assert.ok(hosts.has('en.wikipedia.org'));
  assert.equal(hosts.size, 2);
  // A corrupt or absent log yields nothing rather than throwing — the caller
  // treats "no evidence" as failure, which is the safe direction.
  assert.equal(pageload.hostsFromBlancHistory('{broken').size, 0);
});

test('each browser family has a known visit-log location', () => {
  assert.match(pageload.historyLocation({ family: 'blanc' }, '/p').file, /\/p\/history\.json$/);
  assert.match(pageload.historyLocation({ family: 'chromium' }, '/p').file, /\/p\/Default\/History$/);
  assert.match(pageload.historyLocation({ family: 'gecko' }, '/p').file, /\/p\/places\.sqlite$/);
  assert.equal(pageload.historyLocation({ family: 'webkit' }, '/p'), null);
});

test('an absent visit log is evidence of failure, not a reason to skip the check', () => {
  const result = pageload.observeLoadedPages(
    { family: 'blanc' }, '/nonexistent-profile', ['https://a.test/']
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /recorded no navigation at all/);

  // A browser family with no known log location cannot be verified, so it fails
  // rather than passing unchecked.
  const unknown = pageload.observeLoadedPages(
    { family: 'webkit' }, '/nonexistent-profile', ['https://a.test/']
  );
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /no visit-log location known/);

  // The idle workload requests nothing, so there is nothing to confirm.
  assert.equal(pageload.observeLoadedPages({ family: 'blanc' }, '/nope', []).ok, true);
});

test('Blanc page observation reads a real profile end to end', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-pageload-'));
  try {
    fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify({
      entries: [
        { url: 'https://news.ycombinator.com/' },
        { url: 'https://en.wikipedia.org/wiki/Web_browser' },
      ],
    }));
    const urls = ['https://news.ycombinator.com/', 'https://en.wikipedia.org/wiki/Web_browser'];
    assert.equal(pageload.observeLoadedPages({ family: 'blanc' }, dir, urls).ok, true);

    const short = pageload.observeLoadedPages(
      { family: 'blanc' }, dir, [...urls, 'https://www.forbes.com/']
    );
    assert.equal(short.ok, false);
    assert.deepEqual(short.missing, ['forbes.com']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SQLite visit logs are read for the Chromium and Gecko families', () => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-sqlite-'));
  try {
    const file = path.join(dir, 'places.sqlite');
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE moz_places (url TEXT)');
    db.exec("INSERT INTO moz_places (url) VALUES ('https://www.theverge.com/x'), ('https://cnn.com/')");
    db.close();

    const hosts = pageload.hostsFromSqlite(file, 'moz_places', 'url');
    assert.ok(hosts.has('theverge.com'));
    assert.ok(hosts.has('cnn.com'));

    fs.mkdirSync(path.join(dir, 'profile'), { recursive: true });
    fs.copyFileSync(file, path.join(dir, 'profile', 'places.sqlite'));
    const result = pageload.observeLoadedPages(
      { family: 'gecko' }, path.join(dir, 'profile'),
      ['https://www.theverge.com/', 'https://www.cnn.com/']
    );
    assert.equal(result.ok, true);
    assert.equal(result.loaded, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('visit-log readability is checked before any browser is launched', () => {
  // node:sqlite is experimental; discovering it is missing per-cell would mean
  // launching browsers for the whole matrix and failing every one of them.
  assert.equal(pageload.checkReadable([{ family: 'blanc' }]).ok, true);
  assert.equal(pageload.checkReadable([{ family: 'blanc' }, { family: 'gecko' }]).ok, true);

  const unknown = pageload.checkReadable([{ family: 'webkit' }]);
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /no visit-log location known/);
});

test('the baseline workload is added when omitted, since nothing verifies without it', () => {
  assert.deepEqual(run.orderWorkloads(['mixed', 'baseline', 'adheavy']), ['baseline', 'mixed', 'adheavy']);
  // Asking for a loaded workload alone used to leave every row unverifiable.
  assert.deepEqual(run.orderWorkloads(['mixed']), ['baseline', 'mixed']);
  // Asking for only the baseline is still a valid, self-contained run.
  assert.deepEqual(run.orderWorkloads(['baseline']), ['baseline']);
});

test('a profile seed a family cannot honour is an error, not a mislabelled run', () => {
  // A "brave-noshields" entry would otherwise run with Shields ON under a
  // label claiming blocking was disabled.
  assert.throws(
    () => run.prepareProfile({ id: 'x', label: 'Brave (no shields)', family: 'chromium', requiresProfileSeed: 'shieldsDisabled' }, null),
    /has no seeding support/
  );
});

test('the report groups by blocking class and anchors percentages to the reference', () => {
  const cell = (id, label, bytes, workload, blockingClass) => ({
    browserId: id, label, engine: 'Test', blocking: blockingClass, blockingClass,
    workload, workloadLabel: workload, workloadPages: 10, tabCount: 10,
    metric: 'phys_footprint', backend: 'vmmap',
    repetitions: [{ totalBytes: bytes, processCount: 12, settled: true }],
  });

  const markdown = report.buildMarkdown({
    meta: {
      startedAt: '2026-08-09T10:00:00Z', osVersion: '25.0.0', arch: 'arm64',
      totalRamGiB: 32, backend: 'vmmap', metric: 'phys_footprint', repetitions: 3,
      skipped: [], failures: [],
    },
    results: [
      cell('blanc', 'Blanc', 400 * MiB, 'mixed', 'ads+trackers'),
      cell('chrome', 'Google Chrome', 800 * MiB, 'mixed', 'none'),
      cell('zen', 'Zen Browser', 600 * MiB, 'mixed', 'trackers'),
      cell('blanc', 'Blanc', 200 * MiB, 'baseline', 'ads+trackers'),
    ],
  });

  // Blocking classes get their own sections, with the mandatory caveat.
  assert.match(markdown, /### No blocking/);
  assert.match(markdown, /### Blocks trackers only/);
  assert.match(markdown, /### Blocks ads and trackers/);
  assert.match(markdown, /grouped by what each browser blocks/);
  // Percentages anchor to Chrome, not to the lowest row.
  assert.match(markdown, /relative to \*\*Google Chrome\*\*/);
  assert.match(markdown, /\| reference \|/);
  // Blanc is half of Chrome, so it reads -50% rather than being the "baseline".
  assert.match(markdown, /-50%/);
});

test('per-page cost divides by workload pages, never by a browser-inflated tab count', () => {
  const row = report.buildRow(
    {
      browserId: 'blanc', label: 'Blanc', workload: 'mixed',
      workloadPages: 10, tabCount: 11, extraBlankTabs: 1,
      repetitions: [{ totalBytes: 1200 * MiB, processCount: 12, settled: true }],
    },
    { repetitions: [{ totalBytes: 200 * MiB, processCount: 3, settled: true }] }
  );
  // (1200 - 200) / 10 pages = 100 MiB. Dividing by 11 tabs would report ~91 MiB
  // and understate Blanc's per-page cost against browsers that divide by 10.
  assert.equal(row.perTabBytes, 100 * MiB);
});

test('failed cells are reported rather than silently absent', () => {
  const markdown = report.buildMarkdown({
    meta: {
      startedAt: 'x', osVersion: 'x', arch: 'x', totalRamGiB: 1,
      backend: 'vmmap', metric: 'phys_footprint', repetitions: 3, skipped: [],
      failures: [{ label: 'Vivaldi', workload: 'mixed', rep: 1, reason: 'only 3% above its own idle baseline' }],
    },
    results: [{
      browserId: 'chrome', label: 'Chrome', workload: 'mixed', workloadPages: 10, tabCount: 10,
      blockingClass: 'none', metric: 'phys_footprint',
      repetitions: [{ totalBytes: 500 * MiB, processCount: 10, settled: true }],
    }],
  });
  assert.match(markdown, /## Failed cells/);
  assert.match(markdown, /Vivaldi/);
  assert.match(markdown, /is \*\*not\*\* a browser that uses little memory/);
});

test('per-browser caveats reach the report instead of staying in the registry', () => {
  const markdown = report.buildMarkdown({
    meta: { startedAt: 'x', osVersion: 'x', arch: 'x', totalRamGiB: 1, backend: 'vmmap', metric: 'phys_footprint', repetitions: 1, skipped: [], failures: [] },
    results: [{
      browserId: 'arc', label: 'Arc', workload: 'mixed', workloadPages: 10, tabCount: 10,
      blockingClass: 'none', metric: 'phys_footprint',
      notes: ['Arc may ignore --user-data-dir.'],
      repetitions: [{ totalBytes: 500 * MiB, processCount: 10, settled: true }],
    }],
  });
  assert.match(markdown, /## Per-browser caveats/);
  assert.match(markdown, /Arc may ignore --user-data-dir/);
});

test('every runnable registry entry declares a blocking class the report can group on', () => {
  const { browsers } = registry.loadRegistry({ exists: () => false });
  const valid = new Set(report.BLOCKING_CLASSES.map((c) => c.id));
  for (const b of browsers.filter((x) => x.supported !== false)) {
    assert.ok(valid.has(b.blockingClass), `${b.id} has blockingClass ${b.blockingClass}`);
  }
  // Vivaldi blocks trackers only out of the box; classing it with the ad
  // blockers would put it in the wrong comparison group.
  assert.equal(browsers.find((b) => b.id === 'vivaldi').blockingClass, 'trackers');
  assert.equal(browsers.find((b) => b.id === 'blanc').blockingClass, 'ads+trackers');
  assert.equal(browsers.find((b) => b.id === 'blanc-noblock').blockingClass, 'none');
  // Brave's in-bundle Sparkle updater must be suppressed or it can download an
  // update inside the sampling window.
  assert.ok(browsers.find((b) => b.id === 'brave').extraArgs.includes('--disable-brave-update'));
});

test('the report refuses to render a table mixing metrics', () => {
  assert.throws(
    () => report.buildMarkdown({
      meta: { startedAt: 'x', osVersion: 'x', arch: 'x', totalRamGiB: 1, backend: 'mixed', repetitions: 1, skipped: [] },
      results: [
        { browserId: 'a', label: 'A', workload: 'w', tabCount: 1, metric: 'rss', repetitions: [{ totalBytes: 1, processCount: 1, settled: true }] },
        { browserId: 'b', label: 'B', workload: 'w', tabCount: 1, metric: 'phys_footprint', repetitions: [{ totalBytes: 1, processCount: 1, settled: true }] },
      ],
    }),
    /different metrics/
  );
});
