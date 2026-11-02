import json
from pathlib import Path
from urllib.parse import urlparse
r=json.loads((Path(__file__).parent/'report.json').read_text());assert len(r['schedules'])==2
for s in r['schedules']:
 assert s['passed'] and s['profileRemoved'] and not s.get('error') and len(s['cycles'])==3
 for c in s['cycles']:
  assert c['passed'] and len(c['extra'])==7
  assert c['exitAcknowledgements']==[True]*8 and len(c['dialogEvents'])==2 and len(c['prompts'])==2
  assert len(c['extraPending'])==7 and all(not e['settled'] for e in c['extraPending'])
  for prompt in c['prompts']:
   assert not prompt['settled'] and not prompt['closed'] and prompt['cancelled']
   assert len(prompt['extraPending'])==7 and all(not e['settled'] for e in prompt['extraPending'])
  assert c['navigation']['success'] and c['freshPassed']
  assert len(c['islandTargets'])==1 and len({w['windowId'] for w in c['windowsBeforeVeto']})==1
  for e in c['extra']:
   assert e['navigation']['success'] and e['window']['windowId']==c['windowsBeforeVeto'][0]['windowId']
   if s['kind']=='private':assert e['target']['browserContextId']==c['privateContextId']
   assert any(x.get('prefetchStatus')=='PrefetchResponseUsed' for x in e['events'])
  for url in [c['urls'][0]]+[e['url'] for e in c['extra']]:
   assert any(d.get('event')=='navigation-response-decision' and d.get('url')==url and d.get('engine_result')==0 and d.get('private')==(s['kind']=='private') for d in c['afterResume'])
   assert sum(a['url']==urlparse(url).path for a in c['arrivalsAfterConsumption'])==1
  assert c['extraClosed']
print('Six eight-consumer cycles pass:48 Exit acknowledgements,12 prompts,48 original recoveries.')
