"""Validate the observed outcomes, for the repaired hot-deletion boundary."""
import json
from pathlib import Path
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert len(r['results'])==3 and not r['errors']
for x in r['results']:
    assert not x['restartArrivals']
    assert x['restartRecovery']['echo']=='blanc-http3-proof'
    assert any(p.get('bundle_sha256')=='9acdfb68963e89c9c9be04a1a68ae831c7c35b800555790cadc8575a7172382d' for p in x['records'])
    if x['mode']=='hot-delete':
        assert x['passed'] and not x.get('failures')
        assert 'default-profile-removed-browser-survives' in x['events']
        assert 'deleted-profile-absent-after-restart' in x['events']
        assert x['recovery']['echo']=='blanc-http3-proof'
        assert not x['pendingArrivals']
        decision=next(p for p in x['pendingRecords'] if p['event']=='webtransport-decision')
        assert decision['engine_result']==-1 and decision['profile_unavailable'] is True
    else:
        assert x['passed'] and not x['pendingArrivals']
        assert 'owned-browser-killed' in x['events']
    assert any(p['event']=='webtransport-pending' and p['request_id']==x['pendingId'] for p in x['pendingRecords'])
print('PASS: hot deletion refuses held request; surviving profile and two crash/restart controls succeed')
root=Path(__file__).parent
teardown=json.loads((root/'teardown-regression.json').read_text())
assert len(teardown['results'])==4 and not teardown['errors']
assert all(x['passed'] and not x['pendingArrivals'] for x in teardown['results'])
http3=json.loads((root/'http3-regression.json').read_text())
assert len(http3['results'])==8 and not http3['errors']
for x in http3['results']:
    blocked=x['protection']=='enforced' and x['host']=='000491b06a.com'
    assert x['result']['ready']==(not blocked)
    if blocked:
        assert not x['arrivals']
        assert x['decisions'][0]['engine_result']==1
    else:assert x['result']['echo']=='blanc-http3-proof'
print('PASS: four teardown regressions and eight HTTP3 baseline/enforcement controls')
