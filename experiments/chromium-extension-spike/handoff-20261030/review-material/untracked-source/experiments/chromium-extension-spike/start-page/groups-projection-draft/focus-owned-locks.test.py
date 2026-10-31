from pathlib import Path
import ast,hashlib,json,os,tempfile
p=Path(__file__).resolve().parent/'record-focus-branch-diagnostic.py';tree=ast.parse(p.read_text());f=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='capture_owned_locks')
env={'Path':Path,'hashlib':hashlib,'json':json,'os':os};exec(compile(ast.Module(body=[f],type_ignores=[]),str(p),'exec'),env)
with tempfile.TemporaryDirectory(prefix='focus-owned-locks-') as td:
 out=Path(td);env['out']=out
 for name in ('.blanc-sunrise-transaction.lock','.blanc-build-guard.lock'):
  lock=out/name;lock.mkdir();(lock/'owner.json').write_text(json.dumps({'pid':os.getpid(),'createdNs':123}))
 result=env['capture_owned_locks']();assert len(result)==2 and all(x['owner']['pid']==os.getpid() for x in result.values())
 owner=out/'.blanc-build-guard.lock'/'owner.json';owner.write_text(json.dumps({'pid':os.getpid()+999,'createdNs':123}))
 try:env['capture_owned_locks']();raise AssertionError('foreign owner accepted')
 except RuntimeError:pass
 owner.write_text(json.dumps({'pid':os.getpid(),'createdNs':123}));(owner.parent/'foreign').write_text('x')
 try:env['capture_owned_locks']();raise AssertionError('foreign entry accepted')
 except RuntimeError:pass
 print('PASS recorder snapshots owned inode/hash identities; foreign owner/entry refused')
