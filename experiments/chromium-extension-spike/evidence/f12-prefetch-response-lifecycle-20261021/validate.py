import json
from pathlib import Path
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert {(s['kind'],s['mode']) for s in r['schedules']}=={(k,m) for k in ['regular','private'] for m in ['timeout','tab-close']}
for s in r['schedules']:
 assert s['passed'] and s['profileRemoved'] and not s.get('error')
 assert not s['pending']['settled'] and not s['pending']['decisions']
 assert s['navigation']['error'] and 'Timeout 45000' not in s['navigation']['error']
 assert len(s['arrivalsAfterConsumption'])==1
 assert s['arrivalsAfterConsumption'][0]['headers']['sec-purpose']=='prefetch'
 ds=[d for d in s['afterResume'] if d.get('event')=='navigation-response-decision' and d.get('url')==s['urls'][0]]
 assert len(ds)==(1 if s['mode']=='timeout' else 0)
 if ds:assert ds[0]['engine_result']==-1 and ds[0]['decision']=='block'
 assert s['freshNavigationPassed']
print('Four bounded timeout/tab-close schedules verified.')
