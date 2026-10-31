from pathlib import Path
import ast,hashlib,json,os,tempfile
h=Path(__file__).resolve().parent;tree=ast.parse((h/'audit-focus-failed-recovery.py').read_text());names={'inspect_lock','remove_lock'};functions=[x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name in names];env={'os':os,'json':json,'hashlib':hashlib};exec(compile(ast.Module(body=functions,type_ignores=[]),'audit-locks','exec'),env)
with tempfile.TemporaryDirectory(prefix='focus-failed-recovery-test-') as tmp:
 root=Path(tmp);lock=root/'guard';lock.mkdir();owner={'pid':67362,'createdNs':123};content=json.dumps(owner,sort_keys=True)+'\n';(lock/'owner.json').write_text(content)
 ds=lock.stat();fs=(lock/'owner.json').stat();identity={'dirDev':ds.st_dev,'dirIno':ds.st_ino,'ownerDev':fs.st_dev,'ownerIno':fs.st_ino,'ownerSha256':hashlib.sha256(content.encode()).hexdigest(),'owner':owner}
 fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
 try:
  assert env['inspect_lock'](fd,'guard',identity)==identity
  (lock/'other').write_text('foreign')
  try:env['remove_lock'](fd,'guard',identity);raise AssertionError('extra file accepted')
  except RuntimeError:pass
  assert (lock/'owner.json').exists();(lock/'other').unlink()
  (lock/'owner.json').write_text('different')
  try:env['remove_lock'](fd,'guard',identity);raise AssertionError('changed owner accepted')
  except (RuntimeError,json.JSONDecodeError):pass
  assert lock.exists();(lock/'owner.json').write_text(content)
  env['remove_lock'](fd,'guard',identity);assert not lock.exists()
 finally:os.close(fd)
 print('PASS exact failed-owner lock identity; foreign entry/owner changes refused')
