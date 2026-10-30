from pathlib import Path
import hashlib,json,shlex,subprocess
h=Path(__file__).resolve().parent;src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';manifest=json.loads((h/'manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name,pair in manifest['files'].items():
 if sha(src/name)!=pair['base'] or sha(h/'files'/name)!=pair['candidate']:raise SystemExit('source mismatch '+name)
overlay={'version':0,'case-sensitive':'true','roots':[{'type':'file','name':str(src/name),'external-contents':str(h/'files'/name)} for name in manifest['files']]}
(h/'syntax-overlay.json').write_text(json.dumps(overlay,indent=2)+'\n')
items=[('base','content/public/browser/browser_sources.ninja',src/'content/public/browser/download_manager.cc','//content/public/browser:browser_sources_Private'),('impl','content/browser/browser.ninja',src/'content/browser/download/download_manager_impl.cc','//content/browser:browser_Private'),('mock','content/test/test_support.ninja',src/'content/public/test/mock_download_manager.cc','//content/test:test_support_Private'),('impl-test','content/test/content_unittests.ninja',src/'content/browser/download/download_manager_impl_unittest.cc','//content/test:content_unittests_Private'),('service','chrome/browser/ui/views/frame/browser_view.ninja',h/'service/epoch-service.cc','//chrome/browser/ui/views/frame:browser_view_Private'),('service-test','chrome/browser/download/unit_tests.ninja',h/'service/epoch-service-unittest.cc','//chrome/browser/download:unit_tests_Private')]
results=[]
for label,ninja,file,module in items:
 try:
  variables={}
  for line in (out/'obj'/ninja).read_text().splitlines():
   if ' = ' in line and not line.startswith(' '):k,v=line.split(' = ',1);variables[k]=v
  argv=[str(src/'third_party/llvm-build/Release+Asserts/bin/clang++')]
  for field in ('defines','include_dirs','cflags','cflags_cc','module_deps'):argv+=shlex.split(variables[field])
  argv=[x for x in argv if not x.startswith('-fcrash-diagnostics-dir=')]+['-ivfsoverlay',str(h/'syntax-overlay.json'),'-fmodule-name='+module,'-fsyntax-only',str(file)]
  (h/(label+'-syntax-command.json')).write_text(json.dumps({'cwd':str(out),'argv':argv,'source_sha256':sha(file),'overlay_sha256':sha(h/'syntax-overlay.json')},indent=2)+'\n')
  p=subprocess.run(argv,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);(h/(label+'-syntax.log')).write_text(p.stdout);results.append({'label':label,'exit':p.returncode});print(label,'exit',p.returncode,flush=True)
  if p.returncode: print(p.stdout[-4000:],flush=True)
 except Exception as e:
  results.append({'label':label,'error':str(e)});print(label,'setup error',e,flush=True)
(h/'syntax-results.json').write_text(json.dumps(results,indent=2)+'\n');raise SystemExit(any(x.get('exit',1)!=0 for x in results))
