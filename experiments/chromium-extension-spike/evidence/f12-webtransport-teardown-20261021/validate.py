import json
from pathlib import Path
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert len(r['results'])==4 and not r['errors']
for x in r['results']:
    assert x['passed'] and not x['pendingArrivals']
    assert 'native-pending' in x['events']
    assert any(p.get('bundle_sha256')=='9acdfb68963e89c9c9be04a1a68ae831c7c35b800555790cadc8575a7172382d' for p in x['records'])
    assert any(p['event']=='webtransport-pending' for p in x['pendingRecords'])
    if x['mode']=='service-stop':
        assert x['version']['status']=='activated'
        assert any(v['versionId']==x['version']['versionId'] and v['runningStatus']=='stopped' and v['status']=='activated' for v in x['versionEvents'])
        assert 'service-version-stopped' in x['events']
    elif x['mode']=='context-close':
        assert 'private-context-removed' in x['events']
        assert 'service-target-destroyed' in x['events']
    else:
        assert 'owned-browser-disconnected' in x['events']
        assert x['utilityAliveAfterClose'] is False
    if x['mode']!='browser-close':assert x['recovery']['echo']=='blanc-http3-proof'
print('PASS: four pending service-worker/profile shutdown schedules')
