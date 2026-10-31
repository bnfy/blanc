from pathlib import Path
import json,subprocess
root=Path(__file__).resolve().parent;flow=root.parents[3]/'evidence/search-shipping-flow-20261029/run4';commands=json.loads((flow/'commands.json').read_text());records=[]
for source in ('fresh_profile_proof.cc','fresh_profile_proof_test.cc'):
 a=next(x['argv'] for x in commands if x['label']=='selected_shipping_check.cc-compile').copy();a[a.index('-c')+1]=str(root/source);a[a.index('-o')+1]=str(root/(source+'.o'));a+=['-I',str(root)]
 p=subprocess.run(a,cwd=root,text=True,capture_output=True);(root/(source+'-compile.log')).write_text(p.stdout+p.stderr);records.append({'label':source,'argv':a,'cwd':str(root),'exit':p.returncode});(root/'proof-test-commands.json').write_text(json.dumps(records,indent=2)+'\n');print(source,p.returncode,flush=True)
 if p.returncode: print((p.stdout+p.stderr)[-2000:]);raise SystemExit(1)
a=next(x['argv'] for x in commands if x['label']=='link').copy();a=[str(root/'fresh_profile_proof_test.cc.o') if x==str(flow/'selected_shipping_check.cc.o') else x for x in a];a.insert(a.index('-o'),str(root/'fresh_profile_proof.cc.o'));a[a.index('-o')+1]=str(root/'fresh_profile_proof_test');cwd='<local-home>/Projects/BlancChromium158/src/out/BlancPrototype';p=subprocess.run(a,cwd=cwd,text=True,capture_output=True);(root/'proof-link.log').write_text(p.stdout+p.stderr);records.append({'label':'link','argv':a,'cwd':cwd,'exit':p.returncode});(root/'proof-test-commands.json').write_text(json.dumps(records,indent=2)+'\n');print('link',p.returncode,flush=True)
if p.returncode:print((p.stdout+p.stderr)[-2000:]);raise SystemExit(1)
p=subprocess.run([str(root/'fresh_profile_proof_test')],cwd=root,text=True,capture_output=True);(root/'fresh-profile-proof-test.log').write_text(p.stdout+p.stderr);print(p.stdout,end='');raise SystemExit(p.returncode)
