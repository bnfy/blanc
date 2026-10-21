import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBaseline} from './comparison.mjs';
import {buildCandidates,sha} from './generate.mjs';
import {fixturesFor} from './transport.mjs';
import {pageUrl,pageResponse} from './page.mjs';
function scenario(){
 const text='||ads.fixture.test^$script';
 const c=buildCandidates([{file:'fixture',text,sha256:sha(text)}]).candidates[0];
 const manifest={candidates:[c]},fixtures=fixturesFor([c]);fixtures.set(pageUrl,pageResponse([c]));
 const oracle={stable:true,oracle:[{context:{url:c.url,profile_kind:'regular',resource_type:'script'},decision:'block'}]};
 const urls=[pageUrl,c.url,c.descendantUrl];
 const run={complete:true,nativeBlockerInstalled:false,profileKind:'regular',faults:[],failures:[],
  requests:urls.map((url,i)=>({url,requestId:String(i),method:'GET',type:['Document','Script','Fetch'][i],redirectResponsePresent:false})),
  responses:urls.map((_,i)=>({requestId:String(i),status:200})),finished:['0','1','2'],
  arrivals:urls.map(url=>({url,sha256:sha(fixtures.get(url).body)})),
  execution:{loads:[{id:c.id,event:'load'}],executed:[c.id],children:[c.id]}};
 return {manifest,oracle,run,fixtures};
}
const compare=s=>compareBaseline(s.manifest,s.oracle,s.run,s.fixtures);
test('no-blocker control counts actual loaded blocked script and executed descendant, never acceptance',()=>{
 const r=compare(scenario());assert(r.transportComplete);assert.equal(r.counts.electronBlockedChromiumLoaded,1);assert.equal(r.counts.forkOnlyChildren,1);assert.equal(r.acceptance,false);assert.equal(r.syntheticFixtureParity,null);
});
test('missing response, missing child execution, HTTP failure and cached response fail completeness',()=>{
 for(const change of [r=>r.arrivals.pop(),r=>r.execution.children=[],r=>r.responses[1].status=502,r=>r.responses[1].fromDiskCache=true,r=>r.finished.pop(),r=>r.requests.push({...r.requests[1]})]){
  const s=scenario();change(s.run);assert(!compare(s).transportComplete);
 }
});
test('profile or type mismatch cannot count as a matched comparison',()=>{
 for(const change of [s=>s.oracle.oracle[0].context.profile_kind='private',s=>s.run.requests[1].type='Image',s=>s.oracle.oracle[0].decision='unknown']){
  const s=scenario();change(s);assert(!compare(s).transportComplete);
 }
});
test('unmanifested request and oracle/transport fault fail rather than intersect sets',()=>{
 for(const change of [s=>s.run.requests.push({url:'https://unexpected.test/'}),s=>s.oracle.stable=false,s=>s.run.faults.push({code:'miss'}),s=>s.run.failures.push({errorText:'TLS'})]){
  const s=scenario();change(s);assert(!compare(s).transportComplete);
 }
});
