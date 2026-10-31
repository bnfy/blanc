#!/usr/bin/env python3
"""Read-only ephemeral process/CG guard for a fixture handoff; no clicks."""
import ctypes as c, json, math, os, sys, time
from corroboration import frontmost_is_pid
P=c.c_void_p
class Point(c.Structure):_fields_=[('x',c.c_double),('y',c.c_double)]
class Rect(c.Structure):_fields_=[('origin',Point),('size',Point)]
class BSDInfo(c.Structure):
 _fields_=[('flags',c.c_uint32),('status',c.c_uint32),('xstatus',c.c_uint32),('pid',c.c_uint32),('ppid',c.c_uint32),('uid',c.c_uint32),('gid',c.c_uint32),('ruid',c.c_uint32),('rgid',c.c_uint32),('svuid',c.c_uint32),('svgid',c.c_uint32),('reserved',c.c_uint32),('comm',c.c_char*16),('name',c.c_char*32),('nfiles',c.c_uint32),('pgid',c.c_uint32),('pjobc',c.c_uint32),('tdev',c.c_uint32),('tpgid',c.c_uint32),('nice',c.c_int32),('start_sec',c.c_uint64),('start_usec',c.c_uint64)]

def process_identity(pid):
 lib=c.CDLL('/usr/lib/libproc.dylib');f=lib.proc_pidinfo;f.argtypes=[c.c_int,c.c_int,c.c_uint64,P,c.c_int];f.restype=c.c_int
 info=BSDInfo();n=f(pid,3,0,c.byref(info),c.sizeof(info))
 if n!=c.sizeof(info) or info.pid!=pid or not info.start_sec or info.start_usec>=1000000:return None
 return {'pid':info.pid,'ppid':info.ppid,'birth':[info.start_sec,info.start_usec]}

def contains(r,x,y):return r[0]<=x<r[0]+r[2] and r[1]<=y<r[1]+r[3]
def matches(r,b):return all(abs(v-b[k])<=3 for v,k in zip(r,('left','top','width','height')))
def classify_stack(entries,pid,bounds,point=None,truncated=False):
 """entries in front-to-back order. No entries returned or persisted."""
 if truncated:return {'status':'stack_incomplete','owned_matches':None,'obscurers':None}
 targets=[i for i,e in enumerate(entries) if e.get('pid')==pid and e.get('layer')==0 and e.get('rect') is not None and matches(e['rect'],bounds)]
 if len(targets)!=1:return {'status':'window_not_unique','owned_matches':min(len(targets),2),'obscurers':None}
 if entries[targets[0]].get('alpha') is None:return {'status':'stack_incomplete','owned_matches':1,'obscurers':None}
 if entries[targets[0]]['alpha']<0.95:return {'status':'window_not_visible','owned_matches':1,'obscurers':None}
 if point is None:return {'status':'window_unique','owned_matches':1,'obscurers':None}
 x,y=point;r=entries[targets[0]]['rect']
 # Stay away from frame edges/titlebar; a screenshot must still confirm blank content.
 if not (r[0]+30<=x<=r[0]+r[2]-30 and r[1]+90<=y<=r[1]+r[3]-30):return {'status':'point_outside_safe_region','owned_matches':1,'obscurers':None}
 obscured=0
 for e in entries[:targets[0]]:
  if e.get('rect') is None or e.get('alpha') is None:return {'status':'stack_incomplete','owned_matches':1,'obscurers':None}
  if e['alpha']>0 and contains(e['rect'],x,y):obscured+=1
 return {'status':'point_clear' if obscured==0 else 'point_obscured','owned_matches':1,'obscurers':min(obscured,100)}

