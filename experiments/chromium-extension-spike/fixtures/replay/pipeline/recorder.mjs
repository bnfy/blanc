// NETWORK-ENABLED acquisition tool. Offline replay never imports this module.
import https from 'node:https';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {serve} from './transport.mjs';
const {safeUrl,headers,sanitizeExchange,digest,Refusal,LIMIT}=createRequire(import.meta.url)('./scrub.cjs');
const publicIPv4=ip=>{
  const p=ip.split('.').map(Number);
  return p.length===4 && p.every(x=>Number.isInteger(x)&&x>=0&&x<=255) &&
    ![0,10,127].includes(p[0]) && !(p[0]===169&&p[1]===254) &&
    !(p[0]===172&&p[1]>=16&&p[1]<=31) && !(p[0]===192&&p[1]===168) &&
    !(p[0]===100&&p[1]>=64&&p[1]<=127) && p[0]<224 &&
    !(p[0]===192&&[0,2].includes(p[1])) && !(p[0]===198&&[18,19,51].includes(p[1])) && !(p[0]===203&&p[1]===0);
};
async function acquire(url, requestHeaders, testOrigin) {
  const u=new URL(url);
  let address;
  if(testOrigin)address='127.0.0.1';
  else {
    const resolved=await dns.lookup(u.hostname,{all:true,family:4});
    if(!resolved.length || resolved.some(r=>!publicIPv4(r.address)))throw new Refusal('nonpublic-upstream');
    address=resolved[0].address;
  }
  return new Promise((resolve,reject)=>{
    const req=https.request({hostname:u.hostname,port:testOrigin?.port||443,path:u.pathname+u.search,
      method:'GET',headers:{...requestHeaders,host:u.host,'accept-encoding':'identity'},
      servername:u.hostname,ca:testOrigin?.ca,rejectUnauthorized:true,
      lookup:(_host,opts,callback)=>opts.all?callback(null,[{address,family:4}]):callback(null,address,4),agent:false,ALPNProtocols:['http/1.1']},res=>{
      const upstream={httpVersion:res.httpVersion,alpn:res.socket?.alpnProtocol||null};
      const chunks=[];let count=0;
      res.on('data',chunk=>{count+=chunk.length;if(count>LIMIT){res.destroy();reject(new Refusal('body-limit'));}else chunks.push(chunk);});
      res.on('error',()=>reject(new Refusal('upstream-read')));
      res.on('end',()=>resolve({status:res.statusCode,responseHeaders:res.rawHeaders,body:Buffer.concat(chunks),
        upstream}));
    });
    req.setTimeout(10000,()=>req.destroy());req.on('error',()=>reject(new Refusal('upstream-transport')));req.end();
  });
}
export async function startRecorder({hosts,tlsMaterial,testOrigin=null}) {
  if(!hosts.length || hosts.some(h=>!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(h)))throw new Error('Invalid public host allowlist');
  if(testOrigin && (!testOrigin.ca || !Number.isInteger(testOrigin.port) || hosts.some(h=>!h.endsWith('.test')&&!h.endsWith('.net'))))throw new Error('Invalid controlled origin');
  const records=new Map(),faults=[];let active=0;
  const fault=code=>faults.push({id:'fault-'+(faults.length+1),code});
  const transport=await serve({hosts,tlsMaterial,fault,respond:async(req,res,downstream)=>{
    active++;
    try {
      const url='https://'+req.headers.host+req.url;safeUrl(url);
      if(req.method!=='GET')throw new Refusal('method-unsupported');
      const cleaned=headers(req.rawHeaders,'request');
      const response=await acquire(url,cleaned.headers,testOrigin);
      const entry=sanitizeExchange({url,method:req.method,requestHeaders:req.rawHeaders,...response,
        protocol:{downstream,upstream:response.upstream}});
      if(records.has(url))throw new Refusal('duplicate-acquisition-url');
      records.set(url,entry);
      res.writeHead(entry.status,entry.headers);res.end(Buffer.from(entry.body,'base64'));
    } catch(error){fault(error instanceof Refusal?error.code:'recording-failed');res.writeHead(502);res.end('Recording refused');}
    finally {active--;}
  }});
  return {...transport,faults,
    freeze(file){
      if(active||faults.length||!records.size)throw new Error('Recording not admissible');
      const payload={schema:1,kind:'sanitized-response-recording',networkMode:testOrigin?'controlled-origin':'public-allowlist',
        hosts,entries:[...records.values()].sort((a,b)=>a.url.localeCompare(b.url))};
      const json=JSON.stringify(payload);const bundle={...payload,sha256:digest(json)};
      fs.writeFileSync(file,JSON.stringify(bundle,null,2),{flag:'wx',mode:0o600});return bundle;
    }};
}
