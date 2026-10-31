"""Prepared only: groups1 recovery runner under one cooperative build guard.

Uses build.mjs's pinned compiler/SDK/args and exact Siso flags, without calling
that wrapper while its lock is held. Planning and compiling are distinct calls.
"""
# Plan and build are distinct explicit modes; a plan never compiles.
from pathlib import Path
import hashlib,json,os,re,subprocess,sys,time
h=Path(__file__).resolve().parent
from operation_lock_groups import sunrise_lock,build_wrapper_lock
import importlib.util
_guard_spec=importlib.util.spec_from_file_location('groups_action_guard',Path(__file__).resolve().parent/'action-start-guard-draft.py')
action_guard=importlib.util.module_from_spec(_guard_spec);_guard_spec.loader.exec_module(action_guard)
if len(sys.argv)!=6 or sys.argv[1] not in ('plan','build') or any(not re.fullmatch(r'[a-z0-9-]+',x) for x in (sys.argv[2],sys.argv[3],sys.argv[5])) or sys.argv[4]!='closure6':raise SystemExit('usage: record-groups-closure-draft.py plan|build fresh-label groups1 closure6 lock-recovery-label')
mode,label,stage_label,policy,recovery_label=sys.argv[1:]
if stage_label!='groups1' or recovery_label!='recovery2' or label in ('groups1','resume1'):raise SystemExit('requires original stage, completed recovery2 and a fresh build label')
preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';app=out/'Blanc Prototype.app';framework=app/'Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework';assets=h/'assets-v1';manifest=h/'manifest.json';records=preview/'evidence/start-page-groups-20261029'/('build-'+label);stage=preview/'evidence/start-page-groups-20261029'/('stage-'+stage_label)/'transaction.json'
def sha(path):
 digest=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):digest.update(b)
 return digest.hexdigest()
def inventory(root):
 result={};canonical=root.resolve(strict=True)
 for p in sorted(root.rglob('*')):
  name=str(p.relative_to(root))
  if p.is_symlink():
   if not p.resolve(strict=True).is_relative_to(canonical):raise RuntimeError('escaping symlink '+str(p))
   result[name]={'symlink':os.readlink(p)}
  elif p.is_file():result[name]={'sha256':sha(p)}
 return result
