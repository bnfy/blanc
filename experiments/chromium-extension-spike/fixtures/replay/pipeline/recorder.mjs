// NETWORK-ENABLED acquisition tool. Offline replay never imports this module.
import https from 'node:https';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {serve} from './transport.mjs';
const {safeUrl,headers,sanitizeExchange,digest,Refusal,LIMIT}=createRequire(import.meta.url)('./scrub.cjs');
export const publicIPv4=ip=>{
  const p=ip.split('.').map(Number);
  return p.length===4 && p.every(x=>Number.isInteger(x)&&x>=0&&x<=255) &&
    ![0,10,127].includes(p[0]) && !(p[0]===169&&p[1]===254) &&
    !(p[0]===172&&p[1]>=16&&p[1]<=31) && !(p[0]===192&&p[1]===168) &&
    !(p[0]===100&&p[1]>=64&&p[1]<=127) && p[0]<224 &&
    !(p[0]===192&&p[1]===0&&[0,2].includes(p[2])) &&
    !(p[0]===198&&[18,19].includes(p[1])) && !(p[0]===198&&p[1]===51&&p[2]===100) &&
    !(p[0]===203&&p[1]===0&&p[2]===113);
};
async function acquire(url, requestHeaders, testOrigin, headersOnly=false) {
  const u=new URL(url);
  let address;
  if(testOrigin)address='127.0.0.1';
  else {
    const resolved=await dns.lookup(u.hostname,{all:true,family:4});
    if(!resolved.length || resolved.some(r=>!publicIPv4(r.address)))throw new Refusal('nonpublic-upstream');
    address=resolved[0].address;
  }
  // A controlled-origin CA is local trust configuration, never request data.
  // Keep it out of the outbound request options; production uses system trust.
  const secureContext = testOrigin ? tls.createSecureContext({ca:testOrigin.ca}) : undefined;
  const agent = new https.Agent({secureContext, rejectUnauthorized:true, keepAlive:false});
  return new Promise((resolve,reject)=>{
    const req=https.request({hostname:u.hostname,port:testOrigin?.port||443,path:u.pathname+u.search,
      method:'GET',signal:AbortSignal.timeout(15000),headers:{...requestHeaders,host:u.host,'accept-encoding':'identity'},
      servername:u.hostname,rejectUnauthorized:true,
      lookup:(_host,opts,callback)=>opts.all?callback(null,[{address,family:4}]):callback(null,address,4),agent,ALPNProtocols:['http/1.1']},res=>{
      const upstream={httpVersion:res.httpVersion,alpn:res.socket?.alpnProtocol||null};
      if(headersOnly){resolve({status:res.statusCode,responseHeaders:res.rawHeaders,upstream});res.destroy();return;}
      const chunks=[];let count=0;
      res.on('data',chunk=>{count+=chunk.length;if(count>LIMIT){res.destroy();reject(new Refusal('body-limit'));}else chunks.push(chunk);});
      res.on('error',()=>reject(new Refusal('upstream-read')));
      res.on('end',()=>resolve({status:res.statusCode,responseHeaders:res.rawHeaders,body:Buffer.concat(chunks),
        upstream}));
    });
    req.setTimeout(10000,()=>req.destroy());req.on('error',()=>reject(new Refusal('upstream-transport')));req.end();
  });
}
export async function startRecorder({hosts,tlsMaterial,testOrigin=null,classifyRequest=null}) {
  if(!hosts.length || hosts.some(h=>!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(h)))throw new Error('Invalid public host allowlist');
  if(testOrigin && (!testOrigin.ca || !Number.isInteger(testOrigin.port) || hosts.some(h=>!h.endsWith('.test')&&!h.endsWith('.net'))))throw new Error('Invalid controlled origin');
  const records=new Map(),faults=[],audit=[];let active=0;
  const fault=code=>faults.push({id:'fault-'+(faults.length+1),code});
  const transport=await serve({hosts,tlsMaterial,fault,respond:async(req,res,downstream)=>{
    active++;
    const destination=['document','script','image','style','font','iframe','worker','serviceworker','empty'].includes(req.headers['sec-fetch-dest'])?req.headers['sec-fetch-dest']:'unknown';
    let status=null,category={resourceType:'unknown',party:'unknown'};
    try {
      const url='https://'+req.headers.host+req.url;
      if(classifyRequest){const observed=await classifyRequest(url);if(['mainFrame','subFrame','script','image','stylesheet','xhr','font','ping','other','unknown'].includes(observed?.resourceType)&&['first-party','third-party','unknown'].includes(observed?.party))category=observed;}
      safeUrl(url);
      if(req.method!=='GET')throw new Refusal('method-unsupported');
      const cleaned=headers(req.rawHeaders,'request');
      const response=await acquire(url,cleaned.headers,testOrigin);status=response.status;
      const entry=sanitizeExchange({url,method:req.method,requestHeaders:req.rawHeaders,...response,
        protocol:{downstream,upstream:response.upstream}});
      if(records.has(url))throw new Refusal('duplicate-acquisition-url');
      records.set(url,entry);
      audit.push({outcome:'admitted',destination,...category,status,reason:null});
      res.writeHead(entry.status,entry.headers);res.end(Buffer.from(entry.body,'base64'));
    } catch(error){const code=error instanceof Refusal?error.code:'recording-failed';audit.push({outcome:'refused',destination,...category,status,reason:code});fault(code);res.writeHead(502);res.end('Recording refused');}
    finally {active--;}
  }});
  return {...transport,faults,audit,pending:()=>active,
    freeze(file){
      if(active||faults.length||!records.size)throw new Error('Recording not admissible');
      const payload={schema:1,kind:'sanitized-response-recording',networkMode:testOrigin?'controlled-origin':'public-allowlist',
        hosts,entries:[...records.values()].sort((a,b)=>a.url.localeCompare(b.url))};
      const json=JSON.stringify(payload);const bundle={...payload,sha256:digest(json)};
      fs.writeFileSync(file,JSON.stringify(bundle,null,2),{flag:'wx',mode:0o600});return bundle;
    }};
}

// Preflight only: resolved entrypoints become new roots, never admitted redirect hops.
export async function resolveEntrypoint(initial, requestHeaders={}, testOrigin=null) {
  const hops=[];let current=initial;const seen=new Set();
  try {
    for(let count=0;count<6;count++){
      safeUrl(current);const parsed=new URL(current);
      if(parsed.protocol!=='https:'||(parsed.port&&parsed.port!=='443'))throw new Refusal('entrypoint-scheme-or-port');
      if(seen.has(current))throw new Refusal('entrypoint-loop');seen.add(current);
      const response=await acquire(current,headers(Object.entries(requestHeaders).flat(),'request').headers,testOrigin,true);
      hops.push({url:current,status:response.status});
      if(![301,302,303,307,308].includes(response.status))return {original:initial,final:current,hops,status:response.status};
      const locations=[];for(let i=0;i<response.responseHeaders.length;i+=2)if(response.responseHeaders[i].toLowerCase()==='location')locations.push(response.responseHeaders[i+1]);
      if(locations.length!==1)throw new Refusal('entrypoint-location');
      const next=new URL(locations[0],current).href;safeUrl(next);current=next;
    }
    throw new Refusal('entrypoint-hop-limit');
  } catch(error){return {original:initial,final:null,hops,error:error instanceof Refusal?error.code:'entrypoint-resolution-failed'};}
}
