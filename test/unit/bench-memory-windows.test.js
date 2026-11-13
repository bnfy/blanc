// The Windows port of bench/memory (docs/superpowers/specs/2026-11-09-windows-memory-benchmark-design.md).
//
// Every function under test takes the platform as an argument and defaults to
// the macOS behavior, so these run identically on a Mac, on the windows-latest
// leg of unit-tests.yml, and on Linux. Nothing here launches a browser or a
// PowerShell: the I/O edges are proven on a real Windows machine, not here.

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const measure = require('../../bench/memory/lib/measure');
const proctree = require('../../bench/memory/lib/proctree');
const launch = require('../../bench/memory/lib/launch');
const registry = require('../../bench/memory/lib/registry');
const report = require('../../bench/memory/lib/report');
const winps = require('../../bench/memory/lib/winps');
const run = require('../../bench/memory/run');

const MiB = 1024 * 1024;
const CHROME_DIR = 'C:\\Program Files\\Google\\Chrome\\Application';
const CHROME_EXE = `${CHROME_DIR}\\chrome.exe`;

// --- PowerShell plumbing ----------------------------------------------------

test('PowerShell scripts travel as UTF-16LE base64, so quoting can never break them', () => {
  const script = `Get-Item -LiteralPath 'C:\\Program Files\\Zen "Browser"\\zen.exe' | Select-Object Name`;
  const encoded = winps.encodeCommand(script);
  assert.match(encoded, /^[A-Za-z0-9+/]+=*$/);
  assert.equal(Buffer.from(encoded, 'base64').toString('utf16le'), script);
});

test('single quotes inside a PowerShell string are doubled, never left to end it early', () => {
  assert.equal(winps.psQuote("C:\\Users\\O'Brien\\x.exe"), "'C:\\Users\\O''Brien\\x.exe'");
  assert.equal(winps.psQuote('plain'), "'plain'");
});

// --- process discovery ------------------------------------------------------

test('a Windows process list parses from ConvertTo-Json, including the shapes it varies between', () => {
  const rows = proctree.parseWindowsProcessJson(JSON.stringify([
    { ProcessId: 4, ParentProcessId: 0, ExecutablePath: null },
    { ProcessId: 100, ParentProcessId: 4, ExecutablePath: CHROME_EXE },
  ]));
  assert.deepEqual(rows, [
    { pid: 4, ppid: 0, state: null, command: '' },
    { pid: 100, ppid: 4, state: null, command: CHROME_EXE },
  ]);

  // ConvertTo-Json unwraps a one-element array into a bare object.
  const single = proctree.parseWindowsProcessJson(
    JSON.stringify({ ProcessId: 7, ParentProcessId: 1, ExecutablePath: CHROME_EXE })
  );
  assert.equal(single.length, 1);
  assert.equal(single[0].pid, 7);

  // Windows PowerShell 5.1 can emit a byte-order mark.
  assert.equal(proctree.parseWindowsProcessJson(`\uFEFF[{"ProcessId":9,"ParentProcessId":1}]`).length, 1);

  for (const junk of ['', 'null', 'not json', '{"unrelated":1}', undefined]) {
    assert.deepEqual(proctree.parseWindowsProcessJson(junk), [], `junk input: ${junk}`);
  }
});

test('Windows bundle matching ignores case and slash direction but keeps path boundaries', () => {
  const rows = [
    { pid: 1, command: CHROME_EXE },
    { pid: 2, command: CHROME_EXE.toLowerCase() },
    { pid: 3, command: `${CHROME_DIR}2\\chrome.exe` },
    { pid: 4, command: 'C:\\Program Files\\Google\\Chrome\\Application\\118.0.1\\chrome_proxy.exe' },
    { pid: 5, command: '' },
    { pid: 6, command: 'C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe' },
  ];
  assert.deepEqual(proctree.matchingBundle(rows, CHROME_DIR), [1, 2, 4]);
  assert.deepEqual(proctree.matchingBundle(rows, `${CHROME_DIR}\\`), [1, 2, 4]);
  assert.deepEqual(proctree.matchingBundle(rows, CHROME_DIR.replace(/\\/g, '/')), [1, 2, 4]);
});

test('macOS bundle matching stays case-sensitive and slash-only, exactly as before', () => {
  const rows = [
    { pid: 1, command: '/Applications/Arc.app/Contents/MacOS/Arc' },
    { pid: 2, command: '/Applications/arc.app/Contents/MacOS/Arc' },
  ];
  assert.deepEqual(proctree.matchingBundle(rows, '/Applications/Arc.app'), [1]);
});

