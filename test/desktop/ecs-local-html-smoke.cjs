'use strict';

// Raw default-world CDP only: Playwright's universal-access utility world is
// inappropriate for tests of file-origin isolation.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const dgram = require('node:dgram');
const { candidatePaths } = require('./ecs-candidate-paths.cjs');
const { extractFile } = require('@electron/asar');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { getCurrentFuseWire } = require('@electron/fuses');
const { withDiagnosticProfile } = require('../../scripts/drm-diagnostics.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect(target, onEvent = () => {}) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id) onEvent(message);
    const item = pending.get(message.id);
    if (item) {
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(Error(message.error.message)); else item.resolve(message.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  return { send, close: () => ws.close(), evaluate: async (fn, arg) => {
    const result = await send('Runtime.evaluate', {
      expression: `(${fn.toString()})(${JSON.stringify(arg) ?? ''})`, awaitPromise: true, returnByValue: true,
    });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  } };
}

async function targets(port) { return fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()); }
async function waitFor(fn, name, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const result = await fn(); if (result) return result; await delay(100); }
  throw Error(`Timed out waiting for ${name}`);
}
async function probe(page, urls) {
  return page.evaluate(async urls => {
    const fetchOne = async url => {
      try { const response = await fetch(url); return { ok: response.ok, text: (await response.text()).slice(0, 100) }; }
      catch (error) { return { ok: false, error: error.name }; }
    };
    const frame = (url, sandbox) => new Promise(resolve => {
      const node = document.createElement('iframe');
      if (sandbox !== null) node.setAttribute('sandbox', sandbox);
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        let result;
        try { result = { readable: !!node.contentWindow.document.querySelector('#secret') }; }
        catch (error) { result = { readable: false, error: error.name }; }
        node.remove(); resolve(result);
      };
      node.onload = finish; node.src = url; document.body.append(node); setTimeout(finish, 700);
    });
    const output = { url: location.href, inlineScriptRan: window.inlineScriptRan === true,
      nodeExposed: typeof require !== 'undefined' || typeof process !== 'undefined' };
    output.reads = await Promise.all(urls.reads.map(fetchOne));
    output.xhr = await new Promise(resolve => {
      const request = new XMLHttpRequest(); request.open('GET', urls.reads[2]); request.timeout = 1500;
      request.onload = () => resolve({ ok: true }); request.onerror = () => resolve({ ok: false });
      request.ontimeout = () => resolve({ ok: false });
      try { request.send(); } catch { resolve({ ok: false }); }
    });
    output.frames = await Promise.all([null, 'allow-scripts', 'allow-scripts allow-same-origin'].map(sandbox => frame(urls.frame, sandbox)));
    output.workers = [];
    for (const url of ['./sw.js', urls.worker]) {
      try { await navigator.serviceWorker.register(url); output.workers.push({ registered: true }); }
      catch (error) { output.workers.push({ registered: false, error: error.name }); }
    }
    try { output.controlled = !!navigator.serviceWorker?.controller; }
    catch (error) { output.controlled = false; output.workerAccessDenied = error.name; }
    output.egress = await fetchOne(urls.collect);
    output.beacon = false;
    try { output.beacon = navigator.sendBeacon(urls.collect, 'SYNTHETIC_ONLY'); } catch {}
    try { localStorage.setItem('probe', 'SYNTHETIC_ONLY'); output.storageAccessible = true; }
    catch { output.storageAccessible = false; }
    // CDP can execute trusted debugger code even with page JS disabled. The
    // untrusted inline fixture below, not debugger-created RTC, is the canary.
    output.visibleDocument = document.querySelector('#visible')?.textContent;
    return output;
  }, urls);
}
function verifyProbe(report) {
  assert.equal(report.inlineScriptRan, false, 'untrusted document scripts must not execute');
  assert.equal(report.visibleDocument, 'Selected document renders');
  assert.equal(report.nodeExposed, false);
  assert.ok(report.reads.every(result => !result.ok), 'no ungranted file/custom resource reads');
  assert.equal(report.xhr.ok, false);
  assert.ok(report.frames.every(result => !result.readable));
  assert.ok(report.workers.every(result => !result.registered));
  assert.equal(report.controlled, false);
  assert.equal(report.egress.ok, false);
  assert.equal(report.storageAccessible, false, 'document has an opaque origin');
}

