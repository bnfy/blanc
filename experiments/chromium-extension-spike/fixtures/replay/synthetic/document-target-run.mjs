/* global chrome */
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {openSession,until,pause} from './session.mjs';import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';
const [cfg,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(cfg));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const host='https://page.blanc-fixture.test',body='<!doctype html><link rel="icon" href="data:,"><div id="marker">untouched</div>';
const fixtures=new Map(['/test','/next'].map(p=>[host+p,{status:200,contentType:'text/html',body}]));
const otherHost='https://other.blanc-fixture.test';fixtures.set(otherHost+'/next',{status:200,contentType:'text/html',body});
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-document-target-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(host).hostname,new URL(otherHost).hostname]),replay=await startSynthetic({fixtures,tlsMaterial:certificates});
const report={completed:false,checks:[],latencyMeasured:false,rendererRaceCovered:false};let session;
try{
 session=await openSession({config,browserKind:'chromium',kind:'regular',label:'target',root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});await session.uboConfigure();await session.uboSetFilters('');
 const popup=session.page.context().pages().find(p=>p.url().includes('/popup-fenix.html'));assert(popup);
 await session.page.goto(host+'/test');await pause(200);
 const tab=await popup.evaluate(async()=>{const b=chrome.extension.getBackgroundPage();return (await b.chrome.tabs.query({})).find(t=>t.url==='https://page.blanc-fixture.test/test').id;});
 const snapshot=()=>popup.evaluate(tab=>chrome.webNavigation.getFrame({tabId:tab,frameId:0}),tab);
 const invoke=o=>popup.evaluate(({tab,o})=>new Promise(resolve=>{try{chrome.tabs.executeScript(tab,o,result=>{const error=chrome.runtime.lastError;resolve(error?{error:error.message}:{result});});}catch(e){resolve({error:String(e)});}}),{tab,o});
 const code="document.querySelector('#marker').textContent='targeted'; true";
 let frame=await snapshot();let positive=await invoke({code,frameId:0,blancDocumentId:frame.documentId});assert.equal(positive.result?.[0],true);report.checks.push({kind:'positive-code',frame,result:positive});
 await session.page.goto(host+'/test#same-document');const same=await snapshot();assert.equal(same.documentId,frame.documentId);const sameResult=await invoke({code,blancDocumentId:frame.documentId});assert.equal(sameResult.result?.[0],true);report.checks.push({kind:'same-document',before:frame,after:same,result:sameResult});
 for(const mode of ['same-url','cross-path','cross-origin']){
  await session.page.goto(host+'/test');await pause(100);
  await popup.evaluate(({tab,code})=>{const b=chrome.extension.getBackgroundPage(),p=b.__blancTargetProbe;p.armed=true;p.resume=null;b.__targetResult=null;p.executeScript(tab,{code,frameId:0,runAt:'document_start'}).then(r=>{b.__targetResult=r;});},{tab,code});
  await until(()=>popup.evaluate(()=>!!chrome.extension.getBackgroundPage().__blancTargetProbe.resume));
  const before=await popup.evaluate(()=>chrome.extension.getBackgroundPage().__blancTargetProbe.target);
  await session.page.goto(mode==='cross-origin'?otherHost+'/next':host+(mode==='same-url'?'/test':'/next'));const after=await snapshot();assert.notEqual(before.documentId,after.documentId);
  await popup.evaluate(()=>chrome.extension.getBackgroundPage().__blancTargetProbe.resume());await until(()=>popup.evaluate(()=>chrome.extension.getBackgroundPage().__targetResult!==null));
  const result=await popup.evaluate(()=>chrome.extension.getBackgroundPage().__targetResult);assert.equal(result.length,0);assert.equal(await session.page.locator('#marker').textContent(),'untouched');
  const raw=await invoke({code,blancDocumentId:before.documentId});assert.match(raw.error,/document target/);report.checks.push({kind:mode,before,after,result,raw});
 }
 frame=await snapshot();
 for(const [kind,options] of [['malformed',{blancDocumentId:'bad'}],['all-frames',{blancDocumentId:frame.documentId,allFrames:true}],['wrong-frame',{blancDocumentId:frame.documentId,frameId:999999}]]){const result=await invoke({code,...options});assert(result.error);report.checks.push({kind,result});}
 const other=await session.page.context().newPage();await other.goto(host+'/test');
 const wrong=await popup.evaluate(async()=>{const tabs=await chrome.tabs.query({});const t=tabs.find(t=>t.url==='https://page.blanc-fixture.test/test');return chrome.webNavigation.getFrame({tabId:t.id,frameId:0});});
 const cross=await invoke({code,blancDocumentId:wrong.documentId});assert(cross.error);report.checks.push({kind:'cross-tab',result:cross});await other.close();
 const file=await invoke({file:'/js/contentscript-extra.js',frameId:0,blancDocumentId:frame.documentId});assert(file.result?.length>0);report.checks.push({kind:'positive-file',result:file});
 await session.page.evaluate(url=>new Promise(resolve=>{const f=document.createElement('iframe');f.src=url;f.onload=resolve;document.body.append(f);}),host+'/test');
 const fanout=await popup.evaluate(tab=>chrome.extension.getBackgroundPage().__blancTargetProbe.executeScript(tab,{allFrames:true,code:"document.querySelector('#marker').textContent='fanout';true"}),tab);
 assert.equal(fanout.length,2);assert(fanout.every(v=>v===true));assert.equal(await session.page.locator('#marker').textContent(),'fanout');report.checks.push({kind:'fanout',result:fanout});
 report.completed=true;
}catch(e){report.error=String(e);process.exitCode=1;}finally{if(session)await session.close();report.faults=replay.faults;report.arrivals=replay.arrivals;await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,checks:report.checks.length,error:report.error}));}
