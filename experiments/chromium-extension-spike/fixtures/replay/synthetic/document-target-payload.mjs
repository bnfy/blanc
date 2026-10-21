import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const [source,dest]=process.argv.slice(2);assert(!fs.existsSync(dest));fs.cpSync(source,dest,{recursive:true});
const file=path.join(dest,'js/blanc-upstream-delivery.js'),s=fs.readFileSync(file,'utf8');
const anchor='return vAPI.tabs.executeScript(tabId, {...options, allFrames:false, frameId:frame.frameId, blancDocumentId:frame.documentId});';assert.equal(s.split(anchor).length,2);
fs.writeFileSync(file,s.replace(anchor,`if (globalThis.__blancTargetProbe.armed) {
 globalThis.__blancTargetProbe.armed=false;
 globalThis.__blancTargetProbe.target={tabId,options,documentId:frame.documentId};
 return new Promise(resolve=>{globalThis.__blancTargetProbe.resume=resolve;}).then(()=>vAPI.tabs.executeScript(tabId,{...options,allFrames:false,frameId:frame.frameId,blancDocumentId:frame.documentId}));
}
${anchor}`)+'\nglobalThis.__blancTargetProbe={executeScript,armed:false};\n');
