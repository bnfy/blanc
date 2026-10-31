// Prepared-only isolated search fixture. No launch occurs when imported or checked.
// Usage: node browser-fixture.mjs <fresh-label> <reviewed-config.json>
// The network sandbox is mandatory and self-tested before starting Chromium.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect, pause } from '../../evidence/tab-selection-port-20261028/cdp.mjs';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const safeLabel = s => /^[a-zA-Z0-9_-]{1,50}$/.test(s || '');
const policy = '(version 1) (allow default) (deny network-outbound) (allow network-outbound (remote ip "localhost:*"))';
const providers = {
  'Google': 'https://www.google.com/search?q=',
  'Bing': 'https://www.bing.com/search?q=',
  'DuckDuckGo': 'https://duckduckgo.com/?q=',
  'Brave': 'https://search.brave.com/search?q=',
  'Kagi': 'https://kagi.com/search?q=',
};
const wait = async (fn, predicate, description) => {
  let last; for (let i = 0; i < 250; i++) { let value; try { value = await fn(); last = null; } catch (e) { last = e; } if (predicate(value)) return value; await pause(100); }
  throw Error(`Timed out: ${description}${last ? `; ${last.message}` : ''}`);
};
async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}
function verifyInputs(config) {
  for (const key of ['assets', 'executable', 'framework', 'blockerAssets', 'nativeReceipt']) if (!path.isAbsolute(config[key] || '')) throw Error(`Absolute ${key} required`);
  for (const key of ['executableSha256', 'frameworkSha256']) if (!/^[a-f0-9]{64}$/.test(config[key] || '')) throw Error(`Reviewed ${key} required`);
  if (sha(config.executable) !== config.executableSha256 || sha(config.framework) !== config.frameworkSha256) throw Error('Candidate executable or framework hash mismatch');
  if (!config.assetHashes || !Object.keys(config.assetHashes).length) throw Error('Complete reviewed asset hashes required');
  const found = [];
  const walk = (dir, prefix = '') => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name), full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Asset symlink is not allowed: ${rel}`);
    if (entry.isDirectory()) walk(full, rel); else if (entry.isFile()) found.push(rel); else throw Error(`Unexpected asset: ${rel}`);
  }};
  walk(config.assets);
  assert.deepEqual(found.sort(), Object.keys(config.assetHashes).sort(), 'complete asset inventory');
  for (const rel of found) if (sha(path.join(config.assets, rel)) !== config.assetHashes[rel]) throw Error(`Asset changed: ${rel}`);
  const receipt = JSON.parse(fs.readFileSync(path.join(here, 'preparation.json'), 'utf8'));
  const overlay = JSON.parse(fs.readFileSync(path.join(here, 'overlay-preparation.json'), 'utf8'));
  const native = JSON.parse(fs.readFileSync(config.nativeReceipt, 'utf8'));
  const expectedSource=receipt.outputs[path.join(here, 'blanc_prototype_ui.candidate.cc')];
  const expectedHost=receipt.outputs[path.join(here, 'host.candidate.js')];
  if (native.sourceSha256 !== expectedSource || native.frameworkSha256 !== config.frameworkSha256 || native.buildSuccess !== true || native.guardZeroActions !== true) throw Error('Native build receipt does not bind the reviewed draft and zero-action guard');
  const sourceRoot = '<local-home>/Projects/BlancChromium158/src/chrome/browser/ui';
  const expectedModules = {
    'custom_template.cc': 'cfecac0516a96d6eb62f9ed0f0171dccb3f9ac12747a652fc600a7c516277c0c',
    'custom_template.h': 'd5e4d9e602a7fd74c604a6bfb44da5305e1402b828ecd9df8f080d30d10454ca',
    'selected_custom.cc': 'f0adf7f8298beefa82f6662fdc22bda965fe505d6356e91e7a21baa277beba40',
    'selected_custom.h': '9ab2ad9c99cf640cef07947f4ec9782bf6a28a0d94e22f47b1cdc3a5d03e6e92',
    'selected_shipping.cc': 'a3ec9e9244ae62205994c9e475ab85046479c661cb9419222d045c1b924e194d',
    'selected_shipping.h': '22cf60920620ed482df8286f9399feba8b595949805db6cdd4139a451147b7ee',
    'selected_shipping_browser.cc': '950d071452d53421a68f9887eb65226c8919c31bfa9536b92e81c258cf08a882'
  };
  assert.deepEqual(native.moduleSha256, expectedModules, 'native receipt must bind all seven reviewed modules');
  if (sha(path.join(sourceRoot, 'blanc_prototype_ui.cc')) !== expectedSource) throw Error('Staged UI source changed');
  for (const [name, hash] of Object.entries(expectedModules)) {
    const file = path.join(sourceRoot, 'modules', name);
    if (fs.lstatSync(file).isSymbolicLink() || sha(file) !== hash) throw Error(`Staged module changed: ${name}`);
  }

  if (sha(path.join(config.assets, 'host.js')) !== expectedHost) throw Error('Not the reviewed search host');
  if (sha(path.join(config.assets, 'overlay.js')) !== overlay.candidate) throw Error('Not the reviewed overlay');
  const expectedBlocker=JSON.parse(fs.readFileSync('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview/evidence/development-matched-20261028/blocker-current-sha256.json'));
  found.length=0; walk(config.blockerAssets);
  assert.deepEqual(found.sort(), Object.keys(expectedBlocker).sort(), 'complete blocker inventory');
  for (const [name,hash] of Object.entries(expectedBlocker)) if (sha(path.join(config.blockerAssets,name)) !== hash) throw Error(`Blocker changed: ${name}`);
}
async function proveNetworkSandbox(port) {
  // The TEST-NET-1 destination is deliberately not a real provider. Refuse to
  // run if the OS does not explicitly deny the socket or allow loopback.
  const probe = `const n=require('net');const local=n.connect(${port},'127.0.0.1');local.on('error',e=>{console.error('local:'+e.code);process.exit(2)});local.on('connect',()=>{local.destroy();const s=n.connect(9,'192.0.2.1');s.on('connect',()=>process.exit(3));s.on('error',e=>{console.log(e.code);process.exit(['EPERM','EACCES'].includes(e.code)?0:4)});setTimeout(()=>process.exit(5),2500)})`;
  execFileSync('/usr/bin/sandbox-exec', ['-p', policy, process.execPath, '-e', probe], { timeout: 6000, stdio: 'pipe' });
}

// Walk open shadow roots without using privileged Settings internals.
const deep = `function all(root){const out=[];for(const e of root.querySelectorAll('*')){out.push(e);if(e.shadowRoot)out.push(...all(e.shadowRoot))}return out}`;
async function settingsSelect(settings, name) {
  await wait(() => settings.eval(`(()=>{${deep};const x=all(document).find(e=>e.id==='openDialogButton');if(!x)return false;x.click();return true})()`), Boolean, 'Settings search picker button');
  const available = await wait(() => settings.eval(`(()=>{${deep};const d=all(document).find(e=>e.localName==='settings-search-engine-list-dialog');return d?.searchEngines?.map(e=>({id:e.id,name:e.name,default:e.default}))||null})()`), x => Array.isArray(x) && x.length, 'Settings search choices');
  const item = available.find(e => e.name.toLowerCase() === name.toLowerCase());
  if (!item) { await settings.eval(`(()=>{${deep};all(document).find(e=>e.id==='cancelButton')?.click()})()`); return { available: false, choices: available.map(x=>x.name) }; }
  const clicked = await settings.eval(`(()=>{${deep};const d=all(document).find(e=>e.localName==='settings-search-engine-list-dialog');const b=d&&all(d.shadowRoot).find(e=>e.localName==='cr-radio-button'&&e.getAttribute('name')===${JSON.stringify(String(item.id))});if(!b)return false;b.click();return true})()`);
  assert.equal(clicked, true, 'actual Settings radio control');
  await settings.eval(`(()=>{${deep};const d=all(document).find(e=>e.localName==='settings-search-engine-list-dialog');const b=d&&all(d.shadowRoot).find(e=>e.id==='setAsDefaultButton');if(!b||b.disabled)throw Error('Save button unavailable');b.click()})()`);
  await wait(() => settings.eval(`(()=>{${deep};return all(document).find(e=>e.classList?.contains('search-engine-name'))?.textContent?.trim()})()`), x => x?.toLowerCase() === name.toLowerCase(), `Settings selects ${name}`);
  return { available: true, selected: name };
}
async function addAndSelectLocalProvider(settings, serverPort) {
  await settings.send('Page.navigate',{url:'chrome://settings/searchEngines'});
  await wait(()=>settings.eval('document.readyState'),x=>x==='complete','search engine settings ready');
  await wait(()=>settings.eval(`(()=>{${deep};const b=all(document).find(e=>e.id==='addSearchEngine');if(!b)return false;b.click();return true})()`),Boolean,'add search engine');
  await wait(()=>settings.eval(`(()=>{${deep};return !!all(document).find(e=>e.localName==='settings-search-engine-edit-dialog')})()`),Boolean,'engine editor');
  const values={searchEngine:'Fixture Local',keyword:'fixture-local',queryUrl:`http://127.0.0.1:${serverPort}/search?q=%s`};
  await settings.eval(`(()=>{${deep};const d=all(document).find(e=>e.localName==='settings-search-engine-edit-dialog');for(const [id,value] of Object.entries(${JSON.stringify(values)})){const input=all(d.shadowRoot).find(e=>e.id===id);if(!input)throw Error('missing '+id);input.value=value;input.dispatchEvent(new CustomEvent('value-changed',{detail:{value},bubbles:true,composed:true}));input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));}return true})()`);
  await wait(()=>settings.eval(`(()=>{${deep};const d=all(document).find(e=>e.localName==='settings-search-engine-edit-dialog');const b=d&&all(d.shadowRoot).find(e=>e.id==='actionButton');if(!b||b.disabled)return false;b.click();return true})()`),Boolean,'save fixture provider');
  await wait(()=>settings.eval(`(()=>{${deep};return all(document).some(e=>e.localName==='settings-search-engine-entry'&&e.engine?.displayName==='Fixture Local')})()`),Boolean,'fixture provider entry');
  await settings.eval(`(()=>{${deep};const e=all(document).find(x=>x.localName==='settings-search-engine-entry'&&x.engine?.displayName==='Fixture Local');const b=e&&all(e.shadowRoot).find(x=>x.classList?.contains('icon-more-vert'));if(!b||b.disabled)throw Error('fixture menu unavailable');b.click();return true})()`);
  await wait(()=>settings.eval(`(()=>{${deep};const e=all(document).find(x=>x.localName==='settings-search-engine-entry'&&x.engine?.displayName==='Fixture Local');const b=e&&all(e.shadowRoot).find(x=>['makeDefault','makeDefaultOption'].includes(x.id)&&!x.hidden&&!x.disabled);if(!b)return false;b.click();return true})()`),Boolean,'select fixture default');
  await settings.send('Page.navigate',{url:'chrome://settings/search'});
  await wait(()=>settings.eval(`(()=>{${deep};return all(document).find(e=>e.classList?.contains('search-engine-name'))?.textContent?.trim()})()`),x=>x==='Fixture Local','fixture default readback');
}
async function enter(host) {
  await host.eval(`(()=>{const f=document.getElementById('overlay');const x=f.contentDocument.getElementById('addressInput');x.dispatchEvent(new f.contentWindow.KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}))})()`);
}
async function overlayState(host) {
  return host.eval(`(()=>{const f=document.getElementById('overlay'),d=f.contentDocument,x=d?.getElementById('addressInput'),n=d?.getElementById('addressSubmissionNotice');return {hidden:f.hidden,value:x?.value,invalid:x?.getAttribute('aria-invalid'),focused:d?.activeElement===x,notice:n?.textContent,noticeHidden:n?.hidden,role:n?.getAttribute('role')}})()`);
}
async function rawSearch(host, tab, query, selectionEpoch) {
  // Exercise the real WebUI handler with a captured, deliberately stale
  // document identity; this isn't a renderer-side guard simulation.
  return host.eval(`new Promise((resolve,reject)=>{const id='fixture-search-stale';const previous=window.blancPrototypeReply;const timer=setTimeout(()=>{window.blancPrototypeReply=previous;reject(Error('no native reply'))},5000);window.blancPrototypeReply=(replyId,ok,value)=>{if(replyId!==id)return previous(replyId,ok,value);clearTimeout(timer);window.blancPrototypeReply=previous;resolve({ok,value})};chrome.send('blancPrototype',[id,'searchTab',[${JSON.stringify(Number(tab.id))},${JSON.stringify(query)},${JSON.stringify(tab.searchDocumentId)},${JSON.stringify(tab.committedUrl)},${JSON.stringify(selectionEpoch)}]])})`);
}

