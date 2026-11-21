import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,pause} from './session.mjs';import {sha} from './generate.mjs';import {cosmeticOrigin as origin,cosmeticFilters,cosmeticPage} from './ubo-cosmetic-fixtures.mjs';
const [configPath,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configPath));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-ubo-cosmetic-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(origin).hostname]);
const fixtures=new Map([[origin+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''}],[origin+'/blanc-fixture/cosmetic/normal',cosmeticPage()],[origin+'/blanc-fixture/cosmetic/csp',cosmeticPage(true)],[origin+'/blanc-fixture/cosmetic/prevented',{status:200,contentType:'text/plain',body:'NETWORK LEAK'}],[origin+'/blanc-fixture/cosmetic/allowed',{status:200,contentType:'text/plain',body:'allowed control'}]]);
fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify([...fixtures],null,2));fs.writeFileSync(path.join(evidence,'filters.txt'),cosmeticFilters);
const report={started:new Date().toISOString(),scope:'authored uBO CSS, has-text mutations, document-start constant and fetch scriptlet; regular main frame',nativeBuilds:0,latencyMeasured:false,fullAcceptance:false,runs:[],sources:{},gaps:['other procedural operators and scriptlets','subframes and opaque origins','navigation/recreation lifecycle','private uBO intentionally disabled']};
for(const file of ['ubo-cosmetic-run.mjs','ubo-cosmetic-fixtures.mjs','session.mjs','transport.mjs'])report.sources[file]=sha(fs.readFileSync(new URL(file,import.meta.url)));
let session,replay;
try{for(const browserKind of ['electron','chromium'])for(const repetition of ['a','b']){
 const label=browserKind+'-'+repetition;replay=await startSynthetic({fixtures,tlsMaterial:certificates});session=await openSession({config,browserKind,kind:'regular',label,root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});await session.uboConfigure();await session.uboSetFilters(cosmeticFilters);
 const results=[];
 for(const mode of ['normal','csp']){
  await session.page.goto(origin+'/blanc-fixture/cosmetic/'+mode);await pause(500);
  const snapshots=[];const snapshot=()=>session.page.evaluate(()=>({start:window.fixtureStart,startFlag:window.fixtureStartFlag,currentFlag:window.blancParityFlag===true,elements:Object.fromEntries(['static-ad','control','procedure','negative','dynamic'].map(id=>{const e=document.getElementById(id);return [id,e?{display:getComputedStyle(e).display,text:e.textContent,connected:e.isConnected}:null];}))}));
  snapshots.push({phase:'initial',value:await snapshot()});
  await session.page.evaluate(()=>{const d=document.createElement('div');d.id='dynamic';d.className='procedural';d.textContent='SPONSORED';document.body.append(d);document.getElementById('negative').textContent='SPONSORED';});await pause(500);snapshots.push({phase:'insert-and-text',value:await snapshot()});
  await session.page.evaluate(()=>{document.getElementById('destination').append(document.getElementById('dynamic'));document.getElementById('control').className='procedural';document.getElementById('control').textContent='SPONSORED';});await pause(500);snapshots.push({phase:'move-and-attribute',value:await snapshot()});
  const requests=await session.page.evaluate(async()=>({prevented:await(await fetch('/blanc-fixture/cosmetic/prevented')).text(),allowed:await(await fetch('/blanc-fixture/cosmetic/allowed')).text()}));
  const result={mode,snapshots,requests,preventedArrived:replay.arrivals.some(a=>a.url.endsWith('/prevented'))};results.push(result);
  fs.writeFileSync(path.join(evidence,label+'-'+mode+'.json'),JSON.stringify(result,null,2));
 }
 const run={label,source:session.source,results,arrivals:replay.arrivals,faults:replay.faults,records:await session.uboRecords()};fs.writeFileSync(path.join(evidence,label+'.json'),JSON.stringify(run,null,2));report.runs.push({label});await session.close();session=null;await replay.close();replay=null;console.log(label+' captured');
}report.completed=true;}catch(error){report.error=String(error);process.exitCode=1;}
finally{if(session)await session.close();if(replay)await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};report.finished=new Date().toISOString();fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
