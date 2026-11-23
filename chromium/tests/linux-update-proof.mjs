// Disposable hosted Linux runners only. The release tool dispatches with four-part versions
// and consumes one update-proof-SYSTEM-ARCH.json per leg, with integer build numbers.
import assert from 'node:assert/strict';
import {execFile, execFileSync} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {ASSET_NAME, packageNames} from '../linux/candidate.mjs';
import {planUpload, sha256} from '../linux/repository/plan-upload.mjs';
import {CHROME_VERSION} from '../release/policy.mjs';
import {assertEnrolledKey, hashFile, launchAppImage, seedInstallHome, seedSnapshot, sessionEnvironment} from './lib/linux-seed.mjs';
import {proveRelaunch} from './linux-relaunch.mjs';

const self = fileURLToPath(import.meta.url);
const local = relative => fileURLToPath(new URL(relative, import.meta.url));
const key = local('../linux/keys/blanc-repository.asc');
const metadata = local('../linux/repository/metadata.py');
const staging = 'https://pkg-staging.blanc.day';
const production = 'https://pkg.blanc.day';
const apt = 'deb/dists/stable';
const pool = 'deb/pool/main/b/blanc-beta';
const ring = '/usr/share/keyrings/blanc-beta.gpg';
const rpmKey = '/opt/bnfy/blanc-beta/blanc-repository.asc';
const launcher = '/usr/bin/blanc-beta';
const pkg = 'blanc-beta';
const exec = promisify(execFile);
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const command = (cmd, args, options = {}) => execFileSync(cmd, args, {encoding: 'utf8', ...options});
const sudo = (...args) => command('sudo', ['-n', ...args]);
const mkdir = dir => fs.mkdirSync(dir, {recursive: true});

export function proofInputs(system, arch, fromVersion, toVersion, repository) {
  assert.equal(repository, 'staging', 'Only the staging repository can supply the update proof');
  assert.ok(['ubuntu', 'debian', 'fedora'].includes(system), 'Unknown proof system');
  const prefix = CHROME_VERSION.slice(0, CHROME_VERSION.lastIndexOf('.') + 1);
  function build(version) {
    const n = Number(version.split('.').at(-1));
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 9999 && version === prefix + n, 'Invalid proof version');
    return n;
  }
  const from = build(fromVersion), to = build(toVersion);
  assert.equal(to, from + 1, 'Expected B-1 and B');
  const format = system === 'fedora' ? 'rpm' : 'deb';
  return {system, arch, format, from, to, fromVersion, toVersion,
    archive: ASSET_NAME(arch, 'beta', from),
    oldPackage: packageNames(fromVersion, arch, 'beta')[format],
    newPackage: packageNames(toVersion, arch, 'beta')[format],
    report: 'update-proof-' + system + '-' + arch + '.json'};
}

async function readStaging(key) {
  const response = await fetch(staging + '/' + key, {redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000)});
  assert.ok(response.ok, 'Staging ' + key + ' returned ' + response.status);
  return Buffer.from(await response.arrayBuffer());
}

