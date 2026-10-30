"""Exercise both real inventory functions only on disposable files."""
from pathlib import Path
import ast,hashlib,os,tempfile
h=Path(__file__).resolve().parent
for name in ('stage-groups-transaction.py','record-groups-build.py'):
 tree=ast.parse((h/name).read_text());function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='inventory')
 def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
 env={'os':os,'sha':sha};exec(compile(ast.Module(body=[function],type_ignores=[]),name,'exec'),env)
 with tempfile.TemporaryDirectory(prefix='blanc-groups-inventory-') as t:
  root=Path(t)/'bundle';root.mkdir();(root/'good').write_text('contents');(root/'internal').symlink_to('good')
  assert env['inventory'](root)['internal']=={'symlink':'good'}
  outside=Path(t)/'outside';outside.write_text('private');(root/'escape').symlink_to(outside)
  try:env['inventory'](root);raise AssertionError('escape accepted')
  except RuntimeError as e:assert 'escaping symlink' in str(e)
 print('PASS '+name+' includes internal symlink and rejects escaped target')
