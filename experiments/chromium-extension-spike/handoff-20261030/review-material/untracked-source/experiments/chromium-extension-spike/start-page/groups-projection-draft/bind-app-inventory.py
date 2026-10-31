"""Withdrawn: post-hoc inventory cannot bind bytes to the build/guard transaction."""
raise SystemExit("Withdrawn: use the reviewed two-phase build recorder, not a post-hoc inventory.")
from pathlib import Path
import hashlib,json,os,sys,subprocess
h=Path(__file__).resolve().parent;sys.path.insert(0,str(h.parent/'launch-sunrise-integration-draft'))
from operation_lock import sunrise_lock,build_wrapper_lock
preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';app=out/'Blanc Prototype.app';framework=app/'Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework'
manifest=h/'manifest.json';assets=h/'assets-v1'
if len(sys.argv)!=2:raise SystemExit('usage: bind-app-inventory.py verified-build-receipt.json')
receipt=Path(sys.argv[1]).resolve();records=preview/'evidence/start-page-groups-20261029'
if not receipt.is_relative_to(records.resolve()) or receipt.name!='receipt.json':raise SystemExit('receipt must be a groups evidence receipt.json')
def sha(path):
 digest=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):digest.update(chunk)
 return digest.hexdigest()
def inventory(root):
 result={}
 for p in sorted(root.rglob('*')):
  name=str(p.relative_to(root))
  if p.is_symlink():result[name]={'symlink':os.readlink(p)}
  elif p.is_file():result[name]={'sha256':sha(p)}
 return result
def no_build():
 for line in subprocess.check_output(['/bin/ps','-axo','pid=,comm='],text=True).splitlines():
  parts=line.strip().split(None,1)
  if len(parts)==2 and Path(parts[1]).name.lower() in ('ninja','autoninja','siso'):raise RuntimeError('active build '+parts[0])
def main():
 no_build();base=json.loads(receipt.read_text());m=json.loads(manifest.read_text())
 if base.get('status')!='verified' or base.get('overlayManifestSha256')!=sha(manifest) or base.get('buildExit')!=0 or base.get('guardExit')!=0 or base.get('guardActions')!=0 or base.get('frameworkSha256')!=sha(framework):raise RuntimeError('build receipt does not match candidate')
 for name,digest in m['overlay'].items():
  if (src/name).is_symlink() or sha(src/name)!=digest:raise RuntimeError('source mismatch '+name)
 if inventory(assets)!={name:{'sha256':digest} for name,digest in m['assets'].items()}:raise RuntimeError('asset mismatch')
 plan=out/'blanc-build-plan.log';plan_text=plan.read_text()
 if sha(plan)!=base.get('guardPlanSha256') or 'ninja: no work to do.' not in plan_text or 'Build Succeeded: 0 steps' not in plan_text:raise RuntimeError('guard mismatch')
 if any((src/name).stat().st_mtime_ns>plan.stat().st_mtime_ns for name in m['overlay']) or framework.stat().st_mtime_ns>plan.stat().st_mtime_ns:raise RuntimeError('guard predates candidate')
 saved=inventory(app)
 if saved!=inventory(app) or sha(framework)!=base['frameworkSha256']:raise RuntimeError('bundle changed during inventory')
 no_build();ip=receipt.parent/'app-inventory.json';rp=receipt.parent/'receipt-with-inventory.json'
 if ip.exists() or rp.exists() or ip.is_symlink() or rp.is_symlink():raise RuntimeError('use fresh receipt directory; output exists')
 with ip.open('x') as f:f.write(json.dumps(saved,indent=2)+'\n');f.flush();os.fsync(f.fileno())
 bound={**base,'baseBuildReceiptSha256':sha(receipt),'appInventorySha256':sha(ip)}
 with rp.open('x') as f:f.write(json.dumps(bound,indent=2)+'\n');f.flush();os.fsync(f.fileno())
 print(json.dumps({'inventory':str(ip),'receipt':str(rp),'appInventorySha256':bound['appInventorySha256'],'entries':len(saved)}))
if __name__=='__main__':
 with sunrise_lock(),build_wrapper_lock():main()
