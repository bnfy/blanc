import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
const observer=fileURLToPath(new URL('./observer.py',import.meta.url));
const python='/usr/bin/python3';
const reasonCodes = new Set(['accessibility_not_trusted','invalid_configuration','ownership_query_failed','unowned_process','ax_element_unavailable','window_not_found','window_ambiguous','window_attributes_unavailable','observer_error','observer_protocol_invalid','observer_input_failed','observer_spawn_failed','observer_exited','observer_timeout','invalid_bounds','browser_not_live','window_lookup_failed','trust_check_failed']);
export class AXDiagnosticError extends Error {
  constructor(code,detail={}) {super('AX diagnostic failed');this.code=reasonCodes.has(code)?code:'observer_protocol_invalid';this.detail=detail;}
}
export class ObserverNotExitedError extends Error {}
export function checkAXTrust({execCheck=execFileSync}={}) {
  let output;
  try {output=execCheck(python,[observer,'--check'],{encoding:'utf8',timeout:3000});}
  catch(e) {
    try {if(e?.status===2&&JSON.parse(e.stdout)?.reason==='accessibility_not_trusted')throw new AXDiagnosticError('accessibility_not_trusted');}
    catch(inner) {if(inner instanceof AXDiagnosticError)throw inner;}
    throw new AXDiagnosticError('trust_check_failed');
  }
  try {if(JSON.parse(output).event==='trusted')return;}catch{}
  throw new AXDiagnosticError('trust_check_failed');
}
// Never consider a sent signal as an exit. Callers must retain locks on uncertainty.
export async function stopChild(child,timeout=1500) {
  const exited=()=>!child.pid||child.exitCode!==null||child.signalCode!==null;
  const wait=()=>new Promise(resolve=>{if(exited())return resolve(true);let timer;const onExit=()=>{clearTimeout(timer);resolve(true)};child.once('exit',onExit);timer=setTimeout(()=>{child.off('exit',onExit);resolve(exited())},timeout);});
  if(exited())return;
  try {child.stdin.end('stop\n');} catch {}
  if(await wait())return;
  try {child.kill('SIGTERM');} catch {}
  if(await wait())return;
  try {child.stdin.destroy();} catch {}
  try {child.stdout.destroy();} catch {}
  try {child.unref();} catch {}
  throw new ObserverNotExitedError('AX observer exit not confirmed');
}
export async function observeOwnedFixture(proc,bounds,{spawnObserver=spawn,stopTimeout=1500}={}) {
  if(!proc?.pid||proc.exitCode!==null||proc.signalCode!==null) throw new AXDiagnosticError('browser_not_live',{observerExit:'not_started'});
  const {left,top,width,height}=bounds||{};
  if(![left,top,width,height].every(Number.isFinite)||width<=0||height<=0)throw new AXDiagnosticError('invalid_bounds',{observerExit:'not_started'});
  let child;
  try {child=spawnObserver(python,[observer,'--observe'],{stdio:['pipe','pipe','ignore']});} catch {throw new AXDiagnosticError('observer_spawn_failed',{observerExit:'not_started'});}
  let lines;const events=[];
  try {
    let pending=[],closed=false,err=null;
    lines=createInterface({input:child.stdout});
    lines.on('line',line=>{try{
      const v=JSON.parse(line);if(!['sample','ready','marker','unavailable'].includes(v.event)||events.length>=1000)throw Error();
      if(v.event==='unavailable')err=new AXDiagnosticError(v.reason);
      else if(v.event==='sample')events.push({event:'sample',window_match:['unique','none','ambiguous','unavailable'].includes(v.window_match)?v.window_match:'unavailable',start_monotonic_ns:Number.isSafeInteger(v.start_monotonic_ns)?v.start_monotonic_ns:null,end_monotonic_ns:Number.isSafeInteger(v.end_monotonic_ns)?v.end_monotonic_ns:null,app_frontmost:typeof v.app_frontmost==='boolean'?v.app_frontmost:null,window_focused:typeof v.window_focused==='boolean'?v.window_focused:null,minimized:typeof v.minimized==='boolean'?v.minimized:null});
      else if(v.event==='ready')events.push({event:'ready'});
      else if(['before-click','after-reply'].includes(v.name)&&Number.isSafeInteger(v.monotonic_ns))events.push({event:'marker',name:v.name,monotonic_ns:v.monotonic_ns});else throw Error();
      for(const p of pending.splice(0))p();
    }catch{err=new AXDiagnosticError('observer_protocol_invalid');for(const p of pending.splice(0))p();}});
    child.stdin.on('error',()=>{err=new AXDiagnosticError('observer_input_failed');for(const p of pending.splice(0))p();});
    child.on('error',()=>{err=new AXDiagnosticError('observer_spawn_failed');for(const p of pending.splice(0))p();});
    lines.on('close',()=>{closed=true;for(const p of pending.splice(0))p();});
    async function waitFor(predicate){const deadline=Date.now()+4000;for(;;){if(err)throw err;const e=events.find(predicate);if(e)return e;if(closed)throw new AXDiagnosticError('observer_exited');if(Date.now()>deadline)throw new AXDiagnosticError('observer_timeout');await Promise.race([new Promise(r=>pending.push(r)),new Promise(r=>setTimeout(r,40))]);}}
    child.stdin.write(JSON.stringify({pid:proc.pid,bounds:{left,top,width,height}})+'\n');
    await waitFor(e=>e.event==='ready');
    return {
      async mark(name){if(!['before-click','after-reply'].includes(name))throw Error('invalid marker');child.stdin.write(name+'\n');return waitFor(e=>e.event==='marker'&&e.name===name);},
      async stop(){await stopChild(child);lines.close();return events;}
    };
  }catch(e){try{await stopChild(child,stopTimeout);}finally{lines?.close();}const failure=e instanceof AXDiagnosticError?e:new AXDiagnosticError('observer_protocol_invalid');failure.detail={observerExit:child.pid?'confirmed':'not_started',firstSample:events.find(x=>x.event==='sample')??null};throw failure;}
}
