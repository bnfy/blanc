import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import zlib from 'node:zlib';
import {compareReplays} from './stability.mjs';
import {verifyBundle} from './offline.mjs';
const {safeUrl,headers,sanitizeExchange,digest,decision}=createRequire(import.meta.url)('./scrub.cjs');
const exchange=()=>({url:'https://page.example/item?size=small',method:'GET',requestHeaders:['Accept','text/html'],status:200,
  responseHeaders:['Content-Type','text/html','Set-Cookie','session=secret','SET-COOKIE','another=secret'],body:Buffer.from('<p>Public fixture</p>'),protocol:{downstream:{httpVersion:'1.1',alpn:null},upstream:{httpVersion:'1.1',alpn:null}}});
test('scrub removes duplicate cookie/auth headers without retaining values or names',()=>{
 const r=sanitizeExchange({...exchange(),requestHeaders:['Cookie','secret','AUTHORIZATION','Bearer secret','Proxy-Authorization','secret','Accept','text/html']});
 assert(!JSON.stringify(r).includes('secret'));assert.equal(r.transformations.removedRequestHeaders,3);assert.equal(r.transformations.removedResponseHeaders,2);
 assert.deepEqual(r.headers,{'content-type':'text/html'});
});
test('URL identifiers are refused, not rewritten (including encoded forms)',()=>{
 for(const url of ['https://a.example/?token=secret','https://a.example/?userId=alice','https://a.example/?q=a%40example.com','https://a.example/%2561lice%2540example.com','https://u:p@a.example/','https://a.example/#secret','https://a.example/?gclid=abc'])assert.throws(()=>safeUrl(url));
 assert.equal(safeUrl('https://a.example/?size=small'),'https://a.example/?size=small');
});
test('decoded compressed payload is scrubbed before persistence',()=>{
 const r=exchange();r.responseHeaders.push('Content-Encoding','gzip');r.body=zlib.gzipSync(Buffer.from('<p>contact: alice@example.com</p>'));
 assert.throws(()=>sanitizeExchange(r),/sensitive-body/);
 r.body=zlib.gzipSync(Buffer.from('<p>Public</p>'));const clean=sanitizeExchange(r);
 assert.equal(Buffer.from(clean.body,'base64').toString(),'<p>Public</p>');assert(!('content-encoding' in clean.headers));
});
test('body identifiers, JS escapes, unsupported binaries and redirects are refused',()=>{
 for(const body of ['{"sessionId":"secret"}','document.cookie="secret"','<a href="https://x.example/?token=secret">x</a>','\\u0074oken','-----BEGIN PRIVATE KEY-----'])assert.throws(()=>sanitizeExchange({...exchange(),body:Buffer.from(body)}));
 assert.throws(()=>sanitizeExchange({...exchange(),status:302}));
 assert.throws(()=>sanitizeExchange({...exchange(),responseHeaders:['Content-Type','image/png']}));
 assert.throws(()=>sanitizeExchange({...exchange(),responseHeaders:['Content-Type','text/html','Vary','Cookie']}));
});
test('duplicate retained headers and unsafe decision metadata fail closed',()=>{
 assert.throws(()=>headers(['Referer','https://a.example/','referer','https://b.example/'],'request'));
 assert.throws(()=>decision({url:'https://a.example/',referrer:'https://a.example/?token=secret'}));
});
function bundle(){const payload={schema:1,kind:'sanitized-response-recording',networkMode:'controlled-origin',hosts:['page.example'],entries:[sanitizeExchange(exchange())]};return {...payload,sha256:digest(JSON.stringify(payload))};}
test('bundle hashes and payload hashes are verified before replay',()=>{
 const b=bundle();assert.equal(verifyBundle(b).size,1);
 b.entries[0].body=Buffer.from('different').toString('base64');assert.throws(()=>verifyBundle(b));
 const {sha256,...payload}=b;b.sha256=digest(JSON.stringify(payload));assert.throws(()=>verifyBundle(b),/Payload digest/);
});
const environment={appSha:'app',bootstrapSha:'boot',engineSha:'engine',filtersSha:'filters',policySha:'policy',electron:'44.8.0',chromium:'152'};
function run(id){return {runId:id,bundleSha256:'bundle',environment,complete:true,faults:[],records:[
 {url:'https://page.example/',method:'GET',resourceType:'mainFrame',profileKind:'regular',frame:{url:'',topUrl:'',topOrigin:'null'},initiatorOriginPresent:false,initiatorOrigin:null,referrer:'',status:{phase:'ready'},result:{}},
 {url:'https://ad.example/ad.js',method:'GET',resourceType:'script',profileKind:'regular',frame:{url:'https://page.example/',topUrl:'https://page.example/',topOrigin:'https://page.example'},initiatorOriginPresent:true,initiatorOrigin:'https://page.example',referrer:'https://page.example/',status:{phase:'ready'},result:{cancel:true}}
 ],arrivals:[{url:'https://page.example/',sha256:'body'}]};}
test('stable complete replays yield only actual offline decisions',()=>{
 const result=compareReplays(run('a'),run('b'));assert(result.stable);assert.equal(result.oracle.length,2);assert.equal(result.captureProvenanceVerified,false);
});
test('missing or extra requests never become a passing intersection',()=>{
 const a=run('a'),b=run('b');b.records.pop();const result=compareReplays(a,b);assert(!result.stable);assert.deepEqual(result.oracle,[]);
});
test('duplicate same-context requests fail as ambiguous, never deduplicate',()=>{
 const a=run('a'),b=run('b');a.records.push({...a.records[1]});b.records.push({...b.records[1]});assert(!compareReplays(a,b).stable);
});
test('decision, referrer, payload and profile differences are all compared',()=>{
 for(const change of [r=>r.records[1].result={},r=>r.records[1].referrer='',r=>r.arrivals[0].sha256='other',r=>r.records[1].profileKind='private']){
  const b=run('b');change(b);assert(!compareReplays(run('a'),b).stable);
 }
});
test('transport misses, opaque origins and insufficient metadata cannot pass',()=>{
 for(const change of [r=>r.faults.push({code:'unrecorded-request'}),r=>r.records[1].initiatorOrigin='null',r=>r.complete=false,r=>r.environment={}]){
  const b=run('b');change(b);assert(!compareReplays(run('a'),b).stable);
 }
});
test('unique causally classified requests may arrive in a different order',()=>{
 const b=run('b');b.records.reverse();assert(compareReplays(run('a'),b).stable);
});

