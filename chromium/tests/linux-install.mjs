// prepare ARCH DRAFT_DOWNLOADS DEST TAR_SHA256 runs before any package scripts.
// run SYSTEM ARCH DEST RESULTS runs as an ordinary user on a disposable machine.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {ASSET_NAME, candidateId, packageNames, signedCandidateName} from '../linux/candidate.mjs';
import {installedRuntime, runSmoke} from './linux-smoke.mjs';
import {assertEnrolledKey, defaultBrowser, googleRepoSnapshot, hashFile, launchAppImage, seedDefaultBrowser, seedInstallHome, seedSnapshot, sessionEnvironment} from './lib/linux-seed.mjs';
import {NativeFixture} from './lib/fixture.mjs';
import {pause, waitFor} from './lib/cdp.mjs';

const self = fileURLToPath(import.meta.url);
const key = fileURLToPath(new URL('../linux/keys/blanc-repository.asc', import.meta.url));
const pkg = 'blanc-prototype';
const opt = '/opt/bnfy/' + pkg;
const executable = opt + '/chrome';
const cron = '/etc/cron.daily/' + pkg;
const defaults = '/etc/default/' + pkg;
const ring = '/usr/share/keyrings/' + pkg + '.gpg';
const hex = /^[a-f0-9]{64}$/;
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const run = (cmd, args, options = {}) => execFileSync(cmd, args, {encoding: 'utf8', ...options});
const sudo = (...args) => run('sudo', ['-n', ...args], {stdio: 'inherit'});
const present = file => fs.lstatSync(file, {throwIfNoEntry: false}) !== undefined;

function architectures(arch) {
  assert.ok(['x64', 'arm64'].includes(arch), 'Unknown architecture');
  return arch === 'x64' ? {deb: 'amd64', rpm: 'x86_64'} : {deb: 'arm64', rpm: 'aarch64'};
}
// All three install legs need the selected archive and its signed artifacts.
export function installDownloads(release, arch, publicKey = key) {
  assert.equal(release.isDraft, true, 'fork-linux-candidate must be an unpublished draft');
  const names = release.assets.map(asset => asset.name);
  const archive = ASSET_NAME(arch);
  assert.ok(names.includes(archive), `Missing ${arch} candidate archive ${archive} on fork-linux-candidate`);
  assert.ok(fs.existsSync(publicKey), `Install requires the owner's committed public repository key ${publicKey} before producing signed .deb and .rpm candidates`);
  const descriptor = signedCandidateName(arch);
  for (const file of [descriptor, descriptor + '.asc']) {
    assert.ok(names.includes(file), `Missing ${file} for ${arch} install. Produce a candidate with .deb and .rpm packages and sign it with the owner's key`);
  }
  return [archive, descriptor, descriptor + '.asc'];
}

// A draft can still contain signed RPMs from earlier versions of the same arch.
export function signedRpmAsset(release, arch, downloads, expected, publicKey = key) {
  const signed = readSignedDescriptor(downloads, arch, publicKey);
  assert.match(expected, hex);
  assert.equal(signed.arch, arch);
  assert.equal(signed.tarSha256, expected);
  const {file} = signed.rpm;
  assert.equal(/^blanc-prototype-\d+(?:\.\d+){3}-1\.(x86_64|aarch64)\.rpm$/.exec(file)?.[1], architectures(arch).rpm);
  assert.ok(release.isDraft === true && release.assets.some(asset => asset.name === file), 'Missing signed RPM ' + file);
  return file;
}

