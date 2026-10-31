"""Prepared only: groups1 recovery runner under one cooperative build guard.

Uses build.mjs's pinned compiler/SDK/args and exact Siso flags, without calling
that wrapper while its lock is held. Planning and compiling are distinct calls.
"""
# Plan and build are distinct explicit modes; a plan never compiles.
from pathlib import Path
if not __debug__:raise RuntimeError('optimized Python is forbidden for this diagnostic')
import hashlib,json,os,re,subprocess,sys,time
h=Path(__file__).resolve().parent
from operation_lock_groups import sunrise_lock,build_wrapper_lock
import importlib.util
_guard_spec=importlib.util.spec_from_file_location('groups_action_guard',Path(__file__).resolve().parent/'action-start-guard-draft.py')
action_guard=importlib.util.module_from_spec(_guard_spec);_guard_spec.loader.exec_module(action_guard)
if len(sys.argv) not in (5,6) or sys.argv[1] not in ('plan','build') or any(not re.fullmatch(r'[a-z0-9-]+',x) for x in (sys.argv[2],sys.argv[3])) or sys.argv[4]!='monitor-paused-no-inflight' or (sys.argv[1]=='plan' and len(sys.argv)!=5) or (sys.argv[1]=='build' and (len(sys.argv)!=6 or not re.fullmatch(r'[a-f0-9]{64}',sys.argv[5]))):
 raise SystemExit('usage: record-focus-branch-diagnostic.py plan label stage-label monitor-paused-no-inflight | build label stage-label monitor-paused-no-inflight reviewed-plan-sha256')
mode,label,stage_label=sys.argv[1:4];reviewed_digest=sys.argv[5] if mode=='build' else None
preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';app=out/'Blanc Prototype.app';framework=app/'Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework';assets=h/'assets-visible-v2';manifest=h/'manifest-focus-branch-diagnostic.json';records=preview/'evidence/start-page-groups-20261029'/('build-focus-'+label);stage=preview/'evidence/start-page-groups-20261029'/('stage-focus-'+stage_label)/'transaction.json'
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
def monitor_excluded():
 config=Path('<local-home>/.codex/automations/keep-chromium-dev-current-and-open/automation.toml')
 if config.is_symlink() or not config.is_file():raise RuntimeError('monitor configuration missing or unsafe')
 text=config.read_text()
 if re.findall(r'^id\s*=\s*"([^"]+)"\s*$',text,re.M)!=['keep-chromium-dev-current-and-open'] or re.findall(r'^status\s*=\s*"([^"]+)"\s*$',text,re.M)!=['PAUSED']:raise RuntimeError('development reopen monitor is not confirmed paused')
def verify_baseline():
 st=json.loads(stage.read_text());backup=stage.parent/'verified-baseline.app';output=stage.parent/'verified-baseline-output-framework';obj=stage.parent/'verified-baseline-ui.o'
 trusted=preview/'evidence/start-page-groups-20261029/build-closure1/receipt.json'
 if sha(trusted)!='a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23':raise RuntimeError('baseline receipt changed')
 if st.get('baseBuildReceiptSha256')!=sha(trusted) or st.get('diagnosticOnly') is not True:raise RuntimeError('stage lacks diagnostic baseline binding')
 if inventory(app)!=st.get('baselineAppInventory') or inventory(backup)!=st.get('baselineAppInventory'):raise RuntimeError('live or backed up app differs from candidate baseline')
 if inventory(out/'Blanc Prototype Framework.framework')!=st.get('baselineOutputFrameworkInventory') or inventory(output)!=st.get('baselineOutputFrameworkInventory'):raise RuntimeError('live or backed up output framework differs')
 live_obj=out/'obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o'
 if sha(live_obj)!=st.get('baselineUiObjectSha256') or sha(obj)!=st.get('baselineUiObjectSha256'):raise RuntimeError('live or backed up UI object differs')
