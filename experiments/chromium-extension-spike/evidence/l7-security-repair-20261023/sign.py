#!/usr/bin/env python3
"""Sign an already-staged preview with a specified Developer ID; never build/publish."""
import argparse, json, pathlib, plistlib, subprocess
p=argparse.ArgumentParser();p.add_argument('--app',type=pathlib.Path,required=True);p.add_argument('--identity',required=True);p.add_argument('--entitlements',type=pathlib.Path,required=True);p.add_argument('--report',type=pathlib.Path,required=True);a=p.parse_args()
app=a.app.resolve()
info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
if info.get('CFBundleIdentifier')!='me.bnfy.blanc.chromium.preview':raise SystemExit('Refusing non-preview app')
if not a.identity or a.identity=='-':raise SystemExit('Developer ID identity required')
magic={bytes.fromhex(x) for x in ['cffaedfe','cefaedfe','feedfacf','feedface','cafebabe','bebafeca','cafebabf','bfbafeca']}
records=[]
def sign(path,binary=False):
 name=str(path)
 jit='(Renderer)' in name or '(GPU)' in name or '(Aperitif Renderer)' in name or '(Aperitif GPU)' in name
 ent=None
 if jit:ent=a.entitlements/('helper-gpu-entitlements.plist' if 'GPU' in name else 'helper-renderer-entitlements.plist')
 elif path==app or path==app/'Contents/MacOS/Blanc Prototype':ent=a.entitlements/'app-entitlements.plist'
 opts='runtime,kill,restrict' if jit else 'runtime,kill,restrict,library'
 args=['codesign','--force','--timestamp','--sign',a.identity]
 if not str(path).endswith('.dylib') and not str(path).endswith('.framework'):args+=['--options',opts]
 if ent:args+=['--entitlements',str(ent)]
 subprocess.run(args+[str(path)],check=True)
 records.append({'path':str(path.relative_to(app)),'entitlements':ent.name if ent else None})
for f in sorted(app.rglob('*'),key=lambda x:len(x.parts),reverse=True):
 if not f.is_file() or f.is_symlink():continue
 with f.open('rb') as h:m=h.read(4)
 if m in magic:sign(f,True)
for f in sorted([x for x in app.rglob('*') if not x.is_symlink() and x.suffix in ['.app','.framework']],key=lambda x:len(x.parts),reverse=True):sign(f)
sign(app)
subprocess.run(['codesign','--verify','--deep','--strict','--verbose=2',str(app)],check=True)
a.report.write_text(json.dumps(records,indent=2)+'\n')
