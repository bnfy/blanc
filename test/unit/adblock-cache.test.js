const test = require('node:test');
const assert = require('node:assert/strict');

const { loadOrBuildAdblockEngine } = require('../../src/main/adblock-cache');

function engine(label) {
  return {
    label,
    serialize: () => Buffer.from(`serialized:${label}`),
  };
}

test('a valid compiled cache avoids parsing and rewriting', async () => {
  const calls = [];
  const cached = engine('cached');
  const result = await loadOrBuildAdblockEngine({
    cachePath: 'engine.bin',
    raw: 'verified lists',
    readCache: async (filePath) => {
      calls.push(['read', filePath]);
      return Buffer.from('cache');
    },
    deserialize: (bytes) => {
      calls.push(['deserialize', bytes.toString()]);
      return cached;
    },
    parse: () => {
      calls.push(['parse']);
      return engine('rebuilt');
    },
    writeCache: async () => calls.push(['write']),
  });

  assert.equal(result, cached);
  assert.deepEqual(calls, [
    ['read', 'engine.bin'],
    ['deserialize', 'cache'],
  ]);
});

test('a missing or corrupt cache rebuilds and persists the verified engine', async () => {
  const calls = [];
  const rebuilt = engine('rebuilt');
  const result = await loadOrBuildAdblockEngine({
    cachePath: 'engine.bin',
    raw: 'verified lists',
    readCache: async () => Buffer.from('corrupt'),
    deserialize: () => { throw new Error('bad cache'); },
    parse: (raw) => {
      calls.push(['parse', raw]);
      return rebuilt;
    },
    writeCache: async (filePath, bytes) => calls.push(['write', filePath, bytes.toString()]),
  });

  assert.equal(result, rebuilt);
  assert.deepEqual(calls, [
    ['parse', 'verified lists'],
    ['write', 'engine.bin', 'serialized:rebuilt'],
  ]);
});

test('a locked Windows cache cannot disable a correctly rebuilt blocker', async () => {
  const errors = [];
  const rebuilt = engine('rebuilt');
  const result = await loadOrBuildAdblockEngine({
    cachePath: 'engine.bin',
    raw: 'verified lists',
    readCache: async () => { throw new Error('cache unavailable'); },
    deserialize: () => { throw new Error('unreachable'); },
    parse: () => rebuilt,
    writeCache: async () => {
      const error = new Error('file is in use');
      error.code = 'EPERM';
      throw error;
    },
    onCacheWriteError: (err) => errors.push(err),
  });

  assert.equal(result, rebuilt);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'EPERM');
});

test('a verified-source parse failure still fails closed', async () => {
  await assert.rejects(
    loadOrBuildAdblockEngine({
      cachePath: 'engine.bin',
      raw: 'invalid verified input',
      readCache: async () => { throw new Error('no cache'); },
      deserialize: () => { throw new Error('unreachable'); },
      parse: () => { throw new Error('cannot parse bundled lists'); },
      writeCache: async () => {},
    }),
    /cannot parse bundled lists/
  );
});
