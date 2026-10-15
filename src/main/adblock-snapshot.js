'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SNAPSHOT_VERSION = 1;
const EXPECTED_LISTS = ['easylist.txt', 'easyprivacy.txt'];
const EXPECTED_RESOURCE = 'ghostery-resources.json';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Read the release-pinned filter files and verify every byte against the
 * manifest. Hashing the bytes is the same check as hashing the decoded text
 * (the pins are byte digests of UTF-8 files) without building any strings.
 */
function readVerifiedSources(sourcesDir) {
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

  const lists = EXPECTED_LISTS.map((file) => {
    const expected = entries.get(file)?.sha256;
    if (!/^[a-f0-9]{64}$/.test(expected ?? '')) {
      throw new Error(`Invalid bundled hash for ${file}`);
    }
    const bytes = fs.readFileSync(path.join(sourcesDir, file));
    if (sha256(bytes) !== expected) throw new Error(`Bundled adblock hash mismatch: ${file}`);
    return bytes;
  });

  // The digest of the lists joined with '\n', without materialising the join.
  const combined = crypto.createHash('sha256');
  lists.forEach((bytes, index) => {
    if (index > 0) combined.update('\n');
    combined.update(bytes);
  });
  const digest = combined.digest('hex');
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
  const resources = fs.readFileSync(path.join(sourcesDir, EXPECTED_RESOURCE));
  const resourceDigest = sha256(resources);
  if (resourceDigest !== resourcePin.sha256) {
    throw new Error('Bundled Ghostery resource hash mismatch');
  }
  return { manifest, entries, lists, digest, resources, resourceDigest };
}

/**
 * Load only the release-pinned filter files and verify every byte before use.
 *
 * Almost every launch deserializes the cached or seeded engine and needs only
 * the digests. The list text — 3.6 million characters, stored two bytes per
 * character because EasyList is not Latin-1 — is needed only to compile from
 * source, so `raw` and `resources` read and verify the files again when they
 * are used. Building that text on every launch left about 15 MB of garbage in
 * the main process's large-object space until the first full GC, some 30 s
 * after startup.
 */
function loadVerifiedAdblockSnapshot(sourcesDir) {
  const { manifest, entries, digest, resourceDigest } = readVerifiedSources(sourcesDir);
  const reverify = () => {
    const again = readVerifiedSources(sourcesDir);
    if (again.digest !== digest || again.resourceDigest !== resourceDigest) {
      throw new Error('Bundled adblock sources changed after verification');
    }
    return again;
  };
  return {
    get raw() {
      return reverify().lists.map((bytes) => bytes.toString('utf8')).join('\n');
    },
    digest,
    files: EXPECTED_LISTS.map((file) => ({ file, sha256: entries.get(file).sha256 })),
    get resources() {
      return reverify().resources.toString('utf8');
    },
    resourceDigest,
    resourcePackageVersion: manifest.ghosteryResources.packageVersion,
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