recovery=preview/'evidence/start-page-groups-20261029'/('lock-recovery-'+recovery_label)/'receipt.json'
trusted=preview/'evidence/start-page-sunrise-20261029/stage-sunrise-a/transaction.json'
original=preview/'evidence/start-page-groups-20261029/build-resume1'
previous1=preview/'evidence/start-page-groups-20261029/build-groups1'
prior_recovery=preview/'evidence/start-page-groups-20261029/lock-recovery-recovery1/receipt.json'
original_receipt_sha='9caadd6d0fb358244382a4ffff0b7509204daa5dca95d97fabc7ee866b5824c3'
original_log_sha='c0ebec09953b68d0997ddf7e03807655ce732bb3100925d2c4f76e7569e05cb6'
original_stage_sha='94547d6a0072858aad43a87411f2e728b94857bcae5fc2ada742514ce973cf9e'
original_plan_sha='0a808d6e07c47d527e7f97fe4f0906011ff8355a82b8ffb35c178fd39a2d279e'
original_plan_logs={'preflight.log':'53989d642f0c4115e5ab626a9248bacaeba44d72e695aa5034f494640fa2495b','recheck.log':'62a92ee3103bb415cf99e05eb2851e1b8081d0f7b76d648eaed8d43796a40dc9'}
previous1_plan_logs={'preflight.log':'c6250f930883ec269634f35e67f396b733a9e1c36b4d7c59cd40708ba75eb4a9','recheck.log':'604e5d1d37158706d2f36d96d4a5994244c90b06145c84c1ba6144b80981b4ab'}
def previous_stopped():
 if any(p.is_symlink() for p in (original/'receipt.json',original/'build.log',stage)) or sha(original/'receipt.json')!=original_receipt_sha or sha(original/'build.log')!=original_log_sha or sha(stage)!=original_stage_sha:raise RuntimeError('original failed receipt, build log or stage receipt changed')
 for name,expected in original_plan_logs.items():
  if (original/name).is_symlink() or sha(original/name)!=expected or normalized_plan(original/name)!=(1,original_plan_sha):raise RuntimeError('original reviewed plan evidence changed: '+name)
 for name,digest in previous1_plan_logs.items():
  if (previous1/name).is_symlink() or sha(previous1/name)!=digest or normalized_plan(previous1/name)!=(1,original_plan_sha):raise RuntimeError('prior reviewed plan evidence changed: '+name)
 for path,digest in ((previous1/'receipt.json','5c1500b1c282cf00ac0fbd36a914ffabff6bae6a98f6346cb3df18caa3397e59'),(previous1/'build.log','dacb6af15d8cf25d24a0d70f99944742a8331dc8e3be2f9c2f1b99bbad6793df'),(prior_recovery,'a3505de36787aa6ca00d6d72eddd0498f2e9ce5588742afc0dd054ea9be8c7e8')):
  if path.is_symlink() or sha(path)!=digest:raise RuntimeError('prior recovery chain changed: '+str(path))
 old=json.loads((original/'receipt.json').read_text());log=(original/'build.log').read_text()
 if old.get('status')!='failed' or old.get('scopeMonitoring')!='stopped-after-expansion' or old.get('buildProcessGroup')!=57396 or old.get('plannedActions')!=1 or old.get('normalizedPlanSha256')!=original_plan_sha or old.get('liveMaxAdvertised')!=972 or old.get('requestedLiveCap')!=556 or old.get('lockRecoveryReceiptSha256')!='a3505de36787aa6ca00d6d72eddd0498f2e9ce5588742afc0dd054ea9be8c7e8' or 'Build Failure: 0 done, 0 failed, 395 remaining' not in log or 'interrupt by signal' not in log:
  raise RuntimeError('original interrupted build evidence does not match')
 # Reused PIDs/process-group IDs also fail closed; never signal either here.
 for pid,group in ((57051,False),(57086,True),(57362,False),(57396,True)):
  try:
   if group:os.killpg(pid,0)
   else:os.kill(pid,0)
  except ProcessLookupError:continue
  except PermissionError:raise RuntimeError('cannot verify prior process/group exit')
  raise RuntimeError('prior owner PID or build process group still exists')
def verify_recovery():
 if recovery.is_symlink() or not recovery.is_file() or sha(recovery)!='b3755942838bfbe0adc958723bffe36f198e1fd50fa1ade0d601c4c066c0498e':raise RuntimeError('exact completed recovery2 receipt missing or changed')
 value=json.loads(recovery.read_text());identity=value.get('lockIdentities',{})
 if (value.get('status')!='removed-owned-stale-locks' or value.get('pending') is not None or
     value.get('removed')!=['.blanc-sunrise-transaction.lock','.blanc-build-guard.lock'] or
     value.get('originalEvidence')!={'receipt':original_receipt_sha,'log':original_log_sha,'stage':original_stage_sha,'trusted':'628bd51e633ecfa23f21fdd147df30c168175e71597f55ddba468dad713a0383'} or
     identity.get('.blanc-build-guard.lock',{}).get('ownerSha256')!='c361bf4041ab3e50dd37503e25af0224ed980f9ec69a3c073a08273ef33cd738' or
     identity.get('.blanc-sunrise-transaction.lock',{}).get('ownerSha256')!='3ee27e3885d8ea16f40deea939ea9cade298ceb05655a4b9f5f6c91fb4cbb868' or
     value.get('priorRecoverySha256')!='a3505de36787aa6ca00d6d72eddd0498f2e9ce5588742afc0dd054ea9be8c7e8' or
     value.get('priorFailedReceiptSha256')!='5c1500b1c282cf00ac0fbd36a914ffabff6bae6a98f6346cb3df18caa3397e59'):
  raise RuntimeError('lock-recovery receipt does not prove completed owner-checked removal')
 if value.get('baselineObjectSha256')!=json.loads(stage.read_text()).get('baselineUiObjectSha256'):raise RuntimeError('recovery object evidence mismatch')
 return sha(recovery)
