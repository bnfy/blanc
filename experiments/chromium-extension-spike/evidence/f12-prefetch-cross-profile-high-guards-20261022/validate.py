import json
from pathlib import Path
from urllib.parse import urlparse
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert len(r['schedules'])==2
assert {s['guardOwner'] for s in r['schedules']}=={'cancel-first','accept-first-cancel-second'}
for s in r['schedules']:
 assert len(s['guardOwnership'])==2 and len({g['host'] for g in s['guardOwnership']})==2
 assert set(s['armedOwners'])=={'Default','Profile 1'}
 assert s['passed'] and s['profileRemoved'] and not s.get('error')
 assert s['exitAcknowledgements']==[True]*4 and len(s['prompts'])==2
 assert len(s['consumers'])==16 and len({c['window']['windowId'] for c in s['consumers']})==2
 assert {c['owner'] for c in s['consumers']}=={'Default','Profile 1'}
 for owner in ['Default','Profile 1']:
  members=[c for c in s['consumers'] if c['owner']==owner];assert len(members)==8 and len({c['window']['windowId'] for c in members})==1
 for p in s['prompts']:
  assert p['cancelled']
  expected=['cancel'] if s['guardOwner']=='cancel-first' else ['accept','cancel']
  assert [x['action'] for x in p['steps']]==expected
  assert len({x['owner'] for x in p['steps']})==len(expected)
  for step in p['steps']:
   assert len(step['pending'])==16 and all(not c['settled'] and not c['closed'] for c in step['pending'])
 for c in s['consumers']:
  assert c['navigation']['success'] and c['freshPassed']
  assert any(x.get('prefetchStatus')=='PrefetchResponseUsed' for x in c['events'])
  assert any(x.get('event')=='navigation-response-decision' and x.get('url')==c['url'] and x.get('engine_result')==0 and x.get('private') is False for x in s['decisions'])
  assert sum(a['url']==urlparse(c['url']).path for a in s['arrivals'])==1
print('Two dual-guard schedules pass: 8 Exit acknowledgements, 6 prompts, 32 original recoveries.')
