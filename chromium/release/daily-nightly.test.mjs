import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldSkip, bumpBetaArgs, onlyArgsChanged, judgeSuite, onlyCandidateLine, onlyGeneratedProgress } from './daily/nightly.mjs';
import { planTargeted, loadAreas } from './daily/targeted.mjs';

const args = `target_os = "mac"
target_cpu = "arm64"
is_official_build = true
is_debug = false
is_component_build = false
is_chrome_branded = false
blanc_channel = "beta"
enable_widevine = false
bundle_widevine_cdm = false
enable_updater = false
blanc_beta_version = "2.0.0-beta.4"
blanc_beta_build = 4
blanc_sparkle_stage = "/stage"
blanc_sparkle_public_key = "6evJNrxSq6GUSthnzlQDIVCyC6U90GrhDE0eTFqYlVQ="
blanc_sparkle_archive_sha256 = "1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27"
blanc_beta_local_qualification = false
blanc_blocker_bundle = "/blocker"
`;

test('the night skips for a release, a build, uncommitted or unpushed work, or another night', () => {
  const clear = { marker: false, building: false, dirty: false, unpushed: false, lockHeld: false };
  assert.equal(shouldSkip(clear), null);
  assert.match(shouldSkip({ ...clear, marker: true }), /release is prepared/);
  assert.match(shouldSkip({ ...clear, building: true }), /build is running/);
  assert.match(shouldSkip({ ...clear, dirty: true }), /uncommitted/);
  assert.match(shouldSkip({ ...clear, unpushed: true }), /commits chromium\/next does not have/);
  assert.match(shouldSkip({ ...clear, lockHeld: true, marker: true }), /another night/);
  assert.match(shouldSkip({ ...clear, screenLocked: true }), /screen is locked/);
});

test('the version bump changes only the two reviewed keys', () => {
  const out = bumpBetaArgs(args, '2.0.0-beta.5', 5);
  assert.equal(out, args.replace('"2.0.0-beta.4"', '"2.0.0-beta.5"').replace('blanc_beta_build = 4', 'blanc_beta_build = 5'));
  assert.equal(bumpBetaArgs(out, '2.0.0-beta.5', 5), out);
  assert.throws(() => bumpBetaArgs(args.replace('blanc_beta_build = 4\n', ''), '2.0.0-beta.5', 5), /once each/);
  assert.throws(() => bumpBetaArgs(args, '2.0.0', 5), /beta version/);
});

test('the guard may name only argsSha256 for the environment to be re-recorded', () => {
  assert.ok(onlyArgsChanged('Blanc build guard: Build inputs changed: argsSha256. Review the cache impact'));
  assert.ok(!onlyArgsChanged('Blanc build guard: Build inputs changed: xcode, argsSha256. Review'));
  assert.ok(!onlyArgsChanged('Blanc build guard: GN regeneration is pending.'));
});

const known = { cases: [{ id: 'k:1:plain', results: ['fail'], reason: 'known' }, { id: 'u:1:plain', results: ['undefined'], reason: 'gap' }] };
const run = results => ({ scenarios: [{ cases: Object.entries(results).map(([id, result]) => ({ id, result })) }] });

test('a night passes with only known failures, or failures that pass on the one rerun', () => {
  assert.equal(judgeSuite(run({ 'a:1:plain': 'pass', 'k:1:plain': 'fail', 'u:1:plain': 'undefined' }), known).status, 'pass');
  const first = judgeSuite(run({ 'a:1:plain': 'pass', 'p:1:plain': 'fail' }), known);
  assert.equal(first.status, 'fail');
  assert.deepEqual(first.rerunCandidates, ['p:1:plain']);
  const second = judgeSuite(run({ 'a:1:plain': 'pass', 'p:1:plain': 'fail' }), known, run({ 'p:1:plain': 'pass' }));
  assert.equal(second.status, 'pass');
  assert.deepEqual(second.passedOnRerun, ['p:1:plain']);
  assert.equal(second.pass, 2);
  // a known case failing in another way is not known
  assert.equal(judgeSuite(run({ 'u:1:plain': 'fail' }), known).status, 'fail');
  assert.throws(() => judgeSuite({ ...run({}), incomplete: true }, known), /incomplete/);
});

test('the committed known list names real cases with reasons', () => {
  const list = JSON.parse(fs.readFileSync(new URL('./daily/known-failures.json', import.meta.url)));
  const inventory = JSON.parse(fs.readFileSync(new URL('../scenarios/inventory.json', import.meta.url)));
  const ids = new Set(inventory.scenarios.flatMap(s => s.cases.map(c => c.id)));
  for (const c of list.cases) { assert.ok(ids.has(c.id), c.id); assert.ok(c.reason.length > 20); }
});

