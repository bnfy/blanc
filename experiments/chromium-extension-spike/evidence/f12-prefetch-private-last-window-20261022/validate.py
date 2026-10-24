import json
from pathlib import Path
p=Path(__file__).parent
r=json.loads((p/'attempt-3.json').read_text());assert len(r['schedules'])==1
s=r['schedules'][0]
assert s['kind']=='private' and s['mode']=='shutdown-veto' and s['passed'] and s['profileRemoved']
assert s['privateContextId'] and len(s['islandTargets'])==1
assert len({w['windowId'] for w in s['windowsBeforeVeto']})==1
assert len(s['windowsBeforeVeto'])==2
assert all(w['browserContextId']==s['privateContextId'] for w in s['windowsBeforeVeto'])
assert s['nativePrompt'] and s['cancelled'] and s['profileRetained'] and s['guardArmed']
assert not s['pending']['settled'] and not s['pending']['decisions']
assert not s['pendingAtPrompt']['settled'] and not s['pendingAtPrompt']['closed'] and s['pendingAtPrompt']['url'].endswith('/source')
assert s['navigation']['success'] and s['consumptionRecovered'] and s['freshPassed']
assert any(d.get('event')=='navigation-response-decision' and d.get('url')==s['urls'][0] and d.get('engine_result')==0 and d.get('private') is True for d in s['afterResume'])
assert len([a for a in s['arrivalsAfterConsumption'] if a['url'].endswith('/private-shutdown-veto')])==1
assert any(e.get('prefetchStatus')=='PrefetchResponseUsed' for e in s['preloadEvents'])
for n in [1,2]:
 old=json.loads((p/f'attempt-{n}.json').read_text())['schedules'][0];assert old['error'] and old['profileRemoved'] and not old.get('passed')
assert json.loads((p/'attempt-2-stalled-stage.json').read_text())['stage']=='checking-picker-disappearance'
print('Private-only last-window native shutdown veto and original consumption recovery pass.')
