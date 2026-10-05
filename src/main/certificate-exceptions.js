'use strict';

// Session-only "continue anyway" choices for local-network certificate
// failures (spec 2026-10-05-certificate-continue-local-design.md). Pure: no
// electron. Entries are main-process secrets — never persist, sync, log, or
// send them over IPC.
const { isLocalNetworkHost } = require('./site-security');

const ELIGIBLE_CERTIFICATE_ERRORS = new Set([
  'ERR_CERT_AUTHORITY_INVALID',
  'ERR_CERT_COMMON_NAME_INVALID',
  'ERR_CERT_SELF_SIGNED_LOCAL_NETWORK',
  'ERR_CERT_DATE_INVALID',
  'ERR_CERT_WEAK_SIGNATURE_ALGORITHM',
  'ERR_CERT_VALIDITY_TOO_LONG',
  'ERR_CERT_NON_UNIQUE_NAME',
]);
const DEFAULT_CAP = 64;

function errorCode(error) {
  return String(error ?? '').replace(/^net::/, '');
}

function originKey(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return `https://${parsed.hostname.toLowerCase()}:${parsed.port || '443'}`;
  } catch {
    return null;
  }
}

function hasDates(certificate) {
  return Number.isFinite(certificate?.validFrom) && Number.isFinite(certificate?.validTo);
}

function isTimeValid(certificate, now) {
  return now >= certificate.validFrom && now <= certificate.validTo;
}

function createCertificateExceptions({ cap = DEFAULT_CAP, onEvict = () => {} } = {}) {
  const bySession = new WeakMap();
  // Sessions that ever held an entry, so setCapForTest can re-apply a lowered
  // cap (WeakMap is not iterable). Electron sessions live for the process.
  const touchedSessions = new Set();
  let limit = cap;

  function entriesFor(browsingSession, create) {
    let entries = bySession.get(browsingSession);
    if (!entries && create) {
      entries = new Map();
      bySession.set(browsingSession, entries);
    }
    return entries ?? null;
  }

  function enforceCap(browsingSession, entries) {
    let evicted = false;
    while (entries.size > limit) {
      entries.delete(entries.keys().next().value);
      evicted = true;
    }
    if (evicted) onEvict(browsingSession);
  }

  function isEligible({ url, error, certificate, verifiedThisRun }) {
    const key = originKey(url);
    if (!key || verifiedThisRun !== false) return false;
    if (!ELIGIBLE_CERTIFICATE_ERRORS.has(errorCode(error))) return false;
    if (typeof certificate?.fingerprint !== 'string' || !certificate.fingerprint) return false;
    if (!hasDates(certificate)) return false;
    return isLocalNetworkHost(new URL(url).hostname);
  }

  function allow(browsingSession, { url, error, certificate, now }) {
    if (!isEligible({ url, error, certificate, verifiedThisRun: false })) return false;
    const entries = entriesFor(browsingSession, true);
    touchedSessions.add(browsingSession);
    const key = originKey(url);
    entries.delete(key);
    entries.set(key, {
      fingerprint: certificate.fingerprint,
      error: errorCode(error),
      timeValidAtAllow: isTimeValid(certificate, now),
      certificate: { ...certificate },
    });
    enforceCap(browsingSession, entries);
    return true;
  }

  function matches(browsingSession, { url, error, certificate, now }) {
    const entry = entriesFor(browsingSession, false)?.get(originKey(url));
    if (!entry || !certificate || !hasDates(certificate)) return false;
    return entry.fingerprint === certificate.fingerprint &&
      entry.error === errorCode(error) &&
      entry.timeValidAtAllow === isTimeValid(certificate, now);
  }

  function get(browsingSession, url) {
    const entry = entriesFor(browsingSession, false)?.get(originKey(url));
    return entry ? { error: `net::${entry.error}`, certificate: { ...entry.certificate } } : null;
  }

  function forget(browsingSession, url) {
    return entriesFor(browsingSession, false)?.delete(originKey(url)) === true;
  }

  function clear(browsingSession) {
    bySession.delete(browsingSession);
  }

  function setCapForTest(n) {
    limit = n;
    for (const browsingSession of touchedSessions) {
      const entries = bySession.get(browsingSession);
      if (entries) enforceCap(browsingSession, entries);
    }
  }

  return { isEligible, allow, matches, get, forget, clear, setCapForTest };
}

module.exports = {
  ELIGIBLE_CERTIFICATE_ERRORS,
  originKey,
  isTimeValid,
  createCertificateExceptions,
};
