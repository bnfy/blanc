"""Synthetic child only; does not run a browser, Siso, or touch Chromium output."""
from pathlib import Path
import importlib.util,os,subprocess,sys,tempfile
h=Path(__file__).resolve().parent;spec=importlib.util.spec_from_file_location('action_guard',h/'action-start-guard-draft.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);allow=m.events.pinned_closure()
with tempfile.TemporaryDirectory(prefix='groups-action-guard-') as tmp:
 root=Path(tmp);log=root/'success.log';receipt={}
 lines=[]
 for i,desc in enumerate(allow):lines.extend([f'[{i}/569] 1.0s S {desc}',f'[{i}/390] 1.1s F {desc}'])
 lines.append('Build Succeeded: 6 steps')
 script='import time;print('+repr('\n'.join(lines))+',flush=True);time.sleep(.15)'
 with log.open('xb',buffering=0) as f:
  child=subprocess.Popen([sys.executable,'-u','-c',script],stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  assert m.monitor(child,log,receipt,lambda:None,allow,interval=.02,grace=3)==0
 assert receipt['actionGuard']=='completed' and receipt['actionEvidence']['completed']==6 and receipt['actionEvidence']['maxAdvertised']==569
 log2=root/'unexpected.log';receipt2={};script='import time;print("[0/972] 1.0s S CXX obj/unexpected.o",flush=True);time.sleep(30)'
 with log2.open('xb',buffering=0) as f:
  child=subprocess.Popen([sys.executable,'-u','-c',script],stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  try:m.monitor(child,log2,receipt2,lambda:None,allow,interval=.02,grace=3);raise AssertionError('unexpected action accepted')
  except m.ActionGuardStopped:pass
  finally:
   if child.poll() is None:os.killpg(child.pid,15);child.wait(timeout=3)
 assert receipt2['actionGuard']=='stopped' and 'unexpected' in receipt2['actionGuardReason'] and 'unexpected.o' in log2.read_text()
 log3=root/'large.log';receipt3={};payload='ordinary\n'*150000+f'[0/900] 1.0s S {allow[0]}\n[0/900] 1.1s F {allow[0]}\nBuild Succeeded: 1 steps\n'
 script='import sys,time;sys.stdout.write('+repr('ordinary\n')+'*150000+'+repr(payload[len('ordinary\n')*150000:])+');sys.stdout.flush();time.sleep(.15)'
 with log3.open('xb',buffering=0) as f:
  child=subprocess.Popen([sys.executable,'-u','-c',script],stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  assert m.monitor(child,log3,receipt3,lambda:None,allow,interval=.02,grace=3)==0
 assert receipt3['actionEvidence']['started']==[allow[0]]
 print('PASS provisional totals, six pinned actions, owned-group stop, retained log and bounded multi-chunk reads')
