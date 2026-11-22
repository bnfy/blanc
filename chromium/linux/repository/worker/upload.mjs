import {createHash} from 'node:crypto';
import {open, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {jsonBytes, planUpload, pruneKeys, sha256, withPublisherLock} from '../plan-upload.mjs';

const partSize = 8 * 1024 * 1024;

async function digestStream(stream) {
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function putFile(bucket, directory, signed, op) {
  const options = {httpMetadata: {cacheControl: op.cacheControl}};
  const file = path.join(directory, op.file);
  const existing = await bucket.get(op.key);
  if (existing) {
    if (await digestStream(existing.body) !== op.sha256) throw Error('Immutable object differs: ' + op.key);
    return;
  }
  if (op.file === 'signed-tree.json' || (await stat(file)).size <= partSize) {
    const bytes = op.file === 'signed-tree.json' ? Buffer.from(jsonBytes(signed)) : await readFile(file);
    if (sha256(bytes) !== op.sha256) throw Error('Local tree differs: ' + op.file);
    await bucket.put(op.key, bytes, {...options, sha256: op.sha256});
    return;
  }
  // Each request to the remote R2 binding stays below the Worker body limit.
  const handle = await open(file, 'r');
  try {
    const upload = await bucket.createMultipartUpload(op.key, options);
    try {
      const hash = createHash('sha256');
      const parts = [];
      const buffer = Buffer.alloc(partSize);
      for (;;) {
        let filled = 0;
        while (filled < partSize) {
          const {bytesRead} = await handle.read(buffer, filled, partSize - filled, null);
          if (!bytesRead) break;
          filled += bytesRead;
        }
        if (!filled) break;
        const part = buffer.subarray(0, filled);
        hash.update(part);
        parts.push(await upload.uploadPart(parts.length + 1, part));
      }
      if (hash.digest('hex') !== op.sha256) throw Error('Local tree differs: ' + op.file);
      await upload.complete(parts);
    } catch (error) {
      await upload.abort();
      throw error;
    }
  } finally {
    await handle.close();
  }
}

async function verifyPublic(ops, readBack) {
  for (const op of ops) {
    if (op.file === 'signed-tree.json') continue; // private retention inventory
    const response = await readBack(op.file);
    if (!response.ok || await digestStream(response.body) !== op.sha256) {
      throw Error('Public read-back differs: ' + op.file);
    }
  }
}

async function prune(bucket, current) {
  const retained = new Map();
  for (const generation of [current.generation, ...current.previous]) {
    const obj = await bucket.get(`generations/${generation}/signed-tree.json`);
    if (!obj) throw Error('Missing retained inventory: ' + generation);
    const signed = await obj.json();
    const ops = planUpload(signed, {generation, target: 'staging'});
    retained.set(generation, ops.filter(op => op.phase === 'pool').map(op => op.key));
  }
  const keys = [];
  let page;
  do {
    page = await bucket.list({cursor: page?.cursor});
    keys.push(...page.objects.map(o => o.key));
  } while (page.truncated);
  const obsolete = pruneKeys(keys, retained);
  for (let i = 0; i < obsolete.length; i += 1000) await bucket.delete(obsolete.slice(i, i + 1000));
}

export async function publishTree(bucket, directory, signed, {target, generation, provenDigest, readBack}) {
  // Check the proof before acquiring even the lock in production.
  planUpload(signed, {target, generation, provenDigest});
  return withPublisherLock(bucket, async () => {
    const object = await bucket.get('current.json');
    const old = object && await object.json();
    if (old && (!Number.isSafeInteger(old.generation) || !Array.isArray(old.previous) ||
        old.generation > generation || (old.generation === generation && old.digest !== signed.digest))) {
      throw Error('Refusing to replace or roll back a published generation');
    }
    const resumed = old?.generation === generation;
    const previous = resumed ? old.previous : old ? [old.generation, ...old.previous].slice(0, 2) : [];
    const current = {generation, digest: signed.digest, previous};
    const ops = planUpload(signed, {target, generation, provenDigest, previous});
    if (!resumed) {
      for (const op of ops) {
        if (op.phase === 'pointer') {
          await bucket.put(op.key, jsonBytes(current), {sha256: op.sha256, httpMetadata: {cacheControl: op.cacheControl}});
        } else {
          await putFile(bucket, directory, signed, op);
        }
      }
    }
    await verifyPublic(ops, readBack);
    await prune(bucket, current);
    return current;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [target, directory, number, manifest, provenDigest] = process.argv.slice(2);
  const signed = JSON.parse(await readFile(manifest, 'utf8'));
  const generation = Number(number);
  planUpload(signed, {target, generation, provenDigest});
  const origin = target === 'production' ? 'https://pkg.blanc.day' : 'https://pkg-staging.blanc.day';
  const {getPlatformProxy} = await import('wrangler');
  const proxy = await getPlatformProxy({
    configPath: fileURLToPath(new URL('./wrangler.toml', import.meta.url)),
    environment: target, remoteBindings: true, persist: false,
  });
  try {
    const current = await publishTree(proxy.env.PACKAGES, directory, signed, {
      target, generation, provenDigest, readBack: file => fetch(origin + '/' + file, {redirect: 'error'}),
    });
    console.log(`Verified ${target} generation ${current.generation}, SHA-256 ${current.digest}`);
  } finally {
    await proxy.dispose();
  }
}

