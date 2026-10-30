"""Prepared only: owner-checked resume1 stale-lock recovery. Never run without review.

Touches exactly two recorded lock directories, no source/output/cache/profile.
On uncertainty, preserve any remaining lock and the fsynced recovery receipt.
"""
from pathlib import Path
import hashlib,json,os,re,subprocess,sys,time
if len(sys.argv)!=2 or not re.fullmatch(r'[a-z0-9-]+',sys.argv[1]):raise SystemExit('usage: recover-resume1-locks.py fresh-recovery-label')
label=sys.argv[1];preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';base=preview/'evidence/start-page-groups-20261029';record=base/('lock-recovery-'+label);stage=base/'stage-groups1/transaction.json';failed=base/'build-resume1/receipt.json';log=base/'build-resume1/build.log';trusted=preview/'evidence/start-page-sunrise-20261029/stage-sunrise-a/transaction.json'
expected={'receipt':'9caadd6d0fb358244382a4ffff0b7509204daa5dca95d97fabc7ee866b5824c3','log':'c0ebec09953b68d0997ddf7e03807655ce732bb3100925d2c4f76e7569e05cb6','stage':'94547d6a0072858aad43a87411f2e728b94857bcae5fc2ada742514ce973cf9e','trusted':'628bd51e633ecfa23f21fdd147df30c168175e71597f55ddba468dad713a0383'}
locks={'.blanc-sunrise-transaction.lock':('3ee27e3885d8ea16f40deea939ea9cade298ceb05655a4b9f5f6c91fb4cbb868',1793295047262364000),'.blanc-build-guard.lock':('c361bf4041ab3e50dd37503e25af0224ed980f9ec69a3c073a08273ef33cd738',1793295047262543000)}
def sha(path):
 d=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):d.update(b)
 return d.hexdigest()
def inventory(root):
 result={};canonical=root.resolve(strict=True)
 for p in sorted(root.rglob('*')):
  name=str(p.relative_to(root))
  if p.is_symlink():
   if not p.resolve(strict=True).is_relative_to(canonical):raise RuntimeError('escaping symlink '+str(p))
   result[name]={'symlink':os.readlink(p)}
  elif p.is_file():result[name]={'sha256':sha(p)}
 return result
def assert_quiet():
 rows=subprocess.check_output(['/bin/ps','-axo','pid=,ppid=,pgid=,state=,comm='],text=True)
 for line in rows.splitlines():
  parts=line.strip().split(None,4)
  if len(parts)!=5:raise RuntimeError('unparseable process row')
  pid,_,pgid,state,comm=parts
  if pid=='57362' or pgid=='57396' or Path(comm).name.lower() in ('ninja','autoninja','siso','caffeinate'):
   raise RuntimeError('owner, build group or build-related process still present: '+line.strip())
 for pid,group in ((57362,False),(57396,True)):
  try:
   if group:os.killpg(pid,0)
   else:os.kill(pid,0)
  except ProcessLookupError:continue
  except PermissionError:raise RuntimeError('cannot verify original owner or group exit')
  raise RuntimeError('original owner or build group still exists')
 return rows
