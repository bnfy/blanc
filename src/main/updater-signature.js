const { execFile } = require('node:child_process');

// electron-updater's built-in Windows signature check hard-codes a 20-second
// timeout on `Get-AuthenticodeSignature`. On slow/loaded machines that PowerShell
// call (and even spawning cmd.exe) can exceed 20s, so it times out and ABORTS the
// update after a fully successful download — no restart prompt, silent. Observed
// live: ~27s+ on a VM under load. This runs the same publisher check with a
// generous timeout instead, so it actually completes.
const SIGNATURE_TIMEOUT_MS = 120 * 1000;

// Pull the Common Name out of an X.500 distinguished name such as
// `CN=Bananify Creative, O=Bananify Creative, L=…, C=US`, honoring quoting and
// backslash escapes. A bare string with no `CN=` is treated as its own CN
// (electron-builder may write either the full DN or just the CN as publisherName).
function extractCommonName(dn) {
  if (dn == null) return '';
  const s = String(dn).trim();
  const m = /(?:^|,)\s*CN=/i.exec(s);
  if (!m) return s;
  let i = m.index + m[0].length;
  let value = '';
  const quoted = s[i] === '"';
  if (quoted) i += 1;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      value += s[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (quoted && ch === '"') break;
    if (!quoted && ch === ',') break;
    value += ch;
    i += 1;
  }
  return value.trim();
}

// Runs PowerShell's Get-AuthenticodeSignature and returns {error, stdout}. Never
// rejects — the caller decides what a failure means. Mirrors electron-updater's
// invocation (PSModulePath reset + chcp for non-ASCII cert subjects) but with a
// long timeout. The file path is single-quote-escaped to prevent command
// injection (Get-AuthenticodeSignature 'a';calc;'b' would otherwise run calc).
function runAuthenticodeSignature(filePath, { execFileImpl = execFile, timeoutMs = SIGNATURE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const escaped = String(filePath).replace(/'/g, "''");
    execFileImpl(
      'set "PSModulePath=" & chcp 65001 >NUL & powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-InputFormat',
        'None',
        '-Command',
        `"Get-AuthenticodeSignature -LiteralPath '${escaped}' | ConvertTo-Json -Compress"`,
      ],
      { shell: true, timeout: timeoutMs, windowsHide: true },
      (error, stdout) => resolve({ error, stdout }),
    );
  });
}

// Build the verifier electron-updater calls after a download: resolves `null`
// when the installer is trusted, or a message string when it must be rejected.
//
// Policy, matching electron-updater's own split:
//   - the check can't run (timeout / PowerShell broken / unparseable) -> null
//     (FAIL-OPEN on infrastructure failure). Integrity is already guaranteed by
//     the sha512 checked during download against the signed latest.yml, and a
//     slow/broken PowerShell is not attacker-controllable — so this restores the
//     "don't brick updates" behavior electron-updater intends, just without the
//     20s cliff.
//   - the check ran and the signature is invalid or signed by an unexpected
//     publisher -> message (FAIL-CLOSED on a bad result).
function createWindowsSignatureVerifier({ run = runAuthenticodeSignature, logger } = {}) {
  const warn = (msg) => (logger ?? console).warn?.(msg);
  return async (publisherNames, filePath) => {
    const { error, stdout } = await run(filePath);
    if (error) {
      warn(`[updater] signature check could not run (${error.message}); skipping publisher check — integrity still enforced by sha512`);
      return null;
    }
    let data;
    try {
      data = JSON.parse(stdout);
    } catch (e) {
      warn(`[updater] signature output was unparseable (${e.message}); skipping publisher check`);
      return null;
    }
    if (data?.Status !== 0) {
      return `installer signature is not valid (status ${data?.Status})`;
    }
    const subjectCN = extractCommonName(data?.SignerCertificate?.Subject ?? '');
    const names = Array.isArray(publisherNames) ? publisherNames : [publisherNames];
    const trusted = subjectCN.length > 0 && names.some((n) => extractCommonName(String(n)) === subjectCN);
    return trusted ? null : `installer signed by an unexpected publisher: ${data?.SignerCertificate?.Subject}`;
  };
}

module.exports = {
  SIGNATURE_TIMEOUT_MS,
  extractCommonName,
  runAuthenticodeSignature,
  createWindowsSignatureVerifier,
};
