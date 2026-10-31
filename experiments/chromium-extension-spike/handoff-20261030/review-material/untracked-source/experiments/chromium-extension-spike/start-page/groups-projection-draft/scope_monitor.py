"""Observe Siso's live advertised totals; safe stop is best effort, not a hard cap."""
import os,re,signal,time
class ScopeLimitExceeded(RuntimeError):pass
class ScopeStopUncertain(RuntimeError):pass
class ScopeObserver:
 def __init__(self):self.tail='';self.maximum=0
 def feed(self,chunk):
  text=self.tail+chunk.decode('utf8',errors='replace')
  for match in re.finditer(r'\[(\d+)/(\d+)\]|Build Succeeded: (\d+) steps',text):
   self.maximum=max(self.maximum,*(int(x) for x in match.groups() if x is not None))
  self.tail=text[-128:]
  return self.maximum

def group_gone(pgid):
 try:os.killpg(pgid,0)
 except ProcessLookupError:return True
 except PermissionError:return False
 return False

def monitor(child,log_path,receipt,save,cap=1000,interval=.2,grace=15):
 """Caller starts an owned new process session and holds cooperative locks.

 Stops the owned process group with SIGTERM on an advertised total > cap.
 Leaves the caller's locks held via exception if stop/exit is uncertain. A
 polling monitor cannot guarantee no action starts beyond the cap.
 """
 pgid=child.pid
 if os.getpgid(child.pid)!=pgid:raise ScopeStopUncertain('build is not the expected owned process-group leader')
 receipt.update(buildProcessGroup=pgid,liveActionCap=cap,liveMaxAdvertised=0,scopeMonitoring='active');save()
 observer=ScopeObserver();offset=0;stopped=False;deadline=None
 with open(log_path,'rb') as incoming:
  while True:
   incoming.seek(offset);chunk=incoming.read();offset=incoming.tell()
   before=observer.maximum;maximum=observer.feed(chunk)
   if maximum!=before:receipt['liveMaxAdvertised']=maximum;save()
   if maximum>cap and not stopped:
    receipt.update(scopeMonitoring='terminating-expanded-build',scopeExceeded=True);save()
    try:os.killpg(pgid,signal.SIGTERM)
    except ProcessLookupError:pass
    except OSError as e:raise ScopeStopUncertain('could not signal owned build group: '+str(e)) from e
    stopped=True;deadline=time.monotonic()+grace
   rc=child.poll()
   if rc is not None and not stopped:
    # Drain bytes written between the read and process exit, and do not treat
    # parent exit as proof that its process group has finished.
    incoming.seek(offset);maximum=observer.feed(incoming.read());offset=incoming.tell();receipt['liveMaxAdvertised']=maximum
    if maximum>cap:
     receipt.update(scopeMonitoring='terminating-expanded-build',scopeExceeded=True);save()
     try:os.killpg(pgid,signal.SIGTERM)
     except ProcessLookupError:pass
     except OSError as e:raise ScopeStopUncertain('could not signal owned build group: '+str(e)) from e
     stopped=True;deadline=time.monotonic()+grace
    elif group_gone(pgid):
     if rc==0 and receipt.get('plannedActions',0)>0 and maximum==0:
      receipt['scopeMonitoring']='no-observed-progress';save()
      raise ScopeStopUncertain('build exited without an observable action total; retain locks and inspect')
     receipt['scopeMonitoring']='completed';save();return rc
    elif deadline is None:
     receipt['scopeMonitoring']='parent-exited-waiting-for-group';save();deadline=time.monotonic()+grace
   if stopped and rc is not None and group_gone(pgid):
    receipt.update(scopeMonitoring='stopped-after-expansion',buildExit=rc);save()
    raise ScopeLimitExceeded('advertised scope exceeded cap; owned build group stopped')
   if deadline is not None and time.monotonic()>=deadline:
    receipt.update(scopeMonitoring='stop-unconfirmed',buildExit=rc);save()
    raise ScopeStopUncertain('owned build group may still be live; retain locks and inspect')
   time.sleep(interval)
