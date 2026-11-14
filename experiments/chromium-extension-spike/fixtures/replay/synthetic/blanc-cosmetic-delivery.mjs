// Diagnostic-only authored rules; production lists and signed masters untouched.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,pause} from './session.mjs';
const [configPath,out]=process.argv.slice(2);assert(out&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const config={...JSON.parse(fs.readFileSync(configPath)),nativeTimingTrace:false};
// Resolve from task home explicitly, not from a disposable profile.
config.engine='/Users/anthonyjloria/Documents/ChatGPT/Blanc Browser/Chromium Preview/artifacts/cosmetic-authored-diagnostic-20261028';
const origin='https://operator.blanc-fixture.test';
const body=`<!doctype html><meta charset="utf-8"><title>Authored delivery checks</title><link rel="icon" href="data:,">
<style nonce="fixture">#styled{color:rgb(255,0,0)}span{display:block}</style>
<script nonce="fixture">window.timerTarget=0;window.timerNeutral=0;setTimeout(function blancTimerTarget(){window.timerTarget++},30);setTimeout(function ordinaryTimer(){window.timerNeutral++},30);window.firstScriptRan=true;</script>
<div id="text" class="text">Sponsored</div><div id="styled">Style target</div><section id="upward"><span class="leaf" id="leaf">Upward target</span></section><section id="moved">Move destination</section><section id="xpath-root"><span id="xpath" data-ad="yes">XPath target</span></section><div id="neutral">Ordinary content</div>`;
const fixtures=new Map([[origin+'/case',{status:200,contentType:'text/html',body,policyHeaders:{'Content-Security-Policy':"default-src 'none'; script-src 'nonce-fixture'; style-src 'nonce-fixture'; img-src data:"}}]]);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-cosmetic-delivery-'))),certificates=createCertificateSet(path.join(root,'certificates'),['operator.blanc-fixture.test']);
const report={complete:false,scope:'authored diagnostic engine using unchanged native delivery; not pinned production selection',checks:[]};let session,replay;
const check=(name,pass)=>{report.checks.push({name,pass:!!pass});assert(pass,name)};
try{
 for(const kind of ['regular','private']){
  replay=await startSynthetic({fixtures,tlsMaterial:certificates});session=await openSession({config,browserKind:'chromium',kind,label:kind,root,transport:replay,certificates});
  const page=session.page;await page.setViewportSize({width:1000,height:700});await page.goto(origin+'/case',{waitUntil:'load'});await pause(700);
  const hidden=id=>page.locator('#'+id).evaluate(e=>getComputedStyle(e).display==='none');
  check(kind+' page script runs under CSP',await page.evaluate(()=>window.firstScriptRan===true));
  check(kind+' timer target defused',await page.evaluate(()=>window.timerTarget===0));check(kind+' neutral timer runs',await page.evaluate(()=>window.timerNeutral===1));
  for(const id of ['text','styled','upward','xpath'])check(kind+' initial '+id,await hidden(id));
  check(kind+' neutral visible',await page.locator('#neutral').isVisible());await page.screenshot({path:path.join(out,kind+'-initial.png')});
  await page.evaluate(()=>{document.querySelector('#text').textContent='ordinary';document.querySelector('#styled').style.color='blue';document.querySelector('#xpath').dataset.ad='no';document.querySelector('#moved').append(document.querySelector('#leaf'))});await pause(700);
  for(const id of ['text','styled','upward','xpath'])check(kind+' nonmatch reveals '+id,!(await hidden(id)));check(kind+' moved upward follows leaf',await hidden('moved'));
  await page.evaluate(()=>new Promise(resolve=>setTimeout(()=>{document.querySelector('#text').textContent='Sponsored';document.querySelector('#styled').style.color='red';document.querySelector('#xpath').dataset.ad='yes';document.querySelector('#upward').append(document.querySelector('#leaf'));resolve()},30)));await pause(700);
  for(const id of ['text','styled','upward','xpath'])check(kind+' timer mutation rematches '+id,await hidden(id));check(kind+' old move parent revealed',!(await hidden('moved')));
  await page.evaluate(()=>{const p=document.createElement('section');p.id='inserted';p.innerHTML='<span class="text">Sponsored</span><span class="leaf">Inserted leaf</span>';document.body.append(p)});await pause(700);check(kind+' inserted subtree evaluated',await hidden('inserted'));check(kind+' neutral still visible',await page.locator('#neutral').isVisible());
  await page.screenshot({path:path.join(out,kind+'-mutated.png')});await session.close();session=null;await replay.close();replay=null;
 }
 report.complete=true;
}catch(e){report.error=String(e);process.exitCode=1;}finally{if(session)await session.close();if(replay)await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup=!fs.existsSync(root);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({complete:report.complete,error:report.error,checks:report.checks.length}));}
