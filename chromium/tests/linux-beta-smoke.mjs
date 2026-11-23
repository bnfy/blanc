#!/usr/bin/env node
// Installed beta, as an ordinary user on a runner with a display:
// linux-beta-smoke.mjs VERSION RESULT.json [--package=DEB_OR_RPM --references=DIR]
// With a package, also emit the scan, header and installed payload evidence
// consumed by the release's build-check. No development bundle is supplied.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { connect, pause, waitFor } from './lib/cdp.mjs';
import { TEST_SWITCHES, hasCString } from '../release/hooks-evidence.mjs';
import { PROBES } from '../release/blocker-evidence.mjs';

const executable = '/opt/bnfy/blanc-beta/chrome';
const strings = ['blancTest', ...TEST_SWITCHES];
const overlap = Math.max(...strings.map(s => s.length)) + 2;
const probe = PROBES[0]; // ||ad.doubleclick.net^ in the pinned EasyList

export function verifySmoke(e) {
  assert.ok(e.system, 'missing Linux distribution');
  if (e.system === 'ubuntu') {
    assert.equal(e.restrictUnprivilegedUserns, '1', 'Ubuntu must restrict unprivileged user namespaces');
    assert.ok(['enforce', 'unconfined'].includes(e.apparmor?.mode), 'the beta AppArmor profile must be loaded');
    assert.equal(e.apparmor.attachment, executable, 'the AppArmor profile must attach to the installed beta');
    assert.match(e.apparmor.label, /^blanc-beta(?: |$)/, 'the browser must run under the beta AppArmor profile');
  }
  assert.equal(e.testSwitchFound, false, 'installed binary contains a compiled test hook');
  assert.equal(e.controlHit, true, 'loopback server did not receive the control request');
  assert.equal(e.controlLoaded, true, 'browser did not load the control response');
  assert.equal(e.blockedHit, false, 'server received the EasyList request');
  assert.equal(e.blockedError, 'net::ERR_BLOCKED_BY_CLIENT', 'listed request must be refused by the browser');
  assert.ok(e.browserNamespace && e.renderers?.length, 'missing renderer sandbox evidence');
  for (const r of e.renderers) {
    assert.equal(r.seccomp, '2', 'renderer must use seccomp');
    assert.ok(r.namespace && r.namespace !== e.browserNamespace, 'renderer shares the browser PID namespace');
  }
}

async function binaryIdentity() {
  const digest = createHash('sha256');
  let tail = Buffer.alloc(0), testSwitchFound = false;
  for await (const chunk of fs.createReadStream(executable, { highWaterMark: 1024 * 1024 })) {
    digest.update(chunk);
    const bytes = Buffer.concat([tail, chunk]);
    testSwitchFound ||= strings.some(name => hasCString(bytes, name));
    tail = bytes.subarray(-overlap);
  }
  return { exeSha256: digest.digest('hex'), testSwitchFound };
}

