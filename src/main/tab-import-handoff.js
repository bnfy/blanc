'use strict';

const crypto = require('node:crypto');

const TAB_IMPORT_PROTOCOL = 'blanc-import:';
const TAB_IMPORT_HOST = 'tabs';
const TAB_IMPORT_VERSION = 1;
const TAB_IMPORT_RELAY_ORIGIN = 'https://tabs.blancbrowser.com';
const TAB_IMPORT_TTL_MS = 10 * 60 * 1000;
const MAX_TAB_IMPORT_TABS = 100;
const MAX_TAB_IMPORT_URL_LENGTH = 2048;
const MAX_TAB_IMPORT_TITLE_LENGTH = 200;
const MAX_TAB_IMPORT_ENVELOPE_BYTES = 256 * 1024;

const SOURCE_BROWSERS = new Set([
  'chrome', 'edge', 'brave', 'opera', 'vivaldi', 'firefox', 'safari',
]);

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function decodeBase64Url(value, expectedBytes = null) {
  if (typeof value !== 'string' || !value || !BASE64URL.test(value)) return null;
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (expectedBytes != null && bytes.length !== expectedBytes) return null;
    if (bytes.toString('base64url') !== value) return null;
    return bytes;
  } catch {
    return null;
  }
}

function parseTabImportUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== TAB_IMPORT_PROTOCOL ||
    parsed.hostname !== TAB_IMPORT_HOST ||
    parsed.pathname !== '' && parsed.pathname !== '/' ||
    parsed.username || parsed.password || parsed.port || parsed.hash
  ) return null;

  const allowed = new Set(['v', 'id', 'key']);
  const keys = [...parsed.searchParams.keys()];
  if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) return null;
  for (const key of allowed) {
    if (parsed.searchParams.getAll(key).length !== 1) return null;
  }
  if (parsed.searchParams.get('v') !== String(TAB_IMPORT_VERSION)) return null;
  const id = parsed.searchParams.get('id');
  const key = parsed.searchParams.get('key');
  if (!decodeBase64Url(id, 16) || !decodeBase64Url(key, 32)) return null;
  return { v: TAB_IMPORT_VERSION, id, key };
}

function tabImportUrlsFromArgv(argv) {
  if (!Array.isArray(argv)) return [];
  return argv.filter((arg) => parseTabImportUrl(arg));
}

function normalizeTitle(value, url) {
  if (typeof value === 'string') {
    const title = [...value.replace(/\s+/g, ' ').trim()]
      .slice(0, MAX_TAB_IMPORT_TITLE_LENGTH)
      .join('');
    if (title) return title;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return 'Imported tab';
  }
}

async function readBoundedResponseBytes(response, maxBytes) {
  if (!response || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('invalid-envelope');
  }
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('invalid-envelope');
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error('invalid-envelope');
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) throw new Error('invalid-envelope');
      chunks.push(chunk);
    }
  } catch (error) {
    try { await reader.cancel(); } catch {}
    if (error?.message === 'invalid-envelope') throw error;
    throw new Error('invalid-envelope');
  }
  return Buffer.concat(chunks, total);
}

function sanitizeImportUrl(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_TAB_IMPORT_URL_LENGTH) return null;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username || parsed.password
    ) return null;
    return parsed.href.length <= MAX_TAB_IMPORT_URL_LENGTH ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Validate data after decryption. Invalid/non-web rows are omitted while
 * order and duplicates remain intact. A structurally oversized handoff fails
 * instead of silently deciding which of the user's tabs to drop. */
