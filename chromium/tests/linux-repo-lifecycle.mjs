// On a fresh disposable Ubuntu/Debian/Fedora system for each mode and arch:
// sudo node chromium/tests/linux-repo-lifecycle.mjs managed|opt-out|manual APPROVED SIGNED USER [RESULTS]
// APPROVED and SIGNED are Task 4's directories. USER is the ordinary fixture user.
// stdout carries a JSON snapshot after every package/cron transition.
import assert from 'node:assert/strict';
import {execFile, execFileSync} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import {createServer} from 'node:https';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {packageNames} from '../linux/candidate.mjs';
import {planUpload} from '../linux/repository/plan-upload.mjs';
import worker from '../linux/repository/worker/index.mjs';
import {download, proofInputs, stageMetadata, verifyApproval, verifyPackage} from './linux-update-proof.mjs';

const exec = promisify(execFile);
const pkg = 'blanc-beta';
const host = 'pkg.blanc.day';
const opt = '/opt/bnfy/' + pkg;
const defaults = '/etc/default/' + pkg;
const cron = '/etc/cron.daily/' + pkg;
const ring = '/usr/share/keyrings/blanc-beta.gpg';
const manualKey = '/usr/share/keyrings/blanc-beta.asc';
const key = fileURLToPath(new URL('../linux/keys/blanc-repository.asc', import.meta.url));
const doc = fs.readFileSync(new URL('../linux/manual-repository.md', import.meta.url), 'utf8');
const read = file => fs.readFileSync(file, 'utf8');
const exists = fs.existsSync;
const env = {...process.env, LC_ALL: 'C', DEBIAN_FRONTEND: 'noninteractive',
  no_proxy: [process.env.no_proxy || process.env.NO_PROXY, host, 'pkg.blanc.invalid'].filter(Boolean).join(',')};
env.NO_PROXY = env.no_proxy;

async function run(cmd, args) {
  const {stdout} = await exec(cmd, args, {env, maxBuffer: 16 * 1024 * 1024});
  return stdout.trimEnd();
}

// Materialize the native slice of the signed tree. The update proof reads
// the same generation-pinned metadata and checks the same package approval.
export async function prepareLifecycleTree(spec, input, tree, readStaging, publicKey = key) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-approval-'));
  try {
    const approval = verifyApproval(spec, input, scratch, publicKey);
    const pkgFile = path.join(input, spec.newPackage);
    verifyPackage(pkgFile, approval);
    const manifest = path.join(input, 'signed-tree.json');
    await run('gpgv', ['--homedir', scratch, '--keyring', path.join(scratch, 'owner.gpg'), manifest + '.asc', manifest]);
    const inventory = JSON.parse(read(manifest));
    const pointer = await stageMetadata(spec, approval, tree, readStaging);
    assert.equal(inventory.digest, pointer.digest, 'Signed tree differs from staging');
    const files = planUpload(inventory, {target: 'staging', generation: spec.to, previous: pointer.previous});
    const pool = files.filter(f => f.phase === 'pool' && path.basename(f.file) === spec.newPackage);
    assert.equal(pool.length, 1, 'Native package missing from signed tree');
    const target = path.join(tree, pool[0].file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.linkSync(pkgFile, target);
    for (const suffix of ['', '.asc']) fs.copyFileSync(manifest + suffix, path.join(tree, 'signed-tree.json' + suffix));
  } finally { fs.rmSync(scratch, {recursive: true, force: true}); }
}

