export const MAX_TABS = 100;
export const MAX_CIPHERTEXT_BYTES = 256 * 1024;
export const RELAY_ORIGIN = 'https://tabs.blancbrowser.com';
export const LANDING_ORIGIN = 'https://blancbrowser.com';

const encodeBase64Url = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

function normalizedTitle(value, url) {
  const title = typeof value === 'string'
    ? [...value.replace(/\s+/g, ' ').trim()].slice(0, 200).join('')
    : '';
  return title || new URL(url).hostname;
}

export function sanitizeExtensionTabs(rows) {
  const tabs = [];
  let skippedCount = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.incognito) {
      skippedCount += 1;
      continue;
    }
    let parsed;
    try { parsed = new URL(row?.url); } catch { parsed = null; }
    if (
      !parsed ||
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username || parsed.password ||
      row.url.length > 2048
    ) {
      skippedCount += 1;
      continue;
    }
    if (parsed.href.length > 2048) {
      skippedCount += 1;
      continue;
    }
    tabs.push({
      id: row.id,
      url: parsed.href,
      title: normalizedTitle(row.title, parsed.href),
      active: row.active === true,
    });
  }
  return { tabs, skippedCount };
}

export async function encryptSelectedTabs({ sourceBrowser, tabs }, cryptoApi = crypto) {
  if (!['firefox', 'safari'].includes(sourceBrowser)) throw new Error('unsupported-browser');
  if (!Array.isArray(tabs) || !tabs.length) throw new Error('empty');
  if (tabs.length > MAX_TABS) throw new Error('too-many-tabs');
  const active = tabs.filter((tab) => tab.active);
  if (active.length > 1) throw new Error('multiple-active-tabs');
  const payload = {
    v: 1,
    sourceBrowser,
    tabs: tabs.map(({ url, title, active: isActive }) => ({ url, title, active: isActive === true })),
  };
  if (!active.length) payload.tabs[0].active = true;

  const idBytes = cryptoApi.getRandomValues(new Uint8Array(16));
  const id = encodeBase64Url(idBytes);
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const keyBytes = cryptoApi.getRandomValues(new Uint8Array(32));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const key = await cryptoApi.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  try {
    const ciphertext = new Uint8Array(await cryptoApi.subtle.encrypt(
      {
        name: 'AES-GCM', iv,
        additionalData: new TextEncoder().encode(JSON.stringify(['blanc-tab-handoff', 2, id, expiresAt])),
      }, key, new TextEncoder().encode(JSON.stringify(payload))
    ));
    if (ciphertext.length > MAX_CIPHERTEXT_BYTES) throw new Error('too-large');
    return {
      id,
      key: encodeBase64Url(keyBytes),
      envelope: {
        v: 2,
        expiresAt,
        algorithm: 'AES-GCM',
        iv: encodeBase64Url(iv),
        ciphertext: encodeBase64Url(ciphertext),
      },
    };
  } finally {
    keyBytes.fill(0);
  }
}

export async function stageEncryptedHandoff(encrypted, fetchImpl = fetch) {
  const response = await fetchImpl(`${RELAY_ORIGIN}/v1/handoffs/${encrypted.id}`, {
    method: 'PUT',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encrypted.envelope),
  });
  if (!response.ok) throw new Error(response.status === 429 ? 'rate-limited'
    : response.status === 422 ? 'invalid-expiry' : 'unavailable');
  return `${LANDING_ORIGIN}/import-tabs/#v=1&id=${encrypted.id}&key=${encrypted.key}`;
}
