// Reference-only follow-up to the retained native diagnostic delivery fixture.
// Same authored rules and page. Optional isolated correction is explicitly recorded; no native rerun.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';import {openSession,pause} from './session.mjs';
const [configPath,out]=process.argv.slice(2);assert(out&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const config={...JSON.parse(fs.readFileSync(configPath)),nativeTimingTrace:false};
// Resolve from task home explicitly, not from a disposable profile.
const diagnostic=JSON.parse(fs.readFileSync('/Users/anthonyjloria/Documents/ChatGPT/Blanc Browser/Chromium Preview/artifacts/cosmetic-authored-diagnostic-20261028/diagnostic.json'));
config.authoredCosmeticRules=diagnostic.rules;
assert([0,1].includes(config.referenceStartRepetition??0));
const origin='https://operator.blanc-fixture.test';
const body=`<!doctype html><meta charset="utf-8"><title>Authored delivery checks</title><link rel="icon" href="data:,">
<style nonce="fixture">#styled{color:rgb(255,0,0)}span{display:block}</style>
<script nonce="fixture">window.timerTarget=0;window.timerNeutral=0;setTimeout(function blancTimerTarget(){window.timerTarget++},30);setTimeout(function ordinaryTimer(){window.timerNeutral++},30);window.firstScriptRan=true;</script>
<div id="text" class="text">Sponsored</div><div id="styled">Style target</div><section id="upward"><span class="leaf" id="leaf">Upward target</span></section><section id="moved">Move destination</section><section id="xpath-root"><span id="xpath" data-ad="yes">XPath target</span></section><div id="neutral">Ordinary content</div>`;
const fixtures=new Map([[origin+'/case',{status:200,contentType:'text/html',body,policyHeaders:{'Content-Security-Policy':"default-src 'none'; script-src 'nonce-fixture'; style-src 'nonce-fixture'; img-src data:"}}]]);
const root=fs.realpathSync(fs.mkdtempSync(path.join(out,'sessions-'))),certificates=createCertificateSet(path.join(root,'certificates'),['operator.blanc-fixture.test']);
const report={complete:false,scope:config.referenceCosmeticRepair?'isolated corrected reference; same authored rules and page; not shipping acceptance':'unchanged authenticated reference diagnostic',rules:diagnostic.rules,checks:[],sources:[]};let session,replay;
const check=(name,pass)=>{report.checks.push({name,pass:!!pass});};
try{
 for(const kind of ['regular','private'])for(let repetition=(config.referenceStartRepetition??0);repetition<(config.referencePolicyChecks?(config.referenceStartRepetition??0)+1:2);repetition++){
  const label=kind+'-'+repetition;
  replay=await startSynthetic({fixtures,tlsMaterial:certificates});session=await openSession({config,browserKind:'electron',kind,label,root,transport:replay,certificates});
  report.sources.push({kind,repetition,...session.source});
  const page=session.page;page.on('console',message=>{if(message.type()==='error'){report.runtimeErrors??=[];report.runtimeErrors.push({label,text:message.text()});}});await page.setViewportSize({width:1000,height:700});await page.goto(origin+'/case',{waitUntil:'load'});await pause(700);
  const hidden=id=>page.locator('#'+id).evaluate(e=>getComputedStyle(e).display==='none');
  check(label+' page script runs under CSP',await page.evaluate(()=>window.firstScriptRan===true));
  check(label+' timer target defused',await page.evaluate(()=>window.timerTarget===0));check(label+' neutral timer runs',await page.evaluate(()=>window.timerNeutral===1));
  for(const id of ['text','styled','upward','xpath'])check(label+' initial '+id,await hidden(id));
  check(label+' neutral visible',await page.locator('#neutral').isVisible());await page.screenshot({path:path.join(out,label+'-initial.png')});
  await page.evaluate(()=>{document.querySelector('#text').textContent='ordinary';document.querySelector('#styled').style.color='blue';document.querySelector('#xpath').dataset.ad='no';document.querySelector('#moved').append(document.querySelector('#leaf'))});await pause(700);
  for(const id of ['text','styled','upward','xpath'])check(label+' nonmatch reveals '+id,!(await hidden(id)));check(label+' moved upward follows leaf',await hidden('moved'));
  await page.evaluate(()=>new Promise(resolve=>setTimeout(()=>{document.querySelector('#text').textContent='Sponsored';document.querySelector('#styled').style.color='red';document.querySelector('#xpath').dataset.ad='yes';document.querySelector('#upward').append(document.querySelector('#leaf'));resolve()},30)));await pause(700);
  for(const id of ['text','styled','upward','xpath'])check(label+' timer mutation rematches '+id,await hidden(id));check(label+' old move parent revealed',!(await hidden('moved')));
  await page.evaluate(()=>{const p=document.createElement('section');p.id='inserted';p.innerHTML='<span class="text">Sponsored</span><span class="leaf">Inserted leaf</span>';document.body.append(p)});await pause(700);check(label+' inserted subtree evaluated',await hidden('inserted'));check(label+' neutral still visible',await page.locator('#neutral').isVisible());
  if(config.referencePolicyChecks){
    const island=page.context().pages().find(p=>p.url()==='blanc-chrome://index/');assert(island);
    const toggle=async fn=>{const loaded=page.waitForEvent('load',{timeout:30000});await island.evaluate(fn);await loaded;await pause(400);};
    await toggle(()=>window.browserAPI.toggleAdblock());
    check(label+' disabling clears owned CSS',!(await hidden('text')) && !(await hidden('upward')));
    await page.reload({waitUntil:'load'});await pause(400);
    check(label+' disabled reload stays visible',!(await hidden('text')) && !(await hidden('upward')));
    check(label+' disabled reload does not inject scriptlet',await page.evaluate(()=>window.timerTarget===1 && window.timerNeutral===1));
    await toggle(()=>window.browserAPI.toggleAdblock());
    check(label+' reenabled procedural protection',await hidden('text') && await hidden('upward'));
    check(label+' reenabled scriptlet protection',await page.evaluate(()=>window.timerTarget===0 && window.timerNeutral===1));
    await toggle(()=>window.browserAPI.allowAdsOnActiveSite());
    check(label+' site exception clears owned CSS',!(await hidden('text')));
    await page.reload({waitUntil:'load'});await pause(400);
    check(label+' site exception suppresses procedural injection',!(await hidden('text')) && !(await hidden('upward')));
    check(label+' site exception suppresses scriptlet injection',await page.evaluate(()=>window.timerTarget===1));
  }
  await page.screenshot({path:path.join(out,label+'-mutated.png')});await session.close();session=null;await replay.close();replay=null;
 }
 report.failedChecks=report.checks.filter(c=>!c.pass);
 if(!config.referencePolicyChecks)for(const kind of ['regular','private']){const a=report.checks.filter(c=>c.name.startsWith(kind+'-0')).map(c=>c.pass);const b=report.checks.filter(c=>c.name.startsWith(kind+'-1')).map(c=>c.pass);assert.deepEqual(a,b,'Unstable reference outcomes');}
 report.complete=true;if(config.referenceCosmeticRepair && report.failedChecks.length)process.exitCode=1;
}catch(e){report.error=String(e);process.exitCode=1;}finally{if(session)await session.close();if(replay)await replay.close();report.retainedFixtureRoot=root;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({complete:report.complete,error:report.error,checks:report.checks.length}));}
