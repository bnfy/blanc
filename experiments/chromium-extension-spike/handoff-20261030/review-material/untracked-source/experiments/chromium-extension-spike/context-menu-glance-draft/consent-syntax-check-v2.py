from pathlib import Path
import hashlib,json,shlex,subprocess
root=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');folder=root/'evidence/context-external-consent-20261030';stage=folder/'staged';src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';plan=root/'evidence/zoom-integration-20261030/sdk27.2-guarded-plan.log';results=[]
for rel in ['chrome/browser/external_protocol/external_protocol_handler.cc','chrome/browser/ui/views/external_protocol_dialog.cc']:
 name=Path(rel).name;log=folder/(name+'.v2.syntax.log');assert not log.exists()
 with plan.open(errors='replace') as f:command=next((x for x in f if name in x and 'clang++' in x),None)
 assert command
 args=shlex.split(command);clean=[];skip=False
 for a in args[1:]:
  if skip:skip=False;continue
  if a in ('-MF','-o'):skip=True;continue
  if a in ('-MMD','-c') or a.endswith('/'+name):continue
  clean.append(a)
 p=stage/rel;cmd=[args[0],'-I',str(stage),*clean,'-fsyntax-only',str(p)];r=subprocess.run(cmd,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace');log.write_text(r.stdout);sha=lambda q:hashlib.sha256(q.read_bytes()).hexdigest();results.append({'source':rel,'sha256':sha(p),'exit':r.returncode,'logSha256':sha(log)});print(name,r.returncode);print(r.stdout[-3000:]);
 if r.returncode:break
(folder/'syntax-v2-result.json').write_text(json.dumps({'scope':'macOS SDK27.2 syntax only; no GN, linkage, consent or OS behavior','results':results},indent=2)+'\n');raise SystemExit(any(x['exit'] for x in results))
