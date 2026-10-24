import json
from pathlib import Path
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert len(r['schedules'])==2
for s in r['schedules']:
 assert not s.get('error') and s['profileRemoved']
 arrivals=s['beforeConsumption']['arrivals']
 assert len(arrivals)==2 and all(a['headers']['sec-purpose']=='prefetch' for a in arrivals)
 for url in s['urls']:
  ds=[d for d in s['beforeConsumption']['decisions'] if d.get('event')=='decision' and d.get('url')==url]
  assert len(ds)==1 and ds[0]['decision']=='allow' and ds[0]['resource_type']=='mainFrame'
  assert ds[0]['profile_kind']==s['kind']
  assert any(e['prefetchUrl']==url and e['status']=='Ready' for e in s['preloadEvents'])
 assert not s['navigation'][0]['arrivals'] and not s['navigation'][0]['error']
 assert len(s['navigation'][1]['arrivals'])==1
print('Two diagnostic schedules verified; refusal and dedicated consumption remain open.')
