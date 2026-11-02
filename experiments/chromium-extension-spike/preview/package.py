#!/usr/bin/env python3
"""Stage existing native output without rebuilding Chromium; never overwrite an app."""
import argparse, hashlib, json, pathlib, plistlib, shutil, subprocess
from notice import build_metadata, stamp_html
from distribution import verify_distribution
from compliance import validate as validate_compliance
p=argparse.ArgumentParser()
p.add_argument('--source',type=pathlib.Path,required=True)
p.add_argument('--assets',type=pathlib.Path,required=True)
p.add_argument('--blocker',type=pathlib.Path,required=True)
p.add_argument('--output',type=pathlib.Path,required=True)
p.add_argument('--source-revision',required=True,help='Exact reviewed source commit for the bundled notice')
p.add_argument('--compliance',type=pathlib.Path,required=True,help='Source-bound license/SBOM payload from compliance.py')
a=p.parse_args()
if a.output.exists(): raise SystemExit('Output already exists; refusing overwrite')
for f in [a.source/'Contents/MacOS/Blanc Prototype',a.assets/'index.html',a.assets/'pages/newtab.html',a.blocker/'engine.js']:
 if not f.is_file(): raise SystemExit(f'Missing input: {f}')
verify_distribution(a.source)
engine_hash=hashlib.sha256((a.blocker/'engine.js').read_bytes()).hexdigest()
engine_manifest=json.loads((a.blocker/'manifest.json').read_text())
if engine_hash != engine_manifest['bundleSha256']: raise SystemExit('Blocker manifest digest mismatch')
version = plistlib.loads((a.source/'Contents/Info.plist').read_bytes())['CFBundleShortVersionString']
validate_compliance(a.compliance, a.assets, a.blocker, version, a.source_revision)
metadata = build_metadata(version, a.source_revision)
notice_pages = {name: stamp_html((a.assets/name).read_text(), metadata)
                for name in ['pages/newtab.html', 'overlay.html']}
a.output.parent.mkdir(parents=True,exist_ok=True)
subprocess.run(['cp','-cR',str(a.source),str(a.output)],check=True)
resources=a.output/'Contents/Resources'
shutil.copytree(a.compliance,resources/'Compliance')
shutil.copytree(a.assets,resources/'BlancAssets')
for name, source in notice_pages.items():
 (resources/'BlancAssets'/name).write_text(source)
(resources/'preview-build.json').write_text(json.dumps(metadata,indent=2)+'\n')
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
  d.update(CFBundleIdentifier='me.bnfy.blanc.chromium.preview',CFBundleName='Blanc Chromium Preview',CFBundleDisplayName='Blanc Chromium Preview',CFBundleExecutable='Blanc Preview Launcher',LSMinimumSystemVersion='26.0')
  for k in ['CFBundleURLTypes','CFBundleDocumentTypes']: d.pop(k,None)
 f.write_bytes(plistlib.dumps(d))
 ids.append({'path':str(f.relative_to(a.output)),'id':d.get('CFBundleIdentifier')})
launcher=a.output/'Contents/MacOS/Blanc Preview Launcher'
subprocess.run(['xcrun','clang','-arch','arm64','-mmacosx-version-min=26.0','-Os','-Wall','-Wextra','-Werror',str(pathlib.Path(__file__).with_name('launcher.c')),'-o',str(launcher)],check=True)
subprocess.run(['codesign','--force','--deep','--sign','-',str(a.output)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(a.output)],check=True)
manifest={'kind':'local-ad-hoc-preview-not-for-distribution','notice':metadata,'identities':ids,'files':{str(f.relative_to(a.output)):hashlib.sha256(f.read_bytes()).hexdigest() for f in a.output.rglob('*') if f.is_file() and not f.is_symlink()}}
a.output.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(a.output)
