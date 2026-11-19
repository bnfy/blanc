// Spaces across profiles (F41-83 to F41-92, plan
// docs/superpowers/plans/2026-11-19-fork-spaces-across-profiles.md): each
// profile mirrors its Space list into Local State (blanc.spaces.profiles), so
// another profile's window lists it without loading it. Runs each scenario's
// steps by the fork's means until the shipping runner's inventory moves past
// #1642. Written in Task 3, grown in Task 4, first run after Task 6's build.
//   node chromium/tests/native-spaces-across-profiles.mjs CONFIG OUT
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {createProfile,picker} from './fork-steps/profiles.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[],pending:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-spaces-across-profiles-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const deep=`const find=(selector,root=document)=>{const own=root.querySelector(selector);if(own)return own;for(const el of root.querySelectorAll('*'))if(el.shadowRoot){const found=find(selector,el.shadowRoot);if(found)return found;}return null;};`;
const evaluate=(page,source)=>page.eval(`(()=>{${deep}${source}})()`);
const probe=()=>w.native('spacesMirrorProbe');
const hostApi=(host,call)=>host.cdp.eval(`window.BlancPrototypeHost.api.${call}`);
// A profile's mirrored rows, in order: [{id, name, color, symbol, tabCount}].
const rows=entry=>(entry?.order??[]).map(id=>({id,...entry.items[id]}));
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await visible();await w.reset();

 // mirror written: a Space saved in Work appears under Work's directory alone.
 const work=await createProfile(w,'Work'),workDir=work.directory;
 assert.notEqual(workDir,'Default');
 const saved=await hostApi(work,"saveWorkspaceAs('Sprint')");assert.equal(saved.ok,true,JSON.stringify(saved));
 const sprintId=saved.workspaceId;
 let mirror=(await w.waitFor(probe,p=>rows(p.mirror[workDir]).some(r=>r.name==='Sprint'),'Work mirror written')).mirror;
 assert.deepEqual(rows(mirror[workDir]).map(r=>r.id),[sprintId]);
 assert.deepEqual(Object.keys(mirror[workDir].items[sprintId]).sort(),['color','name','symbol','tabCount']);
 assert.deepEqual(Object.keys(mirror[workDir]).sort(),['items','order']);
 assert.equal(rows(mirror.Default).some(r=>r.id===sprintId),false,'Work\'s Space is not in Personal\'s mirror');
 for(const [directory,entry] of Object.entries(mirror))
  if(directory!==workDir)assert.equal(JSON.stringify(entry).includes('Sprint'),false,`no Work data under ${directory}`);
 result.checks.push('mirror written: one Sprint row under Work, with exactly name, color, symbol and tabCount');

 // mirror follows edits: a rename updates the row, a delete takes it out of order.
 assert.equal((await hostApi(work,`updateWorkspace(${jsLiteral(sprintId)},{name:'Sprint 2'})`)).ok,true);
 await w.waitFor(probe,p=>rows(p.mirror[workDir]).some(r=>r.id===sprintId&&r.name==='Sprint 2'),'renamed row mirrored');
 assert.equal((await hostApi(work,`removeWorkspace(${jsLiteral(sprintId)})`)).ok,true);
 await w.waitFor(probe,p=>!p.mirror[workDir]?.order?.includes(sprintId),'deleted row leaves the mirror');
 result.checks.push('mirror follows edits: rename updates the row, delete removes it from order');

 // listing does not load: Work's Space stays listed after a relaunch that
 // opens only Personal's window.
 const kept=await hostApi(work,"saveWorkspaceAs('Listed')");assert.equal(kept.ok,true,JSON.stringify(kept));
 await w.waitFor(probe,p=>rows(p.mirror[workDir]).some(r=>r.id===kept.workspaceId),'Listed mirrored');
 const workWindow=(await w.call('windowRuntimes')).find(r=>r.profileId===workDir);
 await w.call('closeWindowRuntime',workWindow.id);
 // V18: with two profiles the picker asks at startup; open Personal directly.
 const pick=await picker(w);
 await evaluate(pick,`const ask=find('#askOnStartup');if(ask.checked)ask.click();return true;`);
 await w.waitFor(()=>evaluate(pick,`return find('#askOnStartup').checked;`),v=>v===false,'profile picker off at startup');
 w.profileHosts=new Map();await w.relaunch();
 assert.equal((await nativeCall(f.host,'profileInfo')).directory,'Default');
 const after=await probe();
 assert.equal(after.loaded.includes(workDir),false,`Work not loaded: ${JSON.stringify(after.loaded)}`);
 assert.deepEqual(rows(after.mirror[workDir]).map(r=>r.name),['Listed']);
 result.checks.push('listing does not load: Work stays unloaded and its mirror still lists its Space');

 // rename reaches the heading: renaming Work in the picker renames its group
 // in Personal's Spaces menu. The heading itself comes from Task 4's
 // spaceOtherProfiles; until then only the rename's effect on the mirror runs.
 const renamePick=await picker(w);
 const card=`const cards=[...find('profile-picker-main-view').shadowRoot.querySelectorAll('profile-card')];const card=cards.find(c=>c.profileState.localProfileName==='Work');if(!card)throw Error('Work card missing');`;
 await evaluate(renamePick,card+`const input=find('#nameInput',card.shadowRoot);input.value='Studio';input.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
 assert.deepEqual(rows((await probe()).mirror[workDir]).map(r=>r.name),['Listed'],'the mirror is keyed by directory, not name');
 // Task 4: assert Personal's listWorkspaces() heads Work's Spaces as Studio.
 //  const listed=await w.waitFor(()=>f.host.eval('window.BlancPrototypeHost.api.listWorkspaces()'),
 //    p=>p.otherProfiles?.some(o=>o.id===workDir&&o.name==='Studio'),'renamed heading');
 result.pending.push('rename reaches the heading (Task 4)');
 await visible();
 result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
