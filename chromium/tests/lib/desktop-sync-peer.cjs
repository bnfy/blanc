// Desktop protocol fault fixture running the committed fork bundle.
// This separate host supplies virtual time and durable fixture files; the
// existing phone peer and the phone bundle entry points stay unchanged.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BUNDLE = path.resolve(__dirname, '../../blanc/services/sync_runner/generated/sync-bundle.js');
const u8 = bytes => Uint8Array.from(Buffer.from(bytes));

function peer(name, endpoint, {stores = {}, platform = 'darwin', emit, clock, request = fetch, writeStore} = {}) {
  let context;
  const host = {
    platform, version: '1.0.0', testEndpoint: endpoint, deviceName: name, keyStore: true,
    env: {BLANC_TEST: '1', BLANC_TEST_SYNC_ENDPOINT: endpoint},
    log() {}, emit: (event, text) => emit?.(event, text), monotonicNow: () => clock.monotonic(),
    protect: u8, unprotect: u8,
    setTimer(id, ms) { clock.setTimer(() => context.__fireTimer(id), ms); },
    parseUrl(url, base) {
      try {
        const {href, protocol, username, password, host, hostname, port, pathname, search, hash} = new URL(url, base);
        return {href, protocol, username, password, host, hostname, port, pathname, search, hash};
      } catch { return null; }
    },
    loadStores: () => ({...stores}),
    writeStore(file, data) { stores[file] = u8(data); writeStore?.(file, data); },
    persistDesktopStore(file, data) { stores[file] = u8(data); writeStore?.(file, data); return true; },
    randomBytes: size => u8(crypto.randomBytes(size)),
    digest: (algorithm, data) => u8(crypto.createHash(algorithm).update(data).digest()),
    scrypt: (password, salt, N, r, p, maxmem, size) => u8(crypto.scryptSync(Buffer.from(password), Buffer.from(salt), size, {N, r, p, maxmem})),
    hkdf: (algorithm, ikm, salt, info, size) => crypto.hkdfSync(algorithm, Buffer.from(ikm), Buffer.from(salt), Buffer.from(info), size),
    gcmSeal(key, iv, data) {
      const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(iv));
      return u8(Buffer.concat([cipher.update(Buffer.from(data)), cipher.final(), cipher.getAuthTag()]));
    },
    gcmOpen(key, iv, data) {
      try {
        const bytes = Buffer.from(data);
        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(iv));
        decipher.setAuthTag(bytes.subarray(bytes.length - 16));
        return u8(Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - 16)), decipher.final()]));
      } catch { return null; }
    },
    fetch(url, method, headers, body, done) {
      request(url, {method, headers: JSON.parse(headers), body: body ? Buffer.from(body) : undefined}).then(async response => {
        done(null, response.status, JSON.stringify(Object.fromEntries(response.headers)), u8(await response.arrayBuffer()));
      }, error => done(String(error)));
    },
  };
  context = vm.createContext({__host: host, Date: class extends Date { static now() { return clock.now(); } }});
  vm.runInContext(fs.readFileSync(BUNDLE, 'utf8'), context, {filename: 'sync-bundle.js'});
  const sync = context.__require('src/main/sync.js');
  return {
    context, stores, sync,
    module: file => context.__require(`src/main/${file}.js`),
    // A full pass now, past shipping's request window.
    async pass() { sync.resetRequestWindowForTest(); return sync.syncNow(); },
  };
}

module.exports = {peer};
