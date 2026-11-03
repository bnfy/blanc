import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../android/', import.meta.url);
const parse = file => Object.fromEntries(fs.readFileSync(new URL(`args/${file}`, root), 'utf8').split('\n')
  .map(line => line.replace(/#.*/, '').trim()).filter(Boolean)
  .map(line => { const [key, value] = line.split(/\s*=\s*/); return [key, JSON.parse(value)]; }));

for (const [file, cpu] of [['debug-arm64.gn', 'arm64'], ['debug-x64.gn', 'x64']]) {
  test(`android args pin the platform (${file})`, () => {
    const args = parse(file);
    assert.deepEqual(args, {
      target_os: 'android', target_cpu: cpu, is_debug: false, is_java_debug: true, is_component_build: false, symbol_level: 1,
      android_channel: 'stable', chrome_public_manifest_package: 'me.bnfy.blanc.dev', use_official_google_api_keys: false,
    });
    for (const key of ['google_api_key', 'google_default_client_id', 'google_default_client_secret']) assert.ok(!(key in args));
  });
}

const script = fileURLToPath(new URL('server/bootstrap.sh', root));
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
