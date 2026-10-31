"""Prepared only: reversible Sunrise source staging; never runs a build.

Stage requires matching verified baseline and no Ninja/Siso process. It preserves
the complete baseline app and source preimages in a fresh durable directory,
and records (without copying or altering) the separate search candidate.
Restore checks every path for drift and restores only this transaction's bytes.
It does not restore build output; an incremental rebuild and exact framework
verification remain necessary before claiming the baseline output is restored.
"""
from pathlib import Path
import hashlib,json,os,re,shutil,subprocess,sys,time
from operation_lock_groups import sunrise_lock, build_wrapper_lock

if len(sys.argv)!=3 or sys.argv[1] not in ('stage','restore') or not re.fullmatch(r'[a-z0-9-]+',sys.argv[2]):
    raise SystemExit('usage: stage-transaction.py stage|restore fresh-label')
mode,label=sys.argv[1:];h=Path(__file__).resolve().parent
preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype'
records=preview/'evidence/start-page-groups-20261029'/('stage-'+label);receipt=records/'transaction.json'
overlay=h/'overlay';manifest_path=h/'manifest.json';manifest=json.loads(manifest_path.read_text())
app=out/'Blanc Prototype.app';relative_framework=Path('Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework')
baseline='ca7c89de79ce0f1eb1ba06cae6945f00966d89337382ff8ad3cecb90d74f9335'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
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
    processes=subprocess.check_output(['ps','-axo','pid=,comm='],text=True)
    for line in processes.splitlines():
        bits=line.strip().split(None,1)
        if len(bits)==2 and Path(bits[1]).name.lower() in ('ninja','autoninja','siso'):raise RuntimeError('build process active: '+bits[0])
def sync_dir(path):
    fd=os.open(path,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)

def sync_tree(root):
    # Flush regular file contents before their directory entries, then walk
    # directories bottom-up. Symlinks are preserved as links, never followed.
    paths=list(root.rglob('*'))
    for p in paths:
        if not p.is_symlink() and p.is_file():
            with p.open('rb') as f:os.fsync(f.fileno())
    dirs=[p for p in paths if not p.is_symlink() and p.is_dir()]
    for p in sorted(dirs,key=lambda x:len(x.parts),reverse=True):sync_dir(p)
    sync_dir(root);sync_dir(root.parent)

def save(data):
    tmp=receipt.with_suffix('.new')
    with tmp.open('w') as f:
        f.write(json.dumps(data,indent=2)+'\n');f.flush();os.fsync(f.fileno())
    os.replace(tmp,receipt)
    fd=os.open(receipt.parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)

def object_for(name):
    if name=='chrome/browser/prefs/browser_prefs.cc':
        return out/'obj/chrome/browser/prefs/impl/browser_prefs.o'
    if name.startswith('chrome/browser/ui/'):
        return out/'obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o'
    raise RuntimeError('unknown source-to-object mapping: '+name)

def check_stamp(name,target):
    obj=object_for(name)
    if obj.is_symlink() or not obj.is_file():raise RuntimeError('cached object unavailable: '+str(obj))
    threshold=max(obj.stat().st_mtime_ns,target.stat().st_mtime_ns if target.exists() else 0)
    if time.time_ns()<=threshold:raise RuntimeError('source or object timestamp is not behind clock: '+name)
    return threshold

def replace(source,target,threshold):
    tmp=target.with_name(target.name+'.sunrise-transaction')
    if tmp.exists() or tmp.is_symlink():raise RuntimeError('temporary path already exists: '+str(tmp))
    with source.open('rb') as inp,tmp.open('xb') as dest:
        shutil.copyfileobj(inp,dest);os.fchmod(dest.fileno(),source.stat().st_mode & 0o7777)
        dest.flush();os.fsync(dest.fileno())
        now=time.time_ns()
        if now<=threshold:raise RuntimeError('clock cannot safely advance source timestamp')
        os.utime(tmp,ns=(now,now));os.fsync(dest.fileno())
    if tmp.stat().st_mtime_ns<=threshold:raise RuntimeError('filesystem cannot advance source timestamp')
    os.replace(tmp,target)
    fd=os.open(target.parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)

