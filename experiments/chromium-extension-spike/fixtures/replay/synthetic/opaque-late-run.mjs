// Native-only delivery diagnostics. Direct main-world stress never counts as
// extension delivery, even when it proves the once wrapper in an opaque realm.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { startSynthetic } from './transport.mjs';
import { createCertificateSet } from './certificate-set.mjs';
import { openSession, until, pause } from './session.mjs';
import { top, child, blocked, cases, filters, fixtures, bodyFor } from './nonhttp-context-fixtures.mjs';
import { sha } from './generate.mjs';
const [configFile, payload, evidence] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configFile));
assert(config.documentStart); assert(!fs.existsSync(evidence)); fs.mkdirSync(evidence);
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-opaque-late-')));
const certificates = createCertificateSet(path.join(root, 'certificates'), [top, child, blocked].map(u => new URL(u).hostname));
const authored = fixtures();
for (const [host, pathname] of [[child, '/opaque-hit/'], [blocked, '/blanc-fixture/opaque/']]) authored.set(host + pathname + 'opaque-srcdoc', { status: 200, contentType: 'text/plain', body: 'authored control' });
const replay = await startSynthetic({ fixtures: authored, tlsMaterial: certificates });
fs.writeFileSync(path.join(evidence, 'fixtures.json'), JSON.stringify([...authored], null, 2));
const selected = cases.filter(c => c.admitted);
selected.unshift({ name: 'opaque-srcdoc', mode: 'srcdoc', sandbox: true, origin: 'null', admitted: true });
// Add the two authored requests for the extra srcdoc case.
const report = { completed: false, checks: [], latencyMeasured: false, sources: {} };
for (const name of ['opaque-late-run.mjs','nonhttp-context-fixtures.mjs','opaque-frame-fixtures.mjs','session.mjs']) report.sources[name] = sha(fs.readFileSync(new URL(name, import.meta.url)));
fs.writeFileSync(path.join(evidence, 'filters.txt'), filters);
let session;
const snapshot = frame => frame.evaluate(() => ({ first: window.first, origin: window.origin, flag: window.opaqueFlag === true, counts: window.__blancScriptletGateCounts ?? null }));
try {
 session = await openSession({ config, browserKind: 'chromium', kind: 'regular', label: 'opaque-late', root, transport: replay, certificates, provider: 'ublock-origin', uboPayload: payload });
 report.source = session.source;
 await session.uboConfigure(); await session.uboSetFilters(filters);
 for (const cycle of [0, 1]) for (const c of selected) {
  await session.page.goto(top + '/nonhttp-root'); let parent = session.page;
  if (c.parent) {
   await session.page.evaluate(({ parent, child }) => { const f = document.createElement('iframe'); f.id = 'parent'; if (parent === 'opaque') { f.sandbox = 'allow-scripts'; f.srcdoc = '<!doctype html><body>opaque parent'; } else f.src = child + '/nonhttp-root'; document.body.append(f); }, { parent: c.parent, child });
   const el = await session.page.$('#parent'); parent = await until(() => el.contentFrame()); await parent.waitForSelector('body');
  }
  await parent.evaluate(({ c, body }) => { const f = document.createElement('iframe'); f.id = 'probe'; if (c.sandbox) f.sandbox = 'allow-scripts'; if (c.mode === 'srcdoc') f.srcdoc = body; else if (c.mode === 'data') f.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(body); else f.src = URL.createObjectURL(new Blob([body], { type: 'text/html' })); document.body.append(f); }, { c, body: bodyFor(c) });
  const el = await parent.$('#probe'), frame = await until(() => el.contentFrame());
  await frame.waitForSelector('#fixture-ready'); await frame.evaluate(() => window.requests); await pause(100);
  const row = { cycle, name: c.name, url: await frame.evaluate(() => location.href), playwrightUrl: frame.url(), before: await snapshot(frame) }; report.checks.push(row);
  assert(row.before.first.flag && row.before.first.getter); assert.equal(row.before.origin, c.origin); assert.equal(row.before.counts.bodies, 1);
  const popup = session.page.context().pages().find(p => p.url().includes('/popup-fenix.html')); assert(popup);
  const delivery = await popup.evaluate(async ({ top, child, url, name }) => {
   const b = globalThis.chrome.extension.getBackgroundPage();
   const tab = (await b.chrome.tabs.query({})).find(t => t.url === top + '/nonhttp-root'); if (!tab) throw Error('missing tab');
   const frames = await b.chrome.webNavigation.getAllFrames({ tabId: tab.id });
   const candidates = frames.filter(f => f.url === url && f.frameId !== 0 && !frames.some(x => x.parentFrameId === f.frameId));
   let target = candidates.length === 1 ? candidates[0] : null;
   let identitySource = target ? 'webNavigation-exact-leaf' : 'unresolved';
   const raw = options => new Promise(resolve => b.chrome.tabs.executeScript(tab.id, options, results => { const error = b.chrome.runtime.lastError?.message ?? null; resolve({ results: results ?? null, error }); }));
   let discovery = null;
   if (!target) {
    // Browser-provided sender metadata from a diagnostic isolated-world probe,
    // not a guessed frame id or a document-origin substitution.
    const nonce = b.crypto.randomUUID(), messages = [];
    const listener = (message, sender) => { if (message?.blancLateNonce === nonce && sender.tab?.id === tab.id) messages.push({ message, sender: { frameId: sender.frameId, documentId: sender.documentId, url: sender.url, origin: sender.origin, tabId: sender.tab.id } }); };
    b.chrome.runtime.onMessage.addListener(listener);
    try {
     const code = 'chrome.runtime.sendMessage({blancLateNonce:' + JSON.stringify(nonce) + ',href:location.href,origin:self.origin,frameName:document.querySelector("#fixture-ready")?.textContent});';
     const result = await raw({ allFrames: true, code, matchAboutBlank: true, runAt: 'document_idle' });
     await new Promise(resolve => b.setTimeout(resolve, 100)); discovery = { result, messages };
     const matches = messages.filter(x => x.message.href === url && x.sender.url === url && x.message.frameName === 'authored fixture ' + name && x.sender.frameId > 0 && typeof x.sender.documentId === 'string');
     if (matches.length === 1) { target = { frameId: matches[0].sender.frameId, documentId: matches[0].sender.documentId, url }; identitySource = 'runtime-sender-exact-document'; }
    } finally { b.chrome.runtime.onMessage.removeListener(listener); }
   }
   const execute = code => raw({ frameId: target.frameId, code, matchAboutBlank: true, runAt: 'document_idle' });
   const probe = target ? await execute('({origin:self.origin,ready:!!document.querySelector("#fixture-ready"),frameName:document.querySelector("#fixture-ready")?.textContent})') : null;
   const selection = name === 'child-origin-blob' ? child : top;
   const details = b.__blancScriptletEngine.retrieve({ tabId: tab.id, frameId: target?.frameId ?? -1, nocache: true, url: selection + '/', hostname: new URL(selection).hostname, domain: new URL(selection).hostname.split('.').slice(-2).join('.'), ancestors: [] });
   if (!details?.code || !details.mainWorld) throw Error('missing actual engine payload');
   const attempts = [];
   if (target) for (let i = 0; i < 2; i++) attempts.push(await execute('self.uBO_scriptletsInjected=undefined;\n' + details.code));
   return { tabId: tab.id, target, frames, identitySource, discovery, probe, attempts, mainWorld: details.mainWorld, assembled: details.code, selectedOrigin: selection, isolatedInjectorSentinelReset: true };
  }, { top, child, url: row.url, name: c.name });
  const { mainWorld, assembled, ...metadata } = delivery;
  const payloadHash = sha(mainWorld); fs.writeFileSync(path.join(evidence, payloadHash + '.main-world.js'), mainWorld);
  fs.writeFileSync(path.join(evidence, sha(assembled) + '.assembled.js'), assembled);
  row.delivery = { ...metadata, mainWorldSha256: payloadHash, assembledSha256: sha(assembled) };
  await pause(100); row.afterExtension = await snapshot(frame);
  // Explicit diagnostic-only direct evaluation of the SAME real engine payload.
  // No marker reset or replacement scriptlet; a new realm is created next cycle.
  for (let i = 0; i < 2; i++) await frame.evaluate(code => (0, eval)(code), mainWorld);
  row.afterDirect = await snapshot(frame); row.directDiagnosticDeliveries = 2;
  assert.equal(row.afterDirect.counts.bodies, 1); assert.equal(row.afterDirect.counts.attempts, row.afterExtension.counts.attempts + 2);
  assert.equal(row.afterDirect.origin, c.origin); assert(row.afterDirect.flag);
 }
 report.completed = true;
} catch (error) { report.error = String(error); process.exitCode = 1; }
finally {
 if (session) { report.records = session.records(); await session.close(); }
 report.arrivals = replay.arrivals; report.faults = replay.faults; await replay.close();
 fs.rmSync(root, { recursive: true, force: true }); report.cleanup = { removed: !fs.existsSync(root) };
 fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ completed: report.completed, checks: report.checks.length, error: report.error }));
}
