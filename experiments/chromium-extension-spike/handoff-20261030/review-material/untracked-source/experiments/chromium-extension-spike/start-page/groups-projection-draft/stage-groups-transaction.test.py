"""Test the actual draft transaction helpers using disposable files only."""
from pathlib import Path
import ast, hashlib, json, os, shutil, tempfile, time

h=Path(__file__).resolve().parent
tree=ast.parse((h/'stage-groups-transaction.py').read_text())
names={'sync_dir','sync_tree','save','object_for','check_stamp','replace','pending','restored'}
functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
assert {n.name for n in functions}==names
env={'Path':Path,'json':json,'os':os,'shutil':shutil,'time':time,
     'sha':lambda p:hashlib.sha256(p.read_bytes()).hexdigest()}
exec(compile(ast.Module(body=functions,type_ignores=[]),str(h/'stage-groups-transaction.py'),'exec'),env)
sha=env['sha']
with tempfile.TemporaryDirectory(prefix='blanc-sunrise-stage-test-') as d:
    root=Path(d);src=root/'src';records=root/'records';out=root/'out'
    src.mkdir();records.mkdir();out.mkdir();env.update(src=src,records=records,out=out,receipt=records/'transaction.json')
    oldname='chrome/browser/prefs/browser_prefs.cc';other='chrome/browser/ui/blanc_prototype_ui.cc';newname='chrome/browser/ui/launch_sunrise_gate.h'
    tree=root/'backup-tree';tree.mkdir();(tree/'nested').mkdir();(tree/'nested'/'file').write_text('backup');(tree/'link').symlink_to('nested/file')
    env['sync_tree'](tree);assert (tree/'nested'/'file').read_text()=='backup' and (tree/'link').is_symlink()
    print('PASS syncs nested disposable backup while retaining symlinks')
    old=src/oldname;new=src/newname;second=src/other
    for p in [old,new,second,env['object_for'](oldname),env['object_for'](other)]:p.parent.mkdir(parents=True,exist_ok=True)
    for obj in [env['object_for'](oldname),env['object_for'](other)]:
        obj.write_text('cached');t=time.time_ns()-5_000_000_000;os.utime(obj,ns=(t,t))
    old.write_text('original');second.write_text('original two')
    oldhash=sha(old);secondhash=sha(second)
    for name in [oldname,other]:
        backup=records/'preimages'/name;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src/name,backup)
        t=time.time_ns()-10_000_000_000;os.utime(backup,ns=(t,t))
    old.write_text('candidate');second.write_text('candidate two');new.write_text('include')
    targets={oldname:{'before':oldhash,'after':sha(old)},other:{'before':secondhash,'after':sha(second)},newname:{'before':None,'after':sha(new)}}
    data={'status':'restore-incomplete','targets':targets,'restored':[]}
    env['restored'](data)
    assert old.read_text()=='original' and second.read_text()=='original two' and not new.exists()
    for name in [oldname,other]:assert (src/name).stat().st_mtime_ns>env['object_for'](name).stat().st_mtime_ns
    assert json.loads((records/'transaction.json').read_text())['pending'] is None
    print('PASS restores bytes and stamps each source newer than its cached object')
    t=time.time_ns()-10_000_000_000;os.utime(old,ns=(t,t));data['restored']=[];env['restored'](data)
    assert old.stat().st_mtime_ns>env['object_for'](oldname).stat().st_mtime_ns
    print('PASS already-restored stale source is re-stamped')
    old.write_text('candidate');new.write_text('user edit');data['restored']=[]
    try:env['restored'](data);raise AssertionError('unexpected restoration')
    except RuntimeError as e:assert 'source changed' in str(e)
    assert old.read_text()=='candidate';new.unlink()
    backup=records/'preimages'/other;backup.write_text('corrupt')
    try:env['restored'](data);raise AssertionError('corrupt backup accepted')
    except RuntimeError as e:assert 'preimage' in str(e)
    assert old.read_text()=='candidate';backup.unlink()
    try:env['restored'](data);raise AssertionError('missing backup accepted')
    except RuntimeError as e:assert 'preimage' in str(e)
    assert old.read_text()=='candidate';backup.write_text('original two')
    print('PASS drift and missing or corrupt later preimages abort before mutation')
    tmp=second.with_name(second.name+'.sunrise-transaction');tmp.write_text('unfinished')
    try:env['restored'](data);raise AssertionError('orphan accepted')
    except RuntimeError as e:assert 'orphaned' in str(e)
    assert old.read_text()=='candidate' and tmp.read_text()=='unfinished';tmp.unlink()
    obj=env['object_for'](other);future=time.time_ns()+60_000_000_000;os.utime(obj,ns=(future,future))
    try:env['restored'](data);raise AssertionError('future object accepted')
    except RuntimeError as e:assert 'timestamp' in str(e)
    assert old.read_text()=='candidate';past=time.time_ns()-5_000_000_000;os.utime(obj,ns=(past,past))
    print('PASS orphan temporary and future object abort before mutation')
    real=env['replace']
    def crash(source,target,threshold):
        receipt=json.loads((records/'transaction.json').read_text())
        assert receipt['pending']['operation']=='restore-replace' and receipt['pending']['name']==oldname
        raise RuntimeError('simulated crash before replacement')
    env['replace']=crash
    try:env['restored'](data);raise AssertionError('crash not triggered')
    except RuntimeError as e:assert 'simulated' in str(e)
    assert old.read_text()=='candidate' and json.loads((records/'transaction.json').read_text())['pending']['name']==oldname
    env['replace']=real;data['restored']=[];env['restored'](data)
    assert old.read_text()=='original'
    print('PASS intent is durable before replacement and interrupted work resumes')
    old.write_text('candidate');data['restored']=[]
    def crash_after(source,target,threshold):
        real(source,target,threshold)
        raise RuntimeError('simulated crash after rename')
    env['replace']=crash_after
    try:env['restored'](data);raise AssertionError('crash not triggered')
    except RuntimeError as e:assert 'after rename' in str(e)
    assert old.read_text()=='original' and json.loads((records/'transaction.json').read_text())['pending']['name']==oldname
    env['replace']=real;data['restored']=[];env['restored'](data)
    assert old.read_text()=='original' and json.loads((records/'transaction.json').read_text())['pending'] is None
    print('PASS crash after atomic rename resumes from validated restored bytes')
