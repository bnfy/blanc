// Opt-in local timing capture. Native context is verified by digest, never inferred
// from the selected tab. The recovered values are labeled oracle bindings.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex').toUpperCase();
export function decodeNativeTiming(event,request,expected,reference){
 const a=event.args?.debug||event.args;
 assert(a&&request&&expected&&reference,'Missing native timing join');
 assert.equal(a.request_digest,digest(request.requestId),'Wrong native request join');
 assert.equal(request.url,expected.context.url,'Wrong CDP URL join');
 const c=expected.context;
 const fields=[c.url,c.method,c.resource_type,c.initiator_origin,c.top_frame_origin,c.frame_role,c.profile_kind,c.redirect_index,reference.referrer];
 assert(fields.every(v=>v!==undefined),'Incomplete independently frozen context');
 assert.equal(a.context_digest,digest(JSON.stringify(fields)),'Native context digest mismatch');
 assert(Number.isFinite(a.hook_to_decision_us)&&a.hook_to_decision_us>=0,'Invalid native clock interval');
 assert([0,1].includes(a.result),'Unready/unsupported native decision');
 return {...c,referrer:reference.referrer,decision:a.result===0?'allow':'block',engine_result:a.result,status:'ready',hook_to_decision_us:a.hook_to_decision_us,nativeContextDigestVerified:true,contextValuesRecoveredFromFrozenOracle:true};
}
export async function startNativeTiming(browser,page){
 const network=await page.context().newCDPSession(page),tracing=await browser.newBrowserCDPSession();
 const requests=new Map(),rows=[],diagnostics=[];let events=[];
 network.on('Network.requestWillBeSent',p=>{requests.set(digest(p.requestId),{requestId:p.requestId,url:p.request.url});});
 await network.send('Network.enable');
 tracing.on('Tracing.dataCollected',p=>events.push(...p.value.filter(e=>e.name==='Blanc.DecisionTiming')));
 const start=()=>tracing.send('Tracing.start',{transferMode:'ReportEvents',traceConfig:{recordMode:'recordUntilFull',traceBufferSizeInKb:32768,includedCategories:['disabled-by-default-blanc.latency'],excludedCategories:['*']}});
 await start();
 return {rows:()=>rows,diagnostics:()=>diagnostics,async capture(expected,reference){
  const done=new Promise(resolve=>tracing.once('Tracing.tracingComplete',resolve));await tracing.send('Tracing.end');const completion=await done;assert(!completion.dataLossOccurred,'Native timing trace lost events');
  const batch=events;events=[];diagnostics.push(...batch);
  for(const event of batch){const a=event.args?.debug||event.args;const request=requests.get(a?.request_digest);assert(request,'Native timing lacks independent CDP request');const e=expected.get(request.url);assert(e,'Unexplained native timing request: '+request.url);rows.push(decodeNativeTiming(event,request,e,reference.get(request.url)));}
  await start();
 },async close(){await tracing.send('Tracing.end').catch(()=>{});await network.detach();await tracing.detach();}};
}
