"""Owned cooperative guards for groups work; unknown locks remain untouched."""
from contextlib import contextmanager
from pathlib import Path
import json,os,sys,time
OUT=Path('<local-home>/Projects/BlancChromium158/src/out/BlancPrototype')
@contextmanager
def _owned(name):
 lock=OUT/name;os.mkdir(lock);owner=json.dumps({'pid':os.getpid(),'createdNs':time.time_ns()},sort_keys=True)+'\n';path=lock/'owner.json'
 try:
  with path.open('x') as f:f.write(owner);f.flush();os.fsync(f.fileno())
  fd=os.open(lock,os.O_RDONLY)
  try:os.fsync(fd)
  finally:os.close(fd)
 except BaseException:
  print('Retained lock after owner creation failure: '+str(lock),file=sys.stderr)
  raise
 try:
  yield
 except BaseException:
  print('Retained lock after interrupted or failed operation: '+str(lock),file=sys.stderr)
  raise
 else:
  try:
   if path.read_text()!=owner:raise RuntimeError('lock owner changed')
   path.unlink();os.rmdir(lock)
  except BaseException:
   print('Retained or uncertain lock after release failure: '+str(lock),file=sys.stderr)
   raise
@contextmanager
def sunrise_lock():
 with _owned('.blanc-sunrise-transaction.lock'):yield
@contextmanager
def build_wrapper_lock():
 with _owned('.blanc-build-guard.lock'):yield