test('matching omissions cannot turn incomplete observations into a stable oracle',()=>{
 for(const change of [r=>delete r.faults,r=>delete r.records[1].frame.topOrigin,r=>delete r.records[1].referrer,r=>delete r.records[1].result,r=>r.records[1].result.cancel='yes',r=>delete r.arrivals[0].sha256]){
  const a=run('a'),b=run('b');change(a);change(b);assert(!compareReplays(a,b).stable);
 }
});

test('summary-only observer keeps decisions unchanged and never writes rejected URLs',async()=>{
 const {default:vm}=await import('node:vm');
 const {default:fs}=await import('node:fs');
 const writes=[];let observedProvider;
 const coordinator={setGate(){},setProvider(_session,provider){observedProvider=provider;}};
 const module={createBlockingCoordinator:()=>coordinator};
 const context={URL,process:{env:{BLANC_TEST:'0',BLANC_F12_PROFILE:'/profile',BLANC_F12_LOG:'/never-write',BLANC_F12_SUMMARY_ONLY:'1'},versions:{}},
  require(name){
   if(name==='node:fs')return {realpathSync:x=>x,appendFileSync:(...args)=>writes.push(args)};
   if(name==='tldts-experimental')return {getDomain:host=>host};
   if(name==='electron')return {app:{getPath:()=>'/profile'},webContents:{fromId:()=>null}};
   if(name==='./scrub.cjs')return createRequire(import.meta.url)('./scrub.cjs');
   if(name==='./src/main/blocking-coordinator.js')return module;
   if(name==='./src/main/main.js')return {};
   throw new Error('Unexpected module');
  }};
 vm.runInNewContext(fs.readFileSync(new URL('./bootstrap.cjs',import.meta.url),'utf8'),context);
 const result={cancel:true};
 module.createBlockingCoordinator().setProvider({isPersistent:()=>true},{id:'blanc',status:()=>({phase:'ready'}),decide:async()=>result});
 const returned=await observedProvider.decide('onBeforeRequest',{id:1,url:'https://a.example/?token=SECRET_SENTINEL',resourceType:'script',referrer:'',method:'GET'});
 assert.equal(returned,result);assert.equal(writes.length,0);
 const metrics=context.__blancF12Capture.state().metrics;
 assert.equal(metrics.decisions['script|unknown|block|identifier-query'],1);
 assert(!JSON.stringify(metrics).includes('SECRET_SENTINEL'));
 const frame={url:'https://page.example/',origin:'https://page.example',top:{url:'https://page.example/',origin:'https://page.example'}};
 await observedProvider.decide('onBeforeRequest',{id:2,url:'https://asset.example/a.js',resourceType:'script',referrer:'',method:'GET',frame});
 await observedProvider.decide('onBeforeRequest',{id:3,url:'https://page.example/data',resourceType:'xhr',referrer:'',method:'GET',frame});
 assert.equal(metrics.decisions['script|third-party|block|admitted'],1);assert.equal(metrics.decisions['xhr|first-party|block|admitted'],1);
 assert.equal(context.__blancF12Capture.classifyRequest('https://asset.example/a.js').party,'third-party');
 assert.equal(writes.length,0);
});

test('controlled Vary fields are explicit; wildcard, cookies and uncontrolled headers refuse',()=>{
 const row=exchange();row.responseHeaders.push('Vary','Accept-Encoding, Host, Accept');
 const clean=sanitizeExchange(row);assert.deepEqual(clean.varyRequest,{accept:'text/html','accept-encoding':'identity',host:'page.example'});
 for(const vary of ['*','Cookie','Authorization','X-Unknown','Accept-Encoding,'])assert.throws(()=>sanitizeExchange({...exchange(),responseHeaders:['Content-Type','text/html','Vary',vary]}),/vary-unsupported/);
 const payload={schema:1,kind:'sanitized-response-recording',hosts:['page.example'],entries:[clean]};
 clean.varyRequest.accept='different';assert.throws(()=>verifyBundle({...payload,sha256:digest(JSON.stringify(payload))}),/Invalid Vary/);
});
test('only genuinely empty untyped 200 or 204 bodies are admitted',()=>{
 for(const status of [200,204])assert.equal(sanitizeExchange({...exchange(),status,responseHeaders:[],body:Buffer.alloc(0)}).body,'');
 assert.throws(()=>sanitizeExchange({...exchange(),status:204}),/nonempty-204/);
 assert.throws(()=>sanitizeExchange({...exchange(),responseHeaders:[]}),/body-type-unsupported/);
});

test('query prefixes and sensitive substrings retain distinct refusal semantics',()=>{
 for(const key of ['utm_source','x-amz-date','x-goog-credential','prefixTokenSuffix','mySessionValue','aClientIdB'])assert.throws(()=>safeUrl('https://page.test/?'+key+'=value'));
 for(const key of ['autm_source','ax-amz-date','ax-goog-name','title'])assert.equal(safeUrl('https://page.test/?'+key+'=value'),'https://page.test/?'+key+'=value');
});
