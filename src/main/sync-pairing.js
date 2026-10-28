'use strict';

// Device pairing for Sync (design 2026-10-16): a device that already syncs
// hands its secret to a new one through a short code. The code alone yields
// a Worker-visible locator (pairId) and a local wrapping key; the Worker
// stores only the AES-GCM ciphertext for ten minutes and can read nothing.
// Pure Node, no Electron: runs under node --test like sync-crypto.js.

const crypto = require('crypto');
const { SCRYPT, encrypt, decrypt } = require('./sync-crypto');

// No 0/O, 1/I/L: a code is read aloud or typed from another room.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const CODE_LENGTH = 8;
const PAIR_TTL_MS = 600_000;
const PAIR_SALT = Buffer.from('blanc-pair:v1');
const RECOVERY_PREFIX = 'blanc-sync:1:';
const KEY_BYTES = 32;
const INVALID = () => new Error('pair-invalid');

function generateCode(randomInt = crypto.randomInt) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** The eight symbols, or null: trims, uppercases, drops hyphens and spaces. */
function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase().replace(/[-\s]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

const formatCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** pairId is what the Worker sees; wrapKey never leaves the device. scrypt
 * makes each guess cost what a passphrase guess costs today. */
function pairingMaterial(code) {
  if (normalizeCode(code) !== code) throw INVALID();
  const root = crypto.scryptSync(code, PAIR_SALT, 64, SCRYPT);
  const pairId = Buffer.from(crypto.hkdfSync('sha256', root, PAIR_SALT, 'blanc-pair-id/v1', 32)).toString('hex');
  const wrapKey = Buffer.from(crypto.hkdfSync('sha256', root, PAIR_SALT, 'blanc-pair-key/v1', 32));
  return { pairId, wrapKey };
}

/** The secret as it travels: exactly these four fields, nothing a buggy or
 * older sender adds. Throws 'pair-invalid'. */
function validatePayload(value) {
  if (!value || typeof value !== 'object') throw INVALID();
  const { v, handle, accountId, key } = value;
  if (v !== 1) throw INVALID();
  if (typeof handle !== 'string' || !handle) throw INVALID();
  if (typeof accountId !== 'string' || !/^[0-9a-f]{64}$/.test(accountId)) throw INVALID();
  if (typeof key !== 'string' || Buffer.from(key, 'base64').length !== KEY_BYTES) throw INVALID();
  return { v, handle, accountId, key };
}

const wrapSecret = (wrapKey, payload) => encrypt(wrapKey, JSON.stringify(validatePayload(payload)));

function unwrapSecret(wrapKey, blob) {
  let parsed;
  try {
    parsed = JSON.parse(decrypt(wrapKey, blob));
  } catch {
    throw INVALID();
  }
  return validatePayload(parsed);
}

// The QR's link (design 2026-10-28 §7.3). The code rides in the fragment,
// which no browser sends to a server; Blanc reads it locally and never loads
// the link. Exactly this shape, so a near miss is never mistaken for a code.
const PAIR_LINK = 'https://blanc.day/pair#';

function pairLink(code) {
  if (normalizeCode(code) !== code) throw INVALID();
  return PAIR_LINK + code;
}

/** The normalized code a pair link carries, or null. URL parsing hides an
 * explicit default port and an empty query, so the raw text is checked too. */
function pairLinkCode(input) {
  // URL parsing also strips tabs, newlines and surrounding spaces, which other
  // parsers (iOS's) refuse; refuse them here too so both platforms agree.
  if (typeof input !== 'string' || /\s/.test(input)) return null;
  for (const ch of input) if (ch < ' ' || ch === '\u007f') return null;
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const afterScheme = input.replace(/^https:\/\//i, '');
  const authority = afterScheme.split(/[/?#]/)[0];
  // URL parsing also resolves dot segments (/./pair, /x/../pair): the raw path must be /pair.
  if (!afterScheme.slice(authority.length).startsWith('/pair#')) return null;
  if (url.protocol !== 'https:' || authority.toLowerCase() !== 'blanc.day' || url.pathname !== '/pair'
    || url.search !== '' || input.includes('?') || !url.hash) return null;
  return normalizeCode(url.hash.slice(1));
}

const isRecoveryCode = (input) => typeof input === 'string' && input.trim().startsWith('blanc-sync:');

const encodeRecoveryCode = (payload) =>
  RECOVERY_PREFIX + Buffer.from(JSON.stringify(validatePayload(payload))).toString('base64url');

function decodeRecoveryCode(input) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text.startsWith(RECOVERY_PREFIX)) throw INVALID();
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(text.slice(RECOVERY_PREFIX.length), 'base64url').toString('utf8'));
  } catch {
    throw INVALID();
  }
  return validatePayload(parsed);
}

module.exports = {
  CODE_ALPHABET, CODE_LENGTH, PAIR_TTL_MS,
  generateCode, normalizeCode, formatCode, pairingMaterial,
  validatePayload, wrapSecret, unwrapSecret,
  isRecoveryCode, encodeRecoveryCode, decodeRecoveryCode,
  pairLink, pairLinkCode,
};
