import {createHash, randomUUID} from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const version = '(\\d+\\.\\d+\\.\\d+\\.\\d+)';
const deb = new RegExp('^deb/pool/main/b/(blanc(?:-beta)?)/\\1_' + version + '-1_(amd64|arm64)\\.deb$');
const rpm = new RegExp('^rpm/stable/(x86_64|aarch64)/(blanc(?:-beta)?)-' + version + '-1\\.\\1\\.rpm$');
const poolCache = 'public, max-age=31536000, immutable';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = value => JSON.stringify(value, null, 2) + '\n';

function packageInfo(key) {
  let match = deb.exec(key);
  if (match) return {group: 'deb/' + match[1] + '/' + match[3], version: match[2]};
  match = rpm.exec(key);
  if (match) return {group: 'rpm/' + match[2] + '/' + match[1], version: match[3]};
}

function checkGeneration(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw Error('Expected a positive numeric generation');
}

export function planUpload(signedTree, {target, provenDigest, generation, previous = []}) {
  checkGeneration(generation);
  if (!['production', 'staging'].includes(target)) throw Error('Unknown repository target');
  if (previous.length > 2) throw Error('Invalid generation history');
  previous.forEach((n, i) => {
    checkGeneration(n);
    if (n >= (i ? previous[i - 1] : generation)) throw Error('Generation history must decrease');
  });
  const {schema, digest, files} = signedTree;
  if (schema !== 1 || !Array.isArray(files) || !files.length) throw Error('Invalid tree inventory');
  let prior = '';
  for (const entry of files) {
    const {path, sha256} = entry;
    if (typeof path !== 'string' || !/^[a-zA-Z0-9._/-]+$/.test(path) ||
        path.split('/').some(p => !p || p === '.' || p === '..') || path <= prior || !SHA256.test(sha256)) {
      throw Error('Invalid, unsorted or duplicate tree entry: ' + path);
    }
    prior = path;
    if (!packageInfo(path) && path !== 'blanc-repository.asc' &&
        !path.startsWith('deb/dists/stable/') && !/^rpm\/stable\/(x86_64|aarch64)\/repodata\//.test(path)) {
      throw Error('Unknown tree path: ' + path);
    }
  }
  if (sha256(files.map(f => f.sha256 + '  ' + f.path + '\n').join('')) !== digest) {
    throw Error('Tree digest differs from inventory');
  }
  if (target === 'production' && provenDigest !== digest) throw Error('Production needs the staging-proven digest');
  const pool = [], metadata = [];
  for (const {path: file, sha256} of files) {
    const pkg = packageInfo(file);
    if (pkg) {
      if (pkg.version.split('.').at(-1) !== String(generation)) throw Error('Generation differs from signed package build');
      pool.push({key: file, file, sha256, cacheControl: poolCache, phase: 'pool'});
    } else {
      metadata.push({key: `generations/${generation}/${file}`, file, sha256, cacheControl: 'no-cache', phase: 'generation'});
    }
  }
  if (!pool.length) throw Error('Generation requires a signed package build');
  // These two files are serialized with jsonBytes by the publisher.
  const pointer = {generation, digest, previous};
  return [...pool, ...metadata, {
    key: `generations/${generation}/signed-tree.json`, file: 'signed-tree.json',
    sha256: sha256(jsonBytes(signedTree)), cacheControl: 'no-cache', phase: 'generation',
  }, {
    key: 'current.json', file: 'current.json', sha256: sha256(jsonBytes(pointer)),
    cacheControl: 'no-cache', phase: 'pointer',
  }];
}

export function pruneKeys(keys, retained) {
  const keep = new Set([...retained.values()].flat());
  const groups = new Map();
  for (const key of keys) {
    const info = packageInfo(key);
    if (!info) continue;
    if (!groups.has(info.group)) groups.set(info.group, []);
    groups.get(info.group).push({key, version: info.version});
  }
  for (const group of groups.values()) {
    group.sort((a, b) => b.version.localeCompare(a.version, 'en', {numeric: true}));
    for (const {key} of group.slice(0, 3)) keep.add(key);
  }
  return keys.filter(key => {
    if (packageInfo(key)) return !keep.has(key);
    const match = /^generations\/(\d+)\//.exec(key);
    return match && !retained.has(Number(match[1]));
  });
}

export async function withPublisherLock(bucket, action) {
  const lock = await bucket.put('publisher.lock', randomUUID(), {
    onlyIf: new Headers({'If-None-Match': '*'}),
  });
  if (!lock) throw Error('Another publisher holds the repository lock');
  try {
    return await action();
  } finally {
    await bucket.delete('publisher.lock');
  }
}