def pending(data,operation,name):
    data['pending']={'operation':operation,'name':name,'temporary':str((src/name).with_name((src/name).name+'.sunrise-transaction'))}
    save(data)

def restored(data):
    # Validate the entire transaction and all preimages before any mutation.
    for name,item in data['targets'].items():
        p=src/name;tmp=p.with_name(p.name+'.sunrise-transaction')
        if tmp.exists() or tmp.is_symlink():raise RuntimeError('orphaned transaction temporary: '+str(tmp))
        if p.is_symlink():raise RuntimeError('unexpected source symlink '+name)
        if p.exists() and sha(p) not in {item['after'],item['before']}:raise RuntimeError('source changed: '+name)
        if not p.exists() and item['before'] is not None:raise RuntimeError('original source disappeared: '+name)
        check_stamp(name,p)
        if item['before'] is not None:
            backup=records/'preimages'/name
            if backup.is_symlink() or not backup.is_file() or sha(backup)!=item['before']:
                raise RuntimeError('preimage missing or changed: '+name)
    for name,item in data['targets'].items():
        p=src/name
        if item['before'] is None:
            if p.exists():
                pending(data,'restore-remove',name);p.unlink()
                fd=os.open(p.parent,os.O_RDONLY)
                try:os.fsync(fd)
                finally:os.close(fd)
        else:
            # Even identical bytes must be newer than the object: an earlier
            # interrupted restore may have copied them with a stale timestamp.
            if sha(p)!=item['before'] or p.stat().st_mtime_ns<=object_for(name).stat().st_mtime_ns:
                pending(data,'restore-replace',name)
                replace(records/'preimages'/name,p,check_stamp(name,p))
                if sha(p)!=item['before'] or p.stat().st_mtime_ns<=object_for(name).stat().st_mtime_ns:
                    raise RuntimeError('restored source verification failed: '+name)
        data['restored'].append(name);data['pending']=None;save(data)
    data['status']='sources-restored-output-not-rebuilt';save(data)

def verify_preserved(data):
    backup=records/'verified-baseline.app'
    if sha(backup/relative_framework)!=data['baselineFrameworkSha256'] or inventory(backup)!=data['baselineAppInventory']:
        raise RuntimeError('preserved baseline app changed')
    output_backup=records/'verified-baseline-output-framework'
    if inventory(output_backup)!=data['baselineOutputFrameworkInventory'] or sha(records/'verified-baseline-ui.o')!=data['baselineUiObjectSha256']:
        raise RuntimeError('preserved baseline output changed')
    for label_id,item in data['sunrisePreserved'].items():
        file=preview/'evidence/start-page-sunrise-20261029'/('unverified-sunrise-'+label_id+'-inventory.json')
        path=file.parent/('unverified-sunrise-'+label_id+'.app')
        if sha(file)!=item['inventorySha256'] or inventory(path)!=item['entries']:raise RuntimeError('preserved Sunrise candidate changed')
    if inventory(preview/'evidence/start-page-sunrise-20261029/assets-v2')!=data['sunriseAssets']:
        raise RuntimeError('Sunrise assets changed')
    path=preview/'evidence/search-host-routing-20261029/preserved-candidate-receipt.json'
    if sha(path)!=data['searchReceiptSha256']:raise RuntimeError('search candidate receipt changed')
    search=json.loads(path.read_text())
    if sha(Path(search['archive'])/relative_framework)!=data['searchFrameworkSha256'] or inventory(Path(search['assets']))!=data['searchAssets']:
        raise RuntimeError('preserved search candidate changed')

