const LOOPBACK_V4 = /^127(?:\.\d{1,3}){3}$/;
const MAX_CERTIFICATE_RECORDS = 512;

function unwrapViewSource(url) {
  return typeof url === 'string' && url.startsWith('view-source:')
    ? url.slice('view-source:'.length)
    : url;
}

function isLoopbackHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  return host === 'localhost' || host.endsWith('.localhost') ||
    host === '[::1]' || host === '::1' || LOOPBACK_V4.test(host);
}

const LOCAL_USE_SUFFIXES = ['.local', '.lan', '.internal', '.home.arpa'];

function ipv4Octets(host) {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return octets.every((n) => Number.isInteger(n) && n <= 255) ? octets : null;
}

function isLocalNetworkHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  if (!host) return false;
  if (isLoopbackHost(host)) return true;
  const v4 = ipv4Octets(host);
  if (v4) {
    const [a, b] = v4;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (/^\d+(\.\d+)*$/.test(host)) return false; // malformed numeric, never a name
  const v6 = host.replace(/^\[|\]$/g, '');
  if (v6.includes(':')) {
    const first = parseInt(v6.split(':')[0] || '0', 16);
    if (!Number.isFinite(first)) return false;
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
  }
  if (!host.includes('.')) return true; // single-label intranet name
  return LOCAL_USE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function cleanText(value, max = 240) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function sanitizeCertificate(certificate) {
  if (!certificate || typeof certificate !== 'object') return null;
  const validStart = Number(certificate.validStart);
  const validExpiry = Number(certificate.validExpiry);
  return {
    subject: cleanText(certificate.subjectName ?? certificate.subject?.commonName),
    issuer: cleanText(certificate.issuerName ?? certificate.issuer?.commonName),
    validFrom: Number.isFinite(validStart) && validStart > 0 ? validStart * 1000 : null,
    validTo: Number.isFinite(validExpiry) && validExpiry > 0 ? validExpiry * 1000 : null,
    fingerprint: cleanText(certificate.fingerprint, 160),
  };
}

const CERTIFICATE_ERROR_KEYS = {
  ERR_CERT_DATE_INVALID: 'certError.dateInvalid',
  ERR_CERT_COMMON_NAME_INVALID: 'certError.commonNameInvalid',
  ERR_CERT_AUTHORITY_INVALID: 'certError.authorityInvalid',
  ERR_CERT_REVOKED: 'certError.revoked',
  ERR_CERT_WEAK_SIGNATURE_ALGORITHM: 'certError.weakSignature',
  ERR_CERT_INVALID: 'certError.invalid',
};

// `t` is the interface translator; every text-producing function takes it.
function certificateErrorMessage(error, t) {
  const code = String(error ?? '').replace(/^net::/, '');
  return t(Object.hasOwn(CERTIFICATE_ERROR_KEYS, code) ? CERTIFICATE_ERROR_KEYS[code] : 'certError.generic');
}

function createCertificateObserver() {
  const records = new WeakMap();
  // Hosts that passed verification this run, never cleared on a later
  // failure: such a host is ineligible for Continue (certificate spec §3.3).
  const verified = new WeakMap();
  const observed = new WeakSet();

  function observe(browsingSession) {
    if (!browsingSession || observed.has(browsingSession) ||
        typeof browsingSession.setCertificateVerifyProc !== 'function') return;
    observed.add(browsingSession);
    const byHost = new Map();
    records.set(browsingSession, byHost);
    const verifiedHosts = new Set();
    verified.set(browsingSession, verifiedHosts);
    browsingSession.setCertificateVerifyProc((request, callback) => {
      try {
        const hostname = cleanText(request?.hostname, 255)?.toLowerCase();
        if (hostname && request?.verificationResult === 'OK') {
          verifiedHosts.add(hostname);
          byHost.delete(hostname);
          byHost.set(hostname, {
            certificate: sanitizeCertificate(request.validatedCertificate ?? request.certificate),
            isIssuedByKnownRoot: request.isIssuedByKnownRoot === true,
          });
          if (byHost.size > MAX_CERTIFICATE_RECORDS) byHost.delete(byHost.keys().next().value);
        } else if (hostname) {
          byHost.delete(hostname);
        }
      } finally {
        // -3 delegates the decision to Chromium and preserves CT. Returning 0
        // here would accept the certificate and weaken the browser.
        callback(-3);
      }
    });
  }

  function get(browsingSession, url) {
    try {
      const parsed = new URL(unwrapViewSource(url));
      if (parsed.protocol !== 'https:') return null;
      return records.get(browsingSession)?.get(parsed.hostname.toLowerCase()) ?? null;
    } catch {
      return null;
    }
  }

  function wasVerifiedThisRun(browsingSession, url) {
    try {
      const parsed = new URL(unwrapViewSource(url));
      return verified.get(browsingSession)?.has(parsed.hostname.toLowerCase()) === true;
    } catch {
      return false;
    }
  }

  return { observe, get, wasVerifiedThisRun };
}

function buildSiteInfo(url, {
  certificateRecord = null,
  certificateError = null,
  certificateException = null,
  blockedCount = 0,
  permissions = [],
  t,
} = {}) {
  const target = certificateError?.url ?? unwrapViewSource(url);
  let parsed;
  try { parsed = new URL(target); } catch {
    return {
      state: 'neutral', origin: '', host: '',
      title: t('siteSecurity.unavailable.title'),
      summary: t('siteSecurity.unavailable.summary'),
      certificate: null, blockedCount: 0, permissions: [],
    };
  }
  const base = {
    origin: parsed.origin === 'null' ? '' : parsed.origin,
    host: parsed.hostname,
    certificate: certificateError?.certificate ?? certificateRecord?.certificate ?? null,
    blockedCount: Number.isFinite(blockedCount) ? Math.max(0, Math.trunc(blockedCount)) : 0,
    permissions: Array.isArray(permissions) ? permissions : [],
  };
  if (certificateError) {
    return {
      ...base,
      state: 'certificate-error',
      title: t('siteSecurity.certError.title'),
      summary: certificateErrorMessage(certificateError.error, t),
      error: cleanText(certificateError.error, 120),
    };
  }
  if (certificateException) {
    return {
      ...base,
      certificate: certificateException.certificate ?? base.certificate,
      state: 'certificate-exception',
      title: t('siteSecurity.certException.title'),
      summary: t('siteSecurity.certException.summary'),
    };
  }
  if (parsed.protocol === 'https:') {
    return {
      ...base,
      state: 'secure',
      title: t('siteSecurity.secure.title'),
      summary: t(certificateRecord?.isIssuedByKnownRoot === false
        ? 'siteSecurity.secure.summaryPrivateRoot'
        : 'siteSecurity.secure.summary'),
    };
  }
  if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) {
    return { ...base, state: 'local', title: t('siteSecurity.local.title'), summary: t('siteSecurity.local.summary') };
  }
  if (parsed.protocol === 'http:') {
    return { ...base, state: 'insecure', title: t('siteSecurity.insecure.title'), summary: t('siteSecurity.insecure.summary') };
  }
  if (parsed.protocol === 'blanc:') {
    return { ...base, state: 'internal', title: t('siteSecurity.internal.title'), summary: t('siteSecurity.internal.summary') };
  }
  return { ...base, state: 'neutral', title: t('siteSecurity.neutral.title'), summary: t('siteSecurity.neutral.summary') };
}

function certificateErrorQuery(record, fallback = {}, { canContinue = false, t } = {}) {
  const certificate = record?.certificate ?? null;
  const query = new URLSearchParams({
    kind: 'certificate',
    url: record?.url ?? fallback.url ?? '',
    code: String(fallback.code ?? ''),
    desc: fallback.desc ?? '',
    certError: record?.error ?? '',
    certMessage: certificateErrorMessage(record?.error, t),
    issuer: certificate?.issuer ?? '',
    subject: certificate?.subject ?? '',
    validTo: certificate?.validTo ? String(certificate.validTo) : '',
  });
  // Main alone decides eligibility (certificate spec §4.3); the page only
  // reads this flag and never receives a fingerprint.
  if (canContinue === true) query.set('continue', '1');
  return query;
}

module.exports = {
  MAX_CERTIFICATE_RECORDS,
  buildSiteInfo,
  certificateErrorMessage,
  certificateErrorQuery,
  createCertificateObserver,
  isLocalNetworkHost,
  isLoopbackHost,
  sanitizeCertificate,
};