function matchesFile(row, name) {
  return row && row.file === name && hex.test(row.sha256);
}
export function installManifest(candidate, signed, arch, tarSha256) {
  assert.match(tarSha256, hex);
  assert.equal(signed.tarSha256, tarSha256);
  assert.equal(candidate.arch, arch);
  assert.equal(signed.arch, arch);
  assert.equal(candidate.id, candidateId(candidate.exeSha256, arch));
  assert.equal(signed.candidate, candidate.id);
  const names = packageNames(candidate.version, arch);
  assert.ok(Array.isArray(candidate.packages) && candidate.packages.length === 2,
    `The ${arch} candidate must contain both .deb and .rpm packages built with the owner's committed repository key`);
  for (const [format, name] of Object.entries(names)) {
    const original = candidate.packages.find(row => matchesFile(row, name));
    assert.ok(original, 'Missing tarball package ' + name);
    assert.ok(matchesFile(signed[format], name), 'Wrong signed descriptor entry for ' + name);
    if (format === 'deb') assert.equal(original.sha256, signed.deb.sha256);
  }
  return names;
}

export function readSignedDescriptor(dir, arch, publicKey = key) {
  const descriptor = path.join(dir, signedCandidateName(arch));
  const trust = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-candidate-trust-'));
  try {
    const trustedKeys = path.join(trust, 'blanc.gpg');
    run('gpg', ['--homedir', trust, '--batch', '--dearmor', '--output', trustedKeys, publicKey]);
    run('gpgv', ['--homedir', trust, '--keyring', trustedKeys, descriptor + '.asc', descriptor], {stdio: 'inherit'});
    return json(descriptor);
  } finally { fs.rmSync(trust, {recursive: true, force: true}); }
}

export function prepareInstallInput(arch, downloads, dest, expected, publicKey = key) {
  architectures(arch);
  assert.match(expected, hex);
  const archive = path.join(downloads, ASSET_NAME(arch));
  assert.ok(fs.existsSync(archive), 'Missing candidate archive ' + archive);
  assert.ok(fs.existsSync(publicKey), "Missing owner's public repository key " + publicKey);
  assert.equal(hashFile(archive), expected, 'Dispatched candidate tarball SHA-256');
  fs.mkdirSync(dest);
  try {
    const descriptor = path.join(downloads, signedCandidateName(arch));
    const signed = readSignedDescriptor(downloads, arch, publicKey);
    assert.equal(signed.tarSha256, expected);
    assert.equal(signed.arch, arch);
    // Unpack only data consumed by the install leg, never the unpacked browser.
    // Normalise GNU tar's optional leading ./, requiring one member per name.
    const entries = run('tar', ['-tzf', archive]).trimEnd().split('\n');
    const wanted = ['candidate.json'];
    for (const format of ['deb', 'rpm']) {
      const name = path.basename(signed[format].file);
      assert.match(name, /^blanc-prototype[-_][\w.-]+\.(deb|rpm)$/);
      wanted.push('packages/' + name);
    }
    const members = wanted.map(name => {
      const found = entries.filter(entry => entry.replace(/^\.\//, '') === name);
      assert.equal(found.length, 1, `Expected one ${name} in the ${arch} archive. Install needs a candidate packaged with the owner's committed repository key`);
      return found[0];
    });
    run('tar', ['-xzf', archive, '--no-same-owner', '-C', dest, '--', ...members]);
    for (const name of wanted) assert.ok(fs.lstatSync(path.join(dest, name)).isFile(), name);
    const candidate = json(path.join(dest, 'candidate.json'));
    const names = installManifest(candidate, signed, arch, expected);
    for (const row of candidate.packages) {
      const name = path.basename(row.file);
      assert.equal(hashFile(path.join(dest, 'packages', name)), row.sha256, name);
    }
    const signedRpm = path.join(downloads, names.rpm);
    assert.equal(hashFile(signedRpm), signed.rpm.sha256, names.rpm);
    fs.copyFileSync(signedRpm, path.join(dest, names.rpm));
    fs.copyFileSync(descriptor, path.join(dest, path.basename(descriptor)));
    fs.copyFileSync(descriptor + '.asc', path.join(dest, path.basename(descriptor) + '.asc'));
  } catch (error) {
    fs.rmSync(dest, {recursive: true, force: true});
    throw error;
  }
}

function verifyInstallInput(source, candidate, arch) {
  const trust = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-install-trust-'));
  try {
    const signed = readSignedDescriptor(source, arch);
    const names = installManifest(candidate, signed, arch, process.env.CANDIDATE_SHA256);
    const deb = path.join(source, 'packages', names.deb);
    const rpm = path.join(source, names.rpm);
    assert.equal(hashFile(deb), signed.deb.sha256);
    assert.equal(hashFile(rpm), signed.rpm.sha256);
    const db = path.join(trust, 'rpm');
    fs.mkdirSync(db);
    run('rpm', ['--dbpath', db, '--initdb']);
    run('rpmkeys', ['--dbpath', db, '--import', key]);
    // Also rejects unsigned packages on RPM versions where digest-only checks return zero.
    run('python3', [fileURLToPath(new URL('../linux/repository/metadata.py', import.meta.url)), 'verify-rpm', rpm, db]);
    return {deb, rpm, signed};
  } finally { fs.rmSync(trust, {recursive: true, force: true}); }
}

export function repositoryContents(system, arch) {
  const {deb} = architectures(arch);
  if (system === 'fedora') {
    return '[blanc-prototype]\nname=Blanc Prototype\nbaseurl=https://pkg-staging.blanc.day/rpm/stable/$basearch\nenabled=1\ngpgcheck=1\nrepo_gpgcheck=1\ngpgkey=file:///opt/bnfy/blanc-prototype/blanc-repository.asc\n';
  }
  assert.ok(['ubuntu', 'debian'].includes(system));
  return `deb [arch=${deb} signed-by=${ring}] https://pkg-staging.blanc.day/deb stable main\n`;
}

function assertDistro(system, arch) {
  assert.equal(process.platform, 'linux');
  assert.notEqual(process.getuid(), 0, 'The browser must run as an ordinary user');
  assert.equal(process.arch, arch);
  const release = Object.fromEntries(read('/etc/os-release').split('\n').filter(v => v.includes('='))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).replace(/^"|"$/g, '')]));
  assert.equal(release.ID, system);
  assert.equal(release.VERSION_ID, {ubuntu: '24.04', debian: '12', fedora: '45'}[system]);
}

