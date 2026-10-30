#!/usr/bin/env python3
"""One guarded clang -fsyntax-only invocation; no GN/build/staging operations."""
import hashlib,json,os,subprocess
from pathlib import Path
H=Path(__file__).resolve().parent;G=H.parent;SPIKE=G.parents[1];SRC=Path('<local-home>/Projects/BlancChromium158/src');OUT=SRC/'out/BlancPrototype';EVID=H/'syntax-combined-20261029-v2'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(p,h):
 if sha(p)!=h:raise ValueError('input identity mismatch: '+p.name)
def write(p,v):
 with p.open('x') as f:json.dump(v,f,indent=2,sort_keys=True);f.write('\n')
def main():
 EVID.mkdir(mode=0o700) # preserve any earlier attempt, never overwrite
 result={'status':'preparing','scope':'isolated syntax-only; not a GN graph, native object build or runtime qualification'}
 try:
  combined=json.loads((H/'combined-manifest-v2.json').read_text());plan=json.loads((H/'integration-plan.json').read_text());original=json.loads((G/'syntax-command.json').read_text())
  check(H/'combined-manifest-v2.json','d6c08f1e3ba217024bf12abb57e66a9bb66c0a39b052418c71a06c917040a942')
  check(H/'integration-plan.json','2c9275f5416874025bae5cef58268d66c3b1751b4f2e489be71bc902bcb1a739')
  check(OUT/'args.gn','414e3baad6c84730b3c17f411ed82c5065561ba344fe2a202675654e1e18a057')
  check(OUT/'obj/chrome/browser/ui/views/frame/browser_view.ninja','e067241b3316864297ef96784a828d20c5427d20a447821381e2f5fb013b5d11')
  if original['argsSha256']!='414e3baad6c84730b3c17f411ed82c5065561ba344fe2a202675654e1e18a057' or original['flagsSha256']!='e067241b3316864297ef96784a828d20c5427d20a447821381e2f5fb013b5d11':raise ValueError('recorded flags mismatch')
  if original['cwd']!=str(OUT) or original['argv'][-2]!='-fsyntax-only' or original['argv'][0]!=str(SRC/'third_party/llvm-build/Release+Asserts/bin/clang++'):raise ValueError('unsafe or unexpected syntax command')
  source=H/'combined-native-v1/chrome/browser/ui/blanc_prototype_ui.cc';check(source,combined['combined_native_sha256'])
  modules={}
  for name,want in combined['module_sha256'].items():
   p=source.parent/'modules'/name;check(p,want);modules[name]=sha(p)
  includes={}
  for name in ('blanc_prototype_ui.h','billboard_clock_settings.inc','start_page_pins.inc','start_page_pin_menu.inc','blocking_settings_handler.inc'):
   p=SRC/'chrome/browser/ui'/name;includes[name]=sha(p)
  paths=[OUT/'args.gn',OUT/'obj/chrome/browser/ui/views/frame/browser_view.ninja',OUT/'obj/build/modules/system/module.pcm',source,*[source.parent/'modules'/n for n in modules],*[SRC/'chrome/browser/ui'/n for n in includes]]
  before={str(p):sha(p) for p in paths}
  cmd=[*original['argv'][:-1],str(source)]
  if any(x in ('-o','-MF','-MMD','-c') for x in cmd) or cmd.count('-fsyntax-only')!=1 or '-fno-implicit-modules' not in cmd:raise ValueError('unexpected write-capable compiler flags')
  sdk=(OUT/'sdk/xcode_links/MacOSX27.0.sdk').resolve()
  if sdk!=Path('/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX27.0.sdk').resolve():raise ValueError('SDK symlink drift')
  env=os.environ.copy();env['DEVELOPER_DIR']='/Applications/Xcode.app/Contents/Developer';env['TMPDIR']=str(EVID)
  result.update({'status':'running','argv':cmd,'cwd':str(OUT),'candidateSha256':sha(source),'moduleSha256':modules,'directIncludesSha256':includes,'compilerSha256':sha(Path(cmd[0])),'pcmSha256':before[str(OUT/'obj/build/modules/system/module.pcm')],'argsSha256':sha(OUT/'args.gn'),'flagsSha256':sha(OUT/'obj/chrome/browser/ui/views/frame/browser_view.ninja'),'gnPreimageSha256':plan['gn_reference']['preimage_sha256'],'gnCandidateSha256':plan['gn_reference']['candidate_sha256'],'combinedManifestSha256':sha(H/'combined-manifest-v2.json'),'sdkRealPath':str(sdk),'before':before})
  write(EVID/'plan.json',result)
  run=subprocess.run(cmd,cwd=OUT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
  with (EVID/'syntax.log').open('xb') as f:f.write(run.stdout)
  after={str(p):sha(p) for p in paths};result['exitCode']=run.returncode;result['after']=after;result['inputsUnchanged']=before==after;result['logSha256']=sha(EVID/'syntax.log')
  result['status']='passed' if run.returncode==0 and result['inputsUnchanged'] else 'failed'
 except Exception as e:
  result['status']='failed';result['errorType']=type(e).__name__;result['errorReason']=str(e) if isinstance(e,ValueError) else 'syntax runner unavailable'
 write(EVID/'result.json',result)
 print(json.dumps({'status':result['status'],'exitCode':result.get('exitCode'),'inputsUnchanged':result.get('inputsUnchanged'),'errorType':result.get('errorType')}))
 return 0 if result['status']=='passed' else 1
if __name__=='__main__':raise SystemExit(main())
