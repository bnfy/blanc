#!/usr/bin/env python3
"""DRAFT, NOT EXECUTED. Stage/rollback one hash-pinned 158 file.

No concurrent writers or build may run while this operation or rollback runs.
A crash may leave the journal and temporary file for manual inspection.
"""
from pathlib import Path
import hashlib,json,os,shutil,stat,sys
HERE=Path(__file__).resolve().parent
TARGET=Path('<local-home>/Projects/BlancChromium158/src/chrome/browser/ui/modules/custom_template.cc')
CANDIDATE=HERE/'modules/custom_template.cc'
RECORD=HERE/'single-module-stage'
BACKUP=RECORD/'custom_template.cc.before'
JOURNAL=RECORD/'receipt.json'
TEMP=TARGET.with_name(TARGET.name+'.blanc-buffer-repair')
OLD='ccc6ce6e98fd7c75a0bf5980d7d47f60068bd57c032dae8d46e81e9d2f8ca4e0'
NEW='cfecac0516a96d6eb62f9ed0f0171dccb3f9ac12747a652fc600a7c516277c0c'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def no_symlinks(p):
 for part in (p,*p.parents):
  if part.is_symlink(): raise RuntimeError('symlink in path: '+str(part))
def syncdir(p):
 fd=os.open(p,os.O_RDONLY)
 try: os.fsync(fd)
 finally: os.close(fd)
def record(state):
 d={'state':state,'target':str(TARGET),'backup':str(BACKUP),'old':OLD,'new':NEW}
 p=RECORD/'receipt.json.new'
 with p.open('w') as f: json.dump(d,f,indent=2); f.write('\n'); f.flush(); os.fsync(f.fileno())
 os.replace(p,JOURNAL); syncdir(RECORD)
def restore():
 no_symlinks(TARGET); no_symlinks(JOURNAL); no_symlinks(BACKUP)
 d=json.loads(JOURNAL.read_text())
 if (d.get('target'),d.get('backup'),d.get('old'),d.get('new')) != (str(TARGET),str(BACKUP),OLD,NEW): raise RuntimeError('receipt mismatch')
 if not TARGET.is_file(): raise RuntimeError('target missing; inspect manually')
 current=sha(TARGET)
 if current==OLD: record('rolled-back'); return
 if current!=NEW or not BACKUP.is_file() or sha(BACKUP)!=OLD: raise RuntimeError('unknown target or backup; inspect manually')
 if TEMP.exists() or TEMP.is_symlink(): raise RuntimeError('temporary file exists; inspect manually')
 shutil.copy2(BACKUP,TEMP)
 with TEMP.open('rb') as f: os.fsync(f.fileno())
 if sha(TARGET)!=NEW: raise RuntimeError('target changed during rollback')
 os.replace(TEMP,TARGET); syncdir(TARGET.parent); record('rolled-back')
def stage():
 for p in (TARGET,CANDIDATE,RECORD,TEMP): no_symlinks(p)
 if RECORD.exists() or TEMP.exists(): raise RuntimeError('previous transaction or temporary file exists')
 if not TARGET.is_file() or sha(TARGET)!=OLD: raise RuntimeError('staged original changed')
 if not CANDIDATE.is_file() or sha(CANDIDATE)!=NEW: raise RuntimeError('candidate changed')
 RECORD.mkdir(exist_ok=False); syncdir(RECORD.parent)
 shutil.copy2(TARGET,BACKUP)
 with BACKUP.open('rb') as f: os.fsync(f.fileno())
 if sha(BACKUP)!=OLD: raise RuntimeError('backup mismatch')
 syncdir(RECORD); record('prepared')
 try:
  with TEMP.open('xb') as f:
   f.write(CANDIDATE.read_bytes()); f.flush(); os.fsync(f.fileno())
  os.chmod(TEMP,stat.S_IMODE(TARGET.stat().st_mode))
  with TEMP.open('rb') as f: os.fsync(f.fileno())
  if sha(TEMP)!=NEW or sha(TARGET)!=OLD: raise RuntimeError('source changed before replacement')
  os.replace(TEMP,TARGET); syncdir(TARGET.parent)
  if sha(TARGET)!=NEW: raise RuntimeError('readback mismatch')
  record('staged')
 except Exception:
  # A remaining temporary file is deliberately preserved; recovery refuses to
  # delete it or overwrite a target that no longer has the expected hash.
  if not TEMP.exists():
   try: restore()
   except Exception: pass
  raise
if __name__=='__main__':
 if len(sys.argv)!=2 or sys.argv[1] not in ('stage','rollback'): raise SystemExit('use: stage | rollback')
 if sys.argv[1]=='stage': stage()
 else: restore()