export async function stageMetadata(spec, approval, dir, read = readStaging) {
  const pointer = JSON.parse(await read('current.json'));
  assert.equal(pointer.generation, spec.to, 'Unexpected staging generation');
  assert.ok(Array.isArray(pointer.previous), 'Missing staging generation history');
  assert.equal(approval.releaseVersion, spec.toVersion);
  const files = [], captured = new Map();
  async function capture(file) {
    // Content-addressed copies can be shared (both architectures' identical
    // DEP-11 catalogs have one by-hash file); the tree lists each path once.
    if (captured.has(file)) return captured.get(file);
    const bytes = await read('generations/' + pointer.generation + '/' + file);
    captured.set(file, bytes);
    files.push({path: file, sha256: sha256(bytes)});
    mkdir(path.dirname(path.join(dir, file)));
    fs.writeFileSync(path.join(dir, file), bytes, {flag: 'wx'});
    return bytes;
  }
  await capture('blanc-repository.asc');
  let release;
  for (const name of ['InRelease', 'Release', 'Release.gpg']) {
    const bytes = await capture(apt + '/' + name);
    if (name === 'Release') release = bytes.toString();
  }
  // The App Center catalog is in a tree exactly when its signed Release lists it.
  const listed = new Set(release.split('\n').map(line => line.trim().split(/\s+/)[2]).filter(Boolean));
  for (const arch of ['x64', 'arm64']) {
    const debArch = arch === 'x64' ? 'amd64' : 'arm64';
    const rpmBase = 'rpm/stable/' + (arch === 'x64' ? 'x86_64' : 'aarch64');
    const index = apt + '/main/binary-' + debArch + '/';
    for (const name of ['Packages', 'Packages.gz']) {
      const bytes = await capture(index + name);
      await capture(index + 'by-hash/SHA256/' + sha256(bytes));
    }
    for (const name of ['.yml', '.yml.gz']) {
      const catalog = 'main/dep11/Components-' + debArch + name;
      if (!listed.has(catalog)) continue;
      const bytes = await capture(apt + '/' + catalog);
      await capture(apt + '/main/dep11/by-hash/SHA256/' + sha256(bytes));
    }
    const xml = await capture(rpmBase + '/repodata/repomd.xml');
    await capture(rpmBase + '/repodata/repomd.xml.asc');
    // Task 4 verifies createrepo_c's three content-addressed XML paths before signing.
    const hrefs = [...xml.toString().matchAll(/\bhref="(repodata\/[a-f0-9]{64}-(?:primary|filelists|other)\.xml\.gz)"/g)];
    assert.equal(hrefs.length, 3, 'Unexpected repomd.xml locations');
    for (const [, href] of hrefs) await capture(rpmBase + '/' + href);
    for (const [kind, name] of Object.entries(packageNames(spec.toVersion, arch, 'beta'))) {
      const matches = approval.packages.filter(row => row.file === name);
      assert.equal(matches.length, 1, 'No unique owner approval for ' + name);
      files.push({path: (kind === 'rpm' ? rpmBase : pool) + '/' + name, sha256: matches[0].sha256});
    }
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  planUpload({schema: 1, digest: pointer.digest, files}, {target: 'staging', generation: spec.to, previous: pointer.previous});
  return pointer;
}

const reasons = {
  'apt-metadata': /NO_PUBKEY\s+[0-9A-F]+|missing key [0-9A-F]+|public key is not available/i,
  'deb-hash': /Hash Sum mismatch/i,
  'dnf-metadata': /repomd\.xml[^\n]*(?:signature|OpenPGP|GPG)[^\n]*(?:not found|unknown|missing|bad|invalid|couldn.t be verified|verification failed)/i,
  // dnf5 imports the repository's gpgkey, re-checks, and reports that the
  // package is still signed by a key it does not hold.
  'rpm-foreign': /(?:public|signing) key[^\n]*(?:not installed|not found|unknown)|\bNOKEY\b|OpenPGP check for package "[^"\n]+"[^\n]* has failed: Import of the key didn't help, wrong key\?/i,
  'rpm-unsigned': /(?:package|rpm)[^\n]*(?:is not signed|is unsigned)|no (?:OpenPGP )?signature for package/i,
};
export function checkRefusal(kind, status, diagnostic) {
  assert.ok(Number.isInteger(status) && status > 0, 'Expected a package-manager refusal: ' + kind);
  if (kind === 'rpm-foreign') assert.doesNotMatch(diagnostic, /repomd\.xml/i, 'Failed before package verification');
  assert.match(diagnostic, reasons[kind], 'Wrong package-manager failure for ' + kind + ': ' + diagnostic);
}

export async function proveUpdate(spec, io) {
  const before = await io.prepare();
  await io.install();
  await io.disableProduction();
  try {
    await io.relaunch(async () => {
      const cases = spec.format === 'deb' ? ['apt-metadata', 'deb-hash'] : ['dnf-metadata', 'rpm-foreign', 'rpm-unsigned'];
      for (const kind of cases) {
        await io.refuse(kind);
        await io.smoke(spec.fromVersion, kind);
      }
      await io.upgrade();
      await io.assertProductionDisabled();
    });
  } finally { await io.restoreProduction(); }
  await io.smoke(spec.toVersion, 'upgraded');
  await io.uninstall();
  assert.deepEqual(await io.pointer(), before, 'Staging changed during the update proof');
  return {system: spec.system, arch: spec.arch, from: spec.from, to: spec.to, digest: before.digest, pass: true};
}

