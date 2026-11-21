import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {orderedParts,signArguments,submitNotary} from './operator.mjs';
import {CERT,TEAM} from './policy.mjs';
const r=JSON.parse(fs.readFileSync(new URL('./fixtures/release.json',import.meta.url)));
test('operator signs children before containers and rejects unknown libraries',()=>{
  const library=`Contents/Frameworks/Blanc Beta Framework.framework/Versions/${r.chromiumVersion}/Libraries/libEGL.dylib`;
  const plan=orderedParts(r,[library]); assert.equal(plan.at(-1).path,'.');
  for(let i=0;i<plan.length;i++)for(let j=i+1;j<plan.length;j++)assert.ok(!plan[j].path.startsWith(plan[i].path+'/'));
  assert.throws(()=>orderedParts(r,[library.replace('libEGL','unknown')]));
  assert.throws(()=>orderedParts(r,[library,library]));
  for(const part of plan){const args=signArguments(part,'/fixture/app','/fixture/entitlements');assert.ok(args.includes(CERT));assert.ok(args.includes('--timestamp'));assert.ok(!args.includes('--deep'));assert.ok(args.includes('--generate-entitlement-der'));if(part.role==='jit')assert.ok(args.includes('restrict,kill,runtime'));}
});
test('notarization never exposes argv, credentials or failed command output',()=>{
  const secret='PRIVATE-TEST-CREDENTIAL',env={APPLE_TEAM_ID:TEAM,APPLE_ID:secret,APPLE_APP_SPECIFIC_PASSWORD:secret};
  for(const spawn of [()=>{throw Error(secret);},()=>({status:1,stdout:secret,stderr:secret}),()=>({status:0,stdout:secret}),()=>({status:0,stdout:JSON.stringify({status:secret,id:secret})})]){
    assert.throws(()=>submitNotary('/fixture.zip',env,spawn),e=>!e.message.includes(secret));
  }
  let called=false;assert.throws(()=>submitNotary('/fixture.zip',{},()=>{called=true;}));assert.equal(called,false);
  const id='00000000-0000-0000-0000-000000000000';
  assert.deepEqual(submitNotary('/fixture.zip',env,(cmd,args)=>{assert.equal(cmd,'/usr/bin/xcrun');assert.ok(args.includes('--wait'));return {status:0,stdout:JSON.stringify({status:'Accepted',id,secret})};}),{status:'Accepted',id});
});
