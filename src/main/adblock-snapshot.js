'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SNAPSHOT_VERSION = 1;
const EXPECTED_LISTS = ['easylist.txt', 'easyprivacy.txt'];
const EXPECTED_RESOURCE = 'ghostery-resources.json';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Load only the release-pinned filter files and verify every byte before use. */
function loadVerifiedAdblockSnapshot(sourcesDir) {
  const manifestPath = path.join(sourcesDir, 'pinned.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== SNAPSHOT_VERSION || !Array.isArray(manifest.lists)) {
    throw new Error('Invalid bundled adblock manifest');
  }

  const entries = new Map(manifest.lists.map((entry) => [entry?.file, entry]));
  if (
    entries.size !== EXPECTED_LISTS.length
    || [...entries.keys()].some((file) => !EXPECTED_LISTS.includes(file))
  ) throw new Error('Bundled adblock manifest contains an unexpected list');

  const contents = EXPECTED_LISTS.map((file) => {
    const expected = entries.get(file)?.sha256;
    if (!/^[a-f0-9]{64}$/.test(expected ?? '')) {
      throw new Error(`Invalid bundled hash for ${file}`);
    }
    const content = fs.readFileSync(path.join(sourcesDir, file), 'utf8');
    if (sha256(content) !== expected) throw new Error(`Bundled adblock hash mismatch: ${file}`);
    return content;
  });

  const raw = contents.join('\n');
  const digest = sha256(raw);
  if (digest !== manifest.combinedSha256) {
    throw new Error('Bundled adblock combined hash mismatch');
  }
  const resourcePin = manifest.ghosteryResources;
  if (
    resourcePin?.file !== EXPECTED_RESOURCE
    || !/^\d+\.\d+\.\d+$/.test(resourcePin.packageVersion || '')
    || !/^[a-f0-9]{40}$/.test(resourcePin.commit || '')
    || !/^[a-f0-9]{64}$/.test(resourcePin.sha256 || '')
  ) throw new Error('Invalid bundled Ghostery resource pin');
  const resources = fs.readFileSync(path.join(sourcesDir, EXPECTED_RESOURCE), 'utf8');
  const resourceDigest = sha256(resources);
  if (resourceDigest !== resourcePin.sha256) {
    throw new Error('Bundled Ghostery resource hash mismatch');
  }
  return {
    raw,
    digest,
    files: EXPECTED_LISTS.map((file) => ({ file, sha256: entries.get(file).sha256 })),
    resources,
    resourceDigest,
    resourcePackageVersion: resourcePin.packageVersion,
    sourceDate: manifest.date,
  };
}

function adblockCacheName(digest, resourceDigest = '') {
  if (!/^[a-f0-9]{64}$/.test(digest ?? '') || !/^[a-f0-9]{64}$/.test(resourceDigest ?? '')) {
    throw new Error('Invalid adblock snapshot digest');
  }
  return `adblock-engine.v4.${sha256(`${digest}:${resourceDigest}`).slice(0, 16)}.bin`;
}

async function writeCacheAtomically(filePath, bytes) {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.promises.writeFile(tempPath, bytes, { mode: 0o600 });
  try {
    await fs.promises.rename(tempPath, filePath);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
    await fs.promises.rm(filePath, { force: true });
    await fs.promises.rename(tempPath, filePath);
  } finally {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
  }
  await fs.promises.chmod(filePath, 0o600).catch(() => {});
}

module.exports = {
  EXPECTED_LISTS,
  EXPECTED_RESOURCE,
  loadVerifiedAdblockSnapshot,
  adblockCacheName,
  writeCacheAtomically,
};
