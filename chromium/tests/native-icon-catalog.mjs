// The preview deliberately has no Patron activation. Check the independent
// icon catalog and invalid legacy preference handling without claiming F17-2.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {inSettings} from './adapters/commands.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-icon-catalog-'));
try {
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 const catalog=await inSettings(w,'appearance',async(a,d)=>{const select=d.find('#blancAppIcon')?.shadowRoot?.querySelector('select');return select?{value:[...select.options].filter(o=>!o.disabled&&!o.hidden).map(o=>o.value)}:{missing:'#blancAppIcon'};});
 assert.deepEqual(catalog,['sunrise','sunrise-dark','sunrise-gold','sunrise-spectrum','sunrise-amber']);
 for(const icon of catalog){await w.call('setAppIcon',icon);await w.waitFor(()=>w.call('appIcon'),value=>value===icon,'catalog icon '+icon);}
 result.checks.push('the five shipping catalog icons remain selectable without a Patron key');
 await inSettings(w,'appearance',async()=>{await new Promise((resolve,reject)=>chrome.settingsPrivate.setPref('blanc.app_icon','ember','',ok=>ok?resolve():reject(Error('Preference rejected'))));return {value:true};});
 await w.waitFor(()=>w.call('appIcon'),value=>value==='sunrise','retired icon normalized');
 const stored=await inSettings(w,'appearance',async()=>({value:(await new Promise(resolve=>chrome.settingsPrivate.getPref('blanc.app_icon',resolve))).value}));
 assert.equal(stored,'sunrise');result.checks.push('a retired saved icon is normalized to Sunrise in native preferences and snapshot');
 await w.relaunch();assert.equal(await w.call('appIcon'),'sunrise');
 result.checks.push('the normalized Sunrise choice survives restart');
 await assertRendering(e=>f.host.eval(e));result.result='pass';
} catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally {const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
