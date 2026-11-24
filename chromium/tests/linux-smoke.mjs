// node chromium/tests/linux-smoke.mjs --display=x11|wayland CANDIDATE_DIR RESULTS_DIR
// node chromium/tests/linux-smoke.mjs --display=x11 --installed=/opt/bnfy/blanc-prototype/chrome --metadata=.../candidate.json RESULTS_DIR
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { candidateId, runtimeConfig } from '../linux/candidate.mjs';
import { pipeSync } from '../linux/pipe.mjs';
import { NativeFixture } from './lib/fixture.mjs';
import { hashFile, sessionEnvironment } from './lib/linux-seed.mjs';
import { waitFor } from './lib/cdp.mjs';
import { assertNodeRuntime, assertRendering } from './lib/render-guard.mjs';
import { installDriver, nativeCall } from './lib/test-driver.mjs';
import { claimEvidence } from './lib/evidence-file.mjs';

// Take one process-tree snapshot. Renderers can be grandchildren via the zygote.
function rendererPids(browserPid) {
  const rows = execFileSync('/bin/ps', ['-e', '-ww', '-o', 'pid=,ppid=,args='], { encoding: 'utf8' });
  const parents = new Map();
  const renderers = [];
  for (const line of rows.trimEnd().split('\n')) {
    const [, pid, parent, command] = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    parents.set(Number(pid), Number(parent));
    if (/(?:^|\s)--type=renderer(?:\s|$)/.test(command)) renderers.push(Number(pid));
  }
  return renderers.filter(pid => {
    let parent = parents.get(pid);
    while (parent && parent !== browserPid) parent = parents.get(parent);
    return parent === browserPid;
  });
}

function pidNamespace(pid) {
  const link = `/proc/${pid}/ns/pid`;
  try {
    return fs.readlinkSync(link);
  } catch (error) {
    if (!['EACCES', 'EPERM'].includes(error.code)) throw error;
    // A non-dumpable renderer can deny readlink even to its owner. Elevate
    // only this read on the hosted runner; the fixture launches as the user.
    return execFileSync('sudo', ['-n', '/usr/bin/readlink', link], { encoding: 'utf8' }).trim();
  }
}

const installedChrome = '/opt/bnfy/blanc-prototype/chrome';

export function verifiedSmokePackage(dir, candidate, format) {
  const rows = candidate.packages?.filter(p => p.file?.endsWith('.' + format)) ?? [];
  assert.equal(rows.length, 1, `Installed smoke requires one .${format} in the ${candidate.arch} candidate. Packages require the owner's committed repository key`);
  const [row] = rows;
  const name = path.basename(row.file);
  assert.equal(row.file, name, 'Invalid candidate package basename');
  const file = path.join(dir, 'packages', name);
  assert.ok(fs.existsSync(file), 'Missing candidate package ' + file);
  assert.equal(hashFile(file), row.sha256, 'Candidate package SHA-256 mismatch for ' + name);
  return file;
}

export function debExecutableSha256(deb) {
  const bytes = pipeSync(['dpkg-deb', ['--fsys-tarfile', deb]], ['tar', ['-xOf', '-', `./${installedChrome.replace(/^\//, '')}`]]);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.match(digest, /^[0-9a-f]{64}$/, 'Missing packaged chrome SHA-256');
  return digest;
}

// Chromium's installer takes chrome.stripped, while the tarball hashes chrome.
// Read the digest of the packaged executable independently of the installed copy.
export function installedRuntime(executable, metadata) {
  assert.equal(process.platform, 'linux');
  assert.equal(executable, installedChrome);
  const dir = path.dirname(metadata);
  const candidate = JSON.parse(fs.readFileSync(metadata, 'utf8'));
  assert.equal(candidate.arch, process.arch);
  assert.equal(candidate.id, candidateId(candidate.exeSha256, candidate.arch));
  const fedora = /^ID="?fedora"?$/m.test(fs.readFileSync('/etc/os-release', 'utf8'));
  const pkg = verifiedSmokePackage(dir, candidate, fedora ? 'rpm' : 'deb');
  let expected;
  if (fedora) {
    const rows = execFileSync('rpm', ['-qp', '--qf', '[%{FILENAMES} %{FILEDIGESTS}\n]', pkg], {encoding:'utf8'});
    expected = rows.split('\n').find(row => row.startsWith(executable + ' '))?.split(' ')[1];
  } else {
    expected = debExecutableSha256(pkg);
  }
  assert.match(expected ?? '', /^[0-9a-f]{64}$/, 'Missing packaged chrome SHA-256');
  return {candidate: candidate.id, executable, executableSha256: expected, singleBinary: true, diskAssets: false};
}

