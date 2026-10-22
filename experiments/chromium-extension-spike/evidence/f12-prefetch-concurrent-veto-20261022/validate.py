import json
from pathlib import Path
from urllib.parse import urlparse
p=Path(__file__).parent
r=json.loads((p/'report.json').read_text());assert len(r['schedules'])==2
for s in r['schedules']:
 assert s['passed'] and s['profileRemoved'] and not s.get('error') and len(s['cycles'])==1
 c=s['cycles'][0];assert c['passed'] and c['exitAcknowledgements']==[True]*4
 assert len(c['dialogEvents'])==2 and len(c['prompts'])==2
 assert all(not d['settled'] and not d['secondSettled'] and not d['closed'] and d['cancelled'] for d in c['prompts'])
 assert not c['secondPending']['settled'] and c['secondPending']['url'].endswith('/second-source')
 assert c['navigation']['success'] and c['secondNavigation']['success'] and c['freshPassed']
 assert len(c['islandTargets'])==1 and len({w['windowId'] for w in c['windowsBeforeVeto']})==1
 assert c['secondWindow']['windowId']==c['windowsBeforeVeto'][0]['windowId']
 if s['kind']=='private':
  assert c['secondTarget']['browserContextId']==c['privateContextId']
  assert all(w['browserContextId']==c['privateContextId'] for w in c['windowsBeforeVeto'])
 for url in [c['urls'][0],c['secondUrl']]:
  assert any(d.get('event')=='navigation-response-decision' and d.get('url')==url and d.get('engine_result')==0 and d.get('private')==(s['kind']=='private') for d in c['afterResume'])
  assert sum(a['url']==urlparse(url).path for a in c['arrivalsAfterConsumption'])==1
 assert any(e.get('prefetchStatus')=='PrefetchResponseUsed' for e in c['secondEvents'])
print('Two schedules: eight acknowledged Exit requests, four veto prompts, four recovered original consumptions.')
