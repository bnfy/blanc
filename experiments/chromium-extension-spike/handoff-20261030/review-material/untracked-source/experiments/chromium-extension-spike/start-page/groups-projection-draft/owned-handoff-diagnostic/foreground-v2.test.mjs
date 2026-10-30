import {test} from 'node:test';import {strict as assert} from 'node:assert';import fs from 'node:fs';
const s=fs.readFileSync(new URL('../browser-check-groups-owned-foreground-v2-diagnostic.mjs',import.meta.url),'utf8');
test('launch gate precedes fixture tab mutations and no bring-to-front is requested',()=>{
 assert.doesNotMatch(s,/Page\.bringToFront|activateOwnedFixture|handoff:choose_point/);
 const main=s.slice(s.indexOf("await launch(scenario==='private')"));
 assert(main.indexOf('requireOwnedForeground(launchCheck,{requireBirth:true})')>=0);
 assert(main.indexOf('requireOwnedForeground(launchCheck,{requireBirth:true})')<main.indexOf("createSeed('group-first')"));
 assert.match(main,/launchWindowId=launchWindow\.windowId/);
 assert.match(main,/w\.windowId===launchWindowId/);
});
test('each CDP pointer pair requires a fresh birth-pinned foreground gate',()=>{
 const body=s.slice(s.indexOf('  async function clickVisible('),s.indexOf('  async function selectLayout('));
 assert(!body.includes("type:'mouseMoved'"));
 const gate=body.indexOf('requireOwnedForeground(check)'),press=body.indexOf("type:'mousePressed'"),release=body.indexOf("type:'mouseReleased'");
 assert(gate>=0&&gate<press&&press<release);
 assert.match(body,/guard\(proc,activationBounds,\{mode:'initial',birth:handoffBirth\}\)/);
 assert.equal([...s.matchAll(/Input\.dispatchMouseEvent/g)].length,2);
});
test('qualification states launch focus side effect and CDP limitation',()=>{
 assert.match(s,/Launching the owned browser may change system focus/);
 assert.match(s,/trusted CDP-pointer/);assert.match(s,/foreground samples can race the click/);
 assert.match(s,/requireOwnedForeground\(proof\.foreground\.postClick\)/);
});

test('Escape key pair requires a fresh birth-pinned foreground gate',()=>{
 const body=s.slice(s.indexOf('  async function selectLayout('),s.indexOf('  async function setEnabled('));
 const gate=body.indexOf('requireOwnedForeground(keyCheck)'),down=body.indexOf("type:'keyDown'"),up=body.indexOf("type:'keyUp'");
 assert(gate>=0&&gate<down&&down<up);
 assert.match(body,/guard\(proc,activationBounds,\{mode:'initial',birth:handoffBirth\}\)/);
 assert.equal([...s.matchAll(/Input\.dispatchKeyEvent/g)].length,2);
});
