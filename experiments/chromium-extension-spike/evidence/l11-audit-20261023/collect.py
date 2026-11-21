import subprocess,json,pathlib,datetime
root=pathlib.Path('/private/tmp/blanc-l11-20261023');root.mkdir(exist_ok=True)
gh='/opt/homebrew/bin/gh';base='repos/bnfy/blanc';calls=[]
def one(endpoint):
 p=subprocess.run([gh,'api',endpoint],capture_output=True,text=True);calls.append({'endpoint':endpoint,'exitCode':p.returncode})
 if p.returncode:raise RuntimeError(p.stderr.strip())
 return json.loads(p.stdout)
def pages(endpoint,key=None):
 result=[];page=1
 while True:
  d=one(endpoint+('&' if '?' in endpoint else '?')+'per_page=100&page='+str(page));rows=d[key] if key else d;result.extend(rows)
  if len(rows)<100:break
  page+=1
 return result
p=one(base+'/pulls/1028');sha=p['head']['sha'];r={'collectedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pr':p,'head':sha}
for name,url,key in [('checks',f'{base}/commits/{sha}/check-runs?filter=latest','check_runs'),('statuses',f'{base}/commits/{sha}/statuses',None),('reviews',base+'/pulls/1028/reviews',None),('runs',f'{base}/actions/runs?head_sha={sha}','workflow_runs')]:
 try:r[name]=pages(url,key)
 except Exception as e:r[name+'Error']=str(e)
for name,url in [('codeScanningAlerts',base+'/code-scanning/alerts?state=open&ref='+p['head']['ref']),('codeScanningAnalyses',base+'/code-scanning/analyses?ref='+p['head']['ref'])]:
 try:r[name]=pages(url)
 except Exception as e:r[name+'Error']=str(e)
r['calls']=calls;(root/'snapshot.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({'head':sha,'base':p['base']['ref'],'draft':p['draft'],'state':p['state'],'checks':[{k:c.get(k) for k in ['id','name','status','conclusion','details_url']} for c in r.get('checks',[])],'statuses':r.get('statuses',[]),'runs':[{k:c.get(k) for k in ['id','name','status','conclusion']} for c in r.get('runs',[])],'errors':{k:v for k,v in r.items() if k.endswith('Error')},'alerts':len(r.get('codeScanningAlerts',[]))},indent=2))
