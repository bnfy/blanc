#!/usr/bin/env python3
"""Bind the isolated syntax result without changing any input or checkout."""
import hashlib,json,os,subprocess
from pathlib import Path
H=Path(__file__).resolve().parent;S=H/'syntax-combined-20261029-v2';SRC=Path('<local-home>/Projects/BlancChromium158/src');GROUP=H.parent;SPIKE=GROUP.parents[1];PREVIEW=SPIKE.parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(p,expected):
 if sha(p)!=expected:raise ValueError('identity drift: '+p.name)
 return expected
def output(args,env):return subprocess.check_output(args,env=env,text=True,timeout=15).strip()
def build():
 prior=H/'combined-manifest-v2.json';result=S/'result.json';plan=S/'plan.json';log=S/'syntax.log';runner=H/'syntax-check-combined.py'
 check(prior,'d6c08f1e3ba217024bf12abb57e66a9bb66c0a39b052418c71a06c917040a942');check(result,'161437118f0dafe95f000a9b3cb32632a2909f4fadb4fe2e9d9ef08b33db1281');check(plan,'eeb7e0b543ee8ac8c601833b4dd4807f207d3db81dc190979a39d7641e25b4d5');check(log,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');check(runner,'3ef8d8bf2f9bb8fde76e7df1138d3eeb74ea5a6202edf0f3c79c6d4503d5b464')
 d=json.loads(prior.read_text());r=json.loads(result.read_text())
 if r.get('status')!='passed' or r.get('exitCode')!=0 or r.get('inputsUnchanged') is not True or r['candidateSha256']!=d['combined_native_sha256'] or r['moduleSha256']!=d['module_sha256']:raise ValueError('syntax result does not bind combined candidate')
 compiler=SRC/'third_party/llvm-build/Release+Asserts/bin/clang++';check(compiler,r['compilerSha256'])
 env=os.environ.copy();env['DEVELOPER_DIR']='/Applications/Xcode.app/Contents/Developer'
 clang=output([str(compiler),'--version'],env);sdk=output(['/usr/bin/xcrun','--sdk','macosx','--show-sdk-version'],env);sdk_build=output(['/usr/bin/xcrun','--sdk','macosx','--show-sdk-build-version'],env);xcode=output(['/usr/bin/xcodebuild','-version'],env)
 recorded=json.loads((PREVIEW/'evidence/start-page-groups-20261029/build-closure1/receipt.json').read_text())['environment']
 if clang!=recorded['clangVersion'] or sdk!=recorded['sdkVersion'] or sdk_build!=recorded['sdkBuild'] or xcode!=recorded['xcode']:raise ValueError('toolchain post-check mismatch')
 d.update({'previous_combined_manifest_v2_sha256':sha(prior),'syntax_result_sha256':sha(result),'syntax_plan_sha256':sha(plan),'syntax_log_sha256':sha(log),'syntax_runner_sha256':sha(runner),'syntax_binding_generator_sha256':sha(Path(__file__)),'syntax_check':{'status':'passed','exit_code':0,'inputs_unchanged':True,'compiler_sha256':r['compilerSha256'],'args_sha256':r['argsSha256'],'flags_sha256':r['flagsSha256'],'pcm_sha256':r['pcmSha256'],'direct_includes_sha256':r['directIncludesSha256'],'sdk_real_path':r['sdkRealPath'],'post_check':{'clang':clang,'sdk_version':sdk,'sdk_build':sdk_build,'xcode':xcode},'note':'isolated syntax-only; no GN graph, object, link, runtime, profile or signed-candidate qualification'}})
 return d
if __name__=='__main__':
 data=(json.dumps(build(),indent=2,sort_keys=True)+'\n').encode();p=H/'combined-manifest-v3.json'
 if p.is_symlink():raise SystemExit('refusing symlink')
 if p.exists():
  if p.read_bytes()!=data:raise SystemExit('refusing overwrite')
 else:
  with p.open('xb') as f:f.write(data)
 print('bound isolated syntax result')