export function download(spec, dest, extra = []) {
  const gh = args => command('gh', ['release', ...args, '--repo', process.env.GITHUB_REPOSITORY]);
  const tag = 'fork-linux-candidate';
  const draft = JSON.parse(gh(['view', tag, '--json', 'isDraft,assets']));
  assert.equal(draft.isDraft, true, 'Expected the private candidate draft');
  const approval = 'approved-packages.json';
  const names = [spec.oldPackage, approval, approval + '.asc', ...extra];
  for (const name of [spec.archive, ...names]) {
    assert.equal(draft.assets.filter(asset => asset.name === name).length, 1, 'Missing candidate asset ' + name);
  }
  // Task 5 uploads the approved post-signing RPM separately. The candidate
  // tar contains the pre-signing RPM and cannot supply the install by file.
  gh(['download', tag, '--dir', dest, ...names.flatMap(n => ['--pattern', n])]);
}

export function verifyPackage(file, approval) {
  const row = approval.packages.find(p => p.file === path.basename(file));
  assert.ok(row && fs.lstatSync(file).isFile(), 'Missing approved package ' + file);
  assert.equal(fs.statSync(file).size, row.size, 'Approved package size differs');
  assert.equal(hashFile(file), row.sha256, 'Approved package digest differs');
}

export function verifyApproval(spec, input, scratch, publicKey = key) {
  const file = path.join(input, 'approved-packages.json');
  const pub = path.join(scratch, 'owner.gpg');
  command('gpg', ['--homedir', scratch, '--batch', '--dearmor', '--output', pub, publicKey]);
  command('gpgv', ['--homedir', scratch, '--keyring', pub, file + '.asc', file]);
  // The publisher's validator checks schema, both complete native matrices,
  // duplicate entries, sizes, hashes and the consecutive version pair.
  command('python3', [metadata, 'names', input]);
  const approval = readJSON(file);
  assert.equal(approval.releaseVersion, spec.toVersion);
  verifyPackage(path.join(input, spec.oldPackage), approval);
  return approval;
}

function fixtureKey(scratch, label) {
  const home = path.join(scratch, label);
  fs.mkdirSync(home, {mode: 0o700});
  const gpg = (...args) => command('gpg', ['--batch', '--no-options', '--homedir', home, ...args]);
  gpg('--pinentry-mode', 'loopback', '--passphrase', '', '--quick-gen-key', 'Disposable ' + label, 'rsa2048', 'sign', '1d');
  const id = /^fpr:{9}([A-F0-9]+):/m.exec(gpg('--with-colons', '--list-keys'))[1];
  const pub = path.join(scratch, label + '.asc');
  gpg('--armor', '--output', pub, '--export', id);
  return {id, home, pub, sign: (file, output, method) =>
    gpg('--yes', '--local-user', id, '--armor', '--output', output, method, file)};
}

function changeOneByte(file) {
  const fd = fs.openSync(file, 'r+');
  try {
    const byte = Buffer.alloc(1), offset = fs.fstatSync(fd).size - 1;
    assert.equal(fs.readSync(fd, byte, 0, 1, offset), 1);
    byte[0] ^= 1;
    assert.equal(fs.writeSync(fd, byte, 0, 1, offset), 1);
  } finally { fs.closeSync(fd); }
}

