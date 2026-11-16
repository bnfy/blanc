import json
from pathlib import Path
p=Path(__file__).parent
r=json.loads((p/'attempt-3.json').read_text());assert len(r['schedules'])==2
passed=0
for s in r['schedules']:
 assert s['error'] and s['profileRemoved'] and not s.get('passed')
 expected=2 if s['kind']=='regular' else 1
 assert sum(bool(c.get('passed')) for c in s['cycles'])==expected
 for c in s['cycles']:
  if not c.get('passed'):
   assert c['error'] and c['preloadEvents']==[] and not c.get('pending');continue
  passed+=1
  assert len(c['islandTargets'])==1 and len({w['windowId'] for w in c['windowsBeforeVeto']})==1
  if s['kind']=='private':assert all(w['browserContextId']==c['privateContextId'] for w in c['windowsBeforeVeto'])
  assert len(c['prompts'])==2 and all(not d['settled'] and not d['closed'] and d['cancelled'] and '/source?cycle=' in d['url'] for d in c['prompts'])
  assert c['navigation']['success'] and c['consumptionRecovered'] and c['freshPassed']
  assert any(d.get('event')=='navigation-response-decision' and d.get('url')==c['urls'][0] and d.get('engine_result')==0 and d.get('private')==(s['kind']=='private') for d in c['afterResume'])
  assert len([a for a in c['arrivalsAfterConsumption'] if a['url'].endswith('-cycle-'+str(c['cycle']))])==1
assert passed==3
control=json.loads((p/'no-veto-control.json').read_text())['schedules'][0]
assert control['error'] and control['profileRemoved'] and control['cycles'][0]['passed']
assert all(c['prompts']==[] for c in control['cycles']) and control['cycles'][1]['preloadEvents']==[]
print('Three completed cycles/six vetoes verified; full matrix remains open and no-veto readiness failure retained.')
