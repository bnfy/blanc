import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const moduleURL = new URL('../tests/android/release-gate.mjs', import.meta.url);
const shURL = new URL('../tests/android/release-gate.sh', import.meta.url);
async function api() { assert.ok(fs.existsSync(moduleURL), 'release gate implementation exists'); return import(moduleURL); }
test('exclusions are empty pending actual release APK discovery', async () => {
  await api(); assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../tests/android/release-gate-exclusions.json', import.meta.url))), []);
});
test('exclusion validation checks scenario, reason, switch and compile guard with nonempty fixtures', async () => {
  const {validateExclusions} = await api();
  const source = '#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)\nHasSwitch("blanc-fixture");\n#else\nreturn false;\n#endif';
  const entry = {scenario: '@F2-1', needs: '--blanc-fixture', reason: 'Observed fixture hook failure'};
  assert.deepEqual(validateExclusions([entry], '@F2-1\n', [source]), [entry]);
  for (const bad of [{...entry, scenario: '@F999-1'}, {...entry, reason: ''}, {...entry, needs: '--bogus'}, {...entry, needs: 'blanc-fixture'}]) assert.throws(() => validateExclusions([bad], '@F2-1\n', [source]));
  for (const unguarded of ['HasSwitch("blanc-fixture");', '#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)\n#else\nHasSwitch("blanc-fixture");\n#endif']) assert.throws(() => validateExclusions([entry], '@F2-1\n', [unguarded]));
  assert.throws(() => validateExclusions([entry, entry], '@F2-1\n', [source]));
});
function fixture(options = {}) {
  assert.ok(fs.existsSync(shURL), 'release gate shell exists');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-'));
  const write = (name, text, mode) => { const dest = path.join(dir, name); fs.mkdirSync(path.dirname(dest), {recursive: true}); fs.writeFileSync(dest, text, mode ? {mode} : {}); };
  for (const name of ['release-gate.sh', 'release-gate.mjs', 'gate-lib.sh']) write(`chromium/tests/android/${name}`, fs.readFileSync(new URL(`../tests/android/${name}`, import.meta.url)));
  write('chromium/tests/android/release-gate-exclusions.json', JSON.stringify(options.exclusions ?? []));
  write('spec/acceptance/fixture.feature', '@F2-1\nScenario: fixture\n');
  write('chromium/blanc/fixture.cc', '#if BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)\nHasSwitch("blanc-fixture");\n#endif');
  write('chromium/tests/android/outbound-gate.mjs', `import fs from 'node:fs'; import path from 'node:path'; fs.appendFileSync(process.env.TRACE, 'outbound '+process.env.BLANC_ANDROID_PACKAGE+' '+process.argv.join(' ')+'\\n'); const e=process.argv[process.argv.indexOf('--evidence')+1]; fs.mkdirSync(e,{recursive:true}); if(process.env.OUTCOME!=='missing-outbound-report') fs.writeFileSync(path.join(e,'outbound-android.json'),JSON.stringify({verdict:process.env.OUTCOME==='outbound'?'fail':'pass'})); process.exit(process.env.OUTCOME==='outbound'?1:0);`);
  write('chromium/tests/android/acceptance/run.sh', `#!/bin/bash
echo "acceptance $BLANC_ANDROID_PACKAGE $*" >> "$TRACE"
mkdir -p "$2"
if [ "$OUTCOME" = empty-acceptance ]; then echo '[]' > "$2/acceptance.json"; else echo '[{"elements":[{"type":"scenario","steps":[{"result":{"status":"passed"}}]}]}]' > "$2/acceptance.json"; fi
[ "$OUTCOME" != acceptance ]
`);
  write('bin/aapt2', `#!/bin/sh\necho "package: name='${options.pkg ?? 'me.bnfy.blanc'}' versionCode='1'"\n`, 0o755);
  write('bin/git', '#!/bin/sh\nprintf "%040d\\n" 1\n', 0o755);
  write('fixture.apk', 'fixture APK bytes');
  const result = spawnSync('bash', [path.join(dir, 'chromium/tests/android/release-gate.sh'), path.join(dir, 'fixture.apk'), path.join(dir, 'evidence')], {encoding: 'utf8', env: {...process.env, PATH: `${dir}/bin:${process.env.PATH}`, TRACE: `${dir}/trace`, OUTCOME: options.outcome ?? '', BLANC_GATE_SKIP: options.skip ?? '', BLANC_GATE_ONLY: options.only ?? ''}});
  const trace = fs.existsSync(`${dir}/trace`) ? fs.readFileSync(`${dir}/trace`, 'utf8') : '';
  const report = fs.existsSync(`${dir}/evidence/release-gate.json`) ? JSON.parse(fs.readFileSync(`${dir}/evidence/release-gate.json`)) : null;
  fs.rmSync(dir, {recursive: true, force: true}); return {...result, trace, report};
}
test('release gate runs outbound before acceptance using release package and binds artifact evidence', () => {
  const r = fixture(); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Release gate: pass/);
  assert.match(r.trace, /^outbound me\.bnfy\.blanc .*--package me\.bnfy\.blanc.*\nacceptance me\.bnfy\.blanc /);
  assert.equal(r.report.package, 'me.bnfy.blanc'); assert.equal(r.report.apkSHA256, crypto.createHash('sha256').update('fixture APK bytes').digest('hex'));
  assert.match(r.report.sourceCommit, /^[a-f0-9]{40}$/); assert.equal(r.report.verdict, 'pass'); assert.deepEqual(r.report.exclusions, []);
});
for (const outcome of ['outbound', 'acceptance']) test(`${outcome} failure fails release gate`, () => {
  const r = fixture({outcome}); assert.notEqual(r.status, 0); assert.equal(r.report.verdict, 'fail'); assert.match(r.stdout, /Release gate: FAIL/);
});
test('nonrelease package is refused before gates run', () => { const r = fixture({pkg: 'me.bnfy.blanc.dev'}); assert.notEqual(r.status, 0); assert.equal(r.trace, ''); assert.equal(r.report.verdict, 'fail'); });
test('gate filters cannot bypass mandatory outbound or acceptance', () => {
  const r = fixture({skip: 'outbound acceptance', only: 'other'}); assert.equal(r.status, 0, r.stderr); assert.match(r.trace, /outbound[\s\S]*acceptance/);
});
test('package selection rejects unknown packages and preserves debug default', async () => {
  const {androidPackage} = await api(); assert.equal(androidPackage(), 'me.bnfy.blanc.dev'); assert.equal(androidPackage('me.bnfy.blanc'), 'me.bnfy.blanc'); assert.throws(() => androidPackage('me.bnfy.blanc;evil'));
});

