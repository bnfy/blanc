"""Synthetic owned subprocesses only; never touches Chromium output."""
from pathlib import Path
import importlib.util,os,subprocess,sys,tempfile
h=Path(__file__).resolve().parent;spec=importlib.util.spec_from_file_location('scope_monitor',h/'scope_monitor.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
o=m.ScopeObserver();assert o.feed(b'[1/99')==0;assert o.feed(b'9]')==999;assert o.feed(b'\r[2/1001]')==1001
with tempfile.TemporaryDirectory(prefix='groups-scope-monitor-') as tmp:
 root=Path(tmp);log=root/'expanded.log';receipt={};saves=[]
 script='''import subprocess,sys,time,signal
worker=subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"])
def stop(signum,frame):
 worker.wait(timeout=2)
 sys.exit(0)
signal.signal(signal.SIGTERM,stop)
print("before-marker worker="+str(worker.pid),flush=True)
print("[0/1001] test",flush=True)
time.sleep(30)
'''
 with log.open('xb',buffering=0) as f:
  child=subprocess.Popen([sys.executable,'-u','-c',script],stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  try:m.monitor(child,log,receipt,lambda:saves.append(dict(receipt)),cap=1000,interval=.02,grace=3);raise AssertionError('expansion accepted')
  except m.ScopeLimitExceeded:pass
  finally:
   if child.poll() is None:os.killpg(child.pid,15);child.wait(timeout=3)
 assert receipt['scopeExceeded'] and receipt['liveMaxAdvertised']==1001 and receipt['scopeMonitoring']=='stopped-after-expansion';assert child.returncode is not None and 'before-marker' in log.read_text()
 log2=root/'normal.log';receipt2={}
 with log2.open('xb',buffering=0) as f:
  child=subprocess.Popen([sys.executable,'-u','-c','import time;print("[0/3] test",flush=True);time.sleep(.15)'],stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  assert m.monitor(child,log2,receipt2,lambda:None,cap=1000,interval=.02,grace=3)==0
 assert receipt2['scopeMonitoring']=='completed' and receipt2['liveMaxAdvertised']==3
 log3=root/'reviewed-cap.log';receipt3={}
 with log3.open('xb',buffering=0) as f:
  child=subprocess.Popen([sys.executable,'-u','-c','import time;print("[0/3] test",flush=True);time.sleep(30)'],stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  try:m.monitor(child,log3,receipt3,lambda:None,cap=2,interval=.02,grace=3);raise AssertionError('reviewed-cap expansion accepted')
  except m.ScopeLimitExceeded:pass
  finally:
   if child.poll() is None:os.killpg(child.pid,15);child.wait(timeout=3)
 assert receipt3['liveMaxAdvertised']==3 and receipt3['scopeMonitoring']=='stopped-after-expansion'
 log4=root/'silent.log';receipt4={'plannedActions':2}
 with log4.open('xb',buffering=0) as f:
  child=subprocess.Popen([sys.executable,'-u','-c','import time;time.sleep(.15)'],stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  try:m.monitor(child,log4,receipt4,lambda:None,cap=2,interval=.02,grace=3);raise AssertionError('silent success accepted')
  except m.ScopeStopUncertain:pass
 assert receipt4['scopeMonitoring']=='no-observed-progress'
 log5=root/'cap-556.log';receipt5={}
 with log5.open('xb',buffering=0) as f:
  child=subprocess.Popen([sys.executable,'-u','-c','import time;print("[0/556] allowed",flush=True);time.sleep(.1);print("[0/557] excessive",flush=True);time.sleep(30)'],stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  try:m.monitor(child,log5,receipt5,lambda:None,cap=556,interval=.02,grace=3);raise AssertionError('557 accepted')
  except m.ScopeLimitExceeded:pass
  finally:
   if child.poll() is None:os.killpg(child.pid,15);child.wait(timeout=3)
 assert receipt5['liveMaxAdvertised']==557 and '[0/556] allowed' in log5.read_text()
 print('PASS split markers, owned-group stop, retained log, normal completion, reviewed-plan cap, silent-output refusal and 556/557 boundary')
