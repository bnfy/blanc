from pathlib import Path
import contextlib,importlib.util,io,tempfile
from unittest.mock import patch
h=Path(__file__).resolve().parent;spec=importlib.util.spec_from_file_location('groups_lock',h/'operation_lock_groups.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(prefix='groups-lock-test-') as tmp:
 m.OUT=Path(tmp);lock=m.OUT/'.blanc-build-guard.lock'
 with m.build_wrapper_lock():assert (lock/'owner.json').exists()
 assert not lock.exists()
 lock.mkdir();(lock/'owner.json').write_text('someone else')
 try:
  with m.build_wrapper_lock():pass
  raise AssertionError('existing lock accepted')
 except FileExistsError:pass
 assert (lock/'owner.json').read_text()=='someone else';(lock/'owner.json').unlink();lock.rmdir()
 original=Path.open
 def failing(path,*a,**k):
  if path.name=='owner.json':raise PermissionError('synthetic owner failure')
  return original(path,*a,**k)
 with patch.object(Path,'open',failing),contextlib.redirect_stderr(io.StringIO()) as err:
  try:
   with m.build_wrapper_lock():pass
   raise AssertionError('owner creation accepted')
  except PermissionError as e:assert str(e)=='synthetic owner failure'
 assert lock.exists() and 'Retained lock' in err.getvalue();lock.rmdir()
 print('PASS owned release, pre-existing lock preservation, original owner-write error and uncertain lock retention')