// Private bus for the minimal Debian case: no service activation directories.
// Checking both lists catches a D-Bus activated Secret Service as well as a running one.
function assertNoSecretService() {
  for (const method of ['ListNames', 'ListActivatableNames']) {
    const names = run('gdbus', ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus',
      '--method', 'org.freedesktop.DBus.' + method]);
    assert.doesNotMatch(names, /org\.freedesktop\.secrets/);
  }
}
const username = 'blanc-install-fixture';
const origin = 'https://install-check.invalid/';
async function browserPage(fixture, url, ready) {
  const {targetId} = await fixture.browser.send('Target.createTarget', {url});
  const target = await waitFor(async() => (await fixture.targets()).find(t => t.id === targetId), Boolean, 'new browser page');
  const page = await fixture.connectTarget(target);
  await waitFor(() => page.eval(ready), Boolean, url + ' ready');
  return page;
}
async function fixturePassword(fixture, password, save) {
  const page = await browserPage(fixture, 'chrome://password-manager/passwords', '!!globalThis.chrome?.passwordsPrivate');
  if (save) {
    const options = {url: origin, username, password, note: '', useAccountStore: false};
    await page.eval('chrome.passwordsPrivate.addPassword(' + JSON.stringify(options) + ')');
  }
  const id = await waitFor(() => page.eval(`(async()=>{
    const rows=await chrome.passwordsPrivate.getSavedPasswordList();
    return rows.find(r=>r.username===${JSON.stringify(username)})?.id;
  })()`), Number.isInteger, 'saved fixture login');
  assert.ok(await page.eval(`(async()=>await chrome.passwordsPrivate.requestPlaintextPassword(${id},'VIEW')===${JSON.stringify(password)})()`),
    'Browser could not decrypt the disposable login');
}
function storedVersion(home) {
  // The queried row belongs exclusively to this test origin and username.
  return run('sqlite3', ['-readonly', path.join(home, '.config', pkg, 'Default/Login Data'),
    `SELECT hex(substr(password_value,1,3)) FROM logins WHERE signon_realm='${origin}' AND username_value='${username}'`]).trim();
}
function prototypeKey() {
  const value = run('secret-tool', ['lookup', 'application', pkg, 'xdg:schema', 'chrome_libsecret_os_crypt_password_v2']);
  assert.ok(value.length, 'Missing prototype Secret Service item');
  return createHash('sha256').update(value).digest('hex');
}
export async function verifyPasswordAcrossReinstall(keyBefore, {install, decrypt, readKey = prototypeKey}) {
  assert.equal(readKey(), keyBefore, 'Prototype key lost or replaced before reinstall');
  install();
  await decrypt();
  assert.equal(readKey(), keyBefore, 'Prototype key changed across reinstall');
}

