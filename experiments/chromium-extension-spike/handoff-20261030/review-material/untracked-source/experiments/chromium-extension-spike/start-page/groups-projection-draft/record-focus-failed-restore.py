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
if len(sys.argv) not in (7,8) or sys.argv[1] not in ('plan','build') or any(not re.fullmatch(r'[a-z0-9-]+',x) for x in (sys.argv[2],sys.argv[3],sys.argv[4],sys.argv[5])) or sys.argv[6]!='monitor-paused-no-inflight' or (sys.argv[1]=='plan' and len(sys.argv)!=7) or (sys.argv[1]=='build' and (len(sys.argv)!=8 or not re.fullmatch(r'[a-f0-9]{64}',sys.argv[7]))):
 raise SystemExit('usage: record-focus-failed-restore.py plan LABEL STAGE BUILD AUDIT monitor-paused-no-inflight | build LABEL STAGE BUILD AUDIT monitor-paused-no-inflight REVIEWED_PLAN_SHA256')
mode,label,stage_label,diagnostic_label,audit_label=sys.argv[1:6];reviewed_digest=sys.argv[7] if mode=='build' else None
preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';app=out/'Blanc Prototype.app';framework=app/'Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework';assets=h/'assets-visible-v2';manifest=h/'manifest-focus-branch-diagnostic.json';base=preview/'evidence/start-page-groups-20261029';records=base/('restore-failed-focus-'+label);stage=base/('stage-focus-'+stage_label)/'transaction.json';diagnostic=base/('build-focus-'+diagnostic_label)/'receipt.json';audit=base/('failed-focus-audit-'+audit_label)/'receipt.json';release=base/('failed-focus-release-'+audit_label)/'receipt.json';monitor_config=Path('<local-home>/.codex/automations/keep-chromium-dev-current-and-open/automation.toml')
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
def verify_partial_output():
 st=json.loads(stage.read_text());d=json.loads(diagnostic.read_text());a=json.loads(audit.read_text());r=json.loads(release.read_text());log=diagnostic.parent/'build.log'
 if any(x.is_symlink() for x in (stage,diagnostic,audit,release,log)) or d.get('status') not in ('failed','in-progress') or d.get('diagnosticOnly') is not True or d.get('stageLabel')!=stage_label or d.get('stageReceiptSha256')!=st.get('stagedReceiptSha256') or d.get('overlayManifestSha256')!=sha(manifest):raise RuntimeError('failed diagnostic provenance mismatch')
 if a.get('status')!='awaiting-review' or (a.get('stageLabel'),a.get('buildLabel'),a.get('auditLabel'))!=(stage_label,diagnostic_label,audit_label) or a.get('buildReceiptSha256')!=sha(diagnostic) or a.get('buildLogSha256')!=sha(log) or a.get('stageSha256')!=st.get('stagedReceiptSha256') or a.get('manifestSha256')!=sha(manifest) or monitor_config.is_symlink() or a.get('monitorConfigSha256')!=sha(monitor_config):raise RuntimeError('failed diagnostic audit mismatch')
 if r.get('status')!='removed-owned-stale-locks' or r.get('auditSha256')!=sha(audit) or r.get('pending') is not None or r.get('removed')!=['.blanc-sunrise-transaction.lock','.blanc-build-guard.lock']:raise RuntimeError('owner-checked lock release incomplete')
 if inventory(app)!=a.get('partialApp') or inventory(out/'Blanc Prototype Framework.framework')!=a.get('partialOutputFramework'):raise RuntimeError('partial output differs from audited state')
 obj=out/'obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o'
 if obj.is_symlink() or not obj.is_file() or sha(obj)!=a.get('partialUiObjectSha256'):raise RuntimeError('partial UI object missing or changed')
 backup=stage.parent/'verified-baseline.app';output=stage.parent/'verified-baseline-output-framework';base_obj=stage.parent/'verified-baseline-ui.o'
 if inventory(backup)!=st.get('baselineAppInventory') or inventory(output)!=st.get('baselineOutputFrameworkInventory') or sha(base_obj)!=st.get('baselineUiObjectSha256'):raise RuntimeError('baseline backup changed')
 return {'failedReceiptSha256':sha(diagnostic),'auditSha256':sha(audit),'releaseSha256':sha(release)}
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
 st=json.loads(stage.read_text());name='chrome/browser/ui/blanc_prototype_ui.cc';target=src/name
 if st.get('diagnosticOnly') is not True or st.get('status')!='sources-restored-output-not-rebuilt' or st.get('pending') is not None or st.get('overlayManifestSha256')!=sha(manifest) or st.get('baseBuildReceiptSha256')!='a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23':raise RuntimeError('source restoration receipt mismatch')
 if target.is_symlink() or sha(target)!=st['targets'][name]['before'] or sha(target)!='ab7da9ea16b821746b22f1fb1fa66f9cd86aa7b9b2638432e3c95dc1a0294abf':raise RuntimeError('candidate source not restored')
 if inventory(assets)!={name:{'sha256':digest} for name,digest in json.loads(manifest.read_text())['assets'].items()}:raise RuntimeError('assets mismatch')
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
 verify();no_build();provenance=verify_partial_output();env,pinned=environment()
 closure=action_guard.events.pinned_closure();closure_sha=hashlib.sha256(json.dumps(closure,separators=(',',':')).encode()).hexdigest()
 if mode=='plan':
  if records.exists():raise RuntimeError('use fresh build label')
  records.mkdir(parents=True);sync_lineage(records,preview);receipt={'status':'in-progress','phase':'preparing','stageLabel':stage_label,'stageReceiptSha256':sha(stage),'overlayManifestSha256':sha(manifest),'startEpoch':time.time(),'wrapperPid':None,'environment':pinned,'restoresCandidate':True,'failedProvenance':provenance,'diagnosticBuildLabel':diagnostic_label,'auditLabel':audit_label,'baseBuildReceiptSha256':'a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23','actionPolicy':'closure6','closureDescriptionSha256':closure_sha,'closureLogSha256':action_guard.events.SOURCE_SHA256};save(receipt)
  try:
   count,digest=run(receipt,'preflight',True,env)
   if count<1 or count>6:raise RuntimeError('unexpected failed-build restore scope; inspect before proceeding')
   receipt.update(plannedActions=count,normalizedPlanSha256=digest,status='planned',phase='awaiting-separate-build');save(receipt)
  except Exception as e:receipt['status']='failed';receipt['error']=str(e);save(receipt);raise
  print(json.dumps(receipt,indent=2));return
 receipt=json.loads((records/'receipt.json').read_text())
 if receipt.get('status')!='planned' or receipt.get('restoresCandidate') is not True or receipt.get('failedProvenance')!=provenance or receipt.get('diagnosticBuildLabel')!=diagnostic_label or receipt.get('auditLabel')!=audit_label or receipt.get('baseBuildReceiptSha256')!='a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23' or receipt.get('stageLabel')!=stage_label or receipt.get('stageReceiptSha256')!=sha(stage) or receipt.get('overlayManifestSha256')!=sha(manifest) or receipt.get('environment')!=pinned or receipt.get('actionPolicy')!='closure6' or receipt.get('closureDescriptionSha256')!=closure_sha or receipt.get('closureLogSha256')!=action_guard.events.SOURCE_SHA256 or receipt.get('normalizedPlanSha256')!=reviewed_digest:raise RuntimeError('reviewed diagnostic plan, stage, closure or environment changed')
 try:
  receipt['status']='in-progress';save(receipt);count,digest=run(receipt,'recheck',True,env)
  if count!=receipt['plannedActions'] or digest!=receipt['normalizedPlanSha256']:raise RuntimeError('reviewed action plan changed')
  verify();no_build();verify_partial_output();environment();run(receipt,'build',False,env);receipt['buildExit']=0;save(receipt)
  count,_=run(receipt,'guard',True,env);receipt['guardExit']=0;receipt['guardActions']=count;save(receipt)
  if count!=0:raise RuntimeError('zero guard failed')
  no_build();verify();environment();plan=records/'guard.log'
  if framework.stat().st_mtime_ns>plan.stat().st_mtime_ns or any((src/name).stat().st_mtime_ns>plan.stat().st_mtime_ns for name in json.loads(stage.read_text())['targets']):raise RuntimeError('guard predates candidate')
  before=inventory(app)
  if before!=inventory(app):raise RuntimeError('app changed during inventory')
  st=json.loads(stage.read_text())
  if before!=st['baselineAppInventory'] or sha(framework)!=st['baselineFrameworkSha256'] or inventory(out/'Blanc Prototype Framework.framework')!=st['baselineOutputFrameworkInventory']:raise RuntimeError('restored output differs from candidate baseline')
  if any(not p.is_symlink() and p.is_file() and p.stat().st_mtime_ns>plan.stat().st_mtime_ns for p in app.rglob('*')):raise RuntimeError('app file newer than guard')
  no_build();verify();environment();obj=out/'obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o'
  if obj.is_symlink() or not obj.is_file() or obj.stat().st_mtime_ns>plan.stat().st_mtime_ns or sha(obj)!=st['baselineUiObjectSha256']:raise RuntimeError('restored UI object differs from baseline or guard')
  file=records/'app-inventory.json'
  with file.open('x') as f:f.write(json.dumps(before,indent=2)+'\n');f.flush();os.fsync(f.fileno())
  receipt.update(uiObjectSha256=sha(obj),frameworkSha256=sha(framework),guardPlanSha256=sha(plan),appInventorySha256=sha(file),status='verified',phase='complete',endEpoch=time.time());save(receipt)
 except Exception as e:receipt['status']='failed';receipt['error']=str(e);save(receipt);raise
 print(json.dumps(receipt,indent=2))
if __name__=='__main__':
 # Guard remains held across Siso recheck, build, zero-action guard, inventory
 # and receipt. Non-cooperating programs can still evade this coordination.
 with sunrise_lock(),build_wrapper_lock():main()
