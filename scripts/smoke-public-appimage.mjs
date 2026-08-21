#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const [artifactArg, expectedVersion] = process.argv.slice(2);

if (!artifactArg || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(expectedVersion ?? '')) {
  console.error('usage: node scripts/smoke-public-appimage.mjs <AppImage> <version>');
  process.exit(2);
}
if (process.platform !== 'linux') {
  console.error('public AppImage launch smoke must run on Linux');
  process.exit(2);
}

const artifact = path.resolve(artifactArg);
const profileDir = await mkdtemp(path.join(os.tmpdir(), 'blanc-appimage-smoke-'));
const port = Number(process.env.BLANC_APPIMAGE_CDP_PORT || 9222);
const logs = [];
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn('xvfb-run', [
  '-a',
  artifact,
  `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${port}`,
  '--disable-gpu',
], {
  detached: true,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    logs.push(chunk);
    if (logs.length > 200) logs.shift();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(timeoutMs) {
  if (child.exitCode !== null) return true;
  return Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(timeoutMs).then(() => false),
  ]);
}

async function stopApp() {
  if (child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (_) {
    return;
  }
  if (await waitForExit(5000)) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (_) {
    // The process group may have completed between the wait and the signal.
  }
  await waitForExit(2000);
}

async function readPageText(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('timed out reading the new-tab DOM over CDP'));
    }, 10000);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: 'document.body.innerText',
          returnByValue: true,
        },
      }));
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result?.result?.value ?? '');
    });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('CDP WebSocket failed'));
    });
  });
}

try {
  let targets;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`AppImage exited before CDP became ready (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const candidate = await response.json();
        const urls = candidate.map((target) => target.url);
        if (urls.includes('blanc-chrome://index/') && urls.some((url) => url.startsWith('blanc://newtab/'))) {
          targets = candidate;
          break;
        }
      }
    } catch (_) {
      // Chromium has not opened its debugging endpoint yet.
    }
    await delay(500);
  }

  if (!targets) throw new Error('AppImage did not expose Blanc chrome and new-tab targets within 60s');
  const newTab = targets.find((target) => target.url.startsWith('blanc://newtab/'));
  const bodyText = await readPageText(newTab.webSocketDebuggerUrl);
  if (!bodyText.includes(`v${expectedVersion}`)) {
    throw new Error(`new-tab surface did not report v${expectedVersion}`);
  }

  console.log(JSON.stringify({
    artifact,
    expectedVersion,
    pid: child.pid,
    targets: targets.map((target) => target.url).sort(),
    versionMarker: `v${expectedVersion}`,
  }, null, 2));
} catch (error) {
  const captured = logs.join('').trim();
  if (captured) console.error(`\nAppImage output:\n${captured}`);
  throw error;
} finally {
  await stopApp();
  await rm(profileDir, { recursive: true, force: true });
}
