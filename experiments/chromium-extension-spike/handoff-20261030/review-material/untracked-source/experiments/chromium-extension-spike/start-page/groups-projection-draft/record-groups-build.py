"""Prepared only: two-phase Siso runner under one cooperative build guard.

Uses build.mjs's pinned compiler/SDK/args and exact Siso flags, without calling
that wrapper while its lock is held. Planning and compiling are distinct calls.
"""
from pathlib import Path
import hashlib,json,os,re,subprocess,sys,time
h=Path(__file__).resolve().parent
from operation_lock_groups import sunrise_lock,build_wrapper_lock
from scope_monitor import monitor
if len(sys.argv)!=4 or sys.argv[1] not in ('plan','build') or any(not re.fullmatch(r'[a-z0-9-]+',x) for x in sys.argv[2:]):raise SystemExit('usage: record-groups-build.py plan|build fresh-label stage-label')
mode,label,stage_label=sys.argv[1:];preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';app=out/'Blanc Prototype.app';framework=app/'Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework';assets=h/'assets-v1';manifest=h/'manifest.json';records=preview/'evidence/start-page-groups-20261029'/('build-'+label);stage=preview/'evidence/start-page-groups-20261029'/('stage-'+stage_label)/'transaction.json'
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
def run(receipt,name,dry,env):
 verify();no_build();siso=src/'third_party/siso/cipd/siso';args=[str(siso),'ninja','-offline','-local_jobs','8','-C',str(out)]
 if dry:args+=['-n','chrome']
 else:args=['/usr/bin/caffeinate','-i',*args,'chrome']
 (records/(name+'-command.json')).write_text(json.dumps(args,indent=2)+'\n');receipt['phase']=name;receipt['wrapperPid']=None;save(receipt)
 with (records/(name+'.log')).open('xb',buffering=0) as log:
  child=subprocess.Popen(args,cwd=src,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=not dry);receipt['wrapperPid']=child.pid;save(receipt)
  if dry:
   while child.poll() is None:time.sleep(2);os.fsync(log.fileno());save(receipt)
   rc=child.returncode
  else:
   receipt['globalIncrementalCap']=1000;receipt['reviewedActionCap']=receipt['plannedActions'];save(receipt)
   rc=monitor(child,records/(name+'.log'),receipt,lambda:save(receipt),cap=min(1000,receipt['plannedActions']))
  os.fsync(log.fileno())
 receipt['wrapperPid']=None;receipt[name+'Exit']=rc;save(receipt)
 if rc:raise RuntimeError(name+' exited '+str(rc))
 return normalized_plan(records/(name+'.log')) if dry else None
def main():
 verify();no_build();env,pinned=environment()
 if mode=='plan':
  if records.exists():raise RuntimeError('use fresh build label')
  records.mkdir(parents=True);sync_lineage(records,preview);receipt={'status':'in-progress','phase':'preparing','stageLabel':stage_label,'stageReceiptSha256':sha(stage),'overlayManifestSha256':sha(manifest),'startEpoch':time.time(),'wrapperPid':None,'environment':pinned};save(receipt)
  try:
   count,digest=run(receipt,'preflight',True,env)
   if count==0:raise RuntimeError('staged candidate unexpectedly has zero actions')
   receipt.update(plannedActions=count,normalizedPlanSha256=digest,status='planned',phase='awaiting-separate-build');save(receipt)
  except Exception as e:receipt['status']='failed';receipt['error']=str(e);save(receipt);raise
  print(json.dumps(receipt,indent=2));return
 receipt=json.loads((records/'receipt.json').read_text())
 if receipt.get('status')!='planned' or receipt.get('stageLabel')!=stage_label or receipt.get('stageReceiptSha256')!=sha(stage) or receipt.get('overlayManifestSha256')!=sha(manifest) or receipt.get('environment')!=pinned:raise RuntimeError('plan, stage or environment changed')
 try:
  receipt['status']='in-progress';save(receipt);count,digest=run(receipt,'recheck',True,env)
  if count!=receipt['plannedActions'] or digest!=receipt['normalizedPlanSha256']:raise RuntimeError('reviewed action plan changed')
  verify();environment();run(receipt,'build',False,env);receipt['buildExit']=0;save(receipt)
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
