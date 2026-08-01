const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DEFAULT_SEED_PATH = path.join(__dirname, 'assets', 'adblock-engine-seed.bin');
const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'assets', 'adblock-engine-seed.json');
const RECOVERY_CACHE_ID = 'network-v1';
const NETWORK_LIST_URLS = Object.freeze([
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseSeedManifest(raw) {
  const manifest = JSON.parse(Buffer.from(raw).toString('utf8'));
  if (
    manifest?.schemaVersion !== 1 ||
    !/^[a-f0-9]{16}$/.test(manifest.seedId || '') ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256 || '') ||
    !Number.isSafeInteger(manifest.byteLength) ||
    manifest.byteLength <= 0
  ) {
    throw new Error('invalid blocker seed manifest');
  }
  return manifest;
}

function cacheFilename(seedId) {
  return `adblock-engine.${seedId}.bin`;
}

function isMissing(error) {
  return error?.code === 'ENOENT';
}

/**
 * Load a compatible user cache, then the verified packaged seed, then rebuild
 * from the live source lists as a last-resort recovery path. Cache corruption
 * and engine-format changes are recoverable because deserialize errors only
 * advance to the next source.
 */
async function loadAdblockEngine({
  userDataDir,
  deserialize,
  buildFromNetwork,
  serialize = (engine) => engine.serialize(),
  seedPath = DEFAULT_SEED_PATH,
  manifestPath = DEFAULT_MANIFEST_PATH,
  readFile = fs.promises.readFile,
  writeFile = fs.promises.writeFile,
} = {}) {
  if (!userDataDir || typeof deserialize !== 'function' || typeof buildFromNetwork !== 'function') {
    throw new TypeError('userDataDir, deserialize, and buildFromNetwork are required');
  }

  const recoveries = [];
  const recover = (stage, error, { missingIsExpected = false } = {}) => {
    if (missingIsExpected && isMissing(error)) return;
    recoveries.push({ stage, message: error?.message || String(error) });
  };

  let manifest = null;
  if (manifestPath && seedPath) {
    try {
      manifest = parseSeedManifest(await readFile(manifestPath));
    } catch (error) {
      recover('manifest', error);
    }
  }

  const cacheId = manifest?.seedId || RECOVERY_CACHE_ID;
  const cachePath = path.join(userDataDir, cacheFilename(cacheId));

  try {
    const cached = await readFile(cachePath);
    return {
      engine: deserialize(cached),
      source: 'cache',
      cachePath,
      recoveries,
    };
  } catch (error) {
    recover('cache', error, { missingIsExpected: true });
  }

  if (manifest && seedPath) {
    try {
      const seed = await readFile(seedPath);
      if (seed.length !== manifest.byteLength) {
        throw new Error(
          `blocker seed length mismatch, expected ${manifest.byteLength} but got ${seed.length}`
        );
      }
      const actualHash = sha256(seed);
      if (actualHash !== manifest.sha256) {
        throw new Error(
          `blocker seed checksum mismatch, expected ${manifest.sha256} but got ${actualHash}`
        );
      }
      const engine = deserialize(seed);
      try {
        await writeFile(cachePath, seed);
      } catch (error) {
        recover('cache-write', error);
      }
      return { engine, source: 'seed', cachePath, recoveries };
    } catch (error) {
      recover('seed', error);
    }
  }

  const engine = await buildFromNetwork();
  try {
    await writeFile(cachePath, Buffer.from(serialize(engine)));
  } catch (error) {
    recover('cache-write', error);
  }
  return { engine, source: 'network', cachePath, recoveries };
}

module.exports = {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_SEED_PATH,
  NETWORK_LIST_URLS,
  RECOVERY_CACHE_ID,
  cacheFilename,
  loadAdblockEngine,
  parseSeedManifest,
};
