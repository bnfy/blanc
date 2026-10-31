"""Prepared syntax-only check, not a build or source staging operation."""
from pathlib import Path
import hashlib,json,shlex,subprocess
h=Path(__file__).resolve().parent
src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs=json.loads((h/'inputs.json').read_text());candidate=h/'ui-candidate.cc'
if sha(candidate)!=inputs['nativeCandidateSha256'] or sha(src/'chrome/browser/ui/blanc_prototype_ui.cc')!=inputs['nativeBaseSha256']:raise SystemExit('candidate or native base changed; reconcile')
flags={}
for line in (out/'obj/chrome/browser/ui/views/frame/browser_view.ninja').read_text().splitlines():
 if ' = ' in line and not line.startswith(' '):
  k,v=line.split(' = ',1);flags[k]=v
args=[str(src/'third_party/llvm-build/Release+Asserts/bin/clang++')]
for field in ('defines','include_dirs','cflags','cflags_cc','module_deps'):args+=shlex.split(flags[field])
args=[x for x in args if not x.startswith('-fcrash-diagnostics-dir=')]+['-Werror','-fmodule-name=//chrome/browser/ui/views/frame:browser_view_Private','-fsyntax-only',str(candidate)]
receipt={'cwd':str(out),'argv':args,'candidateSha256':sha(candidate),'nativeBaseSha256':inputs['nativeBaseSha256'],'flagsSha256':sha(out/'obj/chrome/browser/ui/views/frame/browser_view.ninja'),'argsSha256':sha(out/'args.gn')}
(h/'syntax-command.json').write_text(json.dumps(receipt,indent=2)+'\n')
r=subprocess.run(args,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
(h/'syntax.log').write_text(r.stdout)
print('syntax exit',r.returncode);print(r.stdout[-6000:]);raise SystemExit(r.returncode)
