"""Exercise actual lock identity/removal helpers on disposable directories."""
from pathlib import Path
import ast,hashlib,json,os,tempfile
h=Path(__file__).resolve().parent;tree=ast.parse((h/'recover-groups1-locks.py').read_text());names={'inspect_lock','remove_checked'};functions=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in names];env={'os':os,'json':json,'hashlib':hashlib};exec(compile(ast.Module(body=functions,type_ignores=[]),'lock-recovery','exec'),env)
with tempfile.TemporaryDirectory(prefix='groups-recovery-test-') as tmp:
 root=Path(tmp);lock=root/'guard';lock.mkdir();owner={'pid':57051,'createdNs':123};content=json.dumps(owner,sort_keys=True)+'\n';(lock/'owner.json').write_text(content);digest=hashlib.sha256(content.encode()).hexdigest();fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
 try:
  identity=env['inspect_lock'](fd,'guard',digest,123)
  (lock/'other').write_text('foreign')
  try:env['remove_checked'](fd,'guard',identity,digest,123);raise AssertionError('extra file accepted')
  except RuntimeError:pass
  assert (lock/'owner.json').exists() and (lock/'other').exists();(lock/'other').unlink()
  (lock/'owner.json').write_text('different')
  try:env['remove_checked'](fd,'guard',identity,digest,123);raise AssertionError('changed owner accepted')
  except RuntimeError:pass
  assert lock.exists();(lock/'owner.json').write_text(content)
  identity=env['inspect_lock'](fd,'guard',digest,123);env['remove_checked'](fd,'guard',identity,digest,123);assert not lock.exists()
 finally:os.close(fd)
 print('PASS owner/inode binding, foreign file refusal, changed owner refusal and owned removal in disposable tree')