def inspect_lock(root_fd,name,digest,created_ns):
 fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root_fd)
 try:
  info=os.fstat(fd)
  if os.listdir(fd)!=['owner.json']:raise RuntimeError('unexpected lock entries: '+name)
  owner_fd=os.open('owner.json',os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
  try:
   owner_stat=os.fstat(owner_fd);data=os.read(owner_fd,4096)
   if os.read(owner_fd,1):raise RuntimeError('oversized owner file')
  finally:os.close(owner_fd)
  if hashlib.sha256(data).hexdigest()!=digest or json.loads(data)!={'pid':57362,'createdNs':created_ns}:raise RuntimeError('lock owner differs: '+name)
  return {'dirDev':info.st_dev,'dirIno':info.st_ino,'ownerDev':owner_stat.st_dev,'ownerIno':owner_stat.st_ino,'ownerSha256':digest}
 finally:os.close(fd)
def remove_checked(root_fd,name,identity,digest,created_ns):
 if inspect_lock(root_fd,name,digest,created_ns)!=identity:raise RuntimeError('lock changed before removal: '+name)
 fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root_fd)
 try:
  info=os.fstat(fd);owner_fd=os.open('owner.json',os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
  try:
   owner=os.fstat(owner_fd);current=os.read(owner_fd,4096)
   if os.read(owner_fd,1) or hashlib.sha256(current).hexdigest()!=digest:raise RuntimeError('lock owner bytes changed during removal')
  finally:os.close(owner_fd)
  named_owner=os.stat('owner.json',dir_fd=fd,follow_symlinks=False)
  if (info.st_dev,info.st_ino,owner.st_dev,owner.st_ino,named_owner.st_dev,named_owner.st_ino)!=(identity['dirDev'],identity['dirIno'],identity['ownerDev'],identity['ownerIno'],identity['ownerDev'],identity['ownerIno']):raise RuntimeError('lock changed during removal')
  os.unlink('owner.json',dir_fd=fd);os.fsync(fd)
  named=os.stat(name,dir_fd=root_fd,follow_symlinks=False)
  if (named.st_dev,named.st_ino)!=(info.st_dev,info.st_ino):raise RuntimeError('lock directory identity changed')
  os.rmdir(name,dir_fd=root_fd);os.fsync(root_fd)
 finally:os.close(fd)
def save(data):
 temp=record/'receipt.new'
 with temp.open('w') as f:f.write(json.dumps(data,indent=2)+'\n');f.flush();os.fsync(f.fileno())
 os.replace(temp,record/'receipt.json');fd=os.open(record,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def main():
 if record.exists():raise RuntimeError('use a fresh recovery label')
 for p,k in ((failed,'receipt'),(log,'log'),(stage,'stage'),(trusted,'trusted')):
  if p.is_symlink() or sha(p)!=expected[k]:raise RuntimeError('original evidence changed: '+str(p))
 prior=base/'lock-recovery-recovery1/receipt.json'
 if prior.is_symlink() or sha(prior)!='a3505de36787aa6ca00d6d72eddd0498f2e9ce5588742afc0dd054ea9be8c7e8':raise RuntimeError('prior lock recovery receipt changed')
 for f,digest in ((base/'build-groups1/receipt.json','5c1500b1c282cf00ac0fbd36a914ffabff6bae6a98f6346cb3df18caa3397e59'),(base/'build-groups1/build.log','dacb6af15d8cf25d24a0d70f99944742a8331dc8e3be2f9c2f1b99bbad6793df')):
  if f.is_symlink() or sha(f)!=digest:raise RuntimeError('prior failed build evidence changed')
 old=json.loads(failed.read_text());st=json.loads(stage.read_text());tr=json.loads(trusted.read_text())
 if old.get('status')!='failed' or old.get('scopeMonitoring')!='stopped-after-expansion' or old.get('buildProcessGroup')!=57396 or old.get('liveMaxAdvertised')!=972 or old.get('requestedLiveCap')!=556 or st.get('status')!='staged' or st.get('pending') is not None:raise RuntimeError('unexpected interrupted build or stage state')
 app=out/'Blanc Prototype.app';baseline=tr['baselineAppInventory']
 if len(baseline)!=353 or inventory(app)!=baseline:raise RuntimeError('full baseline app changed; preserve and inspect')
 prefix='Contents/Frameworks/Blanc Prototype Framework.framework/'
 expected_framework={k[len(prefix):]:v for k,v in baseline.items() if k.startswith(prefix)}
 if inventory(out/'Blanc Prototype Framework.framework')!=expected_framework:raise RuntimeError('output framework changed; preserve and inspect')
 for name,item in st['targets'].items():
  if (src/name).is_symlink() or sha(src/name)!=item['after']:raise RuntimeError('staged source changed')
 obj=out/'obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o'
 if sha(obj)!=st['baselineUiObjectSha256']:raise RuntimeError('cached object changed; preserve and inspect')
 rows=assert_quiet();root_fd=os.open(out,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  identities={name:inspect_lock(root_fd,name,digest,created) for name,(digest,created) in locks.items()}
  record.mkdir(parents=True);parent=record
  while True:
   fd=os.open(parent,os.O_RDONLY)
   try:os.fsync(fd)
   finally:os.close(fd)
   if parent==preview:break
   if preview not in parent.parents:raise RuntimeError('unexpected recovery path')
   parent=parent.parent
  fd=os.open(preview.parent,os.O_RDONLY)
  try:os.fsync(fd)
  finally:os.close(fd)
  data={'status':'in-progress','originalEvidence':expected,'priorRecoverySha256':sha(prior),'priorFailedReceiptSha256':'5c1500b1c282cf00ac0fbd36a914ffabff6bae6a98f6346cb3df18caa3397e59','lockIdentities':identities,'processSnapshot':rows,'baselineObjectSha256':sha(obj),'removed':[],'startedEpoch':time.time()};save(data)
  for name,(digest,created) in locks.items():
   assert_quiet();data['pending']=name;save(data)
   remove_checked(root_fd,name,identities[name],digest,created)
   data['removed'].append(name);data['pending']=None;save(data)
  data['status']='removed-owned-stale-locks';data['finishedEpoch']=time.time();save(data);print(json.dumps(data,indent=2))
 finally:os.close(root_fd)
if __name__=='__main__':main()
