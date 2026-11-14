import json
from pathlib import Path
from urllib.parse import urlparse
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert len(r['schedules'])==2
assert {s['guardOwner'] for s in r['schedules']}=={'cancel-first','accept-first-cancel-second'}
for s in r['schedules']:
 assert len({g['host'] for g in s['guardOwnership']})==2
 assert all(g['state']['fixture_private'] and g['state']['fixture_profile']==g['owner'] for g in s['guardOwnership'])
 assert set(s['armedOwners'])=={'Default','Profile 1'}
 assert s['closedRegularAnchors']
 for name in ['privateOnlyBefore','privateOnlyAfter']:
  inv=s[name];assert len(inv['nativeWindows'])==2 and len(inv['windows'])==4
  assert len({w['windowId'] for w in inv['windows']})==2
  assert {w['tabs'][0]['fixture_profile'] for w in inv['nativeWindows']}=={'Default','Profile 1'}
  assert all(t['fixture_private'] for w in inv['nativeWindows'] for t in w['tabs'])
 assert {w['windowId'] for w in s['privateOnlyBefore']['windows']}=={w['windowId'] for w in s['privateOnlyAfter']['windows']}
 assert s['passed'] and s['profileRemoved'] and not s.get('error')
 assert s['exitAcknowledgements']==[True]*4 and len(s['prompts'])==2
 assert len(s['consumers'])==2 and len({c['window']['windowId'] for c in s['consumers']})==2
 assert {c['owner'] for c in s['consumers']}=={'Default','Profile 1'}
 for p in s['prompts']:
  assert p['cancelled']
  expected=['cancel'] if s['guardOwner']=='cancel-first' else ['accept','cancel']
  assert [x['action'] for x in p['steps']]==expected
  assert len({x['owner'] for x in p['steps']})==len(expected)
  for step in p['steps']:
   assert len(step['pending'])==2 and all(not c['settled'] and not c['closed'] for c in step['pending'])
 for c in s['consumers']:
  assert c['nativeOwnership']['fixture_private'] and c['nativeOwnership']['fixture_profile']==c['owner']
  assert c['navigation']['success'] and c['freshPassed']
  assert any(x.get('prefetchStatus')=='PrefetchResponseUsed' for x in c['events'])
  assert any(x.get('event')=='navigation-response-decision' and x.get('url')==c['url'] and x.get('engine_result')==0 and x.get('private') is True for x in s['decisions'])
  assert sum(a['url']==urlparse(c['url']).path for a in s['arrivals'])==1
print('Two private-only cross-profile schedules pass: 8 Exit acknowledgements, 6 prompts, 4 original recoveries.')