async function noKeyring(metadata, results) {
  assertNoSecretService();
  await runSmoke({display: 'x11', installed: executable, metadata, resultsFolder: results, installedHome: process.env.HOME,
    inspect: fixture => fixturePassword(fixture, randomBytes(18).toString('hex'), true)});
  assertNoSecretService();
  assert.equal(storedVersion(process.env.HOME), '763130', 'No daemon must fall back to v10');
}
function freshDumps(root) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name.endsWith('.dmp')) {
        const header = Buffer.alloc(4);
        const fd = fs.openSync(file, 'r');
        try {fs.readSync(fd, header, 0, 4, 0);} finally {fs.closeSync(fd);}
        if (header.toString() === 'MDMP') files.push({file: path.relative(root, file), bytes: fs.statSync(file).size});
      }
    }
  }
  walk(root);
  return files;
}
async function crashCapture(metadata, scratch, testReporter) {
  const fixture = new NativeFixture();
  // Use a fresh data folder so a past dump cannot count. No synthetic crash handler.
  const name = testReporter ? 'test-reporter' : 'default-reporter';
  const home = path.join(scratch, name + '-home');
  fs.mkdirSync(home);
  fixture.extraArgs = ['--ozone-platform=x11'];
  if (testReporter) fixture.extraArgs.push('--enable-crash-reporter-for-testing');
  try {
    await fixture.launch(installedRuntime(executable, metadata), path.join(scratch, name), {testHooks: true, installedHome: home});
    await fixture.browser.send('Browser.crash').catch(() => {});
    await waitFor(() => fixture.exit, Boolean, 'test browser crash');
    assert.ok(fixture.exit.signal || fixture.exit.code !== 0, 'Expected an abnormal exit from Browser.crash');
    let dumps = [];
    for (let i = 0; i < 40 && !dumps.length; i++) {
      await pause(250);
      dumps = freshDumps(fixture.profile);
    }
    return {exit: fixture.exit, captured: dumps.length > 0, dumps};
  } finally { await fixture.close(); }
}

export function removePackage(system, label, {record, snapshot, daily, enrollment, command = sudo}) {
  const rpm = system === 'fedora';
  if (rpm) command('dnf', '--disablerepo=*', 'remove', '-y', pkg);
  else command('apt-get', 'remove', '-y', pkg);
  const removed = snapshot(label + 'Remove');
  for (const name of ['installDir', 'launcher', 'desktop']) assert.equal(removed[name], false, name + ' after removal');
  if (!rpm) {
    // apt may keep managed sources until purge. A surviving job must neither
    // create missing enrollment files nor rewrite the ones that survived.
    const before = enrollment();
    record.files[label + 'RemoveJobs'] = daily(false);
    snapshot(label + 'RemoveCron');
    assert.deepEqual(enrollment(), before, 'Remove-only cron changed repository enrollment');
    command('apt-get', 'purge', '-y', pkg);
    const purged = snapshot(label + 'Purge');
    assert.equal(purged.source, false, 'Repository source survived apt purge');
    assert.equal(purged.key, false, 'Repository key survived apt purge');
  }
  record.files[label + 'RemainingJobs'] = daily(false);
  const after = snapshot(label + 'FinalCron');
  for (const name of ['installDir', 'launcher', 'desktop', 'source', 'key', 'cron', 'apparmor']) assert.equal(after[name], false, name + ' after final cron');
  assert.equal(after.data, true, 'Uninstall must keep the user data folder');
}

