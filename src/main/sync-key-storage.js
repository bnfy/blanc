'use strict';

class SyncKeyStorageError extends Error {}

function assertSecureBackend(safeStorage) {
  if (!safeStorage?.isEncryptionAvailable?.()) {
    throw new SyncKeyStorageError('OS credential encryption is unavailable');
  }
  // Electron can fall back to reversible "basic_text" on Linux when no
  // secret store is available. That is not at-rest protection, so fail closed.
  if (safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
    throw new SyncKeyStorageError('A secure OS credential store is unavailable');
  }
}

function validateKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new SyncKeyStorageError('Invalid sync key');
  }
}

function protectSyncKey(safeStorage, key) {
  assertSecureBackend(safeStorage);
  validateKey(key);
  const encrypted = safeStorage.encryptString(key.toString('base64'));
  if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
    throw new SyncKeyStorageError('OS credential encryption failed');
  }
  return encrypted.toString('base64');
}

function unprotectSyncKey(safeStorage, protectedKey) {
  assertSecureBackend(safeStorage);
  if (typeof protectedKey !== 'string' || !protectedKey) {
    throw new SyncKeyStorageError('Protected sync key is missing');
  }
  let plaintext;
  try {
    plaintext = safeStorage.decryptString(Buffer.from(protectedKey, 'base64'));
  } catch {
    throw new SyncKeyStorageError('OS credential decryption failed');
  }
  const key = Buffer.from(plaintext, 'base64');
  validateKey(key);
  return key;
}

module.exports = {
  SyncKeyStorageError,
  protectSyncKey,
  unprotectSyncKey,
};
