#!/usr/bin/env python3
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parent;n=p.parent;out=p/'guard-test-v4';log=p/'guard-test-v4.log';receipt=p/'guard-test-v4-result.json'
if out.exists() or log.exists() or receipt.exists():raise SystemExit('existing evidence preserved')
compiler=Path('<local-home>/Projects/BlancChromium158/src/third_party/llvm-build/Release+Asserts/bin/clang++');sdk='/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX27.2.sdk'
cmd=[str(compiler),'-std=c++20','-isysroot',sdk,'-stdlib=libc++','-Wall','-Wextra','-Werror','-I'+str(p/'include'),'-I'+str(n),str(n/'reader_extraction_guard.cc'),str(p/'guard_test.cc'),'-o',str(out)]
build=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace');run=subprocess.run([str(out)],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace') if build.returncode==0 else None
log.write_text(build.stdout+(run.stdout if run else ''));sha=lambda x:hashlib.sha256(x.read_bytes()).hexdigest()
receipt.write_text(json.dumps({'compileExit':build.returncode,'runExit':run.returncode if run else None,'scope':'standalone exact guard compiled with fake Chromium APIs, fake URL parsing and fake hash; not real Chromium integration, URL or crypto proof','headerSha256':sha(n/'reader_extraction_guard.h'),'sourceSha256':sha(n/'reader_extraction_guard.cc'),'testSha256':sha(p/'guard_test.cc'),'fakeSha256':sha(p/'include/fake_common.h'),'logSha256':sha(log)},indent=2)+'\n');print(json.dumps({'compileExit':build.returncode,'runExit':run.returncode if run else None,'log':str(log)}));raise SystemExit(0 if run and run.returncode==0 else 1)
