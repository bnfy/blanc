#!/usr/bin/env python3
import hashlib,json,shlex,subprocess
from pathlib import Path
root=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview');draft=root/'repo/experiments/chromium-extension-spike/bangs-parity-draft/native';src=Path('<local-home>/Projects/BlancChromium158/src');out=src/'out/BlancPrototype';plan=root/'evidence/zoom-integration-20261030/sdk27.2-guarded-plan.log';receipt=draft/'custom-syntax-result.json';log=draft/'custom-syntax.log'
if receipt.exists() or log.exists():raise SystemExit('existing evidence preserved')
with plan.open(errors='replace') as f: command=next((x for x in f if 'blanc_prototype_ui.cc' in x and 'clang++' in x),None)
if not command:raise SystemExit('compiler command missing')
args=shlex.split(command);clean=[];skip=False
for a in args[1:]:
 if skip:skip=False;continue
 if a in ('-MF','-o'):skip=True;continue
 if a in ('-MMD','-c') or a.endswith('/blanc_prototype_ui.cc'):continue
 clean.append(a)
cmd=[args[0],*clean,'-fsyntax-only',str(draft/'bang_custom.cc')];r=subprocess.run(cmd,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace');log.write_text(r.stdout);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();receipt.write_text(json.dumps({'exit':r.returncode,'scope':'syntax-only compilation against existing Chromium headers and pinned flags; no linking, real JSON parse or product integration','sourceSha256':sha(draft/'bang_custom.cc'),'headerSha256':sha(draft/'bang_custom.h'),'logSha256':sha(log)},indent=2)+'\n');print(json.dumps({'exit':r.returncode,'log':str(log)}));raise SystemExit(r.returncode)
