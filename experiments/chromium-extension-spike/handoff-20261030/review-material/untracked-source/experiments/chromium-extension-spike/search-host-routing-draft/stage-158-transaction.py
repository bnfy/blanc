#!/usr/bin/env python3
"""REVIEW DRAFT. Per-file atomic 158 staging with durable journal; never run on 157.

Usage: stage-158-transaction.py stage | rollback
Cross-file visibility is NOT atomic. Stop competing writers/builds before staging.
Rollback refuses unknown bytes. A killed process requires explicit rollback/review.
"""
from pathlib import Path
import ctypes, hashlib, json, os, shutil, stat, sys

PREVIEW = Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
HERE = PREVIEW/'repo/experiments/chromium-extension-spike/search-host-routing-draft'
SRC = Path('<local-home>/Projects/BlancChromium158/src/chrome/browser/ui')
BASE = PREVIEW/'evidence/topsites-partial-delete-20261029/assets-v1'
BASE_MANIFEST = PREVIEW/'repo/experiments/chromium-extension-spike/evidence/topsites-partial-delete-20261029/manifest-v1.json'
PLAN = HERE/'proposed-assets-manifest.json'
TX = PREVIEW/'evidence/search-host-routing-20261029/stage-158-transaction'
ASSETS = TX.parent/'assets-v1'
ASSET_TMP = TX.parent/'assets-v1.stage-158-tmp'
JOURNAL = TX/'journal.json'
FILES = [
 ('blanc_prototype_ui.cc', 'blanc_prototype_ui.candidate.cc', '75a8c1f7dd6f7488b35350628883a022424dd46b5ea462670dd9265127626070', 'd1c4037f17b3b2c80c2c05807de7c5d8e90d078f6083e6f6ca584334c985038f'),
 ('views/frame/BUILD.gn', 'BUILD.158-candidate.gn', 'b663b8814097f9d6c9fdb7b6e8103c6d32955c390b86ed185e2dbbbc1fc7f4f1', 'f5015b3be510c840a2956d30cb2d418e8f561411902fec0fa8e53b2958ffb219'),
 ('modules/custom_template.cc','modules/custom_template.cc',None,'ccc6ce6e98fd7c75a0bf5980d7d47f60068bd57c032dae8d46e81e9d2f8ca4e0'),
 ('modules/custom_template.h','modules/custom_template.h',None,'d5e4d9e602a7fd74c604a6bfb44da5305e1402b828ecd9df8f080d30d10454ca'),
 ('modules/selected_custom.cc','modules/selected_custom.cc',None,'f0adf7f8298beefa82f6662fdc22bda965fe505d6356e91e7a21baa277beba40'),
 ('modules/selected_custom.h','modules/selected_custom.h',None,'9ab2ad9c99cf640cef07947f4ec9782bf6a28a0d94e22f47b1cdc3a5d03e6e92'),
 ('modules/selected_shipping.cc','modules/selected_shipping.cc',None,'a3ec9e9244ae62205994c9e475ab85046479c661cb9419222d045c1b924e194d'),
 ('modules/selected_shipping.h','modules/selected_shipping.h',None,'22cf60920620ed482df8286f9399feba8b595949805db6cdd4139a451147b7ee'),
 ('modules/selected_shipping_browser.cc','modules/selected_shipping_browser.cc',None,'950d071452d53421a68f9887eb65226c8919c31bfa9536b92e81c258cf08a882'),
]
HOST_HASH='3533154880845b617a0c9546d0897c15ed49166b2795ffc601bc42514fb1032b'
OVERLAY_HASH='3fb033c9931a03b0f8dab9d33a12635962be7c2aaed2af7e85868ce79bbf4b31'
PLAN_HASH='4402d3f13ffcf792808caf412279701b85b7f78bbc6083635b74e744629abd57'
BASE_MANIFEST_HASH='bf8e22cd934f67c876491ba4cb2610ec1cdeaf94efe411b160fe965f6eb7f9d2'

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def no_symlinks(p):
 p=Path(p)
 for part in (p, *p.parents):
  if part.is_symlink(): raise RuntimeError('symlink in path: '+str(part))
