#!/usr/bin/env python3
"""Build only two standalone test units against preserved Chromium artifacts."""
from pathlib import Path
import json,subprocess,hashlib
root=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview'); ev=root/'evidence/context-glance-policy-run-20261030'; ev.mkdir(exist_ok=False)
src=Path('<local-home>/Projects/BlancChromium158/src'); frozen=root/'workspaces/Chromium158-combined-copy-20261029/src';out=frozen/'out/BlancPrototype';draft=root/'repo/experiments/chromium-extension-spike/context-menu-glance-draft'
if (ev/'v12-result.json').exists():raise SystemExit('existing evidence preserved')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
compile_base=json.loads((root/'evidence/native-sync-v8-model-20261030/compile-model-v5-result.json').read_text())['argv'];link_base=json.loads((root/'evidence/native-sync-v8-model-20261030/link-lld-result.json').read_text())['argv'];
oldout=str(src/'out/BlancPrototype')+'/';newout=str(out)+'/';oldsrc=str(src)+'/';newsrc=str(frozen)+'/'
def repl(x):
 if x.startswith(oldout):return newout+x[len(oldout):]
 if x.startswith(oldsrc) and x!=compile_base[0]:return newsrc+x[len(oldsrc):]
 return x
# Exact prior cached compile environment, except input/output and frozen roots.
assert compile_base[-4]=='-c' and compile_base[-2]=='-o'
flags=[repl(x) for x in compile_base[:-4]];objs=[];logs=[];compiles=[]
for name in ('context_link_policy.cc','policy_probe.cc'):
 obj=ev/(name+'.v12.o');cmd=flags+['-I',str(draft),'-c',str(draft/name),'-o',str(obj)];r=subprocess.run(cmd,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace');logs.append('COMPILE '+name+'\n'+r.stdout);compiles.append({'source':name,'exit':r.returncode,'sha256':sha(draft/name)});objs.append(obj)
 if r.returncode:break
result={'status':'failed','scope':'standalone three-unit native test against preserved 158 cached Chromium objects and old matching SDK; not active build or browser','compiles':compiles,'frozenOutput':str(out),'sdk':flags[flags.index('-isysroot')+1],'sourceSha256':sha(draft/'context_link_policy.cc'),'testSha256':sha(draft/'policy_probe.cc')}
if all(x['exit']==0 for x in compiles) and len(compiles)==2:
 link=[repl(x) for x in link_base];oi=link.index('-o');link[oi+1]=str(ev/'bang-prefs-v12');oldprobe=str(root/'evidence/native-sync-v8-model-20261030/json_probe.cc.o');assert link.count(oldprobe)==1;idx=link.index(oldprobe);link[idx:idx+1]=[str(x) for x in objs];r=subprocess.run(link,cwd=out,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace');logs.append('LINK\n'+r.stdout);result['linkExit']=r.returncode
 if r.returncode==0:
  result['status']='built'; result['binary']=str(ev/'bang-prefs-v12')
(ev/'v12.log').write_text('\n'.join(logs));result['logSha256']=sha(ev/'v12.log');(ev/'v12-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(0 if result['status']=='built' else 1)