def verify_baseline():
 if trusted.is_symlink() or sha(trusted)!='628bd51e633ecfa23f21fdd147df30c168175e71597f55ddba468dad713a0383':raise RuntimeError('trusted baseline receipt changed')
 old=json.loads(trusted.read_text());st=json.loads(stage.read_text());expected=old['baselineAppInventory']
 if len(expected)!=353 or inventory(app)!=expected:raise RuntimeError('full trusted baseline app changed')
 prefix='Contents/Frameworks/Blanc Prototype Framework.framework/'
 expected_framework={k[len(prefix):]:v for k,v in expected.items() if k.startswith(prefix)}
 if inventory(out/'Blanc Prototype Framework.framework')!=expected_framework:raise RuntimeError('trusted output framework changed')
 obj=out/'obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o'
 if obj.is_symlink() or sha(obj)!=st.get('baselineUiObjectSha256'):raise RuntimeError('baseline object changed')
def no_build():
 for line in subprocess.check_output(['/bin/ps','-axo','pid=,comm='],text=True).splitlines():
  parts=line.strip().split(None,1)
  if len(parts)==2 and Path(parts[1]).name.lower() in ('ninja','autoninja','siso'):raise RuntimeError('build active '+parts[0])
def command(argv,env=None):return subprocess.check_output(argv,text=True,env=env).strip()
def environment():
 developer=os.path.realpath(os.environ.get('DEVELOPER_DIR') or command(['/usr/bin/xcode-select','-p']));env={**os.environ,'DEVELOPER_DIR':developer,'DEPOT_TOOLS_UPDATE':'0'}
 xcrun=lambda a:command(['/usr/bin/xcrun','--sdk','macosx',a],env)
 actual={'developerDir':developer,'xcode':command(['/usr/bin/xcodebuild','-version'],env),'sdkPath':xcrun('--show-sdk-path'),'sdkVersion':xcrun('--show-sdk-version'),'sdkBuild':xcrun('--show-sdk-build-version'),'clangRevision':(src/'third_party/llvm-build/Release+Asserts/cr_build_revision').read_text().strip(),'clangVersion':command([str(src/'third_party/llvm-build/Release+Asserts/bin/clang'),'--version']),'argsSha256':sha(out/'args.gn')}
 if actual!=json.loads((out/'.blanc-build-environment.json').read_text()):raise RuntimeError('pinned build environment changed')
 return env,actual
def normalized_plan(path):
 text=path.read_text(errors='strict');counts=[int(a or b) for a,b in re.findall(r'\[\d+/(\d+)\]|Build Succeeded: (\d+) steps',text)]
 if not counts:raise RuntimeError('dry-run count unavailable')
 count=max(counts)
 if re.search(r'--regeneration\s+gen|Regenerating ninja files|write_buildflag_header\.py',text):raise RuntimeError('generator or GN regeneration pending')
 if count>1000:raise RuntimeError('plan exceeds incremental guard')
 if count==0:
  if 'ninja: no work to do.' not in text:raise RuntimeError('zero plan missing no-work marker')
  actions=[]
 else:
  lines=text.splitlines();starts=[i for i,x in enumerate(lines) if x.startswith('build start:')]
  if not starts:raise RuntimeError('action boundary unavailable')
  start=starts[-1]+1;finish=next((i for i in range(start,len(lines)) if lines[i]=='build finished'),None)
  if finish is None:raise RuntimeError('action terminator unavailable')
  actions=lines[start:finish]
  if len(actions)!=count or any(not a.strip() for a in actions):raise RuntimeError('action count does not match command lines')
 normalized=json.dumps(sorted(actions),ensure_ascii=False,separators=(',',':')).encode()
 return count,hashlib.sha256(normalized).hexdigest()