test('the Windows process set excludes pre-existing processes but never the root', () => {
  const rows = [
    { pid: 100, ppid: 50, state: null, command: CHROME_EXE },
    { pid: 101, ppid: 100, state: null, command: CHROME_EXE },
    // A helper whose parent exited keeps its stale parent id on Windows rather
    // than being re-parented, so only the path can attribute it.
    { pid: 102, ppid: 9999, state: null, command: CHROME_EXE },
    // The tester's own Chrome, already running before the cell started.
    { pid: 900, ppid: 50, state: null, command: CHROME_EXE },
    { pid: 901, ppid: 900, state: null, command: CHROME_EXE },
  ];
  assert.deepEqual(
    proctree.browserProcessSet(rows, { rootPid: 100, bundlePath: CHROME_DIR, excludePids: [900, 901] }),
    [100, 101, 102]
  );
});

// --- measurement ------------------------------------------------------------

test('each platform gets its own backends, and macOS keeps exactly the four it had', () => {
  assert.deepEqual(measure.backendsFor('darwin').map((b) => b.id), ['footprint', 'vmmap', 'top', 'ps']);
  assert.deepEqual(measure.backendsFor('win32').map((b) => b.id), ['perf-private-ws', 'get-process-ws']);
  assert.deepEqual(
    measure.backendsFor('win32').map((b) => b.metric),
    ['private_working_set', 'working_set']
  );
  assert.equal(measure.BACKENDS, measure.backendsFor('darwin'));
  assert.throws(() => measure.backendsFor('linux'), /not supported/);
});

test('private working set is the Windows backend with the highest fidelity', () => {
  // Shared pages are counted once per process in plain working set, the same
  // trap RSS is on macOS, so it must never be the first choice.
  const [best, worst] = measure.backendsFor('win32');
  assert.equal(best.metric, 'private_working_set');
  assert.equal(worst.metric, 'working_set');
});

test('Windows memory readings parse into pid -> bytes and ignore anything malformed', () => {
  const map = measure.parseWindowsMemoryJson(JSON.stringify([
    { pid: 10, bytes: 120 * MiB },
    { pid: 11, bytes: 64 * MiB },
    { pid: 12, bytes: -5 },
    // The counters return 0 for a process they could not inspect. A live
    // browser process never has zero private bytes, so 0 is "unread", not "free".
    { pid: 14, bytes: 0 },
    { pid: 13, bytes: 'lots' },
    { pid: 'x', bytes: 1 },
    { bytes: 1 },
  ]));
  assert.deepEqual([...map.entries()], [[10, 120 * MiB], [11, 64 * MiB]]);

  const single = measure.parseWindowsMemoryJson(JSON.stringify({ pid: 5, bytes: 1024 }));
  assert.equal(single.get(5), 1024);
  assert.equal(measure.parseWindowsMemoryJson('').size, 0);
  assert.equal(measure.parseWindowsMemoryJson('garbage').size, 0);
});

test('the memory script reads only the pids it was given and refuses anything else', () => {
  const script = measure.windowsMemoryScript('perf-private-ws', [10, 2048]);
  assert.match(script, /Win32_PerfRawData_PerfProc_Process/);
  assert.match(script, /WorkingSetPrivate/);
  assert.match(script, /10,2048/);

  const fallback = measure.windowsMemoryScript('get-process-ws', [10]);
  assert.match(fallback, /WorkingSet64/);
  assert.doesNotMatch(fallback, /Win32_PerfRawData/);

  // The ids are interpolated into a script, so only integers may get in.
  assert.throws(() => measure.windowsMemoryScript('perf-private-ws', [1, '2; calc']), /integer/);
  assert.throws(() => measure.windowsMemoryScript('perf-private-ws', [1.5]), /integer/);
  assert.throws(() => measure.windowsMemoryScript('nope', [1]), /Unknown/);
});

// --- launch and quit --------------------------------------------------------

test('a Windows executable is the install directory plus the exe name', () => {
  assert.equal(launch.executablePath({ binary: 'D:\\x\\y.exe' }, 'win32'), 'D:\\x\\y.exe');
  assert.equal(
    launch.executablePath({ id: 'c', bundlePath: CHROME_DIR, executableName: 'chrome.exe' }, 'win32'),
    CHROME_EXE
  );
  // Default platform is macOS, so the existing behavior holds on any host.
  assert.equal(
    launch.executablePath({ id: 'z', bundlePath: '/Applications/Zen.app', executableName: 'zen' }),
    path.join('/Applications/Zen.app', 'Contents', 'MacOS', 'zen')
  );
});

