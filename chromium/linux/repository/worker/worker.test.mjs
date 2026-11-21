import assert from 'node:assert/strict';
import test from 'node:test';
import {MemoryBucket} from '../fixtures/memory-bucket.mjs';

const arch = 'rpm/stable/x86_64';
const origin = 'https://pkg-staging.blanc.day';
const fetchFrom = async (bucket, url, method = 'GET') => {
  const {default: worker} = await import('./index.mjs');
  return worker.fetch(new Request(new URL(url, origin), {method}), {PACKAGES: bucket});
};
const pointer = (bucket, generation, previous = []) => bucket.put('current.json',
  JSON.stringify({generation, digest: 'a'.repeat(64), previous}));

test('dnf mirror pins repomd.xml and its signature across the pointer switch', async () => {
  const bucket = new MemoryBucket();
  for (const n of [1, 2]) {
    for (const suffix of ['', '.asc']) {
      await bucket.put(`generations/${n}/${arch}/repodata/repomd.xml${suffix}`, n + suffix);
    }
  }
  await pointer(bucket, 1);
  const mirror = (await (await fetchFrom(bucket, arch + '/mirrorlist')).text()).trim();
  assert.equal(mirror, origin + '/generations/1/' + arch + '/');
  assert.equal(await (await fetchFrom(bucket, mirror + 'repodata/repomd.xml')).text(), '1');
  await pointer(bucket, 2, [1]);
  const signature = await fetchFrom(bucket, mirror + 'repodata/repomd.xml.asc');
  assert.equal(await signature.text(), '1.asc');
  assert.equal(signature.headers.get('cache-control'), 'no-cache');
  assert.equal(await (await fetchFrom(bucket, arch + '/repodata/repomd.xml')).text(), '2');
});

test('apt by-hash survives a switch, pool files are immutable, misses and internal paths stay private', async () => {
  const bucket = new MemoryBucket();
  const hashPath = 'deb/dists/stable/main/binary-amd64/by-hash/SHA256/' + 'a'.repeat(64);
  const pkg = 'deb/pool/main/b/blanc-beta/blanc-beta_158.0.8127.1-1_amd64.deb';
  await bucket.put('generations/1/' + hashPath, 'old Packages.gz');
  await bucket.put(pkg, 'package');
  await bucket.put('publisher.lock', 'secret');
  await pointer(bucket, 2, [1]);
  assert.equal(await (await fetchFrom(bucket, hashPath)).text(), 'old Packages.gz');
  assert.equal((await fetchFrom(bucket, pkg)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(await (await fetchFrom(bucket, pkg, 'HEAD')).text(), '');
  for (const key of ['publisher.lock', 'generations/7/' + hashPath, arch + '/repodata/missing.xml']) {
    const miss = await fetchFrom(bucket, key);
    assert.equal(miss.status, 404);
    assert.equal(miss.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await fetchFrom(bucket, pkg, 'PUT')).status, 405);
});

