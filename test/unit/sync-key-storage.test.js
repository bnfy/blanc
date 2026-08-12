'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  protectSyncKey,
  unprotectSyncKey,
} = require('../../src/main/sync-key-storage');

const secureStorage = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'keychain',
  encryptString: (value) => Buffer.from(`sealed:${value}`),
  decryptString: (value) => value.toString().slice('sealed:'.length),
};

test('sync keys round-trip only through the OS credential wrapper', () => {
  const key = Buffer.alloc(32, 7);
  const protectedKey = protectSyncKey(secureStorage, key);
  assert.notEqual(protectedKey, key.toString('base64'));
  assert.deepEqual(unprotectSyncKey(secureStorage, protectedKey), key);
});

test('plaintext Linux fallback and unavailable encryption fail closed', () => {
  assert.throws(
    () => protectSyncKey({ ...secureStorage, getSelectedStorageBackend: () => 'basic_text' }, Buffer.alloc(32)),
    /secure OS credential store/
  );
  assert.throws(
    () => protectSyncKey({ ...secureStorage, isEncryptionAvailable: () => false }, Buffer.alloc(32)),
    /encryption is unavailable/
  );
});

test('malformed protected values cannot become encryption keys', () => {
  assert.throws(() => protectSyncKey(secureStorage, Buffer.alloc(16)), /Invalid sync key/);
  assert.throws(
    () => unprotectSyncKey({ ...secureStorage, decryptString: () => 'not-base64' }, 'c2VhbGVk'),
    /Invalid sync key/
  );
});
