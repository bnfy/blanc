import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {until,pause} from './session.mjs';
const [configFile,root,python]=process.argv.slice(2);
const config=JSON.parse(fs.readFileSync(configFile));fs.mkdirSync(root);
const key=path.join(root,'key.pem'),cert=path.join(root,'cert.pem');
execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-nodes','-keyout',key,'-out',cert,'-days','10','-subj','/CN=page.blanc-fixture.test']);
const der=execFileSync('openssl',['x509','-in',cert,'-outform','DER']);
const fingerprint=[...createHash('sha256').update(der).digest()];
const pageServer=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Blanc HTTP3 fixture</title>');});
await new Promise(r=>pageServer.listen(0,'127.0.0.1',r));
// Reserve a UDP port independently: QUIC does not use the page server's TCP port.
const dgram=await import('node:dgram');const reservation=dgram.createSocket('udp4');await new Promise(r=>reservation.bind(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const serverRows=[];let carry='';
const server=spawn(python,[new URL('./webtransport-server.py',import.meta.url).pathname,cert,key,String(port)],{stdio:['ignore','pipe','pipe']});
server.stdout.on('data',b=>{carry+=b;let i;while((i=carry.indexOf('\n'))>=0){const line=carry.slice(0,i);carry=carry.slice(i+1);serverRows.push(JSON.parse(line));}});
const errors=[];server.stderr.on('data',b=>errors.push(String(b)));
const pw=await import(pathToFileURL(config.playwright));const results=[];
try {
 await until(()=>serverRows.some(r=>r.event==='ready'));
 for(const protection of ['baseline','enforced']) for(const kind of ['regular','private']) {
  const dir=path.join(root,protection+'-'+kind);fs.mkdirSync(dir);const profile=path.join(dir,'profile');fs.mkdirSync(profile);const log=path.join(dir,'decisions.jsonl');fs.writeFileSync(log,'');
  let context;
  try {
   context=await pw.chromium.launchPersistentContext(profile,{executablePath:config.chromium,headless:false,chromiumSandbox:true,args:['--use-mock-keychain','--no-proxy-server','--host-resolver-rules=MAP page.blanc-fixture.test 127.0.0.1, MAP 000491b06a.com 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',...(protection==='enforced'?[`--blanc-blocker-assets=${config.engine}`]:[]),`--blanc-blocker-log=${log}`,`--blanc-prototype-assets=${config.ui}`,'--no-first-run','--disable-component-update','--disable-sync']});
   const browser=context.browser();const active=kind==='private'?await browser.newContext():context;const page=await active.newPage();await page.goto(`http://127.0.0.1:${pageServer.address().port}`);
   const cdp=await active.newCDPSession(page);const info=await cdp.send('Target.getTargetInfo');const bs=await browser.newBrowserCDPSession();const contexts=await bs.send('Target.getBrowserContexts');assert.equal(contexts.browserContextIds.includes(info.targetInfo.browserContextId),kind==='private');
   for(const host of ['page.blanc-fixture.test','000491b06a.com']) {
    const before=serverRows.length;
    const result=await page.evaluate(async ({url,fingerprint})=>{
     const transport=new WebTransport(url,{serverCertificateHashes:[{algorithm:'sha-256',value:new Uint8Array(fingerprint)}]});transport.closed.catch(()=>{});
     try {
      await Promise.race([transport.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('fixture timeout')),12000))]);
      const writer=transport.datagrams.writable.getWriter();await writer.write(new TextEncoder().encode('blanc-http3-proof'));
      const reader=transport.datagrams.readable.getReader();const echo=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(Error('echo timeout')),5000))]);
      return {ready:true,echo:new TextDecoder().decode(echo.value)};
     } catch(e) {return {ready:false,error:String(e)};} finally {transport.close();}
    },{url:`https://${host}:${port}/transport`,fingerprint});
    await pause(500);
    const decisions=fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r=>r.event==='webtransport-decision'&&new URL(r.url).hostname===host);
    const arrivals=serverRows.slice(before);results.push({protection,kind,host,result,decisions,arrivals});fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({results,serverRows,errors},null,2));
    assert.equal(decisions.length,protection==='enforced'?1:0);if(decisions.length)assert.equal(decisions[0].private,kind==='private');
    if(protection==='baseline'||host==='page.blanc-fixture.test'){assert.equal(result.ready,true,JSON.stringify(result));assert.equal(result.echo,'blanc-http3-proof');if(decisions.length)assert.equal(decisions[0].engine_result,0);assert(arrivals.some(r=>r.event==='alpn'&&r.value==='h3'));assert(arrivals.some(r=>r.event==='connect'&&r.accepted));assert(arrivals.some(r=>r.event==='echo'));}
    else {assert.equal(result.ready,false);assert.equal(decisions[0].engine_result,1);assert.equal(arrivals.filter(r=>r.event==='connect').length,0);}
   }
  } finally {if(context)await context.close();fs.rmSync(profile,{recursive:true,force:true});}
 }
 assert.equal(errors.length,0);console.log('PASS: eight real HTTP/3 WebTransport controls');
} finally {server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));await new Promise(r=>pageServer.close(r));fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({results,serverRows,errors},null,2));fs.rmSync(key,{force:true});}
