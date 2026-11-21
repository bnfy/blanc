// Node's crypto.webcrypto, as far as shipping's tab-import-handoff.js uses
// it: one AES-256-GCM decryption with additional authenticated data, through
// BoringSSL in __host. Kept apart from the Sync bundle's crypto shim so that
// bundle's bytes, which Android shares, do not change.
const host = globalThis.__host;
const bytes = value => Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
module.exports = {
  webcrypto: {
    subtle: {
      async importKey(format, key, algorithm, extractable, usages) {
        if (format !== 'raw' || algorithm?.name !== 'AES-GCM' || extractable !== false ||
            !Array.isArray(usages) || usages.length !== 1 || usages[0] !== 'decrypt') {
          throw new Error('Unsupported key import');
        }
        return { key: bytes(key) };
      },
      async decrypt(algorithm, key, data) {
        if (algorithm?.name !== 'AES-GCM' || !key?.key) throw new Error('Unsupported decryption');
        // WebCrypto's ciphertext ends with the 16-byte tag, as gcmOpen expects.
        const out = host.gcmOpen(key.key, bytes(algorithm.iv), bytes(data),
          bytes(algorithm.additionalData ?? new Uint8Array(0)));
        if (!out) throw new Error('The operation failed');
        return Uint8Array.from(out).buffer;
      },
    },
  },
};
