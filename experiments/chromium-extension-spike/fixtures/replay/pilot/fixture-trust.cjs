'use strict';
const { X509Certificate } = require('node:crypto');
// Trust exactly this run's generated leaf, signed by its private fixture CA,
// for named fixture hosts only. No global certificate-error override.
exports.createVerifier = function({ca, cert, hosts}) {
  const root = new X509Certificate(ca);
  const pinned = new X509Certificate(cert);
  if (!root.ca || pinned.ca || !pinned.verify(root.publicKey)) throw new Error('Invalid fixture chain');
  const allowed = new Set(hosts);
  return function(hostname, pem, now = Date.now()) {
    try {
      const leaf = new X509Certificate(pem);
      return allowed.has(hostname) && leaf.fingerprint256 === pinned.fingerprint256 &&
        leaf.checkHost(hostname, {wildcards:false}) === hostname &&
        leaf.verify(root.publicKey) &&
        [root,leaf].every(c => now >= Date.parse(c.validFrom) && now <= Date.parse(c.validTo));
    } catch { return false; }
  };
};
