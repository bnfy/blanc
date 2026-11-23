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


function checkDeploymentBindings(config) {
  const buckets = new Set();
  for (const [env, host] of [['staging', 'pkg-staging.blanc.day'], ['production', 'pkg.blanc.day']]) {
    const section = config.split('[env.' + env + ']')[1].split(/\n\[env\.(?:production|staging)\]/)[0];
    assert.ok(section.includes('pattern = "' + host + '"') && section.includes('custom_domain = true'), env);
    const packages = section.split('[[env.' + env + '.r2_buckets]]').slice(1)
      .map(block => block.split(/\n\[/)[0])
      .filter(block => /^binding\s*=\s*"PACKAGES"\s*$/m.test(block));
    assert.equal(packages.length, 1, env + ' must bind PACKAGES once');
    const bucket = packages[0].match(/^bucket_name\s*=\s*"([^"\s]+)"\s*$/m)?.[1];
    assert.ok(bucket, env + ' must name its PACKAGES bucket');
    buckets.add(bucket);
  }
  assert.equal(buckets.size, 2, 'staging and production must use distinct PACKAGES buckets');
}

test('each deployment binds its own bucket and custom domain before and after provisioning', async () => {
  const {readFile} = await import('node:fs/promises');
  const config = await readFile(new URL('./wrangler.toml', import.meta.url), 'utf8');
  checkDeploymentBindings(config);
  checkDeploymentBindings(config
    .replace('REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID', '1'.repeat(32))
    .replace('REPLACE_WITH_STAGING_BUCKET', 'blanc-linux-packages-staging')
    .replace('REPLACE_WITH_PRODUCTION_BUCKET', 'blanc-linux-packages'));
});

test('the first missing InRelease is immediately visible after the pointer is published', async () => {
  const bucket = new MemoryBucket();
  const path = 'deb/dists/stable/InRelease';
  const miss = await fetchFrom(bucket, path);
  assert.equal(miss.status, 404);
  assert.equal(miss.headers.get('cache-control'), 'no-store');
  await bucket.put('generations/2/' + path, 'signed release');
  await pointer(bucket, 2);
  const release = await fetchFrom(bucket, path);
  assert.equal(await release.text(), 'signed release');
  assert.equal(release.headers.get('cache-control'), 'no-cache');
});

test('the DEP-11 catalog is served like the apt indexes, by name and by hash across a switch', async () => {
  const {isMetadataPath} = await import('../paths.mjs');
  const bucket = new MemoryBucket();
  const dep11 = 'deb/dists/stable/main/dep11/';
  const hashPath = dep11 + 'by-hash/SHA256/' + 'b'.repeat(64);
  await bucket.put('generations/1/' + hashPath, 'old catalog');
  await bucket.put('generations/2/' + dep11 + 'Components-arm64.yml.gz', 'catalog');
  await pointer(bucket, 2, [1]);
  assert.equal(await (await fetchFrom(bucket, hashPath)).text(), 'old catalog');
  const current = await fetchFrom(bucket, dep11 + 'Components-arm64.yml.gz');
  assert.equal(await current.text(), 'catalog');
  assert.equal(current.headers.get('cache-control'), 'no-cache');
  for (const name of ['Components-amd64.yml.gz', 'Components-arm64.yml.gz', 'Components-amd64.yml', 'Components-arm64.yml',
    'by-hash/SHA256/' + 'c'.repeat(64)]) {
    assert.ok(isMetadataPath(dep11 + name), name);
  }
  for (const name of ['Components-i386.yml.gz', 'Components-amd64.yml.xz', 'icons-64x64.tar', 'by-hash/SHA256/short',
    '../binary-amd64/Packages', 'Components-amd64.yml.gz/extra']) {
    assert.ok(!isMetadataPath(dep11 + name), name);
  }
});
