// Tab handoff in the sandboxed utility process: shipping's
// tab-import-handoff.js decides everything about a blanc-import: link and the
// relay's reply. No fs, network, credential, store or Sync call exists here;
// native code makes the one claim request and passes the reply's bytes in.
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = class { encode(text = '') { return new Uint8Array(Buffer.from(String(text), 'utf8')); } };
  globalThis.TextDecoder = class { decode(data) { return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data).toString('utf8'); } };
}
// The prelude's URLSearchParams has no keys(); the link check counts them.
if (!URLSearchParams.prototype.keys) {
  URLSearchParams.prototype.keys = function () { return [...this].map(pair => pair[0])[Symbol.iterator](); };
}
const handoff = __require('src/main/tab-import-handoff.js');
// Shipping's bound on the relay's reply (main.js claimTabHandoff).
const MAX_RESPONSE_BYTES = Math.ceil(handoff.MAX_TAB_IMPORT_ENVELOPE_BYTES * 4 / 3) + 2048;
const CODES = new Set(['invalid-envelope', 'decryption-failed', 'invalid-payload', 'invalid-expiry']);
module.exports = async function (command, args = []) {
  if (!Array.isArray(args)) return { error: 'forbidden' };
  // A link: its claim address, or nothing. The key stays in the link.
  if (command === 'parse') {
    const parsed = handoff.parseTabImportUrl(args[0]);
    return parsed ? { ok: true, claimUrl: handoff.tabImportClaimUrl(parsed.id), maxResponseBytes: MAX_RESPONSE_BYTES }
                  : { error: 'invalid-link' };
  }
  // The link again and the relay's reply (base64): the cleaned tabs, or
  // shipping's error code.
  if (command === 'open') {
    const parsed = handoff.parseTabImportUrl(args[0]);
    if (!parsed) return { error: 'invalid-link' };
    if (typeof args[1] !== 'string' || args[1].length > Math.ceil(MAX_RESPONSE_BYTES / 3) * 4) return { error: 'invalid-envelope' };
    const reply = Buffer.from(args[1], 'base64');
    if (reply.length > MAX_RESPONSE_BYTES) return { error: 'invalid-envelope' };
    let envelope;
    try { envelope = JSON.parse(reply.toString('utf8')); } catch { return { error: 'invalid-envelope' }; }
    let raw;
    try { raw = await handoff.decryptTabHandoffEnvelope(envelope, parsed.key, parsed.id); }
    catch (error) { return { error: CODES.has(error?.message) ? error.message : 'invalid-envelope' }; }
    const clean = handoff.sanitizeTabHandoff(raw);
    return clean.ok ? { ok: true, value: clean.value, skippedCount: clean.skippedCount } : { error: clean.error };
  }
  return { error: 'forbidden' };
};