def verify():
 m=json.loads(manifest.read_text());st=json.loads(stage.read_text())
 if st.get('status')!='staged' or st.get('pending') is not None or st.get('overlayManifestSha256')!=sha(manifest):raise RuntimeError('stage receipt mismatch')
 for name,digest in m['overlay'].items():
  if (src/name).is_symlink() or sha(src/name)!=digest:raise RuntimeError('source mismatch '+name)
 if inventory(assets)!={name:{'sha256':digest} for name,digest in m['assets'].items()}:raise RuntimeError('assets mismatch')
 return st
def sync_lineage(path,stop):
 while True:
  fd=os.open(path,os.O_RDONLY)
  try:os.fsync(fd)
  finally:os.close(fd)
  if path==stop:break
  if stop not in path.parents:raise RuntimeError('unexpected evidence lineage')
  path=path.parent
 fd=os.open(stop.parent,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def save(receipt):
 receipt['updatedEpoch']=time.time();tmp=records/'receipt.new'
 with tmp.open('w') as f:f.write(json.dumps(receipt,indent=2)+'\n');f.flush();os.fsync(f.fileno())
 os.replace(tmp,records/'receipt.json');fd=os.open(records,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def invoke_observed_build(args,cwd,env,log_path,receipt,save_receipt,allowlist):
 # This exact helper is integration-tested only with disposable fake children.
 with log_path.open('xb',buffering=0) as log:
  child=subprocess.Popen(args,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  receipt['wrapperPid']=child.pid;save_receipt()
  try:rc=action_guard.monitor(child,log_path,receipt,save_receipt,allowlist)
  finally:os.fsync(log.fileno())
 receipt['wrapperPid']=None;receipt['buildExit']=rc;save_receipt()
 return rc
def run(receipt,name,dry,env):
 verify();no_build();siso=src/'third_party/siso/cipd/siso';args=[str(siso),'ninja','-offline','-local_jobs','8','-C',str(out)]
 if dry:args+=['-n','chrome']
 else:args=['/usr/bin/caffeinate','-i',*args,'chrome']
 (records/(name+'-command.json')).write_text(json.dumps(args,indent=2)+'\n');receipt['phase']=name;receipt['wrapperPid']=None;save(receipt)
 if not dry:
  rc=invoke_observed_build(args,src,env,records/(name+'.log'),receipt,lambda:save(receipt),action_guard.events.pinned_closure())
 else:
  with (records/(name+'.log')).open('xb',buffering=0) as log:
   child=subprocess.Popen(args,cwd=src,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT);receipt['wrapperPid']=child.pid;save(receipt)
   while child.poll() is None:time.sleep(2);os.fsync(log.fileno());save(receipt)
   os.fsync(log.fileno());rc=child.returncode
 receipt['wrapperPid']=None;receipt[name+'Exit']=rc;save(receipt)
 if rc:raise RuntimeError(name+' exited '+str(rc))
 return normalized_plan(records/(name+'.log')) if dry else None
def main():
 previous_stopped();verify();no_build();recovery_sha=verify_recovery();verify_baseline();env,pinned=environment()
 closure=action_guard.events.pinned_closure();closure_sha=hashlib.sha256(json.dumps(closure,separators=(',',':')).encode()).hexdigest()
 if mode=='plan':
  if records.exists():raise RuntimeError('use fresh build label')
  records.mkdir(parents=True);sync_lineage(records,preview);receipt={'status':'in-progress','phase':'preparing','stageLabel':stage_label,'stageReceiptSha256':sha(stage),'overlayManifestSha256':sha(manifest),'startEpoch':time.time(),'wrapperPid':None,'environment':pinned,'actionPolicy':policy,'closureDescriptionSha256':closure_sha,'closureLogSha256':action_guard.events.SOURCE_SHA256,'priorFailedReceiptSha256':original_receipt_sha,'priorBuildLogSha256':original_log_sha,'lockRecoveryReceiptSha256':recovery_sha,'lockRecoveryLabel':recovery_label};save(receipt)
  try:
   count,digest=run(receipt,'preflight',True,env)
   if count!=1 or digest!=original_plan_sha:raise RuntimeError('fresh plan differs from interrupted build; inspect before proceeding')
   receipt.update(plannedActions=count,normalizedPlanSha256=digest,status='planned',phase='awaiting-separate-build');save(receipt)
  except Exception as e:receipt['status']='failed';receipt['error']=str(e);save(receipt);raise
  print(json.dumps(receipt,indent=2));return
 receipt=json.loads((records/'receipt.json').read_text())
 if receipt.get('status')!='planned' or receipt.get('stageLabel')!=stage_label or receipt.get('stageReceiptSha256')!=sha(stage) or receipt.get('overlayManifestSha256')!=sha(manifest) or receipt.get('environment')!=pinned or receipt.get('actionPolicy')!=policy or receipt.get('closureDescriptionSha256')!=closure_sha or receipt.get('closureLogSha256')!=action_guard.events.SOURCE_SHA256 or receipt.get('priorFailedReceiptSha256')!=original_receipt_sha or receipt.get('priorBuildLogSha256')!=original_log_sha or receipt.get('lockRecoveryLabel')!=recovery_label or receipt.get('lockRecoveryReceiptSha256')!=recovery_sha:raise RuntimeError('plan, stage, action closure, lock recovery or environment changed')
 try:
  receipt['status']='in-progress';save(receipt);count,digest=run(receipt,'recheck',True,env)
  if count!=receipt['plannedActions'] or digest!=receipt['normalizedPlanSha256']:raise RuntimeError('reviewed action plan changed')
  verify();previous_stopped();no_build()
  if verify_recovery()!=receipt['lockRecoveryReceiptSha256']:raise RuntimeError('lock-recovery receipt changed before build')
  verify_baseline();environment();run(receipt,'build',False,env);receipt['buildExit']=0;save(receipt)
  count,_=run(receipt,'guard',True,env);receipt['guardExit']=0;receipt['guardActions']=count;save(receipt)
  if count!=0:raise RuntimeError('zero guard failed')
  no_build();verify();environment();plan=records/'guard.log'
  if framework.stat().st_mtime_ns>plan.stat().st_mtime_ns or any((src/name).stat().st_mtime_ns>plan.stat().st_mtime_ns for name in json.loads(manifest.read_text())['overlay']):raise RuntimeError('guard predates candidate')
  before=inventory(app)
  if before!=inventory(app):raise RuntimeError('app changed during inventory')
  if any(not p.is_symlink() and p.is_file() and p.stat().st_mtime_ns>plan.stat().st_mtime_ns for p in app.rglob('*')):raise RuntimeError('app file newer than guard')
  no_build();verify();environment();file=records/'app-inventory.json'
  with file.open('x') as f:f.write(json.dumps(before,indent=2)+'\n');f.flush();os.fsync(f.fileno())
  receipt.update(frameworkSha256=sha(framework),guardPlanSha256=sha(plan),appInventorySha256=sha(file),status='verified',phase='complete',endEpoch=time.time());save(receipt)
 except Exception as e:receipt['status']='failed';receipt['error']=str(e);save(receipt);raise
 print(json.dumps(receipt,indent=2))
if __name__=='__main__':
 # Guard remains held across Siso recheck, build, zero-action guard, inventory
 # and receipt. Non-cooperating programs can still evade this coordination.
 with sunrise_lock(),build_wrapper_lock():main()
