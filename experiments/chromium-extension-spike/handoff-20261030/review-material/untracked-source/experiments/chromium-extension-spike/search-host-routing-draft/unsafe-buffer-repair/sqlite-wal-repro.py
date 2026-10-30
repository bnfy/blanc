# Synthetic temporary data only; no product or fixture database is opened.
import os, pathlib, sqlite3, subprocess, tempfile
with tempfile.TemporaryDirectory(prefix='blanc-sqlite-diagnostic-') as d:
 p=os.path.join(d,'db')
 setup=subprocess.run(['/usr/bin/sqlite3',p,'PRAGMA journal_mode=WAL; CREATE TABLE urls(url TEXT); INSERT INTO urls VALUES(1); PRAGMA wal_checkpoint(TRUNCATE);'],capture_output=True,text=True)
 assert setup.returncode==0 and setup.stdout.strip().endswith('0|0|0')
 for suffix in ('-wal','-shm'):
  if os.path.exists(p+suffix):
   if suffix=='-wal': assert os.stat(p+suffix).st_size==0
   os.unlink(p+suffix) # Only this test's known, checkpointed disposable files.
 assert pathlib.Path(p).read_bytes()[18:20]==b'\x02\x02'
 assert sorted(os.listdir(d))==['db']
 raw=subprocess.run(['/usr/bin/sqlite3','-readonly',p,'SELECT count(*) FROM urls;'],capture_output=True,text=True)
 print('ordinary readonly exit:',raw.returncode,'stderr:',repr(raw.stderr),'stdout:',repr(raw.stdout))
 assert raw.returncode!=0 and 'unable to open database file (14)' in raw.stderr
 assert sorted(os.listdir(d))==['db']
 uri=pathlib.Path(p).as_uri()+'?mode=ro&immutable=1'
 fixed=subprocess.run(['/usr/bin/sqlite3','-readonly',uri,'PRAGMA quick_check; SELECT count(*) FROM urls;'],capture_output=True,text=True)
 print('immutable readonly exit:',fixed.returncode,'stderr:',repr(fixed.stderr),'stdout:',repr(fixed.stdout))
 assert fixed.returncode==0 and fixed.stdout=='ok\n1\n' and sorted(os.listdir(d))==['db']
 print('synthetic repro only; no product database opened')
