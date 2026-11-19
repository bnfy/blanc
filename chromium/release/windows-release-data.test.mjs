// W3 Task D1: the update server's release.json, written from one signed
// package's record: the address it is served at (by its SHA-256), its size
// and digest, and how the updater runs it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseData, BROWSER_APP_ID} from './windows-release-data.mjs';

const record = {version: '158.0.8127.901', file: 'blanc-beta-158.0.8127.901.crx3', sha256: 'ab'.repeat(32), size: 157000000,
  run: 'mini_installer.exe', installerSha256: 'cd'.repeat(32), publisherKeySha256: '1b7748a81de3cc4bee5a603a45b5c165130b785e46a6099890080aed41323a85'};

test('a signed package becomes the release the server offers', () => {
  assert.deepEqual(releaseData(record), {appId: BROWSER_APP_ID, version: '158.0.8127.901',
    url: `https://blanc.day/update/win/pkg/${'ab'.repeat(32)}.crx3`, size: 157000000, sha256: 'ab'.repeat(32),
    run: 'mini_installer.exe', arguments: '--do-not-launch-chrome --verbose-logging'});
});
test('a package not signed by the committed publisher key, or malformed, is refused', () => {
  assert.throws(() => releaseData({...record, publisherKeySha256: '00'.repeat(32)}), /publisher key/);
  assert.throws(() => releaseData({...record, sha256: 'xyz'}), /sha256/);
  assert.throws(() => releaseData({...record, version: '158.0.8127'}), /version/);
});
