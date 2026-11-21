// Real engine selection and first-page-script observations; never a latency run.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,pause,until} from './session.mjs';
const [configFile,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const top='https://page.blanc-fixture.test',child='https://child.blanc-control.test',other='https://other.blanc-control.test';
const filters=[`${top.split('//')[1]}##+js(set-constant, frameFlag, true)`,`${child.split('//')[1]}##+js(set-constant, frameFlag, true)`,`${child.split('//')[1]}##+js(no-fetch-if, /prevented)`,`${top.split('//')[1]}##+js(no-fetch-if, /prevented)`,`${top.split('//')[1]}>>##+js(set-constant, ancestorFlag, true)`].join('\n');
const fixtures=new Map();for(const origin of [top,child,other]){
 fixtures.set(origin+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''});
 fixtures.set(origin+'/root',{status:200,contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:,"><title>Frame parent</title>'});
 for(const mode of ['normal','csp']){
  const url=origin+'/'+mode;
  fixtures.set(url,{status:200,contentType:'text/html',body:`<!doctype html>${mode==='csp'?'<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'nonce-fixture\'">':''}<script nonce="fixture">window.first={flag:window.frameFlag===true,ancestor:window.ancestorFlag===true,getter:!!Object.getOwnPropertyDescriptor(window,'frameFlag')?.get};window.firstFetch=fetch('/prevented').then(r=>r.text());</script><link rel="icon" href="data:,"><title>Subframe</title>`});
 }fixtures.set(origin+'/prevented',{status:200,contentType:'text/plain',body:'NETWORK LEAK'});
}
fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify([...fixtures],null,2));fs.writeFileSync(path.join(evidence,'filters.txt'),filters);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-subframe-'))),certificates=createCertificateSet(path.join(root,'certificates'),[top,child,other].map(u=>new URL(u).hostname));let replay,session;
const report={completed:false,latencyMeasured:false,runs:[],gaps:['about:blank/srcdoc/data','sandbox/opaque','fenced frames','arbitrary scriptlets','Electron first-inline protection']};
try{for(const browserKind of ['electron','chromium'])for(const repetition of ['a','b']){
 const label=browserKind+'-'+repetition;replay=await startSynthetic({fixtures,tlsMaterial:certificates});session=await openSession({config,browserKind,kind:'regular',label,root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});await session.uboConfigure();await session.uboSetFilters(filters);const results=[];
 const capture=async(name,frame,expected)=>{const data=await frame.evaluate(async()=>({first:window.first,fetch:await window.firstFetch}));await pause(350);const late=await frame.evaluate(()=>({flag:window.frameFlag===true,ancestor:window.ancestorFlag===true}));assert(data.first,'first inline must actually run');results.push({name,url:frame.url(),expected,...data,late});};
 const add=async(parent,name,url)=>{await parent.evaluate(({name,url})=>{const f=document.createElement('iframe');f.name=name;f.src=url;document.body.append(f);},{name,url});const frame=await until(()=>session.page.frames().find(f=>f.name()===name));await frame.waitForFunction(()=>!!window.first);return frame;};
 await session.page.goto(top+'/root');
 const same=await add(session.page,'same',top+'/normal');await capture('same-origin',same,{flag:true,ancestor:true,fetch:''});
 const cross=await add(session.page,'cross',child+'/normal');await capture('cross-origin',cross,{flag:true,ancestor:true,fetch:''});
 const nested=await add(cross,'nested',other+'/csp');await capture('nested-cross-origin-csp',nested,{flag:false,ancestor:true,fetch:'NETWORK LEAK'});
 await cross.goto(child+'/csp');await capture('cross-csp-navigation',cross,{flag:true,ancestor:true,fetch:''});
 await cross.goto(child+'/csp');await capture('cross-fresh-document',cross,{flag:true,ancestor:true,fetch:''});
 await session.uboSetFilters(filters+'\nchild.blanc-control.test#@#+js(set-constant, frameFlag, true)');await cross.goto(child+'/normal');await capture('child-exception',cross,{flag:false,ancestor:true,fetch:''});
 await session.uboSetFilters(filters);await session.page.goto(other+'/root');const unrelated=await add(session.page,'unrelated',child+'/normal');await capture('same-host-other-ancestor',unrelated,{flag:true,ancestor:false,fetch:''});
 await session.page.goto(top+'/root');const back=await add(session.page,'back',child+'/normal');await capture('same-host-ancestor-restored',back,{flag:true,ancestor:true,fetch:''});
 const run={label,browserKind,source:session.source,results,arrivals:replay.arrivals,faults:replay.faults,records:await session.uboRecords()};fs.writeFileSync(path.join(evidence,label+'.json'),JSON.stringify(run,null,2));report.runs.push({label,cases:results.length});await session.close();session=null;await replay.close();replay=null;console.log(label+' captured');
}report.completed=true;}catch(error){report.error=String(error);process.exitCode=1;}finally{if(session)await session.close();if(replay)await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
