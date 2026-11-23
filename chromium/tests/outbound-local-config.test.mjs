import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {appBundleOf, outboundConfig, checkIdentity} from './outbound/local-config.mjs';

const APP = '/Users/x/Projects/Blanc/chromium/src/out/BlancPrototype/Blanc Prototype.app';
const config = {
  candidate: 'macos-e686bd4d6f4fd543',
  executable: APP + '/Contents/MacOS/Blanc Prototype',
  framework: APP + '/Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework',
  frameworkSha256: 'e686', executableSha256: 'cca2',
  evidence: '/somewhere/else', blockerAssets: '/x/blocker', assets: '/x/assets', diskAssets: false,
};

test('the check runs its own copy of the Prototype, never the shared build output', () => {
  const {app, config: c} = outboundConfig(config, '/Users/Shared/blanc-outbound');
  assert.equal(app, APP);
  assert.equal(c.executable, '/Users/Shared/blanc-outbound/prototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype');
  assert.equal(c.framework, '/Users/Shared/blanc-outbound/prototype/Blanc Prototype.app/Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework');
  assert.equal(c.evidence, '/Users/Shared/blanc-outbound/results');
  assert.equal(c.blockerAssets, '/Users/Shared/blanc-outbound/blocker-assets');
  // The copy is byte for byte, so the pinned hashes and everything else stay.
  for (const k of ['candidate', 'frameworkSha256', 'executableSha256', 'assets', 'diskAssets']) assert.equal(c[k], config[k]);
  assert.equal(config.executable.startsWith(APP), true, 'the input config is not changed');
});

test('a config whose files are not in one app is refused', () => {
  assert.throws(() => outboundConfig({...config, framework: '/elsewhere/Other.app/Contents/F'}, '/d'), /different apps/);
  assert.throws(() => appBundleOf('/usr/local/bin/chrome'), /Not inside an \.app/);
});

test('setup.sh copies the Prototype and writes the config from local-config.mjs', () => {
  const sh = fs.readFileSync(new URL('./outbound/setup.sh', import.meta.url), 'utf8');
  assert.match(sh, /local-config\.mjs/);
  assert.match(sh, /cp -Rc "\$APP" "\$DIR\/prototype\/"/);
  assert.doesNotMatch(sh, /c\.evidence=/, 'the config is no longer rewritten inline');
});

test('a config whose files changed since it was written is refused', () => {
  const sums = {[config.executable]: 'cca2', [config.framework]: 'e686'};
  assert.doesNotThrow(() => checkIdentity(config, file => sums[file]));
  assert.throws(() => checkIdentity(config, file => file === config.framework ? 'rebuilt' : sums[file]), /doesn't match .*Blanc Prototype Framework.*Write the config again/);
  const sh = fs.readFileSync(new URL('./outbound/setup.sh', import.meta.url), 'utf8');
  assert.match(sh, /local-config\.mjs" --check "\$DIR\/runtime-config\.json"/, 'setup.sh checks the copy too');
});
