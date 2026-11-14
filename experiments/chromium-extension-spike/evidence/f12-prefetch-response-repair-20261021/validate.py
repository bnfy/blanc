import json
from pathlib import Path
p=Path(__file__).parent
for s in json.loads((p/'repair.json').read_text())['schedules']:
 assert s['passed'] and s['profileRemoved'] and not s.get('error')
 u=s['urls'][0]
 assert any(e['prefetchUrl']==u and e['status']=='Ready' for e in s['readyBeforeLoss'])
 assert len(s['beforeConsumption']['arrivals'])==1 and not s['navigation'][0]['arrivals']
 assert s['navigation'][0]['error'] and s['pageTitle']!='Prefetch fixture'
 assert any(d.get('event')=='navigation-response-decision' and d.get('url')==u and d.get('engine_result')==-1 and d.get('decision')=='block' and d.get('private')==(s['kind']=='private') for d in s['finalDecisions'])
r=json.loads((p/'regression.json').read_text())
assert len(r['schedules'])==4
for s in r['schedules']:
 assert s['passed'] and s['profileRemoved'] and not s.get('error')
 if s['mode']=='consume':
  assert any(x['url']==s['urls'][0] and x.get('fromPrefetchCache') for x in s['documentResponses'])
 else:assert not s['beforeConsumption']['arrivals']
 assert not s['navigation'][0]['arrivals']
print('Six bounded repair/regression schedules pass.')
