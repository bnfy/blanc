'use strict';
// Automatic recovery policy for a uBO provider that fails after it has been
// ready (docs/superpowers/specs/2026-10-06-ubo-automatic-recovery-design.md).
// Pure: no Electron, so it is unit-tested directly.

// Transient runtime failures a restart can clear.
const RECOVERABLE = new Set([
  'ubo-decision-timeout',
  'ubo-background-crashed', 'ubo-background-lost', 'ubo-background-disconnected', 'ubo-background-unavailable',
  'ubo-bridge-crashed', 'ubo-css-crashed', 'ubo-css-timeout',
]);
// Raised while an automatic attempt initializes; they fail that attempt but
// let the episode try again.
const ATTEMPT_RECOVERABLE = new Set([...RECOVERABLE, 'ubo-startup-timeout', 'ubo-initialization-failed']);

const RECOVERY_DEADLINE_MS = 30000;
const HOLD_CAPACITY = 512;
const DRAIN_RESERVE = 32;
const OUTAGE_CLAIM_MS = 10000;
const MAX_OUTAGE_TOKENS = 32;

function createRecoveryBudget({ limit = 3, windowMs = 600000, delaysMs = [0, 2000, 10000], now = Date.now } = {}) {
  const started = [];
  const age = () => {
    const t = now();
    while (started.length && t - started[0] >= windowMs) started.shift();
    return t;
  };
  return {
    take() {
      const t = age();
      if (started.length >= limit) return { allowed: false };
      started.push(t);
      const attempt = started.length;
      return { allowed: true, attempt, delayMs: delaysMs[Math.min(attempt, delaysMs.length) - 1] ?? 0 };
    },
    // Test-only use through the provider's guarded hook.
    exhaust() {
      const t = age();
      while (started.length < limit) started.push(t);
    },
  };
}

// The URL to reload when `currentUrl` is still the error page created for this
// outage token; otherwise null. Only http(s) targets are ever returned.
function outageReloadTarget(currentUrl, token) {
  if (typeof currentUrl !== 'string' || typeof token !== 'string' || !token) return null;
  let parsed;
  try { parsed = new URL(currentUrl); } catch { return null; }
  if (parsed.protocol !== 'blanc:' || parsed.hostname !== 'error') return null;
  const params = parsed.searchParams;
  if (params.get('code') !== '-20' || params.get('outage') !== token) return null;
  const url = params.get('url') || '';
  return /^https?:\/\//i.test(url) ? url : null;
}

module.exports = {
  RECOVERABLE, ATTEMPT_RECOVERABLE, RECOVERY_DEADLINE_MS, HOLD_CAPACITY, DRAIN_RESERVE,
  OUTAGE_CLAIM_MS, MAX_OUTAGE_TOKENS, createRecoveryBudget, outageReloadTarget,
};
