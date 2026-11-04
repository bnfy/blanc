// N8 smoke: a new profile gets shipping's network-privacy defaults through
// Chromium's own preferences: WebRTC offers sites only the default route's
// public address ("standard", default_public_interface_only), and secure DNS
// is automatic ("auto"), with Chromium's settings and provider list (V11).
//   node chromium/tests/network-privacy-smoke.mjs runtime-config.json result.json
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
const [configPath,outFile]=process.argv.slice(2);
if(!configPath||!outFile)throw Error('Usage: network-privacy-smoke.mjs runtime-config.json result.json');
const config=JSON.parse(fs.readFileSync(configPath));
const fixture=new NativeFixture();
const result={candidate:config.candidate,checks:{},status:'started'};
try{
 await fixture.launch(config,fs.mkdtempSync(path.join(os.tmpdir(),'blanc-network-privacy-'))+'/case',{diskAssets:false,testHooks:true});
 await installDriver(fixture.host);
 const state=await nativeCall(fixture.host,'networkPrivacy');
 result.checks=state;
 assert.equal(state.webrtcPolicy,'default_public_interface_only');
 assert.equal(state.secureDnsMode,'automatic');
 result.status='passed';
}catch(e){result.status='failed';result.error=String(e.stack||e);}
finally{result.browserExit=await fixture.close();if(result.status==='passed'&&result.browserExit?.code!==0)result.status='failed';
 fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:result.checks,error:result.error?.split('\n')[0]}));}
if(result.status!=='passed')process.exitCode=1;
