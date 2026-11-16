// Paired authored outcome pages using only the unchanged pinned production lists.
// This records differences, including reference features that are disabled.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';
import {createCertificateSet} from './certificate-set.mjs';
import {openSession,pause} from './session.mjs';
const [configPath,out]=process.argv.slice(2);assert(out&&!fs.existsSync(out));
const config={...JSON.parse(fs.readFileSync(configPath)),nativeTimingTrace:false};
fs.mkdirSync(out,{recursive:true});
const cases=[
 {name:'css-important',host:'cosmetic.example',body:'<div id="AC_ad" style="display:block!important">Advertisement</div><div id="neutral">Ordinary content</div>',target:'AC_ad'},
 {name:'youtube-has',host:'youtube.com',body:'<div id="contents"><ytd-rich-item-renderer id="target"><ytd-ad-slot-renderer>Advertisement</ytd-ad-slot-renderer></ytd-rich-item-renderer><ytd-rich-item-renderer id="neutral">Ordinary video</ytd-rich-item-renderer></div>',target:'target'},
 {name:'procedural-text',host:'character.ai',body:'<div class="space-y-4"><div class="w-full" id="target">Advertisement</div><div class="w-full" id="neutral">Ordinary content</div></div>',target:'target'},
 {name:'scriptlet-first-script',host:'accuweather.com',body:'<script>window.observedGPC=navigator.globalPrivacyControl</script><div id="neutral">Scriptlet fixture</div>',expression:'({firstScriptGPC:window.observedGPC===false,neutralVisible:document.getElementById("neutral").getBoundingClientRect().height>0})'},
 {name:'scriptlet-fetch',host:'nicovideo.jp',body:'<div id="neutral">Fetch fixture</div><script>window.outcome={};Promise.all([fetch("/stella-fixture").then(r=>r.text()).then(t=>outcome.target=t).catch(()=>outcome.target="rejected"),fetch("/ordinary-fixture").then(r=>r.text()).then(t=>outcome.neutral=t).catch(()=>outcome.neutral="rejected")]).then(()=>outcome.done=true)</script>',expression:'({target:window.outcome.target,neutral:window.outcome.neutral,done:window.outcome.done})'},
];
const fixtures=new Map(cases.map(c=>['https://'+c.host+'/blanc-outcome',{status:200,contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>'+c.name+'</title>'+c.body}]));
for(const name of ['stella','ordinary'])fixtures.set('https://nicovideo.jp/'+name+'-fixture',{status:200,contentType:'text/plain',body:name+'-response'});
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-paired-cosmetic-')));
const certificates=createCertificateSet(path.join(root,'certificates'),cases.map(c=>c.host));
const report={complete:false,scope:'paired pinned-list authored outcomes; not arbitrary-page completeness or all procedural operators',runs:[],differences:[]};let session,replay;
try{
 for(const browserKind of ['electron','chromium'])for(const kind of ['regular','private'])for(let repetition=0;repetition<2;repetition++){
  replay=await startSynthetic({fixtures,tlsMaterial:certificates});
  session=await openSession({config,browserKind,kind,label:browserKind+'-'+kind+'-'+repetition,root,transport:replay,certificates});
  await session.page.setViewportSize({width:1000,height:700});
  for(const c of cases){
   const start=replay.arrivals.length;await session.page.goto('https://'+c.host+'/blanc-outcome',{waitUntil:'load',timeout:60000});await pause(1500);
   const expression=c.expression||`({hidden:getComputedStyle(document.getElementById(${JSON.stringify(c.target)})).display==='none',neutralVisible:document.getElementById('neutral').getBoundingClientRect().height>0})`;
   const outcome=await session.page.evaluate(expression);
   const capture=browserKind+'-'+kind+'-'+repetition+'-'+c.name+'.png';await session.page.screenshot({path:path.join(out,capture)});
   const assertions=c.target?{targetHidden:outcome.hidden,neutralVisible:outcome.neutralVisible}:c.name==='scriptlet-first-script'?{firstScriptPatched:outcome.firstScriptGPC,neutralVisible:outcome.neutralVisible}:{targetDefused:outcome.done===true&&outcome.target!=='stella-response',neutralReturned:outcome.neutral==='ordinary-response',targetNotSent:!replay.arrivals.slice(start).some(r=>r.url.endsWith('/stella-fixture'))};
   report.runs.push({browserKind,kind,repetition,name:c.name,outcome,assertions,capture,arrivals:replay.arrivals.slice(start)});
  }
  await session.close();session=null;await replay.close();replay=null;
 }
 for(const kind of ['regular','private'])for(const c of cases){const rows=report.runs.filter(r=>r.kind===kind&&r.name===c.name);assert.equal(rows.length,4);const electron=rows.filter(r=>r.browserKind==='electron'),chromium=rows.filter(r=>r.browserKind==='chromium');assert.equal(JSON.stringify(electron[0].outcome),JSON.stringify(electron[1].outcome),'Unstable reference outcome');assert.equal(JSON.stringify(chromium[0].outcome),JSON.stringify(chromium[1].outcome),'Unstable native outcome');if(JSON.stringify(electron[0].outcome)!==JSON.stringify(chromium[0].outcome))report.differences.push({kind,name:c.name,electron:electron[0].outcome,chromium:chromium[0].outcome});}
 report.failedAssertions=report.runs.flatMap(r=>Object.entries(r.assertions).filter(([,pass])=>!pass).map(([name])=>({browserKind:r.browserKind,kind:r.kind,repetition:r.repetition,case:r.name,assertion:name})));report.complete=true;
}catch(e){report.error=String(e);process.exitCode=1;}finally{if(session)await session.close();if(replay)await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup=!fs.existsSync(root);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({complete:report.complete,error:report.error,differences:report.differences.length}));}
