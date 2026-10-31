#!/usr/bin/env python3
"""Disposable fixture telemetry: AX reads only, no activation or title/URL reads."""
import ctypes as c, json, math, os, select, subprocess, sys, time
from corroboration import frontmost_is_pid,owned_cg_counts

P=c.c_void_p
class Pair(c.Structure): _fields_=[('x',c.c_double),('y',c.c_double)]

def match_rects(rects, bounds, tolerance=3):
    keys=('left','top','width','height')
    if set(bounds)!=set(keys) or any(not isinstance(bounds[k],(float,int)) or isinstance(bounds[k],bool) or not math.isfinite(bounds[k]) or abs(bounds[k])>100000 for k in keys) or bounds['width']<=0 or bounds['height']<=0: return []
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
    api['stringid']=fn(cf,'CFStringGetTypeID',[],c.c_ulong)
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
    def status(err):
        return {0:'ok',-25200:'failure',-25201:'invalid_argument',-25202:'invalid_element',-25204:'cannot_complete',-25205:'unsupported',-25211:'api_disabled',-25212:'no_value'}.get(err,'other_error')
    def attr_status(element,name):
        key=api['string'](None,name.encode(),0x08000100); out=P()
        try: err=api['copy'](element,key,c.byref(out))
        finally: api['release'](key)
        return (out.value,'ok' if out.value else 'empty') if err==0 else (None,status(err))
    def pair(element,name,kind):
        val,read_status=attr_status(element,name)
        if not val:return None,read_status
        try:
            p=Pair()
            if api['type'](val)!=api['vtypeid']() or api['vtype'](val)!=kind or not api['value'](val,kind,c.byref(p)): return None,'wrong_type'
            if not all(math.isfinite(v) and abs(v)<=100000 for v in (p.x,p.y)): return None,'out_of_range'
            return (round(p.x,3),round(p.y,3)),'ok'
        finally: api['release'](val)
    def sample(corroborate=False):
        started=time.monotonic_ns()
        windows,windows_status=attr_status(app,'AXWindows'); focused,focused_status=attr_status(app,'AXFocusedWindow'); active,active_status=attr_status(system,'AXFocusedApplication')
        geometry={'expected':[bounds[k] for k in ('left','top','width','height')], 'windows_status':windows_status,'focused_status':focused_status,'frontmost_status':active_status,'window_count':None,'windows':[],'truncated':False}
        result={'event':'sample','start_monotonic_ns':started,'app_frontmost':None,'window_focused':None,'minimized':None,'window_match':'unavailable','geometry':geometry}
        try:
            if active: result['app_frontmost']=bool(api['equal'](active,app))
            if not windows:return result
            if api['type'](windows)!=api['arrayid'](): geometry['windows_status']='wrong_type'; return result
            count=api['count'](windows)
            if count<0 or count>50:geometry['windows_status']='count_out_of_range';return result
            geometry['window_count']=count;geometry['truncated']=count>8
            items=[api['item'](windows,i) for i in range(count)]
            if count==1:
                w=items[0];singleton={'role_status':'unavailable','role_is_window':None,'focused_window_equal':bool(api['equal'](w,focused)) if focused else None,'minimized_status':'unavailable','minimized':None,'focused_status':'unavailable','focused':None}
                role,rs=attr_status(w,'AXRole');singleton['role_status']=rs
                if role:
                    try:
                        if api['type'](role)==api['stringid']():
                            axwindow=api['string'](None,b'AXWindow',0x08000100)
                            try:singleton['role_is_window']=bool(api['equal'](role,axwindow))
                            finally:api['release'](axwindow)
                        else:singleton['role_status']='wrong_type'
                    finally:api['release'](role)
                for attribute,prefix in (('AXMinimized','minimized'),('AXFocused','focused')):
                    val,read_status=attr_status(w,attribute);singleton[prefix+'_status']=read_status
                    if val:
                        try:
                            if api['type'](val)==api['boolid']():singleton[prefix]=bool(api['bool'](val))
                            else:singleton[prefix+'_status']='wrong_type'
                        finally:api['release'](val)
                geometry['singleton']=singleton
            rects=[]
            for index,w in enumerate(items):
                pos,pos_status=pair(w,'AXPosition',1); size,size_status=pair(w,'AXSize',2)
                rect=(*pos,*size) if pos and size else None
                rects.append(rect)
                if index<8:geometry['windows'].append({'position_status':pos_status,'size_status':size_status,'rect':rect})
            matches=match_rects(rects,bounds)
            result['window_match']='unique' if len(matches)==1 else 'ambiguous' if len(matches)>1 else 'none'
            if len(matches)!=1:return result
            w=items[matches[0]]
            if focused:result['window_focused']=bool(api['equal'](w,focused))
            minimized,_=attr_status(w,'AXMinimized')
            if minimized:
                try:
                    if api['type'](minimized)==api['boolid']():result['minimized']=bool(api['bool'](minimized))
                finally:api['release'](minimized)
            return result
        finally:
            if corroborate:
                geometry['frontmost_pid']=frontmost_is_pid(pid)
                geometry['cg']=owned_cg_counts(pid,bounds)
            result['end_monotonic_ns']=time.monotonic_ns()
            for val in (windows,focused,active):
                if val:api['release'](val)
    try:
        first=sample(True); print(json.dumps(first),flush=True)
        if first['window_match']!='unique': print(json.dumps({'event':'unavailable','reason':{'none':'window_not_found','ambiguous':'window_ambiguous','unavailable':'window_attributes_unavailable'}[first['window_match']]}),flush=True); return 2
        print(json.dumps({'event':'ready'}),flush=True)
        while True:
            marker=False
            ready,_,_=select.select([sys.stdin],[],[],0.03)
            if ready:
                command=sys.stdin.readline(256)
                if not command:break
                if command.strip()=='stop':break
                if command.strip() not in ('before-click','after-reply'):break
                print(json.dumps({'event':'marker','name':command.strip(),'monotonic_ns':time.monotonic_ns()}),flush=True)
                marker=True
            print(json.dumps(sample(marker)),flush=True)
    finally: api['release'](app);api['release'](system)
    return 0
if __name__=='__main__':
    try:sys.exit(run())
    except Exception:print(json.dumps({'event':'unavailable','reason':'observer_error'}),flush=True);sys.exit(2)
