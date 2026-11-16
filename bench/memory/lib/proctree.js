// Discovering exactly which processes belong to the browser under test.
//
// A browser is not one process. Chromium spawns a browser process plus a GPU
// process, a network service, a storage service and one renderer per site
// instance; Gecko spawns parent, GPU, socket, RDD and content processes. Any
// number that ignores the helpers is meaningless.
//
// Two traps this module exists to avoid:
//
//   1. The tester's own daily browser. Matching "every process whose executable
//      lives in Google Chrome.app" happily counts the 60-tab Chrome the tester
//      already had open. Every process alive before we launch is recorded at
//      preflight and subtracted.
//
//   2. Re-parented helpers. Walking children from the launched root pid is the
//      precise approach, but a helper whose parent exits gets re-parented to
//      launchd and drops out of the tree. So bundle-path matching is kept as a
//      second signal, unioned with the descendant walk and then filtered
//      through the pre-existing set from (1).

//
// Windows differs in two ways that matter here. A process whose parent exits
// keeps its stale parent id instead of being re-parented, so the descendant walk
// loses it exactly as it does on macOS and the path match is what finds it. And
// paths are case-insensitive and use backslashes, so bundle matching normalizes
// both before comparing.

const { execFile } = require('node:child_process');

const winps = require('./winps');

/**
 * Parse `ps -axo pid=,ppid=,comm=` output.
 *
 * macOS `comm` is the full executable path (unlike Linux, where it is a
 * truncated basename), which is what makes bundle-path matching viable here.
 * Paths contain spaces — "Google Chrome Helper (Renderer)" — so the command is
 * everything after the second numeric column, not a whitespace split.
 *
 * @param {string} stdout
 * @returns {Array<{pid: number, ppid: number, command: string}>}
 */
function parsePsSnapshot(stdout) {
  const rows = [];
  if (typeof stdout !== 'string') return rows;
  for (const line of stdout.split('\n')) {
    // Four columns when the caller asked for state (pid ppid stat comm), three
    // otherwise. The state token is what distinguishes them: macOS reports a
    // leading state letter from IRSTUZ plus up to a few flag characters, while
    // a command is either an absolute path or the literal `<defunct>`.
    //
    // The command must NOT be required to start with `/`: a zombie's comm is
    // `<defunct>`, so anchoring on a slash made exactly the rows this parser
    // exists to identify fall through to the three-column branch, arrive with
    // state `null`, and escape the zombie filter.
    const withState = line.match(/^\s*(\d+)\s+(\d+)\s+([IRSTUZ][A-Za-z+<>]{0,4})\s+(\S.*?)\s*$/);
    if (withState) {
      rows.push({
        pid: Number(withState[1]),
        ppid: Number(withState[2]),
        state: withState[3],
        command: withState[4],
      });
      continue;
    }
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/);
    if (!m) continue;
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), state: null, command: m[3] });
  }
  return rows;
}

/**
 * Parse the process list PowerShell emits for `Get-CimInstance Win32_Process`.
 *
 * `ExecutablePath` is null for processes this user cannot inspect (System, and
 * other protected ones); those keep an empty command so they still take part in
 * the parent walk but can never match a bundle. Windows has no zombie state, so
 * `state` is always null.
 *
 * @param {string} stdout
 * @returns {Array<{pid: number, ppid: number, state: null, command: string}>}
 */
function parseWindowsProcessJson(stdout) {
  const rows = [];
  for (const raw of winps.parseJsonRows(stdout)) {
    if (!Number.isInteger(raw.ProcessId)) continue;
    rows.push({
      pid: raw.ProcessId,
      ppid: Number.isInteger(raw.ParentProcessId) ? raw.ParentProcessId : 0,
      state: null,
      command: typeof raw.ExecutablePath === 'string' ? raw.ExecutablePath : '',
    });
  }
  return rows;
}

/**
 * Has this process exited but not yet been reaped?
 *
 * A zombie still occupies a slot in the process table, so `ps` lists it and
 * `kill(pid, 0)` reports it as alive — but it holds no memory and no
 * measurement tool can read it. Counting one as "alive and unreadable" is how a
 * perfectly healthy sample gets rejected as an undercount.
 */
const isZombie = (row) =>
  (typeof row.state === 'string' && row.state.startsWith('Z')) ||
  // Belt and braces: if state parsing ever fails again, `<defunct>` is still an
  // unambiguous marker and appears in the command either way.
  (typeof row.command === 'string' && row.command.includes('<defunct>'));

/**
 * Every transitive descendant of `rootPid`, including `rootPid` itself.
 *
 * Guards against a cycle in the reported parent links (which should not happen,
 * but a malformed snapshot must not hang a benchmark run) by never visiting a
 * pid twice.
 *
 * @param {Array<{pid: number, ppid: number}>} rows
 * @param {number} rootPid
 * @returns {number[]} ascending pids
 */
