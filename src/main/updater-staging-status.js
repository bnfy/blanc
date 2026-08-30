const fs = require('node:fs');
const crypto = require('node:crypto');

function cleanToken(value, fallback = 'unknown') {
  const text = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(text) ? text : fallback;
}

function cleanVersion(value) {
  const text = String(value ?? '').trim();
  return /^[0-9a-zA-Z.+_-]{1,80}$/.test(text) ? text : null;
}

function cleanError(value) {
  return String(value ?? '')
    .replace(/\b(?:https?|file):\/\/\S+/gi, '[redacted-url]')
    .replace(/\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)=[^\s]+/gi, '[redacted-secret]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 240) || 'update error';
}

function buildStagingStatus(phase, {
  currentVersion,
  updateVersion = null,
  error = null,
  at = Date.now(),
} = {}) {
  const status = {
    schemaVersion: 1,
    phase: cleanToken(phase),
    currentVersion: cleanVersion(currentVersion) ?? 'unknown',
    at: new Date(Number.isFinite(at) ? at : 0).toISOString(),
  };
  const nextVersion = cleanVersion(updateVersion);
  if (nextVersion) status.updateVersion = nextVersion;
  if (error != null) status.error = cleanError(error);
  return status;
}

function writeStagingStatus(file, status, {
  fileSystem = fs,
  nonce = () => `${process.pid}-${crypto.randomUUID()}`,
} = {}) {
  if (!file) return false;
  const temporary = `${file}.${nonce()}.tmp`;
  try {
    fileSystem.writeFileSync(temporary, `${JSON.stringify(status, null, 2)}\n`, {
      encoding: 'utf8', mode: 0o600,
    });
    fileSystem.renameSync(temporary, file);
    return true;
  } finally {
    try { fileSystem.unlinkSync(temporary); } catch { /* best effort */ }
  }
}

module.exports = { buildStagingStatus, cleanError, writeStagingStatus };
