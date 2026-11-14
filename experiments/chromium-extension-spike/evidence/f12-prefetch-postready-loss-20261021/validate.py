import json
from pathlib import Path
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert len(r['schedules'])==2
assert {s['kind'] for s in r['schedules']}=={'regular','private'}
for s in r['schedules']:
 assert s['diagnosticComplete'] and s['profileRemoved'] and not s.get('error')
 url=s['urls'][0]
 assert any(e['status']=='Ready' and e['prefetchUrl']==url for e in s['readyBeforeLoss'])
 assert len(s['beforeConsumption']['arrivals'])==1
 assert s['beforeConsumption']['arrivals'][0]['headers']['sec-purpose']=='prefetch'
 assert not s['navigation'][0]['arrivals'] and not s['navigation'][0]['error']
 ds=[d for d in s['finalDecisions'] if d.get('event')=='decision' and d.get('url')==url]
 assert len(ds)==1 and ds[0]['decision']=='allow' and ds[0]['profile_kind']==s['kind']
 assert any(d.get('url','').endswith('/fresh-after-loss') and d.get('engine_result')==-1 and d.get('decision')=='block' for d in s['beforeConsumption']['decisions'])
 assert s['consumedAfterLoss'] and not s['recheckedAfterLoss']
 assert any(x['url']==url and x.get('fromPrefetchCache') for x in s['documentResponses'])
print('Two diagnostic boundaries verified; consumption-time refusal NOT established.')