async function inspectStatic(page) {
  const { root } = await page.send('DOM.getDocument', { depth: 1 });
  const { outerHTML } = await page.send('DOM.getOuterHTML', { nodeId: root.nodeId });
  const navigation = await page.send('Page.getNavigationHistory');
  const frameTree = await page.send('Page.getFrameTree');
  return { url: navigation.entries[navigation.currentIndex]?.url,
    visibleDocument: /<h1 id="visible">Selected document renders<\/h1>/.test(outerHTML),
    scriptMutationAbsent: !outerHTML.includes('<h1 id="visible">SCRIPT RAN</h1>'),
    rtcCanaryPresent: outerHTML.includes('RTCPeerConnection'),
    workerCanaryPresent: outerHTML.includes('serviceWorker.register'),
    readableFileFrame: (frameTree.frameTree.childFrames || []).some(frame => /^(file:|blanc-local-preview:)/.test(frame.frame.url)) };
}

async function clickStaticLink(page, selector) {
  const { root } = await page.send('DOM.getDocument', { depth: 1 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  const { model } = await page.send('DOM.getBoxModel', { nodeId });
  const x = (model.content[0] + model.content[4]) / 2;
  const y = (model.content[1] + model.content[5]) / 2;
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function run(appPath, output) {
  const app = await fs.realpath(appPath);
  execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
  const { full, executable } = candidatePaths(app);
  const previewModule = extractFile(path.join(app, 'Contents/Resources/app.asar'), full ? 'src/main/ecs-local-html.cjs' : 'ecs-local-html.cjs').toString();
  assert.match(previewModule, /javascript:\s*false/);
  assert.match(previewModule, /script-src 'none'/);
  assert.ok(!previewModule.includes('sandbox allow-scripts'));
  const wire = await getCurrentFuseWire(executable);
  assert.equal(wire[7], 49, 'exercise the enabled file-privileges fuse');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecs-html-smoke-'));
  let receipts = 0;
  let udpReceipts = 0;
  const udp = dgram.createSocket('udp4');
  udp.on('message', () => { udpReceipts++; });
  await new Promise(resolve => udp.bind(0, '127.0.0.1', resolve));
  const server = http.createServer((request, response) => {
    receipts++; request.resume(); response.setHeader('Access-Control-Allow-Origin', '*'); response.end('SYNTHETIC_ACK');
  });
  const evidence = { app, wire, reports: [] };
  try {
    await fs.mkdir(path.join(root, 'page')); await fs.mkdir(path.join(root, 'other'));
    const html = path.join(root, 'page/index.html');
    await fs.writeFile(path.join(root, 'page/neighbor.txt'), 'NEIGHBOR_CANARY');
    await fs.writeFile(path.join(root, 'parent.txt'), 'PARENT_CANARY');
    await fs.writeFile(path.join(root, 'other/data.json'), '{"canary":"OTHER_CANARY"}');
    await fs.writeFile(path.join(root, 'other/frame.html'), '<p id="secret">FRAME_CANARY</p>');
    await fs.writeFile(path.join(root, 'page/sw.js'), 'self.addEventListener("fetch",e=>e.respondWith(new Response("WORKER_CANARY")));');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const urls = {
      reads: ['neighbor.txt', '../parent.txt', pathToFileURL(path.join(root, 'other/data.json')).href,
        pathToFileURL(path.join(root, 'page/neighbor.txt')).href, pathToFileURL(path.join(root, 'parent.txt')).href],
      frame: pathToFileURL(path.join(root, 'other/frame.html')).href,
      worker: pathToFileURL(path.join(root, 'page/sw.js')).href,
      collect: `http://127.0.0.1:${server.address().port}/collect`,
      stun: `stun:127.0.0.1:${udp.address().port}`,
    };
    await fs.writeFile(html, `<!doctype html><title>Isolated HTML canary</title><h1 id="visible">Selected document renders</h1><a id="file-link" href="${urls.frame}">File</a><a id="network-link" href="${urls.collect}">Network</a><iframe src="${urls.frame}"></iframe><iframe sandbox="allow-scripts allow-same-origin" src="${urls.frame}"></iframe><img src="${urls.collect}"><script>window.inlineScriptRan=true;document.querySelector('#visible').textContent='SCRIPT RAN';for(const url of ${JSON.stringify(urls.reads)})fetch(url).catch(()=>{});navigator.serviceWorker.register(${JSON.stringify(urls.worker)}).catch(()=>{});(async()=>{const p=new RTCPeerConnection({iceServers:[{urls:'${urls.stun}'}]});p.createDataChannel('canary');await p.setLocalDescription(await p.createOffer());})()</script>`);
    await withDiagnosticProfile(async profile => {
      evidence.profile = profile;
      if (full) {
        await fs.writeFile(path.join(profile, 'ecs-candidate-profile.json'), JSON.stringify({ candidate: true }));
        await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ onboardingVersion: 1, firstRunCompletedAt: Date.now(), usagePing: false, searchSuggestions: false }));
      }
      for (let round = 0; round < 2; round++) {
        const port = 55821;
        const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env; void ignored;
        const child = spawn(executable, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], {
          env: { ...env, BLANC_DRM_DIAGNOSTIC_PROFILE: profile, BLANC_ECS_FULL_PROFILE: profile, BLANC_ECS_FULL_SMOKE: '1', BLANC_ECS_LOCAL_HTML: html }, stdio: ['ignore', 'pipe', 'pipe'],
        });
        const exited = new Promise(resolve => child.once('exit', resolve));
        let logs = ''; child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
        const sockets = [];
        try {
          const localTarget = await waitFor(async () => {
            if (child.exitCode !== null) throw Error(`Candidate exited: ${logs.slice(-1500)}`);
            try { return (await targets(port)).find(t => t.url.startsWith('blanc-local-preview:')); } catch { return null; }
          }, 'isolated local document');
          const page = await connect(localTarget); sockets.push(page);
          await page.send('DOM.enable');
          await waitFor(async () => (await inspectStatic(page)).visibleDocument, 'static document');
          await delay(1600);
          const report = await inspectStatic(page); evidence.reports.push({ phase: round ? 'restart' : 'initial', ...report });
          assert.ok(report.visibleDocument && report.scriptMutationAbsent && report.rtcCanaryPresent);
          assert.ok(report.workerCanaryPresent && !report.readableFileFrame);
          if (!round) {
            const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
            await fs.mkdir(path.dirname(output), { recursive: true });
            await fs.writeFile(path.join(path.dirname(output), 'local-preview.png'), Buffer.from(screenshot.data, 'base64'));
            await page.send('Page.reload');
            await waitFor(async () => (await inspectStatic(page)).visibleDocument, 'reload');
            await delay(1600);
            const reloaded = await inspectStatic(page); evidence.reports.push({ phase: 'reload', ...reloaded });
            assert.ok(reloaded.visibleDocument && reloaded.scriptMutationAbsent);
            assert.ok(reloaded.workerCanaryPresent && !reloaded.readableFileFrame);
          }
          const original = (await inspectStatic(page)).url;
          await clickStaticLink(page, '#file-link'); await delay(200);
          assert.equal((await inspectStatic(page)).url, original, 'file navigation denied');
          await clickStaticLink(page, '#network-link'); await delay(200);
          assert.equal((await inspectStatic(page)).url, original, 'network navigation denied');
          evidence.reports.at(-1).navigationDenied = true;
          if (full) await fs.writeFile(path.join(profile, 'ecs-smoke-quit'), 'quit');
          for (const target of full ? [] : (await targets(port)).filter(t => t.type === 'page')) {
            const socket = target.id === localTarget.id ? page : await connect(target);
            if (socket !== page) sockets.push(socket);
            await socket.send('Page.close').catch(() => {});
          }
          await Promise.race([exited, delay(10000).then(() => { throw Error('Candidate did not quit'); })]);
        } finally {
          if (child.exitCode === null) {
            if (full) await fs.writeFile(path.join(profile, 'ecs-smoke-quit'), 'quit');
            for (const target of await targets(port).catch(() => [])) {
              if (target.type !== 'page') continue;
              const socket = await connect(target).catch(() => null);
              if (socket) { await socket.send('Page.close').catch(() => {}); socket.close(); }
            }
          }
          sockets.forEach(socket => socket.close());
          if (child.exitCode === null) {
            child.kill('SIGTERM'); await Promise.race([exited, delay(3000)]);
            if (child.exitCode === null) child.kill('SIGKILL');
          }
          await exited;
        }
      }
    });
    evidence.receivedNetworkRequests = receipts; assert.equal(receipts, 0, 'local document must not reach network receiver');
    evidence.receivedStunPackets = udpReceipts; assert.equal(udpReceipts, 0, 'local document must not reach STUN receiver');
    evidence.profileRemoved = await fs.stat(evidence.profile).then(() => false, () => true);
    assert.equal(evidence.profileRemoved, true);
    evidence.passed = true;
  } catch (error) { evidence.error = error.stack; throw error; }
  finally {
    udp.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(evidence, null, 2));
  }
  console.log(JSON.stringify(evidence, null, 2));
}
if (require.main === module) run(process.argv[2], path.resolve(process.argv[3] || 'output/playwright/ecs-local-html/security.json')).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { connect, targets, waitFor, run };
