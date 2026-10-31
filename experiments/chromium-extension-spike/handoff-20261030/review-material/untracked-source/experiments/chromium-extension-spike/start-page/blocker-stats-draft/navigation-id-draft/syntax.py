from pathlib import Path
import json,shlex,subprocess,hashlib
src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';ev=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview/evidence/blocker-navigation-id-20261029-v2');manifest=json.loads((ev/'manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name,h in manifest['files'].items():assert sha(src/name)==h['original'] and sha(ev/'candidate'/name)==h['candidate']
overlay={'version':0,'case-sensitive':'true','roots':[{'type':'file','name':str(src/name),'external-contents':str(ev/'candidate'/name)} for name in manifest['files']]};(ev/'overlay.json').write_text(json.dumps(overlay,indent=2)+'\n')
items=[('content/browser/browser.ninja','content/browser/loader/url_loader_factory_utils.cc','//content/browser:browser_Private'),('content/browser/browser.ninja','content/browser/loader/navigation_url_loader_impl.cc','//content/browser:browser_Private'),('chrome/services/blanc_blocker/browser.ninja','chrome/services/blanc_blocker/blocker_proxy.cc','//chrome/services/blanc_blocker:browser_Private')]
results=[]
for rel,n,mod in items:
 f={}
 for line in (out/'obj'/rel).read_text().splitlines():
  if ' = ' in line and not line.startswith(' '): k,v=line.split(' = ',1);f[k]=v
 args=[str(src/'third_party/llvm-build/Release+Asserts/bin/clang++')]
 for field in ('defines','include_dirs','cflags','cflags_cc','module_deps'):args+=shlex.split(f[field])
 args=[x for x in args if not x.startswith('-fcrash-diagnostics-dir=')];args += ['-ivfsoverlay',str(ev/'overlay.json'),'-fmodule-name='+mod,'-fsyntax-only',str(src/n)]
 label=Path(n).stem;(ev/(label+'-command.json')).write_text(json.dumps({'cwd':str(out),'argv':args},indent=2)+'\n');r=subprocess.run(args,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);(ev/(label+'-syntax.log')).write_text(r.stdout);results.append({'source':n,'exit':r.returncode});print(n,'exit',r.returncode,flush=True)
 if r.returncode:print(r.stdout[-4000:],flush=True)
(ev/'syntax-results.json').write_text(json.dumps(results,indent=2)+'\n');raise SystemExit(any(x['exit'] for x in results))
