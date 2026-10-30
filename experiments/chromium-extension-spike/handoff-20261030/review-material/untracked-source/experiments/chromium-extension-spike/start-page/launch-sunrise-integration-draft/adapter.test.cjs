const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'adapter-candidate.js'),'utf8');
const begin=source.indexOf('      data: async () => {');
const end=source.indexOf('      setClock: async partial => {',begin);
assert(begin>=0&&end>begin);
const body=source.slice(begin,end).replace(/^\s*data: /,'').replace(/,\s*$/,'');
async function run({isPrivate=false,claim=true,deny=false,clockError=false}={}) {
  const calls=[];
  const context={
    request(method){calls.push(method);if(method==='launchSunriseClaim')return deny?Promise.reject(Error('unavailable')):Promise.resolve(claim);if(method==='topSites')return Promise.resolve([]);throw Error(method);},
    refreshClock(){calls.push('clock');return clockError?Promise.reject(Error('clock')):Promise.resolve()},
    refreshLayout(){calls.push('layout');return Promise.resolve()},
    preferences:()=>({layout:'billboard'}),isPrivatePage:isPrivate,document:{hidden:false},
  };
  const fn=vm.runInNewContext('('+body+')',context);
  try{return {value:await fn(),calls}}catch(e){return {error:e.message,calls}}
}
(async()=>{
  let r=await run();assert.equal(r.calls[0],'launchSunriseClaim');assert.equal(r.value.launchSunrise,true);assert(r.calls.includes('topSites'));
  console.log('PASS native claim begins before async data reads');
  r=await run({deny:true});assert.equal(r.value.launchSunrise,false);assert.equal(r.value.layout,'billboard');
  console.log('PASS denied claim does not break Start Page data');
  r=await run({isPrivate:true,claim:false});assert.equal(r.value.launchSunrise,false);assert(!r.calls.includes('topSites'));assert.equal(r.calls[0],'launchSunriseClaim');
  console.log('PASS private page records an attempt without reading regular Top Sites');
  r=await run({clockError:true});assert.equal(r.error,'clock');assert.equal(r.calls[0],'launchSunriseClaim');
  console.log('PASS a failed initial data source remains a failure');
  console.log('4 isolated start-data adapter checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