def inventory(d):
 no_symlinks(d)
 result={}
 for p in sorted(d.rglob('*')):
  if p.is_symlink(): raise RuntimeError('unexpected asset symlink: '+str(p))
  if p.is_file(): result[str(p.relative_to(d))]=sha(p)
  elif not p.is_dir(): raise RuntimeError('unexpected asset object: '+str(p))
 return result
def fsyncdir(p):
 fd=os.open(p,os.O_RDONLY)
 try: os.fsync(fd)
 finally: os.close(fd)
def save_journal(data):
 temp=TX/'journal.json.new'
 with temp.open('w') as f:
  json.dump(data,f,indent=2,sort_keys=True); f.write('\n'); f.flush(); os.fsync(f.fileno())
 os.replace(temp,JOURNAL); fsyncdir(TX)
def exclusive_rename(source,dest):
 # macOS RENAME_EXCL: fail if destination appeared after preflight.
 lib=ctypes.CDLL(None,use_errno=True); fn=lib.renamex_np
 fn.argtypes=(ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint); fn.restype=ctypes.c_int
 if fn(os.fsencode(source),os.fsencode(dest),4):
  code=ctypes.get_errno(); raise OSError(code,os.strerror(code),str(dest))
def check_assets():
 if sha(BASE_MANIFEST)!=BASE_MANIFEST_HASH or sha(PLAN)!=PLAN_HASH: raise RuntimeError('manifest changed')
 if inventory(BASE)!=json.loads(BASE_MANIFEST.read_text())['files']: raise RuntimeError('base assets changed')
 plan=json.loads(PLAN.read_text())['files']
 if sha(HERE/'host.candidate.js')!=HOST_HASH or sha(HERE/'overlay.candidate.js')!=OVERLAY_HASH: raise RuntimeError('candidate assets changed')
 if plan.get('host.js')!=HOST_HASH or plan.get('overlay.js')!=OVERLAY_HASH: raise RuntimeError('asset plan inconsistent')
 return plan

def rollback(data):
 expected=[{'target':d,'source':s,'old':o,'new':n} for d,s,o,n in FILES]
 if data.get('files')!=expected or data.get('manifest_sha256')!=PLAN_HASH or sha(PLAN)!=PLAN_HASH or data.get('assets')!=json.loads(PLAN.read_text())['files']:
  raise RuntimeError('journal does not match reviewed transaction')
 # Examine all targets first; do not overwrite edits made after the stage.
 for e in data['files']:
  dest=SRC/e['target']; no_symlinks(dest)
  if dest.exists() and sha(dest) not in ([e['new'],e['old']] if e['old'] else [e['new']]): raise RuntimeError('manual recovery required: changed '+str(dest))
  if not dest.exists() and e['old']: raise RuntimeError('manual recovery required: missing original '+str(dest))
  if e['old'] and dest.exists() and sha(dest)==e['new'] and sha(TX/'backups'/e['target'])!=e['old']: raise RuntimeError('backup changed')
 if ASSETS.exists() and inventory(ASSETS)!=data['assets']: raise RuntimeError('manual recovery required: changed asset tree')
 data['state']='rolling-back'; save_journal(data)
 for e in reversed(data['files']):
  dest=SRC/e['target']
  if not dest.exists() or (e['old'] and sha(dest)==e['old']): continue
  if e['old']:
   tmp=dest.with_name(dest.name+'.blanc-search-rollback')
   if tmp.exists(): raise RuntimeError('unexpected rollback temp '+str(tmp))
   shutil.copy2(TX/'backups'/e['target'],tmp)
   with tmp.open('rb') as f: os.fsync(f.fileno())
   if sha(dest)!=e['new']: raise RuntimeError('target changed during rollback')
   os.replace(tmp,dest); fsyncdir(dest.parent)
  else:
   if sha(dest)!=e['new']: raise RuntimeError('target changed during rollback')
   dest.unlink(); fsyncdir(dest.parent)
 if ASSETS.exists(): shutil.rmtree(ASSETS); fsyncdir(ASSETS.parent)
 data['state']='rolled-back'; save_journal(data)

