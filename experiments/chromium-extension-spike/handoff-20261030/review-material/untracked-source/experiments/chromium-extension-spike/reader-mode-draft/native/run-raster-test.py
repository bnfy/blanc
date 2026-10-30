#!/usr/bin/env python3
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parent;binary=p/'reader-raster-test';log=p/'reader-raster-test.log';receipt=p/'reader-raster-test-result.json'
if any(x.exists() for x in (binary,log,receipt)):raise SystemExit('existing results preserved')
compiler='<local-home>/Projects/BlancChromium158/src/third_party/llvm-build/Release+Asserts/bin/clang++';sdk='/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX27.2.sdk'
cmd=[compiler,'-std=c++20','-isysroot',sdk,'-stdlib=libc++','-Wall','-Wextra','-Werror',str(p/'reader_raster.cc'),str(p/'reader_raster_test.cc'),'-o',str(binary)]
build=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace');run=subprocess.run([str(binary)],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace') if build.returncode==0 else None
log.write_text(build.stdout+(run.stdout if run else ''));sha=lambda x:hashlib.sha256(x.read_bytes()).hexdigest();receipt.write_text(json.dumps({'compileExit':build.returncode,'runExit':run.returncode if run else None,'scope':'standalone native parser tests; no decoder, network, blocker or browser integration','headerSha256':sha(p/'reader_raster.h'),'sourceSha256':sha(p/'reader_raster.cc'),'testSha256':sha(p/'reader_raster_test.cc'),'logSha256':sha(log)},indent=2)+'\n');print(json.dumps({'compileExit':build.returncode,'runExit':run.returncode if run else None}));raise SystemExit(0 if run and run.returncode==0 else 1)
