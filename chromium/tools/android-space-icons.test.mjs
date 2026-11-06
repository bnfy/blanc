import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {files, pathData} from './android-space-icons.mjs';

test('every symbol has a drawable and they match their source', () => {
  assert.equal(Object.keys(files()).length, 22);
  execFileSync('node', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'android-space-icons.mjs'), '--check']);
});

test('shapes become path data', () => {
  assert.equal(pathData(['circle', {cx: 6, cy: 18, r: 3}]), 'M3,18a3,3 0 1,0 6,0a3,3 0 1,0 -6,0');
  assert.throws(() => pathData(['polygon', {}]));
});
