import hashlib,json,shlex,subprocess
from pathlib import Path
root=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');folder=root/'evidence/context-glance-menu-20261030';stage=folder/'staged';bangstage=root/'evidence/bangs-glance-native-reconcile-20261030/staged';src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';plan=root/'evidence/zoom-integration-20261030/sdk27.2-guarded-plan.log';report=[]
for rel in ['chrome/browser/renderer_context_menu/render_view_context_menu.cc','chrome/browser/ui/blanc_prototype_ui.cc']:
 name=Path(rel).name;log=folder/(name+'.syntax.log');assert not log.exists()
 with plan.open(errors='replace') as f:command=next((x for x in f if name in x and 'clang++' in x),None)
 if not command:raise SystemExit('compiler command missing '+name)
 args=shlex.split(command);clean=[];skip=False
 for a in args[1:]:
  if skip:skip=False;continue
  if a in ('-MF','-o'):skip=True;continue
  if a in ('-MMD','-c') or a.endswith('/'+name):continue
  clean.append(a)
 source=stage/rel;cmd=[args[0],'-I',str(stage),'-I',str(bangstage),'-I',str(bangstage/'chrome/browser/ui'),'-I',str(src/'chrome/browser/ui'),*clean,'-fsyntax-only',str(source)];r=subprocess.run(cmd,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace');log.write_text(r.stdout);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();report.append({'source':rel,'sourceSha256':sha(source),'exit':r.returncode,'logSha256':sha(log)});print(name,'exit',r.returncode);print(r.stdout[-4000:]);
 if r.returncode:break
(folder/'syntax-result.json').write_text(json.dumps({'scope':'staged native menu and owner syntax only; no GN, linking, security or browser test','results':report},indent=2)+'\n');raise SystemExit(any(x['exit'] for x in report))
