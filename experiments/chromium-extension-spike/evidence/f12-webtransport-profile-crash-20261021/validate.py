"""Validate the observed outcomes, including the unresolved hot-deletion failure."""
import json
from pathlib import Path
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert len(r['results'])==3 and not r['errors']
for x in r['results']:
    assert not x['restartArrivals']
    assert x['restartRecovery']['echo']=='blanc-http3-proof'
    assert any(p.get('bundle_sha256')=='9acdfb68963e89c9c9be04a1a68ae831c7c35b800555790cadc8575a7172382d' for p in x['records'])
    if x['mode']=='hot-delete':
        assert not x['passed'] and x['failures']
        assert 'default-profile-removed-browser-survives' in x['events']
        assert 'deleted-profile-absent-after-restart' in x['events']
        assert x['recovery']['echo']=='blanc-http3-proof'
        assert any(p['event']=='connect' and p['accepted'] for p in x['pendingArrivals'])
        assert any(p['event']=='echo' for p in x['pendingArrivals'])
    else:
        assert x['passed'] and not x['pendingArrivals']
        assert 'owned-browser-killed' in x['events']
    assert any(p['event']=='webtransport-pending' and p['request_id']==x['pendingId'] for p in x['pendingRecords'])
print('Observed outcomes verified: 2 crash passes, 1 hot-deletion failure; NOT all tests passing')
