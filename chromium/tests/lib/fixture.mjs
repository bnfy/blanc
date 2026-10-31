import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const {loadShippingModule}=createRequire(import.meta.url)('./shipping-core.cjs');
// Shipping hooks.js TLS fixtures: secure.test is trusted only by the per-run
// SPKI pin; badcert.test's key is deliberately left out of it.
function mintCertificate(dir,name,hosts=[name],file=name){
  const key=path.join(dir,file+'-key.pem'),cert=path.join(dir,file+'-cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-keyout',key,'-out',cert,'-days','2','-nodes','-subj','/CN='+name,'-addext','subjectAltName='+hosts.map(h=>'DNS:'+h).join(',')],{stdio:'pipe'});
  const spki=crypto.createHash('sha256').update(crypto.createPublicKey(fs.readFileSync(cert)).export({type:'spki',format:'der'})).digest('base64');
  return {key:fs.readFileSync(key),cert:fs.readFileSync(cert),spki};
}
// Local-use names (F39/N5): two untrusted keys A and B, plus one trusted by pin.
const LOCAL_HOSTS=['nas.home.arpa','lab.home.arpa'];
const TLS_HOSTS=['insecure.test','secure.test','badcert.test',...LOCAL_HOSTS];
import {connect, waitFor, pause} from './cdp.mjs';
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export class NativeFixture {
  async launch(config, directory, {testHooks=false, privateMode=false, pages=null, diskAssets=true} = {}) {
    this.directory=directory; this.connections=[]; this.sockets=new Set();
    if(fs.existsSync(directory))throw Error('Refusing to overwrite fixture');
    if(digest(config.framework)!==config.frameworkSha256||digest(config.executable)!==config.executableSha256)throw Error('Candidate identity mismatch');
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    this.profile=path.join(directory,'profile');fs.mkdirSync(this.profile,{mode:0o700});
    const track=s=>{this.sockets.add(s);s.once('close',()=>this.sockets.delete(s));};
    // `pages` is an already-listening loopback page server ({base, close});
    // without one the fixture serves a single synthetic page.
    this.pages=pages;
    if(!pages){
      this.server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end('<title>Native test fixture</title><p>Local synthetic page</p>');});
      this.server.on('connection',track);
    }
    this.proxy=net.createServer(s=>{track(s);s.destroy();});
    for(const s of [this.server,this.proxy].filter(Boolean))await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});
    this.base=pages?pages.base:`http://127.0.0.1:${this.server.address().port}`;
    let tlsFlags=[];
    if(pages){
      const tls=path.join(directory,'tls');fs.mkdirSync(tls,{mode:0o700});
      const {startSecure}=loadShippingModule('test/desktop/support/fixtures-server.js');
      const secure=mintCertificate(tls,'secure.test'),untrusted=mintCertificate(tls,'badcert.test');
      this.secureServer=await startSecure(secure);this.untrustedServer=await startSecure(untrusted);
      this.secureBase=`https://secure.test:${this.secureServer.port}`;
      this.untrustedBase=`https://badcert.test:${this.untrustedServer.port}`;
      const local=Object.fromEntries(['a','b','trusted'].map(k=>[k,mintCertificate(tls,LOCAL_HOSTS[0],LOCAL_HOSTS,'local-'+k)]));
      const pair=({key,cert})=>({key,cert});
      this.localServer=await startSecure(pair(local.a));
      this.localFixtures={handle:this.localServer,certA:pair(local.a),certB:pair(local.b),certTrusted:pair(local.trusted)};
      tlsFlags=[`--ignore-certificate-errors-spki-list=${secure.spki},${local.trusted.spki}`];
    }
    this.config=config;this.launches=0;this.exits=[];
    this.flags=[`--user-data-dir=${this.profile}`,'--remote-debugging-port=0',
      ...(diskAssets?[`--blanc-prototype-assets=${config.assets}`]:[]),`--blanc-blocker-assets=${config.blockerAssets}`,
      `--proxy-server=http://127.0.0.1:${this.proxy.address().port}`,`--proxy-bypass-list=127.0.0.1;localhost;${TLS_HOSTS.join(';')}`,
      `--host-resolver-rules=${TLS_HOSTS.map(h=>'MAP '+h+' 127.0.0.1, ').join('')}MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`,...tlsFlags,
      '--disable-background-networking','--disable-quic','--no-first-run','--no-default-browser-check','--use-mock-keychain',
      ...(testHooks?['--blanc-test']:[]),...(privateMode?['--incognito']:[])];
    await this.start(this.base+'/initial');
    this.page=await connect((await this.targets()).find(t=>t.url===this.base+'/initial'));this.connections.push(this.page);
    await waitFor(this.snapshot,s=>s.tabs.some(t=>t.url===this.base+'/initial'&&!t.isLoading),'local page');
    if(privateMode){
      const info=(await this.browser.send('Target.getTargets')).targetInfos;
      const h=info.find(t=>t.url.includes('/host.html')),p=info.find(t=>t.url===this.base+'/initial');
      const contexts=await this.browser.send('Target.getBrowserContexts');
      if(!h.browserContextId||h.browserContextId===contexts.defaultBrowserContextId||h.browserContextId!==p.browserContextId)throw Error('Private native context not established');
    }
    return this;
  }
  // One browser process on the fixture profile; `url` is the launch page, or
  // none for a relaunch, where the browser's own session restore decides.
  async start(url=null){
    this.exit=null;this.launchError=null;fs.rmSync(path.join(this.profile,'DevToolsActivePort'),{force:true});
    const fd=fs.openSync(path.join(this.directory,'browser.log'),'a');
    const child=this.process=spawn(this.config.executable,[...this.flags,...(this.extraArgs||[]),...(url?[url]:[])],{stdio:['ignore',fd,fd]});
    fs.closeSync(fd);this.launches++;
    child.on('exit',(code,signal)=>{this.exits.push({code,signal});if(this.process===child)this.exit={code,signal};});
    child.on('error',e=>{this.launchError=e.message;});
    this.port=await waitFor(()=>{if(this.launchError)throw Error(this.launchError);return +fs.readFileSync(path.join(this.profile,'DevToolsActivePort'),'utf8').split('\n')[0];},p=>p>0,'debug port');
    this.targets=()=>fetch(`http://127.0.0.1:${this.port}/json/list`).then(r=>r.json());
    this.browser=await connect(await fetch(`http://127.0.0.1:${this.port}/json/version`).then(r=>r.json()));this.connections.push(this.browser);
    const targets=await waitFor(this.targets,ts=>ts.some(t=>t.url.includes('/host.html'))&&(!url||ts.some(t=>t.url===url)),'Island');
    this.host=await connect(targets.find(t=>t.url.includes('/host.html')));this.connections.push(this.host);
    this.snapshot=()=>this.host.eval('window.BlancPrototypeHost.api.getAllTabs()');
    await waitFor(this.snapshot,s=>s.blockerHealth==='ready','blocker');
  }
  // Quit (Browser.close, which must exit cleanly) or crash (SIGKILL), keeping
  // the profile and fixture servers for the next start.
  async stop({crash=false}={}){
    const child=this.process;
    if(crash)child.kill('SIGKILL');else try{await this.browser.send('Browser.close');}catch{}
    for(const c of this.connections)try{c.close();}catch{}
    this.connections=[];
    for(let i=0;i<150&&!this.exit;i++)await pause(100);
    if(!this.exit)throw Error('Browser did not exit after '+(crash?'SIGKILL':'quit'));
    if(!crash&&this.exit.code!==0){
      const watchdog=fs.readFileSync(path.join(this.directory,'browser.log'),'utf8').split('\n').filter(l=>/watchdog/i.test(l)).at(-1);
      throw Error('Browser quit with '+JSON.stringify(this.exit)+(watchdog?': '+watchdog.trim():''));
    }
  }
  // A browser its teardown watchdog terminates can orphan helpers. Every
  // helper carries this fixture's unique profile path, so only those match.
  reapHelpers(){
    if(!this.profile)return [];
    const flag='--user-data-dir='+this.profile;
    const orphans=execFileSync('/bin/ps',['-axo','pid=,command='],{encoding:'utf8'}).split('\n')
      .filter(l=>l.includes(flag+' ')||l.endsWith(flag)).map(l=>Number(l.trim().split(/\s+/)[0])).filter(pid=>pid&&pid!==process.pid);
    for(const pid of orphans)try{process.kill(pid,'SIGKILL');}catch{}
    this.reapedHelpers=orphans.length;return orphans;
  }
  async connectTarget(target){const c=await connect(target);this.connections.push(c);return c;}
  async close(){
    if(this.browser)try{await this.browser.send('Browser.close');}catch{}
    for(const c of this.connections||[])try{c.close();}catch{}
    if(this.process)for(let i=0;i<100&&!this.exit;i++)await pause(100);
    if(this.process&&!this.exit){this.process.kill('SIGTERM');for(let i=0;i<50&&!this.exit;i++)await pause(100);}
    for(const s of this.sockets||[])s.destroy();
    for(const s of [this.server,this.proxy])if(s?.listening)await new Promise(resolve=>s.close(resolve));
    if(this.pages)await this.pages.close();
    for(const s of [this.secureServer,this.untrustedServer,this.localServer])if(s)await s.close();
    this.reapHelpers();
    return this.exit;
  }
}
