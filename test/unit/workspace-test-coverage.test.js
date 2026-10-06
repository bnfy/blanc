'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startWorkspaceFixtures } = require('../desktop/support/workspace-fixtures');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Workspace POST fixture distinguishes a submission from a replayed GET', async t => {
  const fixture = await startWorkspaceFixtures(); t.after(fixture.close);
  assert.match(await (await fetch(fixture.base + '/form')).text(), /method="post"/);
  const response = await fetch(fixture.base + '/submitted', { method: 'POST', body: 'payload=workspace-post-sentinel' });
  assert.match(await response.text(), /workspace-response-sentinel/);
  assert.equal(fixture.requests.posts, 1);
  assert.deepEqual(fixture.requests.postBodies, ['payload=workspace-post-sentinel']);
  assert.match(await (await fetch(fixture.base + '/submitted')).text(), /Reloaded as GET/);
  assert.equal(fixture.requests.gets, 1);
});
test('Workspace sign-in fixture uses a second origin and a validated opener callback', async t => {
  const fixture = await startWorkspaceFixtures(); t.after(fixture.close);
  const relying = await (await fetch(fixture.base + '/relying')).text();
  assert.ok(relying.includes(fixture.base.replace('127.0.0.1', 'localhost')));
  assert.match(relying, /event.origin === location.origin/);
  const callback = await (await fetch(fixture.base + '/callback?mode=popup')).text();
  assert.match(callback, /window.opener\?\.postMessage/);
  assert.match(callback, /window.close\(\)/);
});
test('Workspace test commands retain the locked runtime gate and runnable acceptance binding', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:workspaces:desktop'], 'cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @workspace');
  assert.equal(pkg.scripts['pretest:workspaces:desktop'], 'npm run runtime:check');
  assert.equal(pkg.scripts['pretest:packaged:workspaces'], 'npm run runtime:check');
  assert.equal(pkg.scripts['test:packaged:workspaces'], 'node test/desktop/packaged-workspace-recovery-smoke.mjs');
  assert.match(read('spec/acceptance/F41-named-workspaces.feature'), /^@workspace\nFeature:/);
  for (const id of [12, 13, 14]) assert.ok(read('test/desktop/cucumber.mjs').includes(`'@F41-${id}'`));
});
test('Packaged Workspace smoke uses production projections and requires a graceful owned-process exit', () => {
  const source = read('test/desktop/packaged-workspace-recovery-smoke.mjs');
  assert.match(source, /BLANC_TEST: '0'/);
  assert.doesNotMatch(source, /__blanc|app\.evaluate|process\.kill|SIGTERM|SIGKILL/);
  assert.match(source, /assert.equal\(owned.process.exitCode, 0/);
  assert.match(source, /fs.mkdtempSync/);
  assert.match(source, /private URL must not reach durable stores/);
});
test('Workspace regression coverage is wired to platform CI and future signed-package gates', () => {
  const parity = read('.github/workflows/parity-guards.yml');
  assert.match(parity, /workspace-regressions:[\s\S]*?os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.ok(parity.includes('xvfb-run -a npm run test:workspaces:desktop'));
  assert.ok(read('scripts/release.sh').includes('npm run test:packaged:workspaces'));
  const native = read('.github/workflows/release-windows-linux.yml');
  assert.equal((native.match(/name: Verify packaged Workspace quit\/restart recovery/g) || []).length, 2);
  assert.equal((native.match(/packaged-workspace-recovery-smoke.mjs support\/workspace-fixtures.js; do/g) || []).length, 2);
});
test('Workspace session-commit failure injection targets the second save on POSIX and Windows', () => {
  // Exercise the existing dev-only hook body with each platform's path rules.
  // The production filesystem and Electron process are never loaded here.
  const body = read('src/main/main.js').match(/if \(action === 'fail-session-commit'\) \{([\s\S]*?)\n        \}/)?.[1];
  assert.ok(body, 'dev-only Workspace failure-injection seam must exist');
  const inject = new Function('fs', 'path', 'createBlankWorkspaceAndSwitch', 'rt', 'args', body);
  for (const paths of [path.posix, path.win32]) {
    const committed = [];
    const original = (_from, to) => committed.push(to);
    const fixtureFs = { renameSync: original };
    const destination = paths.join('fixture-profile', 'session.json');
    const create = () => {
      fixtureFs.renameSync('temporary', paths.join('fixture-profile', 'workspaces.json'));
      fixtureFs.renameSync('temporary', destination);
      fixtureFs.renameSync('temporary', destination);
    };
    assert.throws(() => inject(fixtureFs, paths, create, () => ({}), ['fixture']), { code: 'ENOSPC' });
    assert.equal(fixtureFs.renameSync, original, 'failure injection must restore the filesystem method');
    assert.deepEqual(committed, [paths.join('fixture-profile', 'workspaces.json'), destination]);
  }
});
