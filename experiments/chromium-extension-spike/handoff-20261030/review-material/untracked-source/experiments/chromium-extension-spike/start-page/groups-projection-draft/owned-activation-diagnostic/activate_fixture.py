#!/usr/bin/env python3
"""Request normal activation for a verified direct-child fixture only."""
import ctypes as c, json, math, os, subprocess, sys, time
from corroboration import frontmost_is_pid, owned_cg_counts
P=c.c_void_p

def parent_of(pid):
    return int(subprocess.check_output(['/bin/ps','-o','ppid=','-p',str(pid)],text=True,timeout=2).strip())

def request_activation(pid,still_owned):
    try:
        objc=c.CDLL('/usr/lib/libobjc.A.dylib'); c.CDLL('/System/Library/Frameworks/AppKit.framework/AppKit')
        objc.objc_getClass.argtypes=[c.c_char_p];objc.objc_getClass.restype=P
        objc.sel_registerName.argtypes=[c.c_char_p];objc.sel_registerName.restype=P
        address=c.cast(objc.objc_msgSend,P).value
        send_obj=c.CFUNCTYPE(P,P,P)(address);send_pid=c.CFUNCTYPE(P,P,P,c.c_int)(address)
        send_bool=c.CFUNCTYPE(c.c_bool,P,P)(address);send_options=c.CFUNCTYPE(c.c_bool,P,P,c.c_ulong)(address)
        send_void=c.CFUNCTYPE(None,P,P)(address);sel=lambda name:objc.sel_registerName(name.encode('ascii'))
        pool_class=objc.objc_getClass(b'NSAutoreleasePool');pool=send_obj(send_obj(pool_class,sel('alloc')),sel('init'))
        try:
            cls=objc.objc_getClass(b'NSRunningApplication');app=send_pid(cls,sel('runningApplicationWithProcessIdentifier:'),pid)
            if not app or send_bool(app,sel('isTerminated')) or not still_owned():return None
            # Default AppKit activation; no hide, close, AllWindows or deprecated force flag.
            return bool(send_options(app,sel('activateWithOptions:'),0))
        finally:
            if pool:send_void(pool,sel('drain'))
    except Exception:return None

def valid_bounds(bounds):
    keys=('left','top','width','height')
    return isinstance(bounds,dict) and set(bounds)==set(keys) and all(type(bounds[k]) in (int,float) and math.isfinite(bounds[k]) and abs(bounds[k])<=100000 for k in keys) and bounds['width']>0 and bounds['height']>0

def perform(pid,bounds,*,parent,mode='activate',query_parent=parent_of,front=frontmost_is_pid,cg=owned_cg_counts,activate=request_activation,sleep=time.sleep,now=time.monotonic):
    result={'event':'result','status':'invalid_fixture','frontmost_before':None,'activation_requested':False,'activation_accepted':None,'frontmost_after':None}
    if mode not in ('activate','probe') or type(pid) is not int or pid<=1 or not valid_bounds(bounds):return result
    def owned():
        try:return query_parent(pid)==parent
        except (OSError,ValueError,subprocess.SubprocessError):return False
    if not owned():result['status']='ownership_unverified';return result
    counts=cg(pid,bounds)
    if not(counts.get('status')=='ok' and counts.get('owned_count')==1 and counts.get('eligible_count')==1 and counts.get('unreadable_count')==0 and counts.get('matching_count')==1 and counts.get('list_truncated') is False):
        result['status']='window_identity_unverified';return result
    before=front(pid)
    if before.get('status')!='ok' or type(before.get('matches')) is not bool:result['status']='frontmost_unavailable';return result
    result['frontmost_before']=before['matches']
    if mode=='probe':result['frontmost_after']=before['matches'];result['status']='observed';return result
    if before['matches']:
        result['frontmost_after']=True;result['status']='already_frontmost';return result
    if not owned():result['status']='ownership_unverified';return result
    result['activation_requested']=True
    accepted=activate(pid,owned);result['activation_accepted']=accepted if type(accepted) is bool else None
    if accepted is not True:result['status']='activation_request_failed';return result
    deadline=now()+3
    while now()<deadline:
        if not owned():result['status']='ownership_unverified';return result
        after=front(pid)
        if after.get('status')!='ok' or type(after.get('matches')) is not bool:result['status']='frontmost_unavailable';return result
        result['frontmost_after']=after['matches']
        if after['matches']:result['status']='activated';return result
        sleep(.1)
    result['status']='activation_not_observed';return result

if __name__=='__main__':
    try:
        start=time.monotonic_ns();data=json.loads(sys.stdin.readline(4096));output=perform(data.get('pid'),data.get('bounds'),parent=os.getppid(),mode=data.get('mode'))
    except Exception:output={'event':'result','status':'helper_error','frontmost_before':None,'activation_requested':False,'activation_accepted':None,'frontmost_after':None}
    output['start_monotonic_ns']=start if 'start' in locals() else None;output['end_monotonic_ns']=time.monotonic_ns()
    print(json.dumps(output),flush=True)
    sys.exit(0 if output['status'] in ('already_frontmost','activated','observed') else 2)
