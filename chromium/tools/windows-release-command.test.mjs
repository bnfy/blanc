// The owner's one-command wrapper for the Windows release
// (chromium/windows/owner/windows-release.command): it runs exactly the next
// stage the release tool names, in the release's work folder, and nothing
// when every stage is done. A fake node stands in for the release tool.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const COMMAND = fileURLToPath(new URL('../windows/owner/windows-release.command', import.meta.url));

function run(next) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-win-cmd-'));
  const log = path.join(dir, 'calls.txt');
  const fake = path.join(dir, 'node');
  fs.writeFileSync(fake, `#!/bin/bash\necho "$*" >> "${log}"\nif [ "$2" = status ]; then echo '{"done":[],"next":${next === null ? 'null' : `"${next}"`}}'; fi\n`, {mode: 0o755});
  const result = spawnSync('bash', [COMMAND], {encoding: 'utf8', env: {...process.env, BLANC_NODE: fake, BLANC_WINDOWS_RELEASE_WORK: '/private/tmp/blanc-release-work'}});
  return {result, calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []};
}

test('runs only the next stage, in the release work folder', () => {
  const {result, calls} = run('staging-gate');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls, ['chromium/release/windows-release.mjs status /private/tmp/blanc-release-work',
    'chromium/release/windows-release.mjs staging-gate /private/tmp/blanc-release-work']);
  assert.match(result.stdout, /"staging-gate" stage finished/);
});

test('runs nothing when every stage is done', () => {
  const {result, calls} = run(null);
  assert.equal(result.status, 0);
  assert.equal(calls.length, 1);
  assert.match(result.stdout, /Every stage/);
});
