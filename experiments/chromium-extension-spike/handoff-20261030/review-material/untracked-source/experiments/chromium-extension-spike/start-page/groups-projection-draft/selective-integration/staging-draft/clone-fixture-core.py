#!/usr/bin/env python3
"""Resumable file-clone core for disposable fixture tests only; not a production copier."""
import ctypes, hashlib, json, os, pathlib, shutil, sqlite3, stat

lib=ctypes.CDLL(None,use_errno=True)
clonefile=lib.clonefile;clonefile.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint32];clonefile.restype=ctypes.c_int

def digest(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def xattrs(p):
 path=os.fsencode(p); size=lib.listxattr(path,None,0,1)
 if size<0:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()))
 if not size:return {}
 names=ctypes.create_string_buffer(size);n=lib.listxattr(path,names,size,1)
 if n!=size:raise ValueError('xattrs changed')
 result={}
 for key in names.raw[:n].split(b'\0'):
  if not key:continue
  length=lib.getxattr(path,key,None,0,0,1)
  if length<0:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()))
  val=ctypes.create_string_buffer(length);got=lib.getxattr(path,key,val,length,0,1)
  if got!=length:raise ValueError('xattr changed')
  result[os.fsdecode(key)]=hashlib.sha256(val.raw[:got]).hexdigest()
 return result

def inventory(root):
 found={}
 def walk_error(e):raise e
 for d,dirs,files in os.walk(root,followlinks=False,onerror=walk_error):
  for name in sorted(dirs+files):
   p=pathlib.Path(d)/name;rel=p.relative_to(root).as_posix();st=p.lstat()
   if stat.S_ISLNK(st.st_mode):
    target=os.readlink(p)
    if os.path.isabs(target) or not p.resolve().is_relative_to(root):raise ValueError('external or absolute link')
    value={'kind':'link','target':target}
   elif stat.S_ISDIR(st.st_mode):value={'kind':'dir'}
   elif stat.S_ISREG(st.st_mode):value={'kind':'file','hash':digest(p)}
   else:raise ValueError('special file')
   value.update({'dev':st.st_dev,'ino':st.st_ino,'size':st.st_size,'mtime_ns':st.st_mtime_ns,'ctime_ns':st.st_ctime_ns,'mode':stat.S_IMODE(st.st_mode),'xattrs':xattrs(p)})
   found[rel]=value
 return found

def run(root,dest,journal,fail_after=None):
 root=pathlib.Path(root).absolute();dest=pathlib.Path(dest).absolute();journal=pathlib.Path(journal).absolute();home=pathlib.Path(__file__).resolve().parent
 # Fixture-only: all paths must be siblings in a fresh immediate child of this draft directory.
 if root.is_symlink() or root.parent.is_symlink() or root.parent.parent.resolve()!=home or root.parent!=dest.parent or root.parent!=journal.parent or len({root.name,dest.name,journal.name})!=3:raise ValueError('fixture paths required')
 if not (root/'.fixture-only').is_file() or (root/'.fixture-only').is_symlink():raise ValueError('fixture marker required; production disabled')
 if dest.is_symlink() or journal.is_symlink() or (dest.exists() and not dest.is_dir()) or (journal.exists() and not journal.is_file()):raise ValueError('unsafe destination or journal')
 if not journal.exists() and dest.exists():raise ValueError('unowned existing destination')
 current=inventory(root);con=sqlite3.connect(journal);con.execute('pragma synchronous=FULL');con.execute('create table if not exists state (key text primary key, value text not null)')
 identity=json.dumps({'source':str(root),'source_ino':root.stat().st_ino,'destination':str(dest),'journal':str(journal)},sort_keys=True)
 old=con.execute("select value from state where key='inventory'").fetchone()
 if old:
  before=json.loads(old[0]);saved=con.execute("select value from state where key='identity'").fetchone()
  if not saved or saved[0]!=identity:raise ValueError('journal identity mismatch')
  if before!=current:raise ValueError('source drift')
  owner=con.execute("select value from state where key='destination_inode'").fetchone()
  if not owner or not dest.is_dir() or str(dest.stat().st_ino)!=owner[0]:raise ValueError('destination ownership uncertain')
 else:
  before=current;con.execute('insert into state values (?,?)',('inventory',json.dumps(before,sort_keys=True)));con.execute('insert into state values (?,?)',('identity',identity));con.commit()
  dest.mkdir(mode=0o700);con.execute('insert into state values (?,?)',('destination_inode',str(dest.stat().st_ino)));con.commit()
 count=0
 for rel,item in sorted(before.items(),key=lambda kv:(kv[0].count('/'),kv[0])):
  src=root/rel;dst=dest/rel
  # Reject a symlink in every destination parent before touching a path.
  for parent in list(dst.parents)[:len(pathlib.PurePosixPath(rel).parts)-1]:
   if parent.is_symlink() or not parent.is_dir():raise ValueError('destination ancestor changed')
  if item['kind']=='dir':
   if dst.exists():
    if dst.is_symlink() or not dst.is_dir():raise ValueError('destination drift')
   else:dst.mkdir(mode=0o700)
  elif item['kind']=='link':
   if dst.is_symlink():
    if os.readlink(dst)!=item['target']:raise ValueError('destination drift')
   elif dst.exists():raise ValueError('destination drift')
   else:
    os.symlink(item['target'],dst);shutil.copystat(src,dst,follow_symlinks=False)
  else:
   if dst.exists() or dst.is_symlink():
    st=dst.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_ino==item['ino'] or digest(dst)!=item['hash'] or st.st_mtime_ns!=item['mtime_ns']:raise ValueError('destination drift')
   else:
    rc=clonefile(os.fsencode(src),os.fsencode(dst),0x8)
    if rc:raise OSError(ctypes.get_errno(),os.strerror(ctypes.get_errno()))
    if dst.stat().st_ino==item['ino'] or digest(dst)!=item['hash']:raise ValueError('clone mismatch')
    with dst.open('rb') as f:os.fsync(f.fileno())
  con.execute('insert or replace into state values (?,?)',('done:'+rel,item['kind']));con.commit();count+=1
  if fail_after is not None and count==fail_after:con.close();raise RuntimeError('injected interruption')
 # Restore directory timestamps only after children, then recheck source did not change.
 for rel,item in sorted(before.items(),key=lambda kv:kv[0].count('/'),reverse=True):
  if item['kind']=='dir':shutil.copystat(root/rel,dest/rel,follow_symlinks=False)
 if inventory(root)!=before:raise ValueError('source drift')
 after=inventory(dest)
 if set(after)!=set(before):raise ValueError('destination inventory drift')
 for rel,item in before.items():
  if any(after[rel].get(k)!=item.get(k) for k in ('kind','target','hash','size','mtime_ns','mode','xattrs')):raise ValueError('destination metadata mismatch')
 con.execute('insert or replace into state values (?,?)',('status','fixture-complete'));con.commit();con.close()
 return len(before)