async function run(label, configPath) {
  if (!safeLabel(label)) throw Error('Supply a fresh, safe label');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  verifyInputs(config);
  const profile = path.join(here, `browser-profile-${label}`), output = path.join(here, `browser-${label}.json`), log = path.join(here, `browser-${label}.log`);
  if ([profile, output, log].some(p => fs.existsSync(p))) throw Error('Fixture label already used');
  const proof = { label, frameworkSha256: config.frameworkSha256, assetHashes: config.assetHashes, checks: [], missing: ['cross-window, wrong-host and hostile-frame cases', 'controlled OS handoff', 'reentrant native insertion observer', 'real overlay new-tab transition and localized accessibility', 'physical keyboard and VoiceOver'], scopedPass: false, complete: false };
  const clients = []; let proc, browser;
  const held = [], localRequests=[];
  const server = http.createServer((req, res) => {
    localRequests.push(req.url);
    if (req.url === '/hold') { held.push(res); return; }
    if (req.url.startsWith('/search?') && req.url.includes('newtab-slow')) { held.push(res); return; }
    if (req.url.startsWith('/search?') && req.url.includes('newtab-no-content')) { res.writeHead(204); res.end(); return; }
    res.writeHead(200, {'content-type':'text/html'}); res.end('<!doctype html><title>Isolated search fixture</title>');
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port, port = await freePort();
  const record = (name, details) => { proof.checks.push({name, details}); console.log(name); };
  const list = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  const attach = async (target, event) => { const c = await connect(target, event); clients.push(c); return c; };
  try {
    await proveNetworkSandbox(serverPort);
    fs.mkdirSync(profile, { mode: 0o700 });
    if (fs.lstatSync(profile).isSymbolicLink() || fs.realpathSync(profile) !== path.join(fs.realpathSync(here), `browser-profile-${label}`)) throw Error('Fresh isolated profile required');
    const fd = fs.openSync(log, 'wx', 0o600);
    proc = spawn('/usr/bin/sandbox-exec', ['-p', policy, config.executable, `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--blanc-prototype-assets=${config.assets}`, `--blanc-blocker-assets=${config.blockerAssets}`, '--no-first-run', '--no-default-browser-check', '--use-mock-keychain', '--no-proxy-server', `http://127.0.0.1:${serverPort}/`], { stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    proc.once('error', error => { proof.processError = error.message; });
    const host = await attach(await wait(async () => (await list()).find(t => t.url.endsWith('/host.html')), Boolean, 'Island'));
    browser = await attach(await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json()));
    const pageTarget = await wait(async () => (await list()).find(t => t.url === `http://127.0.0.1:${serverPort}/`), Boolean, 'local page');
    const blocked = []; let page, beforeUnloadDialogs=0;
    page = await attach(pageTarget, event => {
      if (event.method === 'Page.javascriptDialogOpening' && event.params.type === 'beforeunload') {
        ++beforeUnloadDialogs;
        void page.send('Page.handleJavaScriptDialog',{accept:false}).catch(()=>{});
        return;
      }
      if (event.method !== 'Fetch.requestPaused') return;
      const { requestId, request, resourceType } = event.params;
      const url = request.url;
      if (url.startsWith(`http://127.0.0.1:${serverPort}/`)) return void page.send('Fetch.continueRequest', {requestId}).catch(() => {});
      blocked.push({url, resourceType});
      let local = false;
      try { local = ['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname); } catch {}
      if (resourceType === 'Document' && (local || url === 'https://xn--bcher-kva.de/' || Object.values(providers).some(prefix => url.startsWith(prefix)))) {
        void page.send('Fetch.fulfillRequest', {requestId, responseCode:200, responseHeaders:[{name:'Content-Type',value:'text/html'}], body:Buffer.from('<!doctype html><title>Intercepted search</title>').toString('base64')}).catch(() => {});
      } else void page.send('Fetch.failRequest', {requestId, errorReason:'BlockedByClient'}).catch(() => {});
    });
    await page.send('Page.enable');
    await page.send('Fetch.enable', {patterns:[{urlPattern:'*',requestStage:'Request'}]});
    const { targetId } = await browser.send('Target.createTarget', {url:'chrome://settings/search'});
    const settings = await attach(await wait(async () => (await list()).find(t => t.id === targetId), Boolean, 'Settings'));
    await wait(() => settings.eval('document.readyState'), x => x === 'complete', 'Settings ready');
    const fallbackLabel=await wait(()=>settings.eval(`(()=>{${deep};return all(document).find(e=>e.classList?.contains('search-engine-name'))?.textContent?.trim()})()`),Boolean,'fresh profile effective provider');
    const fallbackName=Object.keys(providers).find(name=>name.toLowerCase()===fallbackLabel.toLowerCase());
    assert.ok(fallbackName,`fresh effective provider not among reviewed stock engines: ${fallbackLabel}`);
    await host.eval('BlancPrototypeHost.refresh()');
    const fallbackState=await host.eval('BlancPrototypeHost.api.getAllTabs()');
    const fallbackTab=fallbackState.tabs.find(t=>t.url===`http://127.0.0.1:${serverPort}/`);
    assert.ok(fallbackTab);
    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(fallbackTab.id)})`);
    await host.eval('BlancPrototypeHost.refresh()');
    const fallbackQuery='fixture fresh effective provider', fallbackBefore=blocked.length;
    await host.eval(`BlancPrototypeHost.open(true,${JSON.stringify(fallbackQuery)})`);
    await wait(()=>overlayState(host),x=>!x.hidden&&x.value===fallbackQuery,'fallback input');
    await enter(host);
    const fallbackRequest=await wait(()=>blocked.slice(fallbackBefore).find(x=>x.resourceType==='Document'),Boolean,'fresh fallback request');
    assert.equal(fallbackRequest.url,providers[fallbackName]+encodeURIComponent(fallbackQuery));
    await wait(()=>overlayState(host),x=>x.hidden,'fresh fallback observed commit');
    record('fresh profile honors effective native fallback',{provider:fallbackName,duckDuckGoShippingDefault:fallbackName==='DuckDuckGo'});
    const settingsResult = []; let currentProvider;
    for (const [name, prefix] of Object.entries(providers)) {
      const selection = await settingsSelect(settings, name);
      settingsResult.push(selection);
      if (!selection.available) continue;
      currentProvider = name;
      // Find the synthetic local tab by its actual visible URL in the Island.
      await host.eval('BlancPrototypeHost.refresh()');
      const state = await host.eval('BlancPrototypeHost.api.getAllTabs()');
      const tab = state.tabs.find(t => t.id === fallbackTab.id);
      assert.ok(tab, 'owned current search tab');
      await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(tab.id)})`);
      await host.eval('BlancPrototypeHost.refresh()');
      const query = `fixture ${name} c++ & tea`;
      const previous = blocked.length;
      await host.eval(`BlancPrototypeHost.open(true,${JSON.stringify(query)})`);
      await wait(() => host.eval(`(()=>{const f=document.getElementById('overlay');return !f.hidden&&!!f.contentDocument?.getElementById('addressInput')})()`), Boolean, 'overlay');
      await enter(host);
      const event = await wait(() => blocked.slice(previous).find(x => x.resourceType === 'Document'), Boolean, `${name} search request`);
      assert.equal(event.url, prefix + encodeURIComponent(query), `exact ${name} URL`);
      await wait(() => overlayState(host), x => x.hidden, `${name} overlay closes after successful submission`);
      record(`Settings ${name}: selected and isolated search URL`, event.url);
    }
    proof.settingsChoices = settingsResult;
    assert.ok(settingsResult.filter(x=>x.available).length >= 2, 'at least two shipping providers must be available to verify switching');
    // An unsupported real Settings provider exercises refusal and retry. If no
    // such provider is offered, retain the gap rather than manufacturing one.
    const choices = (await settingsSelect(settings, '__fixture_not_a_provider__')).choices;
    const unsupported = choices.find(name => !Object.keys(providers).some(p => p.toLowerCase() === name.toLowerCase()));
    const retryProvider = settingsResult.find(x => x.available)?.selected;
    if (unsupported && retryProvider) {
      await settingsSelect(settings, unsupported);
      await host.eval('BlancPrototypeHost.refresh()');
      const state = await host.eval('BlancPrototypeHost.api.getAllTabs()');
      const tab = state.tabs.find(t => Object.values(providers).some(prefix => t.url.startsWith(prefix)));
      assert.ok(tab, 'existing synthetic search tab');
      await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(tab.id)})`);
      await host.eval('BlancPrototypeHost.refresh()');
      const query = 'fixture retry c++ & tea', previous = blocked.length;
      await host.eval(`BlancPrototypeHost.open(true,${JSON.stringify(query)})`);
      await wait(() => overlayState(host), x => !x.hidden && x.value === query, 'retry overlay');
      await enter(host);
      const failure = await wait(() => overlayState(host), x => x.invalid === 'true' && !x.noticeHidden, 'visible search error');
      assert.equal(failure.value, query); assert.equal(failure.hidden, false);
      assert.equal(failure.role, 'alert'); assert.equal(failure.focused, true);
      assert.equal(blocked.slice(previous).filter(x=>x.resourceType==='Document').length, 0, 'unsupported provider sends no search');
      await settingsSelect(settings, retryProvider);
      currentProvider = retryProvider;
      assert.equal((await overlayState(host)).value, query, 'retry preserves original input');
      await enter(host);
      const request = await wait(() => blocked.slice(previous).find(x => x.resourceType === 'Document'), Boolean, 'retry search request');
      assert.equal(request.url, providers[retryProvider] + encodeURIComponent(query));
      await wait(() => overlayState(host), x => x.hidden, 'retry overlay closes after successful submission');
      record('unsupported provider: accessible error, preserved text and retry', {unsupported,retryProvider});
    } else proof.missing.push('actual unsupported-provider error and retry (no suitable Settings choice)');

    // Same-URL reload has a new document identity. Replaying the old captured
    // intent must produce a native rejection and no provider navigation.
    await host.eval('BlancPrototypeHost.refresh()');
    let state = await host.eval('BlancPrototypeHost.api.getAllTabs()');
    let tab = state.tabs.find(t => Object.values(providers).some(prefix => t.url.startsWith(prefix)));
    assert.ok(tab?.searchDocumentId && tab.committedUrl, 'capturable current document');
    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(tab.id)})`);
    await host.eval('BlancPrototypeHost.refresh()');
    await page.send('Page.reload');
    await wait(async () => { await host.eval('BlancPrototypeHost.refresh()'); const s = await host.eval('BlancPrototypeHost.api.getAllTabs()'); return s.tabs.find(t => t.id === tab.id); }, x => x?.searchDocumentId && x.searchDocumentId !== tab.searchDocumentId, 'same-URL reload committed');
    let previous = blocked.length;
    const stale = await rawSearch(host, tab, 'fixture stale reload', state.searchSelectionEpoch);
    assert.equal(stale.ok, false); await pause(250);
    assert.equal(blocked.slice(previous).filter(x=>x.resourceType==='Document').length, 0);
    record('same-URL reload rejects stale native search intent', stale.value);

    await host.eval('BlancPrototypeHost.refresh()');
    state = await host.eval('BlancPrototypeHost.api.getAllTabs()');
    tab = state.tabs.find(t => t.id === tab.id);
    const settingsTab = state.tabs.find(t => t.url.startsWith('chrome://settings/'));
    assert.ok(settingsTab, 'owned Settings tab');
    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(settingsTab.id)})`);
    previous = blocked.length;
    const inactive = await rawSearch(host, tab, 'fixture inactive tab', state.searchSelectionEpoch);
    assert.equal(inactive.ok, false); await pause(250);
    assert.equal(blocked.slice(previous).filter(x=>x.resourceType==='Document').length, 0);
    record('inactive tab rejects native search intent', inactive.value);

    // Switching back to the same tab must not resurrect an intent captured
    // before the intervening selection (A -> B -> A).
    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(tab.id)})`);
    await host.eval('BlancPrototypeHost.refresh()');
    const abaState=await host.eval('BlancPrototypeHost.api.getAllTabs()');
    const abaTab=abaState.tabs.find(t=>t.id===tab.id);
    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(settingsTab.id)})`);
    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(tab.id)})`);
    previous=blocked.length;
    const aba=await rawSearch(host,abaTab,'fixture selection ABA',abaState.searchSelectionEpoch);
    assert.equal(aba.ok,false);await pause(250);
    assert.equal(blocked.slice(previous).filter(x=>x.resourceType==='Document').length,0);
    record('switch-away-and-back rejects stale selection epoch',aba.value);

    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(tab.id)})`);
    await host.eval('BlancPrototypeHost.refresh()');
    state = await host.eval('BlancPrototypeHost.api.getAllTabs()');
    tab = state.tabs.find(t => t.id === tab.id);
    void page.send('Page.navigate', {url:`http://127.0.0.1:${serverPort}/hold`}).catch(() => {});
    await wait(() => held.length, x => x > 0, 'held navigation begins');
    previous = blocked.length;
    const pending = await rawSearch(host, tab, 'fixture pending navigation', state.searchSelectionEpoch);
    assert.equal(pending.ok, false); await pause(250);
    assert.equal(blocked.slice(previous).filter(x=>x.resourceType==='Document').length, 0);
    await page.send('Page.stopLoading');
    for (const response of held.splice(0)) response.destroy();
    record('held navigation rejects native search intent', pending.value);

    // These navigation targets are fulfilled at interception, not contacted.
    // They must never be sent to the selected external search provider.
    const addresses = [
      ['localhost', 'http://localhost/'],
      ['localhost:8647/probe', 'http://localhost:8647/probe'],
      ['127.0.0.1:8647/probe', 'http://127.0.0.1:8647/probe'],
      ['[::1]:8647/probe', 'http://[::1]:8647/probe'],
      ['localhost?token=fixture', 'http://localhost/?token=fixture'],
      ['127.0.0.1?token=fixture', 'http://127.0.0.1/?token=fixture'],
      ['localhost#fixture', 'http://localhost/'],
      ['127.0.0.1#fixture', 'http://127.0.0.1/'],
      ['bücher.de', 'https://xn--bcher-kva.de/'],
    ];
    for (const [input, expected] of addresses) {
      await host.eval('BlancPrototypeHost.refresh()');
      const before = blocked.length;
      await host.eval(`BlancPrototypeHost.open(true,${JSON.stringify(input)})`);
      await wait(()=>overlayState(host),x=>!x.hidden&&x.value===input,'address overlay');
      await enter(host);
      const request = await wait(()=>blocked.slice(before).find(x=>x.resourceType==='Document'),Boolean,`address ${input}`);
      assert.equal(request.url,expected);
      await wait(()=>overlayState(host),x=>x.hidden,'address accepted');
      assert.equal(blocked.slice(before).some(x=>Object.values(providers).some(prefix=>x.url.startsWith(prefix))),false,'local address leaked to search provider');
      record('loopback typed as navigation', {input,url:request.url});
    }

    // Explicit local file/UNC inputs must fail before a provider request. The
    // API is invoked with synthetic paths; no real user files are inspected.
    for (const input of ['/private/fixture.html','./fixture.html','C:\\fixture.html','\\\\fixture-server\\fixture.html','file:///fixture.html']) {
      await host.eval('BlancPrototypeHost.refresh()');
      const current=await host.eval('BlancPrototypeHost.api.getAllTabs()');
      const before=blocked.length;
      const result=await host.eval(`BlancPrototypeHost.api.navigate(${JSON.stringify(current.activeTabId)},${JSON.stringify(input)}).then(()=>({ok:true}),()=>({ok:false}))`);
      assert.equal(result.ok,false);await pause(250);
      assert.equal(blocked.slice(before).some(x=>x.resourceType==='Document'),false,'local input caused navigation');
      record('synthetic local input rejected without provider transmission',{input});
    }

    // A real page beforeunload veto must not be reported as a committed URL.
    // CDP mouse events provide activation to the isolated fixture page only.
    await host.eval('BlancPrototypeHost.refresh()');
    const vetoState=await host.eval('BlancPrototypeHost.api.getAllTabs()');
    const vetoTab=vetoState.tabs.find(t=>t.id===vetoState.activeTabId);
    assert.ok(vetoTab);
    const vetoBefore=await page.eval('location.href');
    await page.eval(`window.onbeforeunload=e=>{e.preventDefault();e.returnValue='';return ''}`);
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x:20,y:20,button:'left',clickCount:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:20,y:20,button:'left',clickCount:1});
    const vetoResult=await host.eval(`BlancPrototypeHost.api.navigate(${JSON.stringify(vetoTab.id)},${JSON.stringify(`http://127.0.0.1:${serverPort}/veto-target`)}).then(value=>({ok:true,value}),error=>({ok:false,error:String(error)}))`);
    assert(beforeUnloadDialogs>0,'fixture did not produce an actual beforeunload dialog');
    assert.equal(vetoResult.ok,false,'veto was incorrectly reported as committed');
    assert.equal(await page.eval('location.href'),vetoBefore,'vetoed document changed');
    await page.eval('window.onbeforeunload=null');
    record('beforeunload veto does not report committed navigation',true);

    // Add a synthetic loopback provider via the actual Settings UI. That lets
    // a newly created WebContents complete navigation without external access
    // or a race attaching a per-target network interceptor.
    const priorProvider=currentProvider;
    await addAndSelectLocalProvider(settings,serverPort);
    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(fallbackTab.id)})`);
    await host.eval('BlancPrototypeHost.refresh()');
    const sourceBefore=await host.eval('BlancPrototypeHost.api.getAllTabs()');
    assert.equal(sourceBefore.activeTabId,fallbackTab.id);
    await host.eval(`(()=>{window.__searchFixtureOutcome=null;BlancPrototypeHost.api.createTab('fixture newtab-slow one',{focusAddress:false}).then(x=>window.__searchFixtureOutcome={ok:true,value:x},e=>window.__searchFixtureOutcome={ok:false,error:String(e)});return true})()`);
    await wait(()=>held.length,x=>x===1,'new search request held');
    await host.eval('BlancPrototypeHost.refresh()');
    const inserted=await host.eval('BlancPrototypeHost.api.getAllTabs()');
    assert.notEqual(inserted.activeTabId,sourceBefore.activeTabId);
    assert.equal(BigInt(inserted.searchSelectionEpoch),BigInt(sourceBefore.searchSelectionEpoch)+1n);
    assert.equal(await host.eval('window.__searchFixtureOutcome'),null,'snapshot precedes result');
    held.shift().end('<!doctype html><title>Fixture new search</title>');
    const created=await wait(()=>host.eval('window.__searchFixtureOutcome'),Boolean,'observed new search');
    assert.equal(created.ok,true);assert.equal(created.value.status,'committed');
    assert.equal(String(created.value.tabId),inserted.activeTabId);
    assert.equal(created.value.selectionEpoch,inserted.searchSelectionEpoch);
    assert(localRequests.some(x=>x.startsWith('/search?q=fixture%20newtab-slow%20one')));
    record('new search snapshot precedes exact committed target identity',created.value);

    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(fallbackTab.id)})`);
    await host.eval('BlancPrototypeHost.refresh()');
    await host.eval(`(()=>{window.__searchFixtureABA=null;BlancPrototypeHost.api.createTab('fixture newtab-slow two',{focusAddress:false}).then(x=>window.__searchFixtureABA={ok:true,value:x},e=>window.__searchFixtureABA={ok:false,error:String(e)});return true})()`);
    await wait(()=>held.length,x=>x===1,'ABA new search held');
    await host.eval('BlancPrototypeHost.refresh()');
    const beforeAba=await host.eval('BlancPrototypeHost.api.getAllTabs()');
    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(fallbackTab.id)})`);
    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(beforeAba.activeTabId)})`);
    await host.eval('BlancPrototypeHost.refresh()');
    const afterAba=await host.eval('BlancPrototypeHost.api.getAllTabs()');
    assert.equal(afterAba.activeTabId,beforeAba.activeTabId);
    assert(BigInt(afterAba.searchSelectionEpoch)>BigInt(beforeAba.searchSelectionEpoch));
    held.shift().end('<!doctype html><title>Fixture ABA search</title>');
    const abaResult=await wait(()=>host.eval('window.__searchFixtureABA'),Boolean,'ABA search outcome');
    assert.equal(abaResult.ok,true);assert.equal(abaResult.value.selectionEpoch,beforeAba.searchSelectionEpoch);
    assert.notEqual(abaResult.value.selectionEpoch,afterAba.searchSelectionEpoch);
    record('new search result retains original epoch after user tab ABA',abaResult.value);
    await host.eval(`BlancPrototypeHost.api.switchTab(${JSON.stringify(fallbackTab.id)})`);
    await host.eval('BlancPrototypeHost.refresh()');
    const noContent=await host.eval(`BlancPrototypeHost.api.createTab('fixture newtab-no-content',{focusAddress:false})`);
    assert.equal(noContent.status,'unknown','204 is an indeterminate outcome, not a committed search');
    assert.ok(Number.isInteger(noContent.tabId) && /^\d+$/.test(noContent.selectionEpoch));
    record('new search no-content reports unknown with created identity',noContent);
    const restored=await settingsSelect(settings,priorProvider);
    assert.equal(restored.available,true,'restore synthetic fixture provider selection');

    // Exit the only regular process before opening a real primary-incognito
    // process against the same exclusively owned fixture profile.
    await browser.send('Browser.close');
    await wait(() => proc.exitCode, x => x !== null, 'regular normal exit');
    assert.equal(proc.exitCode, 0);
    clients.forEach(c => c.close()); clients.length = 0;
    browser = null; proc = null;
    const history = path.join(profile, 'Default', 'History');
    assert.ok(fs.existsSync(history), 'fixture History exists');
    const marker = `private-fixture-${label}`;
    const countHistory = () => Number(execFileSync('/usr/bin/sqlite3', ['-readonly', history, `SELECT count(*) FROM urls WHERE instr(url, '${marker}') > 0;`], {encoding:'utf8'}).trim());
    assert.equal(countHistory(), 0, 'no private marker before run');
    const privateLog = path.join(here, `browser-${label}-private.log`);
    const privateFd = fs.openSync(privateLog, 'wx', 0o600);
    proc = spawn('/usr/bin/sandbox-exec', ['-p', policy, config.executable, `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--blanc-prototype-assets=${config.assets}`, `--blanc-blocker-assets=${config.blockerAssets}`, '--incognito', '--no-first-run', '--no-default-browser-check', '--use-mock-keychain', '--no-proxy-server', 'chrome://newtab/'], {stdio:['ignore',privateFd,privateFd]});
    fs.closeSync(privateFd);
    proc.once('error', error => { proof.processError = error.message; });
    const privateHost = await attach(await wait(async () => (await list()).find(t => t.url.endsWith('/host.html')), Boolean, 'private Island'));
    browser = await attach(await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json()));
    const privateState = await wait(() => privateHost.eval('BlancPrototypeHost.api.getAllTabs()'), x => x?.tabs?.some(t=>t.private), 'primary incognito');
    assert.equal(privateState.tabs.every(t=>t.private), true);
    const privateTarget = await wait(async () => (await list()).find(t => t.type === 'page' && /newtab/i.test(t.url)), Boolean, 'private New Tab');
    const privateRequests = []; let privatePage;
    privatePage = await attach(privateTarget, event => {
      if (event.method !== 'Fetch.requestPaused') return;
      const {requestId,request,resourceType} = event.params;
      if (request.url.startsWith(`http://127.0.0.1:${serverPort}/`)) return void privatePage.send('Fetch.continueRequest',{requestId}).catch(()=>{});
      privateRequests.push({url:request.url,resourceType});
      if (resourceType === 'Document' && Object.values(providers).some(prefix=>request.url.startsWith(prefix))) return void privatePage.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<!doctype html><title>Private fixture</title>').toString('base64')}).catch(()=>{});
      void privatePage.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'}).catch(()=>{});
    });
    await privatePage.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
    for (const [name,query] of [['newtab', `${marker}-newtab`],['page', `${marker}-page`]]) {
      if (name === 'page') {
        await privatePage.send('Page.navigate',{url:`http://127.0.0.1:${serverPort}/`});
        await wait(()=>privatePage.eval('location.href'),x=>x===`http://127.0.0.1:${serverPort}/`,'private ordinary page');
      }
      await privateHost.eval('BlancPrototypeHost.refresh()');
      const before = privateRequests.length;
      await privateHost.eval(`BlancPrototypeHost.open(true,${JSON.stringify(query)})`);
      await wait(()=>overlayState(privateHost),x=>!x.hidden&&x.value===query,`private ${name} input`);
      await enter(privateHost);
      const request = await wait(()=>privateRequests.slice(before).find(x=>x.resourceType==='Document'),Boolean,`private ${name} search`);
      assert.equal(request.url,providers[currentProvider]+encodeURIComponent(query));
      await wait(()=>overlayState(privateHost),x=>x.hidden,`private ${name} overlay closes`);
      record(`private ${name} uses selected provider`, request.url);
    }
    await browser.send('Browser.close');
    await wait(()=>proc.exitCode,x=>x!==null,'private normal exit');
    assert.equal(proc.exitCode,0);
    browser = null;
    assert.equal(countHistory(),0,'private searches must not enter regular History');
    record('private searches absent from closed regular History', true);
    proof.normalExit = true;
    const names=proof.checks.map(x=>x.name);
    for (const required of ['fresh profile honors effective native fallback','same-URL reload rejects stale native search intent',
        'inactive tab rejects native search intent','switch-away-and-back rejects stale selection epoch',
        'held navigation rejects native search intent','beforeunload veto does not report committed navigation','new search snapshot precedes exact committed target identity',
        'new search result retains original epoch after user tab ABA','new search no-content reports unknown with created identity','private newtab uses selected provider',
        'private page uses selected provider','private searches absent from closed regular History'])
      assert(names.includes(required),`required scoped check missing: ${required}`);
    assert.equal(names.filter(x=>x==='loopback typed as navigation').length,9);
    assert.equal(names.filter(x=>x==='synthetic local input rejected without provider transmission').length,5);
    assert(names.filter(x=>x.startsWith('Settings ')&&x.endsWith('isolated search URL')).length>=2);
    proof.scopedPass = true;
    // `complete` stays false: this is a scoped candidate check, not parity.
  } catch (error) { proof.error = error.stack; }
  finally {
    for (const response of held.splice(0)) response.destroy();
    if (browser) await browser.send('Browser.close').catch(() => {});
    if (proc?.exitCode === null) {
      await wait(() => proc.exitCode, x => x !== null, 'normal browser exit').catch(() => { proof.normalExit = false; });
      if (proc.exitCode === null) { proc.kill('SIGTERM'); proof.forcedFixtureTermination = true; }
      else proof.normalExit = proc.exitCode === 0;
    }
    for (const c of clients) c.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(output, JSON.stringify(proof, null, 2), {flag:'wx', mode:0o600});
  }
  // Exit zero only for the explicit scoped cases above; this never marks full
  // product parity or suppresses the remaining evidence gaps.
  process.exitCode = proof.error || !proof.scopedPass || !proof.normalExit ? 1 : 0;
  console.log(JSON.stringify({scopedPass:proof.scopedPass === true, complete:false, error:proof.error || null}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await run(process.argv[2], process.argv[3]);
