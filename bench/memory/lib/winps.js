// Running PowerShell for the Windows side of the memory benchmark.
//
// macOS reads processes and memory by shelling out to ps, vmmap and friends.
// Windows has no equivalent that reports parent ids, executable paths and
// private working set, so its edges go through CIM from PowerShell. Two details
// here are deliberate, not tidy-ups:
//
//   * The script is passed as -EncodedCommand (base64 of UTF-16LE). Inline
//     -Command makes the caller get quoting right through Node's argument
//     escaping and then PowerShell's own parser, and it fails on exactly the
//     inputs this harness has: install paths with spaces, parentheses and
//     apostrophes ("C:\Program Files (x86)\...", "C:\Users\O'Brien\...").
//   * Output is forced to UTF-8. Windows PowerShell 5.1 otherwise writes the
//     OEM code page, which turns a user name with an accented letter into
//     mojibake and makes bundle-path matching silently miss that user's browser.
//
// Everything that builds or parses text is pure and unit-tested on any host;
// only runPowerShell() touches the machine.

const path = require('node:path');
const { execFile } = require('node:child_process');

// A cold PowerShell on a freshly provisioned runner can take several seconds to
// start, and the first CIM query loads the WMI provider on top of that.
const EXEC_TIMEOUT_MS = 45_000;
const EXEC_MAX_BUFFER = 32 * 1024 * 1024;

const PREAMBLE =
  "$ProgressPreference = 'SilentlyContinue'; " +
  "$ErrorActionPreference = 'Stop'; " +
  '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); ';

/** @param {string} script @returns {string} base64 of the script as UTF-16LE */
function encodeCommand(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

/** A single-quoted PowerShell string literal; the only escape in one is '' for '. */
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Windows PowerShell 5.1 by absolute path. It is present on every supported
 * Windows, unlike PowerShell 7, and an absolute path means a PATH that was
 * rearranged for the benchmark cannot swap in something else.
 */
function powershellPath(env = process.env) {
  const root = env.SystemRoot || env.windir || 'C:\\Windows';
  return path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/**
 * Parse PowerShell's ConvertTo-Json output into a list of objects.
 *
 * It emits a bare object for a one-element result and nothing at all for an
 * empty one, and Windows PowerShell 5.1 may prefix a byte-order mark. Anything
 * that is not JSON yields an empty list rather than an exception: callers treat
 * an empty reading as "could not read", which is the cautious direction.
 *
 * @param {string} text
 * @returns {object[]}
 */
function parseJsonRows(text) {
  if (typeof text !== 'string') return [];
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== 'object') return [];
  return (Array.isArray(parsed) ? parsed : [parsed]).filter((row) => row && typeof row === 'object');
}

/**
 * Run a PowerShell script and resolve with the outcome instead of throwing,
 * matching measure.js's run(): probing is expected to fail on machines that
 * do not allow a given backend.
 *
 * @param {string} script
 * @returns {Promise<{ok: boolean, stdout: string, stderr: string}>}
 */
function runPowerShell(script) {
  return new Promise((resolve) => {
    try {
      const child = execFile(
        powershellPath(),
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodeCommand(PREAMBLE + script)],
        {
          timeout: EXEC_TIMEOUT_MS,
          maxBuffer: EXEC_MAX_BUFFER,
          encoding: 'utf8',
          windowsHide: true,
        },
        (error, stdout, stderr) => resolve({ ok: !error, stdout: stdout || '', stderr: stderr || '' })
      );
      child.on('error', () => resolve({ ok: false, stdout: '', stderr: '' }));
    } catch (error) {
      resolve({ ok: false, stdout: '', stderr: String(error && error.message) });
    }
  });
}

module.exports = {
  encodeCommand,
  psQuote,
  powershellPath,
  parseJsonRows,
  runPowerShell,
};
