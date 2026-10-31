"""Prepared, not run: record a separately authorized incremental build.

The Sunrise lock coordinates only participating workflows. The existing build
wrapper acquires its own guard lock for each invocation; nonparticipating
processes cannot be universally excluded. We fail closed on observed Ninja or
Siso processes immediately before each invocation and recheck inputs.
"""
from pathlib import Path
import hashlib,json,os,re,subprocess,sys,time
from operation_lock import sunrise_lock

if len(sys.argv)!=2 or not re.fullmatch(r'[a-z0-9-]+',sys.argv[1]):raise SystemExit('usage: record-guarded-build.py fresh-label')
label=sys.argv[1];h=Path(__file__).resolve().parent
preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');repo=preview/'repo'
src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';manifest_path=h/'overlay-foreground-v2-manifest.json'
records=preview/'evidence/start-page-sunrise-20261029'/('build-'+label);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads(manifest_path.read_text());assets=preview/'evidence/start-page-sunrise-20261029/assets-v2'
framework=out/'Blanc Prototype.app/Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework'
wrapper=['node',str(repo/'experiments/chromium-extension-spike/build.mjs'),str(src)]
def verify():
    for name,digest in manifest['overlay'].items():
        if sha(src/name)!=digest:raise ValueError('checkout mismatch '+name)
    inventory={str(p.relative_to(assets)):sha(p) for p in sorted(assets.rglob('*')) if p.is_file() and not p.is_symlink()}
    if inventory!=manifest['assets'] or any(p.is_symlink() for p in assets.rglob('*')):raise ValueError('asset mismatch')
def no_build():
    if (out/'.blanc-build-guard.lock').exists():raise RuntimeError('build wrapper lock exists')
    processes=subprocess.check_output(['ps','-axo','pid=,comm='],text=True)
    for line in processes.splitlines():
        parts=line.strip().split(None,1)
        if len(parts)==2 and Path(parts[1]).name.lower() in ('ninja','autoninja','siso'):raise RuntimeError('build process active: '+parts[0])
def main():
    assert not records.exists(),'use a fresh label';verify();no_build();records.mkdir(parents=True)
    receipt={'status':'in-progress','overlayManifestSha256':sha(manifest_path),'startEpoch':time.time(),'plannedActions':None,'buildExit':None,'guardExit':None,'guardActions':None,'phase':'preparing','wrapperPid':None}
    def save():
        receipt['updatedEpoch']=time.time();tmp=records/'receipt.new'
        with tmp.open('w') as f:
            f.write(json.dumps(receipt,indent=2)+'\n');f.flush();os.fsync(f.fileno())
        os.replace(tmp,records/'receipt.json')
    def run(name,mode):
        verify();no_build();command=wrapper+[mode,'--local-jobs=8']
        (records/(name+'-command.json')).write_text(json.dumps(command,indent=2)+'\n')
        receipt['phase']=name;receipt['wrapperPid']=None;save()
        with (records/(name+'.log')).open('xb',buffering=0) as log:
            child=subprocess.Popen(command,cwd=repo,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
            receipt['wrapperPid']=child.pid;save()
            while child.poll() is None:
                time.sleep(2);os.fsync(log.fileno());save()
            os.fsync(log.fileno());rc=child.returncode
        receipt['wrapperPid']=None;receipt[name+'Exit']=rc;save()
        text=(records/(name+'.log')).read_text(errors='replace');match=re.search(r'Dry-run scheduled actions: (\d+)',text)
        return rc,int(match.group(1)) if match else None
    save()
    try:
        rc,count=run('preflight','--check');receipt['plannedActions']=count;save()
        if rc!=0 or count is None or count>1000:raise RuntimeError('preflight failed or exceeded incremental guard')
        rc,_=run('build','--build');receipt['buildExit']=rc;save()
        if rc!=0:raise RuntimeError('build failed')
        rc,count=run('guard','--check');receipt['guardExit']=rc;receipt['guardActions']=count;save()
        if rc!=0 or count!=0:raise RuntimeError('zero-action guard failed')
        plan=out/'blanc-build-plan.log';guard_log=plan.read_text()
        if 'ninja: no work to do.' not in guard_log or 'Build Succeeded: 0 steps' not in guard_log:raise RuntimeError('guard plan not zero-action')
        (records/'zero-plan.log').write_text(guard_log)
        if any((src/name).stat().st_mtime_ns>plan.stat().st_mtime_ns for name in manifest['overlay']) or framework.stat().st_mtime_ns>plan.stat().st_mtime_ns:raise RuntimeError('guard predates source or output')
        verify();receipt['frameworkSha256']=sha(framework);receipt['guardPlanSha256']=sha(plan);receipt['status']='verified';receipt['phase']='complete'
    except Exception as exc:
        receipt['status']='failed';receipt['error']=str(exc)
    finally:
        receipt['observationEndedEpoch']=time.time()
        if receipt['status']!='in-progress':receipt['endEpoch']=time.time()
        save();print(json.dumps(receipt,indent=2))
    if receipt['status']!='verified':raise SystemExit(1)

if __name__=='__main__':
    with sunrise_lock():main()
