import json
from pathlib import Path
p=Path(__file__).parent
r=json.loads((p/'attempt-2.json').read_text());assert len(r['schedules'])==1
s=r['schedules'][0]
assert s['kind']=='regular' and s['mode']=='shutdown-veto' and s['passed'] and s['profileRemoved']
assert len(s['islandTargets'])==1 and len({w['windowId'] for w in s['windowsBeforeVeto']})==1
assert s['nativePrompt'] and s['cancelled'] and s['profileRetained']
assert not s['pending']['settled'] and not s['pending']['decisions']
assert not s['pendingAtPrompt']['settled'] and s['pendingAtPrompt']['url'].endswith('/source')
assert s['navigation']['success'] and s['consumptionRecovered'] and s['freshPassed']
assert any(d.get('event')=='navigation-response-decision' and d.get('url')==s['urls'][0] and d.get('engine_result')==0 for d in s['afterResume'])
assert len([a for a in s['arrivalsAfterConsumption'] if a['url'].endswith('/regular-shutdown-veto')])==1
old=json.loads((p/'attempt-1.json').read_text())['schedules'][0];assert old['error'] and old['profileRemoved'] and not old.get('passed')
print('Regular last-window native shutdown veto and original consumption recovery pass.')
