// Background-services smoke: Blanc builds never run Chromium's component
// updater, secure network time queries or autofill server predictions
// (blanc/common/background_services.h; the outbound check found them on
// 2026-11-01). The browser is launched through the fixture's recording proxy,
// shows a sign-in form, waits, and the proxy must have seen none of their
// hosts.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
const [configPath,outFile]=process.argv.slice(2);
if(!configPath||!outFile)throw Error('Usage: background-services-smoke.mjs runtime-config.json result.json');
const config=JSON.parse(fs.readFileSync(configPath));
const fixture=new NativeFixture();
const result={candidate:config.candidate,checks:{},status:'started'};
const SERVICE_HOSTS=['update.googleapis.com','clients2.google.com','content-autofill.googleapis.com'];
const hostOf=t=>/^[a-z]+:\/\//i.test(t)?new URL(t).hostname:t.replace(/:\d+$/,'');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 await fixture.launch(config,fs.mkdtempSync(path.join(os.tmpdir(),'blanc-background-'))+'/case',{diskAssets:false});
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
 result.checks.proxied=[...new Set(seen)];
 const services=seen.filter(h=>SERVICE_HOSTS.includes(h));
 assert.deepEqual([...new Set(services)],[],'Chromium background services reached the network');
 result.status='passed';
}catch(e){result.status='failed';result.error=String(e.stack||e);}
finally{result.browserExit=await fixture.close();if(result.status==='passed'&&result.browserExit?.code!==0)result.status='failed';
 fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:result.checks,error:result.error?.split('\n')[0]}));}
if(result.status!=='passed')process.exitCode=1;
