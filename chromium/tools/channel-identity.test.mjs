// F0.3: each channel has its own identity, and the release channel never
// shares a data folder or Keychain item with shipping Electron Blanc, whose
// userData is ~/Library/Application Support/Blanc and whose safeStorage item
// is "Blanc Safe Storage".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const branding = text => Object.fromEntries(text.split('\n').filter(l => l.includes('=')).map(l => l.split(/=(.*)/s).slice(0, 2)));
const productDir = channel => {
  const config = read('blanc/config.gni');
  const m = /if \(blanc_channel == "release"\) \{\s*blanc_product_dir_name = "([^"]+)"\s*\} else \{\s*blanc_product_dir_name = "([^"]+)"/.exec(config);
  assert(m, 'config.gni names both channel data folders');
  return channel === 'release' ? m[1] : m[2];
};
const keychain = channel => {
  const patch = read('patches/0005-channel-identity.patch');
  const m = channel === 'release'
    ? /\+#elif BUILDFLAG\(BLANC_RELEASE_CHANNEL\)[\s\S]*?\+const char kDefaultServiceName\[\] = "([^"]+)"/.exec(patch)
    : /\n[+ ]#else\n[+ ]const char kDefaultServiceName\[\] = "([^"]+)"/.exec(patch);
  assert(m, 'patch 0005 names the ' + channel + ' Keychain service');
  return m[1];
};

test('release is Blanc with the shipping bundle ID', () => {
  const release = branding(read('blanc/branding/release/BRANDING'));
  assert.equal(release.PRODUCT_FULLNAME, 'Blanc');
  assert.equal(release.MAC_BUNDLE_ID, 'me.bnfy.bowser');
});

test('no channel shares a data folder or Keychain item with Electron or the other channel', () => {
  const electron = {dir: 'Blanc', keychain: 'Blanc Safe Storage'};
  const release = {dir: productDir('release'), keychain: keychain('release')};
  const preview = {dir: productDir('preview'), keychain: keychain('preview')};
  for (const channel of [release, preview]) {
    assert.notEqual(channel.dir, electron.dir);
    assert.notEqual(channel.keychain, electron.keychain);
    assert.doesNotMatch(channel.dir, /\//, 'a sibling folder, never nested');
  }
  assert.notEqual(release.dir, preview.dir);
  assert.notEqual(release.keychain, preview.keychain);
  assert.notEqual(preview.dir, 'Chromium', 'preview no longer falls back to Chromium\'s folder');
});

test('the app plist reads its data folder from the channel', () => {
  assert.match(read('patches/0005-channel-identity.patch'), /\+\t<key>CrProductDirName<\/key>\n\+\t<string>\$\{BLANC_PRODUCT_DIR_NAME\}<\/string>/);
  assert.match(read('patches/0005-channel-identity.patch'), /\+      "BLANC_PRODUCT_DIR_NAME=\$blanc_product_dir_name",/);
});
