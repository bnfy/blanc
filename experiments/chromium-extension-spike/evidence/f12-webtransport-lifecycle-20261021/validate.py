import json
from pathlib import Path
root=Path(__file__).parent
report=json.loads((root/'report.json').read_text())
assert not report['errors']
assert len(report['results'])==12
for row in report['results']:
    assert row['passed']
    assert any(r.get('bundle_sha256')=='9acdfb68963e89c9c9be04a1a68ae831c7c35b800555790cadc8575a7172382d' for r in row['records'])
    if row['mode']=='workers':
        assert len(row['checks'])==6
        for check in row['checks']:
            blocked=check['host']=='000491b06a.com'
            assert check['result']['ready']==(not blocked)
            assert len(check['decisions'])==1
            decision=check['decisions'][0]
            assert decision['private']==(row['kind']=='private')
            assert decision['engine_result']==int(blocked)
            if blocked:assert not check['arrivals']
            else:
                assert check['result']['echo']=='blanc-http3-proof'
                assert any(r['event']=='connect' and r['accepted'] for r in check['arrivals'])
    else:
        records=[r for r in row['records'] if r.get('request_id')==row['pendingId']]
        assert any(r['event']=='webtransport-pending' for r in records)
        assert not row['pendingArrivals']
        if row['mode'].endswith('-close'):
            assert 'target-destroyed' in row['events']
            assert row['abandonedBeforeResume'] is False
            decisions=[r for r in records if r['event']=='webtransport-decision']
            assert len(decisions)==1
            assert decisions[0]['engine_result']==(-1 if row['mode']=='document-close' else 0)
        else:
            decisions=[r for r in records if r['event']=='webtransport-decision']
            assert len(decisions)==1 and decisions[0]['engine_result']==-1
            assert not row['pendingResult']['ready']
            if row['mode']=='timeout':assert any(r['event']=='webtransport-timeout' for r in records)
        assert row['recovery']['ready']==(row['mode']!='utility-loss')
print('PASS: 12 schedules; 12 worker controls and 10 pending lifecycle cases')
