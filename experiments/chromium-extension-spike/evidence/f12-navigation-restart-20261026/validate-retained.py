from pathlib import Path
import json,hashlib,copy
r=Path(__file__).parent;x=json.loads((r/'first/report.json').read_text());checks=[]
def valid(c,private):
 d=c['decisions'];ids={q['networkId'] for q in c['interceptions'] if q['networkId']};hashes={hashlib.sha256(i.encode()).hexdigest().upper() for i in ids};return len(d)==3 and [e['args']['redirect_index'] for e in d]==[0,1,0] and [e['args']['result'] for e in d]==[0,0,1 if c['kind']=='sub-block' else 0] and all(e['args']['private']==private and e['args']['request_digest'] in hashes for e in d)
for run in x['runs']:
 for c in run['cases']:checks.append({'name':run['mode']+'/'+c['kind']+': three-stage native restart attribution','pass':valid(c,run['mode']=='private')})
c=x['runs'][0]['cases'][0]
for name,mutate in [('missing restarted decision',lambda d:d['decisions'].pop()),('wrong request identity',lambda d:d['decisions'][-1]['args'].update(request_digest='0'*64)),('wrong profile',lambda d:d['decisions'][-1]['args'].update(private=True)),('wrong hop reset',lambda d:d['decisions'][-1]['args'].update(redirect_index=2))]:
 d=copy.deepcopy(c);mutate(d);checks.append({'name':'negative control: '+name,'pass':not valid(d,False)})
assert all(c['pass'] for c in checks)
(r/'retained-validation.json').write_text(json.dumps({'sourceReportSha256':hashlib.sha256((r/'first/report.json').read_bytes()).hexdigest(),'scope':'Offline correction only; no browser rerun. Initial, checked redirect, replacement restart have indices0,1,0. Original six wrong-count failures retained; actual four main-frame failures remain.','checks':checks},indent=2)+'\n')
print('Six retained attribution validations plus four new negative controls pass; four real main-frame failures remain')
