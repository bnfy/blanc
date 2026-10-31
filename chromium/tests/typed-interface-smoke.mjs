// F0.6 smoke for the typed Island interface: the Island host binds the
// navigation group, a navigation through it loads and resolves to the contract
// value, and a Start Page tab (same WebUI controller) is refused.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {connect,waitFor} from './lib/cdp.mjs';
const [configPath,outFile]=process.argv.slice(2);
if(!configPath||!outFile)throw Error('Usage: typed-interface-smoke.mjs runtime-config.json result.json');
const config=JSON.parse(fs.readFileSync(configPath));
const fixture=new NativeFixture();
const result={candidate:config.candidate,checks:{},status:'started'};
try{
 await fixture.launch(config,fs.mkdtempSync(path.join(os.tmpdir(),'blanc-typed-'))+'/case',{diskAssets:false});
 await waitFor(()=>fixture.host.eval('typeof window.BlancBrowserApi?.invoke'),t=>t==='function','typed interface');
 result.checks.bound=true;
 const tab=(await fixture.snapshot()).tabs.find(t=>t.url===fixture.base+'/initial');
 const id=String(tab.id);
 const target=fixture.base+'/typed';
 const navigated=await fixture.host.eval(`window.BlancBrowserApi.invoke('navigate', [${JSON.stringify(id)}, ${JSON.stringify(target)}])`);
 assert.equal(navigated,true,'a finished load resolves to true');
 await waitFor(fixture.snapshot,s=>s.tabs.some(t=>String(t.id)===id&&t.url===target),'tab at the typed URL');
 result.checks.navigate=navigated;
 // Nothing loads for an unknown tab or a non-web address: undefined.
 result.checks.unknownTab=await fixture.host.eval(`window.BlancBrowserApi.invoke('navigate', ['999999', ${JSON.stringify(target)}]).then(v => v === undefined)`);
 result.checks.nonWeb=await fixture.host.eval(`window.BlancBrowserApi.invoke('navigate', [${JSON.stringify(id)}, 'file:///etc/hosts']).then(v => v === undefined)`);
 assert(result.checks.unknownTab&&result.checks.nonWeb,'nothing loads resolves to undefined');
 result.checks.back=await fixture.host.eval(`window.BlancBrowserApi.invoke('goBack', [${JSON.stringify(id)}]).then(v => v === undefined)`);
 await waitFor(fixture.snapshot,s=>s.tabs.some(t=>String(t.id)===id&&t.url===fixture.base+'/initial'),'tab back at /initial');
 // The Island facade itself now routes through the typed interface.
 await fixture.host.eval(`window.BlancPrototypeHost.api.navigate(${JSON.stringify(id)}, ${JSON.stringify(target+'?facade')})`);
 await waitFor(fixture.snapshot,s=>s.tabs.some(t=>String(t.id)===id&&t.url===target+'?facade'),'facade navigation');
 result.checks.facade=true;
 // A Start Page tab shares the WebUI controller but must not bind.
 const before=new Set((await fixture.targets()).map(t=>t.id));
 await fixture.host.eval('window.BlancPrototypeHost.api.createTab()');
 const start=(await waitFor(fixture.targets,ts=>ts.some(t=>t.type==='page'&&!before.has(t.id)),'Start Page')).find(t=>t.type==='page'&&!before.has(t.id));
 const page=await connect(start);fixture.connections.push(page);
 await waitFor(()=>page.eval('document.readyState+" "+location.href'),s=>s.startsWith('complete chrome://blanc-prototype/pages/newtab.html'),"Blanc's Start Page");
 // Raw Mojo, below any page script policy: the browser closes the pipe of a
 // refused binding and keeps an accepted one open.
 const probe=`new Promise(resolve => {
  const {handle0, handle1} = Mojo.createMessagePipe();
  Mojo.bindInterface('blanc.browser_api.mojom.BrowserApiFactory', handle1);
  const watcher = handle0.watch({peerClosed: true}, () => { watcher.cancel(); resolve('closed'); });
  setTimeout(() => resolve('open'), 3000);
 })`;
 result.checks.hostPipe=await fixture.host.eval(probe);
 result.checks.startPagePipe=await page.eval(probe);
 assert.equal(result.checks.hostPipe,'open','the Island host binds');
 result.checks.startPageRefused=result.checks.startPagePipe==='closed';
 const after=(await fixture.snapshot()).tabs.find(t=>String(t.id)===id);
 assert(result.checks.startPageRefused&&after.url===target+'?facade','a Start Page tab cannot navigate tabs');
 result.status='passed';
}catch(e){result.status='failed';result.error=String(e.stack||e);}
finally{result.browserExit=await fixture.close();if(result.status==='passed'&&result.browserExit?.code!==0)result.status='failed';
 fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:result.checks,error:result.error?.split('\n')[0]}));}
if(result.status!=='passed')process.exitCode=1;
