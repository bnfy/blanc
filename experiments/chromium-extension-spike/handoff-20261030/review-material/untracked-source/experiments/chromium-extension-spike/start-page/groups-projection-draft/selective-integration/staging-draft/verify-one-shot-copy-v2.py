#!/usr/bin/env python3
"""Read-only tree comparison; result must be outside both compared trees."""
import argparse, ctypes, errno, hashlib, json, os, pathlib, stat, sys
lib=ctypes.CDLL(None,use_errno=True)
lib.listxattr.argtypes=[ctypes.c_char_p,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_int];lib.listxattr.restype=ctypes.c_ssize_t
lib.getxattr.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_void_p,ctypes.c_size_t,ctypes.c_uint32,ctypes.c_int];lib.getxattr.restype=ctypes.c_ssize_t
lib.acl_get_link_np.argtypes=[ctypes.c_char_p,ctypes.c_int];lib.acl_get_link_np.restype=ctypes.c_void_p
lib.acl_to_text.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ssize_t)];lib.acl_to_text.restype=ctypes.c_void_p
lib.acl_free.argtypes=[ctypes.c_void_p];lib.acl_free.restype=ctypes.c_int

def fail(message):raise ValueError(message)
def metadata(st):return (stat.S_IFMT(st.st_mode),stat.S_IMODE(st.st_mode),st.st_uid,st.st_gid,st.st_flags,st.st_mtime_ns)
def stable(st):return metadata(st)+(st.st_dev,st.st_ino,st.st_size,st.st_ctime_ns)
def tracked_only_loss(a,b):
 ma=metadata(a);mb=metadata(b)
 return (stat.S_ISREG(a.st_mode) and stat.S_ISREG(b.st_mode)
  and bool(a.st_flags & 0x40) and not (b.st_flags & 0x40)
  and a.st_flags == (b.st_flags | 0x40)
  and ma[:4]+ma[5:] == mb[:4]+mb[5:])
def attributes(path):
 p=os.fsencode(path);ctypes.set_errno(0);n=lib.listxattr(p,None,0,1)
 if n<0:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()))
 attrs={}
 if n:
  data=ctypes.create_string_buffer(n);got=lib.listxattr(p,data,n,1)
  if got!=n:fail('xattr list changed')
  for name in data.raw[:n].split(b'\0'):
   if not name:continue
   sz=lib.getxattr(p,name,None,0,0,1)
   if sz<0:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()))
   v=ctypes.create_string_buffer(sz);got=lib.getxattr(p,name,v,sz,0,1)
   if got!=sz:fail('xattr value changed')
   attrs[os.fsdecode(name)]=hashlib.sha256(v.raw[:got]).hexdigest()
 ctypes.set_errno(0);acl=lib.acl_get_link_np(p,0x100)
 if not acl:
  err=ctypes.get_errno()
  if err!=errno.ENOENT:raise OSError(err,os.strerror(err))
  return attrs,None
 try:
  length=ctypes.c_ssize_t();text=lib.acl_to_text(acl,ctypes.byref(length))
  if not text:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()))
  try:aclhash=hashlib.sha256(ctypes.string_at(text,length.value)).hexdigest()
  finally:lib.acl_free(text)
  return attrs,aclhash
 finally:lib.acl_free(acl)

def hashfile(path,initial):
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  if stable(os.fstat(fd))!=stable(initial):fail('file changed before read')
  h=hashlib.sha256()
  while True:
   b=os.read(fd,1024*1024)
   if not b:break
   h.update(b)
  if stable(os.fstat(fd))!=stable(initial) or stable(os.lstat(path))!=stable(initial):fail('file changed during read')
  return h.hexdigest()
 finally:os.close(fd)

def scan(root,collect_inodes=False,entries=None):
 h=hashlib.sha256();inodes=set();counts={'dirs':0,'files':0,'links':0};stack=[(root/n,n) for n in sorted(entries,reverse=True)] if entries is not None else [(root,'')]
 while stack:
  p,rel=stack.pop();st=os.lstat(p)
  if stat.S_ISDIR(st.st_mode):
   counts['dirs']+=1
   with os.scandir(p) as it:children=sorted((e.name for e in it),reverse=True)
   stack.extend((p/n,rel+'/'+n if rel else n) for n in children)
  elif stat.S_ISREG(st.st_mode):counts['files']+=1;inodes.add((st.st_dev,st.st_ino)) if collect_inodes else None
  elif stat.S_ISLNK(st.st_mode):counts['links']+=1
  else:fail('special file: '+rel)
  payload=[rel,*stable(st),os.readlink(p) if stat.S_ISLNK(st.st_mode) else None]
  h.update(json.dumps(payload,ensure_ascii=True,separators=(',',':')).encode()+b'\n')
  if sum(counts.values())%100000==0:print(json.dumps({'phase':'metadata_scan','entries':sum(counts.values())}),file=sys.stderr,flush=True)
 return h.hexdigest(),inodes,counts

