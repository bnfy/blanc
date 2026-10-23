import fs from 'node:fs';import http from 'node:http';import dgram from 'node:dgram';import {spawn,execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {connect,pause} from './cdp.mjs';
const root=import.meta.dirname,app=root+'/Blanc Chromium Preview.app',dir=root+'/transport';fs.mkdirSync(dir,{recursive:true});
execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-nodes','-keyout',dir+'/key.pem','-out',dir+'/cert.pem','-days','2','-subj','/CN=page.blanc-fixture.test'],{stdio:'ignore'});
const fingerprint=[...createHash('sha256').update(execFileSync('openssl',['x509','-in',dir+'/cert.pem','-outform','DER'])).digest()];
const udp=dgram.createSocket('udp4');await new Promise(r=>udp.bind(0,'127.0.0.1',r));const quicPort=udp.address().port;await new Promise(r=>udp.close(r));
const rows=[],errors=[];let carry='',child,browser;
const server=spawn('/private/tmp/blanc-http3-venv/bin/python3',[root+'/webtransport-server.py',dir+'/cert.pem',dir+'/key.pem',String(quicPort)],{stdio:['ignore','pipe','pipe']});
server.stdout.on('data',b=>{carry+=b;let i;while((i=carry.indexOf('\n'))>=0){rows.push(JSON.parse(carry.slice(0,i)));carry=carry.slice(i+1)}});server.stderr.on('data',b=>errors.push(String(b)));
const httpServer=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end('<title>Signed HTTP3 control</title>')});await new Promise(r=>httpServer.listen(9894,'127.0.0.1',r));
const report={checks:[],controls:[],serverRows:rows};const check=(name,pass,details)=>{report.checks.push({name,pass:!!pass,details});if(!pass)throw Error(name)};
async function until(fn){for(let i=0;i<150;i++){try{const x=await fn();if(x)return x}catch{}await pause(100)}throw Error('readiness timeout')}
try{await until(()=>rows.some(x=>x.event==='ready'));for(const enabled of [false,true])for(const mode of ['regular','private']){
 const d=dir+'/'+(enabled?'enforced':'baseline')+'-'+mode;fs.mkdirSync(d);const fd=fs.openSync(d+'/launch.log','w');
 const args=['--user-data-dir='+d+'/profile','--remote-debugging-port=9895','--no-first-run','--no-proxy-server','--host-resolver-rules=MAP page.blanc-fixture.test 127.0.0.1, MAP 000491b06a.com 127.0.0.1','--blanc-prototype-assets='+app+'/Contents/Resources/BlancAssets'];if(enabled)args.push('--blanc-blocker-assets='+app+'/Contents/Resources/BlancBlocker','--blanc-ubo-reload-probe');if(mode==='private')args.push('--incognito');
 child=spawn(app+'/Contents/MacOS/Blanc Prototype',args,{stdio:['ignore',fd,fd]});child.on('exit',()=>child.done=true);
 const list=()=>fetch('http://127.0.0.1:9895/json/list').then(r=>r.json());browser=await connect(await until(()=>fetch('http://127.0.0.1:9895/json/version').then(r=>r.json())));
 const host=await connect(await until(async()=>(await list()).find(x=>x.url.endsWith('/host.html'))));await until(async()=>(await host.eval('BlancPrototypeHost.api.getAllTabs()'))?.tabs?.length);await host.eval("BlancPrototypeHost.api.createTab('http://127.0.0.1:9894/')");
 const page=await connect(await until(async()=>(await list()).find(x=>x.url==='http://127.0.0.1:9894/')));await until(()=>page.eval("document.title==='Signed HTTP3 control'"));
 for(const hostname of ['page.blanc-fixture.test','000491b06a.com']){
  const before=rows.length,url=`https://${hostname}:${quicPort}/transport`;
  const expression=`(async()=>{const t=new WebTransport(${JSON.stringify(url)},{serverCertificateHashes:[{algorithm:'sha-256',value:new Uint8Array(${JSON.stringify(fingerprint)})}]});t.closed.catch(()=>{});try{await Promise.race([t.ready,new Promise((_,j)=>setTimeout(()=>j(Error('timeout')),10000))]);const w=t.datagrams.writable.getWriter();await w.write(new TextEncoder().encode('blanc-http3-proof'));const r=t.datagrams.readable.getReader();const echo=await r.read();return {ready:true,echo:new TextDecoder().decode(echo.value)}}catch(e){return {ready:false,error:String(e)}}finally{t.close()}})()`;
  const result=await page.eval(expression);await pause(500);const arrivals=rows.slice(before),blocked=enabled&&hostname==='000491b06a.com';report.controls.push({enabled,mode,hostname,result,arrivals});
  check(`${enabled?'enforced':'baseline'} ${mode} ${hostname}`,blocked?!result.ready&&!arrivals.some(x=>x.event==='connect'):result.ready&&result.echo==='blanc-http3-proof'&&arrivals.some(x=>x.event==='alpn'&&x.value==='h3')&&arrivals.some(x=>x.event==='connect'&&x.accepted),result);
 }
 page.close();host.close();await browser.send('Browser.close').catch(()=>{});browser.close();await until(()=>child.done);child=null;browser=null;
}check('HTTP3 server no errors',errors.length===0,errors);report.complete=true;}catch(e){report.error=String(e)}finally{if(browser){await browser.send('Browser.close').catch(()=>{});browser.close()}if(child&&!child.done)child.kill('SIGTERM');server.kill('SIGTERM');httpServer.closeAllConnections();httpServer.close();fs.rmSync(dir+'/key.pem',{force:true});fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
