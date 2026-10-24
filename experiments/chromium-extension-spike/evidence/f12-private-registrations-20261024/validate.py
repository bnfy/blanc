from pathlib import Path
import json,hashlib
r=Path(__file__).parent;d=json.loads((r/'report.json').read_text())
assert d['complete'] and len(d['checks'])==10 and all(c['pass'] for c in d['checks']) and d['exit']['code']==0
assert len(d['pageContextBindings'])==2 and all(t['browserContextId']==d['privateContextId'] for t in d['pageContextBindings'])
assert any(t['private'] is True for t in d['nativePrivateStates'])
assert len(set(d['registrationIds'].values()))==2
for initial in ['initial-report.json','ui-snapshot-report.json']:assert not json.loads((r/initial).read_text())['complete']
assert all(x['removed'] for x in json.loads((r/'cleanup.json').read_text())['profiles'])
for line in (r/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
print('10 final private-registration checks; failed attempts excluded; archived integrity verified')
