// N16: the trust receipt and Diagnostics in Settings → About, as shipping's
// (src/main/trust-receipt.js buildTrustReceipt; settings.js's About & Trust
// and Diagnostics sections; diagnostics.js's 50-event ledger). Facts are read
// on this device. The crash is a real renderer crash of a fixture tab in the
// test's own profile (CDP Page.crash); nothing of the owner's is touched and
// the report is read through the page, never saved to disk.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
import {inSettings} from './adapters/commands.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-trust-receipt-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const here=path.dirname(fileURLToPath(import.meta.url));
const DIGEST=/kBlancBlockerBundleSha256\[\] = "([0-9a-f]{64})"/.exec(fs.readFileSync(path.join(here,'../blanc/services/blocker/bundle_hash.h'),'utf8'))[1];
// The About section as a person reads it, once the receipt has been checked.
const read=()=>inSettings(w,'help',async(a,d)=>{
 const root=d.find('#blancTrust')?.getRootNode();if(!root)return {missing:'#blancTrust'};
 const text=id=>root.getElementById(id)?.textContent.replace(/\s+/g,' ').trim()??null;
 const end=Date.now()+8000;while(text('blancTrustStatus')==='Checking the installed build…'&&Date.now()<end)await new Promise(r=>setTimeout(r,50));
 return {value:{status:text('blancTrustStatus'),summary:text('blancDiagnosticsSummary'),note:text('blancDiagnosticsStatus'),
  dumps:Number(root.getElementById('blancCrashDumps')?.subLabel),
  rows:Object.fromEntries([...root.querySelectorAll('.blanc-trust-row')].map(r=>[r.dataset.fact,
   {label:r.querySelector('.flex').textContent.trim(),value:r.querySelector('.blanc-trust-value').textContent.trim()}]))}};});
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 const tabId=await w.call('openTab',w.fixtureUrl('secret-page-name'));
 let about=await read();
 assert.equal(about.status,'Receipt checked locally.','expected the receipt checked');
 assert.deepEqual(Object.keys(about.rows),['build','runtime','platform','publisher','blocker','sync','openTabs','usage','suggestions','secureDns','crashLedger'],'expected shipping\'s facts in its order');
 assert.deepEqual(Object.values(about.rows).map(r=>r.label),['Build','Runtime','Platform','Publisher','Combined blocker digest','Sync','Open-tab sharing','Usage measurement','Search suggestions','Secure DNS','Crash ledger']);
 assert.match(about.rows.build.value,/^\S+ \(\S*\) · development$/,`expected this preview build named a development build; found ${about.rows.build.value}`);
 assert.match(about.rows.runtime.value,/^Chromium \d+\.\d+\.\d+\.\d+$/);
 assert.equal(about.rows.platform.value,'macOS · '+(process.arch==='arm64'?'arm64':'x86_64'));
 assert.equal(about.rows.publisher.value,'Development build — not a signed release build','expected an ad hoc signed build reported as one');
 assert.equal(about.rows.blocker.value,DIGEST,'expected the embedded blocker bundle\'s digest');
 assert.equal(about.rows.sync.value,'Off');assert.equal(about.rows.openTabs.value,'Off');
 assert.ok(['On','Off'].includes(about.rows.usage.value)&&['On','Off'].includes(about.rows.suggestions.value));
 assert.equal(about.rows.crashLedger.value,'Device only · automatic upload off · 0/50 events');
 assert.equal(about.summary,'No crashes have been recorded on this device.');
 result.checks.push('About shows shipping\'s receipt facts for this build: version, Chromium, platform, an honest signature status, the blocker digest, Sync, the privacy choices and an empty crash ledger');

 // A real renderer crash of the fixture tab.
 const page=await tabPage(w,tabId);await page.evalExpression('1');
 await page.cdp.send('Page.crash').catch(()=>{});
 about=await w.waitFor(read,a=>a.rows.crashLedger?.value==='Device only · automatic upload off · 1/50 events','the crash reaches the ledger',10000);
 assert.equal(about.summary,'1 crash event recorded on this device.');
 const report=JSON.parse(await inSettings(w,'help',async()=>({value:await (await import('chrome://resources/js/cr.js')).sendWithPromise('blancDiagnosticsReport')})));
 assert.equal(report.crashEvents.length,1);
 assert.deepEqual(Object.keys(report.crashEvents[0]).sort(),['at','process','reason']);
 assert.deepEqual({process:report.crashEvents[0].process,reason:report.crashEvents[0].reason},{process:'renderer',reason:'crashed'});
 const raw=JSON.stringify(report);
 assert.ok(!raw.includes('secret-page-name')&&!raw.includes('127.0.0.1'),'expected nothing of the crashed page in the report');
 result.checks.push('a renderer crash is recorded as a time, a process type and a reason, and the exported report carries nothing of the page');
 result.dumpsAfterCrash=about.dumps;

 // Clear asks first, in shipping's words, then clears the ledger.
 const cleared=await inSettings(w,'help',async(a,d)=>{const b=d.find('#blancDiagnosticsClear');if(!b)return {missing:'#blancDiagnosticsClear'};
  const root=b.getRootNode(),note=()=>root.getElementById('blancDiagnosticsStatus').textContent.trim();
  const ledger=()=>root.querySelector('[data-fact="crashLedger"] .blanc-trust-value').textContent.trim();
  b.click();await new Promise(r=>setTimeout(r,400));const asked=note(),before=ledger();
  b.click();const end=Date.now()+8000;while(note()===asked&&Date.now()<end)await new Promise(r=>setTimeout(r,50));
  return {value:{asked,before,after:note()}};});
 assert.deepEqual(cleared,{asked:'Clear Blanc’s local crash history?',before:'Device only · automatic upload off · 1/50 events',after:'Crash history cleared.'},
  'expected the first click to ask and change nothing, and the second to clear');
 about=await w.waitFor(read,a=>a.rows.crashLedger?.value==='Device only · automatic upload off · 0/50 events','the ledger is empty after Clear',8000);
 assert.equal(about.summary,'No crashes have been recorded on this device.');
 // Chromium keeps its dump files in the app's default data folder, shared
 // with the real preview build on this Mac, so a test launch never deletes
 // them (HandleDiagnosticsClear): only their count is read here.
 assert.equal(about.dumps,result.dumpsAfterCrash,'expected a test launch to leave the shared dump files alone');
 result.checks.push('Clear crash history asks first, then empties the ledger; under test it leaves the shared dump files alone');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
