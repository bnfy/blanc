import json
from pathlib import Path
p=Path(__file__).parent
for n in [1,2,3]:
 r=json.loads((p/f'attempt-{n}.json').read_text())
 assert len(r['schedules'])==4
 assert all(s.get('error') and s['profileRemoved'] and not s.get('passed') for s in r['schedules'])
r=json.loads((p/'attempt-3.json').read_text())
for s in r['schedules']:
 if s['mode']=='delete-cancel':
  assert s['nativePrompt'] and s['cancelled'] and s['profileRetained']
  assert s['pendingAtPrompt']['settled'] and s['pendingAtPrompt']['url']=='chrome-error://chromewebdata/'
  assert 'ERR_BLOCKED_BY_CLIENT' in s['navigation']['error']
 else:assert not s.get('nativePrompt')
print('Twelve retained diagnostic attempts; zero pending-veto acceptance passes.')
