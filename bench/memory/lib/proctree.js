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

const { execFile } = require('node:child_process');

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
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/);
    if (!m) continue;
    rows.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] });
  }
  return rows;
}

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
  return [...set].sort((a, b) => a - b);
}

/** Live `ps` snapshot of the whole process table. */
function snapshot() {
  return new Promise((resolve, reject) => {
    execFile(
      '/bin/ps',
      ['-axo', 'pid=,ppid=,comm='],
      { maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => (error ? reject(error) : resolve(parsePsSnapshot(stdout)))
    );
  });
}

module.exports = {
  parsePsSnapshot,
  descendantsOf,
  matchingBundle,
  browserProcessSet,
  snapshot,
};
