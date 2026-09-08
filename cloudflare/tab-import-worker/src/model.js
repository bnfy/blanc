export const HANDOFF_VERSION = 1;
export const ENVELOPE_VERSION = 2;
export const HANDOFF_TTL_MS = 10 * 60 * 1000;
export const MAX_TABS = 100;
export const MAX_URL_LENGTH = 2048;
export const MAX_TITLE_LENGTH = 200;
export const MAX_CIPHERTEXT_BYTES = 256 * 1024;
export const LANDING_ORIGIN = 'https://blancbrowser.com';

export const SOURCE_BROWSERS = new Set([
  'chrome', 'edge', 'brave', 'opera', 'vivaldi', 'firefox', 'safari',
]);
export const CHATGPT_BROWSERS = new Set([
  'chrome', 'edge', 'brave', 'opera', 'vivaldi',
]);

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function encodeBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeBase64Url(value, expectedBytes = null) {
  if (typeof value !== 'string' || !value || !BASE64URL.test(value)) return null;
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/')
      + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (expectedBytes != null && bytes.length !== expectedBytes) return null;
    if (encodeBase64Url(bytes) !== value) return null;
    return bytes;
  } catch {
    return null;
  }
}

export function randomBase64Url(byteLength) {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

function sanitizedUrl(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_URL_LENGTH) return null;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username || parsed.password
    ) return null;
    return parsed.href.length <= MAX_URL_LENGTH ? parsed.href : null;
  } catch {
    return null;
  }
}

function titleFor(value, url) {
  if (typeof value === 'string') {
    const title = [...value.replace(/\s+/g, ' ').trim()].slice(0, MAX_TITLE_LENGTH).join('');
    if (title) return title;
  }
  return new URL(url).hostname;
}

export function sanitizeHandoffInput(raw, { chatgptOnly = false } = {}) {
  const allowed = chatgptOnly ? CHATGPT_BROWSERS : SOURCE_BROWSERS;
  if (!raw || raw.v !== HANDOFF_VERSION || !allowed.has(raw.sourceBrowser)) {
    return { ok: false, error: 'invalid-handoff' };
  }
  if (!Array.isArray(raw.tabs) || !raw.tabs.length) return { ok: false, error: 'empty' };
  if (raw.tabs.length > MAX_TABS) return { ok: false, error: 'too-many-tabs' };

  const tabs = [];
  let skippedCount = 0;
  let activeCount = 0;
  for (const row of raw.tabs) {
    const url = sanitizedUrl(row?.url);
    if (!url) {
      skippedCount += 1;
      continue;
    }
    const active = row?.active === true;
    if (active) activeCount += 1;
    tabs.push({ url, title: titleFor(row?.title, url), active });
  }
  if (!tabs.length) return { ok: false, error: 'empty' };
  if (activeCount > 1) return { ok: false, error: 'multiple-active-tabs' };
  if (!activeCount) tabs[0].active = true;
  return {
    ok: true,
    value: { v: HANDOFF_VERSION, sourceBrowser: raw.sourceBrowser, tabs },
    skippedCount,
  };
}

export function validateEnvelope(raw) {
  if (!raw || raw.v !== ENVELOPE_VERSION || raw.algorithm !== 'AES-GCM'
    || !Number.isSafeInteger(raw.expiresAt) || raw.expiresAt <= 0) return null;
  const iv = decodeBase64Url(raw.iv, 12);
  const ciphertext = decodeBase64Url(raw.ciphertext);
  if (!iv || !ciphertext || ciphertext.length < 16 || ciphertext.length > MAX_CIPHERTEXT_BYTES) return null;
  return {
    v: ENVELOPE_VERSION,
    expiresAt: raw.expiresAt,
    algorithm: 'AES-GCM',
    iv: raw.iv,
    ciphertext: raw.ciphertext,
  };
}

// Wire format shared with the companions and desktop. JSON tuple ordering is
// deliberate: neither expiry nor the URL's ID may be substituted on replay.
export function handoffAdditionalData(id, expiresAt) {
  return new TextEncoder().encode(JSON.stringify(['blanc-tab-handoff', ENVELOPE_VERSION, id, expiresAt]));
}

export function validUploadExpiry(expiresAt, now = Date.now()) {
  return Number.isSafeInteger(expiresAt) && expiresAt > now && expiresAt <= now + HANDOFF_TTL_MS;
}

export async function encryptHandoff(payload, { now = Date.now() } = {}) {
  const id = randomBase64Url(16);
  const expiresAt = now + HANDOFF_TTL_MS;
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  try {
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({
      name: 'AES-GCM', iv, additionalData: handoffAdditionalData(id, expiresAt),
    }, key, plaintext));
    if (encrypted.length > MAX_CIPHERTEXT_BYTES) throw new Error('too-large');
    return {
      id,
      key: encodeBase64Url(keyBytes),
      envelope: {
        v: ENVELOPE_VERSION,
        expiresAt,
        algorithm: 'AES-GCM',
        iv: encodeBase64Url(iv),
        ciphertext: encodeBase64Url(encrypted),
      },
    };
  } finally {
    keyBytes.fill(0);
  }
}

export function launchUrlFor({ id, key }, landingOrigin = LANDING_ORIGIN) {
  if (!decodeBase64Url(id, 16) || !decodeBase64Url(key, 32)) throw new Error('invalid-capability');
  return `${landingOrigin}/import-tabs/#v=${HANDOFF_VERSION}&id=${id}&key=${key}`;
}
