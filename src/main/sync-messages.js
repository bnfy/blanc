'use strict';

// Profile Sync reports errors as codes, and stores the last one in sync.json
// as a code too, so a saved error never freezes the language it was written
// in. pages.js turns codes into interface text at the Settings boundary.
//
// Codes: a plain id ('rate-limited'), or 'kind:detail' where detail is an HTTP
// status ('rejected:404', 'wipe-failed:503') or a key-storage reason
// ('key-store:missing' for setup, 'key:missing' for the status line).

const ERROR_KEYS = {
  'service-unavailable': 'sync.error.serviceUnavailable',
  'name-too-short': 'sync.error.nameTooShort',
  'weak-passphrase': 'sync.error.weakPassphrase',
  'key-protect-failed': 'sync.error.keyProtect',
  'credentials-save-failed': 'sync.error.credentialsSave',
  'bad-passphrase': 'sync.error.badPassphrase',
  'rate-limited': 'sync.error.rateLimited',
  conflict: 'sync.error.conflict',
  server: 'sync.error.server',
  'server-error': 'sync.error.serverError',
  offline: 'sync.error.offline',
  'sync-off': 'sync.error.off',
  'local-key-protect': 'sync.error.localKeyProtect',
  'local-key-unlock': 'sync.error.localKeyUnlock',
  'wipe-offline': 'sync.error.wipeOffline',
};

// SyncKeyStorageError codes (sync-key-storage.js, sync.js).
const KEY_STORAGE_KEYS = {
  'encryption-unavailable': 'sync.keyStorage.encryptionUnavailable',
  'store-unavailable': 'sync.keyStorage.storeUnavailable',
  'invalid-key': 'sync.keyStorage.invalidKey',
  'encryption-failed': 'sync.keyStorage.encryptionFailed',
  missing: 'sync.keyStorage.missing',
  'decryption-failed': 'sync.keyStorage.decryptionFailed',
  'persist-failed': 'sync.keyStorage.persistFailed',
};

/** Interface text for a sync error code. null stays null; anything that is
 * not a known code (a sentence saved by a build from before codes) is
 * returned unchanged. */
function syncErrorText(code, t) {
  if (typeof code !== 'string') return code ?? null;
  if (Object.hasOwn(ERROR_KEYS, code)) return t(ERROR_KEYS[code]);
  const split = code.indexOf(':');
  const kind = code.slice(0, split);
  const detail = code.slice(split + 1);
  if (split > 0 && /^\d{3}$/.test(detail)) {
    if (kind === 'rejected') return t('sync.error.rejected', { status: detail });
    if (kind === 'wipe-failed') return t('sync.error.wipeFailed', { status: detail });
  }
  if ((kind === 'key-store' || kind === 'key') && Object.hasOwn(KEY_STORAGE_KEYS, detail)) {
    const reason = t(KEY_STORAGE_KEYS[detail]);
    return kind === 'key-store' ? t('sync.error.keyStore', { reason }) : reason;
  }
  return code;
}

module.exports = { syncErrorText };
