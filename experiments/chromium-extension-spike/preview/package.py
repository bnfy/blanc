#!/usr/bin/env python3
"""Stage existing native output without rebuilding Chromium; never overwrite an app."""
import argparse, hashlib, json, pathlib, plistlib, shutil, subprocess
p=argparse.ArgumentParser()
p.add_argument('--source',type=pathlib.Path,required=True)
p.add_argument('--assets',type=pathlib.Path,required=True)
p.add_argument('--blocker',type=pathlib.Path,required=True)
p.add_argument('--output',type=pathlib.Path,required=True)
a=p.parse_args()
if a.output.exists(): raise SystemExit('Output already exists; refusing overwrite')
for f in [a.source/'Contents/MacOS/Blanc Prototype',a.assets/'index.html',a.assets/'pages/newtab.html',a.blocker/'engine.js']:
 if not f.is_file(): raise SystemExit(f'Missing input: {f}')
engine_hash=hashlib.sha256((a.blocker/'engine.js').read_bytes()).hexdigest()
engine_manifest=json.loads((a.blocker/'manifest.json').read_text())
if engine_hash != engine_manifest['bundleSha256']: raise SystemExit('Blocker manifest digest mismatch')
a.output.parent.mkdir(parents=True,exist_ok=True)
subprocess.run(['cp','-cR',str(a.source),str(a.output)],check=True)
resources=a.output/'Contents/Resources'
shutil.copytree(a.assets,resources/'BlancAssets')
(resources/'BlancBlocker').mkdir()
shutil.copy2(a.blocker/'engine.js',resources/'BlancBlocker/engine.js')
shutil.copy2(a.blocker/'manifest.json',resources/'BlancBlocker/manifest.json')
shutil.copytree(a.blocker/'licenses',resources/'BlancBlocker/licenses')
ids=[]
for f in a.output.rglob('Info.plist'):
 d=plistlib.loads(f.read_bytes())
 old=d.get('CFBundleIdentifier','')
 if old.startswith('day.blanc.prototype'):
  d['CFBundleIdentifier']=old.replace('day.blanc.prototype','me.bnfy.blanc.chromium.preview',1)
 if f==a.output/'Contents/Info.plist':
  d.update(CFBundleIdentifier='me.bnfy.blanc.chromium.preview',CFBundleName='Blanc Chromium Preview',CFBundleDisplayName='Blanc Chromium Preview',CFBundleExecutable='Blanc Preview Launcher')
  for k in ['CFBundleURLTypes','CFBundleDocumentTypes']: d.pop(k,None)
 f.write_bytes(plistlib.dumps(d))
 ids.append({'path':str(f.relative_to(a.output)),'id':d.get('CFBundleIdentifier')})
launcher=a.output/'Contents/MacOS/Blanc Preview Launcher'
subprocess.run(['xcrun','clang','-arch','arm64','-Os','-Wall','-Wextra','-Werror',str(pathlib.Path(__file__).with_name('launcher.c')),'-o',str(launcher)],check=True)
subprocess.run(['codesign','--force','--deep','--sign','-',str(a.output)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(a.output)],check=True)
manifest={'kind':'local-ad-hoc-preview-not-for-distribution','identities':ids,'files':{str(f.relative_to(a.output)):hashlib.sha256(f.read_bytes()).hexdigest() for f in a.output.rglob('*') if f.is_file() and not f.is_symlink()}}
a.output.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(a.output)
