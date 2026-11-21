// Diagnostic-only scheduling barriers. No selected URLs, rules or scriptlet
// code are supplied by the harness. Never install this derivative permanently.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {sha} from './generate.mjs';
export function createRacePayload(source,output){
 assert(!fs.existsSync(output));assert(fs.readFileSync(path.join(source,'js/start.js'),'utf8').includes('.start(true)'));
 fs.cpSync(source,output,{recursive:true,force:false,errorOnExist:true});
 const edits=[];
 function edit(name,anchor,replacement){const p=path.join(output,name),s=fs.readFileSync(p,'utf8');assert.equal(s.split(anchor).length,2,'unique race anchor '+anchor);fs.writeFileSync(p,s.replace(anchor,replacement));edits.push({name,anchor});}
 edit('js/blanc-document-start.js',"const endpoint =",`const control = globalThis.__blancRace = {armed: null, events: [], resume: null, state: current};
async function race(stage, metadata) {
    if (control.armed !== stage) return;
    control.armed = null;
    const event = {stage, metadata, before: current()};control.events.push(event);
    await new Promise(resolve => { control.resume = resolve; });
    event.after = current();control.resume = null;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== 'blanc-race-received' || sender.id !== chrome.runtime.id || !sender.documentId) return;
    void race('after-dispatch', {documentId: sender.documentId, url: sender.url, origin: sender.origin, generation: message.generation}).then(() => reply({resume:true}));
    return true;
});
const endpoint =`);
 for(const [stage,anchor] of [['before-context','    const context = await fetch'],['after-context','    const store = µb.pageStoreFromTabId(job.tabId);'],['after-engine','    const confirmed = await fetch'],['after-confirm',"    return { code: details?.mainWorld || '', generation: state.generation };"]]){
  // The page-store lookup also occurs in the early gate; scope this anchor to
  // lateScript so diagnostic delays cannot stop native document-start work.
  const p=path.join(output,'js/blanc-document-start.js'),s=fs.readFileSync(p,'utf8'),start=s.indexOf('export async function lateScript('),head=s.slice(0,start),tail=s.slice(start);
  assert.equal(tail.split(anchor).length,2);fs.writeFileSync(p,head+tail.replace(anchor,`    await race('${stage}', {identity, generation: state.generation});\n`+anchor));edits.push({name:'js/blanc-document-start.js',stage,anchor});
 }
 edit('js/blanc-static-content.js',"response => {","async response => {");
 edit('js/blanc-static-content.js',"        const script = document.createElement('script');",`        await new Promise(resolve => chrome.runtime.sendMessage({type:'blanc-race-received',generation:response.generation}, () => {void chrome.runtime.lastError;resolve();}));
        const script = document.createElement('script');`);
 const hashes={};for(const name of ['js/blanc-document-start.js','js/blanc-static-content.js'])hashes[name]=sha(fs.readFileSync(path.join(output,name)));
 return {diagnosticOnly:true,interposition:'pause original selection/delivery; never inject replacement payload',edits,hashes};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(createRacePayload(...process.argv.slice(2)),null,2));
