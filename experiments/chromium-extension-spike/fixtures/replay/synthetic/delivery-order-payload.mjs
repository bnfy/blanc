// Diagnostic derivative: pause native code and delay the real upstream completion acknowledgement. No
// replacement rules, contexts, outcomes, or native acknowledgement are supplied.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
export function createDeliveryPayload(source,output){
 assert(!fs.existsSync(output));fs.cpSync(source,output,{recursive:true,errorOnExist:true,force:false});
 const edits=[];
 const edit=(file,anchor,value)=>{const p=path.join(output,file),s=fs.readFileSync(p,'utf8');assert.equal(s.split(anchor).length,2);fs.writeFileSync(p,s.replace(anchor,value));edits.push({file,anchor});};
 edit('js/blanc-upstream-delivery.js','export function executeScript',`import logger from './logger.js';\nglobalThis.__blancDeliveryProbe = {enableLogger:()=>logger.readAll('blanc-fixture'),armed:null, state:current, size:()=>upstreamDeliveries.size(), events:[],resume:null};\nexport function executeScript`);
 edit('js/blanc-upstream-delivery.js','        return vAPI.tabs.executeScript(tabId, {...options, allFrames:false, frameId:frame.frameId, blancDocumentId:frame.documentId});',`        const probe=globalThis.__blancDeliveryProbe;
        const hold=probe.armed==='upstream'||(['procedural','picker'].includes(probe.armed)&&options.file==='/js/contentscript-extra.js')||(probe.armed==='logger'&&options.file==='/js/scriptlets/cosmetic-logger.js')||(probe.armed==='noscript'&&options.file==='/js/scriptlets/noscript-spoof.js');const heldPath=probe.armed;if(hold){probe.armed=null;probe.events.push({path:heldPath,tabId,frameId:options.frameId,file:options.file});}
        return Promise.resolve(vAPI.tabs.executeScript(tabId,{...options,allFrames:false,frameId:frame.frameId,blancDocumentId:frame.documentId})).then(async result=>{if(hold){probe.events[probe.events.length-1].resultLength=result.length;await new Promise(resolve=>{probe.resume=resolve;});probe.resume=null;}return result;});`);
 edit('js/blanc-document-start.js',"body: JSON.stringify({token: job.token, code: details?.mainWorld || ''})",`body: JSON.stringify({token: job.token, code: (()=>{const p=globalThis.__blancDeliveryProbe;if(p.armed!=='native')return details?.mainWorld||'';p.armed=null;p.events.push({path:'native',token:job.token,tabId:job.tabId,frameId:job.frameId});return 'debugger;\\n'+(details?.mainWorld||'');})()})`);
 edit('js/blanc-upstream-delivery.js','export function executeScript',`globalThis.__blancHelperDocuments=[];
chrome.runtime.onMessage.addListener((m,s)=>{if(m?.type==='blanc-helper-entry'&&s.id===chrome.runtime.id&&s.tab&&Number.isInteger(s.frameId)&&typeof s.documentId==='string')globalThis.__blancHelperDocuments.push({file:m.file,documentId:s.documentId,frameId:s.frameId,tabId:s.tab.id,url:s.url,origin:s.origin});});
export function executeScript`);
 for(const file of ['js/contentscript-extra.js','js/scriptlets/cosmetic-logger.js','js/scriptlets/noscript-spoof.js']){
  const p=path.join(output,file),original=fs.readFileSync(p,'utf8');
  fs.writeFileSync(p,`chrome.runtime.sendMessage({type:'blanc-helper-entry',file:${JSON.stringify('/'+file)}},()=>{void chrome.runtime.lastError;});\n`+original);
  edits.push({file,diagnostic:'actual MessageSender at helper entry; original body unchanged'});
 }
 return {diagnosticOnly:true,edits};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(createDeliveryPayload(...process.argv.slice(2)),null,2));