async function manual(heading) {
  const section = doc.split('\n## ' + heading + '\n')[1]?.split('\n## ')[0];
  const block = section?.match(/^```sh\n([\s\S]*?)\n```$/m);
  assert.ok(block, 'Missing manual commands under ' + heading);
  // This CLI runs as root even in minimal containers without sudo. The block
  // runs from a private file, not as a -c argument, so no command text is
  // ever an argument; its stdin stays the test's, as it would for a person.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-manual-'));
  const script = path.join(dir, 'commands.sh');
  fs.writeFileSync(script, 'sudo() { "$@"; }\n' + block[1] + '\n', {mode: 0o600, flag: 'wx'});
  try { return await run('bash', ['-euo', 'pipefail', script]); }
  finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

async function approvedPackages(approved, tree, work, format) {
  const trust = path.join(work, 'owner.gpg');
  await run('gpg', ['--homedir', work, '--batch', '--dearmor', '--output', trust, key]);
  for (const file of [path.join(approved, 'approved-packages.json'), path.join(tree, 'signed-tree.json')]) {
    await run('gpgv', ['--homedir', work, '--keyring', trust, file + '.asc', file]);
  }
  const {releaseVersion, packages} = JSON.parse(read(path.join(approved, 'approved-packages.json')));
  const parts = releaseVersion.split('.');
  const generation = Number(parts.pop());
  const previous = [...parts, generation - 1].join('.');
  const files = [];
  for (const version of [previous, releaseVersion]) {
    const name = packageNames(version, process.arch, 'beta')[format];
    const row = packages.find(r => r.file === name);
    const file = path.join(approved, name);
    assert.ok(row && fs.lstatSync(file).isFile() && fs.statSync(file).size === row.size, name);
    assert.equal((await run('sha256sum', [file])).split(' ')[0], row.sha256, name);
    files.push(file);
  }
  return {files, versions: [previous, releaseVersion], generation, digest: JSON.parse(read(path.join(tree, 'signed-tree.json'))).digest};
}

// The same Worker as production, backed by the signed local tree and a single pointer.
// Keep the large browser packages on disk while apt or dnf downloads them.
function repositoryServer(tree, generation, cert, tlsKey) {
  const files = new Set(JSON.parse(read(path.join(tree, 'signed-tree.json'))).files.map(r => r.path));
  const bucket = {
    async get(object) {
      if (object === 'current.json') return {json: () => ({generation, previous: []})};
      const name = object.replace(new RegExp('^generations/' + generation + '/'), '');
      if (!files.has(name)) return null;
      const file = path.join(tree, name);
      return {size: fs.statSync(file).size, get body() { return Readable.toWeb(fs.createReadStream(file)); }};
    },
  };
  let unavailable = false;
  const server = createServer({cert, key: tlsKey}, async (req, res) => {
    try {
      if (unavailable) return res.writeHead(500).end();
      const response = await worker.fetch(new Request('https://' + host + req.url, {method: req.method}), {PACKAGES: bucket});
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) await pipeline(Readable.fromWeb(response.body), res);
      else res.end();
    } catch (error) {
      res.destroy(error);
    }
  });
  return {server, setFailure: value => { unavailable = value; }};
}

// apt fetched Blanc's App Center catalog (with the appstream package installed,
// as on Ubuntu desktops) through the signed Release, and it names the package.
export function checkCatalog(names, arch, readCatalog) {
  const prefix = host + '_deb_dists_stable_main_dep11_Components-' + arch + '.yml';
  const found = names.filter(name => name === prefix || /^\.(?:gz|xz|lz4|zst)$/.test(name.slice(prefix.length)) && name.startsWith(prefix));
  assert.equal(found.length, 1, 'apt did not fetch Blanc\'s DEP-11 catalog for ' + arch + ': ' + names.join(' '));
  const text = readCatalog(found[0]);
  assert.match(text, /^ID: blanc-beta\.desktop$/m, 'catalog component');
  assert.match(text, /^Package: blanc-beta$/m, 'catalog names the package');
  return found[0];
}

