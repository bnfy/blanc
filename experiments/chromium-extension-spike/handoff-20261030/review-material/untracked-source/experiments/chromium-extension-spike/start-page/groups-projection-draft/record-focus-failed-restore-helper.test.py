"""Exercise the actual recorder helper with owned synthetic children."""
from pathlib import Path
import ast,importlib.util,os,subprocess,sys,tempfile
h=Path(__file__).resolve().parent;tree=ast.parse((h/'record-focus-failed-restore.py').read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='invoke_observed_build')
spec=importlib.util.spec_from_file_location('action_guard',h/'action-start-guard-draft.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
env={'subprocess':subprocess,'os':os,'action_guard':guard};exec(compile(ast.Module(body=[fn],type_ignores=[]),'recorder-helper','exec'),env);run=env['invoke_observed_build'];allow=guard.events.pinned_closure()
with tempfile.TemporaryDirectory(prefix='groups-closure-recorder-test-') as tmp:
 root=Path(tmp);receipt={};saved=[]
 data=f'[0/972] 1.0s S {allow[0]}\n[0/395] 1.1s F {allow[0]}\nBuild Succeeded: 1 steps\n'
 script='import time;print('+repr(data)+',end="",flush=True);time.sleep(.3)'
 rc=run([sys.executable,'-u','-c',script],root,os.environ,root/'good.log',receipt,lambda:saved.append(dict(receipt)),allow)
 assert rc==0 and receipt['actionGuard']=='completed' and receipt['buildExit']==0 and receipt['wrapperPid'] is None
 assert receipt['actionEvidence']['started']==[allow[0]] and any(x.get('wrapperPid') for x in saved)
 receipt2={};saved2=[];script='import time;print("[0/972] 1.0s S CXX obj/unknown.o",flush=True);time.sleep(30)'
 try:run([sys.executable,'-u','-c',script],root,os.environ,root/'bad.log',receipt2,lambda:saved2.append(dict(receipt2)),allow);raise AssertionError('unexpected action accepted')
 except guard.ActionGuardStopped:pass
 assert receipt2['actionGuard']=='stopped' and receipt2['wrapperPid'] and (root/'bad.log').exists()
 print('PASS actual recorder helper: receipt/PID/saved evidence, allowed build and unexpected-start group stop')
