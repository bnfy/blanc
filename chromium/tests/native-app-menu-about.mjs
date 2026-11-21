// The application menu names the app (patch 0075), About opens Blanc's
// Settings sheet at About rather than a full-page tab (patch 0076), and
// Chromium's own text there names the browser Blanc (patch 0077).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-app-menu-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const app=config.executable.replace(/\/Contents\/MacOS\/[^/]+$/,'');
const name=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleName',path.join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim();
// Chromium's own words that stay: its copyright holder and the project it credits.
const KEPT=/The Chromium Authors|Chromium open source project/g;
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await visible();await w.reset();
 const titles=await w.native('appMenuItems');
 result.appMenu=titles;
 assert.equal(titles[0],`About ${name}`);
 assert.ok(titles.includes(`Hide ${name}`),'Hide names the app');
 assert.ok(titles.includes(`Quit ${name}`),'Quit names the app');
 assert.ok(!titles.some(t=>/Chromium/.test(t)),'no item names Chromium');
 result.checks.push(`the application menu names the app: About, Hide and Quit ${name}`);

 const tabs=(await w.state()).tabs.length;
 assert.equal(await w.native('clickAppMenuAbout'),true);
 const sheet=await w.waitFor(async()=>(await f.targets()).find(t=>t.type==='page'&&/^chrome:\/\/settings\/help/.test(t.url)),Boolean,'the Settings sheet at About',8000);
 assert.equal((await w.state()).tabs.length,tabs,'About opens no tab');
 assert.ok(!(await w.state()).tabs.some(t=>/settings|help/.test(t.url)),'no tab shows Settings');
 result.checks.push('About in the application menu opens the Settings sheet at About, not a tab');

 const cdp=await f.connectTarget(sheet);
 const text=await w.waitFor(()=>cdp.eval(`(()=>{const out=[];const walk=r=>{for(const el of r.querySelectorAll('*')){if(el.shadowRoot)walk(el.shadowRoot);}out.push(r.textContent||'');};walk(document);return out.join(' ');})()`),t=>/Blanc/.test(t),'the About page text',8000);
 const stray=text.replace(KEPT,'').match(/.{0,30}\bChromium\b.{0,30}/g)??[];
 result.stray=stray;
 assert.deepEqual(stray,[],'the About page names Chromium only in its credits');
 assert.match(text,/About Blanc|Blanc/);
 result.checks.push('Chromium\'s own About text names the browser Blanc and keeps its credits');
 await w.hostEval('window.BlancPrototypeHost.closeSheet()');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
