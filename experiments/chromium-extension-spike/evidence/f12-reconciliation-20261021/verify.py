from pathlib import Path
import json,hashlib,tarfile
b=Path(__file__).resolve().parent.parent;out=[]
for n in ['f12-paths-latency-20261017','f12-worker-ownership-20261017','f12-shared-lifecycle-20261017','f12-service-context-20261017','f12-service-loader-20261017','f12-service-update-20261017','f12-native-recovery-20261018','f12-renderer-target-20261018']:
 d=b/n;j=json.loads((d/'inventory.json').read_text());a=j.get('archives',j);spec=[]
 if 'archiveSha256' in j:spec=[('record.tar.gz',{'sha256':j['archiveSha256'],'files':[dict(path=k,**v) for k,v in j['members'].items()]})]
 elif isinstance(a,list):spec=[(v['file'],dict(v,files=v.get('entries',[]))) for v in a]
 else:spec=[(k if k.endswith('.tar.gz') else k+'.tar.gz',v) for k,v in a.items() if isinstance(v,dict) and 'sha256'in v]
 for name,v in spec:
  p=d/name
  if not p.exists():
   candidates=[x for x in d.glob('*.tar.gz') if hashlib.sha256(x.read_bytes()).hexdigest()==v['sha256']]
   assert len(candidates)==1,(n,name);p=candidates[0]
  assert hashlib.sha256(p.read_bytes()).hexdigest()==v['sha256'],str(p)
  count=0
  with tarfile.open(p) as t:
   members={m.name.removeprefix('./'):m for m in t.getmembers() if m.isfile()}
   for f in v.get('files',[]):
    key=f['path'].removeprefix('./');matches=[m for k,m in members.items() if k==key or k.endswith('/'+key)]
    assert len(matches)==1,(n,name,key)
    data=t.extractfile(matches[0]).read();assert hashlib.sha256(data).hexdigest()==f['sha256'],key
    if 'bytes'in f:assert len(data)==f['bytes'],key
    count+=1
  out.append({'directory':n,'archive':p.name,'sha256':v['sha256'],'verifiedMembers':count})
(b/'f12-reconciliation-20261021/verification.json').write_text(json.dumps(out,indent=2)+'\n');print(len(out),'archives',sum(x['verifiedMembers'] for x in out),'members verified')
