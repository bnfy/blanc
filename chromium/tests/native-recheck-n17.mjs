// N17: Invite a Friend (/invite). Shipping v1.49.1 src/main/invite-friend.js:
// a prefilled email (no recipient, subject and body percent-encoded, CRLF
// line breaks) opened in the person's mail app; when no mail app answers,
// the same text on the clipboard and a notice saying so. A test launch opens
// no mail app and uses Blanc's in-memory clipboard, never the Mac's.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {NativeFixture} from "./lib/fixture.mjs";
import {installDriver} from "./lib/test-driver.mjs";
import {assertRendering,assertNodeRuntime} from "./lib/render-guard.mjs";
import {createWorld} from "./world.mjs";
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,"expected a new output folder");fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const visible=()=>assertRendering(e=>f.host.eval(e));
const here=path.dirname(fileURLToPath(import.meta.url));
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-recheck-n17-'));
const overlayText=()=>w.frame('overlay').evaluate(()=>document.getElementById('islandList')?.textContent??'');
const invite=async()=>{
 await w.call('closeOverlay');await w.call('openPanel');
 await w.waitFor(()=>w.call('overlayRendererMode'),m=>m==='panel','the command panel',5000);
 await w.frame('overlay').fill('#addressInput','/invite');await w.frame('overlay').press('#addressInput','Enter');};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 // Shipping's own words, from the strings the Island loads.
 const t=await w.frame('overlay').evaluate(()=>({subject:blancI18n.t('invite.email.subject'),greeting:blancI18n.t('invite.email.greeting'),
  pitch:blancI18n.t('invite.email.pitch'),link:blancI18n.t('invite.email.link',{url:'https://blanc.day/?ref=invite'}),copied:blancI18n.t('slash.invite.copied')}));
 assert.equal(t.subject,'Try Blanc, the browser I use');assert.equal(t.link,'You can download it here: https://blanc.day/?ref=invite');
 const body=[t.greeting,t.pitch,t.link].join('\n\n'),text=`${t.subject}\n\n${body}`;
 const encode=s=>encodeURIComponent(s.replace(/\r?\n/g,'\r\n'));
 const mailto=`mailto:?subject=${encode(t.subject)}&body=${encode(body)}`;

 // 1. A mail app answers: the email it is asked to open is shipping's, and the clipboard is left alone.
 await w.native('setTestClipboard',['untouched']);
 await invite();
 const opened=await w.waitFor(()=>w.native('inviteHandoffs',[]),list=>list.length===1,'one email handed to the mail app',5000);
 assert.deepEqual(opened,[mailto]);
 assert.equal(await w.native('testClipboard',[]),'untouched');
 assert.ok(!(await overlayText()).includes(t.copied),'expected no copied notice when the mail app answers');
 result.checks.push('/invite hands the mail app shipping\'s email: no recipient, its subject, greeting, pitch and the blanc.day invite link');

 // 2. No mail app: the invite text goes to the clipboard and the panel says so.
 await w.native('setInviteMailApp',[false]);
 await invite();
 await w.waitFor(()=>w.native('testClipboard',[]),value=>value===text,'the invite text on the clipboard',5000);
 await w.waitFor(overlayText,value=>value.includes(t.copied),'the copied notice in the panel',5000);
 assert.equal((await w.native('inviteHandoffs',[])).length,1,'expected no second email opened');
 result.checks.push('with no mail app the invite text is on the clipboard and the panel says it was copied');
 await visible();result.result='pass';
}catch(error){result.result=error.code==="BLANC_ENVIRONMENT_STOP"?"blocked-environment":"fail";result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result="fail";process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,"browser.log")))fs.copyFileSync(path.join(f.directory,"browser.log"),path.join(out,"browser.log"));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,"result.json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify(result));
}