function sanitizeTabHandoff(raw, { allowedBrowsers = SOURCE_BROWSERS } = {}) {
  if (!raw || raw.v !== TAB_IMPORT_VERSION || !allowedBrowsers.has(raw.sourceBrowser)) {
    return { ok: false, error: 'invalid-handoff' };
  }
  if (!Array.isArray(raw.tabs) || raw.tabs.length === 0) {
    return { ok: false, error: 'empty' };
  }
  if (raw.tabs.length > MAX_TAB_IMPORT_TABS) {
    return { ok: false, error: 'too-many-tabs' };
  }

  const tabs = [];
  let skippedCount = 0;
  let activeCount = 0;
  for (const row of raw.tabs) {
    const url = sanitizeImportUrl(row?.url);
    if (!url) {
      skippedCount += 1;
      continue;
    }
    const active = row?.active === true;
    if (active) activeCount += 1;
    tabs.push({ url, title: normalizeTitle(row?.title, url), active });
  }
  if (!tabs.length) return { ok: false, error: 'empty' };
  if (activeCount > 1) return { ok: false, error: 'multiple-active-tabs' };
  if (activeCount === 0) tabs[0].active = true;
  return {
    ok: true,
    value: { v: TAB_IMPORT_VERSION, sourceBrowser: raw.sourceBrowser, tabs },
    skippedCount,
  };
}

function validateEncryptedEnvelope(raw) {
  if (!raw || raw.v !== 2 || raw.algorithm !== 'AES-GCM'
    || !Number.isSafeInteger(raw.expiresAt) || raw.expiresAt <= 0) return null;
  const iv = decodeBase64Url(raw.iv, 12);
  const ciphertext = decodeBase64Url(raw.ciphertext);
  if (!iv || !ciphertext || ciphertext.length < 16 || ciphertext.length > MAX_TAB_IMPORT_ENVELOPE_BYTES) {
    return null;
  }
  return { v: 2, algorithm: 'AES-GCM', iv, ciphertext, expiresAt: raw.expiresAt };
}

async function decryptTabHandoffEnvelope(rawEnvelope, encodedKey, id, { now = Date.now } = {}) {
  const envelope = validateEncryptedEnvelope(rawEnvelope);
  const keyBytes = decodeBase64Url(encodedKey, 32);
  if (!envelope || !keyBytes || !decodeBase64Url(id, 16)) throw new Error('invalid-envelope');
  let plaintext;
  try {
    const key = await crypto.webcrypto.subtle.importKey(
      'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']
    );
    const result = await crypto.webcrypto.subtle.decrypt(
      {
        name: 'AES-GCM', iv: envelope.iv,
        additionalData: new TextEncoder().encode(JSON.stringify([
          'blanc-tab-handoff', 2, id, envelope.expiresAt,
        ])),
      }, key, envelope.ciphertext
    );
    plaintext = new TextDecoder().decode(result);
  } catch {
    throw new Error('decryption-failed');
  } finally {
    keyBytes.fill(0);
  }
  // Check only authenticated time, including time spent receiving/decrypting.
  const currentTime = now();
  if (envelope.expiresAt <= currentTime || envelope.expiresAt > currentTime + TAB_IMPORT_TTL_MS) {
    throw new Error('invalid-expiry');
  }
  try {
    return JSON.parse(plaintext);
  } catch {
    throw new Error('invalid-payload');
  }
}

function tabImportClaimUrl(id, origin = TAB_IMPORT_RELAY_ORIGIN) {
  if (!decodeBase64Url(id, 16)) throw new Error('invalid-handoff-id');
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
    throw new Error('invalid-relay-origin');
  }
  return `${parsedOrigin.origin}/v1/handoffs/${id}/claim`;
}

module.exports = {
  MAX_TAB_IMPORT_ENVELOPE_BYTES,
  MAX_TAB_IMPORT_TABS,
  MAX_TAB_IMPORT_TITLE_LENGTH,
  MAX_TAB_IMPORT_URL_LENGTH,
  SOURCE_BROWSERS,
  TAB_IMPORT_PROTOCOL,
  TAB_IMPORT_RELAY_ORIGIN,
  TAB_IMPORT_TTL_MS,
  TAB_IMPORT_VERSION,
  decodeBase64Url,
  decryptTabHandoffEnvelope,
  parseTabImportUrl,
  readBoundedResponseBytes,
  sanitizeImportUrl,
  sanitizeTabHandoff,
  tabImportClaimUrl,
  tabImportUrlsFromArgv,
  validateEncryptedEnvelope,
};
