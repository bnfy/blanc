#!/usr/bin/env python3
"""Receipt-bound, clone-only source transaction; never invokes GN or a build.

Use only after independent containment and no-writer review. An interrupted
transaction is deliberately not resumed automatically. No automatic rollback
is provided; preserve the journal and independently review recovery.
"""
import argparse, fcntl, hashlib, importlib.util, json, os, pathlib, stat, subprocess, sys, time
HERE=pathlib.Path(__file__).resolve().parent
ROOT=pathlib.Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
CLONE=ROOT/'workspaces/Chromium158-combined-copy-20261029/src'
JOURNAL=ROOT/'evidence/combined-workspace-copy-20261029/combined-source-transaction'
VERIFY=ROOT/'evidence/combined-workspace-copy-20261029/verification-v2.json'
TREAT=ROOT/'evidence/combined-workspace-copy-20261029/siso-log-treatment.jsonl'
VER_SHA='d9a62f02385fb15367d2b75eab53451fd2b569a1cff22aabd3da45f66fe306ce'
TREAT_SHA='d45e046b4720886ccf4e884710f2a7bfa8b519ccea9ef92437a585a2780db4dd'
MANIFEST_SHA='88dd903ff2e1328366fb9b689af674443f4db503138525cb8c6b5a26d8f1858d'
MOD=importlib.util.spec_from_file_location('preflight',HERE/'clone-stage-preflight.py')
pf=importlib.util.module_from_spec(MOD); MOD.loader.exec_module(pf)
NATIVE=HERE.parent/'combined-native-v1'
GN=HERE.parent.parent.parent.parent/'search-host-routing-draft/BUILD.158-candidate.gn'
MANIFEST=HERE.parent/'combined-manifest-v3.json'

def digest(data): return hashlib.sha256(data).hexdigest()
def fail(s): raise ValueError(s)
def syncdir(p):
 fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try: os.fsync(fd)
 finally: os.close(fd)
def stable_read(p):
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  a=os.fstat(fd)
  if not stat.S_ISREG(a.st_mode): fail('not regular: '+str(p))
  data=b''
  while True:
   x=os.read(fd,1048576)
   if not x:break
   data+=x
  b=os.fstat(fd)
  if any(getattr(a,k)!=getattr(b,k) for k in ('st_dev','st_ino','st_size','st_mtime_ns','st_ctime_ns')):fail('changed during read: '+str(p))
  return data,b
 finally:os.close(fd)
def write_exclusive(p,data,mode=0o600):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 try:
  while data:
   n=os.write(fd,data);data=data[n:]
  os.fsync(fd)
  return os.fstat(fd)
 finally:os.close(fd)
def append(path,event):
 with open(path,'a',encoding='utf8') as f:
  f.write(json.dumps(event,sort_keys=True)+'\n');f.flush();os.fsync(f.fileno())
def check_process_receipt(p):
 p=pathlib.Path(p)
 if p.parent!=ROOT/'evidence/combined-workspace-copy-20261029' or not p.name.startswith('quiescence-') or p.suffix!='.json':fail('invalid process receipt path')
 data,_=stable_read(p);v=json.loads(data);now=time.time_ns()
 if v.get('status')!='no-matching-writers' or v.get('scope')!=str(CLONE) or not isinstance(v.get('time_ns'),int) or not 0<=now-v['time_ns']<=60_000_000_000:fail('process receipt is invalid or stale')
def cache_floor(root):
 """Require each changed source mtime newer than every current output file."""
 out=root/'out/BlancPrototype'
 if not out.is_dir() or out.is_symlink():fail('missing or unsafe output')
 newest=0
 for parent,dirs,files in os.walk(out,followlinks=False):
  for name in files:
   st=os.stat(pathlib.Path(parent)/name,follow_symlinks=False)
   if stat.S_ISREG(st.st_mode):newest=max(newest,st.st_mtime_ns)
 now=time.time_ns()
 if newest>=now:fail('output mtime is in the future')
 return newest
def safe_parent(root,relative):
 path=pathlib.PurePosixPath(relative)
 if path.is_absolute() or '..' in path.parts:fail('bad target')
 fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  for part in path.parts[:-1]:
   nxt=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);os.close(fd);fd=nxt
  return fd,path.name
 except BaseException:os.close(fd);raise