function descendantsOf(rows, rootPid) {
  const childrenByParent = new Map();
  for (const row of rows) {
    if (!childrenByParent.has(row.ppid)) childrenByParent.set(row.ppid, []);
    childrenByParent.get(row.ppid).push(row.pid);
  }
  const live = new Set(rows.map((r) => r.pid));
  if (!live.has(rootPid)) return [];

  const seen = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length) {
    const pid = queue.shift();
    for (const child of childrenByParent.get(pid) || []) {
      // pid 0/1 parenting itself would otherwise loop forever.
      if (child === pid || seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** A drive-letter path, or anything using backslashes (which no macOS bundle path does). */
const isWindowsPath = (p) => /^[A-Za-z]:[\\/]/.test(p) || p.includes('\\');

/**
 * Pids whose executable path sits inside `bundlePath`.
 *
 * Compared on a normalized, slash-terminated prefix so that a bundle named
 * "/Applications/Arc.app" cannot also match "/Applications/Arc.app.backup" or
 * an unrelated "/Applications/Arcade.app".
 *
 * @param {Array<{pid: number, command: string}>} rows
 * @param {string} bundlePath
 * @returns {number[]} ascending pids
 */
function matchingBundle(rows, bundlePath) {
  if (!bundlePath) return [];

  // A Windows install directory: compare case-insensitively and across both
  // slash directions, with the same slash boundary so "...\Application" cannot
  // match "...\Application2" or "...\Chrome Beta\Application". macOS paths keep
  // the exact comparison they always had.
  if (isWindowsPath(bundlePath)) {
    const normalize = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();
    const root = normalize(bundlePath).replace(/\/+$/, '');
    const windowsPrefix = `${root}/`;
    return rows
      .filter((r) => {
        const command = normalize(r.command);
        return command === root || command.startsWith(windowsPrefix);
      })
      .map((r) => r.pid)
      .sort((a, b) => a - b);
  }

  const prefix = bundlePath.replace(/\/+$/, '') + '/';
  return rows
    .filter((r) => r.command === bundlePath || r.command.startsWith(prefix))
    .map((r) => r.pid)
    .sort((a, b) => a - b);
}

/**
 * The process set attributable to the browser we launched.
 *
 * @param {Array<{pid: number, ppid: number, command: string}>} rows
 * @param {{rootPid: number, bundlePath?: string, excludePids?: Iterable<number>}} options
 * @returns {number[]} ascending pids
 */
function browserProcessSet(rows, options) {
  const { rootPid, bundlePath, excludePids } = options;
  const excluded = new Set(excludePids || []);
  const set = new Set(descendantsOf(rows, rootPid));
  for (const pid of matchingBundle(rows, bundlePath)) set.add(pid);
  // The root is ours by construction even if the tester had the same browser
  // open already, so it is never subtracted.
  for (const pid of excluded) if (pid !== rootPid) set.delete(pid);
  // Zombies are in the table but hold nothing. Leaving them in makes every
  // sample of a churning tree look partially unreadable.
  for (const row of rows) if (isZombie(row) && row.pid !== rootPid) set.delete(row.pid);
  return [...set].sort((a, b) => a - b);
}

/** Live `ps` snapshot of the whole process table, including process state. */
function snapshotPs() {
  return new Promise((resolve, reject) => {
    execFile(
      '/bin/ps',
      ['-axo', 'pid=,ppid=,stat=,comm='],
      { maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => (error ? reject(error) : resolve(parsePsSnapshot(stdout)))
    );
  });
}

/**
 * Live snapshot of the Windows process table. Unlike the macOS path this fails
 * loudly: an empty list would mean "no pre-existing processes", and the tester's
 * own browser would then be counted as the one under test.
 */
async function snapshotWindows() {
  const r = await winps.runPowerShell(
    'Get-CimInstance -ClassName Win32_Process | ' +
      'Select-Object ProcessId, ParentProcessId, ExecutablePath | ConvertTo-Json -Compress'
  );
  const rows = r.ok ? parseWindowsProcessJson(r.stdout) : [];
  if (!rows.length) {
    throw new Error(
      `could not list Windows processes${r.stderr.trim() ? `: ${r.stderr.trim().slice(0, 300)}` : ''}`
    );
  }
  return rows;
}

/** @param {string} [platform] defaults to the machine running this process */
function snapshot(platform = process.platform) {
  return platform === 'win32' ? snapshotWindows() : snapshotPs();
}

module.exports = {
  parsePsSnapshot,
  parseWindowsProcessJson,
  isZombie,
  descendantsOf,
  matchingBundle,
  browserProcessSet,
  snapshot,
};