def verify(src,dst,entries=None):
 src=pathlib.Path(src).resolve(strict=True);dst=pathlib.Path(dst).resolve(strict=True)
 if src==dst or src in dst.parents or dst in src.parents:fail('overlapping trees')
 if entries is None:entries=sorted(os.listdir(src))
 if not entries or len(set(entries))!=len(entries) or any('/' in n or n in ('.','..') for n in entries):fail('invalid entry set')
 if set(os.listdir(dst))!=set(entries):fail('destination top-level entries mismatch')
 source_before,original_inodes,counts=scan(src,True,entries);dest_before,_,dest_counts=scan(dst,False,entries);stack=[(src/n,dst/n,n) for n in sorted(entries,reverse=True)];external=[];flag_differences=[];checked={'files':0,'dirs':0,'links':0,'bytes':0}
 while stack:
  a,b,rel=stack.pop();sa=os.lstat(a);sb=os.lstat(b)
  if metadata(sa)!=metadata(sb):
   if tracked_only_loss(sa,sb):flag_differences.append({'path':rel,'source_flags':sa.st_flags,'destination_flags':sb.st_flags})
   else:fail('metadata mismatch: '+rel)
  if attributes(a)!=attributes(b):fail('ACL or xattr mismatch: '+rel)
  if stat.S_ISDIR(sa.st_mode):
   checked['dirs']+=1
   with os.scandir(a) as it:an=set(e.name for e in it)
   with os.scandir(b) as it:bn=set(e.name for e in it)
   if an!=bn:fail('directory entries mismatch: '+rel)
   stack.extend((a/n,b/n,rel+'/'+n if rel else n) for n in sorted(an,reverse=True))
  elif stat.S_ISREG(sa.st_mode):
   checked['files']+=1;checked['bytes']+=sa.st_size
   if checked['files']%10000==0:print(json.dumps({'phase':'content_compare','files':checked['files'],'bytes':checked['bytes']}),file=sys.stderr,flush=True)
   if sb.st_size!=sa.st_size or (sb.st_dev,sb.st_ino) in original_inodes:fail('size or inode isolation mismatch: '+rel)
   if hashfile(a,sa)!=hashfile(b,sb):fail('content mismatch: '+rel)
  elif stat.S_ISLNK(sa.st_mode):
   checked['links']+=1;t=os.readlink(a)
   if os.readlink(b)!=t:fail('symlink mismatch: '+rel)
   target=b.resolve(strict=False)
   if not (target==dst or dst in target.parents):external.append({'path':rel,'target':t})
  else:fail('special file: '+rel)
  if stable(os.lstat(a))!=stable(sa) or stable(os.lstat(b))!=stable(sb):fail('metadata changed during verification: '+rel)
 source_after,_,counts_after=scan(src,False,entries)
 if source_before!=source_after or counts!=counts_after:fail('source tree changed during verification')
 dest_after,_,dest_counts_after=scan(dst,False,entries)
 if dest_before!=dest_after or dest_counts!=dest_counts_after or set(os.listdir(dst))!=set(entries):fail('destination tree changed during verification')
 return {'status':'matched-with-limitations' if (external or flag_differences) else 'passed','included_entries':sorted(entries),'counts':checked,'source_scan_sha256':source_before,'external_links_pending_review':external,'flag_difference_count':len(flag_differences),'uf_tracked_losses':flag_differences,'limitations':['No pre-copy content inventory: does not prove absence of changes during the original copy.','Reading may update access times; they are not compared.','Where listed, source UF_TRACKED document-identity metadata was not preserved on the copy; all other flag bits remain strict.','No APFS extent-sharing, Siso relocation, cache, graph, runtime or signing qualification.','Source tree consistency relies on the no-writer condition; concurrent adversarial replacement cannot be ruled out by path-based reads.']}

def copy_process_exited(pid):
 if isinstance(pid,bool) or not isinstance(pid,int) or pid<=1:fail('invalid copy process identity')
 try:os.kill(pid,0)
 except ProcessLookupError:return
 except PermissionError:fail('cannot verify copy process exited')
 fail('copy process still exists')

def validate_copy_info(copyinfo,src,dst,expected):
 if copyinfo.get('source')!=str(src) or copyinfo.get('destination')!=str(dst) or sorted(copyinfo.get('entries',[]))!=expected or copyinfo.get('status')!='copied-unverified' or copyinfo.get('exitCode')!=0 or copyinfo.get('lowSpaceStopped') is not False:fail('copy receipt is not successful or does not bind paths and entries')
 if copyinfo.get('command')!=['/bin/cp','-cRp','-n',*[str(src/n) for n in expected],str(dst)]:fail('copy command differs')
 copy_process_exited(copyinfo.get('pid'))

def main():
 ap=argparse.ArgumentParser();ap.add_argument('source');ap.add_argument('destination');ap.add_argument('receipt');ap.add_argument('--copy-receipt',required=True);args=ap.parse_args()
 src=pathlib.Path(args.source).resolve(strict=True);dst=pathlib.Path(args.destination).resolve(strict=True);out=pathlib.Path(args.receipt).absolute();parent=out.parent.resolve(strict=True)
 if parent==src or src in parent.parents or parent==dst or dst in parent.parents:fail('receipt must be outside compared trees')
 if out.exists() or out.is_symlink():fail('receipt already exists')
 copy=pathlib.Path(args.copy_receipt);raw=copy.read_bytes();copyinfo=json.loads(raw);expected=['.cipd','.gclient','.gclient_entries','.gclient_previous_sync_commits','.gcs_entries','depot_tools','src']
 validate_copy_info(copyinfo,src,dst,expected)
 try:
  result=verify(src,dst,expected)
  if hashlib.sha256(copy.read_bytes()).digest()!=hashlib.sha256(raw).digest():fail('copy receipt changed during verification')
  copy_process_exited(copyinfo['pid'])
  result['copy_receipt_sha256']=hashlib.sha256(raw).hexdigest()
 except Exception as e:result={'status':'failed','error_type':type(e).__name__,'reason':str(e)}
 with out.open('x') as f:json.dump(result,f,indent=2,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
 print(json.dumps({'status':result['status'],'counts':result.get('counts'),'reason':result.get('reason')}))
 return 0 if result['status'] in ('passed','matched-with-limitations') else 1
if __name__=='__main__':sys.exit(main())
