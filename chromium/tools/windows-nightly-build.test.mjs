// The Windows nightly's server phase (docs/superpowers/plans/2026-11-21-windows-nightly.md,
// Task 4): nightly-bootstrap.sh takes the checkout lock and checks out the night's
// commit; nightly-build.mjs then applies, checks, builds and packages under that lock.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runNightBuild} from '../windows/server/nightly-build.mjs';

const file = rel => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const betaCommitted = fs.readFileSync(file('windows/args/beta-x64.gn'), 'utf8');
const protoCommitted = fs.readFileSync(file('windows/args/prototype-x64.gn'), 'utf8');
const COMMIT = 'c'.repeat(40), PIN = '681cd621e82e606d7536eae8ea2576afb3c7d65c';
const P = {src: '/s/src', tree: '/s/tree', applied: '/s/applied.json', evidence: '/s/ev', gn: '/s/src/buildtools/linux64/gn', node: '/node'};

// A simulated server: files by path, and scripted command results.
function server({prevMap, curMap, status = '', checkAfterApply = 0, guard = {}, retiredBytes = 'patched'} = {}) {
  const files = new Map([
    [P.applied, JSON.stringify(prevMap ?? {upstream: PIN, upstreamFiles: {'a.cc': sha('patched-a')}, canonicalSha256: {}})],
    [`${P.tree}/chromium/lanes/desktop.json`, JSON.stringify({sourceMap: 'source-map.json'})],
    [`${P.tree}/chromium/source-map.json`, JSON.stringify(curMap ?? {upstream: PIN, upstreamFiles: {'a.cc': sha('patched-a')}, canonicalSha256: {'blanc/x.cc': sha('x')}})],
    [`${P.tree}/chromium/windows/args/beta-x64.gn`, betaCommitted],
    [`${P.tree}/chromium/windows/args/prototype-x64.gn`, protoCommitted],
    [`${P.src}/out/BlancWinBeta/args.gn`, betaCommitted],
    [`${P.src}/out/BlancWinPrototype/args.gn`, protoCommitted],
    [`${P.src}/out/BlancWinBeta/.blanc-build-environment.json`, JSON.stringify({argsSha256: sha(betaCommitted)})],
    [`${P.src}/out/BlancWinPrototype/.blanc-build-environment.json`, JSON.stringify({argsSha256: sha(protoCommitted)})],
    [`${P.src}/retired.cc`, retiredBytes],
  ]);
  const calls = [];
  let applyChecks = 0;
  const io = {
    read: path => { if (!files.has(path)) throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'}); return files.get(path); },
    write: (path, text) => files.set(path, text),
    exists: path => files.has(path),
    sha256: path => files.has(path) ? sha(files.get(path)) : null,
    exec(command, args, options = {}) {
      calls.push([command, ...args]);
      const joined = [command, ...args].join(' ');
      if (args.includes('mount-toolchain.sh') || joined.includes('mount-toolchain.sh')) return {status: 0, stdout: '', stderr: ''};
      if (command === 'git' && args.includes('show')) return {status: 0, stdout: 'pristine', stderr: ''};
      if (command === 'git' && args.includes('status')) return {status: 0, stdout: status, stderr: ''};
      if (args.some(a => a.endsWith('apply.py'))) {
        const apply = args.includes('--apply');
        if (!apply) applyChecks++;
        const changes = !apply && applyChecks > 1 ? checkAfterApply : 1;
        return {status: 0, stdout: JSON.stringify({mode: apply ? 'apply' : 'check', changes}), stderr: ''};
      }
      if (command === P.gn) return {status: 0, stdout: 'Done.', stderr: ''};
      if (args.some(a => a.endsWith('build.mjs'))) {
        const out = args.find(a => a.startsWith('--out=')).slice(6);
        const mode = ['--check', '--build', '--record-environment'].find(m => args.includes(m));
        const script = guard[`${out} ${mode}`];
        const result = Array.isArray(script) ? script.shift() : script;
        return result ?? {status: 0, stdout: 'Dry-run scheduled actions: 12', stderr: ''};
      }
      if (args.some(a => a.endsWith('package-candidate.mjs'))) {
        const out = args.find(a => a.startsWith('--out=')).slice(6);
        const folder = args[2];
        files.set(`${folder}/package.json`, JSON.stringify({id: `windows-x64-${out === 'BlancWinBeta' ? 'b' : 'p'}`.padEnd(28, '0'), zipSha256: 'z'.repeat(64)}));
        return {status: 0, stdout: '', stderr: ''};
      }
      return {status: 1, stdout: '', stderr: `unexpected ${joined}`};
    },
  };
  return {io, files, calls};
}
const night = (s, extra = {}) => runNightBuild({commit: COMMIT, build: 905, stamp: '20261122-0400', io: s.io, paths: P, ...extra});
const indexOf = (calls, pred) => calls.findIndex(pred);

test('a clean night applies, generates, checks, builds and packages both outputs, in order', () => {
  const s = server();
  const result = night(s);
  assert.equal(result.status, 'built', result.reason);
  assert.ok(result.beta.id && result.prototype.id);
  const at = pred => indexOf(s.calls, pred);
  const applied = at(c => c.includes('--apply'));
  const gn = at(c => c[0] === P.gn);
  const firstCheck = at(c => c.includes('--check'));
  const firstBuild = at(c => c.includes('--build'));
  const firstPackage = at(c => c.some(a => a.endsWith('package-candidate.mjs')));
  assert.ok(applied >= 0 && applied < gn && gn < firstCheck && firstCheck < firstBuild && firstBuild < firstPackage);
  assert.match(s.files.get(`${P.src}/out/BlancWinBeta/args.gn`), /^blanc_beta_build = 905$/m);
  for (const call of s.calls.filter(c => c.some(a => a.endsWith('build.mjs'))).filter(c => !c.includes('--record-environment')))
    for (const flag of ['--allow-large-build', '--max-actions=3000', '--reject-buildflags']) assert.ok(call.includes(flag), call.join(' '));
  for (const call of s.calls.filter(c => c.some(a => a.endsWith('apply.py')))) assert.ok(call.includes('--previous-map'));
});

test('a retired patched file is restored from the pin only when it is exactly as the previous map left it', () => {
  const prevMap = {upstream: PIN, upstreamFiles: {'a.cc': sha('patched-a'), 'retired.cc': sha('patched')}, canonicalSha256: {}};
  const ok = server({prevMap});
  assert.equal(night(ok).status, 'built');
  assert.equal(ok.files.get(`${P.src}/retired.cc`), 'pristine');
  assert.ok(ok.calls.some(c => c[0] === 'git' && c.includes('show') && c.includes(`${PIN}:retired.cc`)));
  const edited = server({prevMap, retiredBytes: 'someone edited this'});
  const result = night(edited);
  assert.equal(result.status, 'stopped');
  assert.ok(!edited.calls.some(c => c.some(a => a.endsWith('apply.py'))), 'nothing applied');
});

test('a changed Chromium pin stops the night (a rebase is a person\'s job)', () => {
  const s = server({curMap: {upstream: 'd'.repeat(40), upstreamFiles: {}, canonicalSha256: {}}});
  assert.equal(night(s).status, 'stopped');
});

test('the applied tree must equal the pin plus the map', () => {
  const s = server({checkAfterApply: 2});
  assert.equal(night(s).status, 'stopped');
  const stray = server({status: ' M a.cc\n M chrome/browser/elsewhere.cc\n'});
  assert.equal(night(stray).status, 'stopped');
  const fine = server({status: ' M a.cc\n?? blanc/x.cc\n'});
  assert.equal(night(fine).status, 'built');
});

test('argument drift stops the night before any gn gen', () => {
  for (const [name, text] of [['BlancWinPrototype', protoCommitted.replace('is_debug = false', 'is_debug = true')],
                              ['BlancWinBeta', betaCommitted.replace('enable_widevine = false', 'enable_widevine = true')]]) {
    const s = server();
    s.files.set(`${P.src}/out/${name}/args.gn`, text);
    s.files.set(`${P.src}/out/${name}/.blanc-build-environment.json`, JSON.stringify({argsSha256: sha(text)}));
    assert.equal(night(s).status, 'stopped', name);
    assert.ok(!s.calls.some(c => c[0] === P.gn), `${name}: no gn gen`);
  }
});

test('an output whose args no longer match its recorded environment stops the night', () => {
  const s = server();
  s.files.set(`${P.src}/out/BlancWinPrototype/.blanc-build-environment.json`, JSON.stringify({argsSha256: 'f'.repeat(64)}));
  assert.equal(night(s).status, 'stopped');
});

test('only the beta may re-record, and only when the guard names nothing but argsSha256', () => {
  const argsOnly = {status: 1, stdout: '', stderr: 'Build inputs changed: argsSha256. Review the cache impact before recording a new environment. No build started.'};
  const beta = server({guard: {'BlancWinBeta --check': [argsOnly, {status: 0, stdout: 'Dry-run scheduled actions: 40', stderr: ''}]}});
  assert.equal(night(beta).status, 'built');
  assert.ok(beta.calls.some(c => c.includes('--record-environment') && c.includes('--out=BlancWinBeta')));
  const proto = server({guard: {'BlancWinPrototype --check': argsOnly}});
  assert.equal(night(proto).status, 'stopped');
  assert.ok(!proto.calls.some(c => c.includes('--record-environment')));
  const toolchain = server({guard: {'BlancWinBeta --check': {status: 1, stdout: '', stderr: 'Build inputs changed: argsSha256, clangRevision. No build started.'}}});
  assert.equal(night(toolchain).status, 'stopped');
  assert.ok(!toolchain.calls.some(c => c.includes('--record-environment')));
});

test('the bootstrap takes the lock before checkout, keeps its token, and runs the night under it', () => {
  const boot = fs.readFileSync(file('windows/server/nightly-bootstrap.sh'), 'utf8');
  const at = text => boot.indexOf(text);
  assert.ok(at("pgrep -f '[s]iso ninja'") > 0);
  assert.ok(at("pgrep -f '[s]iso ninja'") < at('mkdir "${LOCK}"'));
  assert.ok(at('mkdir "${LOCK}"') < at('git -C "${TREE}" checkout'));
  assert.match(boot, /trap release EXIT/);
  assert.match(boot, /release\(\) \{[^}]*"\$\(cat "\$\{LOCK\}\/owner" 2>\/dev\/null\)" = "\$\{token\}"/);
  assert.match(boot, /test -z "\$\(git -C "\$\{TREE\}" status --porcelain\)"/);
  assert.match(boot, /BLANC_CHECKOUT_LOCK_OWNER="\$\{token\}" node "\$\{TREE\}\/chromium\/windows\/server\/nightly-build\.mjs"/);
  assert.match(boot, /export PATH="\$\{HOME\}\/chromium-desktop\/src\/third_party\/node\/linux\/node-linux-x64\/bin:\$\{HOME\}\/depot_tools-desktop:/);
});
