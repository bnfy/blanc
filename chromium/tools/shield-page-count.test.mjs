// The shield count's page rules, compiled on their own.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const tools = path.dirname(fileURLToPath(import.meta.url));

test('the shield count charges each block to the right page', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shield-count-'));
  try {
    const out = path.join(dir, 'test');
    execFileSync('c++', ['-std=c++20', `-I${path.join(tools, '..')}`, path.join(tools, 'shield-page-count-test.cc'), '-o', out],
      {stdio: 'pipe'});
    assert.equal(execFileSync(out, {encoding: 'utf8'}).trim(), 'ok');
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
