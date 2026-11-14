// The hosted beta smoke passes only a published, non-latest pre-release
// whose assets, DMG and launch all check out on the runner's architecture,
// and, when asked, whose live feed is the release appcast. A fake GitHub,
// downloader and verifiers stand in; nothing here is fetched or launched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {smoke, releaseState, TAG, realIO} from './public-smoke.mjs';
import {assetName} from './policy.mjs';

const release = JSON.parse(fs.readFileSync(new URL('./fixtures/release.json', import.meta.url)));
function fakeIO(overrides = {}) {
  const files = {'release.json': JSON.stringify(release), [assetName(release, 'arm64')]: 'dmg bytes', 'appcast-arm64.xml': '<rss/>', 'SHA256SUMS': 'sums'};
  const calls = [];
  const io = {
    arch: 'arm64',
    release: async () => ({draft: false, prerelease: true, assets: Object.keys(files).map(name => ({name, browser_download_url: `https://example.test/${name}`}))}),
    latest: async () => ({tag_name: 'v1.49.0'}),
    download: async (url, file) => { calls.push(url); fs.writeFileSync(file, files[path.basename(file)]); },
    text: async () => Buffer.from('<rss/>'),
    verifyManifest: () => {}, verifyArtifact: () => {},
    launch: async () => ({requests: ['localhost:1 /'], quitOnItsOwn: false}),
    ...overrides,
  };
  return {io, calls};
}
const run = async (overrides, options = {}) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-smoke-test-'));
  try { return await smoke(release.tag, out, {io: fakeIO(overrides).io, ...options}); } finally { fs.rmSync(out, {recursive: true, force: true}); }
};

test('only beta tags, and only a published non-latest pre-release beside a stable latest', () => {
  assert.ok(TAG.test('chromium-beta-2.0.0-beta.2'));
  for (const bad of ['v1.49.0', 'chromium-beta-2.0.0-beta.0', 'chromium-beta-2.0.0', 'chromium-beta-2.0.0-beta.2;rm']) assert.ok(!TAG.test(bad), bad);
  assert.deepEqual(releaseState({draft: false, prerelease: true}, {tag_name: 'v1.49.0'}, release), []);
  assert.match(releaseState({draft: true, prerelease: true}, {tag_name: 'v1.49.0'}, release).join(), /draft/);
  assert.match(releaseState({draft: false, prerelease: false}, {tag_name: 'v1.49.0'}, release).join(), /pre-release/);
  assert.match(releaseState({draft: false, prerelease: true}, {tag_name: release.tag}, release).join(), /latest release/);
});

test('a good release passes every check, downloaded logged out', async () => {
  const {io, calls} = fakeIO();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-smoke-test-'));
  const result = await smoke(release.tag, out, {io, feed: true});
  assert.equal(result.status, 'pass', result.failures.join('; '));
  assert.equal(result.checks.length, 6);
  assert.ok(calls.every(url => url.startsWith('https://')));
  assert.ok(fs.existsSync(path.join(out, 'smoke.json')));
  fs.rmSync(out, {recursive: true, force: true});
});

test('any failing check fails the smoke', async () => {
  for (const [overrides, pattern, options] of [
    [{verifyManifest: () => { throw Error('x'); }}, /asset set/],
    [{verifyArtifact: () => { throw Error('x'); }}, /passes verify\.mjs/],
    [{launch: async () => ({requests: [], quitOnItsOwn: true})}, /launches and opens a page/],
    [{latest: async () => ({tag_name: release.tag})}, /not latest/],
    [{arch: 'x64'}, /does not ship/],
    [{text: async () => Buffer.from('old feed')}, /live feed/, {feed: true}],
  ]) {
    const result = await run(overrides, options ?? {});
    assert.equal(result.status, 'fail'); assert.match(result.failures.join('\n'), pattern);
  }
});

test('the real downloader fetches only this repository\'s beta release assets', async () => {
  const {download} = realIO();
  for (const url of ['https://evil.test/Blanc-Beta.dmg', 'http://github.com/bnfy/blanc/releases/download/chromium-beta-2.0.0-beta.2/x.dmg',
    'https://github.com/bnfy/blanc/releases/download/v1.49.0/Blanc-1.49.0-arm64.dmg', 'https://github.com/other/blanc/releases/download/chromium-beta-2.0.0-beta.2/x.dmg'])
    await assert.rejects(download(url, path.join(os.tmpdir(), 'never-written')), /unexpected download address/, url);
});
