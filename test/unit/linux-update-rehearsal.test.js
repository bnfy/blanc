'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const WORKFLOW = '.github/workflows/linux-update-rehearsal.yml';
const HARNESS = 'test/desktop/packaged-update-staging-linux.mjs';

// Lines belonging to a `run: |` block, which the runner hands to a shell.
function runBlockLines(yaml) {
  const lines = [];
  let runIndent = null;
  for (const line of yaml.split('\n')) {
    const indent = line.match(/^\s*/)[0].length;
    if (runIndent !== null && line.trim() && indent <= runIndent) runIndent = null;
    if (runIndent !== null) {
      lines.push(line);
      continue;
    }
    const start = line.match(/^(\s*)(?:-\s*)?run:\s*\|/);
    if (start) runIndent = start[1].length;
  }
  return lines;
}

test('the Linux update rehearsal accepts the ordinary prompt, never the auto-install shortcut', () => {
  const harness = read(HARNESS);
  assert.match(harness, /BLANC_UPDATE_CHANNEL: 'staging'/);
  // Auto-install skips the Restart Now prompt, and the status file is only
  // permitted with auto-install: supplying it disables the updater outright.
  assert.doesNotMatch(harness, /BLANC_UPDATE_STAGING_AUTO_INSTALL\s*:/);
  assert.doesNotMatch(harness, /BLANC_UPDATE_STAGING_STATUS_FILE\s*:/);
  assert.match(harness, /'key', '--clearmodifiers', key/);
  // The second hop is the only proof that a relaunch knows its new APPIMAGE.
  assert.match(harness, /await performHop\(1,/);
});

test('the Linux update rehearsal can only read, and runs the reviewed harness', () => {
  const workflow = read(WORKFLOW);
  assert.match(workflow, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(workflow, /contents: write|id-token|attestations|pull_request_target|secrets\./);
  assert.doesNotMatch(workflow, /gh release (create|upload|edit|delete)/);
  assert.match(workflow, /path: harness\n/);
  assert.match(workflow, /node harness\/test\/desktop\/packaged-update-staging-linux\.mjs/);
  assert.match(read('package.json'), /"test:packaged:update-staging:linux": "node test\/desktop\/packaged-update-staging-linux\.mjs"/);
});

test('the Linux update rehearsal passes workflow inputs to shells only through env', () => {
  const lines = runBlockLines(read(WORKFLOW));
  assert.ok(lines.length > 50, 'run blocks were not found; the parser no longer matches the workflow');
  for (const line of lines) assert.doesNotMatch(line, /\$\{\{/, line.trim());
});
