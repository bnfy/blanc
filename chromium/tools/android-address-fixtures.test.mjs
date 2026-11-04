// The Android address fixtures are generated from the verified JavaScript
// port and must be current; their Java literals must round-trip any text.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {javaString} from './android-address-fixtures.mjs';

test('Java literals escape quotes, backslashes, controls and non-ASCII', () => {
  assert.equal(javaString('a"b\\c'), '"a\\"b\\\\c"');
  assert.equal(javaString('\t é'), '"\\u0009 \\u00e9"');
  assert.equal(javaString('😀'), '"\\ud83d\\ude00"');
});

test('the committed fixtures are current', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./android-address-fixtures.mjs', import.meta.url)), '--check'], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
});