test('Blanc on Windows separates its URLs with --, or Electron exits before the app runs', () => {
  // Electron on Windows exits with -1, before main.js, when more than one URL
  // follows the switches without a `--` first (its CVE-2018-1000006 guard; see
  // src/main/startup-urls.js). A hosted-runner probe confirmed it: any single
  // URL ran, any two or more exited at once with code -1 and no output.
  const urls = ['https://a.test/', 'https://b.test/'];
  const win = launch.buildLaunchPlan(
    { id: 'blanc', family: 'blanc', extraBlankTabs: 1 },
    { profileDir: 'C:\\p', urls },
    'win32'
  );
  const at = win.args.indexOf('--');
  assert.ok(at > 0, 'no -- separator');
  assert.deepEqual(win.args.slice(at), ['--', ...urls]);
  assert.ok(win.args.slice(0, at).every((arg) => arg.startsWith('--')), 'a plain argument precedes the separator');
  assert.equal(win.tabCount, 3);

  // Nothing to separate when there are no URLs.
  const idle = launch.buildLaunchPlan({ id: 'blanc', family: 'blanc' }, { profileDir: 'C:\\p', urls: [] }, 'win32');
  assert.ok(!idle.args.includes('--'));

  // The other platforms and the non-Electron browsers are launched as before.
  const mac = launch.buildLaunchPlan({ id: 'blanc', family: 'blanc' }, { profileDir: '/p', urls });
  assert.ok(!mac.args.includes('--'));
  const chrome = launch.buildLaunchPlan({ id: 'chrome', family: 'chromium' }, { profileDir: 'C:\\p', urls }, 'win32');
  assert.ok(!chrome.args.includes('--'));
});

test('quitting asks politely first: WM_CLOSE on Windows, SIGTERM elsewhere', () => {
  // process.kill(pid, 'SIGTERM') is TerminateProcess on Windows. It skips the
  // browser's shutdown, and the harness reads each browser's history afterwards.
  assert.deepEqual(launch.gracefulExit(321, 'win32'), { command: 'taskkill', args: ['/PID', '321'] });
  assert.deepEqual(launch.gracefulExit(321, 'darwin'), { signal: 'SIGTERM' });
  assert.deepEqual(launch.gracefulExit(321), { signal: 'SIGTERM' });
});

// --- registry ---------------------------------------------------------------

const chromeEntry = {
  id: 'chrome',
  label: 'Google Chrome',
  family: 'chromium',
  bundlePath: ['/Applications/Google Chrome.app'],
  executableName: 'Google Chrome',
  notes: ['macOS note'],
  windows: {
    bundlePath: [
      '%ProgramFiles%\\Google\\Chrome\\Application',
      '%ProgramFiles(x86)%\\Google\\Chrome\\Application',
      '%LOCALAPPDATA%\\Google\\Chrome\\Application',
    ],
    executableName: 'chrome.exe',
  },
};

test('Windows registry resolution expands environment variables and tries each candidate', () => {
  const env = {
    ProgramFiles: 'C:\\Program Files',
    LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
    // ProgramFiles(x86) deliberately unset, as on a 32-bit-less machine.
  };
  const dir = 'C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\Application';
  const present = new Set([dir, `${dir}\\chrome.exe`]);
  const resolved = registry.resolveBrowserPaths(chromeEntry, (p) => present.has(p), { platform: 'win32', env });
  assert.equal(resolved.installed, true);
  assert.equal(resolved.bundlePath, dir);
  assert.equal(resolved.binary, `${dir}\\chrome.exe`);
  assert.equal(resolved.executableName, 'chrome.exe');
});

test('an unset environment variable skips its candidate instead of probing a literal path', () => {
  const probed = [];
  const resolved = registry.resolveBrowserPaths(
    chromeEntry,
    (p) => { probed.push(p); return false; },
    { platform: 'win32', env: { ProgramFiles: 'C:\\Program Files' } }
  );
  assert.equal(resolved.installed, false);
  assert.ok(probed.every((p) => !p.includes('%')), `probed an unexpanded path: ${probed}`);
  assert.match(resolved.resolutionError, /LOCALAPPDATA|ProgramFiles\(x86\)/);
});

test('Windows variable lookup ignores case, as the Windows environment does', () => {
  const resolved = registry.resolveBrowserPaths(
    chromeEntry,
    (p) => p === 'C:\\PF\\Google\\Chrome\\Application' || p === 'C:\\PF\\Google\\Chrome\\Application\\chrome.exe',
    { platform: 'win32', env: { PROGRAMFILES: 'C:\\PF' } }
  );
  assert.equal(resolved.installed, true);
});

