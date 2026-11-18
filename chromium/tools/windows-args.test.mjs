import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../windows/', import.meta.url);
const parse = file => Object.fromEntries(fs.readFileSync(new URL(`args/${file}`, root), 'utf8').split('\n')
  .map(line => line.replace(/#.*/, '').trim()).filter(Boolean)
  .map(line => { const [key, value] = line.split(/\s*=\s*/); return [key, JSON.parse(value)]; }));

// The Mac preview's arguments plus the platform and the Windows version
// resources' BRANDING file (W2 A1), so the two previews differ only by
// platform. A new argument here is a reviewed change.
test('windows preview args pin the platform and match the Mac preview otherwise', () => {
  assert.deepEqual(parse('prototype-x64.gn'), {
    target_os: 'win', target_cpu: 'x64', is_debug: false, is_component_build: false, symbol_level: 0,
    branding_file_path: '//blanc/branding/win/BRANDING',
  });
});

const script = fileURLToPath(new URL('server/bootstrap.sh', root));
const source = fs.readFileSync(script, 'utf8');
test('bootstrap parses', () => {
  assert.equal(spawnSync('bash', ['-n', script]).status, 0);
});
test('bootstrap refuses anything but x86-64 Linux before acting', { skip: process.platform === 'linux' && process.arch === 'x64' }, () => {
  const result = spawnSync('bash', [script, '--dry-run'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only on x86-64 Linux/);
  assert.equal(result.stdout, '');
});
test('bootstrap refuses unknown options', () => {
  assert.equal(spawnSync('bash', [script, '--apply']).status, 2);
});
// The server is shared with the Android lane: the Windows checkout, its
// depot_tools and its evidence are its own folders.
test('bootstrap keeps out of the Android lane\'s folders', () => {
  assert.match(source, /^DEPOT_TOOLS="\$\{HOME\}\/depot_tools-desktop"$/m);
  assert.match(source, /^CHECKOUT="\$\{HOME\}\/chromium-desktop"$/m);
  assert.match(source, /^EVIDENCE="\$\{HOME\}\/blanc-evidence\/windows"$/m);
  assert.doesNotMatch(source, /chromium-android|blanc-evidence\/android|\$\{HOME\}\/depot_tools["/]/);
  assert.match(source, /--lane desktop/);
  assert.doesNotMatch(source, /--lane android/);
});
test('bootstrap never removes an output or a checkout', () => {
  assert.doesNotMatch(source, /\brm\b|gn clean|--force\b|git clean|reset --hard/);
});
