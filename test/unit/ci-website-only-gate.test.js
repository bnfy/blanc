'use strict';

// Website and documentation PRs skip the Electron jobs in parity-guards.yml
// through a `changes` job. Skipping must report (job-level `if:`, never a
// workflow `paths` filter, or a required check never reports and the PR stays
// blocked), must fail closed, and must never reach the unit suite or the
// drift guards, which also check the website's claims ledgers.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const workflow = (name) => fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');

function jobs(text) {
  const body = text.slice(text.indexOf('\njobs:\n') + 7);
  const out = {};
  for (const block of body.split(/\n(?=  [a-z][a-z0-9-]*:\n)/)) {
    const name = block.match(/^\s*([a-z][a-z0-9-]*):\n/)[1];
    out[name] = block;
  }
  return out;
}

const GATE = "if: ${{ !cancelled() && needs.changes.outputs.app != 'false' }}";
const GATED = ['oauth-compatibility', 'modified-link-clicks', 'tab-handoff', 'workspace-regressions', 'browser-shortcuts'];

test('parity guards gate only the Electron jobs, and fail closed', () => {
  const text = workflow('parity-guards.yml');
  assert.doesNotMatch(text.slice(0, text.indexOf('\njobs:\n')), /paths/, 'no workflow-level path filter');
  const all = jobs(text);
  for (const name of GATED) {
    assert.match(all[name], /\n    needs: changes\n/, `${name} waits for the classification`);
    assert.ok(all[name].includes(GATE), `${name} runs unless changes proved website-only`);
  }
  for (const name of ['changes', 'substrate', 'acceptance-wiring']) {
    assert.doesNotMatch(all[name], /needs:|\n    if:/, `${name} always runs`);
  }
  assert.match(all.substrate, /run: npm run test:unit\n/, 'the unit suite still runs on Linux');
  assert.deepEqual(Object.keys(all).sort(), ['acceptance-wiring', 'changes', 'substrate', ...GATED].sort(),
    'a new job must decide whether it belongs behind the gate');
});

test('the classifier defaults to the app and treats packaged notices as app files', () => {
  const changes = jobs(workflow('parity-guards.yml')).changes;
  assert.match(changes, /\n          app=true\n/, 'push, dispatch and unknown cases run everything');
  assert.match(changes, /--no-renames HEAD\^1 HEAD/, 'renamed-away paths count');
  assert.match(changes, /site\/\*\|test\/site\/\*\|docs\/\*\) ;;/);
  assert.match(changes, /THIRD-PARTY-NOTICES\.md\|ASSET-LICENSE\.md\) app=true/,
    'files packaged into app.asar are app files');
  assert.ok(changes.indexOf('THIRD-PARTY-NOTICES.md|') < changes.indexOf('*.md) ;;'),
    'the packaged notices match before the root Markdown rule');
});

test('the cross-platform unit job keeps running for every pull request', () => {
  const text = workflow('unit-tests.yml');
  const on = text.slice(text.indexOf('\non:\n'), text.indexOf('\npermissions:'));
  assert.match(on, /\n  pull_request:\n/);
  assert.doesNotMatch(on, /paths/, 'no path filter');
  assert.doesNotMatch(text, /needs: changes/);
});
