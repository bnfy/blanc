"""Read-only window count and foreground equality. No names, titles or URLs."""
import ctypes as c
P=c.c_void_p
class Point(c.Structure): _fields_=[('x',c.c_double),('y',c.c_double)]
class Rect(c.Structure): _fields_=[('origin',Point),('size',Point)]

def frontmost_is_pid(pid):
    try:
        objc=c.CDLL('/usr/lib/libobjc.A.dylib')
        c.CDLL('/System/Library/Frameworks/AppKit.framework/AppKit')
        objc.objc_getClass.argtypes=[c.c_char_p];objc.objc_getClass.restype=P
        objc.sel_registerName.argtypes=[c.c_char_p];objc.sel_registerName.restype=P
        address=c.cast(objc.objc_msgSend,P).value
        send_obj=c.CFUNCTYPE(P,P,P)(address);send_int=c.CFUNCTYPE(c.c_int,P,P)(address);send_void=c.CFUNCTYPE(None,P,P)(address)
        sel=lambda n:objc.sel_registerName(n.encode('ascii'))
        pool_class=objc.objc_getClass(b'NSAutoreleasePool');pool=send_obj(send_obj(pool_class,sel('alloc')),sel('init'))
        try:
            cls=objc.objc_getClass(b'NSWorkspace');workspace=send_obj(cls,sel('sharedWorkspace'))
            front=send_obj(workspace,sel('frontmostApplication')) if workspace else None
            if not front:return {'status':'unavailable','matches':None}
            return {'status':'ok','matches':send_int(front,sel('processIdentifier'))==pid}
        finally:
            if pool:send_void(pool,sel('drain'))
    except Exception:return {'status':'unavailable','matches':None}

def summarize_owned(entries,bounds,truncated=False):
    eligible=matching=unreadable=0
    for layer,rect in entries[:50]:
        if layer is None:unreadable+=1;continue
        if layer!=0:continue
        if rect is None:unreadable+=1;continue
        eligible+=1
        if all(abs(v-bounds[k])<=3 for v,k in zip(rect,('left','top','width','height'))):matching+=1
    return {'status':'ok','owned_count':min(len(entries),50),'eligible_count':eligible,'unreadable_count':unreadable,'matching_count':matching,'list_truncated':truncated or len(entries)>50}

def owned_cg_counts(pid,bounds):
    """Inspect only PID, bounds, layer of each window; never read names/titles.

    CGWindowListCopyWindowInfo returns a system-wide list in memory. Non-owned
    entries are rejected before any other metadata is read and never persisted.
    """
    result={'status':'unavailable','owned_count':None,'eligible_count':None,'unreadable_count':None,'matching_count':None,'list_truncated':False}
    try:
        cg=c.CDLL('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
        cf=c.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
        def fn(lib,name,args,ret):
            f=getattr(lib,name);f.argtypes=args;f.restype=ret;return f
        copy=fn(cg,'CGWindowListCopyWindowInfo',[c.c_uint32,c.c_uint32],P)
        make_rect=fn(cg,'CGRectMakeWithDictionaryRepresentation',[P,c.POINTER(Rect)],c.c_bool)
        count=fn(cf,'CFArrayGetCount',[P],c.c_long);item=fn(cf,'CFArrayGetValueAtIndex',[P,c.c_long],P)
        get=fn(cf,'CFDictionaryGetValue',[P,P],P);num=fn(cf,'CFNumberGetValue',[P,c.c_int,P],c.c_bool)
        typ=fn(cf,'CFGetTypeID',[P],c.c_ulong);numtype=fn(cf,'CFNumberGetTypeID',[],c.c_ulong)
        dicttype=fn(cf,'CFDictionaryGetTypeID',[],c.c_ulong);release=fn(cf,'CFRelease',[P],None)
        owner=P.in_dll(cg,'kCGWindowOwnerPID');layer=P.in_dll(cg,'kCGWindowLayer');rectkey=P.in_dll(cg,'kCGWindowBounds')
        listing=copy(1|16,0) # On-screen only, excluding desktop elements.
        if not listing:return result
        try:
            total=count(listing)
            if total<0:return result
            owned=[];truncated=total>4096
            def integer(v):
                if not v or typ(v)!=numtype():return None
                output=c.c_int32()
                return output.value if num(v,3,c.byref(output)) else None
            for i in range(min(total,4096)):
                entry=item(listing,i)
                if not entry or typ(entry)!=dicttype() or integer(get(entry,owner))!=pid:continue
                if len(owned)>=50:truncated=True;break
                window_layer=integer(get(entry,layer))
                if window_layer!=0:
                    owned.append((window_layer,None));continue
                raw=get(entry,rectkey);r=Rect()
                if not raw or typ(raw)!=dicttype() or not make_rect(raw,c.byref(r)):
                    owned.append((window_layer,None));continue
                owned.append((window_layer,(r.origin.x,r.origin.y,r.size.x,r.size.y)))
            return summarize_owned(owned,bounds,truncated)
        finally:release(listing)
    except Exception:return result
