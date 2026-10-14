import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Packaged regression for tab views that stop drawing on Linux once they have
// left their window (src/main/tab-view-lifecycle.js), run against the real
// AppImage in the native Linux workflow. It drives only user-level input over
// raw DevTools protocol. support/packaged-cdp.mjs connects through Playwright,
// which turns on focus emulation for every page; that keeps a stuck page
// drawing and hides this bug.
//
// Paths: the page active at launch and the other page shown for the first time
// (controls); Ctrl+Tab back to the first page; and the other page woken after
// /sleep quieted it, keeping its session storage. Each must report "visible",
// draw at least MIN_FRAMES animation frames in 700 ms (a working page draws
// about 42 at 60 Hz; a stuck one never drew more than 17), and move at least
// 350 px for a 400 px wheel scroll.
//
//   BLANC_PACKAGED_EXECUTABLE=<AppImage or unpacked binary> \
//     xvfb-run -a node test/desktop/packaged-tab-view-drawing-smoke.mjs

const require = createRequire(import.meta.url);
const fixtures = require('./support/fixtures-server.js');

const executable = process.env.BLANC_PACKAGED_EXECUTABLE;
if (!executable || !fs.existsSync(executable)) {
  console.error('Set BLANC_PACKAGED_EXECUTABLE to a packaged Blanc binary or AppImage.');
  process.exit(1);
}

const MIN_FRAMES = 25;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

async function waitFor(read, label, ms = 30_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    try { const value = await read(); if (value) return value; } catch {}
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(250);
  }
}

const server = await fixtures.start();
const port = new URL(server.base).port;
// Two hosts, so the pages are different sites with their own renderers; Quiet
// Tabs keeps session storage only for a renderer no other page shares.
const pageA = `http://127.0.0.1:${port}/site/drawing-a`;
const pageB = `http://localhost:${port}/site/drawing-b`;
const hostOf = (url) => new URL(url).hostname;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-packaged-drawing-'));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  adblockEnabled: false, onboardingVersion: 1, searchSuggestions: false, usagePing: false,
}, null, 2));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const child = spawn(executable, ['--remote-debugging-port=0', `--user-data-dir=${profile}`, pageA, pageB], {
  env: { ...env, BLANC_TEST: '0' },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });
child.once('error', (error) => { output += `${error}\n`; });

let socket;
let nextId = 1;
const pending = new Map();
function send(method, params = {}, sessionId) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.delete(id)) reject(new Error(`${method} timed out`)); }, 8000);
  });
}
// Blanc consumes its shortcuts in the main process, and a tab switch can hide
// the page an event was sent to, so input events are never awaited; callers
// check the effect instead.
const dispatch = (method, params, sessionId) => { send(method, params, sessionId).catch(() => {}); };

const sessions = new Map();
async function sessionFor(match) {
  const { targetInfos } = await send('Target.getTargets');
  const target = targetInfos.find((info) => info.type === 'page' && match(info.url));
  if (!target) return null;
  if (!sessions.has(target.targetId)) {
    const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    sessions.set(target.targetId, sessionId);
  }
  return sessions.get(target.targetId);
}
async function evaluate(sessionId, expression) {
  const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.text);
  return reply.result.value;
}
const page = (url) => sessionFor((candidate) => candidate === url);
const chrome = () => sessionFor((url) => url.startsWith('blanc-chrome://index/'));
const activeHost = async () => evaluate(await chrome(), `document.getElementById('pillDomain')?.textContent || ''`);

