import subprocess,json,pathlib
r=pathlib.Path('/private/tmp/blanc-l11-20261023');out={}
for key,url in [('analyses','repos/bnfy/blanc/code-scanning/analyses?ref=refs%2Fpull%2F1028%2Fmerge&per_page=100'),('alerts','repos/bnfy/blanc/code-scanning/alerts?ref=refs%2Fpull%2F1028%2Fmerge&state=open&per_page=100'),('annotations','repos/bnfy/blanc/check-runs/120706267735/annotations?per_page=100')]:
 pages=[];page=1
 while True:
  p=subprocess.run(['/opt/homebrew/bin/gh','api',url+'&page='+str(page)],capture_output=True,text=True)
  if p.returncode:out[key+'Error']=p.stderr;break
  data=json.loads(p.stdout);pages+=data
  if len(data)<100:break
  page+=1
 out[key]=pages
(r/'security-context.json').write_text(json.dumps(out,indent=2)+'\n')
print({k:len(v) for k,v in out.items()})
