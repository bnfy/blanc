import json
from pathlib import Path
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert {(s['kind'],s['mode']) for s in r['schedules']}=={(k,m) for k in ['regular','private'] for m in ['consume','utility-loss']}
for s in r['schedules']:
 assert s['passed'] and s['profileRemoved'] and not s.get('error')
 url=s['urls'][0]
 initial=[d for d in s['beforeConsumption']['decisions'] if d.get('event')=='decision' and d.get('url')==url]
 assert len(initial)==1 and initial[0]['profile_kind']==s['kind']
 assert not s['navigation'][0]['arrivals']
 if s['mode']=='consume':
  assert initial[0]['decision']=='allow'
  assert len(s['beforeConsumption']['arrivals'])==1
  assert s['beforeConsumption']['arrivals'][0]['headers']['sec-purpose']=='prefetch'
  assert any(d['url']==url and d.get('fromPrefetchCache') and not d.get('fromDiskCache') for d in s['documentResponses'])
  assert any(e['prefetchStatus']=='PrefetchResponseUsed' and e['status']=='Success' for e in s['preloadEvents'])
 else:
  assert not s['beforeConsumption']['arrivals']
  ds=[d for d in s['finalDecisions'] if d.get('event')=='decision' and d.get('url')==url]
  assert len(ds)==2 and all(d['decision']=='block' and d['engine_result']==-1 and d['status']=='engine-error' for d in ds)
  assert any(e['prefetchStatus']=='PrefetchFailedNetError' for e in s['preloadEvents'])
print('Four bounded consumption/refusal schedules verified.')
