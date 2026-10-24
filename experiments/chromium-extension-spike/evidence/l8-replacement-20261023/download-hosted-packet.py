from pathlib import Path
import urllib.request,urllib.error,urllib.parse,subprocess,json,hashlib
r=Path(__file__).parent;d=json.loads((r/'draft-uploaded.json').read_text());out=r/'fresh-hosted-download';out.mkdir(exist_ok=False)
token=subprocess.check_output(['/opt/homebrew/bin/gh','auth','token'],text=True).strip()
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None
opener=urllib.request.build_opener(NoRedirect());rows=[]
for a in d['assets']:
 req=urllib.request.Request(a['url'],headers={'Authorization':'Bearer '+token,'Accept':'application/octet-stream','X-GitHub-Api-Version':'2022-11-28'})
 try:
  with opener.open(req,timeout=30):raise RuntimeError('Expected signed HTTPS redirect')
 except urllib.error.HTTPError as e:
  assert e.code==302,e.code;location=e.headers['Location']
 u=urllib.parse.urlsplit(location);assert u.scheme=='https' and u.hostname=='release-assets.githubusercontent.com'
 h=hashlib.sha256();size=0;p=out/a['name']
 with urllib.request.urlopen(location,timeout=90) as response,p.open('xb') as dest:
  assert response.status==200
  while True:
   b=response.read(1024*1024)
   if not b:break
   dest.write(b);h.update(b);size+=len(b)
 assert size==a['size'] and 'sha256:'+h.hexdigest()==a['digest'],a['name']
 rows.append({'name':a['name'],'bytes':size,'sha256':h.hexdigest(),'anonymousAssetGET':200,'assetHost':u.hostname,'accountAuthorizationForwarded':False})
(r/'fresh-hosted-byte-verification.json').write_text(json.dumps(rows,indent=2)+'\n')
p=subprocess.run(['python3','/private/tmp/blanc-l6-restore-final/verify_artifacts.py','--directory',str(out),'--version','157.0.8103.15','--source','6b9a05a00f321bfbde617c181103d5a455ff45f3','--cosign','/opt/homebrew/bin/cosign'],capture_output=True,text=True,check=True)
(r/'fresh-hosted-manifest-verification.json').write_text(p.stdout);(r/'fresh-hosted-manifest-verification.log').write_text(p.stderr)
print('All six fresh anonymous HTTPS downloads match; pinned identity/source/artifact verification passes')
