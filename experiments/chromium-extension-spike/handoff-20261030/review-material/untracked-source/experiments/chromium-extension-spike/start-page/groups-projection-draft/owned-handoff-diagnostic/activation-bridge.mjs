import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stopChild} from './bridge.mjs';
const helper=fileURLToPath(new URL('./activate_fixture.py',import.meta.url));
const statuses=new Set(['invalid_fixture','ownership_unverified','window_identity_unverified','frontmost_unavailable','already_frontmost','activation_request_failed','activated','activation_not_observed','helper_error','fixture_exited','helper_failed','helper_timeout','invalid_bounds','window_lookup_failed','observed']);
export class OwnedActivationError extends Error {
 constructor(status,detail={}){super('Owned fixture activation failed');this.status=statuses.has(status)?status:'helper_failed';this.detail=detail;}
}
function sanitize(v){
 const b=x=>typeof x==='boolean'?x:null;
 return {status:statuses.has(v?.status)?v.status:'helper_failed',frontmost_before:b(v?.frontmost_before),activation_requested:b(v?.activation_requested),activation_accepted:b(v?.activation_accepted),frontmost_after:b(v?.frontmost_after),start_monotonic_ns:Number.isSafeInteger(v?.start_monotonic_ns)?v.start_monotonic_ns:null,end_monotonic_ns:Number.isSafeInteger(v?.end_monotonic_ns)?v.end_monotonic_ns:null};
}
export async function activateOwnedFixture(proc,bounds,{spawnHelper=spawn,stopTimeout=1500,completionTimeout=6500,mode='activate'}={}) {
 if(!['activate','probe'].includes(mode))throw new OwnedActivationError('helper_failed',{helperExit:'not_started'});
 if(!proc?.pid||proc.exitCode!==null||proc.signalCode!==null)throw new OwnedActivationError('fixture_exited',{helperExit:'not_started'});
 const {left,top,width,height}=bounds||{};
 if(![left,top,width,height].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)||width<=0||height<=0)throw new OwnedActivationError('invalid_bounds',{helperExit:'not_started'});
 let child;try{child=spawnHelper('/usr/bin/python3',[helper],{stdio:['pipe','pipe','ignore']});}catch{throw new OwnedActivationError('helper_failed',{helperExit:'not_started'});}
 let result=null,mainError=null,timer=null;
 child.on('error',()=>{}); // Spawn failure must never escape before cleanup.
 try{
  let text='',bad=false;
  child.stdout.on('data',chunk=>{if(text.length+chunk.length>4096){bad=true;return;}text+=chunk.toString('utf8');});
  const done=new Promise((resolve,reject)=>{
    const finish=fn=>value=>{clearTimeout(timer);fn(value)};
    child.once('error',finish(()=>reject(new OwnedActivationError('helper_failed'))));
    child.stdin.once('error',finish(()=>reject(new OwnedActivationError('helper_failed'))));
    child.once('close',finish(()=>resolve()));
    timer=setTimeout(()=>reject(new OwnedActivationError('helper_timeout')),completionTimeout);
  });
  done.catch(()=>{}); // A synchronous write failure must not leave an unhandled timer rejection.
  child.stdin.end(JSON.stringify({pid:proc.pid,bounds:{left,top,width,height},mode})+'\n');
  await done;
  if(bad)throw new OwnedActivationError('helper_failed');
  try{result=sanitize(JSON.parse(text));}catch{throw new OwnedActivationError('helper_failed');}
  const valid=mode==='probe'?result.status==='observed'&&typeof result.frontmost_before==='boolean'&&result.frontmost_before===result.frontmost_after&&result.activation_requested===false&&result.activation_accepted===null:
    result.status==='already_frontmost'?result.frontmost_before===true&&result.frontmost_after===true&&result.activation_requested===false&&result.activation_accepted===null:
    result.status==='activated'&&result.frontmost_before===false&&result.frontmost_after===true&&result.activation_requested===true&&result.activation_accepted===true;
  if(!valid)throw new OwnedActivationError(result.status,result);
  if(proc.exitCode!==null||proc.signalCode!==null)throw new OwnedActivationError('fixture_exited',result);
 }catch(e){mainError=e instanceof OwnedActivationError?e:new OwnedActivationError('helper_failed');}finally{clearTimeout(timer);}
 try{await stopChild(child,stopTimeout);}catch(e){throw e;}
 if(mainError){mainError.detail={...mainError.detail,helperExit:child.pid?'confirmed':'not_started'};throw mainError;}
 return {...result,helperExit:'confirmed'};
}
