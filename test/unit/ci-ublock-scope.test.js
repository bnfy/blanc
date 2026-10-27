'use strict';
// The uBlock Origin workflow runs real blocking on up to four native targets,
// about 20 minutes each. Pull requests run it only when they change what those
// scripts exercise; everything else is covered by its nightly run on main.
// Lint and the unit suite already run on every pull request in Parity guards
// (Linux) and Unit tests (Windows, macOS), so its desktop job skips them there.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ublock-origin.yml'), 'utf8');

function pullRequestPaths() {
  const block = workflow.match(/^ {2}pull_request:\n {4}paths:\n((?: {6}- .*\n)+)/m);
  assert.ok(block, 'pull_request has a paths list');
  return block[1].trim().split('\n').map((line) => line.trim().replace(/^- '?|'$/g, ''));
}

// GitHub's paths filter: `**` crosses directories, `*` stops at a slash.
function matches(pattern, file) {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/?/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${source}$`).test(file);
}
const triggers = (file) => pullRequestPaths().some((pattern) => matches(pattern, file));

test('ordinary desktop changes do not start the uBlock Origin workflow', () => {
  for (const file of [
    'src/main/main.js',
    'src/main/test-hook.js',
    'src/main/sync.js',
    'src/renderer/overlay.js',
    'src/renderer/renderer.js',
    'src/renderer/styles.css',
    'src/renderer/pages/settings.js',
    'test/desktop/support/hooks.js',
    'test/desktop/steps/vertical-tabs.steps.js',
    'spec/acceptance/glance.feature',
  ]) assert.equal(triggers(file), false, file);
});

test('changes to what the uBlock Origin and document-policy scripts exercise still start it', () => {
  for (const file of [
    'src/main/ublock-provider.js',
    'src/main/ublock-platforms.json',
    'src/main/blocking-providers.js',
    'src/main/adblock.js',
    'src/main/shield-model.js',
    'src/main/document-policy.js',
    'src/main/inert-local-file.js',
    'src/main/tab-view.js',
    'src/renderer/ublock-popup.css',
    'ublock/upstream/manifest.json',
    'adblock/sources/pinned.json',
    'test/desktop/shield-provider.mjs',
    'test/desktop/ublock-origin.mjs',
    'test/desktop/document-policy-smoke.mjs',
    'package.json',
    'package-lock.json',
    '.github/workflows/ublock-origin.yml',
  ]) assert.equal(triggers(file), true, file);
});

test('every helper the desktop scripts import starts it when it changes', () => {
  const desktop = path.join(root, 'test', 'desktop');
  const scripts = fs.readdirSync(desktop).filter((name) =>
    /^(ublock-[a-z-]+|shield-provider|document-policy-smoke|modified-link-click-smoke)\.mjs$/.test(name));
  assert.ok(scripts.length >= 8, scripts.join(', '));
  let helpers = 0;
  for (const name of scripts) {
    const source = fs.readFileSync(path.join(desktop, name), 'utf8');
    for (const [, spec] of source.matchAll(/from '(\.\/[^']+)'/g)) {
      helpers += 1;
      const file = path.posix.join('test/desktop', spec);
      assert.equal(triggers(file), true, `${name} imports ${file}`);
    }
  }
  assert.ok(helpers > 0, 'found the scripts\' local imports');
});

test('the desktop job leaves lint and the unit suite to other workflows on pull requests', () => {
  const desktop = workflow.slice(workflow.indexOf('\n  desktop:'), workflow.indexOf('\n  intel-audio:'));
  for (const command of ['npm run lint', 'npm run test:unit']) {
    const step = desktop.match(new RegExp(`- if: (.*)\\n\\s+run: ${command.replace(/[.:]/g, '\\$&')}\\n`));
    assert.ok(step, `${command} runs only when guarded`);
    assert.equal(step[1], "${{ github.event_name != 'pull_request' }}", command);
  }
});
