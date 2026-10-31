from pathlib import Path
import json,shlex,subprocess
root=Path(__file__).resolve().parent
log=root.parent.parent/'search-host-routing-draft/build-158.log'
line=next(l for l in log.read_text().splitlines() if l.startswith('../../third_party/llvm-build/Release+Asserts/bin/clang++ '))
orig=shlex.split(line)
cwd='<local-home>/Projects/BlancChromium158/src/out/BlancPrototype'
results={}
for name in ['default_search_manager.cc','template_url_prepopulate_data_resolver.cc','template_url_service.cc','enrollment_candidate.cc']:
 a=orig.copy(); a[1:1]=['-I',str(root/'overlay')]; i=a.index('-MF'); del a[i:i+2]; a.remove('-MMD'); i=a.index('-o'); del a[i:i+2]
 a[a.index('../../chrome/browser/ui/blanc_prototype_ui.cc')]=str(root/name)
 a.remove('-c'); a += ['-fsyntax-only','-I',str(root),'-I',str(root.parent)]
 p=subprocess.run(a,cwd=cwd,text=True,capture_output=True)
 (root/(name+'.syntax.log')).write_text(p.stdout+p.stderr)
 results[name]={'exit':p.returncode,'argv':a,'cwd':cwd}
 print(name,p.returncode,(p.stdout+p.stderr)[-3500:])
(root/'syntax-results.json').write_text(json.dumps(results,indent=2)+'\n')
raise SystemExit(any(r['exit'] for r in results.values()))
