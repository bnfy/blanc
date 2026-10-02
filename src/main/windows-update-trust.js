'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { createWindowsSignatureVerifier } = require('./updater-signature');

async function installerDigest(file) {
  const hash = crypto.createHash('sha512');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// The upstream quit handler is synchronous. Hash in bounded chunks so both
// explicit Restart Now and install-on-quit check the actual installation bytes.
function installerDigestSync(file) {
  const hash = crypto.createHash('sha512');
  const buffer = Buffer.alloc(256 * 1024);
  const fd = fs.openSync(file, 'r');
  try {
    let bytes;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes));
    }
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}

// Adapter for the locked electron-updater: its cached-download path bypasses
// verifyUpdateCodeSignature. Never let that path arm installation on its own.
function createWindowsUpdateTrustGate({
  autoUpdater,
  logger,
  verify = createWindowsSignatureVerifier({ logger }),
  digest = installerDigest,
  digestSync = installerDigestSync,
  readPublishers = async () => (await autoUpdater.configOnDisk.value).publisherName,
  installOnQuit = true,
}) {
  let generation = 0;
  let acceptance = 0;
  let ready = null;
  const verifiedDigests = new Map();
  const originalInstall = autoUpdater.install;
  autoUpdater.autoInstallOnAppQuit = false;

  function invalidate() {
    generation += 1;
    acceptance += 1;
    ready = null;
    verifiedDigests.clear();
    autoUpdater.autoInstallOnAppQuit = false;
  }

  async function verifySignature(publishers, file) {
    const run = generation;
    ready = null;
    autoUpdater.autoInstallOnAppQuit = false;
    try {
      const before = await digest(file);
      const result = await verify(publishers, file);
      if (result !== null) return typeof result === 'string' ? result : 'installer publisher could not be verified';
      const after = await digest(file);
      if (run !== generation) return 'installer verification was superseded; retry Check for Updates';
      if (before !== after) return 'installer changed during publisher verification';
      verifiedDigests.set(after, JSON.stringify(publishers));
      return null;
    } catch {
      return 'installer publisher could not be verified; retry Check for Updates';
    }
  }

  async function acceptDownloaded(info) {
    const run = generation;
    const attempt = ++acceptance;
    ready = null;
    autoUpdater.autoInstallOnAppQuit = false;
    const file = info?.downloadedFile;
    try {
      if (typeof file !== 'string' || !file || file !== autoUpdater.installerPath) {
        return 'downloaded installer path could not be verified';
      }
      const configured = await readPublishers();
      const publishers = Array.isArray(configured) ? configured : [configured];
      if (!publishers.length || publishers.some((name) => typeof name !== 'string' || !name.trim())) {
        return 'trusted installer publisher configuration is missing';
      }
      let fingerprint = await digest(file);
      const publisherKey = JSON.stringify(publishers);
      if (verifiedDigests.get(fingerprint) !== publisherKey) {
        const result = await verifySignature(publishers, file);
        if (result !== null) return result;
        fingerprint = await digest(file);
      }
      if (run !== generation || attempt !== acceptance) return 'installer verification was superseded; retry Check for Updates';
      if (file !== autoUpdater.installerPath || verifiedDigests.get(fingerprint) !== publisherKey) {
        return 'downloaded installer changed after publisher verification';
      }
      if (typeof originalInstall !== 'function' || typeof autoUpdater.addQuitHandler !== 'function') {
        return 'installer trust adapter is unavailable';
      }
      ready = { file, fingerprint };
      autoUpdater.autoInstallOnAppQuit = installOnQuit;
      // Upstream tried to register this while verification was pending. Arm it
      // only now; its own flag check also prevents installation after invalidation.
      if (installOnQuit) autoUpdater.addQuitHandler();
      return null;
    } catch {
      return 'installer publisher could not be verified; retry Check for Updates';
    }
  }

  autoUpdater.install = function (...args) {
    try {
      if (!ready || autoUpdater.installerPath !== ready.file || digestSync(ready.file) !== ready.fingerprint) {
        throw new Error('installer is not verified or its bytes changed; retry Check for Updates');
      }
    } catch (error) {
      invalidate();
      autoUpdater.emit('error', error);
      return false;
    }
    return originalInstall.apply(this, args);
  };

  return { verifySignature, acceptDownloaded, invalidate, isReady: () => ready !== null };
}

module.exports = { createWindowsUpdateTrustGate, installerDigest, installerDigestSync };
