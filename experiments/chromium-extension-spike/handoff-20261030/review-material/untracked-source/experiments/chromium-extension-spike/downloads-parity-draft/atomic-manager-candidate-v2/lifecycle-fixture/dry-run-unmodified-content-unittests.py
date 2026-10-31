"""Guarded lower-bound dry run only. Never stages sources or compiles."""
from pathlib import Path
import hashlib,json,os,re,subprocess,time
src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype'
records=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview/evidence/downloads-lifecycle-20261029/unmodified-content-unittests-dry-run')
manifest=Path(__file__).resolve().parent.parent/'manifest.json'
lock=out/'.blanc-build-guard.lock';other=out/'.blanc-sunrise-transaction.lock'
def command(argv,env=None):return subprocess.check_output(argv,text=True,env=env).strip()
def active():
 for line in command(['/bin/ps','-axo','pid=,comm=']).splitlines():
  fields=line.strip().split(None,1)
  if len(fields)==2 and Path(fields[1]).name.lower() in ('ninja','autoninja','siso'):raise RuntimeError('active build: '+fields[0])
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def write_receipt(value):
 with (records/'receipt.json').open('w') as f:
  json.dump(value,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
if records.exists():raise SystemExit('choose a fresh evidence path; existing evidence is never overwritten')
records.mkdir(parents=True)
receipt={'status':'preparing','target':'content_unittests','scope':'unmodified graph only; lower bound, not exact candidate build','startedEpoch':time.time(),'candidateManifestSha256':sha(manifest)}
write_receipt(receipt);locked=False
try:
 active()
 if other.exists():raise RuntimeError('Sunrise transaction lock is held')
 os.mkdir(lock);locked=True
 active()
 if other.exists():raise RuntimeError('Sunrise transaction lock is held')
 for name,entry in json.loads(manifest.read_text())['files'].items():
  if sha(src/name)!=entry['base']:raise RuntimeError('candidate base source differs: '+name)
 developer=os.path.realpath(os.environ.get('DEVELOPER_DIR') or command(['/usr/bin/xcode-select','-p']))
 env={**os.environ,'DEVELOPER_DIR':developer,'DEPOT_TOOLS_UPDATE':'0'}
 xcrun=lambda arg:command(['/usr/bin/xcrun','--sdk','macosx',arg],env)
 actual={'developerDir':developer,'xcode':command(['/usr/bin/xcodebuild','-version'],env),'sdkPath':xcrun('--show-sdk-path'),'sdkVersion':xcrun('--show-sdk-version'),'sdkBuild':xcrun('--show-sdk-build-version'),'clangRevision':(src/'third_party/llvm-build/Release+Asserts/cr_build_revision').read_text().strip(),'clangVersion':command([str(src/'third_party/llvm-build/Release+Asserts/bin/clang'),'--version']),'argsSha256':sha(out/'args.gn')}
 pinned=json.loads((out/'.blanc-build-environment.json').read_text())
 if actual!=pinned:raise RuntimeError('pinned build environment changed')
 args=[str(src/'third_party/siso/cipd/siso'),'ninja','-offline','-local_jobs','8','-C',str(out),'-n','content_unittests']
 receipt.update(status='running',argv=args,environment=actual);write_receipt(receipt)
 with (records/'plan.log').open('x') as log:
  result=subprocess.run(args,cwd=src,env=env,stdout=log,stderr=subprocess.STDOUT)
  log.flush();os.fsync(log.fileno())
 receipt.update(status='completed' if result.returncode==0 else 'failed',exitCode=result.returncode,endedEpoch=time.time(),planSha256=sha(records/'plan.log'))
 text=(records/'plan.log').read_text(errors='replace');counts=[int(a or b) for a,b in re.findall(r'\[\d+/(\d+)\]|Build Succeeded: (\d+) steps',text)]
 receipt['plannedActions']=max(counts) if counts else 0 if 'no work to do' in text.lower() else None
 receipt['cxxCommandLines']=sum('clang++' in line for line in text.splitlines());receipt['gnRegeneration']=bool(re.search(r'--regeneration\s+gen|Regenerating ninja files',text));receipt['pendingBuildflags']='write_buildflag_header.py' in text
 write_receipt(receipt);print(json.dumps(receipt,indent=2))
 if result.returncode:raise SystemExit(result.returncode)
except BaseException as error:
 if receipt['status'] not in ('completed','failed'):
  receipt.update(status='failed',endedEpoch=time.time(),failureType=type(error).__name__,failure=str(error));write_receipt(receipt)
 raise
finally:
 if locked:os.rmdir(lock)