export async function runSmoke({display, candidateFolder, installed, metadata, resultsFolder, installedHome, inspect}) {
  assertNodeRuntime();
  if (installed) {
    assert.ok(installedHome && process.env.HOME === installedHome && process.env.DBUS_SESSION_BUS_ADDRESS &&
      process.env.XDG_RUNTIME_DIR === path.join(installedHome, 'runtime'), 'Installed smoke requires its disposable D-Bus session and runtime directory');
  }
  const out = path.resolve(resultsFolder);
  fs.mkdirSync(out, { recursive: true });
  const report = path.join(out, `smoke-${display}.json`);
  const evidence = claimEvidence(report);
  const record = { platform: process.platform, host: `${os.type()} ${os.release()} ${os.arch()}`, display, checks: {} };
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-linux-smoke-'));
  const caseDir = path.join(scratch, 'case');
  const fixture = new NativeFixture();
  try {
    assert.equal(process.platform, 'linux');
    record.uid = process.getuid();
    assert.notEqual(record.uid, 0, 'Run the browser as an ordinary user');
    const ubuntu = /^ID="?ubuntu"?$/m.test(fs.readFileSync('/etc/os-release', 'utf8'));
    if (!installed || ubuntu) {
      record.restrictUnprivilegedUserns = fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim();
      assert.equal(record.restrictUnprivilegedUserns, '1', 'Ubuntu must restrict unprivileged user namespaces');
    }
    if (display === 'wayland') {
      delete process.env.DISPLAY;
      assert.equal(installed ? path.basename(process.env.WAYLAND_DISPLAY ?? '') : process.env.WAYLAND_DISPLAY, 'wayland-blanc');
    } else {
      assert.ok(process.env.DISPLAY, 'X11 needs a DISPLAY');
    }
    fixture.extraArgs = [`--ozone-platform=${display}`];
    const meta = installed ? metadata : path.resolve(candidateFolder, 'candidate.json');
    const candidate = JSON.parse(fs.readFileSync(meta, 'utf8'));
    const config = installed ? installedRuntime(installed, meta) : runtimeConfig(path.dirname(meta), candidate);
    Object.assign(record, { candidate: config.candidate, version: candidate.version, treeCommit: candidate.treeCommit });
    if (installed) {
      record.installed = {executable: installed, sha256: config.executableSha256};
    }
    await fixture.launch(config, caseDir, { testHooks: true, diskAssets: config.diskAssets, installedHome });
    record.checks.launched = true;
    record.browserPid = fixture.process.pid;
    if (installed && ubuntu) {
      const status = JSON.parse(execFileSync('sudo', ['-n', 'aa-status', '--json'], {encoding:'utf8'}));
      assert.ok(Object.hasOwn(status.profiles, 'blanc-prototype'), 'Package AppArmor profile must be loaded');
      const attachment = fs.readFileSync('/etc/apparmor.d/blanc-prototype', 'utf8');
      assert.match(attachment, /^profile blanc-prototype \/opt\/bnfy\/blanc-prototype\/chrome /m);
      const label = fs.readFileSync(`/proc/${record.browserPid}/attr/current`, 'utf8').trim();
      assert.match(label, /^blanc-prototype(?: |$)/, 'Installed browser must run under its own profile');
      record.installed.apparmor = {profile: 'blanc-prototype', mode: status.profiles['blanc-prototype'], label};
    }
    // Container root may lack ptrace permission to read a renderer's ns link.
    // NSpid still exposes each nested PID namespace from this procfs mount.
    const nsPids = pid => fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^NSpid:\s*(.+)$/m)[1].trim().split(/\s+/).map(Number);
    const useLinks = !installed || ubuntu;
    record.browserNamespace = useLinks ? pidNamespace(record.browserPid) : nsPids(record.browserPid);
    const pids = rendererPids(record.browserPid);
    assert.ok(pids.length, 'No renderer descended from the launched browser');
    record.renderers = pids.map(pid => {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      return { pid, seccomp: /^Seccomp:\t(\d+)$/m.exec(status)?.[1], namespace: useLinks ? pidNamespace(pid) : nsPids(pid) };
    });
    for (const renderer of record.renderers) {
      assert.equal(renderer.seccomp, '2', `Renderer ${renderer.pid} must use seccomp filtering`);
      if (useLinks) assert.notEqual(renderer.namespace, record.browserNamespace, `Renderer ${renderer.pid} shares the browser PID namespace`);
      else assert.ok(renderer.namespace.length > record.browserNamespace.length, 'Renderer must use a nested PID namespace');
    }
    record.checks.rendererSandbox = true;

    const { product, userAgent } = await fixture.browser.send('Browser.getVersion');
    Object.assign(record, { product, userAgent });
    await installDriver(fixture.host);
    assert.equal((await nativeCall(fixture.host, 'capabilities')).testHooks, true, 'Preview test hooks');
    record.checks.testHooks = true;
    await assertRendering(expression => fixture.host.eval(expression));
    record.checks.islandDraws = true;
    await waitFor(fixture.snapshot, snapshot => snapshot.blockerHealth === 'ready' &&
      snapshot.tabs.some(tab => tab.url === fixture.base + '/initial' && !tab.isLoading), 'blocker ready and page loaded');
    record.checks.blockerReady = true;
    assert.equal(await fixture.page.eval('document.title'), 'Native test fixture');
    record.checks.pageLoaded = true;
    for (const [name, target] of [['island', fixture.host], ['page', fixture.page]]) {
      const { data } = await target.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, `${name}-${display}.png`), Buffer.from(data, 'base64'));
    }
    if (inspect) await inspect(fixture);
  } catch (error) {
    record.error = String(error.stack || error);
  } finally {
    try { record.exit = await fixture.close(); } catch (error) { record.closeError = String(error); }
    const log = path.join(caseDir, 'browser.log');
    if (fs.existsSync(log)) fs.copyFileSync(log, path.join(out, `browser-${display}.log`));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  record.pass = !record.error && !record.closeError && record.exit?.code === 0;
  const json = JSON.stringify(record, null, 2);
  evidence.write(json + '\n');
  evidence.close();
  console.log(json);
  if (!record.pass) throw Error(record.error ?? record.closeError ?? 'Browser exited abnormally');
  return record;
}

