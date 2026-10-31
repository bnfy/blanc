from pathlib import Path
import hashlib, json, shlex, subprocess
h=Path(__file__).resolve().parent
src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';candidate=h/'overlay/chrome/browser/prefs/browser_prefs.cc'
flags={}
for line in (out/'obj/chrome/browser/prefs/impl.ninja').read_text().splitlines():
    if ' = ' in line and not line.startswith(' '):
        k,v=line.split(' = ',1);flags[k]=v
args=[str(src/'third_party/llvm-build/Release+Asserts/bin/clang++'),'-I'+str(h/'overlay')]
for field in ('defines','include_dirs','cflags','cflags_cc','module_deps'): args+=shlex.split(flags[field])
args=[x for x in args if not x.startswith('-fcrash-diagnostics-dir=')]+['-fmodule-name=//chrome/browser/prefs:impl','-fsyntax-only',str(candidate)]
(h/'syntax-prefs-command.json').write_text(json.dumps({'cwd':str(out),'argv':args,'candidateSha256':hashlib.sha256(candidate.read_bytes()).hexdigest()},indent=2)+'\n')
r=subprocess.run(args,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
(h/'syntax-prefs.log').write_text(r.stdout);print('prefs syntax exit',r.returncode);print(r.stdout[-6000:]);raise SystemExit(r.returncode)