def main():
    no_build()
    if mode=='restore':
        data=json.loads(receipt.read_text());assert data['overlayManifestSha256']==sha(manifest_path)
        if data['status'] not in ('staging','staged','restore-incomplete'):raise SystemExit('transaction not restorable')
        verify_preserved(data)
        data['restored']=[];data['status']='restore-incomplete';save(data);restored(data)
        verify_preserved(data)
        print('Source preimages restored; baseline output requires guarded rebuild and SHA verification.')
        return

    assert not records.exists(),'use a fresh durable label'
    inputs=json.loads((h/'inputs.json').read_text())
    before={'chrome/browser/ui/blanc_prototype_ui.cc':inputs['nativeBaseSha256']}
    for name,digest in manifest['overlay'].items():
        candidate=overlay/name
        assert not candidate.is_symlink() and sha(candidate)==digest
        target=src/name
        check_stamp(name,target)
        tmp=target.with_name(target.name+'.sunrise-transaction')
        if tmp.exists() or tmp.is_symlink():raise RuntimeError('orphaned transaction temporary: '+str(tmp))
        if name in before:assert not target.is_symlink() and sha(target)==before[name],name
        else:assert not target.exists() and not target.is_symlink(),'new include already exists: '+name
    assets=h/'assets-v1'
    assert inventory(assets)=={name:{'sha256':digest} for name,digest in manifest['assets'].items()},'groups assets changed'
    assert sha(app/relative_framework)==baseline,'verified output changed'
    devtools=src/'content/browser/devtools/devtools_url_loader_interceptor.cc'
    assert sha(devtools)=='73dca4c2c65aa0be79f7ed6dbd5b4281a2d39cde01395d7eb86205bdb3f9d121'
    search_path=preview/'evidence/search-host-routing-20261029/preserved-candidate-receipt.json';search=json.loads(search_path.read_text())
    search_framework=Path(search['archive'])/relative_framework;search_assets=Path(search['assets'])
    assert sha(search_framework)==search['framework']=='7428bc301fdaf9e2a559133e0e1ce2de5f8e6785a022a36313bdbfbb5d2bcaad'
    search_inventory=inventory(search_assets);assert len(search_inventory)==search['assets_count']==78 and all('sha256' in v for v in search_inventory.values())
    trusted_receipt=preview/'evidence/start-page-sunrise-20261029/stage-sunrise-a/transaction.json'
    trusted_sha='628bd51e633ecfa23f21fdd147df30c168175e71597f55ddba468dad713a0383'
    if sha(trusted_receipt)!=trusted_sha:raise RuntimeError('trusted baseline receipt changed')
    trusted=json.loads(trusted_receipt.read_text())
    trusted_inventory=trusted['baselineAppInventory']
    if trusted['baselineFrameworkSha256']!=baseline or len(trusted_inventory)!=353 or inventory(app)!=trusted_inventory:
        raise RuntimeError('live app differs from trusted full baseline inventory')
    records.mkdir(parents=True)
    # Persist the new transaction entry and any newly created parent entries.
    parent=records
    while True:
        sync_dir(parent)
        if parent==preview:break
        if preview not in parent.parents:raise RuntimeError('unexpected records lineage')
        parent=parent.parent
    sync_dir(preview.parent)
    backup_app=records/'verified-baseline.app'
    subprocess.run(['/usr/bin/ditto',str(app),str(backup_app)],check=True)
    original_app_inventory=inventory(app)
    if original_app_inventory!=trusted_inventory or inventory(backup_app)!=trusted_inventory:
        raise RuntimeError('live or copied app differs from trusted full baseline inventory')
    sync_tree(backup_app)
    if inventory(app)!=trusted_inventory or inventory(backup_app)!=trusted_inventory:
        raise RuntimeError('baseline changed during flush')
    assert sha(app/relative_framework)==sha(backup_app/relative_framework)==baseline
    assert sha(search_framework)==search['framework'] and inventory(search_assets)==search_inventory
    output_framework=out/'Blanc Prototype Framework.framework'
    assert sha(output_framework/'Versions/158.0.8127.2/Blanc Prototype Framework')==baseline,'output framework changed'
    preserved_output=records/'verified-baseline-output-framework'
    subprocess.run(['/usr/bin/ditto',str(output_framework),str(preserved_output)],check=True)
    output_inventory=inventory(output_framework)
    prefix='Contents/Frameworks/Blanc Prototype Framework.framework/'
    expected_output={name[len(prefix):]:item for name,item in trusted_inventory.items() if name.startswith(prefix)}
    if output_inventory!=expected_output or inventory(preserved_output)!=expected_output:
        raise RuntimeError('live or copied output framework differs from trusted baseline')
    sync_tree(preserved_output);assert inventory(preserved_output)==output_inventory
    obj=object_for('chrome/browser/ui/blanc_prototype_ui.cc')
    object_backup=records/'verified-baseline-ui.o';shutil.copy2(obj,object_backup)
    with object_backup.open('rb') as f:os.fsync(f.fileno())
    assert sha(object_backup)==sha(obj);sync_dir(records)
    sunrise={}
    for label_id in ('ee751757','f318'):
        inventory_path=preview/'evidence/start-page-sunrise-20261029'/('unverified-sunrise-'+label_id+'-inventory.json')
        expected=json.loads(inventory_path.read_text());path=inventory_path.parent/('unverified-sunrise-'+label_id+'.app')
        assert Path(expected['preserved'])==path and inventory(path)==expected['entries']
        sunrise[label_id]={'inventorySha256':sha(inventory_path),'entries':expected['entries']}
    sunrise_assets=preview/'evidence/start-page-sunrise-20261029/assets-v2'
    sunrise_asset_inventory=inventory(sunrise_assets)
    data={'status':'staging','startedEpoch':time.time(),'overlayManifestSha256':sha(manifest_path),'baselineFrameworkSha256':baseline,
          'baselineAppInventory':original_app_inventory,'trustedBaselineReceiptSha256':trusted_sha,'baselineOutputFrameworkInventory':output_inventory,'baselineUiObjectSha256':sha(object_backup),'sunrisePreserved':sunrise,'sunriseAssets':sunrise_asset_inventory,'searchReceiptSha256':sha(search_path),'searchFrameworkSha256':search['framework'],
          'searchAssets':search_inventory,'targets':{},'applied':[],'restored':[]}
    for name,digest in manifest['overlay'].items():
        item={'before':before.get(name),'after':digest};data['targets'][name]=item
        if item['before'] is not None:
            backup=records/'preimages'/name;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src/name,backup);assert sha(backup)==item['before']
    sync_tree(records/'preimages')
    for name,item in data['targets'].items():
        if item['before'] is not None and sha(records/'preimages'/name)!=item['before']:
            raise RuntimeError('preimage changed during flush: '+name)
    save(data)
    verify_preserved(data)
    try:
        no_build()
        for name,item in data['targets'].items():
            target=src/name
            if item['before'] is None:assert not target.exists() and not target.is_symlink()
            else:assert sha(target)==item['before']
            pending(data,'stage-replace',name)
            replace(overlay/name,target,check_stamp(name,target))
            if sha(target)!=item['after'] or target.stat().st_mtime_ns<=object_for(name).stat().st_mtime_ns:raise RuntimeError('staged source verification failed: '+name)
            data['applied'].append(name);data['pending']=None;save(data)
        verify_preserved(data)
        data['status']='staged';data['finishedEpoch']=time.time();save(data)
    except BaseException:
        data['status']='restore-incomplete';save(data)
        try:restored(data)
        finally:raise
    print('Staged reviewed source only; no build run. Preimages and verified baseline app preserved.')

if __name__ == '__main__':
    with sunrise_lock(), build_wrapper_lock():
        main()
