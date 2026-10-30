from pathlib import Path
import hashlib, json, shlex, subprocess
h=Path(__file__).resolve().parent
src=Path('<local-home>/Projects/BlancChromium158/src')
out=src/'out/BlancPrototype'
candidate=h/'overlay/chrome/browser/ui/blanc_prototype_ui.cc'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
flags={}
for line in (out/'obj/chrome/browser/ui/views/frame/browser_view.ninja').read_text().splitlines():
    if ' = ' in line and not line.startswith(' '):
        k,v=line.split(' = ',1);flags[k]=v
args=[str(src/'third_party/llvm-build/Release+Asserts/bin/clang++'),'-I'+str(h/'overlay')]
for field in ('defines','include_dirs','cflags','cflags_cc','module_deps'): args+=shlex.split(flags[field])
args=[x for x in args if not x.startswith('-fcrash-diagnostics-dir=')]+['-fmodule-name=//chrome/browser/ui/views/frame:browser_view_Private','-fsyntax-only',str(candidate)]
receipt={'cwd':str(out),'argv':args,'candidateSha256':sha(candidate),'integrationSha256':sha(h/'overlay/chrome/browser/ui/launch_sunrise_integration.inc'),'gateSha256':sha(h/'overlay/chrome/browser/ui/launch_sunrise_gate.h')}
(h/'syntax-command.json').write_text(json.dumps(receipt,indent=2)+'\n')
r=subprocess.run(args,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
(h/'syntax.log').write_text(r.stdout)
print('syntax exit',r.returncode)
print(r.stdout[-6000:])
raise SystemExit(r.returncode)
