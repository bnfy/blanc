#!/usr/bin/env python3
"""Disposable fixture telemetry: AX reads only, no activation or title/URL reads."""
import ctypes as c, json, math, os, select, subprocess, sys, time

P=c.c_void_p
class Pair(c.Structure): _fields_=[('x',c.c_double),('y',c.c_double)]

def match_rects(rects, bounds, tolerance=3):
    keys=('left','top','width','height')
    if set(bounds)!=set(keys) or any(not isinstance(bounds[k],(float,int)) or isinstance(bounds[k],bool) or not math.isfinite(bounds[k]) for k in keys): return []
    return [i for i,r in enumerate(rects) if r is not None and all(abs(r[j]-bounds[k])<=tolerance for j,k in enumerate(keys))]

def bind():
    ax=c.CDLL('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices')
    cf=c.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
    def fn(lib,name,args,ret):
        f=getattr(lib,name); f.argtypes=args; f.restype=ret; return f
    api={}
    api['trusted']=fn(ax,'AXIsProcessTrusted',[],c.c_bool)
    api['app']=fn(ax,'AXUIElementCreateApplication',[c.c_int],P)
    api['system']=fn(ax,'AXUIElementCreateSystemWide',[],P)
    api['copy']=fn(ax,'AXUIElementCopyAttributeValue',[P,P,c.POINTER(P)],c.c_int)
    api['timeout']=fn(ax,'AXUIElementSetMessagingTimeout',[P,c.c_float],c.c_int)
    api['value']=fn(ax,'AXValueGetValue',[P,c.c_int,P],c.c_bool)
    api['vtype']=fn(ax,'AXValueGetType',[P],c.c_int)
    api['vtypeid']=fn(ax,'AXValueGetTypeID',[],c.c_ulong)
    api['string']=fn(cf,'CFStringCreateWithCString',[P,c.c_char_p,c.c_uint32],P)
    api['release']=fn(cf,'CFRelease',[P],None)
    api['equal']=fn(cf,'CFEqual',[P,P],c.c_bool)
    api['type']=fn(cf,'CFGetTypeID',[P],c.c_ulong)
    api['arrayid']=fn(cf,'CFArrayGetTypeID',[],c.c_ulong)
    api['count']=fn(cf,'CFArrayGetCount',[P],c.c_long)
    api['item']=fn(cf,'CFArrayGetValueAtIndex',[P,c.c_long],P)
    api['boolid']=fn(cf,'CFBooleanGetTypeID',[],c.c_ulong)
    api['bool']=fn(cf,'CFBooleanGetValue',[P],c.c_bool)
    return api

def parent_of(pid):
    out=subprocess.check_output(['/bin/ps','-o','ppid=','-p',str(pid)],text=True,timeout=2).strip()
    return int(out)

def run():
    api=bind()
    if not api['trusted'](): print(json.dumps({'event':'unavailable','reason':'accessibility_not_trusted'}),flush=True); return 2
    if sys.argv[1:]==['--check']: print(json.dumps({'event':'trusted'}),flush=True); return 0
    if sys.argv[1:]!=['--observe']: return 2
    line=sys.stdin.readline(4096)
    try: obj=json.loads(line); pid=obj.get('pid'); bounds=obj.get('bounds')
    except (ValueError,AttributeError):
        print(json.dumps({'event':'unavailable','reason':'invalid_configuration'}),flush=True); return 2
    if type(pid) is not int or pid<=1 or not isinstance(bounds,dict) or not match_rects([(bounds.get('left'),bounds.get('top'),bounds.get('width'),bounds.get('height'))],bounds):
        print(json.dumps({'event':'unavailable','reason':'invalid_configuration'}),flush=True); return 2
    try: parent=parent_of(pid)
    except (OSError,ValueError,subprocess.SubprocessError):
        print(json.dumps({'event':'unavailable','reason':'ownership_query_failed'}),flush=True); return 2
    if parent!=os.getppid():
        print(json.dumps({'event':'unavailable','reason':'unowned_process'}),flush=True); return 2
    app=api['app'](pid); system=api['system']()
    if not app or not system:
        if app:api['release'](app)
        if system:api['release'](system)
        print(json.dumps({'event':'unavailable','reason':'ax_element_unavailable'}),flush=True); return 2
    api['timeout'](app,0.2); api['timeout'](system,0.2)
    def attr(element,name):
        key=api['string'](None,name.encode(),0x08000100); out=P()
        try: err=api['copy'](element,key,c.byref(out))
        finally: api['release'](key)
        return out.value if err==0 else None
    def pair(element,name,kind):
        val=attr(element,name)
        if not val:return None
        try:
            p=Pair()
            if api['type'](val)!=api['vtypeid']() or api['vtype'](val)!=kind or not api['value'](val,kind,c.byref(p)): return None
            return p.x,p.y
        finally: api['release'](val)
    def sample():
        started=time.monotonic_ns()
        windows=attr(app,'AXWindows'); focused=attr(app,'AXFocusedWindow'); active=attr(system,'AXFocusedApplication')
        result={'event':'sample','start_monotonic_ns':started,'app_frontmost':None,'window_focused':None,'minimized':None,'window_match':'unavailable'}
        try:
            if active: result['app_frontmost']=bool(api['equal'](active,app))
            if not windows or api['type'](windows)!=api['arrayid']():return result
            count=api['count'](windows)
            if count<0 or count>50:return result
            items=[api['item'](windows,i) for i in range(count)]
            rects=[]
            for w in items:
                pos=pair(w,'AXPosition',1); size=pair(w,'AXSize',2)
                rects.append((*pos,*size) if pos and size else None)
            matches=match_rects(rects,bounds)
            result['window_match']='unique' if len(matches)==1 else 'ambiguous' if len(matches)>1 else 'none'
            if len(matches)!=1:return result
            w=items[matches[0]]
            if focused:result['window_focused']=bool(api['equal'](w,focused))
            minimized=attr(w,'AXMinimized')
            if minimized:
                try:
                    if api['type'](minimized)==api['boolid']():result['minimized']=bool(api['bool'](minimized))
                finally:api['release'](minimized)
            return result
        finally:
            result['end_monotonic_ns']=time.monotonic_ns()
            for val in (windows,focused,active):
                if val:api['release'](val)
    try:
        first=sample(); print(json.dumps(first),flush=True)
        if first['window_match']!='unique': print(json.dumps({'event':'unavailable','reason':{'none':'window_not_found','ambiguous':'window_ambiguous','unavailable':'window_attributes_unavailable'}[first['window_match']]}),flush=True); return 2
        print(json.dumps({'event':'ready'}),flush=True)
        while True:
            ready,_,_=select.select([sys.stdin],[],[],0.03)
            if ready:
                command=sys.stdin.readline(256)
                if not command:break
                if command.strip()=='stop':break
                if command.strip() not in ('before-click','after-reply'):break
                print(json.dumps({'event':'marker','name':command.strip(),'monotonic_ns':time.monotonic_ns()}),flush=True)
            print(json.dumps(sample()),flush=True)
    finally: api['release'](app);api['release'](system)
    return 0
if __name__=='__main__':
    try:sys.exit(run())
    except Exception:print(json.dumps({'event':'unavailable','reason':'observer_error'}),flush=True);sys.exit(2)