test('a browser with no Windows block is not installed on Windows, never run from a macOS path', () => {
  const resolved = registry.resolveBrowserPaths(
    { id: 'arc', label: 'Arc', bundlePath: ['/Applications/Arc.app'], executableName: 'Arc' },
    () => true,
    { platform: 'win32', env: {} }
  );
  assert.equal(resolved.installed, false);
  assert.match(resolved.resolutionError, /no Windows build/);
});

test('a Windows block replaces macOS notes and arguments, and nothing else leaks across', () => {
  const resolved = registry.resolveBrowserPaths(
    {
      ...chromeEntry,
      extraArgs: ['--mac-only'],
      windows: { ...chromeEntry.windows, notes: ['Windows note'], extraArgs: ['--win-only'] },
    },
    () => true,
    { platform: 'win32', env: { ProgramFiles: 'C:\\Program Files' } }
  );
  assert.deepEqual(resolved.notes, ['Windows note']);
  assert.deepEqual(resolved.extraArgs, ['--win-only']);
  assert.equal(resolved.windows, undefined);

  // With no notes of its own, the shared ones stay.
  const inherited = registry.resolveBrowserPaths(chromeEntry, () => true, {
    platform: 'win32',
    env: { ProgramFiles: 'C:\\Program Files' },
  });
  assert.deepEqual(inherited.notes, ['macOS note']);
});

test('macOS resolution ignores the Windows block entirely', () => {
  const resolved = registry.resolveBrowserPaths(
    chromeEntry,
    (p) => p === '/Applications/Google Chrome.app' || p === path.join('/Applications/Google Chrome.app', 'Contents/MacOS/Google Chrome')
  );
  assert.equal(resolved.installed, true);
  assert.equal(resolved.executableName, 'Google Chrome');
});

