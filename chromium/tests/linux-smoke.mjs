// node chromium/tests/linux-smoke.mjs --display=x11|wayland CANDIDATE_DIR RESULTS_DIR
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runtimeConfig } from '../linux/candidate.mjs';
import { NativeFixture } from './lib/fixture.mjs';
import { waitFor } from './lib/cdp.mjs';
import { assertNodeRuntime, assertRendering } from './lib/render-guard.mjs';
import { installDriver, nativeCall } from './lib/test-driver.mjs';

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

const [displayFlag, candidateFolder, resultsFolder, ...extra] = process.argv.slice(2);
const display = /^--display=(x11|wayland)$/.exec(displayFlag)?.[1];
if (!display || !candidateFolder || !resultsFolder || extra.length) {
  throw new Error('Usage: linux-smoke.mjs --display=x11|wayland CANDIDATE_DIR RESULTS_DIR');
}
assertNodeRuntime();
const directory = path.resolve(candidateFolder);
const out = path.resolve(resultsFolder);
fs.mkdirSync(out, { recursive: true });
const report = path.join(out, `smoke-${display}.json`);
if (fs.existsSync(report)) throw new Error(`Refusing to overwrite ${report}`);
const record = { platform: process.platform, host: `${os.type()} ${os.release()} ${os.arch()}`, display, checks: {} };
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-linux-smoke-'));
const caseDir = path.join(scratch, 'case');
const fixture = new NativeFixture();
try {
  assert.equal(process.platform, 'linux');
  record.uid = process.getuid();
  assert.notEqual(record.uid, 0, 'Run the browser as an ordinary user');
  record.restrictUnprivilegedUserns = fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim();
  assert.equal(record.restrictUnprivilegedUserns, '1', 'Ubuntu must restrict unprivileged user namespaces');
  if (display === 'wayland') {
    delete process.env.DISPLAY;
    assert.equal(process.env.WAYLAND_DISPLAY, 'wayland-blanc');
  } else {
    assert.ok(process.env.DISPLAY, 'X11 needs a DISPLAY');
  }
  fixture.extraArgs = [`--ozone-platform=${display}`];
  const candidate = JSON.parse(fs.readFileSync(path.join(directory, 'candidate.json'), 'utf8'));
  const config = runtimeConfig(directory, candidate);
  Object.assign(record, { candidate: config.candidate, version: candidate.version, treeCommit: candidate.treeCommit });
  await fixture.launch(config, caseDir, { testHooks: true, diskAssets: config.diskAssets });
  record.checks.launched = true;
  record.browserPid = fixture.process.pid;
  record.browserNamespace = pidNamespace(record.browserPid);
  const pids = rendererPids(record.browserPid);
  assert.ok(pids.length, 'No renderer descended from the launched browser');
  record.renderers = pids.map(pid => {
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    return { pid, seccomp: /^Seccomp:\t(\d+)$/m.exec(status)?.[1], namespace: pidNamespace(pid) };
  });
  for (const renderer of record.renderers) {
    assert.equal(renderer.seccomp, '2', `Renderer ${renderer.pid} must use seccomp filtering`);
    assert.notEqual(renderer.namespace, record.browserNamespace, `Renderer ${renderer.pid} shares the browser PID namespace`);
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
fs.writeFileSync(report, json + '\n');
console.log(json);
if (!record.pass) process.exitCode = 1;