async function key(sessionId, keyName, code, keyCode, modifiers = 0) {
  const event = { key: keyName, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers };
  dispatch('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event }, sessionId);
  await sleep(50);
  dispatch('Input.dispatchKeyEvent', { type: 'keyUp', ...event }, sessionId);
}
// The page that has the keyboard: one of the two, or the blank tab Blanc
// opens next to the launch URLs.
async function activeSession() {
  const host = await activeHost();
  if (host.includes(hostOf(pageA))) return page(pageA);
  if (host.includes(hostOf(pageB))) return page(pageB);
  return sessionFor((url) => url.startsWith('blanc://newtab'));
}
async function showTab(url) {
  for (let press = 0; press < 4; press++) {
    if ((await activeHost()).includes(hostOf(url))) return;
    await key(await activeSession(), 'Tab', 'Tab', 9, 2); // Ctrl+Tab
    await sleep(900);
  }
  if (!(await activeHost()).includes(hostOf(url))) throw new Error(`Ctrl+Tab never showed ${url}`);
}

const FRAME_PROBE = `new Promise((resolve) => {
  let frames = 0;
  let live = true;
  const step = () => { if (!live) return; frames += 1; requestAnimationFrame(step); };
  requestAnimationFrame(step);
  setTimeout(() => { live = false; resolve({ visibility: document.visibilityState, frames }); }, 700);
})`;
async function measure(url, label) {
  const result = { label };
  try {
    const sessionId = await page(url);
    for (let attempt = 0; attempt < 3; attempt++) {
      result.sample = await evaluate(sessionId, FRAME_PROBE);
      if (result.sample.visibility === 'visible' && result.sample.frames >= MIN_FRAMES) break;
    }
    const before = await evaluate(sessionId, 'Math.round(scrollY)');
    dispatch('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 200, y: 200, deltaX: 0, deltaY: 400 }, sessionId);
    const deadline = Date.now() + 1500;
    do {
      await sleep(100);
      result.scrolled = (await evaluate(sessionId, 'Math.round(scrollY)')) - before;
    } while (result.scrolled < 350 && Date.now() < deadline);
    result.drawing = result.sample.visibility === 'visible' && result.sample.frames >= MIN_FRAMES && result.scrolled >= 350;
  } catch (error) {
    result.error = String(error?.message ?? error);
    result.drawing = false;
  }
  results.push(result);
}
const loadCount = async (url) => Number(await evaluate(await page(url), `sessionStorage.getItem('acceptance-load-count')`));

let failure = null;
try {
  const endpoint = await waitFor(() => output.match(/DevTools listening on (ws:\/\/\S+)/)?.[1], 'the DevTools endpoint');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const request = message.id && pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };

  for (const url of [pageA, pageB]) {
    await waitFor(async () => (await evaluate(await page(url), 'document.readyState')) === 'complete', `${url} to load`, 60_000);
  }
  await waitFor(async () => /127\.0\.0\.1|localhost/.test(await activeHost()), 'the Island to show the active page');
  const first = (await activeHost()).includes('localhost') ? pageB : pageA;
  const other = first === pageA ? pageB : pageA;

  await measure(first, 'page active at launch (control)');
  await showTab(other);
  await measure(other, 'other page, first shown (control)');
  await showTab(first);
  await measure(first, 'switched back with Ctrl+Tab');

  // /sleep in the ⌘L panel quiets every eligible background tab now.
  const loadsBefore = await loadCount(other);
  await key(await activeSession(), 'l', 'KeyL', 76, 2); // Ctrl+L
  const overlay = await waitFor(() => sessionFor((url) => url.startsWith('blanc-chrome://overlay/')), 'the ⌘L panel');
  await sleep(600);
  await send('Input.insertText', { text: '/sleep' }, overlay);
  await sleep(300);
  await key(overlay, 'Enter', 'Enter', 13);
  await sleep(2500);
  await key(overlay, 'Escape', 'Escape', 27);
  await sleep(800);
  await showTab(other);
  sessions.clear(); // the woken page runs in a new renderer
  await waitFor(async () => (await evaluate(await page(other), 'document.readyState')) === 'complete', 'the woken page to load');
  await sleep(1000);
  const loadsAfter = await loadCount(other);
  if (loadsAfter !== loadsBefore + 1) {
    throw new Error(`the background page was not quieted and reloaded with its session storage (load count ${loadsBefore} → ${loadsAfter})`);
  }
  await measure(other, 'woken after /sleep, session storage kept');
} catch (error) {
  failure = String(error?.stack ?? error);
} finally {
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  await server.close();
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    console.error(`left ${profile} behind: ${error.code ?? error.message}`);
  }
}

for (const result of results) {
  console.log(`${result.drawing ? 'ok  ' : 'FAIL'} ${result.label}: ${result.sample?.visibility ?? '-'}, ` +
    `${result.sample?.frames ?? '-'} frames in 700 ms, scrolled ${result.scrolled ?? '-'} px` +
    (result.error ? ` (${result.error})` : ''));
}
const failed = results.filter((result) => !result.drawing);
if (failure || failed.length || results.length !== 4) {
  if (failure) console.error(failure);
  if (failed.length) console.error(`${failed.length} packaged tab view(s) stopped drawing`);
  if (!failure && results.length !== 4) console.error(`${results.length} of 4 paths were measured`);
  console.error(output.split('\n').slice(-40).join('\n'));
  process.exit(1);
}
console.log('all 4 packaged tab views kept drawing and scrolling');