const inventory = JSON.parse(fs.readFileSync(new URL('../scenarios/inventory.json', import.meta.url)));
const areas = loadAreas();

test('a mapped change reruns its features and the smoke set', () => {
  const plan = planTargeted(['chromium/blanc/browser/sync/sync_merge.cc', 'docs/x.md', 'chromium/blanc/android/pages/a.js'], areas, inventory);
  assert.equal(plan.full, false);
  assert.deepEqual(plan.features, ['blank-tab-affordance.feature', 'internal-pages.feature', 'send-to-device.feature', 'shared-spaces.feature', 'sync.feature']);
  assert.ok(plan.cases.length > 30 && plan.cases.every(id => /^spec\/acceptance\//.test(id)));
  assert.deepEqual(plan.ignored, ['docs/x.md', 'chromium/blanc/android/pages/a.js']);
});

test('an unplaced change, a shared file, a build file or the runner needs the full suite', () => {
  for (const file of ['chromium/blanc/browser/ui/blanc_prototype_ui.cc', 'chromium/blanc/island/renderer.js', 'chromium/blanc/browser/sync/BUILD.gn',
    'chromium/tests/runner.mjs', 'chromium/upstream/chrome/VERSION', 'chromium/patches/0083-red-button.patch', 'chromium/newfolder/x.js'])
    assert.equal(planTargeted([file], areas, inventory).full, true, file);
});

test('only release tooling changed: the smoke set alone', () => {
  const plan = planTargeted(['chromium/release/release.mjs'], areas, inventory);
  assert.deepEqual(plan.features, ['blank-tab-affordance.feature', 'internal-pages.feature']);
});

test('every area names features the inventory has', () => {
  const files = new Set(inventory.scenarios.map(s => s.file.split('/').pop()));
  for (const f of [...areas.smoke, ...areas.areas.flatMap(a => a.features)]) assert.ok(files.has(f), f);
});

test('the installer writes the job and its entry point, which brings nightly.mjs in only when nothing is in the way', async () => {
  const os = await import('node:os'), path = await import('node:path'), { spawnSync } = await import('node:child_process'), { fileURLToPath } = await import('node:url');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-nightly-')), base = path.join(home, 'Blanc'), bin = path.join(home, 'bin');
  fs.mkdirSync(path.join(base, 'repo'), { recursive: true }); fs.mkdirSync(bin);
  for (const name of ['launchctl', 'plutil']) fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${home}/stub.log"\n`, { mode: 0o755 });
  // The entry point asks pgrep whether a build or the runner is going. The real pgrep reads the
  // whole machine, where an acceptance run, a build, or another copy of this test (whose pgrep
  // carries the same pattern) answers yes, so the stub decides: nothing running unless STUB_BUSY.
  fs.writeFileSync(path.join(bin, 'pgrep'), `#!/bin/sh\necho "pgrep $*" >> "${home}/stub.log"\n[ -n "$STUB_BUSY" ] && exit 0\nexit 1\n`, { mode: 0o755 });
  const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: home, BLANC_STUDIO_BASE: base };
  const install = spawnSync('bash', [fileURLToPath(new URL('./daily/install-nightly.sh', import.meta.url))], { env, encoding: 'utf8' });
  assert.equal(install.status, 0, install.stderr);
  const plist = fs.readFileSync(path.join(home, 'Library/LaunchAgents/me.bnfy.blanc.beta-nightly.plist'), 'utf8');
  assert.match(plist, /<string>[^<]*\/Blanc\/scripts\/beta-nightly\.sh<\/string>/);
  assert.match(plist, /<key>Hour<\/key><integer>2<\/integer>/);
  assert.match(fs.readFileSync(path.join(home, 'stub.log'), 'utf8'), /launchctl bootstrap gui\/\d+ .*beta-nightly\.plist\nlaunchctl bootstrap gui\/\d+ .*display-awake\.plist/);
  assert.match(fs.readFileSync(path.join(home, 'Library/LaunchAgents/me.bnfy.blanc.display-awake.plist'), 'utf8'), /<string>\/usr\/bin\/caffeinate<\/string><string>-d<\/string>[\s\S]*<key>KeepAlive<\/key><true\/>/);
  // A checkout without nightly.mjs and with uncommitted work: the entry point leaves it alone.
  const repo = path.join(base, 'repo');
  spawnSync('git', ['init', '-q', repo]); fs.writeFileSync(path.join(repo, 'work.txt'), 'unsaved');
  const boot = spawnSync('bash', [path.join(base, 'scripts/beta-nightly.sh')], { env, encoding: 'utf8' });
  assert.equal(boot.status, 0, boot.stderr);
  const skipped = () => fs.readFileSync(path.join(base, 'records/nightly/skipped.log'), 'utf8').trim().split('\n').at(-1);
  assert.match(skipped(), /bootstrap skipped: uncommitted changes/);
  assert.ok(fs.existsSync(path.join(repo, 'work.txt')));
  // The stub, not the machine's process list, answered.
  assert.match(fs.readFileSync(path.join(home, 'stub.log'), 'utf8'), /^pgrep -f siso ninja\|chromium\/tests\/runner\.mjs$/m);
  // A build or the runner going comes first.
  const busy = spawnSync('bash', [path.join(base, 'scripts/beta-nightly.sh')], { env: { ...env, STUB_BUSY: '1' }, encoding: 'utf8' });
  assert.equal(busy.status, 0, busy.stderr);
  assert.match(skipped(), /bootstrap skipped: a build or the runner is going/);
});

test('screenLocked reads the console session from ioreg', async () => {
  const { screenLocked } = await import('./daily/nightly.mjs');
  const session = (user, locked, onConsole) => `<dict><key>kCGSSessionOnConsoleKey</key>${onConsole ? '<true/>' : '<false/>'}${locked === null ? '' : `<key>CGSSessionScreenIsLocked</key>${locked ? '<true/>' : '<false/>'}`}<key>kCGSSessionUserNameKey</key><string>${user}</string></dict>`;
  const xml = (...d) => `<plist><array>${d.join('')}</array></plist>`;
  assert.equal(screenLocked(xml(session('owner', null, true), session('blanc-test', null, false)), 'owner'), false);
  assert.equal(screenLocked(xml(session('owner', true, true)), 'owner'), true);
  assert.equal(screenLocked(xml(session('owner', null, false), session('blanc-test', null, true)), 'owner'), true);
  assert.equal(screenLocked(xml(session('blanc-test', null, true)), 'owner'), true);
});

test('the build\'s own candidate line in STATUS.md is not stale source; any other STATUS.md change is', () => {
  const head = 'diff --git a/chromium/STATUS.md b/chromium/STATUS.md\n--- a/chromium/STATUS.md\n+++ b/chromium/STATUS.md\n@@ -3389 +3389 @@\n';
  assert.equal(onlyCandidateLine(head + '-Candidate identities: macOS: macos-aaaa; Windows: none.\n+Candidate identities: macOS: macos-bbbb; Windows: none.\n'), true);
  assert.equal(onlyCandidateLine(head + '-Candidate identities: macOS: macos-aaaa.\n+Candidate identities: macOS: macos-bbbb.\n+- **A new entry**\n'), false);
  assert.equal(onlyCandidateLine(head + '-Some line\n+Another line\n'), false);
  assert.equal(onlyCandidateLine(''), false);
});

test('a new candidate may rewrite the generated progress block; any change outside it is stale', () => {
  const block = rows => `<!-- BEGIN GENERATED PROGRESS -->\n${rows}\n<!-- END GENERATED PROGRESS -->`;
  const status = (before, rows, after = '') => `# Status\n${before}\n${block(rows)}\n${after}`;
  const committed = status('- notes', '| macOS | 635/667 |\nCandidate identities: macOS: macos-aaaa.');
  // The first night that compiled new shared code (2026-11-18): the row and the line both change.
  assert.equal(onlyGeneratedProgress(committed, status('- notes', '| macOS | Not run for current candidate (previous baseline is stale) |\nCandidate identities: macOS: macos-bbbb.')), true);
  assert.equal(onlyGeneratedProgress(committed, committed), true);
  assert.equal(onlyGeneratedProgress(committed, status('- notes\n- a new entry', '| macOS | 635/667 |\nCandidate identities: macOS: macos-aaaa.')), false);
  assert.equal(onlyGeneratedProgress(committed, status('- notes', '| macOS | 635/667 |', 'tail')), false);
  assert.equal(onlyGeneratedProgress(committed, '# Status\n- notes\n'), false);
  assert.equal(onlyGeneratedProgress('# Status\n', '# Status\n'), false);
});

// `export { x } from` binds no local name, and this file's tests reach the
// judge through that re-export, so they passed while every night stopped on a
// ReferenceError as soon as its suite finished (2026-11-23).
test('night() can call the judge: nightly.mjs imports it, not only re-exports it', () => {
  const source = fs.readFileSync(new URL('./daily/nightly.mjs', import.meta.url), 'utf8');
  assert.match(source, /^import \{[^}]*\bjudgeSuite\b[^}]*\} from '\.\/judge\.mjs';$/m);
});
