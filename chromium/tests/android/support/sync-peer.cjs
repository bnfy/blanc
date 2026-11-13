// A sync device in a bare V8 context, running the same bundle as the phone. Node's crypto and
// fetch stand in for the runner's native host, which is what makes it a peer to test against.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BUNDLE = path.resolve(__dirname, '../../../blanc/services/sync_runner/generated/sync-bundle.js');
const u8 = bytes => Uint8Array.from(Buffer.from(bytes));

// A kept-alive connection the server dropped before answering. The test's thread is blocked by adb
// and sleep() past the Worker's five-second keep-alive, so a request can land on one.
const DROPPED = new Set(['ECONNRESET', 'UND_ERR_SOCKET', 'EPIPE']);

// After a long block every idle connection in the pool can be stale, so a few tries, not one.
const TRIES = 5;

// The native host's fetch, in Node. Like Chromium, it sends a request again when its connection was
// dropped before any answer.
function hostFetch(url, method, headers, body, done, tries = TRIES) {
  fetch(url, {method, headers: JSON.parse(headers), body: body ? Buffer.from(body) : undefined}).then(async response => {
    done(null, response.status, JSON.stringify(Object.fromEntries(response.headers)), u8(await response.arrayBuffer()));
  }, error => {
    if (tries > 1 && DROPPED.has(error.cause?.code)) hostFetch(url, method, headers, body, done, tries - 1);
    else done(String(error));
  });
}

function peer(name, endpoint, {stores = {}, platform = 'linux', emit} = {}) {
  let context;
  const host = {
    platform, version: '1.0.0', testEndpoint: endpoint, deviceName: name, keyStore: true,
    env: {BLANC_TEST: '1', BLANC_TEST_SYNC_ENDPOINT: endpoint},
    log() {}, emit: (event, text) => emit?.(event, text), monotonicNow: () => performance.now(),
    protect: u8, unprotect: u8,
    setTimer(id, ms) { const timer = setTimeout(() => context.__fireTimer(id), ms); timer.unref?.(); },
    parseUrl(url, base) {
      try {
        const {href, protocol, username, password, host, hostname, port, pathname, search, hash} = new URL(url, base);
        return {href, protocol, username, password, host, hostname, port, pathname, search, hash};
      } catch { return null; }
    },
    loadStores: () => ({...stores}),
    writeStore(file, data) { stores[file] = u8(data); },
    persistDesktopStore(file, data) { stores[file] = u8(data); return true; },
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
    fetch: hostFetch,
  };
  context = vm.createContext({__host: host});
  vm.runInContext(fs.readFileSync(BUNDLE, 'utf8'), context, {filename: 'sync-bundle.js'});
  const sync = context.__require('src/main/sync.js');
  return {
    context, stores, sync,
    module: file => context.__require(`src/main/${file}.js`),
    // A full pass now, past shipping's request window.
    async pass() { sync.resetRequestWindowForTest(); return sync.syncNow(); },
  };
}

module.exports = {peer, hostFetch};