def stage():
 if TX.exists() or ASSETS.exists() or ASSET_TMP.exists(): raise RuntimeError('transaction or asset destination already exists')
 for dest,source,old,new in FILES:
  p=SRC/dest; no_symlinks(p); no_symlinks(HERE/source)
  if sha(HERE/source)!=new: raise RuntimeError('candidate changed: '+source)
  if old and (not p.is_file() or sha(p)!=old): raise RuntimeError('original changed: '+dest)
  if old is None and (p.exists() or p.is_symlink()): raise RuntimeError('new target exists: '+dest)
 plan=check_assets()
 TX.mkdir(parents=True,exist_ok=False); fsyncdir(TX.parent)
 entries=[{'target':d,'source':s,'old':o,'new':n} for d,s,o,n in FILES]
 data={'state':'preparing','files':entries,'assets':plan,'manifest_sha256':PLAN_HASH,'note':'Per-file atomic; multi-file transaction is journaled, not globally atomic.'}
 save_journal(data)
 for e in entries:
  if e['old']:
   p=TX/'backups'/e['target']; p.parent.mkdir(parents=True,exist_ok=True)
   shutil.copy2(SRC/e['target'],p)
   with p.open('rb') as f: os.fsync(f.fileno())
   if sha(p)!=e['old']: raise RuntimeError('backup mismatch')
   fsyncdir(p.parent)
 # A crash during this copy leaves a deliberately preserved temporary tree.
 shutil.copytree(BASE,ASSET_TMP)
 shutil.copyfile(HERE/'host.candidate.js',ASSET_TMP/'host.js')
 shutil.copyfile(HERE/'overlay.candidate.js',ASSET_TMP/'overlay.js')
 if inventory(ASSET_TMP)!=plan: raise RuntimeError('candidate asset inventory mismatch')
 for p in ASSET_TMP.rglob('*'):
  if p.is_file():
   with p.open('rb') as f: os.fsync(f.fileno())
 for p in sorted((p for p in ASSET_TMP.rglob('*') if p.is_dir()),key=lambda p:len(p.parts),reverse=True): fsyncdir(p)
 fsyncdir(ASSET_TMP)
 data['state']='staging'; save_journal(data)
 try:
  for e in entries:
   dest=SRC/e['target']; dest.parent.mkdir(parents=True,exist_ok=True); no_symlinks(dest)
   temp=dest.with_name(dest.name+'.blanc-search-stage')
   if temp.exists() or temp.is_symlink(): raise RuntimeError('unexpected staging temp '+str(temp))
   with temp.open('xb') as f:
    f.write((HERE/e['source']).read_bytes()); f.flush(); os.fsync(f.fileno())
   if sha(temp)!=e['new']: raise RuntimeError('candidate copy mismatch')
   if e['old']:
    if not dest.is_file() or sha(dest)!=e['old']: raise RuntimeError('target changed before replace')
    os.chmod(temp,stat.S_IMODE(dest.stat().st_mode))
    with temp.open('rb') as f: os.fsync(f.fileno())
    os.replace(temp,dest)
   else:
    exclusive_rename(temp,dest)
   fsyncdir(dest.parent)
  exclusive_rename(ASSET_TMP,ASSETS); fsyncdir(ASSETS.parent)
  for e in entries:
   if sha(SRC/e['target'])!=e['new']: raise RuntimeError('readback mismatch')
  if inventory(ASSETS)!=plan: raise RuntimeError('asset readback mismatch')
  data['state']='staged'; save_journal(data)
 except Exception as exc:
  data['failure']=str(exc); save_journal(data)
  try: rollback(data)
  except Exception as recovery: data['rollback_failure']=str(recovery); save_journal(data)
  raise

if __name__=='__main__':
 if len(sys.argv)!=2 or sys.argv[1] not in ('stage','rollback'): raise SystemExit('use: stage | rollback')
 if sys.argv[1]=='stage': stage()
 else:
  no_symlinks(JOURNAL); data=json.loads(JOURNAL.read_text()); rollback(data)
