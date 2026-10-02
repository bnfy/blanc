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
// rejects — the caller decides what a failure means. Invoke powershell.exe
// directly so Node's timeout terminates the process that owns the installer
// handle. Running it behind cmd.exe (`shell: true`) only kills the shell on some
// Windows versions, leaving PowerShell alive and the temporary installer locked.
// Reset PSModulePath through the child environment and set PowerShell's output
// encoding in-process instead of relying on `chcp`. The file path is
// single-quote-escaped to prevent command injection
// (Get-AuthenticodeSignature 'a';calc;'b' would otherwise run calc).
function runAuthenticodeSignature(filePath, { execFileImpl = execFile, timeoutMs = SIGNATURE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const escaped = String(filePath).replace(/'/g, "''");
    execFileImpl(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-InputFormat',
        'None',
        '-Command',
        `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); Get-AuthenticodeSignature -LiteralPath '${escaped}' | ConvertTo-Json -Compress`,
      ],
      {
        timeout: timeoutMs,
        windowsHide: true,
        env: { ...process.env, PSModulePath: '' },
      },
      (error, stdout) => resolve({ error, stdout }),
    );
  });
}

// Build the verifier electron-updater calls after a download: resolves `null`
// when the installer is trusted, or a message string when it must be rejected.
//
// Only a completed publisher check can authorize installation. Download hashes
// establish consistency with the feed, not an independently trusted publisher.
// An unavailable verifier defers the update so a later check can retry.
function createWindowsSignatureVerifier({ run = runAuthenticodeSignature, logger } = {}) {
  const warn = (msg) => (logger ?? console).warn?.(msg);
  return async (publisherNames, filePath) => {
    const names = Array.isArray(publisherNames) ? publisherNames : [publisherNames];
    if (!names.length || names.some((name) => typeof name !== 'string' || !name.trim())) {
      return 'trusted installer publisher configuration is missing';
    }
    let data;
    try {
      const result = await run(filePath);
      if (!result || result.error || typeof result.stdout !== 'string') {
        warn('[updater] installer publisher verification could not complete; deferring installation');
        return 'installer publisher could not be verified; retry Check for Updates';
      }
      data = JSON.parse(result.stdout.trim());
    } catch {
      warn('[updater] installer publisher verification failed or returned malformed output; deferring installation');
      return 'installer publisher could not be verified; retry Check for Updates';
    }
    if (!data || Array.isArray(data) || typeof data !== 'object' || typeof data.Status !== 'number') {
      return 'installer signature verification returned invalid data';
    }
    if (data.Status !== 0) {
      return `installer signature is not valid (status ${data.Status})`;
    }
    const subject = data.SignerCertificate?.Subject;
    if (typeof subject !== 'string' || !subject.trim()) {
      return 'installer signer certificate is missing';
    }
    const subjectCN = extractCommonName(subject);
    const trusted = subjectCN.length > 0 && names.some((name) => extractCommonName(name) === subjectCN);
    return trusted ? null : 'installer signed by an unexpected publisher';
  };
}

module.exports = {
  SIGNATURE_TIMEOUT_MS,
  extractCommonName,
  runAuthenticodeSignature,
  createWindowsSignatureVerifier,
};
