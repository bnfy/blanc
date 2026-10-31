import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {connect, waitFor, pause} from './lib/cdp.mjs';
const [configPath, mode] = process.argv.slice(2);
if (!configPath || !['regular', 'private'].includes(mode)) throw Error('Usage: smoke.mjs local-config.json regular|private');
const config = JSON.parse(fs.readFileSync(configPath));
const output = path.resolve(config.evidence, 'smoke-' + mode);
if (fs.existsSync(output)) throw Error('Refusing to overwrite prior fixture output');
fs.mkdirSync(output, {recursive:true, mode:0o700});
const profile = path.join(output, 'profile'); fs.mkdirSync(profile, {mode:0o700});
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if (sha(config.framework) !== config.frameworkSha256 || sha(config.executable) !== config.executableSha256) throw Error('Candidate identity mismatch');
const sockets = new Set();
const track = s => { sockets.add(s); s.once('close', () => sockets.delete(s)); };
const server = http.createServer((req, res) => { res.writeHead(200, {'content-type':'text/html'}); res.end('<title>Foundation smoke</title><p>Local synthetic page</p>'); });
server.on('connection', track);
const proxy = net.createServer(socket => {track(socket); socket.destroy();});
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let proc, browser, host, page, exit;
const result = {status:'started', mode, candidate:config.candidate, checks:[], scope:'isolated native source-relocation smoke; not F0.5 baseline or full product verification'};
try {
  await listen(server); await listen(proxy);
  const first = `http://127.0.0.1:${server.address().port}/first`;
  const second = `http://127.0.0.1:${server.address().port}/second`;
  const log = fs.openSync(path.join(output, 'browser.log'), 'wx');
  proc = spawn(config.executable, [`--user-data-dir=${profile}`, '--remote-debugging-port=0',
    `--blanc-prototype-assets=${config.assets}`, `--blanc-blocker-assets=${config.blockerAssets}`,
    `--proxy-server=http://127.0.0.1:${proxy.address().port}`, '--proxy-bypass-list=127.0.0.1;localhost',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    '--disable-background-networking', '--disable-quic', '--no-first-run', '--no-default-browser-check',
    '--use-mock-keychain', ...(mode === 'private' ? ['--incognito'] : []), first], {stdio:['ignore',log,log]});
  fs.closeSync(log); proc.on('exit', (code, signal) => {exit = {code, signal};});
  const port = await waitFor(() => +fs.readFileSync(path.join(profile, 'DevToolsActivePort'),'utf8').split('\n')[0], x => x > 0, 'CDP port');
  browser = await connect(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()));
  const targets = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
  const initial = await waitFor(targets, ts => ts.some(t=>t.url.includes('/host.html')) && ts.some(t=>t.url===first), 'native UI and fixture');
  const ht = initial.find(t=>t.url.includes('/host.html'));
  const pt = initial.find(t=>t.url===first);
  host = await connect(ht); page = await connect(pt);
  const snapshot = () => host.eval('window.BlancPrototypeHost.api.getAllTabs()');
  const initialState = await waitFor(snapshot, s => s.tabs.some(t=>t.url===first && !t.isLoading) && s.blockerHealth==='ready', 'ready native blocker');
  if (initialState.tabs.some(t=>t.private !== (mode==='private'))) throw Error('Unexpected private state');
  if (mode==='private') {
    const info = (await browser.send('Target.getTargets')).targetInfos;
    const a = info.find(t=>t.targetId===ht.id), b = info.find(t=>t.targetId===pt.id);
    const contexts = await browser.send('Target.getBrowserContexts');
    if (!a.browserContextId || a.browserContextId===contexts.defaultBrowserContextId || a.browserContextId!==b.browserContextId) throw Error('Private native context not established');
  }
  result.checks.push('native UI, document context and ready blocker');
  await host.eval('window.BlancPrototypeHost.api.createTab(' + JSON.stringify(second) + ')');
  const created = await waitFor(snapshot, s=>s.tabs.some(t=>t.url===second && !t.isLoading), 'created tab');
  const tab = created.tabs.find(t=>t.url===second);
  if (tab.private !== (mode==='private')) throw Error('New tab privacy mismatch');
  await host.eval('window.BlancPrototypeHost.api.closeTab(' + JSON.stringify(tab.id) + ')');
  await waitFor(snapshot, s=>!s.tabs.some(t=>t.id===tab.id) && s.tabs.some(t=>t.url===first && t.id===s.activeTabId), 'closed tab and restored selection');
  result.checks.push('create/close tab and native selection');
  await host.eval('window.BlancPrototypeHost.api.closeOverlay()');
  const before = await page.eval('devicePixelRatio');
  if (await host.eval("window.BlancPrototypeHost.api.previewPageCommand('zoomIn')") !== true) throw Error('Native zoom refused');
  await waitFor(()=>page.eval('devicePixelRatio'), value=>value>before, 'native zoom');
  await host.eval("window.BlancPrototypeHost.api.previewPageCommand('zoomReset')");
  await waitFor(()=>page.eval('devicePixelRatio'), value=>Math.abs(value-before)<1e-6, 'zoom reset');
  result.checks.push('native page zoom and reset');
  result.status = 'passed';
} catch (error) { result.status='failed'; result.error=String(error.stack||error); }
finally {
  if (browser) try {await browser.send('Browser.close');} catch {}
  for (const c of [page,host,browser]) try {c?.close();} catch {}
  if (proc) for (let i=0; i<100 && !exit; i++) await pause(100);
  if (proc && !exit) {proc.kill('SIGTERM'); for (let i=0; i<50 && !exit; i++) await pause(100);}
  result.browserExit=exit;
  if (result.status==='passed' && exit?.code!==0) result.status='failed';
  for (const s of sockets) s.destroy();
  await Promise.all([server,proxy].map(s=>s.listening ? new Promise(resolve=>s.close(resolve)) : Promise.resolve()));
  result.profile='preserved in owned fixture directory';
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}
if (result.status!=='passed') process.exitCode=1;
