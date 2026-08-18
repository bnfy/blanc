// src/main/patron-model.js
// Pure entitlement decisions — NO require('electron'). Mirrors the Electron-free
// pattern of tabsync-model.js / session-workspace.js so every branch is unit-testable.

const KINDS = new Set(['founding', 'lifetime', 'subscription']);

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

function resolveKind(benefitId, allowlist) {
  if (typeof benefitId !== 'string' || benefitId === '') return null;
  if (!allowlist || typeof allowlist !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(allowlist, benefitId)) return null; // own-property only
  const kind = allowlist[benefitId];
  return KINDS.has(kind) ? kind : null;
}

module.exports = { readBenefitId, resolveKind, parseExpiresAt };
