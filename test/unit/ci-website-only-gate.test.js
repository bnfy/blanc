'use strict';

// Website and documentation PRs skip the Electron jobs in parity-guards.yml
// through a `changes` job. Skipping must report (job-level `if:`, never a
// workflow `paths` filter, or a required check never reports and the PR stays
// blocked), must fail closed, and must never reach the unit suite or the
// drift guards, which also check the website's claims ledgers.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
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
const GATED = ['oauth-compatibility', 'modified-link-clicks', 'tab-handoff', 'workspace-regressions', 'shared-spaces', 'favorites-import', 'quiet-tabs', 'browser-shortcuts'];

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

test('the merge workflow reports on every PR and keeps cross-platform tests on main', () => {
  const text = workflow('unit-tests.yml');
  const on = text.slice(text.indexOf('\non:\n'), text.indexOf('\npermissions:'));
  assert.match(on, /\n  pull_request:\n/);
  assert.match(on, /\n  push:\n    branches: \[main\]\n/, 'merged combinations are tested on main');
  assert.doesNotMatch(on, /paths/, 'no path filter on the required workflow');

  const all = jobs(text);
  assert.match(all.changes, /--name-only -z --no-renames HEAD\^1 HEAD/, 'both sides of a rename count');
  assert.match(all.unit, /needs: changes/);
  assert.ok(all.unit.includes("needs.changes.outputs.website_only != 'true'"));
  assert.ok(all.site.includes("needs.changes.outputs.website == 'true'"));
  assert.match(all.site, /uses: \.\/\.github\/workflows\/site\.yml/);
  assert.match(workflow('site.yml'), /\n  workflow_call:\n/);
  assert.match(all['website-and-unit-checks'], /always\(\)/, 'the gate runs when a dependency fails or is skipped');
  assert.match(all['website-and-unit-checks'], /needs: \[changes, site, unit\]/);
});

test('only website paths skip the native unit matrix', () => {
  const cases = [
    [['site/src/components/Header.astro', 'test/site/header.test.mjs'], true, true],
    [['site/public/voice clip\nold name.mp3'], true, true],
    [['src/main/main.js', 'site/src/pages/index.astro'], true, false],
    [['package-lock.json'], true, false],
    [['.github/workflows/site.yml'], true, false],
    [['docs/website-notes.md'], false, false],
    [['site-old/index.html'], false, false],
    [[], false, false],
  ];
  for (const [paths, website, websiteOnly] of cases) {
    const result = execFileSync('bash', ['scripts/ci-website-paths.sh'], {
      cwd: ROOT,
      encoding: 'utf8',
      input: paths.length ? paths.join('\0') + '\0' : '',
    });
    assert.equal(result, `website=${website}\nwebsite_only=${websiteOnly}\n`, JSON.stringify(paths));
  }

  // Every push path that triggers Site must also trigger it in a PR.
  for (const pattern of workflow('site.yml').matchAll(/^      - '(.+)'$/gm)) {
    const file = pattern[1].replace('**', 'example');
    const result = execFileSync('bash', ['scripts/ci-website-paths.sh'], { cwd: ROOT, encoding: 'utf8', input: file + '\0' });
    assert.match(result, /^website=true\n/, file);
  }
});

test('the required merge gate only succeeds when the selected suites pass', () => {
  const gate = jobs(workflow('unit-tests.yml'))['website-and-unit-checks'];
  const script = gate.split('        run: |\n')[1];
  const variables = ['PATHS_RESULT', 'WEBSITE', 'WEBSITE_ONLY', 'SITE_RESULT', 'UNIT_RESULT'];
  const cases = [
    [['success', 'true', 'true', 'success', 'skipped'], 0],
    [['success', 'true', 'false', 'success', 'success'], 0],
    [['success', 'false', 'false', 'skipped', 'success'], 0],
    [['success', 'true', 'true', 'failure', 'skipped'], 1],
    [['success', 'true', 'true', 'cancelled', 'skipped'], 1],
    [['success', 'true', 'false', 'success', 'failure'], 1],
    [['success', 'false', 'false', 'skipped', 'skipped'], 1],
    [['success', 'false', 'false', 'skipped', 'failure'], 1],
    [['failure', '', '', 'skipped', 'success'], 1],
    [['success', '', '', 'skipped', 'success'], 1],
  ];
  for (const [values, expected] of cases) {
    const env = { ...process.env, ...Object.fromEntries(variables.map((key, index) => [key, values[index]])) };
    const result = spawnSync('bash', ['-e', '-c', script], { env, encoding: 'utf8' });
    assert.equal(result.status, expected, values.join(':') + '\n' + result.stderr);
  }
});
