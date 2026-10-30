from pathlib import Path
import json,shlex,subprocess,hashlib
root=Path(__file__).resolve().parent
source=Path('<local-home>/Projects/BlancChromium158/src')
out=source/'out/BlancPrototype'
flow=Path('<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview/evidence/search-shipping-flow-20261029/run4')
log=(root.parent/'build-158.log').read_text()
line=next(l for l in log.splitlines() if l.startswith('../../third_party/llvm-build/Release+Asserts/bin/clang++ '))
a=shlex.split(line)
# Keep all build flags/plugins; compile syntax only against the isolated translation unit.
i=a.index('-MF'); del a[i:i+2]
a.remove('-MMD')
i=a.index('-o'); del a[i:i+2]
a[a.index('../../chrome/browser/ui/blanc_prototype_ui.cc')]=str(root/'blanc_prototype_ui.cc')
a.remove('-c');a+=['-fsyntax-only','-I',str(source/'chrome/browser/ui')]
commands=[('chromium-syntax',a,out)]
ref=json.loads((flow/'commands.json').read_text())
for label in ['custom_template.cc-compile','link']:
 c=next(x['argv'] for x in ref if x['label']==label).copy()
 if label=='custom_template.cc-compile':
  idx=c.index('-c'); c[idx+1]=str(root/'modules/custom_template.cc');c[c.index('-o')+1]=str(root/'custom_template.o')
 else:
  for idx,x in enumerate(c):
   if x==str(flow/'custom_template.cc.o'): c[idx]=str(root/'custom_template.o')
  c[c.index('-o')+1]=str(root/'selected-shipping-check')
 commands.append((label,c,out if label=='link' else source))
commands.append(('run',[str(root/'selected-shipping-check')],source))
receipt=[]
for label,args,cwd in commands:
 p=subprocess.run(args,cwd=cwd,text=True,capture_output=True)
 (root/(label+'.log')).write_text(p.stdout+p.stderr)
 receipt.append({'label':label,'argv':args,'cwd':str(cwd),'exit':p.returncode})
 (root/'commands.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(label,p.returncode,flush=True)
 if p.returncode: print((p.stdout+p.stderr)[-5000:],flush=True);break
