// Header and inherited policy evidence using the ordinary generated provider.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {openSession,pause} from './session.mjs';import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';
const [configFile,payload,evidence]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const host='https://page.blanc-fixture.test',filters='page.blanc-fixture.test##+js(set-constant, cspFlag, true)';
const policies=[['nonce',"script-src 'nonce-fixture'"],['none',"script-src 'none'"],['trusted-types',"require-trusted-types-for 'script'; trusted-types 'none'"],['strict-dynamic',"script-src 'nonce-fixture' 'strict-dynamic'"],['report-only',"script-src 'none'"]];
const body=`<!doctype html><script nonce="fixture">window.first={flag:window.cspFlag===true};window.violations=[];addEventListener('securitypolicyviolation',e=>violations.push({directive:e.effectiveDirective,blocked:e.blockedURI,policy:e.originalPolicy,disposition:e.disposition}));window.ttControl={};try{const s=document.createElement('script');s.textContent='window.pageDynamicControl=true';document.head.append(s);ttControl.assigned=true;}catch(e){ttControl.error=e.name;}</script><script>window.pageInlineControl=true;</script><div id="ready">policy fixture</div>`;
const escaped=body.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const fixtures=new Map([[host+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''}]]);
for(const mode of ['http','srcdoc','blob'])for(const [name,policy] of policies)fixtures.set(`${host}/${mode}/${name}`,{status:200,contentType:'text/html',policyHeaders:{[name==='report-only'?'Content-Security-Policy-Report-Only':'Content-Security-Policy']:policy},body:mode==='http'?body:`<!doctype html><body>${mode==='srcdoc'?`<iframe id="probe" sandbox="allow-scripts" srcdoc="${escaped}"></iframe>`:'authored parent'}`});
fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify({fixtures:[...fixtures],body,filters,policies},null,2));
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-static-policy-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(host).hostname]),replay=await startSynthetic({fixtures,tlsMaterial:certificates});
const report={completed:false,diagnosticScheduling:false,latencyMeasured:false,checks:[],console:[],errors:[]};let session,currentCase='setup';
try{
 session=await openSession({config,browserKind:'chromium',kind:'regular',label:'policy',root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});report.source=session.source;await session.uboConfigure();await session.uboSetFilters(filters);
 const popup=session.page.context().pages().find(p=>p.url().includes('/popup-fenix.html'));assert(popup);
 session.page.on('pageerror',e=>report.errors.push({case:currentCase,error:String(e)}));session.page.on('console',m=>{if(m.type()==='error')report.console.push({case:currentCase,text:m.text()});});
 for(const mode of ['http','srcdoc','blob'])for(const [name,policy] of policies){
  currentCase=mode+':'+name;await popup.evaluate(()=>{globalThis.chrome.extension.getBackgroundPage().__blancStaticRows.length=0;});
  const response=await session.page.goto(`${host}/${mode}/${name}`),headers=await response.allHeaders();
  if(mode==='blob')await session.page.evaluate(body=>{const f=document.createElement('iframe');f.id='probe';f.src=URL.createObjectURL(new Blob([body],{type:'text/html'}));document.body.append(f);},body);
  const frame=mode==='http'?session.page:await (await session.page.$('#probe')).contentFrame();await frame.waitForSelector('#ready');await pause(350);
  const snapshot=await frame.evaluate(()=>({first:window.first??null,ttControl:window.ttControl??null,pageInlineControl:window.pageInlineControl===true,pageDynamicControl:window.pageDynamicControl===true,flag:window.cspFlag===true,counts:window.__blancScriptletGateCounts,origin:window.origin,url:location.href,violations:window.violations??null}));
  const messages=await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancStaticRows);
  report.checks.push({mode,name,policy,headers,snapshot,messages});assert(snapshot.flag);assert.equal(snapshot.counts.bodies,1);
 }
 report.completed=true;
}catch(error){report.error=String(error);process.exitCode=1;}finally{if(session){report.records=session.records();await session.close();}report.arrivals=replay.arrivals;report.faults=replay.faults;await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,cases:report.checks.length,error:report.error}));}