async function lifecycle(system, arch, source, results, scratch) {
  assertDistro(system, arch);
  const metadata = path.join(source, 'candidate.json');
  const candidate = json(metadata);
  const rpm = system === 'fedora';
  let installer;
  const home = process.env.HOME;
  assert.equal(home, path.join(scratch, 'home'));
  const files = {installDir: opt, launcher: '/usr/bin/' + pkg, desktop: '/usr/share/applications/' + pkg + '.desktop', cron, defaults,
    source: rpm ? '/etc/yum.repos.d/' + pkg + '.repo' : '/etc/apt/sources.list.d/' + pkg + '.list',
    key: rpm ? opt + '/blanc-repository.asc' : ring, apparmor: '/etc/apparmor.d/' + pkg, data: path.join(home, '.config', pkg)};
  const report = path.join(results, `install-${system}-${arch}.json`);
  const record = {system, arch, candidate: candidate.id, tarSha256: process.env.CANDIDATE_SHA256,
    image: process.env.INSTALL_IMAGE || 'ubuntu-24.04 runner', containerSeccomp: rpm || system === 'debian' ? 'unconfined' : null,
    appImageCoverage: arch === 'x64' ? 'shipping v1.51.0 before and after' : 'representative profile only',
    shippingSetuidHelper: system === 'ubuntu' && arch === 'x64',
    installed: false, launched: false, sandboxed: false, blocker: false, untouched: {}, defaultBrowserSet: false,
    upgradeKeptData: false, uninstalled: false, dataFolderKept: false, repositoryWritten: false, files: {}};
  const snapshot = stage => {
    const state = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, present(file)]));
    record.files[stage] = state;
    if (record.seeded) {
      const current = googleRepoSnapshot();
      record.untouched.googleRepoFiles = isDeepStrictEqual(current, record.seeded.googleRepoFiles);
      assert.deepEqual(current, record.seeded.googleRepoFiles, 'Google repository files changed at ' + stage);
    }
    // RPM's imported system keys have a different lifetime from the packaged
    // .asc file. Record the public fingerprints across removal and opt-out.
    if (rpm) {
      record.rpmKeyLists ??= {};
      record.rpmKeyLists[stage] = run('sudo', ['-n', 'rpmkeys', '--list']).trim().split('\n').filter(Boolean);
    }
    return state;
  };
  function install() {
    if (rpm) sudo('dnf', 'install', '-y', installer);
    else sudo('apt-get', 'install', '-y', installer);
  }
  // Rerun the installed channel's scheduled job if one remains after removal.
  // Calling an archived copy would execute code no longer installed on the machine.
  function daily(required = true) {
    const entries = fs.existsSync('/etc/cron.daily') ? fs.readdirSync('/etc/cron.daily') : [];
    const jobs = entries.filter(name => name === pkg && fs.existsSync(cron));
    if (required) assert.deepEqual(jobs, [pkg], 'Missing installed daily job');
    for (const job of jobs) sudo(path.join('/etc/cron.daily', job));
    return jobs;
  }
  const enrollment = () => [files.source, files.key].map(file => {
    const stat = fs.lstatSync(file, {bigint: true, throwIfNoEntry: false});
    return stat && {inode: stat.ino, changed: stat.ctimeNs, sha256: hashFile(file)};
  });
  const remove = label => removePackage(system, label, {record, snapshot, daily, enrollment});
  try {
    record.stage = 'verify packages';
    const verified = verifyInstallInput(source, candidate, arch);
    installer = rpm ? verified.rpm : verified.deb;
    record.verified = {deb: verified.signed.deb.sha256, rpm: verified.signed.rpm.sha256, rpmSignature: true};
    if (record.containerSeccomp) assert.match(read('/proc/self/status'), /^Seccomp:\s+0$/m, 'Docker seccomp setting');
    for (const [name, exists] of Object.entries(snapshot('before'))) assert.equal(exists, false, 'Expected clean install leg: ' + name);
    run('gnome-keyring-daemon', ['--unlock', '--components=secrets'], {input: 'disposable session only', timeout: 15000});
    run('gnome-keyring-daemon', ['--start', '--components=secrets'], {timeout: 15000});
    record.stage = 'seed';
    const {baseline, appImage} = await seedInstallHome(arch, scratch, results);
    record.seeded = baseline;
    const checkSeeds = () => {
      const actual = seedSnapshot();
      for (const name of Object.keys(baseline)) {
        record.untouched[name] = isDeepStrictEqual(actual[name], baseline[name]);
        assert.ok(record.untouched[name], 'Seed changed: ' + name);
      }
    };
    record.stage = 'install';
    install();
    const initial = snapshot('installed');
    for (const name of ['installDir', 'launcher', 'desktop', 'cron']) assert.equal(initial[name], true, 'Expected ' + name);
    assert.equal(initial.data, false, 'The ordinary browser launch must create the data folder');
    record.installed = true;
    daily();
    assert.equal(read(files.source), repositoryContents(system, arch));
    assertEnrolledKey(files.key, key, rpm);
    record.repository = {source: files.source, content: read(files.source), key: files.key, keySha256: hashFile(files.key)};
    record.repositoryWritten = true;
    snapshot('enrolled');
    checkSeeds();
    record.stage = 'launch';
    const password = randomBytes(24).toString('base64');
    let keyBefore;
    const smokeOptions = {display: 'x11', installed: executable, metadata, installedHome: home};
    const smoke = await runSmoke({...smokeOptions, resultsFolder: path.join(results, 'installed'), inspect: async fixture => {
      checkSeeds(); // Include first launch before the explicit user choice.
      const start = await browserPage(fixture, 'chrome://newtab/', "typeof window.bowserPages?.start?.setDefaultBrowser==='function'");
      await start.eval('window.bowserPages.start.setDefaultBrowser()');
      await waitFor(defaultBrowser, v => v === pkg + '.desktop', 'native default browser registration');
      record.defaultBrowserSet = true;
      await fixturePassword(fixture, password, true);
      await fixture.stop();
      assert.equal(storedVersion(home), '763131', 'Login must use the Secret Service v11 key');
      keyBefore = prototypeKey();
      await fixture.start(fixture.base + '/initial');
      await fixturePassword(fixture, password, false);
      assert.equal(prototypeKey(), keyBefore, 'Key changed across relaunch');
      record.passwordRelaunch = true;
    }});
    record.launched = smoke.checks.launched;
    record.sandboxed = smoke.checks.rendererSandbox;
    record.blocker = smoke.checks.blockerReady;
    // Restore the deliberate user choice so reinstall and removal also exercise preservation.
    seedDefaultBrowser();
    checkSeeds();

    record.stage = 'reinstall';
    const decryptSavedLogin = stage => runSmoke({...smokeOptions, resultsFolder: path.join(results, stage),
      inspect: fixture => fixturePassword(fixture, password, false)});
    await verifyPasswordAcrossReinstall(keyBefore, {
      install() {
        if (rpm) sudo('rpm', '-U', '--replacepkgs', installer);
        else sudo('dpkg', '-i', installer);
        snapshot('reinstalled');
      },
      decrypt: () => decryptSavedLogin('reinstalled'),
    });
    assert.equal(storedVersion(home), '763131');
    checkSeeds();
    record.upgradeKeptData = true;

    if (system === 'debian') {
      record.stage = 'missing Secret Service';
      const bus = path.join(scratch, 'no-services.conf');
      fs.writeFileSync(bus, '<busconfig><type>session</type><listen>unix:tmpdir=/tmp</listen><policy context="default"><allow send_destination="*"/><allow receive_sender="*"/><allow own="*"/></policy></busconfig>');
      run('dbus-run-session', ['--dbus-daemon=/usr/bin/dbus-daemon', '--config-file=' + bus, '--', process.execPath, self, 'no-keyring', metadata, path.join(results, 'no-secret-service')],
        {env: sessionEnvironment(path.join(scratch, 'no-keyring-home')), stdio: 'inherit', timeout: 120000});
      record.noSecretService = true;
    }
    record.stage = 'crash capture';
    record.crashpad = {default: await crashCapture(metadata, scratch, false), testReporter: await crashCapture(metadata, scratch, true)};
    record.stage = 'uninstall';
    remove('managed');
    record.uninstalled = true;
    assert.equal(storedVersion(home), '763131', 'Purged installation lost the fixture login');
    checkSeeds();
    record.stage = 'administrator opt-out';
    await verifyPasswordAcrossReinstall(keyBefore, {
      install: () => {
        run('sudo', ['-n', 'tee', defaults], {input: 'repo_add_once="false"\n'});
        install();
        assert.equal(snapshot('optOutInstalled').source, false, 'Opt-out ignored during installation');
        daily();
        const optedOut = snapshot('optedOut');
        assert.equal(optedOut.source, false, 'Opt-out ignored by cron');
        if (!rpm) assert.equal(optedOut.key, false, 'Unexpected apt keyring on opt-out');
      },
      decrypt: () => decryptSavedLogin('optOutReinstalled'),
    });
    remove('optOut');
    assert.equal(prototypeKey(), keyBefore, 'Prototype key changed after opt-out removal');
    assert.equal(storedVersion(home), '763131', 'Opt-out removal lost the fixture login');
    record.dataFolderKept = true;
    record.optOut = true;
    checkSeeds();
    if (appImage) {
      record.stage = 'shipping relaunch';
      await launchAppImage(appImage, path.join(results, 'shipping-after.log'));
      record.appImageRelaunched = true;
    }
    record.stage = 'complete';
    record.pass = true;
  } catch (error) {
    record.pass = false;
    record.error = error.message;
    throw error;
  } finally {
    fs.writeFileSync(report, JSON.stringify(record, null, 2) + '\n');
  }
}

