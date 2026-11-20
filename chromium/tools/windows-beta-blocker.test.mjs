// W3 Task A1: the Windows beta embeds the pinned blocker engine as the Mac
// beta does, in the version folder beside chrome.dll (the Mac: inside the app
// bundle). The build copies it, Chromium's installer packs it, and the browser
// reads it from there; the pinned-hash check is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('the build copies the engine into blanc_blocker/ for the Windows beta', () => {
  const build = read('../blanc/BUILD.gn');
  const block = build.slice(build.indexOf('if (blanc_beta_channel && is_win) {'));
  assert.ok(block.length < build.length, 'a Windows beta block');
  assert.match(block, /copy\("beta_blocker_engine_win"\) \{\s*sources = \[ "\$blanc_blocker_bundle\/engine\.js" \]\s*outputs = \[ "\$root_out_dir\/blanc_blocker\/engine\.js" \]/);
  assert.match(read('../blanc/ui.gni'), /if \(blanc_beta_channel\) \{\s*deps \+= \[ "\/\/blanc:beta_blocker_engine_win" \]/);
});
test('Chromium\'s installer packs it into the version folder', () => {
  assert.match(read('../patches/0100-blanc-windows-installer-blocker.patch'),
    /^\+blanc_blocker\\\*\.js: %\(VersionDir\)s\\blanc_blocker\\$/m);
});
test('the browser reads it beside chrome.dll on Windows, inside the bundle on the Mac', () => {
  const proxy = read('../blanc/services/blocker/blocker_proxy.cc');
  assert.match(proxy, /#if BUILDFLAG\(IS_MAC\)\s*\n(\s*\/\/[^\n]*\n)*\s*path = base::apple::OuterBundlePath\(\)/);
  assert.match(proxy, /#elif BUILDFLAG\(IS_WIN\)[\s\S]*?base::PathService::Get\(base::DIR_MODULE, &path\)[\s\S]*?AppendASCII\("blanc_blocker"\)\.AppendASCII\("engine\.js"\)/);
});