test('the shipped registry has a usable Windows block for each browser it claims to support there', () => {
  const raw = require('../../bench/memory/browsers.json').browsers;
  const withWindows = raw.filter((b) => b.windows);
  const ids = withWindows.map((b) => b.id);
  for (const needed of ['blanc', 'blanc-noblock', 'chrome', 'edge', 'brave']) {
    assert.ok(ids.includes(needed), `${needed} needs a Windows block`);
  }
  for (const b of withWindows) {
    const dirs = [].concat(b.windows.bundlePath);
    assert.ok(dirs.length, `${b.id} lists no Windows install directory`);
    for (const dir of dirs) {
      assert.match(dir, /^(%[A-Za-z()0-9]+%|[A-Za-z]:)\\/, `${b.id}: ${dir} is not an absolute Windows path`);
      assert.doesNotMatch(dir, /\//, `${b.id}: ${dir} mixes in forward slashes`);
    }
    for (const exe of [].concat(b.windows.executableName)) {
      assert.match(exe, /\.exe$/i, `${b.id}: ${exe} is not an .exe`);
    }
  }
  assert.deepEqual([].concat(raw.find((b) => b.id === 'blanc').windows.executableName), ['Blanc.exe']);
  // Both Blanc rows share an install, so quit() must reap by process set here too.
  assert.deepEqual(
    raw.find((b) => b.id === 'blanc').windows.bundlePath,
    raw.find((b) => b.id === 'blanc-noblock').windows.bundlePath
  );
});

test('Firefox stays off Windows until its launcher process is handled', () => {
  // firefox.exe hands off to a second process and exits, so root-pid attribution
  // finds nothing. A probe run showed the survivor locking the template profile.
  const raw = require('../../bench/memory/browsers.json').browsers;
  assert.equal(raw.find((b) => b.id === 'firefox').windows, undefined);
});

test('loading the registry for Windows marks every macOS-only browser as not installed', () => {
  const { browsers } = registry.loadRegistry({ platform: 'win32', env: {}, exists: () => false });
  const twilight = browsers.find((b) => b.id === 'zen-twilight');
  assert.equal(twilight.installed, false);
  assert.match(twilight.resolutionError, /no Windows build/);
});

test('a Windows version lookup reads the product version of the exact binary', () => {
  const script = registry.versionScript("C:\\Users\\O'Brien\\AppData\\Local\\Programs\\blanc\\Blanc.exe");
  assert.match(script, /VersionInfo\.ProductVersion/);
  assert.match(script, /'C:\\Users\\O''Brien\\AppData\\Local\\Programs\\blanc\\Blanc\.exe'/);
});

// --- report and entry point -------------------------------------------------

const reportFor = (metric, backend, meta = {}) => report.buildMarkdown({
  meta: {
    startedAt: '2026-11-09T10:00:00Z',
    osVersion: '10.0.26100',
    arch: 'x64',
    totalRamGiB: 16,
    backend,
    metric,
    repetitions: 1,
    skipped: [],
    ...meta,
  },
  results: [
    {
      browserId: 'blanc', label: 'Blanc', engine: 'Test', blocking: 'none', workload: 'mixed',
      workloadLabel: 'mixed', tabCount: 2, metric, backend,
      repetitions: [{ totalBytes: 300 * MiB, processCount: 4, settled: true }],
    },
  ],
});

test('the report names the operating system the run was measured on', () => {
  assert.match(reportFor('private_working_set', 'perf-private-ws', { platform: 'win32' }), /· Windows 10\.0\.26100 · x64/);
  assert.match(reportFor('phys_footprint', 'footprint', { platform: 'darwin', osVersion: '27.1.0' }), /· macOS 27\.1\.0 ·/);
  // Reports written before the platform was recorded were all macOS runs.
  assert.match(reportFor('phys_footprint', 'footprint', { osVersion: '25.0.0' }), /· macOS 25\.0\.0 ·/);
});

test('plain working set is flagged as unpublishable, private working set is not', () => {
  const plain = reportFor('working_set', 'get-process-ws', { platform: 'win32' });
  assert.match(plain, /These numbers are working set, not private working set/);

  const priv = reportFor('private_working_set', 'perf-private-ws', { platform: 'win32' });
  assert.doesNotMatch(priv, /These numbers are/);
  // The honest difference from the macOS metric is stated in the report itself.
  assert.match(priv, /compressed or paged-out/);

  // The macOS banner is untouched.
  assert.match(reportFor('rss', 'ps'), /These numbers are RSS, not phys_footprint/);
});

test('a browser that dies at startup says how it died, not just that it did', () => {
  // "exited immediately after launch" with nothing else cost a probe run: the
  // exit code is what separates a crash from a deliberate quit.
  assert.equal(run.exitNote(null), '');
  assert.equal(run.exitNote({}), '');
  assert.equal(run.exitNote({ exitInfo: () => null }), '');
  assert.equal(run.exitNote({ exitInfo: () => ({ code: 0, signal: null }) }), ' (exit code 0)');
  assert.equal(run.exitNote({ exitInfo: () => ({ code: 3221225477, signal: null }) }), ' (exit code 3221225477 = 0xC0000005)');
  assert.equal(run.exitNote({ exitInfo: () => ({ code: null, signal: 'SIGSEGV' }) }), ' (signal SIGSEGV)');
});

test('a start-up failure names processes from the same install that are still running', () => {
  const rows = [
    { pid: 10, ppid: 1, command: `${CHROME_DIR}\\chrome.exe` },
    { pid: 11, ppid: 10, command: `${CHROME_DIR}\\chrome.exe` },
    { pid: 12, ppid: 1, command: 'C:\\Windows\\explorer.exe' },
  ];
  assert.equal(run.describeSurvivors(rows, CHROME_DIR), ' — 2 process(es) from this install were still running: 10, 11');
  assert.equal(run.describeSurvivors(rows, 'C:\\Nowhere'), '');
  assert.equal(run.describeSurvivors(rows, CHROME_DIR, [10]), ' — 1 process(es) from this install were still running: 11');
  assert.equal(run.describeSurvivors(rows, ''), '');
});

test('cleaning up a profile never throws, so a locked temp folder cannot lose a finished run', () => {
  // A hosted-runner probe lost its whole report this way: a Firefox process that
  // outlived its warm-up still held a file in the template profile, the cleanup
  // threw EBUSY before the report was written, and every measured cell went with
  // it. Cleanup is best effort; the measurement is not.
  const calls = [];
  const rm = (dir, options) => { calls.push([dir, options]); };
  assert.equal(run.removeProfile('C:\\Temp\\p', rm), true);
  assert.deepEqual(calls.map(([dir]) => dir), ['C:\\Temp\\p', 'C:\\Temp\\p-Dev']);
  // Windows needs retries: antivirus and slow handle release are routine there.
  assert.ok(calls[0][1].maxRetries >= 3, 'no retries for a briefly locked directory');
  assert.equal(calls[0][1].recursive, true);

  const busy = () => { throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); };
  assert.equal(run.removeProfile('C:\\Temp\\p', busy), false);
});

test('the runner supports macOS and Windows and says so for anything else', () => {
  assert.doesNotThrow(() => run.assertSupportedPlatform('darwin'));
  assert.doesNotThrow(() => run.assertSupportedPlatform('win32'));
  assert.throws(() => run.assertSupportedPlatform('linux'), /macOS and Windows/);
});
