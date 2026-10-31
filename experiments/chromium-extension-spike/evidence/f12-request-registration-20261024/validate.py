from pathlib import Path
import json,hashlib
r=Path(__file__).parent;d=json.loads((r/'report.json').read_text());assert d['complete'] and len(d['checks'])==13 and all(c['pass'] for c in d['checks'])
assert {x['mode'] for x in d['runs']}=={'regular','private'}
for row in d['runs']:
 req=[x['args'] for x in row['attribution'] if x['name']=='Blanc.ServiceWorkerUpdateRequest'];dec=[x['args'] for x in row['attribution'] if x['name']=='Blanc.BlockerDecision']
 assert len(req)==len(dec)==2 and len({x['request_token'] for x in req})==2
 assert all(sum(y['request_token']==x['request_token'] and y['result']==0 for y in dec)==1 for x in req)
 assert all(any(str(x['registration_id'])==v['registrationId'] and str(x['version_id'])==v['versionId'] for v in row['beforeVersions']) for x in req)
 assert all(x['private']==(row['mode']=='private') for x in req) and row['offTrace']==[] and row['exit']['code']==0
 assert all(set(x)<= {'request_token','registration_id','version_id','private','result'} for x in req+dec)
assert all(x['removed'] for x in json.loads((r/'cleanup.json').read_text())['profiles'])
for line in (r/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
print('Four independent request/registration/decision joins and13assertions verified')
