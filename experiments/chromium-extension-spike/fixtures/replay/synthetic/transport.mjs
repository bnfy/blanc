// Authored fixture responses only: no recorder, DNS, or upstream fallback.
import {serve} from '../pipeline/transport.mjs';
import {sha} from './generate.mjs';
export function fixturesFor(candidates) {
  const fixtures=new Map();
  for(const c of candidates){
    if(fixtures.has(c.url))throw new Error('Duplicate fixture URL');
    if(sha(c.response.body)!==c.response.sha256)throw new Error('Response digest mismatch');
    fixtures.set(c.url,c.response);
    if(c.descendantUrl) {
      if(fixtures.has(c.descendantUrl))throw new Error('Duplicate descendant');
      fixtures.set(c.descendantUrl,c.descendantResponse);
    }
  }
  return fixtures;
}
export async function startSynthetic({fixtures,tlsMaterial}) {
  const faults=[],arrivals=[];
  const hosts=[...new Set([...fixtures.keys()].map(u=>new URL(u).hostname))];
  const server=await serve({hosts,tlsMaterial,fault:(code,authority)=>faults.push({code,...(authority?{authority: /^[a-z0-9.:-]{1,200}$/.test(authority)?authority:'unrecorded-invalid-authority'}:{})}),respond:async(req,res,protocol)=>{
    const url='https://'+req.headers.host+req.url;
    const response=fixtures.get(url);
    if(req.method!=='GET'||!response){faults.push({code:'unmanifested-request',url});res.writeHead(502);res.end();return;}
    arrivals.push({url,sha256:sha(response.body),protocol:{browserToProxy:protocol,upstream:null}});
    res.writeHead(response.status,{'Content-Type':response.contentType,'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(response.body);
  }});
  return {...server,arrivals,faults};
}
