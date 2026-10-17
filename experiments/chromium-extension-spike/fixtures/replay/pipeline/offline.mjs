// No DNS, HTTP client, upstream imports or live fallback.
import {createRequire} from 'node:module';
import {serve} from './transport.mjs';
const {digest,sanitizeExchange}=createRequire(import.meta.url)('./scrub.cjs');
export function verifyBundle(bundle) {
  const {sha256,...payload}=bundle;
  if(payload.schema!==1||payload.kind!=='sanitized-response-recording'||!Array.isArray(payload.entries)||!payload.entries.length||digest(JSON.stringify(payload))!==sha256)throw new Error('Invalid bundle');
  const entries=new Map();
  for(const row of payload.entries){
    if(entries.has(row.url))throw new Error('Ambiguous response');
    const decoded=Buffer.from(row.body,'base64');
    if(digest(decoded)!==row.sha256)throw new Error('Payload digest mismatch');
    const clean=sanitizeExchange({...row,requestHeaders:Object.entries(row.requestHeaders).flat(),
      responseHeaders:Object.entries(row.headers).flat(),body:decoded});
    if(clean.body!==row.body || JSON.stringify(clean.headers)!==JSON.stringify(row.headers))throw new Error('Unsanitized bundle');
    if(!payload.hosts.includes(new URL(row.url).hostname))throw new Error('Bundle authority mismatch');
    entries.set(row.url,row);
  }
  return entries;
}
export async function startReplay({bundle,tlsMaterial}) {
  const entries=verifyBundle(bundle),faults=[],arrivals=[];
  const fault=code=>faults.push({id:'fault-'+(faults.length+1),code});
  const transport=await serve({hosts:bundle.hosts,tlsMaterial,fault,respond:async(req,res,downstream)=>{
    const url='https://'+req.headers.host+req.url,entry=entries.get(url);
    if(!entry||req.method!==entry.method){fault('unrecorded-request');res.writeHead(502);res.end('Replay miss');return;}
    arrivals.push({url,method:req.method,sha256:entry.sha256,protocol:{downstream,upstream:null}});
    res.writeHead(entry.status,entry.headers);res.end(Buffer.from(entry.body,'base64'));
  }});
  return {...transport,faults,arrivals};
}
