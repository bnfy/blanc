// Diagnostic derivative: pause native code and delay the real upstream completion acknowledgement. No
// replacement rules, contexts, outcomes, or native acknowledgement are supplied.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
export function createDeliveryPayload(source,output){
 assert(!fs.existsSync(output));fs.cpSync(source,output,{recursive:true,errorOnExist:true,force:false});
 const edits=[];
 const edit=(file,anchor,value)=>{const p=path.join(output,file),s=fs.readFileSync(p,'utf8');assert.equal(s.split(anchor).length,2);fs.writeFileSync(p,s.replace(anchor,value));edits.push({file,anchor});};
 edit('js/blanc-upstream-delivery.js','// No await separates',`globalThis.__blancDeliveryProbe = {armed:null, state:current, size:()=>upstreamDeliveries.size(), events:[],resume:null};\n// No await separates`);
 edit('js/blanc-upstream-delivery.js','    try {',`    const probe=globalThis.__blancDeliveryProbe;
    const hold=probe.armed==='upstream'||(probe.armed==='procedural'&&options.file==='/js/contentscript-extra.js');const heldPath=probe.armed;if(hold) {probe.armed=null;probe.events.push({path:heldPath,tabId,frameId:options.frameId,file:options.file});}
    try {`);
 edit('js/blanc-upstream-delivery.js','Promise.resolve(vAPI.tabs.executeScript(tabId, options)).finally(',`Promise.resolve(vAPI.tabs.executeScript(tabId, options)).then(async result=>{if(hold){probe.events[probe.events.length-1].resultLength=result.length;await new Promise(resolve=>{probe.resume=resolve;});probe.resume=null;}return result;}).finally(`);
 edit('js/blanc-document-start.js',"body: JSON.stringify({token: job.token, code: details?.mainWorld || ''})",`body: JSON.stringify({token: job.token, code: (()=>{const p=globalThis.__blancDeliveryProbe;if(p.armed!=='native')return details?.mainWorld||'';p.armed=null;p.events.push({path:'native',token:job.token,tabId:job.tabId,frameId:job.frameId});return 'debugger;\\n'+(details?.mainWorld||'');})()})`);
 return {diagnosticOnly:true,edits};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(createDeliveryPayload(...process.argv.slice(2)),null,2));