export function checkRefresh({status, log, distro, blanc}, mode, expectedDistro) {
  assert.ok(distro.length, 'No distribution metadata was refreshed');
  assert.deepEqual(distro, expectedDistro, 'Distribution repositories missing after refresh');
  assert.equal(blanc, mode === 'healthy', 'Unexpected Blanc metadata in a fresh cache');
  if (mode === 'healthy' || mode === 'disabled') {
    assert.equal(status, 0, log);
    assert.doesNotMatch(log, /failed to (?:fetch|download)|curl error|^Err:\d+/im);
    if (mode === 'disabled') assert.doesNotMatch(log, /pkg\.blanc\.|blanc-beta/i);
    return;
  }
  assert.match(log, mode === 'dns' ? /(?:could(?: not|n't)|unable to|failed to|failure) resolv/i : /\b500\b/);
  assert.match(log, mode === 'dns' ? /pkg\.blanc\.invalid/ : /pkg\.blanc\.day/);
  for (const line of log.split('\n').filter(l => /^(?:Err:\d+|[WE]:)|failed to (?:fetch|download)|curl error/i.test(l))) {
    for (const url of line.matchAll(/https?:\/\/([^/\s]+)/g)) assert.equal(url[1], mode === 'dns' ? 'pkg.blanc.invalid' : host, line);
  }
}

async function refresh(rpm, work, mode, expectedDistro) {
  const cache = fs.mkdtempSync(path.join(work, 'cache-'));
  // apt's _apt user needs access to its partial lists directory.
  fs.chmodSync(cache, 0o755);
  const args = rpm ? ['-y', '--refresh', '--setopt=system_cachedir=' + cache, 'makecache']
    : ['-o', 'Dir::State::Lists=' + cache, '-o', 'APT::Update::Error-Mode=any', '-o', 'Acquire::Retries=0', 'update'];
  let status = 0, log;
  try {
    const result = await exec(rpm ? 'dnf' : 'apt-get', args, {env, maxBuffer: 16 * 1024 * 1024});
    log = result.stdout + result.stderr;
  } catch (error) {
    if (typeof error.code !== 'number') throw error;
    status = error.code;
    log = error.stdout + error.stderr;
  }
  const indexes = fs.readdirSync(cache).filter(name => rpm
    ? exists(path.join(cache, name, 'repodata/repomd.xml')) : /_(?:InRelease|Release)$/.test(name));
  const isBlanc = name => name.startsWith(rpm ? pkg + '-' : host + '_');
  const distro = indexes.filter(name => !isBlanc(name)).sort();
  console.log(JSON.stringify({refresh: mode, status, indexes, log}));
  checkRefresh({status, log, distro, blanc: indexes.some(isBlanc)}, mode, expectedDistro ?? distro);
  if (!rpm && mode === 'healthy') {
    const arch = process.arch === 'x64' ? 'amd64' : 'arm64';
    const {stdout} = await exec('dpkg-query', ['-W', '-f=${Status}', 'appstream'], {env}).catch(() => ({stdout: ''}));
    assert.match(stdout, /install ok installed/, 'The lifecycle needs the appstream package so apt fetches DEP-11');
    const catalog = checkCatalog(fs.readdirSync(cache), arch,
      name => execFileSync('/usr/lib/apt/apt-helper', ['cat-file', path.join(cache, name)], {encoding: 'utf8'}));
    console.log(JSON.stringify({refresh: mode, catalog}));
  }
  return distro;
}

async function lifecycle(mode, approved, tree, user) {
  assert.equal(process.getuid(), 0, 'Run as root on a disposable runner or container');
  const system = read('/etc/os-release').match(/^ID="?([\w-]+)"?$/m)?.[1];
  assert.ok(['ubuntu', 'debian', 'fedora'].includes(system) && ['x64', 'arm64'].includes(process.arch));
  const rpm = system === 'fedora';
  const manager = rpm ? 'dnf' : 'apt-get';
  const source = rpm ? '/etc/yum.repos.d/blanc-beta.repo' : '/etc/apt/sources.list.d/blanc-beta.list';
  const account = (await run('getent', ['passwd', user])).split(':');
  assert.ok(account[0] === user && Number(account[2]) > 0 && path.isAbsolute(account[5]), 'Expected ordinary fixture user');
  const profile = path.join(account[5], '.config', pkg);
  const marker = path.join(profile, 'lifecycle-fixture');
  const anchor = (rpm ? '/etc/pki/ca-trust/source/anchors/' : '/usr/local/share/ca-certificates/') + 'blanc-lifecycle.crt';
  const trust = () => rpm ? run('update-ca-trust', ['extract']) : run('update-ca-certificates', []);
  for (const file of [source, opt, cron, defaults, ring, manualKey, profile, anchor]) assert.ok(!exists(file), 'Expected a clean system: ' + file);
  const hosts = read('/etc/hosts');
  assert.ok(!hosts.includes(host), 'Fixture host already configured');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-lifecycle-'));
  const caches = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-refresh-'));
  let server;
  try {
    const {files, versions, generation, digest} = await approvedPackages(approved, tree, work, rpm ? 'rpm' : 'deb');
    const cert = path.join(work, 'test.crt'), tlsKey = path.join(work, 'test.key');
    await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=' + host,
      '-addext', 'subjectAltName=DNS:' + host, '-out', cert, '-keyout', tlsKey]);
    const local = repositoryServer(tree, generation, read(cert), read(tlsKey));
    server = local.server;
    server.listen(443, '127.0.0.1');
    await once(server, 'listening');
    fs.copyFileSync(cert, anchor);
    await trust();
    fs.appendFileSync('/etc/hosts', '\n127.0.0.1 ' + host + '\n');
    assert.ok((await run('getent', ['ahosts', host])).split('\n').every(l => l.startsWith('127.0.0.1 ')));
    await run('runuser', ['-u', user, '--', 'mkdir', '-p', profile]);
    await run('runuser', ['-u', user, '--', 'touch', marker]);
    const markerInode = fs.statSync(marker).ino;
    fs.chmodSync(caches, 0o755);
    const distro = await refresh(rpm, caches, 'disabled');
    const optedOut = mode === 'opt-out';
    const byHand = mode === 'manual';
    const packagedKey = opt + '/blanc-repository.' + (rpm ? 'asc' : 'gpg');
    const expectedKey = fs.readFileSync(path.join(work, 'owner.gpg'));
    const arch = process.arch === 'x64' ? 'amd64' : 'arm64';
    const sourceText = rpm ? ['[blanc-beta]', 'name=Blanc Beta',
      'mirrorlist=https://pkg.blanc.day/rpm/stable/$basearch/mirrorlist', 'enabled=1', 'gpgcheck=1', 'repo_gpgcheck=1',
      'gpgkey=file://' + (byHand ? manualKey : packagedKey), ''].join('\n')
      : `deb [arch=${arch} signed-by=${ring}] https://pkg.blanc.day/deb stable main\n`;
    async function snapshot(step, {installed, enrolled, ownership, manualArmor = false, allowRemainingJob = false}) {
      const files = [source, ring, packagedKey, manualKey, defaults, cron, profile];
      console.log(JSON.stringify({system, arch, mode, step, files: Object.fromEntries(files.map(f => [f, exists(f)])),
        defaults: exists(defaults) ? read(defaults) : null, source: exists(source) ? read(source) : null}));
      assert.equal(fs.statSync(marker).ino, markerInode, 'user data changed at ' + step);
      if (!allowRemainingJob) assert.equal(exists(cron), installed, 'daily job at ' + step);
      assert.equal(exists(packagedKey), installed, 'packaged key at ' + step);
      assert.equal(exists(source), enrolled, 'repository at ' + step);
      if (enrolled) assert.equal(read(source), sourceText);
      assert.equal(exists(manualKey), manualArmor);
      assert.equal(exists(ring), enrolled && !rpm);
      if (enrolled && !rpm) assert.deepEqual(fs.readFileSync(ring), expectedKey);
      if (installed && rpm) {
        const dearmored = path.join(work, 'installed.gpg');
        await run('gpg', ['--homedir', work, '--batch', '--yes', '--dearmor', '-o', dearmored, packagedKey]);
        assert.deepEqual(fs.readFileSync(dearmored), expectedKey);
      }
      assert.equal(exists(defaults), !!ownership);
      if (ownership) {
        assert.match(read(defaults), /^repo_add_once="false"$/m);
        assert.equal(/^repo_managed="true"$/m.test(read(defaults)), ownership === 'managed');
      }
    }
    if (optedOut) fs.writeFileSync(defaults, 'repo_add_once="false"\n');
    if (byHand) {
      await manual('Turn off automatic repository setup');
      await manual('Download and verify the key');
      await manual(rpm ? 'Fedora' : 'Debian and Ubuntu');
      await snapshot('manual setup', {installed: false, enrolled: true, ownership: 'user', manualArmor: true});
    }
    const state = {installed: true, enrolled: !optedOut, ownership: mode === 'managed' ? 'managed' : 'user', manualArmor: byHand};
    for (const i of byHand ? [1] : [0, 1]) {
      const target = byHand ? pkg : files[i];
      await run(manager, ['-y', 'install', target]);
      const installed = rpm ? await run('rpm', ['-q', '--qf', '%{VERSION}-%{RELEASE}', pkg])
        : await run('dpkg-query', ['-W', '-f=${Version}', pkg]);
      assert.equal(installed, versions[i] + '-1');
      await snapshot('installed ' + versions[i], state);
      await run(cron, []);
      await snapshot('cron ' + versions[i], state);
    }
    if (!optedOut) {
      await refresh(rpm, caches, 'healthy', distro);
      // A reserved unresolvable DNS name fails only Blanc and leaves the distro's DNS intact.
      fs.writeFileSync(source, sourceText.replace(host, 'pkg.blanc.invalid'));
      try {
        await refresh(rpm, caches, 'dns', distro);
      } finally {
        fs.writeFileSync(source, sourceText);
      }
      local.setFailure(true);
      await refresh(rpm, caches, '500', distro);
    }
    if (byHand) {
      await manual('Disable an existing source');
      state.enrolled = false;
      state.manualArmor = false;
      await run(cron, []);
      await snapshot('disabled, after cron', state);
      await refresh(rpm, caches, 'disabled', distro);
    }
    local.setFailure(false);
    await run(manager, ['-y', 'remove', pkg]);
    state.installed = false;
    state.allowRemainingJob = !rpm;
    if (rpm && mode === 'managed') Object.assign(state, {enrolled: false, ownership: null});
    await snapshot('removed', state);
    if (exists(cron)) await run(cron, []);
    await snapshot('daily jobs after removal', state);
    if (!rpm) {
      await run('apt-get', ['-y', 'purge', pkg]);
      state.allowRemainingJob = false;
      if (mode === 'managed') Object.assign(state, {enrolled: false, ownership: null});
      await snapshot('purged', state);
    }
    return {system, arch: process.arch, mode, from: generation - 1, to: generation, digest, pass: true};
  } finally {
    fs.writeFileSync('/etc/hosts', hosts);
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    if (exists(anchor)) { fs.unlinkSync(anchor); await trust(); }
    fs.rmSync(caches, {recursive: true, force: true});
    fs.rmSync(work, {recursive: true, force: true});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.platform !== 'linux') console.log('SKIP: the Linux lifecycle requires apt or dnf and installed beta packages.');
  else if (['download', 'prepare'].includes(process.argv[2])) {
    const [action, system, arch, from, to, repository, input, tree] = process.argv.slice(2);
    const spec = proofInputs(system, arch, from, to, repository);
    if (action === 'download') download(spec, input, [spec.newPackage, 'signed-tree.json', 'signed-tree.json.asc']);
    else await prepareLifecycleTree(spec, input, tree);
  } else {
    const [mode, approved, tree, user, results] = process.argv.slice(2);
    assert.ok(['managed', 'opt-out', 'manual'].includes(mode) && approved && tree && user,
      'Usage: linux-repo-lifecycle.mjs managed|opt-out|manual APPROVED SIGNED USER [RESULTS]');
    const report = await lifecycle(mode, path.resolve(approved), path.resolve(tree), user);
    if (results) {
      const name = ['repo-lifecycle', report.system, report.arch, mode].join('-') + '.json';
      fs.writeFileSync(path.join(results, name), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
    }
  }
}
