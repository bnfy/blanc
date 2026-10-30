from pathlib import Path
import json,subprocess
root=Path(__file__).resolve().parent
flow=root.parents[3]/'evidence/search-shipping-flow-20261029/run4'
commands=json.loads((flow/'commands.json').read_text()); result=[]
for label in ('selected_shipping_check.cc-compile','link'):
 a=next(x['argv'] for x in commands if x['label']==label).copy()
 if label.endswith('compile'):
  a[a.index('-c')+1]=str(root/'fresh_default_policy_test.cc');a[a.index('-o')+1]=str(root/'fresh_default_policy_test.o');a+=['-I',str(root)]
 else:
  a=[str(root/'fresh_default_policy_test.o') if x==str(flow/'selected_shipping_check.cc.o') else x for x in a];a[a.index('-o')+1]=str(root/'fresh_default_policy_test')
 cwd='<local-home>/Projects/BlancChromium158/src/out/BlancPrototype' if label=='link' else str(root)
 p=subprocess.run(a,cwd=cwd,text=True,capture_output=True);(root/(label+'.log')).write_text(p.stdout+p.stderr);result.append({'label':label,'argv':a,'cwd':cwd,'exit':p.returncode});(root/'policy-test-commands.json').write_text(json.dumps(result,indent=2)+'\n');print(label,p.returncode,flush=True)
 if p.returncode: print((p.stdout+p.stderr)[-2000:]);raise SystemExit(1)
p=subprocess.run([str(root/'fresh_default_policy_test')],cwd=root,text=True,capture_output=True);(root/'fresh-default-policy-test.log').write_text(p.stdout+p.stderr);print(p.stdout,end='');raise SystemExit(p.returncode)