def capture_owned_locks():
 result={}
 for name in ('.blanc-sunrise-transaction.lock','.blanc-build-guard.lock'):
  path=out/name;owner=path/'owner.json'
  if path.is_symlink() or owner.is_symlink() or not path.is_dir() or not owner.is_file():raise RuntimeError('lock ownership cannot be established')
  data=owner.read_bytes();value=json.loads(data)
  if value.get('pid')!=os.getpid() or not isinstance(value.get('createdNs'),int) or set(value)!= {'pid','createdNs'}:raise RuntimeError('lock owner differs from recorder')
  if sorted(x.name for x in path.iterdir())!=['owner.json']:raise RuntimeError('unexpected lock entries')
  ds=path.stat();fs=owner.stat();result[name]={'dirDev':ds.st_dev,'dirIno':ds.st_ino,'ownerDev':fs.st_dev,'ownerIno':fs.st_ino,'ownerSha256':hashlib.sha256(data).hexdigest(),'owner':value}
 return result
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
 monitor_excluded()
 if sha(manifest)!='98733f4e627b5ce33ed3eaf7ee327f48e47e63182885e750ae0ec955322aef68':raise RuntimeError('reviewed diagnostic manifest changed')
 m=json.loads(manifest.read_text());st=json.loads(stage.read_text())
 if m.get('diagnosticOnly') is not True or st.get('diagnosticOnly') is not True or st.get('status')!='staged' or st.get('pending') is not None or st.get('overlayManifestSha256')!=sha(manifest):raise RuntimeError('stage receipt mismatch')
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
 verify();no_build();verify_baseline();env,pinned=environment()
 closure=action_guard.events.pinned_closure();closure_sha=hashlib.sha256(json.dumps(closure,separators=(',',':')).encode()).hexdigest()
 if mode=='plan':
  if records.exists():raise RuntimeError('use fresh build label')
  records.mkdir(parents=True);sync_lineage(records,preview);receipt={'status':'in-progress','phase':'preparing','stageLabel':stage_label,'stageReceiptSha256':sha(stage),'overlayManifestSha256':sha(manifest),'startEpoch':time.time(),'wrapperPid':None,'environment':pinned,'diagnosticOnly':True,'baseBuildReceiptSha256':'a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23','actionPolicy':'closure6','closureDescriptionSha256':closure_sha,'closureLogSha256':action_guard.events.SOURCE_SHA256};save(receipt)
  try:
   count,digest=run(receipt,'preflight',True,env)
   if count!=1:raise RuntimeError('unexpected diagnostic action count; inspect before proceeding')
   receipt.update(plannedActions=count,normalizedPlanSha256=digest,status='planned',phase='awaiting-separate-build');save(receipt)
  except Exception as e:receipt['status']='failed';receipt['error']=str(e);save(receipt);raise
  print(json.dumps(receipt,indent=2));return
 receipt=json.loads((records/'receipt.json').read_text())
 if receipt.get('status')!='planned' or receipt.get('diagnosticOnly') is not True or receipt.get('baseBuildReceiptSha256')!='a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23' or receipt.get('stageLabel')!=stage_label or receipt.get('stageReceiptSha256')!=sha(stage) or receipt.get('overlayManifestSha256')!=sha(manifest) or receipt.get('environment')!=pinned or receipt.get('actionPolicy')!='closure6' or receipt.get('closureDescriptionSha256')!=closure_sha or receipt.get('closureLogSha256')!=action_guard.events.SOURCE_SHA256 or receipt.get('normalizedPlanSha256')!=reviewed_digest:raise RuntimeError('reviewed diagnostic plan, stage, closure or environment changed')
 try:
  receipt['status']='in-progress';receipt['recorderPid']=os.getpid();receipt['lockIdentities']=capture_owned_locks();save(receipt);count,digest=run(receipt,'recheck',True,env)
  if count!=receipt['plannedActions'] or digest!=receipt['normalizedPlanSha256']:raise RuntimeError('reviewed action plan changed')
  verify();no_build();verify_baseline();environment();run(receipt,'build',False,env);receipt['buildExit']=0;save(receipt)
  count,_=run(receipt,'guard',True,env);receipt['guardExit']=0;receipt['guardActions']=count;save(receipt)
  if count!=0:raise RuntimeError('zero guard failed')
  no_build();verify();environment();plan=records/'guard.log'
  if framework.stat().st_mtime_ns>plan.stat().st_mtime_ns or any((src/name).stat().st_mtime_ns>plan.stat().st_mtime_ns for name in json.loads(manifest.read_text())['overlay']):raise RuntimeError('guard predates candidate')
  before=inventory(app)
  if before!=inventory(app):raise RuntimeError('app changed during inventory')
  if any(not p.is_symlink() and p.is_file() and p.stat().st_mtime_ns>plan.stat().st_mtime_ns for p in app.rglob('*')):raise RuntimeError('app file newer than guard')
  no_build();verify();environment();obj=out/'obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o'
  if obj.is_symlink() or not obj.is_file() or obj.stat().st_mtime_ns>plan.stat().st_mtime_ns:raise RuntimeError('UI object missing or newer than guard')
  file=records/'app-inventory.json'
  with file.open('x') as f:f.write(json.dumps(before,indent=2)+'\n');f.flush();os.fsync(f.fileno())
  receipt.update(uiObjectSha256=sha(obj),frameworkSha256=sha(framework),guardPlanSha256=sha(plan),appInventorySha256=sha(file),status='verified',phase='complete',endEpoch=time.time());save(receipt)
 except Exception as e:receipt['status']='failed';receipt['error']=str(e);save(receipt);raise
 print(json.dumps(receipt,indent=2))
if __name__=='__main__':
 # Guard remains held across Siso recheck, build, zero-action guard, inventory
 # and receipt. Non-cooperating programs can still evade this coordination.
 with sunrise_lock(),build_wrapper_lock():main()
