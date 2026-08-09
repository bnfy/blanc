// Per-process memory sampling for the browser memory benchmark.
//
// The metric that matters on macOS is *phys_footprint* — the same number
// Activity Monitor's "Memory" column shows. It counts a process's dirty and
// compressed pages and excludes clean file-backed pages that are shared
// between processes. Summing plain RSS across a browser's process tree
// double-counts the Chromium/Gecko framework binary once per renderer and can
// inflate a 10-tab browser by well over a gigabyte, which is precisely how
// casual benchmarks end up "proving" whatever the author hoped.
//
// No single command reports phys_footprint reliably across macOS versions and
// privilege levels, so rather than betting the harness on one of them we probe
// several at startup, keep the highest-fidelity one that actually works on this
// machine, and record its name in the results. A run measured with `ps` RSS is
// still useful, but it is never silently mixed with a phys_footprint run.

const { execFile } = require('node:child_process');

const EXEC_TIMEOUT_MS = 20_000;
const EXEC_MAX_BUFFER = 32 * 1024 * 1024;

/** Promise wrapper that resolves with the outcome instead of throwing, since
 *  probing is expected to fail for backends this machine does not allow. */
function run(file, args) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER, encoding: 'utf8' },
      (error, stdout, stderr) => resolve({ ok: !error, stdout: stdout || '', stderr: stderr || '' })
    );
  });
}

/**
 * Parse a macOS memory size token into bytes.
 *
 * The tools mix formats: `vmmap` prints "123.4M", `footprint` often prints an
 * exact "(1234567 bytes)", `ps` prints bare kilobytes. Suffixes are binary
 * (1M = 1048576), matching how the tools themselves compute them.
 *
 * @param {string} token
 * @returns {number|null} bytes, or null if unparseable
 */
function parseSizeToBytes(token) {
  if (typeof token !== 'string') return null;
  const text = token.trim();

  // An explicit byte count is authoritative — prefer it over a rounded suffix.
  const exact = text.match(/([\d,]+)\s*bytes?\b/i);
  if (exact) {
    const n = Number(exact[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  const m = text.match(/^([\d,]+(?:\.\d+)?)\s*([KMGT]?)B?$/i);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const scale = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return Math.round(value * scale[m[2].toUpperCase()]);
}

/**
 * Parse `vmmap --summary <pid>` output.
 *
 * Must match "Physical footprint:" and NOT "Physical footprint (peak):" — the
 * peak line sits directly beneath it and is a high-water mark, not the current
 * cost, so a loose regex silently reports the wrong (larger) number.
 *
 * @returns {number|null} bytes
 */
function parseVmmapSummary(stdout) {
  if (typeof stdout !== 'string') return null;
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s*Physical footprint:\s*(.+?)\s*$/i);
    if (m) return parseSizeToBytes(m[1]);
  }
  return null;
}

/**
 * Parse `footprint -p <pid>` output. Its layout has changed across macOS
 * releases, so this looks for any line naming a footprint and takes the last
 * size-looking token on it, preferring an explicit byte count. Lines reporting
 * a peak or a lifetime maximum are skipped for the same reason as above.
 *
 * @returns {number|null} bytes
 */
function parseFootprint(stdout) {
  if (typeof stdout !== 'string') return null;
  for (const line of stdout.split('\n')) {
    if (!/footprint/i.test(line)) continue;
    if (/\b(peak|max|maximum|lifetime)\b/i.test(line)) continue;
    const exact = parseSizeToBytes(line);
    if (exact !== null) return exact;
    const tokens = line.match(/[\d,]+(?:\.\d+)?\s*[KMGT]?B\b/gi);
    if (tokens && tokens.length) return parseSizeToBytes(tokens[tokens.length - 1]);
  }
  return null;
}

/**
 * Parse `top -l 1 -stats pid,mem` output into pid -> bytes. `top` emits a
 * header block and a column header before the rows; anything that is not
 * "<pid> <size>" is ignored rather than guessed at.
 *
 * @returns {Map<number, number>}
 */
function parseTopMem(stdout) {
  const out = new Map();
  if (typeof stdout !== 'string') return out;
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+([\d,]+(?:\.\d+)?\s*[KMGT]?\+?-?)\s*$/);
    if (!m) continue;
    // top marks growing/shrinking processes with a trailing +/-; strip it.
    const bytes = parseSizeToBytes(m[2].replace(/[+-]\s*$/, ''));
    if (bytes !== null) out.set(Number(m[1]), bytes);
  }
  return out;
}

/**
 * Parse `ps -o pid=,rss= -p ...` output into pid -> bytes. ps reports RSS in
 * kilobytes.
 *
 * @returns {Map<number, number>}
 */