test('outbound release session launches release package and reads release NetLog', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-outbound-'));
  try {
    const netlog = {constants: {logEventTypes: {URL_REQUEST_START_JOB: 1}}, events: ['https://example.com/', 'https://example.org/', 'https://example.net/', 'https://www.iana.org/help/example-domains', 'https://duckduckgo.com/?q=blanc'].map(url => ({type: 1, params: {url}}))};
    fs.writeFileSync(`${dir}/adb`, `#!/bin/sh\necho "$*" >> "$TRACE"\ncase "$*" in devices) printf 'emulator-5554\\tdevice\\n';; *'emu avd name') echo fixture;; *'shell cat '*) cat "$NETLOG";; esac\n`, {mode: 0o755});
    fs.writeFileSync(`${dir}/sleep`, '#!/bin/sh\nexit 0\n', {mode: 0o755});
    fs.writeFileSync(`${dir}/netlog`, JSON.stringify(netlog));
    const r = spawnSync(process.execPath, [fileURLToPath(new URL('../tests/android/outbound-gate.mjs', import.meta.url)), '--apk', `${dir}/fixture.apk`, '--avd', 'fixture', '--package', 'me.bnfy.blanc', '--evidence', `${dir}/evidence`], {encoding: 'utf8', env: {...process.env, PATH: `${dir}:${process.env.PATH}`, TRACE: `${dir}/trace`, NETLOG: `${dir}/netlog`}});
    assert.equal(r.status, 0, r.stderr);
    const trace = fs.readFileSync(`${dir}/trace`, 'utf8'); assert.match(trace, /pm clear me\.bnfy\.blanc\n/); assert.match(trace, /\/data\/data\/me\.bnfy\.blanc\/cache\/blanc-netlog.json/); assert.doesNotMatch(trace, /me\.bnfy\.blanc\.dev/);
    assert.equal(JSON.parse(fs.readFileSync(`${dir}/evidence/outbound-android.json`)).package, 'me.bnfy.blanc');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
for (const pkg of ['me.bnfy.blanc', 'me.bnfy.blanc.dev']) test(`acceptance ${pkg} preferences and renderer counts target selected package`, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-device-'));
  try {
    fs.writeFileSync(`${dir}/adb`, '#!/bin/sh\necho "$*" >> "$TRACE"\ncase "$*" in *"id -u") echo 0;; *cat*) echo "<map></map>";; esac\n', {mode: 0o755});
    const deviceURL = new URL('../tests/android/acceptance/support/device.mjs', import.meta.url).href;
    const quietURL = new URL('../tests/android/quiet-tabs.mjs', import.meta.url).href;
    const code = `import assert from 'node:assert/strict'; import {Device,PACKAGE} from ${JSON.stringify(deviceURL)}; import {renderers} from ${JSON.stringify(quietURL)}; assert.equal(PACKAGE,process.env.BLANC_ANDROID_PACKAGE); const d=new Device(); d.launch=async()=>{}; await d.setPref('<long name="fixture" value="1" />','fixture'); assert.equal(renderers('u0 123 1 me.bnfy.blanc:sandboxed_process0\\nu0 124 1 me.bnfy.blanc:sandboxed_process1\\nu0 456 1 me.bnfy.blanc.dev:sandboxed_process0',PACKAGE), ${pkg === 'me.bnfy.blanc' ? '2' : '1'});`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {encoding: 'utf8', env: {...process.env, BLANC_ANDROID_PACKAGE: pkg, PATH: `${dir}:${process.env.PATH}`, TRACE: `${dir}/trace`}});
    assert.equal(r.status, 0, r.stderr);
    const trace = fs.readFileSync(`${dir}/trace`, 'utf8');
    if (pkg === 'me.bnfy.blanc') { assert.doesNotMatch(trace, /run-as/); assert.match(trace, /id -u/); assert.match(trace, /\/data\/data\/me\.bnfy\.blanc\/shared_prefs\/me\.bnfy\.blanc_preferences.xml/); }
    else assert.match(trace, /run-as me\.bnfy\.blanc\.dev/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

for (const outcome of ['missing-outbound-report', 'empty-acceptance']) test(`${outcome} cannot produce a release pass`, () => {
  const r = fixture({outcome}); assert.notEqual(r.status, 0); assert.equal(r.report.verdict, 'fail');
});

test('validated hook exclusions become an acceptance tag expression', () => {
  const exclusions = [{scenario: '@F2-1', needs: '--blanc-fixture', reason: 'Fixture observation'}];
  const r = fixture({exclusions}); assert.equal(r.status, 0, r.stderr); assert.match(r.trace, /--tags not \(@F2-1\)/); assert.deepEqual(r.report.exclusions, exclusions);
});
test('unapproved hook exclusion fails before outbound', () => {
  const r = fixture({exclusions: [{scenario: '@F2-1', needs: '--blanc-unknown', reason: 'Unproven'}]});
  assert.notEqual(r.status, 0); assert.equal(r.trace, ''); assert.equal(r.report.verdict, 'fail');
});
