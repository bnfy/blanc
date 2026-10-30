"""Review-only start-event guard for an owned process group. No build invoked."""
from pathlib import Path
import importlib.util,os,signal,time
h=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('start_events',h/'action-start-monitor-draft.py');events=importlib.util.module_from_spec(spec);spec.loader.exec_module(events)
spec=importlib.util.spec_from_file_location('scope_events',h/'scope_monitor.py');scope=importlib.util.module_from_spec(spec);spec.loader.exec_module(scope)
class ActionGuardStopped(RuntimeError):pass
class ActionGuardUncertain(RuntimeError):pass

def monitor(child,log_path,receipt,save,allowlist,interval=.2,grace=15):
 """Signals only an owned process group after unexpected observed action.

 Polling sees actions after they start and cannot enforce a hard ceiling.
 Caller must preserve locks if this function raises or exit is uncertain.
 """
 pgid=child.pid
 if os.getpgid(child.pid)!=pgid:raise ActionGuardUncertain('child is not an owned process-group leader')
 observer=events.StartObserver(allowlist);receipt.update(actionGuard='active',buildProcessGroup=pgid,actionStartCap=6);save()
 offset=0;stopped=False;deadline=None;reason=None
 def stop(error):
  nonlocal stopped,deadline,reason
  if stopped:return
  reason=str(error);receipt.update(actionGuard='terminating',actionGuardReason=reason,observedStarts=list(observer.started));save()
  try:os.killpg(pgid,signal.SIGTERM)
  except ProcessLookupError:pass
  except OSError as e:raise ActionGuardUncertain('could not signal owned group: '+str(e)) from e
  stopped=True;deadline=time.monotonic()+grace
 with open(log_path,'rb') as incoming:
  while True:
   incoming.seek(offset);chunk=incoming.read(65536);offset=incoming.tell()
   if not stopped:
    try:
     prior=len(observer.started);observer.feed(chunk)
     if len(observer.started)!=prior:receipt['observedStarts']=list(observer.started);save()
    except events.UncertainScope as e:stop(e)
   rc=child.poll()
   if rc is not None and not stopped:
    incoming.seek(offset)
    try:
     while True:
      extra=incoming.read(65536)
      if not extra:break
      observer.feed(extra)
     offset=incoming.tell()
     if rc==0:result=observer.finish()
     else:raise events.UncertainScope('build exited nonzero: '+str(rc))
    except events.UncertainScope as e:stop(e)
    else:
     if scope.group_gone(pgid):
      receipt.update(actionGuard='completed',actionEvidence=result,buildExit=rc);save();return rc
     if deadline is None:receipt['actionGuard']='parent-exited-waiting-for-group';save();deadline=time.monotonic()+grace
   if stopped and rc is not None and scope.group_gone(pgid):
    receipt.update(actionGuard='stopped',buildExit=rc);save();raise ActionGuardStopped(reason)
   if deadline is not None and time.monotonic()>=deadline:
    receipt.update(actionGuard='stop-unconfirmed',buildExit=rc);save();raise ActionGuardUncertain('process group may still be live; retain locks')
   time.sleep(interval)
