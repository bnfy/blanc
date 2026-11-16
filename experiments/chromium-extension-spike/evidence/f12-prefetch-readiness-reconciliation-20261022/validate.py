import json
from pathlib import Path
p=Path(__file__).parent
r=json.loads((p/'attempt-6.json').read_text());assert len(r['schedules'])==2
for s in r['schedules']:
 assert s['passed'] and s['profileRemoved'] and not s.get('error') and len(s['cycles'])==3
 for c in s['cycles']:
  assert c['passed'] and len(c['prompts'])==2
  assert all(not d['settled'] and not d['closed'] and d['cancelled'] for d in c['prompts'])
  assert any(t['active'] and t['primary_active'] and t['visibility']==2 and t['url'].endswith('/source?cycle='+str(c['cycle'])) for t in c['nativeBeforeCandidate'])
  assert len(c['islandTargets'])==1 and len({w['windowId'] for w in c['windowsBeforeVeto']})==1
  if s['kind']=='private':assert all(w['browserContextId']==c['privateContextId'] for w in c['windowsBeforeVeto'])
  assert c['navigation']['success'] and c['consumptionRecovered'] and c['freshPassed']
  assert any(d.get('event')=='navigation-response-decision' and d.get('url')==c['urls'][0] and d.get('engine_result')==0 and d.get('private')==(s['kind']=='private') for d in c['afterResume'])
  assert sum(a['url'].endswith('-cycle-'+str(c['cycle'])) for a in c['arrivalsAfterConsumption'])==1
control=json.loads((p/'attempt-4.json').read_text())['schedules'][0]
assert control['passed'] and len(control['cycles'])==3 and all(c['passed'] and not c['prompts'] for c in control['cycles'])
failed=json.loads((p/'attempt-3.json').read_text())['schedules'][0]['cycles'][-1]
assert failed['error'] and any(t['active'] and t['visibility']==0 for t in failed['nativeBeforeCandidate'])
assert any(t['active'] and t['visibility']==2 for t in failed['readinessFailure']['native'])
assert failed['preloadEvents']==[] and failed['preloadDiagnostics']
print('Six completed cycles/twelve vetoes and three no-veto controls pass; prior native visibility race retained.')
