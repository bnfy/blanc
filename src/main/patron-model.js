// src/main/patron-model.js
// Pure entitlement decisions — NO require('electron'). Mirrors the Electron-free
// pattern of tabsync-model.js / session-workspace.js so every branch is unit-testable.

const KINDS = new Set(['founding', 'lifetime', 'subscription']);
const GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const TERMINAL = new Set(['revoked', 'disabled']);

function readBenefitId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.benefit_id
    ?? payload.license_key?.benefit_id
    ?? payload.activation?.license_key?.benefit_id
    ?? null;
}

function parseExpiresAt(raw) {
  if (raw == null || raw === '') return null;        // absent — no expiry set
  if (typeof raw !== 'string') return false;         // present but wrong type — malformed
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? false : ms;              // unparseable string — malformed
}

// Polar's activate response nests the license key (payload.license_key or
// payload.activation.license_key); its validate response returns the key at the
// top level. These readers accept either shape so a wire-format difference can
// never silently drop the status/expiry a validation depends on — the same
// defensive three-path lookup readBenefitId uses.
function readLicenseStatus(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const status = payload.status
    ?? payload.license_key?.status
    ?? payload.activation?.license_key?.status;
  return typeof status === 'string' ? status : null;
}

function readExpiresAt(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return parseExpiresAt(
    payload.expires_at
    ?? payload.license_key?.expires_at
    ?? payload.activation?.license_key?.expires_at
    ?? null,
  );
}

function resolveKind(benefitId, allowlist) {
  if (typeof benefitId !== 'string' || benefitId === '') return null;
  if (!allowlist || typeof allowlist !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(allowlist, benefitId)) return null; // own-property only
  const kind = allowlist[benefitId];
  return KINDS.has(kind) ? kind : null;
}

function isRecordActive(record, now) {
  if (!record) return false;
  if (record.kind === 'founding' || record.kind === 'lifetime') return true;
  if (record.kind !== 'subscription') return false;
  return record.lastStatus === 'granted' && (now - (record.lastValidatedAt ?? 0)) <= GRACE_MS;
}

function evaluateValidation({ outcome, record, now }) {
  const next = { ...record };
  if (outcome.kind === 'ok') {
    next.lastAttemptedAt = now;
    const granted = outcome.status === 'granted';
    if (outcome.expiresAt === false && granted) {
      // malformed expiry — ambiguous, not terminal; leave record unchanged (ride grace)
    } else if (granted && (outcome.expiresAt === null || outcome.expiresAt > now) && outcome.benefitOk) {
      next.lastStatus = 'granted';
      next.lastValidatedAt = now;
    } else if (TERMINAL.has(outcome.status)) {
      next.lastStatus = outcome.status;               // confirmed terminal
    } else if (granted && (outcome.expiresAt !== null && outcome.expiresAt <= now)) {
      next.lastStatus = 'expired';                    // derived terminal
    } else if (granted && !outcome.benefitOk) {
      next.lastStatus = 'benefit_mismatch';           // derived terminal
    }
    // else: unknown, non-terminal status → leave lastStatus/lastValidatedAt untouched (ride grace)
  } else {
    next.lastAttemptedAt = now;                       // unreachable → ride grace, unchanged otherwise
  }
  return { active: isRecordActive(next, now), record: next };
}

function migrateSupporter({ supporter, patron, now }) {
  if (!supporter || patron) return null;
  return { patron: {
    kind: 'founding', key: supporter.key, activationId: supporter.activationId ?? null,
    benefitId: null, activatedAt: supporter.activatedAt ?? now,
  } };
}

function downgradeMirror(patron) {
  if (!patron || (patron.kind !== 'founding' && patron.kind !== 'lifetime')) return null;
  return { key: patron.key, activationId: patron.activationId ?? null, activatedAt: patron.activatedAt };
}

module.exports = { readBenefitId, resolveKind, parseExpiresAt, readLicenseStatus, readExpiresAt, GRACE_MS, isRecordActive, evaluateValidation, migrateSupporter, downgradeMirror };