// The package manager only sees this case's directory and a fresh URL. Record
// successful GETs so a cached result or a failure fetching another file cannot pass.
async function serveFixture(root, use) {
  const requests = new Set();
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + req.url);
    if (!file.startsWith(root + '/') || !fs.statSync(file, {throwIfNoEntry: false})?.isFile()) {
      res.writeHead(404).end(); return;
    }
    if (req.method === 'GET') requests.add(req.url);
    res.writeHead(200, {'Content-Length': fs.statSync(file).size, 'Cache-Control': 'no-store'});
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).on('error', e => res.destroy(e)).pipe(res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { return await use('http://127.0.0.1:' + server.address().port, requests); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

function packageClient(spec, dir, origin, {trust, mirror = false} = {}) {
  // Scope both sources and caches to this one client. APT still uses the
  // real installed dpkg state and DNF the system RPM database.
  mkdir(dir);
  let manager, flags, refresh, upgrade;
  const cache = path.join(dir, 'cache');
  if (spec.format === 'deb') {
    manager = 'apt-get';
    const source = path.join(dir, 'sources.list');
    fs.writeFileSync(source, 'deb [arch=' + (spec.arch === 'x64' ? 'amd64' : 'arm64') +
      ' signed-by=' + ring + '] ' + origin + '/deb stable main\n');
    mkdir(dir + '/lists/partial'); mkdir(cache + '/archives/partial');
    flags = ['-o', 'Dir::Etc::sourcelist=' + source, '-o', 'Dir::Etc::sourceparts=-',
      '-o', 'Dir::State::lists=' + dir + '/lists', '-o', 'Dir::Cache=' + cache,
      '-o', 'Dir::Cache::archives=' + cache + '/archives', '-o', 'APT::Update::Error-Mode=any',
      '-o', 'Acquire::Languages=none', '-o', 'APT::Keep-Downloaded-Packages=true'];
    refresh = ['update']; upgrade = ['-y', 'install', '--only-upgrade', pkg];
  } else {
    manager = 'dnf';
    const id = path.basename(dir);
    const location = mirror ? 'mirrorlist=' + origin + '/rpm/stable/$basearch/mirrorlist' : 'baseurl=' + origin;
    fs.writeFileSync(dir + '/blanc.repo', ['[' + id + ']', 'name=Blanc update proof', location,
      'enabled=1', 'skip_if_unavailable=0', 'gpgcheck=1', 'repo_gpgcheck=1',
      'gpgkey=file://' + (trust ?? rpmKey), ''].join('\n'));
    flags = ['-y', '--repo=' + id, '--setopt=reposdir=' + dir, '--setopt=cachedir=' + cache,
      '--setopt=system_cachedir=' + cache, '--setopt=keepcache=1'];
    refresh = ['--refresh', 'makecache']; upgrade = ['upgrade', pkg];
  }
  async function run(args, refusal) {
    let result;
    try {
      result = await exec('sudo', ['-n', 'env', 'LC_ALL=C', manager, ...flags, ...args], {maxBuffer: 8 * 1024 * 1024});
    } catch (e) {
      if (!refusal) throw e;
      checkRefusal(refusal, e.code, e.stdout + '\n' + e.stderr);
      return e.stdout + '\n' + e.stderr;
    }
    assert.ok(!refusal, 'Unexpected package-manager success for ' + refusal + '\n' + result.stdout);
  }
  return {refresh: refusal => run(refresh, refusal), upgrade: refusal => run(upgrade, refusal), cache};
}

async function refusal(spec, kind, tree, scratch, results, foreign, trustedMetadata) {
  const root = path.join(scratch, 'repository-' + kind);
  const rpmBase = 'rpm/stable/' + (spec.arch === 'x64' ? 'x86_64' : 'aarch64');
  const isApt = spec.format === 'deb', badMetadata = kind.endsWith('-metadata');
  const relative = isApt ? pool + '/' + spec.newPackage : spec.newPackage;
  const served = path.join(root, relative);
  mkdir(path.dirname(served));
  let trust = rpmKey;
  if (isApt) {
    fs.cpSync(path.join(tree, apt), path.join(root, apt), {recursive: true});
    if (badMetadata) {
      const release = path.join(root, apt, 'Release');
      foreign.sign(release, path.join(root, apt, 'InRelease'), '--clearsign');
      foreign.sign(release, release + '.gpg', '--detach-sign');
      fs.linkSync(path.join(tree, relative), served);
    } else {
      fs.copyFileSync(path.join(tree, relative), served);
      changeOneByte(served);
    }
  } else if (badMetadata) {
    fs.linkSync(path.join(tree, rpmBase, spec.newPackage), served);
    fs.cpSync(path.join(tree, rpmBase, 'repodata'), path.join(root, 'repodata'), {recursive: true});
    const xml = path.join(root, 'repodata/repomd.xml');
    foreign.sign(xml, xml + '.asc', '--detach-sign');
  } else {
    fs.copyFileSync(path.join(tree, rpmBase, spec.newPackage), served);
    command('rpmsign', ['--delsign', served]);
    if (kind === 'rpm-foreign') {
      command('rpmsign', ['--define', '_openpgp_sign gpg', '--define', '_openpgp_sign_id ' + foreign.id,
        '--define', '_gpg_name ' + foreign.id, '--addsign', served], {env: {...process.env, GNUPGHOME: foreign.home}});
      const db = path.join(scratch, 'foreign-rpmdb');
      mkdir(db);
      command('rpmkeys', ['--dbpath', db, '--import', foreign.pub]);
      command('python3', [metadata, 'verify-rpm', served, db]);
    }
    // Re-index AFTER changing the RPM. A checksum mismatch would never reach
    // the package-signature verifier. Only this client's metadata key is trusted.
    command('createrepo_c', ['--no-database', root]);
    const xml = path.join(root, 'repodata/repomd.xml');
    trustedMetadata.sign(xml, xml + '.asc', '--detach-sign');
    trust = trustedMetadata.pub;
  }
  await serveFixture(root, async (origin, requests) => {
    const client = packageClient(spec, path.join(scratch, 'client-' + kind), origin, {trust});
    let message;
    if (badMetadata) {
      message = await client.refresh(kind);
      assert.ok(requests.has(isApt ? '/' + apt + '/InRelease' : '/repodata/repomd.xml.asc'), 'Missing signed metadata request');
    } else {
      await client.refresh();
      message = await client.upgrade(kind);
      assert.ok(requests.has('/' + relative), 'The verifier did not fetch the modified package');
    }
    fs.writeFileSync(path.join(results, kind + '.log'), message);
  });
  // Each case has its own repository and cache. Free the large modified RPM
  // before the next transaction on the hosted runner.
  sudo('rm', '-rf', '--', root, path.join(scratch, 'client-' + kind));
}

export function assertProduction(spec, source, installedKey = spec.format === 'deb' ? ring : rpmKey) {
  const lines = fs.readFileSync(source, 'utf8').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (spec.format === 'deb') {
    assert.deepEqual(lines, ['deb [arch=' + (spec.arch === 'x64' ? 'amd64' : 'arm64') +
      ' signed-by=' + ring + '] ' + production + '/deb stable main']);
  } else {
    assert.deepEqual(lines.filter(line => line.startsWith('[')), ['[blanc-beta]']);
    for (const line of ['enabled=1', 'gpgcheck=1', 'repo_gpgcheck=1', 'gpgkey=file://' + rpmKey,
      'mirrorlist=' + production + '/rpm/stable/$basearch/mirrorlist']) {
      const setting = line.slice(0, line.indexOf('=') + 1);
      assert.deepEqual(lines.filter(entry => entry.startsWith(setting)), [line], 'Unexpected ' + setting + ' in production source');
    }
    assert.ok(!lines.some(line => line.startsWith('baseurl=') || line.startsWith('metalink=')), 'Unexpected DNF source');
  }
  assertEnrolledKey(installedKey, key, spec.format === 'rpm');
}

function nativeLeg(spec, input, results, scratch) {
  const deb = spec.format === 'deb';
  const source = deb ? '/etc/apt/sources.list.d/blanc-beta.list' : '/etc/yum.repos.d/blanc-beta.repo';
  const saved = path.join(scratch, 'saved-production-source');
  const assertProductionDisabled = () => assert.equal(fs.lstatSync(source, {throwIfNoEntry: false}), undefined, 'Production source reappeared');
  const oldFile = path.join(input, spec.oldPackage);
  const tree = path.join(scratch, 'staged');
  const nativeBase = deb ? pool : 'rpm/stable/' + (spec.arch === 'x64' ? 'x86_64' : 'aarch64');
  const newPath = nativeBase + '/' + spec.newPackage;
  const newFile = path.join(tree, newPath);
  const betaData = path.join(process.env.XDG_CONFIG_HOME, pkg, 'Default', 'Bookmarks');
  const bookmarks = '{"roots":{"bookmark_bar":{"name":"Preserve on uninstall"}}}\n';
  let approval, seeds, foreign, trustedMetadata;

  return {
    async prepare() {
      approval = verifyApproval(spec, input, fs.mkdtempSync(path.join(scratch, 'approval-')));
      const pointer = await stageMetadata(spec, approval, tree);
      assert.equal(hashFile(path.join(tree, 'blanc-repository.asc')), hashFile(key));
      mkdir(path.dirname(newFile));
      command('curl', ['-q', '--fail', '--silent', '--show-error', '--proto', '=https', '--output', newFile, staging + '/' + newPath]);
      verifyPackage(newFile, approval);
      assert.ok(!fs.existsSync(source) && !fs.existsSync(launcher), 'Expected a fresh machine');
      command('gnome-keyring-daemon', ['--unlock', '--components=secrets'], {input: 'disposable session only', timeout: 15000});
      command('gnome-keyring-daemon', ['--start', '--components=secrets'], {timeout: 15000});
      seeds = await seedInstallHome(spec.arch, scratch, results);
      mkdir(path.dirname(betaData));
      fs.writeFileSync(betaData, bookmarks, {flag: 'wx'});
      foreign = fixtureKey(scratch, 'foreign-signer');
      if (!deb) trustedMetadata = fixtureKey(scratch, 'local-metadata-signer');
      return pointer;
    },
    install() {
      if (deb) sudo('apt-get', '-y', 'install', oldFile);
      else {
        sudo('rpmkeys', '--import', key);
        sudo('dnf', '-y', '--setopt=localpkg_gpgcheck=1', 'install', oldFile);
      }
      assert.equal(command(launcher, ['--product-version']).trim(), spec.fromVersion);
      sudo('/etc/cron.daily/blanc-beta');
      assertProduction(spec, source);
    },
    disableProduction() { sudo('mv', '--', source, saved); },
    assertProductionDisabled,
    relaunch: upgrade => proveRelaunch({fromVersion: spec.fromVersion, toVersion: spec.toVersion, upgrade,
      resultsDir: path.join(results, 'relaunch')}),
    refuse: kind => refusal(spec, kind, tree, scratch, results, foreign, trustedMetadata),
    smoke(version, label) {
      const file = path.join(results, 'smoke-' + label + '.json');
      command(process.execPath, [local('linux-beta-smoke.mjs'), version, file], {stdio: 'inherit'});
      const report = readJSON(file);
      assert.equal(report.pass, true); assert.equal(report.system, spec.system); assert.equal(report.version, version);
    },
    async upgrade() {
      assertProductionDisabled();
      const client = packageClient(spec, path.join(scratch, 'client-staging'), staging, {mirror: true});
      await client.refresh();
      await client.upgrade();
      // Bind the actual transaction (including the signed RPM header) to the
      // approval. A separate download or a matching version alone cannot do so.
      const files = sudo('find', client.cache, '-type', 'f', '-name', spec.newPackage).trim().split('\n');
      assert.ok(files.length === 1 && files[0], 'Missing or ambiguous staged package in the fresh cache');
      assert.equal(sudo('sha256sum', '--', files[0]).split(' ')[0], hashFile(newFile), 'Installed package differs from approved staging bytes');
    },
    restoreProduction() {
      sudo('rm', '-rf', '--', path.join(scratch, 'client-staging'));
      sudo('mv', '--', saved, source);
    },
    async uninstall() {
      assertProduction(spec, source);
      if (deb) sudo('apt-get', '-y', 'purge', pkg);
      else sudo('dnf', '-y', '--disablerepo=*', 'remove', pkg);
      for (const file of [source, deb ? ring : rpmKey, launcher, '/etc/cron.daily/blanc-beta', '/opt/bnfy/blanc-beta/chrome']) {
        assert.equal(fs.lstatSync(file, {throwIfNoEntry: false}), undefined, 'Uninstall left ' + file);
      }
      assert.equal(fs.readFileSync(betaData, 'utf8'), bookmarks, 'Uninstall lost the beta profile');
      assert.deepEqual(seedSnapshot(), seeds.baseline, 'Uninstall changed an existing browser or repository');
      if (spec.arch === 'x64') await launchAppImage(seeds.appImage, path.join(results, 'shipping-after.log'));
    },
    pointer: async () => JSON.parse(await readStaging('current.json')),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, system, arch, from, to, repository, input, results, scratch] = process.argv.slice(2);
  const spec = proofInputs(system, arch, from, to, repository);
  if (mode === 'download') download(spec, input);
  else {
    assert.equal(process.platform, 'linux'); assert.notEqual(process.getuid(), 0);
    assert.equal(process.arch, arch);
    const distro = fs.readFileSync('/etc/os-release', 'utf8');
    const field = name => new RegExp('^' + name + '="?([^"\n]+)"?$', 'm').exec(distro)?.[1];
    assert.equal(field('ID'), system);
    assert.equal(field('VERSION_ID'), {ubuntu: '24.04', debian: '12', fedora: '45'}[system]);
    const output = path.join(results, spec.report);
    assert.ok(!fs.existsSync(output), 'Refusing to reuse a completed report');
    if (mode === 'run') {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-update-proof-'));
      try {
        // Package managers drop privileges for downloads. Let their helpers
        // traverse to the cache and public keys; GnuPG homes stay mode 0700.
        fs.chmodSync(dir, 0o711);
        const env = sessionEnvironment(path.join(dir, 'home'));
        command('xvfb-run', ['-a', 'dbus-run-session', '--', process.execPath, self, 'session', system, arch,
          from, to, repository, input, results, dir], {env, stdio: 'inherit'});
      } finally {
        // apt and dnf own their private caches; all local keys and sources die with the job.
        sudo('rm', '-rf', '--', dir);
      }
    } else if (mode === 'session') {
      const report = await proveUpdate(spec, nativeLeg(spec, input, results, scratch));
      fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
    } else throw Error('Expected download, run or session');
  }
}
