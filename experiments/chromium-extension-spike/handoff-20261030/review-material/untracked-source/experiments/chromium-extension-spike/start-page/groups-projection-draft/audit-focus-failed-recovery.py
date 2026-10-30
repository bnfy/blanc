"""Prepared only. Audit interrupted diagnostic and release its exact stale locks.

Never signals a process, edits source, deletes build products or changes the
monitor. The audit must be separately reviewed before the release phase.
"""
from pathlib import Path
import hashlib,json,os,re,subprocess,sys,time
if not __debug__:raise RuntimeError('optimized Python forbidden')
if len(sys.argv) not in (6,7) or sys.argv[1] not in ('audit','release') or any(not re.fullmatch(r'[a-z0-9-]+',x) for x in sys.argv[2:5]) or sys.argv[5]!='monitor-paused-no-inflight' or (sys.argv[1]=='audit' and len(sys.argv)!=6) or (sys.argv[1]=='release' and (len(sys.argv)!=7 or not re.fullmatch(r'[a-f0-9]{64}',sys.argv[6]))):
 raise SystemExit('usage: audit-focus-failed-recovery.py audit|release STAGE_LABEL BUILD_LABEL AUDIT_LABEL monitor-paused-no-inflight [reviewed-audit-sha256]')
mode,stage_label,build_label,audit_label=sys.argv[1:5];reviewed=sys.argv[6] if mode=='release' else None
preview=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';base=preview/'evidence/start-page-groups-20261029'
stage=base/('stage-focus-'+stage_label)/'transaction.json';build=base/('build-focus-'+build_label)/'receipt.json';log=build.parent/'build.log';audit_dir=base/('failed-focus-audit-'+audit_label);release_dir=base/('failed-focus-release-'+audit_label)
manifest=Path(__file__).resolve().parent/'manifest-focus-branch-diagnostic.json';app=out/'Blanc Prototype.app';output=out/'Blanc Prototype Framework.framework';obj=out/'obj/chrome/browser/ui/views/frame/browser_view/blanc_prototype_ui.o'
LOCKS=('.blanc-sunrise-transaction.lock','.blanc-build-guard.lock')
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
 return h.hexdigest()
def inventory(root):
 if root.is_symlink() or not root.is_dir():raise RuntimeError('inventory root unavailable: '+str(root))
 result={};canonical=root.resolve(strict=True)
 for p in sorted(root.rglob('*')):
  name=str(p.relative_to(root))
  if p.is_symlink():
   if not p.resolve(strict=True).is_relative_to(canonical):raise RuntimeError('escaping symlink: '+name)
   result[name]={'symlink':os.readlink(p)}
  elif p.is_file():result[name]={'sha256':sha(p)}
 return result
def monitor_excluded():
 p=Path('<local-home>/.codex/automations/keep-chromium-dev-current-and-open/automation.toml')
 if p.is_symlink() or not p.is_file():raise RuntimeError('monitor config missing or unsafe')
 text=p.read_text()
 if re.findall(r'^id\s*=\s*"([^\"]+)"\s*$',text,re.M)!=['keep-chromium-dev-current-and-open'] or re.findall(r'^status\s*=\s*"([^\"]+)"\s*$',text,re.M)!=['PAUSED']:raise RuntimeError('monitor not confirmed paused')
 return sha(p)
def quiet(owner,group):
 if not isinstance(owner,int) or not isinstance(group,int) or owner<=1 or group<=1 or owner==os.getpid():raise RuntimeError('invalid recorded owner/group')
 rows=subprocess.check_output(['/bin/ps','-axo','pid=,ppid=,pgid=,state=,comm='],text=True)
 for line in rows.splitlines():
  p=line.strip().split(None,4)
  if len(p)!=5:raise RuntimeError('unparseable process row')
  pid,_,pgid,_,comm=p
  if int(pid)==owner or int(pgid)==group or Path(comm).name.lower() in ('ninja','autoninja','siso','caffeinate'):raise RuntimeError('owner, group or build process exists: '+line.strip())
 for pid,isgroup in ((owner,False),(group,True)):
  try:os.killpg(pid,0) if isgroup else os.kill(pid,0)
  except ProcessLookupError:continue
  except PermissionError:raise RuntimeError('cannot establish process exit')
  raise RuntimeError('owner or group still exists')
 return rows
