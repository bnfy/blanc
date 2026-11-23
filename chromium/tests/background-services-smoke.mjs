// Background-services smoke: Blanc builds never run Chromium's component
// updater, secure network time queries, autofill server predictions or Google
// AI Mode's eligibility check (blanc/common/background_services.h; the
// outbound check found the first three on 2026-11-01, and the AI Mode check
// asked www.google.com from a private window on 2026-11-23). The browser is
// launched through the fixture's recording proxy, in a normal and then a
// private window, shows a sign-in form, waits, and the proxy must have seen
// none of their hosts.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
const [configPath,outFile]=process.argv.slice(2);
if(!configPath||!outFile)throw Error('Usage: background-services-smoke.mjs runtime-config.json result.json');
const config=JSON.parse(fs.readFileSync(configPath));
const result={candidate:config.candidate,checks:{},status:'started'};
const SERVICE_HOSTS=['update.googleapis.com','clients2.google.com','content-autofill.googleapis.com','www.google.com'];
const hostOf=t=>/^[a-z]+:\/\//i.test(t)?new URL(t).hostname:t.replace(/:\d+$/,'');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 for(const privateMode of [false,true]){
  const fixture=new NativeFixture();
  const name=privateMode?'private':'normal';
  try{
   await fixture.launch(config,fs.mkdtempSync(path.join(os.tmpdir(),'blanc-background-'))+'/case',{diskAssets:false,privateMode});
   const page=fixture.page;
   await page.eval(`(() => { const f = document.createElement('form'); f.action = '/signin'; f.method = 'post';
    for (const [name, type, auto] of [['email', 'email', 'username'], ['password', 'password', 'current-password'], ['name', 'text', 'name'], ['address', 'text', 'street-address']]) {
     const i = document.createElement('input'); i.name = name; i.type = type; i.autocomplete = auto; f.append(i); }
    const b = document.createElement('button'); b.textContent = 'Sign in'; f.append(b); document.body.append(f);
    f.querySelector('input').focus(); })()`);
   // The component updater's first check runs seconds after launch; autofill
   // asks about a form once it is parsed.
   await pause(15000);
   const seen=fixture.egress.map(r=>hostOf(r.target));
   result.checks[name]=[...new Set(seen)];
   const services=seen.filter(h=>SERVICE_HOSTS.includes(h));
   assert.deepEqual([...new Set(services)],[],`Chromium background services reached the network (${name} window)`);
  }finally{
   result.browserExit={...result.browserExit,[name]:await fixture.close()};
  }
  if(result.browserExit[name]?.code!==0)throw Error(`the browser exited with ${JSON.stringify(result.browserExit[name])} (${name} window)`);
 }
 result.status='passed';
}catch(e){result.status='failed';result.error=String(e.stack||e);}
finally{
 fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:result.checks,error:result.error?.split('\n')[0]}));}
if(result.status!=='passed')process.exitCode=1;