export function standaloneInstalled(args, parent = process.env, run = execFileSync) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-session-'));
  try {
    const env = sessionEnvironment(path.join(scratch, 'home'), parent);
    // Keep access to the selected display when HOME and XDG_RUNTIME_DIR change.
    if (env.WAYLAND_DISPLAY && !path.isAbsolute(env.WAYLAND_DISPLAY) && parent.XDG_RUNTIME_DIR) {
      env.WAYLAND_DISPLAY = path.join(parent.XDG_RUNTIME_DIR, env.WAYLAND_DISPLAY);
    }
    if (env.DISPLAY && !env.XAUTHORITY && parent.HOME) env.XAUTHORITY = path.join(parent.HOME, '.Xauthority');
    run('dbus-run-session', ['--', process.execPath, fileURLToPath(import.meta.url), '--in-private-session', ...args],
      {env, stdio: 'inherit'});
  } finally { fs.rmSync(scratch, {recursive: true, force: true}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const privateSession = process.argv[2] === '--in-private-session';
  const args = process.argv.slice(privateSession ? 3 : 2);
  const {values, positionals} = parseArgs({args, allowPositionals:true, options:{
    display:{type:'string'}, installed:{type:'string'}, metadata:{type:'string'},
  }});
  if (!['x11','wayland'].includes(values.display) || !!values.installed !== !!values.metadata ||
      positionals.length !== (values.installed ? 1 : 2)) {
    throw Error('Usage: linux-smoke.mjs --display=x11|wayland (CANDIDATE_DIR | --installed=EXE --metadata=FILE) RESULTS_DIR');
  }
  if (values.installed && !privateSession) {
    assert.equal(process.platform, 'linux', 'Installed smoke requires Linux');
    standaloneInstalled(args);
  } else {
    await runSmoke({...values, installedHome: values.installed && process.env.HOME, candidateFolder:positionals[0], resultsFolder:positionals.at(-1)});
  }
}
