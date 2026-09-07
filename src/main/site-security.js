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

function certificateErrorMessage(error) {
  const code = String(error ?? '').replace(/^net::/, '');
  const messages = {
    ERR_CERT_DATE_INVALID: 'The certificate is expired or not valid yet.',
    ERR_CERT_COMMON_NAME_INVALID: 'The certificate does not match this site.',
    ERR_CERT_AUTHORITY_INVALID: 'The certificate issuer is not trusted by this device.',
    ERR_CERT_REVOKED: 'The certificate has been revoked.',
    ERR_CERT_WEAK_SIGNATURE_ALGORITHM: 'The certificate uses a weak signature.',
    ERR_CERT_INVALID: 'The certificate is invalid.',
  };
  return messages[code] ?? 'The site could not prove its identity with a valid certificate.';
}

function createCertificateObserver() {
  const records = new WeakMap();
  const observed = new WeakSet();

  function observe(browsingSession) {
    if (!browsingSession || observed.has(browsingSession) ||
        typeof browsingSession.setCertificateVerifyProc !== 'function') return;
    observed.add(browsingSession);
    const byHost = new Map();
    records.set(browsingSession, byHost);
    browsingSession.setCertificateVerifyProc((request, callback) => {
      try {
        const hostname = cleanText(request?.hostname, 255)?.toLowerCase();
        if (hostname && request?.verificationResult === 'OK') {
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

  return { observe, get };
}

function buildSiteInfo(url, {
  certificateRecord = null,
  certificateError = null,
  blockedCount = 0,
  permissions = [],
} = {}) {
  const target = certificateError?.url ?? unwrapViewSource(url);
  let parsed;
  try { parsed = new URL(target); } catch {
    return {
      state: 'neutral', origin: '', host: '',
      title: 'Connection information unavailable',
      summary: 'Blanc could not identify this page origin.',
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
      title: 'Certificate problem',
      summary: certificateErrorMessage(certificateError.error),
      error: cleanText(certificateError.error, 120),
    };
  }
  if (parsed.protocol === 'https:') {
    return {
      ...base,
      state: 'secure',
      title: 'Connection is secure',
      summary: certificateRecord?.isIssuedByKnownRoot === false
        ? 'Encrypted. The certificate is trusted by this device, but its issuer is not a standard public root.'
        : 'Encrypted and authenticated by Chromium’s certificate verifier.',
    };
  }
  if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) {
    return { ...base, state: 'local', title: 'Local connection', summary: 'This loopback address stays on this device.' };
  }
  if (parsed.protocol === 'http:') {
    return { ...base, state: 'insecure', title: 'Connection is not secure', summary: 'Information sent to this site can be read or changed in transit.' };
  }
  if (parsed.protocol === 'blanc:') {
    return { ...base, state: 'internal', title: 'Blanc page', summary: 'This page is part of Blanc.' };
  }
  return { ...base, state: 'neutral', title: 'Connection information', summary: 'This page does not use an HTTP connection.' };
}

function certificateErrorQuery(record, fallback = {}) {
  const certificate = record?.certificate ?? null;
  return new URLSearchParams({
    kind: 'certificate',
    url: record?.url ?? fallback.url ?? '',
    code: String(fallback.code ?? ''),
    desc: fallback.desc ?? '',
    certError: record?.error ?? '',
    certMessage: certificateErrorMessage(record?.error),
    issuer: certificate?.issuer ?? '',
    subject: certificate?.subject ?? '',
    validTo: certificate?.validTo ? String(certificate.validTo) : '',
  });
}

module.exports = {
  MAX_CERTIFICATE_RECORDS,
  buildSiteInfo,
  certificateErrorMessage,
  certificateErrorQuery,
  createCertificateObserver,
  isLoopbackHost,
  sanitizeCertificate,
};
