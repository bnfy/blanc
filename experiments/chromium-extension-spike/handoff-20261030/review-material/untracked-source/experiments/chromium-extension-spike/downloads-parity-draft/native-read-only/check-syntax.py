from pathlib import Path
import hashlib,json,shlex,subprocess
h=Path(__file__).resolve().parent
src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype'
variables={}
for line in (out/'obj/chrome/browser/ui/views/frame/browser_view.ninja').read_text().splitlines():
 if ' = ' in line and not line.startswith(' '):
  k,v=line.split(' = ',1);variables[k]=v
argv=[str(src/'third_party/llvm-build/Release+Asserts/bin/clang++')]
for field in ('defines','include_dirs','cflags','cflags_cc','module_deps'):argv+=shlex.split(variables[field])
argv=[a for a in argv if not a.startswith('-fcrash-diagnostics-dir=')]
argv+=['-fmodule-name=//chrome/browser/ui/views/frame:browser_view_Private','-fsyntax-only',str(h/'projection.cc')]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(h/'syntax-command.json').write_text(json.dumps({'cwd':str(out),'argv':argv,'sha256':{p.name:sha(p) for p in [h/'projection.cc',h/'projection.h',h/'scope.h']}},indent=2)+'\n')
r=subprocess.run(argv,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
(h/'syntax.log').write_text(r.stdout)
print('syntax exit',r.returncode);print(r.stdout[-7000:]);raise SystemExit(r.returncode)
