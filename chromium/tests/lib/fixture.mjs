import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {connect, waitFor, pause} from './cdp.mjs';
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export class NativeFixture {
  async launch(config, directory, {testHooks=false, privateMode=false} = {}) {
    this.directory=directory; this.connections=[]; this.sockets=new Set();
    if(fs.existsSync(directory))throw Error('Refusing to overwrite fixture');
    if(digest(config.framework)!==config.frameworkSha256||digest(config.executable)!==config.executableSha256)throw Error('Candidate identity mismatch');
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    this.profile=path.join(directory,'profile');fs.mkdirSync(this.profile,{mode:0o700});
    const track=s=>{this.sockets.add(s);s.once('close',()=>this.sockets.delete(s));};
    this.server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end('<title>Native test fixture</title><p>Local synthetic page</p>');});
    this.server.on('connection',track);
    this.proxy=net.createServer(s=>{track(s);s.destroy();});
    for(const s of [this.server,this.proxy])await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});
    this.base=`http://127.0.0.1:${this.server.address().port}`;
    const fd=fs.openSync(path.join(directory,'browser.log'),'wx');
    this.process=spawn(config.executable,[`--user-data-dir=${this.profile}`,'--remote-debugging-port=0',
      `--blanc-prototype-assets=${config.assets}`,`--blanc-blocker-assets=${config.blockerAssets}`,
      `--proxy-server=http://127.0.0.1:${this.proxy.address().port}`,'--proxy-bypass-list=127.0.0.1;localhost',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
      '--disable-background-networking','--disable-quic','--no-first-run','--no-default-browser-check','--use-mock-keychain',
      ...(testHooks?['--blanc-test']:[]),...(privateMode?['--incognito']:[]),this.base+'/initial'],{stdio:['ignore',fd,fd]});
    fs.closeSync(fd);this.process.on('exit',(code,signal)=>{this.exit={code,signal};});
    this.process.on('error',e=>{this.launchError=e.message;});
    this.port=await waitFor(()=>{if(this.launchError)throw Error(this.launchError);return +fs.readFileSync(path.join(this.profile,'DevToolsActivePort'),'utf8').split('\n')[0];},p=>p>0,'debug port');
    this.targets=()=>fetch(`http://127.0.0.1:${this.port}/json/list`).then(r=>r.json());
    this.browser=await connect(await fetch(`http://127.0.0.1:${this.port}/json/version`).then(r=>r.json()));this.connections.push(this.browser);
    const targets=await waitFor(this.targets,ts=>ts.some(t=>t.url.includes('/host.html'))&&ts.some(t=>t.url===this.base+'/initial'),'Island and local page');
    this.host=await connect(targets.find(t=>t.url.includes('/host.html')));this.connections.push(this.host);
    this.page=await connect(targets.find(t=>t.url===this.base+'/initial'));this.connections.push(this.page);
    this.snapshot=()=>this.host.eval('window.BlancPrototypeHost.api.getAllTabs()');
    await waitFor(this.snapshot,s=>s.blockerHealth==='ready'&&s.tabs.some(t=>t.url===this.base+'/initial'&&!t.isLoading),'blocker and local page');
    if(privateMode){
      const info=(await this.browser.send('Target.getTargets')).targetInfos;
      const h=info.find(t=>t.url.includes('/host.html')),p=info.find(t=>t.url===this.base+'/initial');
      const contexts=await this.browser.send('Target.getBrowserContexts');
      if(!h.browserContextId||h.browserContextId===contexts.defaultBrowserContextId||h.browserContextId!==p.browserContextId)throw Error('Private native context not established');
    }
    return this;
  }
  async close(){
    if(this.browser)try{await this.browser.send('Browser.close');}catch{}
    for(const c of this.connections||[])try{c.close();}catch{}
    if(this.process)for(let i=0;i<100&&!this.exit;i++)await pause(100);
    if(this.process&&!this.exit){this.process.kill('SIGTERM');for(let i=0;i<50&&!this.exit;i++)await pause(100);}
    for(const s of this.sockets||[])s.destroy();
    for(const s of [this.server,this.proxy])if(s?.listening)await new Promise(resolve=>s.close(resolve));
    return this.exit;
  }
}
