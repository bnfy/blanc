const fs = require('node:fs');
const { writeCacheAtomically } = require('./adblock-snapshot');

/**
 * Load a compiled blocker cache or rebuild it from an already verified source
 * snapshot. Cache persistence is an optimization: Windows may temporarily
 * retain a file handle after a forced upgrade, and that must not disable the
 * correctly rebuilt in-memory blocker for the whole launch.
 *
 * Snapshot verification and parsing failures still propagate. Only writing
 * the derived cache is recoverable.
 */
async function loadOrBuildAdblockEngine({
  cachePath,
  raw,
  deserialize,
  parse,
  readCache = (filePath) => fs.promises.readFile(filePath),
  writeCache = writeCacheAtomically,
  onCacheWriteError = (err) => console.warn('[adblock] could not refresh engine cache:', err.message),
}) {
  try {
    return deserialize(await readCache(cachePath));
  } catch {
    const engine = parse(raw);
    try {
      await writeCache(cachePath, engine.serialize());
    } catch (err) {
      onCacheWriteError(err);
    }
    return engine;
  }
}

module.exports = { loadOrBuildAdblockEngine };
