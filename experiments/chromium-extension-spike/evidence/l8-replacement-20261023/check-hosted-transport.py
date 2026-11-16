import urllib.request,urllib.error,urllib.parse,subprocess,json,hashlib,pathlib,os
root=pathlib.Path('/private/tmp/blanc-l8-replacement-6b9a05a0');artifacts=pathlib.Path('/private/tmp/blanc-l6-restore-final/artifacts');d=json.loads((root/'draft-uploaded.json').read_text());token=subprocess.check_output(['/opt/homebrew/bin/gh','auth','token'],text=True).strip()
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None
opener=urllib.request.build_opener(NoRedirect());rows=[]
for asset in d['assets']:
 if asset['name'] not in ['SHA256SUMS',next(a['name'] for a in d['assets'] if a['name'].endswith('.zip'))]:continue
 req=urllib.request.Request(asset['url'],headers={'Authorization':'Bearer '+token,'Accept':'application/octet-stream','X-GitHub-Api-Version':'2022-11-28'})
 try:
  with opener.open(req,timeout=30) as response: raise RuntimeError('Expected signed download redirect')
 except urllib.error.HTTPError as e:
  assert e.code==302,e.code;location=e.headers['Location']
 u=urllib.parse.urlparse(location);assert u.scheme=='https' and u.hostname=='release-assets.githubusercontent.com',u.hostname
 method='HEAD' if asset['name'].endswith('.zip') else 'GET'
 with urllib.request.urlopen(urllib.request.Request(location,method=method),timeout=30) as response:
  row={'name':asset['name'],'apiStatus':302,'anonymousMethod':method,'anonymousStatus':response.status,'host':u.hostname,'authenticatedHeadersSentToAssetHost':False,'contentLength':response.headers.get('Content-Length')}
  if method=='GET':
   payload=response.read();row['sha256']=hashlib.sha256(payload).hexdigest();assert row['sha256']==hashlib.sha256((artifacts/asset['name']).read_bytes()).hexdigest()
 rows.append(row)
(root/'hosted-transport.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows))
