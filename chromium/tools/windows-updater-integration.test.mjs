// W3 Task B2: the Windows beta integrates with Blanc's own updater (Chromium's
// //chrome/updater, branded by patch 0099). Chromium turns that integration on
// only for Google's builds, with Google's registry paths; patch 0101 turns it
// on for the Windows beta alone, under the Blanc updater's company key and app
// id, and gives the About page the updater's check. The preview stays without.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const patch = read('../patches/0101-blanc-windows-updater-integration.patch');
const beta46 = read('../patches/0046-blanc-beta-identity.patch');
const lane = JSON.parse(read('../lanes/desktop.json'));
const updater = Object.fromEntries([...read('../blanc/branding/win-beta/updater.gni')
  .matchAll(/^([a-z_]+)\s*=\s*"([^"]*)"/gm)].map(m => [m[1], m[2]]));
const added = file => {
  const start = patch.indexOf(`+++ b/${file}\n`);
  assert.ok(start >= 0, `0101 patches ${file}`);
  const end = patch.indexOf('\n--- ', start);
  return patch.slice(start, end < 0 ? undefined : end).split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');
};

test('patch 0101 is in the desktop lane after the updater branding', () => {
  const list = lane.patches.map(p => p.split('/').pop());
  assert.ok(list.indexOf('0101-blanc-windows-updater-integration.patch') > list.indexOf('0099-blanc-windows-updater-branding.patch'));
});
test('updater integration is on for Google\'s builds and the Windows beta only', () => {
  assert.match(added('chrome/install_static/BUILD.gn'), /^\+  if \(\(is_chrome_branded \|\| blanc_channel == "beta"\) && is_win\) \{$/m);
});
test('the beta registers under the Blanc updater\'s company key and browser app id', () => {
  const gn = added('chrome/install_static/BUILD.gn');
  assert.match(gn, /import\("\/\/blanc\/branding\/win-beta\/updater\.gni"\)/);
  assert.match(gn, /"BLANC_WIN_APP_GUID=L\\"\$browser_appid\\""/);
  assert.match(gn, /"BLANC_WIN_COMPANY_SHORTNAME=L\\"\$updater_company_short_name\\""/);
  assert.equal(updater.updater_company_short_name, 'Bananify');
  assert.match(updater.browser_appid, /^\{[0-9a-f-]{36}\}$/);
  const cc = added('chrome/install_static/install_modes.cc');
  assert.match(cc, /BLANC_WIN_COMPANY_SHORTNAME/);
  assert.doesNotMatch(cc, /L"Software\\\\Google/);
  assert.match(patch, /^-.*L"Software\\\\Google\\\\Update\\\\Clients\\\\"/m);
});
test('the beta\'s install mode is pinned to the beta channel, with its app id', () => {
  const modes = added('chrome/install_static/chromium_install_modes.h');
  assert.match(modes, /\.app_guid = BLANC_WIN_APP_GUID/);
  assert.match(modes, /\.default_channel_name = L"beta"/);
  assert.match(modes, /ChannelStrategy::FIXED/);
  assert.match(patch, /^ {9}\.channel_strategy = ChannelStrategy::UNSUPPORTED,$/m, 'the preview keeps no channel');
});
test('the beta\'s setup.exe carries the channel override its integration calls', () => {
  const gn = added('chrome/installer/setup/BUILD.gn');
  assert.match(gn, /^\+import\("\/\/blanc\/config\.gni"\)$/m);
  assert.equal((gn.match(/^\+    if \(is_chrome_branded \|\| blanc_channel == "beta"\) \{$/gm) ?? []).length, 2,
    'the source and its unit test');
});
test('the About page checks through the updater on the Windows beta', () => {
  assert.match(added('chrome/browser/ui/webui/help/BUILD.gn'), /^\+    if \(is_chrome_branded \|\| blanc_channel == "beta"\) \{$/m);
});
test('the Windows beta args turn the updater on', () => {
  // Patch 0046's `!enable_updater` assert sits in chrome/BUILD.gn's
  // `else if (is_mac)` block, so it still holds for the Mac beta alone.
  assert.match(read('../windows/args/beta-x64.gn'), /^enable_updater = true$/m);
  assert.match(beta46, /^\+    assert\(!enable_widevine && !bundle_widevine_cdm && !enable_updater\)$/m);
});
