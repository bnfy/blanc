import json
from pathlib import Path
p=Path(__file__).parent
r=json.loads((p/'attempt-9.json').read_text())
assert len(r['schedules'])==4
assert {(s['kind'],s['mode']) for s in r['schedules']}=={(k,m) for k in ['regular','private'] for m in ['delete-cancel','shutdown-veto']}
for s in r['schedules']:
 assert s['passed'] and not s.get('error') and s['profileRemoved']
 assert s['guardArmed'] and s['nativePrompt'] and s['cancelled'] and s['profileRetained']
 assert not s['pending']['settled'] and not s['pending']['decisions']
 assert not s['pendingAtPrompt']['settled'] and not s['pendingAtPrompt']['closed']
 assert s['pendingAtPrompt']['url'].endswith('/source')
 assert s['navigation']['success'] and s['consumptionRecovered'] and s['freshPassed']
 assert sum(a['url']==__import__('urllib.parse',fromlist=['urlparse']).urlparse(s['urls'][0]).path for a in s['arrivalsAfterConsumption'])==1
 assert any(d.get('event')=='navigation-response-decision' and d.get('url')==s['urls'][0] and d.get('engine_result')==0 for d in s['afterResume'])
 assert any(e.get('prefetchStatus')=='PrefetchResponseUsed' for e in s['preloadEvents'])
for n in range(4,9):
 old=json.loads((p/f'attempt-{n}.json').read_text());assert all(s['profileRemoved'] for s in old['schedules'])
 assert any(s.get('error') for s in old['schedules'])
assert r['forcedFeatures']==[] and r['latencyMeasured'] is False
print('Four pending cancellation/veto schedules pass; earlier fixture failures retained separately.')
