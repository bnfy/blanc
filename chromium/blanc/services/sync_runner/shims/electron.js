// Electron's edge of shipping sync, as sync-device.js draws it.
const host = globalThis.__host;
class Headers { constructor(h) { this.h = new Map(Object.entries(h || {}).map(([k, v]) => [k.toLowerCase(), v])); } get(k) { return this.h.get(String(k).toLowerCase()) ?? null; } has(k) { return this.h.has(String(k).toLowerCase()); } }
function fetch(url, init = {}) {
  return new Promise((resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason); signal?.addEventListener('abort', onAbort);
    const body = init.body == null ? null : typeof init.body === 'string' ? Buffer.from(init.body) : init.body;
    host.fetch(String(url), init.method || 'GET', JSON.stringify(init.headers || {}), body, (error, status, headers, data) => {
      signal?.removeEventListener('abort', onAbort);
      if (error) return reject(new TypeError(`fetch failed: ${error}`));
      const bytes = Buffer.from(data || []);
      resolve({ok: status >= 200 && status < 300, status, headers: new Headers(JSON.parse(headers || '{}')),
        text: async () => bytes.toString(), json: async () => JSON.parse(bytes.toString()), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)});
    });
  });
}
const quitHandlers = [];
module.exports = {
  app: {isPackaged: !host.testEndpoint, getPath: () => '/sync', getVersion: () => host.version, on(e, f) { if (e === 'before-quit') quitHandlers.push(f); }, whenReady: async () => {}},
  net: {fetch},
  safeStorage: {isEncryptionAvailable: () => !!host.keyStore, getSelectedStorageBackend: () => 'android_keystore',
    encryptString: s => { const r = host.protect(Buffer.from(s)); if (!r) throw new Error('keystore'); return Buffer.from(r); },
    decryptString: b => { const r = host.unprotect(b); if (!r) throw new Error('keystore'); return Buffer.from(r).toString(); }},
  dialog: {showMessageBox: async () => ({response: 0})},
  clipboard: {writeText() {}},
  nativeImage: {createFromBuffer: () => ({isEmpty: () => true}), createFromBitmap: () => ({isEmpty: () => true})},
  nativeTheme: {}, shell: {}, screen: {}, systemPreferences: {}, BrowserWindow: {getAllWindows: () => []},
  __quit() { for (const f of quitHandlers) f(); },
};