def sync_dir(p):
 fd=os.open(p,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def create_record_dir(p):
 p.mkdir(parents=True,exist_ok=False);x=p
 while True:
  sync_dir(x)
  if x==preview:break
  if preview not in x.parents:raise RuntimeError('unexpected evidence path')
  x=x.parent
 sync_dir(preview.parent)
def write_new(path,data):
 with path.open('x') as f:f.write(json.dumps(data,indent=2)+'\n');f.flush();os.fsync(f.fileno())
 sync_dir(path.parent)
def save(path,data):
 temp=path.with_suffix('.new')
 with temp.open('x') as f:f.write(json.dumps(data,indent=2)+'\n');f.flush();os.fsync(f.fileno())
 os.replace(temp,path);sync_dir(path.parent)
def inspect_lock(root_fd,name,expected):
 fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root_fd)
 try:
  info=os.fstat(fd)
  if os.listdir(fd)!=['owner.json']:raise RuntimeError('unexpected lock entries: '+name)
  own=os.open('owner.json',os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
  try:
   st=os.fstat(own);data=os.read(own,4096)
   if os.read(own,1):raise RuntimeError('oversized owner file')
  finally:os.close(own)
  observed={'dirDev':info.st_dev,'dirIno':info.st_ino,'ownerDev':st.st_dev,'ownerIno':st.st_ino,'ownerSha256':hashlib.sha256(data).hexdigest(),'owner':json.loads(data)}
  if observed!=expected:raise RuntimeError('lock owner or inode differs: '+name)
  return observed
 finally:os.close(fd)
def remove_lock(root_fd,name,identity):
 inspect_lock(root_fd,name,identity)
 fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root_fd)
 try:
  ds=os.fstat(fd);own=os.open('owner.json',os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
  try:st=os.fstat(own);data=os.read(own,4096);extra=os.read(own,1)
  finally:os.close(own)
  named=os.stat('owner.json',dir_fd=fd,follow_symlinks=False)
  if extra or hashlib.sha256(data).hexdigest()!=identity['ownerSha256'] or (ds.st_dev,ds.st_ino,st.st_dev,st.st_ino,named.st_dev,named.st_ino)!=(identity['dirDev'],identity['dirIno'],identity['ownerDev'],identity['ownerIno'],identity['ownerDev'],identity['ownerIno']):raise RuntimeError('lock changed during removal')
  os.unlink('owner.json',dir_fd=fd);os.fsync(fd);named=os.stat(name,dir_fd=root_fd,follow_symlinks=False)
  if (named.st_dev,named.st_ino)!=(ds.st_dev,ds.st_ino):raise RuntimeError('lock directory changed')
  os.rmdir(name,dir_fd=root_fd);os.fsync(root_fd)
 finally:os.close(fd)
def state(remaining=LOCKS):
 for p in (stage,build,log,manifest):
  if p.is_symlink() or not p.is_file():raise RuntimeError('required evidence missing or unsafe: '+str(p))
 if sha(manifest)!='98733f4e627b5ce33ed3eaf7ee327f48e47e63182885e750ae0ec955322aef68':raise RuntimeError('manifest changed')
 s=json.loads(stage.read_text());b=json.loads(build.read_text());owner=b.get('recorderPid');group=b.get('buildProcessGroup')
 if b.get('status') not in ('failed','in-progress') or b.get('diagnosticOnly') is not True or b.get('stageLabel')!=stage_label or b.get('stageReceiptSha256')!=sha(stage) or b.get('overlayManifestSha256')!=sha(manifest) or b.get('baseBuildReceiptSha256')!='a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23' or s.get('status')!='staged' or s.get('pending') is not None:raise RuntimeError('unsupported failed attempt or stage identity')
 locks=b.get('lockIdentities')
 if not isinstance(locks,dict) or set(locks)!=set(LOCKS) or any(locks[n].get('owner',{}).get('pid')!=owner for n in LOCKS):raise RuntimeError('recorded lock provenance unavailable')
 for name,item in s['targets'].items():
  target=src/name;backup=stage.parent/'preimages'/name
  if target.is_symlink() or sha(target)!=item['after'] or backup.is_symlink() or sha(backup)!=item['before']:raise RuntimeError('source or source preimage drift')
 trusted=base/'build-closure1'/'receipt.json';trusted_inventory=trusted.parent/'app-inventory.json'
 if trusted.is_symlink() or sha(trusted)!='a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23':raise RuntimeError('trusted baseline receipt changed')
 t=json.loads(trusted.read_text())
 if trusted_inventory.is_symlink() or sha(trusted_inventory)!=t.get('appInventorySha256') or json.loads(trusted_inventory.read_text())!=s.get('baselineAppInventory') or t.get('frameworkSha256')!=s.get('baselineFrameworkSha256') or t.get('guardActions')!=0:raise RuntimeError('stage baseline does not match trusted inventory')
 backup=stage.parent/'verified-baseline.app';backup_output=stage.parent/'verified-baseline-output-framework';backup_obj=stage.parent/'verified-baseline-ui.o'
 if inventory(backup)!=s['baselineAppInventory'] or inventory(backup_output)!=s['baselineOutputFrameworkInventory'] or sha(backup_obj)!=s['baselineUiObjectSha256']:raise RuntimeError('baseline backups changed')
 if obj.is_symlink() or not obj.is_file():raise RuntimeError('partial UI object is missing or unsafe')
 config_sha=monitor_excluded();rows=quiet(owner,group)
 root_fd=os.open(out,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  for name in remaining:inspect_lock(root_fd,name,locks[name])
 finally:os.close(root_fd)
 return {'stageSha256':sha(stage),'buildReceiptSha256':sha(build),'buildLogSha256':sha(log),'manifestSha256':sha(manifest),'monitorConfigSha256':config_sha,'ownerPid':owner,'buildProcessGroup':group,'lockIdentities':locks,'partialApp':inventory(app),'partialOutputFramework':inventory(output),'partialUiObjectSha256':sha(obj),'processSnapshot':rows}
def main():
 if mode=='audit':
  if audit_dir.exists():raise RuntimeError('audit label already used')
  observed=state();observed.update(status='awaiting-review',stageLabel=stage_label,buildLabel=build_label,auditLabel=audit_label,createdEpoch=time.time());create_record_dir(audit_dir);write_new(audit_dir/'receipt.json',observed)
  print(json.dumps({'audit':str(audit_dir/'receipt.json'),'sha256':sha(audit_dir/'receipt.json'),'status':'awaiting-review'}));return
 audited=audit_dir/'receipt.json'
 if audited.is_symlink() or not audited.is_file() or sha(audited)!=reviewed or release_dir.exists():raise RuntimeError('reviewed audit missing, changed or release label used')
 a=json.loads(audited.read_text())
 if a.get('status')!='awaiting-review' or (a.get('stageLabel'),a.get('buildLabel'),a.get('auditLabel'))!=(stage_label,build_label,audit_label):raise RuntimeError('audit identity mismatch')
 def check(remaining):
  now=state(remaining)
  for key in ('stageSha256','buildReceiptSha256','buildLogSha256','manifestSha256','monitorConfigSha256','ownerPid','buildProcessGroup','lockIdentities','partialApp','partialOutputFramework','partialUiObjectSha256'):
   if now[key]!=a[key]:raise RuntimeError('audited state changed: '+key)
 check(LOCKS);create_record_dir(release_dir);receipt=release_dir/'receipt.json';data={'status':'in-progress','auditSha256':reviewed,'removed':[],'pending':None,'createdEpoch':time.time()};write_new(receipt,data)
 fd=os.open(out,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  for i,name in enumerate(LOCKS):
   check(LOCKS[i:]);data['pending']=name;save(receipt,data);remove_lock(fd,name,a['lockIdentities'][name]);data['removed'].append(name);data['pending']=None;save(receipt,data)
  data['status']='removed-owned-stale-locks';data['completedEpoch']=time.time();save(receipt,data);print(json.dumps(data,indent=2))
 finally:os.close(fd)
if __name__=='__main__':main()