function startSession(system, arch, source, results) {
  assertDistro(system, arch);
  fs.mkdirSync(results, {recursive: true});
  assert.ok(!present(path.join(results, `install-${system}-${arch}.json`)), 'Refusing to overwrite install evidence');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-install-'));
  try {
    run('xvfb-run', ['-a', 'dbus-run-session', '--', process.execPath, self, 'session', system, arch, source, results, scratch],
      {env: sessionEnvironment(path.join(scratch, 'home')), stdio: 'inherit'});
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'assets' && args.length === 2) console.log(installDownloads(json(args[0]), args[1]).join('\n'));
  else if (command === 'rpm-asset' && args.length === 4) console.log(signedRpmAsset(json(args[0]), ...args.slice(1)));
  else if (command === 'prepare' && args.length === 4) prepareInstallInput(...args);
  else if (command === 'run' && args.length === 4) startSession(...args);
  else if (command === 'session' && args.length === 5) await lifecycle(...args);
  else if (command === 'no-keyring' && args.length === 2) await noKeyring(...args);
  else throw Error('Usage: linux-install.mjs assets RELEASE_JSON ARCH | rpm-asset RELEASE_JSON ARCH DOWNLOADS SHA256 | prepare ARCH DOWNLOADS DEST SHA256 | run SYSTEM ARCH DEST RESULTS');
}