def snapshot(pid,bounds,point):
 cg=c.CDLL('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');cf=c.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
 def fn(lib,n,args,ret):f=getattr(lib,n);f.argtypes=args;f.restype=ret;return f
 copy=fn(cg,'CGWindowListCopyWindowInfo',[c.c_uint32,c.c_uint32],P);rect=fn(cg,'CGRectMakeWithDictionaryRepresentation',[P,c.POINTER(Rect)],c.c_bool)
 count=fn(cf,'CFArrayGetCount',[P],c.c_long);item=fn(cf,'CFArrayGetValueAtIndex',[P,c.c_long],P);get=fn(cf,'CFDictionaryGetValue',[P,P],P);num=fn(cf,'CFNumberGetValue',[P,c.c_int,P],c.c_bool)
 typ=fn(cf,'CFGetTypeID',[P],c.c_ulong);nt=fn(cf,'CFNumberGetTypeID',[],c.c_ulong);dt=fn(cf,'CFDictionaryGetTypeID',[],c.c_ulong);release=fn(cf,'CFRelease',[P],None)
 owner=P.in_dll(cg,'kCGWindowOwnerPID');layer=P.in_dll(cg,'kCGWindowLayer');keyrect=P.in_dll(cg,'kCGWindowBounds');alpha=P.in_dll(cg,'kCGWindowAlpha')
 listing=copy(1|16,0)
 if not listing:return {'status':'stack_unavailable','owned_matches':None,'obscurers':None}
 try:
  total=count(listing)
  if total<0 or total>4096:return {'status':'stack_incomplete','owned_matches':None,'obscurers':None}
  def number(v,kind):
   if not v or typ(v)!=nt():return None
   out=(c.c_int32() if kind==3 else c.c_double())
   return out.value if num(v,kind,c.byref(out)) else None
  targets=[]
  for i in range(total):
   d=item(listing,i)
   if not d or typ(d)!=dt():return {'status':'stack_incomplete','owned_matches':None,'obscurers':None}
   p=number(get(d,owner),3)
   if p is None:return {'status':'stack_incomplete','owned_matches':None,'obscurers':None}
   if p!=pid:continue
   l=number(get(d,layer),3);rd=get(d,keyrect);r=Rect()
   if l is None or not rd or typ(rd)!=dt() or not rect(rd,c.byref(r)):return {'status':'stack_incomplete','owned_matches':None,'obscurers':None}
   value=(r.origin.x,r.origin.y,r.size.x,r.size.y)
   if not all(math.isfinite(x) for x in value):return {'status':'stack_incomplete','owned_matches':None,'obscurers':None}
   if l==0 and matches(value,bounds):
    a=number(get(d,alpha),6)
    if a is None or not math.isfinite(a) or a<0 or a>1:return {'status':'stack_incomplete','owned_matches':1,'obscurers':None}
    targets.append((i,value,a))
  if len(targets)!=1:return {'status':'window_not_unique','owned_matches':min(len(targets),2),'obscurers':None}
  idx,owned_rect,owned_alpha=targets[0]
  if owned_alpha<0.95:return {'status':'window_not_visible','owned_matches':1,'obscurers':None}
  if point is None:return {'status':'window_unique','owned_matches':1,'obscurers':None}
  records=[]
  # Only windows ahead of the target need geometry/opacity for occlusion.
  for i in range(idx):
   d=item(listing,i);a=number(get(d,alpha),6);rd=get(d,keyrect);r=Rect()
   value=(r.origin.x,r.origin.y,r.size.x,r.size.y) if rd and typ(rd)==dt() and rect(rd,c.byref(r)) else None
   if a is None or not math.isfinite(a) or a<0 or a>1 or value is None or not all(math.isfinite(x) for x in value):
    return {'status':'stack_incomplete','owned_matches':1,'obscurers':None}
   records.append({'pid':None,'layer':None,'alpha':a,'rect':value})
  records.append({'pid':pid,'layer':0,'alpha':owned_alpha,'rect':owned_rect})
  return classify_stack(records,pid,bounds,point)

 finally:release(listing)

def run(data,parent):
 start=time.monotonic_ns();pid=data.get('pid');bounds=data.get('bounds');birth=data.get('birth');point=data.get('point');mode=data.get('mode')
 out={'event':'result','status':'invalid_request','frontmost':None,'owned_matches':None,'obscurers':None,'start_monotonic_ns':start}
 try:
  keys=('left','top','width','height')
  if type(pid) is not int or pid<=1 or mode not in ('initial','point','resume','post') or not isinstance(bounds,dict) or set(bounds)!=set(keys) or not all(type(bounds[k]) in (int,float) and math.isfinite(bounds[k]) and abs(bounds[k])<=100000 for k in keys) or bounds['width']<=0 or bounds['height']<=0:return out
  if mode!='initial' and (not isinstance(birth,list) or len(birth)!=2 or not all(type(x) is int and x>=0 for x in birth)):return out
  if mode!='initial' and (not isinstance(point,list) or len(point)!=2 or not all(type(x) in (int,float) and math.isfinite(x) and abs(x)<=100000 for x in point)):return out
  ident=process_identity(pid)
  if not ident or ident['ppid']!=parent or (birth is not None and ident['birth']!=birth):out['status']='identity_unverified';return out
  result=snapshot(pid,bounds,point);out.update(result)
  front=frontmost_is_pid(pid)
  if front.get('status')=='ok' and type(front.get('matches')) is bool:out['frontmost']=front['matches']
  check=process_identity(pid)
  if not check or check['ppid']!=parent or check['birth']!=ident['birth']:out['status']='identity_unverified';return out
  # Birth is protocol-only and removed by bridge before any durable receipt.
  out['birth']=ident['birth']
  return out
 except Exception:out['status']='guard_unavailable';return out
 finally:out['end_monotonic_ns']=time.monotonic_ns()
if __name__=='__main__':
 try:result=run(json.loads(sys.stdin.readline(4096)),os.getppid())
 except Exception:result={'event':'result','status':'guard_unavailable'}
 print(json.dumps(result),flush=True)
