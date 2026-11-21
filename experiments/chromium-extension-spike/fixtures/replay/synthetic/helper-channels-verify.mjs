import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
export function verifyChannels(r,navigation=false){
 assert(r.completed&&!r.error&&r.cleanup.removed&&r.diagnosticScheduling&&!r.latencyMeasured);
 assert.deepEqual(r.checks.map(x=>[x.target,x.mode]),navigation?[['picker','same-url'],['picker','cross-url']]:['logger','noscript','picker'].flatMap(t=>[[t,'drain'],[t,'timeout']]));
 const files={logger:'/js/scriptlets/cosmetic-logger.js',noscript:'/js/scriptlets/noscript-spoof.js',picker:'/js/contentscript-extra.js'};
 for(const x of r.checks){
  assert(x.before.state.ready&&!x.held.state.ready&&x.after.state.ready);
  assert(x.held.state.generation>x.before.state.generation);
  assert.equal(x.before.events.length,1);assert.equal(x.before.events[0].file,files[x.target]);assert(x.before.events[0].resultLength>0);
  assert.equal(x.before.size,1);assert.equal(x.held.size,1);assert.equal(x.after.size,0);
  assert.equal(x.held.reload.settled,x.mode==='timeout');if(x.mode==='timeout')assert.match(x.held.reload.error,/remains held/);
  if(x.target==='noscript'){assert.equal(x.outcome.noscriptCount,0);assert.equal(x.outcome.fallback,'authored fallback');}
  if(x.target==='picker')assert.equal(x.pickerBefore.settled,false);
  if(!navigation&&x.target==='picker'){assert(x.pickerAfter.settled);assert.match(x.pickerAfter.value.pickerURL,/^chrome-extension:\/\//);}
  if(navigation){const i=x.identity;assert.equal(i.entries.length,1);const e=i.entries[0];assert(e.documentId);assert.equal(e.documentId,i.frame.documentId);assert.equal(e.tabId,i.event.tabId);assert.equal(e.frameId,i.event.frameId);assert.equal(e.file,files.picker);assert.notEqual(i.after.frame.documentId,i.frame.documentId);assert.equal(i.after.pending,1);}
 }
 assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 return {verified:true,cases:r.checks.length,postExecutionNavigationIdentity:navigation,preDispatchDocumentTargeting:false,asyncEffects:false,fullAcceptance:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyChannels(JSON.parse(fs.readFileSync(process.argv[2])),process.argv.includes('--navigation')),null,2));