function parsePsRss(stdout) {
  const out = new Map();
  if (typeof stdout !== 'string') return out;
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s*$/);
    if (m) out.set(Number(m[1]), Number(m[2]) * 1024);
  }
  return out;
}

// Backends in descending fidelity. `metric` is carried into the results so a
// report can never present RSS numbers as though they were phys_footprint.
const BACKENDS = [
  {
    id: 'footprint',
    metric: 'phys_footprint',
    description: 'footprint(1) — exact phys_footprint, usually requires root',
    async sample(pids) {
      const out = new Map();
      for (const pid of pids) {
        const r = await run('/usr/bin/footprint', ['-p', String(pid)]);
        if (!r.ok) continue;
        const bytes = parseFootprint(r.stdout);
        if (bytes !== null) out.set(pid, bytes);
      }
      return out;
    },
  },
  {
    id: 'vmmap',
    metric: 'phys_footprint',
    description: 'vmmap --summary — exact phys_footprint, may require root for hardened apps',
    async sample(pids) {
      const out = new Map();
      for (const pid of pids) {
        const r = await run('/usr/bin/vmmap', ['--summary', String(pid)]);
        if (!r.ok) continue;
        const bytes = parseVmmapSummary(r.stdout);
        if (bytes !== null) out.set(pid, bytes);
      }
      return out;
    },
  },
  {
    id: 'top',
    metric: 'phys_footprint_approx',
    description: 'top -l 1 -stats pid,mem — footprint-equivalent column, no elevation needed',
    async sample(pids) {
      // One call for the whole system, then filter: far cheaper than shelling
      // out per process when a browser tree is 30+ processes.
      const r = await run('/usr/bin/top', ['-l', '1', '-stats', 'pid,mem', '-n', '0']);
      if (!r.ok) return new Map();
      const all = parseTopMem(r.stdout);
      const out = new Map();
      for (const pid of pids) if (all.has(pid)) out.set(pid, all.get(pid));
      return out;
    },
  },
  {
    id: 'ps',
    metric: 'rss',
    description: 'ps rss — always available, OVERCOUNTS shared pages across processes',
    async sample(pids) {
      if (!pids.length) return new Map();
      const r = await run('/bin/ps', ['-o', 'pid=,rss=', '-p', pids.join(',')]);
      if (!r.ok) return new Map();
      return parsePsRss(r.stdout);
    },
  },
];

/**
 * Find the highest-fidelity backend that actually returns a number for a live
 * process on this machine. Probed against our own pid, which every backend is
 * permitted to inspect, plus the caller's optional extra pid so a backend that
 * works on self but not on a hardened, signed browser is rejected here rather
 * than halfway through a 40-minute run.
 *
 * @param {{ probePid?: number, only?: string }} [options]
 * @returns {Promise<{id: string, metric: string, description: string, sample: Function}>}
 */
async function selectBackend(options = {}) {
  const { probePid, only } = options;
  const candidates = only ? BACKENDS.filter((b) => b.id === only) : BACKENDS;
  if (!candidates.length) throw new Error(`Unknown measurement backend: ${only}`);

  const pids = [process.pid];
  if (probePid && probePid !== process.pid) pids.push(probePid);

  for (const backend of candidates) {
    const sampled = await backend.sample(pids);
    if (pids.every((pid) => (sampled.get(pid) || 0) > 0)) return backend;
  }
  throw new Error(
    'No memory measurement backend worked on this machine. Tried: ' +
      candidates.map((b) => b.id).join(', ')
  );
}

/**
 * Sum a backend's per-process readings over a set of pids.
 *
 * Processes that vanish between discovery and sampling (a renderer exiting) are
 * simply absent — reported as `missing` rather than counted as zero silently,
 * so a caller can tell a quiet tree apart from a broken backend.
 *
 * @param {object} backend
 * @param {number[]} pids
 * @returns {Promise<{totalBytes: number, perPid: Array<{pid: number, bytes: number}>, missing: number[]}>}
 */
async function sampleTotal(backend, pids) {
  const sampled = await backend.sample(pids);
  const perPid = [];
  const missing = [];
  let totalBytes = 0;
  for (const pid of pids) {
    if (sampled.has(pid)) {
      const bytes = sampled.get(pid);
      totalBytes += bytes;
      perPid.push({ pid, bytes });
    } else {
      missing.push(pid);
    }
  }
  return { totalBytes, perPid, missing };
}

module.exports = {
  BACKENDS,
  parseSizeToBytes,
  parseVmmapSummary,
  parseFootprint,
  parseTopMem,
  parsePsRss,
  selectBackend,
  sampleTotal,
};
