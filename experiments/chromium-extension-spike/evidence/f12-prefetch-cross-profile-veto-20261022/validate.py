import json
from pathlib import Path
from urllib.parse import urlparse
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert len(r['schedules'])==2
assert {s['guardOwner'] for s in r['schedules']}=={'Default','Profile 1'}
for s in r['schedules']:
 assert s['passed'] and s['profileRemoved'] and not s.get('error')
 assert s['exitAcknowledgements']==[True]*4 and len(s['prompts'])==2
 assert len(s['consumers'])==2 and len({c['window']['windowId'] for c in s['consumers']})==2
 assert {c['owner'] for c in s['consumers']}=={'Default','Profile 1'}
 for p in s['prompts']:
  assert p['cancelled'] and len(p['pending'])==2
  assert all(not c['settled'] and not c['closed'] for c in p['pending'])
 for c in s['consumers']:
  assert c['navigation']['success'] and c['freshPassed']
  assert any(x.get('prefetchStatus')=='PrefetchResponseUsed' for x in c['events'])
  assert any(x.get('event')=='navigation-response-decision' and x.get('url')==c['url'] and x.get('engine_result')==0 and x.get('private') is False for x in s['decisions'])
  assert sum(a['url']==urlparse(c['url']).path for a in s['arrivals'])==1
print('Two cross-profile schedules pass: 8 Exit acknowledgements, 4 prompts, 4 original recoveries.')
