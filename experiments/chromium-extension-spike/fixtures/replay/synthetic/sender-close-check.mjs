import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const [directory]=process.argv.slice(2);
const origin='https://page.blanc-fixture.test', blocked='https://000491b06a.com';
const results=[];
for(const kind of ['regular','private'])for(const mechanism of ['keepalive','beacon']){
 const label=kind+'-'+mechanism,r=JSON.parse(fs.readFileSync(path.join(directory,label+'.json')));
 assert(r.senderClosed&&r.targetDestroyed&&r.survivorAlive);
 assert.equal(r.source.isOffTheRecord,kind==='private');
 assert(r.records.some(x=>x.event==='engine-ready'&&x.bundle_sha256==='9acdfb68963e89c9c9be04a1a68ae831c7c35b800555790cadc8575a7172382d'));
 const close=r.events.findIndex(x=>x.type==='sender-close-confirmed');
 assert(close>r.events.findIndex(x=>x.type==='target-destroyed'));
 assert(r.events.filter(x=>x.type==='redirect-release').length===2);
 for(let i=0;i<r.events.length;i++)if(r.events[i].type==='redirect-release')assert(i>close);
 assert(r.controls[0].status===200&&r.controls[1].error==='TypeError');
 if(mechanism==='beacon')assert(r.enqueue.every(x=>x.queued===true));
 for(const outcome of ['allow','block']){
  const initial=r.records.filter(x=>x.url===origin+'/hold-'+outcome);
  const terminal=r.records.filter(x=>x.url===(outcome==='allow'?origin:blocked)+'/finish-'+outcome);
  assert.equal(initial.length,1);assert.equal(terminal.length,1);
  const a=initial[0],b=terminal[0];
  assert.equal(b.decision,outcome);assert.equal(b.status,'ready');assert.equal(b.engine_result,outcome==='allow'?0:1);
  assert.equal(b.redirect_index,1);assert.equal(b.method,'POST');assert.equal(b.resource_type,mechanism==='beacon'?'ping':'xhr');
  assert.equal(b.profile_kind,kind);assert.equal(b.initiator_origin,origin);assert.equal(b.top_frame_origin,origin);
  assert.equal(b.referrer,origin+(outcome==='allow'?'/entry':'/'));
  for(const key of ['devtools_request_id','loader_request_id','factory_instance']){assert(a[key]!=null);assert.equal(a[key],b[key]);}
 }
 assert.equal(r.terminalArrivals.length,1);const arrival=r.terminalArrivals[0];
 assert.equal(arrival.url,origin+'/finish-allow');assert.equal(arrival.method,'POST');assert.equal(arrival.bodySha256,r.expectedBodySha256);
 assert(arrival.at>=r.events[close].at);
 assert(!r.arrivals.some(x=>x.url.startsWith(blocked)));
 assert(!r.faults.some(x=>['unmanifested','authority-mismatch','responder-failed'].includes(x.code)));
 results.push({label,passed:true,postCloseRedirectDecisions:2,allowedPostBodyPreserved:true,blockedTerminalAbsent:true});
}
console.log(JSON.stringify({results,passed:true,scope:'pre-enqueued requests; 307 released after target destruction; three-second bounded observation',fullF12Acceptance:false,pairedElectronParity:false},null,2));