def stage(root,journal,spec,candidates,mtime_floor=0):
 if not pf.all_preimages_present(pf.classify(root,spec),spec):fail('preimages not exact')
 if set(candidates)!=set(spec):fail('candidate set mismatch')
 for rel,(_,after) in spec.items():
  if digest(candidates[rel])!=after:fail('candidate mismatch: '+rel)
 os.mkdir(journal,0o700);syncdir(journal.parent)
 j=journal/'journal.jsonl';write_exclusive(j,b'');syncdir(journal)
 root_st=os.stat(root);snapshot=pf.classify(root,spec);append(j,{'event':'start','root':str(root),'root_inode':root_st.st_ino,'root_device':root_st.st_dev,'snapshot':snapshot,'time_ns':time.time_ns()})
 # Clone/copy each preimage with macOS cp -p, which preserves flags, ACLs and
 # extended attributes. Independent inodes prevent later source mutation from
 # changing a backup. Verify identity and content after copying.
 for i,(rel,(before,_)) in enumerate(spec.items()):
  if before:
   data,st=stable_read(root/rel)
   if digest(data)!=before:fail('preimage drift: '+rel)
   if st.st_mtime_ns >= time.time_ns():fail('future-dated source: '+rel)
   b=journal/('backup-%02d'%i);subprocess.run(['/bin/cp','-cp',str(root/rel),str(b)],check=True);syncdir(journal)
   copied,bs=stable_read(b)
   if digest(copied)!=before or (bs.st_dev,bs.st_ino)==(st.st_dev,st.st_ino) or (bs.st_mode,bs.st_uid,bs.st_gid,bs.st_flags,bs.st_mtime_ns)!=(st.st_mode,st.st_uid,st.st_gid,st.st_flags,st.st_mtime_ns):fail('backup metadata mismatch: '+rel)
   backup_fd=os.open(b,os.O_RDONLY|os.O_NOFOLLOW)
   try:os.fsync(backup_fd)
   finally:os.close(backup_fd)
   syncdir(journal)
   append(j,{'event':'backup','path':rel,'file':b.name,'sha256':before,'device':bs.st_dev,'inode':bs.st_ino})
 # Recheck identity and content after backup.
 revised=pf.classify(root,spec)
 if not pf.all_preimages_present(revised,spec):fail('preimages changed after backup')
 for rel,(before,_) in spec.items():
  if before:
   old=snapshot[rel]['identity'];new=revised[rel]['identity']
   if (old['device'],old['inode'],old['mtime_ns'])!=(new['device'],new['inode'],new['mtime_ns']):fail('target changed during backup: '+rel)
 snapshot=revised
 # Candidate temp files live beside targets to support atomic no-replace link.
 for i,(rel,(before,after)) in enumerate(spec.items()):
  parent,name=safe_parent(root,rel)
  tmp='.blanc-stage-%02d-%s'%(i,os.getpid())
  try:
   if before:
    old=os.stat(name,dir_fd=parent,follow_symlinks=False); prior=snapshot[rel]['identity']
    if (old.st_dev,old.st_ino,old.st_mtime_ns,old.st_ctime_ns)!=(prior['device'],prior['inode'],prior['mtime_ns'],prior['ctime_ns']):fail('target changed: '+rel)
    mode=stat.S_IMODE(old.st_mode)
   else:mode=0o644
   fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode,dir_fd=parent)
   try:
    # Write only through the exclusively created descriptor. Metadata other
    # than mode is intentionally not transferred to changed source files.
    os.fchmod(fd,mode)
    data=candidates[rel]
    while data:
     n=os.write(fd,data);data=data[n:]
    os.fsync(fd);st=os.fstat(fd)
   finally:os.close(fd)
   if st.st_mtime_ns<=mtime_floor:fail('candidate mtime does not invalidate output: '+rel)
   os.fsync(parent)
   append(j,{'event':'pending','path':rel,'temp':tmp,'inode':st.st_ino,'device':st.st_dev,'sha256':after,'before':before})
   curtmp=os.stat(tmp,dir_fd=parent,follow_symlinks=False)
   if not stat.S_ISREG(curtmp.st_mode) or (curtmp.st_dev,curtmp.st_ino,curtmp.st_size,curtmp.st_mtime_ns,curtmp.st_ctime_ns)!=(st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns,st.st_ctime_ns):fail('candidate temp changed: '+rel)
   if before:
    now=os.stat(name,dir_fd=parent,follow_symlinks=False)
    if (now.st_dev,now.st_ino,now.st_mtime_ns,now.st_ctime_ns)!=(prior['device'],prior['inode'],prior['mtime_ns'],prior['ctime_ns']):fail('target raced: '+rel)
    os.rename(tmp,name,src_dir_fd=parent,dst_dir_fd=parent)
   else:
    os.link(tmp,name,src_dir_fd=parent,dst_dir_fd=parent,follow_symlinks=False)
    os.unlink(tmp,dir_fd=parent)
   os.fsync(parent)
   append(j,{'event':'applied','path':rel,'inode':st.st_ino,'device':st.st_dev,'sha256':after})
  finally:os.close(parent)
 if any(v['state']!='after' for v in pf.classify(root,spec).values()):fail('after verification failed')
 append(j,{'event':'complete','time_ns':time.time_ns()});syncdir(journal)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('action',choices=['stage']);ap.add_argument('--process-receipt',required=True);a=ap.parse_args()
 if CLONE.resolve()!=CLONE or not CLONE.is_dir():fail('unexpected clone root')
 lock_path=ROOT/'evidence/combined-workspace-copy-20261029/combined-source.lock'
 lock_fd=os.open(lock_path,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
 try:fcntl.flock(lock_fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:fail('another staging transaction holds the lock')
 check_process_receipt(a.process_receipt)
 floor=cache_floor(CLONE)
 check_process_receipt(a.process_receipt)
 if digest(VERIFY.read_bytes())!=VER_SHA or json.loads(VERIFY.read_text())['status']!='matched-with-limitations':fail('verification receipt mismatch')
 if digest(TREAT.read_bytes())!=TREAT_SHA:fail('link treatment receipt mismatch')
 treat=[json.loads(x) for x in TREAT.read_text().splitlines()]
 if not treat or treat[-1].get('event')!='complete' or treat[-1].get('count')!=11:fail('link treatment incomplete')
 if digest(MANIFEST.read_bytes())!=MANIFEST_SHA:fail('combined manifest digest mismatch')
 m=json.loads(MANIFEST.read_text())
 if m['combined_native_sha256']!=pf.SPEC[pf.UI][1] or m['gn_reference']['candidate_sha256']!=pf.SPEC[pf.GN][1] or m['module_sha256']!=pf.MODULES:fail('manifest mismatch')
 candidates={rel:stable_read(GN if rel==pf.GN else NATIVE/rel)[0] for rel in pf.SPEC}
 stage(CLONE,JOURNAL,pf.SPEC,candidates,floor)
 print('staged nine source targets; GN/build not run')
if __name__=='__main__':
 try:main()
 except Exception as e:print('stopped:',type(e).__name__,e,file=sys.stderr);sys.exit(1)
