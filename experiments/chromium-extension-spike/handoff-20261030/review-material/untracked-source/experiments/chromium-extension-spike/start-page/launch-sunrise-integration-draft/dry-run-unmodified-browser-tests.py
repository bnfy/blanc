"""One lower-bound test-target dry run; no GN, source staging or compilation."""
from pathlib import Path
import hashlib,json,os,re,subprocess,time
src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype'
records=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview/evidence/start-page-sunrise-20261029/unmodified-browser-tests-dry-run')
lock=out/'.blanc-build-guard.lock';other=out/'.blanc-sunrise-transaction.lock'
def command(argv,env=None):return subprocess.check_output(argv,text=True,env=env).strip()
def active():
 for line in command(['/bin/ps','-axo','pid=,comm=']).splitlines():
  f=line.strip().split(None,1)
  if len(f)==2 and Path(f[1]).name.lower() in ('ninja','autoninja','siso'):raise RuntimeError('active build: '+f[0])
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert not records.exists(),'choose a fresh evidence path'
records.mkdir(parents=True)
receipt={'status':'preparing','target':'browser_tests','scope':'unmodified graph only; lower bound, not exact candidate build','startedEpoch':time.time()}
(records/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
active();assert not other.exists(),'Sunrise transaction lock is held'
os.mkdir(lock)
try:
 active();assert not other.exists(),'Sunrise transaction lock is held'
 developer=os.path.realpath(os.environ.get('DEVELOPER_DIR') or command(['/usr/bin/xcode-select','-p']))
 env={**os.environ,'DEVELOPER_DIR':developer,'DEPOT_TOOLS_UPDATE':'0'}
 xcrun=lambda arg:command(['/usr/bin/xcrun','--sdk','macosx',arg],env)
 actual={'developerDir':developer,'xcode':command(['/usr/bin/xcodebuild','-version'],env),'sdkPath':xcrun('--show-sdk-path'),'sdkVersion':xcrun('--show-sdk-version'),'sdkBuild':xcrun('--show-sdk-build-version'),'clangRevision':(src/'third_party/llvm-build/Release+Asserts/cr_build_revision').read_text().strip(),'clangVersion':command([str(src/'third_party/llvm-build/Release+Asserts/bin/clang'),'--version']),'argsSha256':sha(out/'args.gn')}
 pinned=json.loads((out/'.blanc-build-environment.json').read_text());assert actual==pinned,'pinned build environment changed'
 args=[str(src/'third_party/siso/cipd/siso'),'ninja','-offline','-local_jobs','8','-C',str(out),'-n','browser_tests']
 receipt.update(status='running',argv=args,environment=actual);(records/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 with (records/'plan.log').open('x') as log:
  result=subprocess.run(args,cwd=src,env=env,stdout=log,stderr=subprocess.STDOUT)
 receipt.update(status='completed' if result.returncode==0 else 'failed',exitCode=result.returncode,endedEpoch=time.time(),planSha256=sha(records/'plan.log'))
 text=(records/'plan.log').read_text(errors='replace');counts=[int(a or b) for a,b in re.findall(r'\[\d+/(\d+)\]|Build Succeeded: (\d+) steps',text)]
 receipt['plannedActions']=max(counts) if counts else 0 if 'no work to do' in text.lower() else None
 receipt['cxxCommandLines']=sum('clang++' in line for line in text.splitlines());receipt['gnRegeneration']=bool(re.search(r'--regeneration\s+gen|Regenerating ninja files',text))
 (records/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
 if result.returncode:raise SystemExit(result.returncode)
finally:os.rmdir(lock)
