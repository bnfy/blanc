'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { writeCacheAtomically } = require('./adblock-snapshot');

const DEFAULT_SEED_PATH = path.join(__dirname, 'assets', 'adblock-engine-seed.bin');
const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'assets', 'adblock-engine-seed.json');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function parseSeedManifest(raw) {
  const value = JSON.parse(Buffer.from(raw).toString('utf8'));
  if (
    value?.schemaVersion !== 1
    || !/^[a-f0-9]{16}$/.test(value.seedId || '')
    || !/^[a-f0-9]{64}$/.test(value.sha256 || '')
    || !Number.isSafeInteger(value.byteLength)
    || value.byteLength <= 0
    || value.engine?.package !== '@ghostery/adblocker-electron'
    || typeof value.engine.packageVersion !== 'string'
    || !Number.isSafeInteger(value.engine.formatVersion)
    || !/^[a-f0-9]{64}$/.test(value.filters?.combinedSha256 || '')
    || !Array.isArray(value.filters.files)
    || !/^[a-f0-9]{64}$/.test(value.resources?.sha256 || '')
  ) throw new Error('invalid blocker seed manifest');
  return value;
}

function assertSeedMatchesSnapshot(manifest, snapshot, engineIdentity) {
  if (
    manifest.engine.packageVersion !== engineIdentity.packageVersion
    || manifest.engine.formatVersion !== engineIdentity.formatVersion
    || manifest.filters.combinedSha256 !== snapshot.digest
    || manifest.resources.sha256 !== snapshot.resourceDigest
  ) throw new Error('blocker seed does not match the verified bundled sources or engine');

  const actualFiles = new Map(snapshot.files.map((entry) => [entry.file, entry.sha256]));
  if (
    manifest.filters.files.length !== actualFiles.size
    || manifest.filters.files.some((entry) => actualFiles.get(entry.file) !== entry.sha256)
  ) throw new Error('blocker seed filter inventory does not match bundled sources');
}

/**
 * Cache -> packaged seed -> compile verified bundled inputs. This module
 * deliberately has no fetch capability.
 */
async function loadAdblockEngine({
  cachePath,
  snapshot,
  engineIdentity,
  deserialize,
  compile,
  serialize = (engine) => engine.serialize(),
  seedPath = DEFAULT_SEED_PATH,
  manifestPath = DEFAULT_MANIFEST_PATH,
  readFile = (filePath) => fs.promises.readFile(filePath),
  writeCache = writeCacheAtomically,
} = {}) {
  if (!cachePath || !snapshot || !engineIdentity || !deserialize || !compile) {
    throw new TypeError('cachePath, snapshot, engineIdentity, deserialize, and compile are required');
  }
  const recoveries = [];
  const recover = (stage, error, missingIsExpected = false) => {
    if (missingIsExpected && error?.code === 'ENOENT') return;
    recoveries.push({ stage, message: String(error?.message || error).slice(0, 240) });
  };
  const persist = async (bytes) => {
    try {
      await writeCache(cachePath, bytes);
    } catch (error) {
      recover('cache-write', error);
    }
  };

  try {
    return { engine: deserialize(await readFile(cachePath)), source: 'cache', recoveries };
  } catch (error) {
    recover('cache', error, true);
  }

  try {
    const manifest = parseSeedManifest(await readFile(manifestPath));
    assertSeedMatchesSnapshot(manifest, snapshot, engineIdentity);
    const seed = await readFile(seedPath);
    if (seed.length !== manifest.byteLength || sha256(seed) !== manifest.sha256) {
      throw new Error('blocker seed byte length or checksum mismatch');
    }
    const engine = deserialize(seed);
    await persist(seed);
    return { engine, source: 'seed', recoveries };
  } catch (error) {
    recover('seed', error);
  }

  const engine = compile(snapshot);
  await persist(Buffer.from(serialize(engine)));
  return { engine, source: 'bundled-sources', recoveries };
}

module.exports = {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_SEED_PATH,
  assertSeedMatchesSnapshot,
  loadAdblockEngine,
  parseSeedManifest,
};
