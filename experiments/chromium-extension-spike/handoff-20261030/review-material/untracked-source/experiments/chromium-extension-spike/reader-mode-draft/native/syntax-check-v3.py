#!/usr/bin/env python3
"""Compile only the draft header for syntax with the existing pinned flags.
No object, dependency file, module cache, or active-source/output edit is made.
A disposable include overlay reserves the Reader world for this check only.
"""
import hashlib,json,shlex,subprocess,tempfile
from pathlib import Path
root=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview')
draft=root/'repo/experiments/chromium-extension-spike/reader-mode-draft/native'
src=Path('<local-home>/Projects/BlancChromium158/src')
out=src/'out/BlancPrototype';plan=root/'evidence/zoom-integration-20261030/sdk27.2-guarded-plan.log';guard=draft/'reader_extraction_guard.h';receipt=draft/'syntax-check-v3-result.json';log=draft/'syntax-check-v3.log'
if receipt.exists() or log.exists():raise SystemExit('existing check evidence preserved')
with plan.open(errors='replace') as f:
    command=next((line for line in f if 'blanc_prototype_ui.cc' in line and 'clang++' in line),None)
if not command:raise SystemExit('pinned command unavailable')
args=shlex.split(command);clean=[];skip=False
for a in args[1:]:
    if skip:skip=False;continue
    if a in ('-MF','-o'):skip=True;continue
    if a in ('-MMD','-c') or a.endswith('/blanc_prototype_ui.cc'):continue
    clean.append(a)
with tempfile.TemporaryDirectory(prefix='blanc-reader-syntax-') as temp:
    overlay=Path(temp); header=overlay/'chrome/common/chrome_isolated_world_ids.h';header.parent.mkdir(parents=True);data=(src/'chrome/common/chrome_isolated_world_ids.h').read_text();needle='  ISOLATED_WORLD_ID_EXTENSIONS\n';assert data.count(needle)==1;header.write_text(data.replace(needle,'  ISOLATED_WORLD_ID_BLANC_READER,\n'+needle));unit=draft/'reader_extraction_guard.cc'
    cmd=[args[0],'-I'+str(overlay),*clean,'-fsyntax-only',str(unit)]
    result=subprocess.run(cmd,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace')
    log.write_text(result.stdout)
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    receipt.write_text(json.dumps({'exit':result.returncode,'scope':'one syntax-only compiler invocation; existing SDK/compiler/flags; temporary enum overlay; no native build or linking','guardSha256':sha(guard),'overlayHeaderSha256':sha(header),'logSha256':sha(log)},indent=2)+'\n')
    print(json.dumps({'exit':result.returncode,'log':str(log),'receipt':str(receipt)}))
    raise SystemExit(result.returncode)
