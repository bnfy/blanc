// Disposable native CI only. Records kernel evidence and synthetic loopback requests.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { parseBlancProcess } from './linux-sandbox-evidence.js';
if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('disposable Linux CI only');
const image = path.resolve(process.argv[2]);
const extracted = path.resolve(process.argv[3]);
const evidence = path.resolve('sandbox-evidence');
fs.mkdirSync(evidence, { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let requests = 0;
const server = http.createServer((req, res) => { requests++; res.end('synthetic sandbox fixture'); });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/sandbox-fixture`;
const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
const nested = path.join(evidence, 'nested-launcher.sh');
fs.writeFileSync(nested, `#!/bin/sh\nexec ${quote(image)} "$@"\n`, { mode: 0o700 });
function processes() {
  return spawnSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' }).stdout.split('\n').flatMap((line) => {
    const record = parseBlancProcess(line);
    return record ? [record] : [];
  });
}
function inspect(proc) {
  let status = '';
  try { status = fs.readFileSync(`/proc/${proc.pid}/status`, 'utf8'); } catch {}
  const namespaces = {};
  for (const kind of ['user', 'pid', 'net']) {
    const read = spawnSync('sudo', ['-n', 'readlink', `/proc/${proc.pid}/ns/${kind}`], { encoding: 'utf8' });
    namespaces[kind] = read.status === 0 ? read.stdout.trim() : null;
  }
  return { pid: proc.pid, type: proc.type, namespaces, seccomp: status.match(/^Seccomp:\s*(\d+)/m)?.[1], noNewPrivs: status.match(/^NoNewPrivs:\s*(\d+)/m)?.[1] };
}
async function observe(method, expected, flag = null) {
  const label = `${method}-${expected}-${flag ?? 'default'}`.replaceAll(/[^a-zA-Z0-9_-]/g, '_');
  const profile = path.join(evidence, label);
  if (process.env.BLANC_UBLOCK_SANDBOX_CANDIDATE === '1') {
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
      onboardingVersion: 1, adblockProvider: 'ublock-origin', adblockEnabled: true,
      searchSuggestions: false, usagePing: false, onePasswordEnabled: false,
    }));
  }
  const flags = [`--user-data-dir=${profile}`, '--disable-gpu', ...(flag ? [flag] : []), url];
  let executable = method === 'extracted' ? extracted : method === 'nested' ? nested : image;
  let args = flags;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (method === 'menu') {
    const data = path.join(evidence, 'xdg');
    fs.mkdirSync(path.join(data, 'applications'), { recursive: true });
    const entry = fs.readFileSync(path.join(path.dirname(extracted), 'blanc.desktop'), 'utf8');
    const exec = [image, ...flags].map((arg) => `"${arg.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(' ');
    fs.writeFileSync(path.join(data, 'applications', 'blanc-audit.desktop'), entry.replace(/^Exec=.*$/m, `Exec=${exec}`));
    env.XDG_DATA_HOME = data;
    executable = 'gtk-launch'; args = ['blanc-audit'];
  }
  const before = requests;
  const output = [];
  const launcher = spawn(executable, args, { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [launcher.stdout, launcher.stderr]) stream.on('data', (data) => output.push(String(data)));
  try {
    const deadline = Date.now() + (expected === 'allowed' ? 45000 : 5000);
    while (Date.now() < deadline) {
      if (expected === 'allowed' && requests > before && processes().filter((p) => p.type === 'renderer').length >= 2) break;
      await pause(250);
    }
    await pause(1000);
    const records = processes().map(inspect);
    const browser = records.find((p) => p.type === 'browser');
    const renderers = records.filter((p) => p.type === 'renderer');
    const sandboxed = renderers.filter((p) => p.seccomp === '2' && p.noNewPrivs === '1' && ['user', 'pid'].every((kind) => p.namespaces[kind] && browser?.namespaces[kind] && p.namespaces[kind] !== browser.namespaces[kind]));
    const result = { label, expected, selectedProvider: process.env.BLANC_UBLOCK_SANDBOX_CANDIDATE === '1' ? 'ublock-origin' : 'blanc', browsingRequests: requests - before, records, renderers: renderers.length, sandboxed: sandboxed.length, launcherOutput: output.join('').slice(-5000) };
    fs.writeFileSync(path.join(evidence, `${label}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, records: undefined, launcherOutput: undefined }));
    if (expected === 'allowed') { assert.ok(requests > before, 'selected provider permits fixture navigation'); assert.ok(renderers.length >= 2); assert.equal(sandboxed.length, renderers.length); }
    else { assert.equal(renderers.length, 0); assert.equal(requests - before, 0); }
  } finally {
    for (const p of processes()) { try { process.kill(p.pid, 'SIGKILL'); } catch {} }
    try { process.kill(-launcher.pid, 'SIGKILL'); } catch {}
    await pause(500);
  }
}
try {
  // Disable namespace creation only in this disposable runner. Launcher fallback
  // must refuse browser initialization; extracted Electron may refuse even earlier.
  const restricted = spawnSync('sudo', ['sysctl', '-w', 'user.max_user_namespaces=0'], { encoding: 'utf8' });
  assert.equal(restricted.status, 0);
  for (const method of ['direct', 'menu', 'nested', 'extracted']) await observe(method, 'refused');
  assert.equal(spawnSync('bash', ['scripts/ci-enable-linux-sandbox.sh'], { stdio: 'inherit' }).status, 0);
  for (const method of ['direct', 'menu', 'nested', 'extracted']) await observe(method, 'allowed');
  const { UNSAFE_SANDBOX_SWITCHES } = await import('../src/main/linux-sandbox-launch.js');
  for (const name of UNSAFE_SANDBOX_SWITCHES) {
    for (const flag of [`--${name}`, `-${name}`, `--${name}=false`]) await observe('direct', 'refused', flag);
  }
  await observe('direct', 'allowed', '--no-sandbox-helper');
} finally { server.close(); }
