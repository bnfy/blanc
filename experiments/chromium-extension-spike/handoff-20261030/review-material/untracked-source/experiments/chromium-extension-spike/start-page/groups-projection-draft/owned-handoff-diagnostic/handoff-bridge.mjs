import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stopChild} from './bridge.mjs';
const script=fileURLToPath(new URL('./handoff_guard.py',import.meta.url));
const statuses=new Set(['invalid_request','identity_unverified','stack_unavailable','stack_incomplete','window_not_unique','window_not_visible','window_unique','point_outside_safe_region','point_clear','point_obscured','guard_unavailable']);
export class HandoffError extends Error {constructor(code){super('fixture handoff failed');this.code=code;}}
export async function guard(proc,bounds,{mode,birth=null,point=null,spawnHelper=spawn,completionTimeout=6000,stopTimeout=1500}={}) {
 if(!proc?.pid||proc.exitCode!==null||proc.signalCode!==null)throw new HandoffError('fixture_exited');
 const {left,top,width,height}=bounds||{};
 if(![left,top,width,height].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)||width<=0||height<=0||!['initial','point','resume','post'].includes(mode))throw new HandoffError('invalid_request');
 let child;try{child=spawnHelper('/usr/bin/python3',[script],{stdio:['pipe','pipe','ignore']});}catch{throw new HandoffError('guard_spawn_failed');}
 child.on('error',()=>{});let result=null,mainError=null,timer=null;
 try{
  let text='',bad=false;child.stdout.on('data',chunk=>{if(text.length+chunk.length>4096){bad=true;return;}text+=chunk.toString('utf8')});
  const done=new Promise((resolve,reject)=>{
   const finish=fn=>value=>{clearTimeout(timer);fn(value)};
   child.once('error',finish(()=>reject(new HandoffError('guard_spawn_failed'))));child.stdin.once('error',finish(()=>reject(new HandoffError('guard_input_failed'))));
   child.once('close',finish(resolve));timer=setTimeout(()=>reject(new HandoffError('guard_timeout')),completionTimeout);
  });
  done.catch(()=>{});child.stdin.end(JSON.stringify({pid:proc.pid,bounds:{left,top,width,height},mode,birth,point})+'\n');await done;
  if(bad)throw new HandoffError('guard_protocol_invalid');
  let v;try{v=JSON.parse(text)}catch{throw new HandoffError('guard_protocol_invalid')}
  if(v?.event!=='result'||!statuses.has(v.status))throw new HandoffError('guard_protocol_invalid');
  const b=Array.isArray(v.birth)&&v.birth.length===2&&v.birth.every(Number.isSafeInteger)?v.birth:null;
  result={status:v.status,birth:b,frontmost:typeof v.frontmost==='boolean'?v.frontmost:null,owned_matches:Number.isInteger(v.owned_matches)&&v.owned_matches>=0&&v.owned_matches<=2?v.owned_matches:null,obscurers:Number.isInteger(v.obscurers)&&v.obscurers>=0&&v.obscurers<=100?v.obscurers:null,start_monotonic_ns:Number.isSafeInteger(v.start_monotonic_ns)?v.start_monotonic_ns:null,end_monotonic_ns:Number.isSafeInteger(v.end_monotonic_ns)?v.end_monotonic_ns:null};
  if(proc.exitCode!==null||proc.signalCode!==null)throw new HandoffError('fixture_exited');
 }catch(e){mainError=e instanceof HandoffError?e:new HandoffError('guard_protocol_invalid')}finally{clearTimeout(timer)}
 await stopChild(child,stopTimeout); // uncertain exit propagates guard-retaining error
 if(mainError)throw mainError;
 return result;
}
export function publicSample(v){const {birth,...safe}=v;return safe;}
