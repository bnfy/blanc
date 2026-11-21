import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const root = '/private/tmp/blanc-f12-import-validators-20261024';
const app = '/private/tmp/blanc-chromium157-update/src/out/BlancPrototype/Blanc Prototype.app';
const assets = '/private/tmp/blanc-prerender-final-20261024/Blanc Chromium Preview.app/Contents/Resources';
let generation = 1, child, browser;
const clients = [], events = [], hits = [];
const report = { complete: false, runs: [], checks: [] };
function check(name, ok, detail) {
  report.checks.push({ name, pass: !!ok, detail });
  assert(ok, name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const x = await fn(); if (x) return x; await sleep(100); }
  throw Error('condition timeout');
}
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const x = JSON.parse(data);
    if (x.id) {
      const f = pending.get(x.id);
      if (f) { pending.delete(x.id); clearTimeout(f.timer); x.error ? f.reject(Error(JSON.stringify(x.error))) : f.resolve(x.result); }
    } else if (x.method?.startsWith('ServiceWorker.') || x.method?.startsWith('Tracing.')) events.push(x);
  };
  const c = {
    close: () => ws.close(),
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(Error(method + ' timeout')); }, 25000);
        pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params }));
      });
    },
    async eval(expression) {
      const x = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (x.exceptionDetails) throw Error(JSON.stringify(x.exceptionDetails));
      return x.result.value;
    }
  };
  clients.push(c); return c;
}
const main = "importScripts('/dependency.js');oninstall=e=>e.waitUntil(skipWaiting());onactivate=e=>e.waitUntil(clients.claim());onmessage=e=>e.ports[0].postMessage({dependencyVersion});";
const server = http.createServer((req, res) => {
  if (['/worker.js', '/dependency.js'].includes(req.url)) {
    const etag = req.url === '/worker.js' ? '"main-fixed"' : `"dependency-${generation}"`;
    const status = req.headers['if-none-match'] === etag ? 304 : 200;
    hits.push({ path: req.url, generation, etag, validator: req.headers['if-none-match'] || null, status,
      leakedToken: Object.values(req.headers).some(v => String(v).includes('blanc-trace-update/')) });
    res.writeHead(status, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache', ETag: etag, 'Service-Worker-Allowed': '/' });
    res.end(status === 304 ? undefined : req.url === '/worker.js' ? main : `const dependencyVersion=${generation};`);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><link rel="icon" href="data:,"><title>Imported update attribution</title>');
  }
});
async function stopTrace() {
  await browser.send('Tracing.end');
  const done = await until(() => events.find(x => x.method === 'Tracing.tracingComplete'));
  events.splice(events.indexOf(done), 1);
  let data = '';
  while (true) {
    const r = await browser.send('IO.read', { handle: done.params.stream });
    data += r.base64Encoded ? Buffer.from(r.data, 'base64').toString() : r.data;
    if (r.eof) break;
  }
  await browser.send('IO.close', { handle: done.params.stream });
  return JSON.parse(data).traceEvents;
}
function validJoin(trace, before, mode) {
  const requests = trace.filter(x => x.name === 'Blanc.ServiceWorkerUpdateRequest');
  const decisions = trace.filter(x => x.name === 'Blanc.BlockerDecision');
  return requests.length === 4 && new Set(requests.map(x => x.args.request_token)).size === 4 &&
    before.every(v => {
      const rs = requests.filter(r => String(r.args.registration_id) === v.registrationId && String(r.args.version_id) === v.versionId);
      return rs.length === 2 && rs.filter(r => r.args.main_script === true).length === 1 && rs.filter(r => r.args.main_script === false).length === 1;
    }) && requests.every(r => r.args.private === (mode === 'private') && decisions.filter(d => d.args.request_token === r.args.request_token && d.args.result === 0).length === 1) && decisions.length === 4;
}
try {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const mode of ['regular', 'private']) {
    generation = 1; events.length = 0;
    const profile = root + '/profile-final-' + mode;
    assert(!fs.existsSync(profile));
    const row = { mode, profile, origin, phases: [] }; report.runs.push(row);
    const fd = fs.openSync(root + '/' + mode + '-launch.log', 'w');
    child = spawn(app + '/Contents/MacOS/Blanc Prototype', ['--user-data-dir=' + profile, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--blanc-prototype-assets=' + assets + '/BlancAssets', '--blanc-blocker-assets=' + assets + '/BlancBlocker'], { stdio: ['ignore', fd, fd] });
    child.on('exit', (code, signal) => child.result = { code, signal });
    const port = await until(() => { const f = profile + '/DevToolsActivePort'; return fs.existsSync(f) && Number(fs.readFileSync(f, 'utf8').split('\n')[0]); });
    const base = 'http://127.0.0.1:' + port;
    browser = await connect((await fetch(base + '/json/version').then(r => r.json())).webSocketDebuggerUrl);
    const list = () => fetch(base + '/json/list').then(r => r.json());
    const context = mode === 'private' ? (await browser.send('Target.createBrowserContext', { disposeOnDetach: true })).browserContextId : null;
    row.browserContextId = context;
    const pages = [];
    for (const scope of ['alpha', 'beta']) {
      const url = origin + '/' + scope + '/page';
      const target = await browser.send('Target.createTarget', { url, ...(context ? { browserContextId: context } : {}) });
      const c = await connect((await until(async () => (await list()).find(t => t.id === target.targetId))).webSocketDebuggerUrl);
      await c.send('Page.navigate', { url });
      await until(() => c.eval('location.href===' + JSON.stringify(url) + '&&!!navigator.serviceWorker'));
      await c.send('ServiceWorker.enable');
      await c.eval(`(async()=>{await navigator.serviceWorker.register('/worker.js',{scope:'/${scope}/',updateViaCache:'none'});await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));return true})()`);
      pages.push(c);
    }
    const active = () => {
      const versions = new Map();
      for (const e of events) if (e.method === 'ServiceWorker.workerVersionUpdated') for (const v of e.params.versions) if (v.scriptURL === origin + '/worker.js') versions.set(v.versionId, v);
      return [...versions.values()].filter(v => v.status === 'activated');
    };
    const version = c => c.eval(`new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=e=>{channel.port1.close();resolve(e.data.dependencyVersion)};navigator.serviceWorker.controller.postMessage({},[channel.port2])})`);
    await until(() => active().length === 2);
    check(mode + ': initial imported dependency runs in both registrations', (await Promise.all(pages.map(version))).every(x => x === 1));
    for (const phase of ['import-change', 'not-modified']) {
      const before = active().map(v => ({ registrationId: v.registrationId, versionId: v.versionId }));
      const hitStart = hits.length;
      generation = 2;
      await browser.send('Tracing.start', { categories: '-*,disabled-by-default-blanc.attribution', transferMode: 'ReturnAsStream' });
      await Promise.all(pages.map(c => c.eval(`(async()=>{await(await navigator.serviceWorker.getRegistration()).update();return true})()`)));
      try {
        // Observe lifecycle without repeatedly dispatching messages to the old
        // controller while skipWaiting is trying to activate its replacement.
        if (phase === 'import-change') await until(() => active().length === 2 && active().every(v => !before.some(b => b.versionId === v.versionId)));
        check(mode + '/' + phase + ': controllers execute the expected imported bytes', (await Promise.all(pages.map(version))).every(x => x === 2));
      } catch(error) { row.failedPhase = {phase, before, current: active(), clientVersions: await Promise.all(pages.map(version)), events: [...events]}; const failedTrace=await stopTrace(); fs.writeFileSync(root+'/'+mode+'-failed-trace.json',JSON.stringify(failedTrace,null,2)); throw error; }
      const trace = await stopTrace();
      const requests = hits.slice(hitStart);
      const attribution = trace.filter(x => x.name?.startsWith('Blanc.'));
      row.phases.push({ phase, before, after: active(), serverRequests: requests, attribution });
      fs.writeFileSync(root + '/' + mode + '-' + phase + '-trace.json', JSON.stringify(trace, null, 2));
      check(mode + '/' + phase + ': each registration has independently joined main/import decisions', validJoin(attribution, before, mode), attribution);
      check(mode + '/' + phase + ': two requests per script reach validator endpoint', requests.length === 4 && ['/worker.js', '/dependency.js'].every(path => requests.filter(h => h.path === path).length === 2), requests);
      check(mode + '/' + phase + ': unchanged main scripts validate with 304', requests.filter(h => h.path === '/worker.js').every(h => h.status === 304 && h.validator === '"main-fixed"'));
      if (phase === 'import-change') {
        check(mode + ': changed import fetched and activates both replacement versions', requests.some(h => h.path === '/dependency.js' && h.status === 200) && active().every(v => !before.some(b => b.versionId === v.versionId)));
      } else {
        check(mode + ': unchanged dependency validates with 304 and preserves versions', requests.every(h => h.status === 304) && active().length === before.length && active().every(v => before.some(b => b.versionId === v.versionId)));
      }
      check(mode + '/' + phase + ': trace payload remains opaque', attribution.every(x => Object.keys(x.args).every(k => ['request_token', 'registration_id', 'version_id', 'private', 'main_script', 'result'].includes(k)) && !JSON.stringify(x.args).includes(origin)));
      const withoutImport = attribution.filter(x => !(x.name === 'Blanc.ServiceWorkerUpdateRequest' && x.args.main_script === false));
      check(mode + '/' + phase + ': missing import identity rejected offline', !validJoin(withoutImport, before, mode));
    }
    await browser.send('Browser.close'); await until(() => child.result);
    row.exit = child.result;
    check(mode + ': browser exits cleanly', row.exit.code === 0 && !row.exit.signal);
    clients.splice(0).forEach(c => c.close()); child = null; browser = null;
  }
  check('opaque tokens never enter HTTP headers', hits.every(h => !h.leakedToken));
  report.complete = true;
} catch (error) { report.error = String(error.stack || error); }
finally {
  if (browser) await browser.send('Browser.close').catch(() => {});
  if (child) await until(() => child.result, 8000).catch(() => child.kill('SIGTERM'));
  clients.forEach(c => c.close()); server.closeAllConnections(); await new Promise(r => server.close(r));
  report.serverHits = hits;
  fs.writeFileSync(root + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ complete: report.complete, checks: report.checks.map(c => ({ name: c.name, pass: c.pass })), error: report.error }));
}
if (!report.complete) process.exitCode = 1;