function namespace(pid) {
  const file = '/proc/' + pid + '/ns/pid';
  try { return fs.readlinkSync(file); }
  catch (error) {
    if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
    // As in the preview smoke, use sudo only for this procfs read if
    // a non-dumpable renderer hides the symlink from its owner.
    return execFileSync('sudo', ['-n', '/usr/bin/readlink', file], { encoding: 'utf8' }).trim();
  }
}
async function sandbox(browser) {
  const { processInfo } = await browser.send('SystemInfo.getProcessInfo');
  const browserPid = processInfo.find(p => p.type.toLowerCase() === 'browser').id;
  assert.equal(fs.realpathSync('/proc/' + browserPid + '/exe'), executable);
  const system = /^ID=["']?([a-z0-9._-]+)["']?$/m.exec(fs.readFileSync('/etc/os-release', 'utf8'))?.[1];
  let apparmor, restrictUnprivilegedUserns;
  if (system === 'ubuntu') {
    restrictUnprivilegedUserns = fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim();
    const {profiles} = JSON.parse(execFileSync('sudo', ['-n', 'aa-status', '--json'], {encoding: 'utf8'}));
    const profile = fs.readFileSync('/etc/apparmor.d/blanc-beta', 'utf8');
    apparmor = {
      mode: profiles['blanc-beta'], attachment: /^profile blanc-beta (\S+) /m.exec(profile)?.[1],
      label: fs.readFileSync('/proc/' + browserPid + '/attr/current', 'utf8').trim()
    };
  }
  const pids = processInfo.filter(p => p.type.toLowerCase() === 'renderer').map(p => p.id);
  const ids = [browserPid, ...pids];
  const statuses = ids.map(pid => fs.readFileSync('/proc/' + pid + '/status', 'utf8'));
  const depths = statuses.map(s => /^NSpid:\s*(.+)$/m.exec(s)?.[1].trim().split(/\s+/).length);
  // Ubuntu, Debian and Fedora expose the namespace hierarchy. Fall back to
  // the existing hosted runner readlink check if procfs omits it.
  const namespaces = depths.every(Boolean) ? depths : ids.map(namespace);
  return {
    system, ...(system === 'ubuntu' && {restrictUnprivilegedUserns, apparmor}),
    browserNamespace: namespaces[0], renderers: pids.map((pid, i) => ({
      pid, seccomp: /^Seccomp:\s*(\d+)$/m.exec(statuses[i + 1])?.[1], namespace: namespaces[i + 1]
    }))
  };
}

async function run(version) {
  assert.equal(process.platform, 'linux'); assert.notEqual(process.getuid(), 0, 'launch as an ordinary user');
  assert.equal(execFileSync(executable, ['--product-version'], { encoding: 'utf8' }).trim(), version);
  const identity = await binaryIdentity(), hits = new Set();
  const server = http.createServer((req, res) => {
    hits.add(req.headers.host + ' ' + req.url);
    res.writeHead(200, { 'Content-Type': req.url === '/' ? 'text/html' : 'text/plain', 'Cache-Control': 'no-store' });
    res.end(req.url === '/' ? '<title>Linux beta smoke</title>' : 'control loaded');
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-beta-smoke-'));
  let child, exited, browser, page;
  try {
    await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    const port = server.address().port, host = 'blanc-smoke.test', base = 'http://' + host + ':' + port;
    const listed = 'http://' + probe.host + ':' + port + probe.path;
    child = spawn(executable, ['--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
      '--disable-background-networking', '--no-proxy-server', '--host-resolver-rules=MAP ' + host + ' 127.0.0.1, MAP ' + probe.host + ' 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    base + '/'], { env: { ...process.env, HOME: dir, XDG_CONFIG_HOME: path.join(dir, 'config') }, stdio: 'ignore' });
    await once(child, 'spawn');
    exited = once(child, 'exit');
    const debug = await waitFor(() => fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0], p => /^\d+$/.test(p), 'installed beta debug port');
    const api = 'http://127.0.0.1:' + debug + '/json/';
    browser = await connect(await (await fetch(api + 'version')).json());
    const targets = await waitFor(async () => await (await fetch(api + 'list')).json(), ts => ts.some(t => t.url === base + '/'), 'installed page');
    page = await connect(targets.find(t => t.url === base + '/'));
    await page.send('Network.enable');
    // The launch's own navigation can end on an error page that keeps the URL
    // (the blocker may still be starting), so a fetch from it fails. Require
    // the smoke page itself, navigating again if needed.
    // A navigation can wait while the blocker starts (run 45071338278 timed out
    // in Page.navigate on a busy runner), so a slow or failed attempt is noted
    // and retried, for up to about three minutes in all.
    const where = async () => { try { return await page.eval('location.href + " | " + document.title'); } catch (e) { return 'unreadable: ' + e.message; } };
    let landed = await where();
    for (let attempt = 0; attempt < 6 && !landed.endsWith('| Linux beta smoke'); attempt++) {
      try { await page.send('Page.navigate', {url: base + '/'}, 30000); } catch (e) { landed = 'navigate: ' + e.message; }
      await pause(2000);
      landed = await where();
    }
    assert.ok(landed.endsWith('| Linux beta smoke'), 'installed beta never loaded the smoke page: ' + landed);
    let request, blockedError;
    page.on('Network.requestWillBeSent', e => { if (e.request.url === listed) request = e.requestId; });
    page.on('Network.loadingFailed', e => { if (e.requestId === request) blockedError = e.errorText; });
    // Absolute: the attached page's document needn't carry the server's base URL.
    const controlLoaded = await page.eval('fetch(' + JSON.stringify(base + '/control') + ').then(r=>r.text()).then(s=>s===\'control loaded\')');
    await page.eval('fetch(' + JSON.stringify(listed) + ',{mode:"no-cors"}).then(()=>true,()=>false)');
    await waitFor(() => blockedError || hits.has(probe.host + ':' + port + ' ' + probe.path), Boolean, 'listed request outcome');
    const report = {
      ...identity, version, controlLoaded, controlHit: hits.has(host + ':' + port + ' /control'),
      blockedHit: hits.has(probe.host + ':' + port + ' ' + probe.path), blockedError, ...await sandbox(browser)
    };
    verifySmoke(report);
    return report;
  } finally {
    if (browser) await browser.send('Browser.close', {}, 3000).catch(() => { });
    page?.close(); browser?.close();
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      try { await exited; } finally { clearTimeout(timer); }
    }
    server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
export async function packageCheck(file, version, installedSha256, references) {
  const fingerprint = /^Fingerprint: ([A-F0-9]{40})$/m.exec(fs.readFileSync(path.join(references, 'repository.md'), 'utf8'))?.[1];
  assert.ok(fingerprint, 'missing pinned repository fingerprint');
  const { scanPackage } = await import('../linux/package-scan.mjs');
  const scan = await scanPackage(file, { fingerprint, noticesDir: references });
  assert.deepEqual(scan.findings, []); assert.equal(scan.ok, true);
  const name = path.basename(file), deb = name.endsWith('.deb');
  const command = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  const header = deb ? ['Package', 'Version', 'Architecture'].map(field => command('dpkg-deb', ['-f', file, field])) :
    command('rpm', ['-qp', '--qf', '%{NAME}\n%{VERSION}-%{RELEASE}\n%{ARCH}', file]).split('\n');
  assert.deepEqual(header, ['blanc-beta', version + '-1', deb ? ({ x64: 'amd64', arm64: 'arm64' })[process.arch] : ({ x64: 'x86_64', arm64: 'aarch64' })[process.arch]]);
  // The installer strips chrome. Bind the executable we launched to the bytes
  // in this package, not to the unstripped executable in the candidate tar.
  const member = './opt/bnfy/blanc-beta/chrome';
  const extract = deb ? 'dpkg-deb --fsys-tarfile "$1" | tar -xOf - "$2"' :
    'rpm2cpio "$1" | cpio --quiet -i --to-stdout "$2"';
  const exeSha256 = command('bash', ['-o', 'pipefail', '-c', extract + ' | sha256sum', 'check-package', file, member]).split(/\s+/)[0];
  assert.equal(exeSha256, installedSha256, 'installed executable differs from the selected package');
  const hash = createHash('sha256');
  for await (const bytes of fs.createReadStream(file)) hash.update(bytes);
  return { file: name, sha256: hash.digest('hex'), exeSha256, fingerprint, header, scan: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [v, out, pkg, refs, ...extra] = process.argv.slice(2);
  try {
    assert.ok(/^\d+\.\d+\.\d+\.\d+$/.test(v) && out &&
      (pkg === undefined || (/^--package=.+/.test(pkg) && /^--references=.+/.test(refs))) && !extra.length,
      'Usage: linux-beta-smoke.mjs VERSION RESULT.json [--package=DEB_OR_RPM --references=DIR]');
    const result = await run(v);
    if (pkg) result.package = await packageCheck(path.resolve(pkg.slice(10)), v, result.exeSha256, path.resolve(refs.slice(13)));
    fs.writeFileSync(out, JSON.stringify({ ...result, arch: process.arch, pass: true }, null, 2) + '\n', { flag: 'wx' });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
