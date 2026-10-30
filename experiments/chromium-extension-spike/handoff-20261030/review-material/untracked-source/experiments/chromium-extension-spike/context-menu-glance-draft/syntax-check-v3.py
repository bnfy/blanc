import hashlib,json,shlex,subprocess
from pathlib import Path
root=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');folder=root/'evidence/context-glance-origin-v3-20261030';folder.mkdir(exist_ok=False);stage=root/'repo/experiments/chromium-extension-spike/context-menu-glance-draft';src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';plan=root/'evidence/zoom-integration-20261030/sdk27.2-guarded-plan.log';log=folder/'syntax.log';receipt=folder/'syntax-result.json'
if log.exists() or receipt.exists():raise SystemExit('existing evidence preserved')
with plan.open(errors='replace') as f:command=next((x for x in f if 'blanc_prototype_ui.cc' in x and 'clang++' in x),None)
if not command:raise SystemExit('compiler command missing')
args=shlex.split(command);clean=[];skip=False
for a in args[1:]:
 if skip:skip=False;continue
 if a in ('-MF','-o'):skip=True;continue
 if a in ('-MMD','-c') or a.endswith('/blanc_prototype_ui.cc'):continue
 clean.append(a)
source=stage/'context_link_origin.cc';cmd=[args[0],'-I',str(stage),'-I',str(src/'chrome/browser/ui'),*clean,'-fsyntax-only',str(source)]
r=subprocess.run(cmd,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace');log.write_text(r.stdout);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();receipt.write_text(json.dumps({'scope':'syntax-only context menu origin guard using SDK27.2 pinned build flags and isolated includes; not GN, link, runtime or privacy proof','sourceSha256':sha(source),'exit':r.returncode,'logSha256':sha(log)},indent=2)+'\n');print('syntax exit',r.returncode);print(r.stdout[-5000:]);raise SystemExit(r.returncode)
