import json
from pathlib import Path
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert {(s['kind'],s['mode']) for s in r['schedules']}=={(k,m) for k in ['regular','private'] for m in ['profile-delete','shutdown']}
for s in r['schedules']:
 assert s['passed'] and s['profileRemoved'] and not s.get('error')
 assert not s['pending']['settled'] and not s['pending']['decisions']
 assert any(e['prefetchStatus']=='PrefetchResponseUsed' for e in s['preloadEvents'])
 assert s['navigation']['error'] and 'Timeout 45000' not in s['navigation']['error']
 assert len(s['arrivalsAfterConsumption'])==1
 assert s['arrivalsAfterConsumption'][0]['headers']['sec-purpose']=='prefetch'
 assert not any(d.get('event')=='navigation-response-decision' and d.get('url')==s['urls'][0] for d in s['afterResume'])
 assert s['restartPassed']
 if s['mode']=='profile-delete':assert s['profileDeletionConfirmed'] and s['survivorPassed'] and s['deletedProfileAbsent']
 else:assert s['shutdownConfirmed']
print('Four bounded deletion/shutdown schedules verified.')
