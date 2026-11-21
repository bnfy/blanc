import json,re
from pathlib import Path
p=Path(__file__).parent
normal=json.loads((p/'normal-report.json').read_text())
assert len(normal['results'])==2 and not normal['errors']
for schedule in normal['results']:
    assert schedule['passed'] and len(schedule['cycles'])==2
    for c in schedule['cycles']:
        assert c['passed'] and len(set(c['pendingIds']))==16
        assert len(c['decisions'])==16 and len(c['outcomes'])==16
        assert sum(d['engine_result']==0 for d in c['decisions'])==8
        assert sum(d['engine_result']==1 for d in c['decisions'])==8
        assert all(d['private']==(schedule['kind']=='private') for d in c['decisions'])
        for q in c['requests']:
            o=next(o['result'] for o in c['outcomes'] if o['id']==q['id'])
            assert o['ready']==(not q['blocked'])
            if not q['blocked']:assert o['echo']=='blanc-http3-proof'
        connects=[r for r in c['arrivals'] if r['event']=='connect']
        assert len(connects)==8 and all(r['headers'][':authority'].startswith('page.blanc-fixture.test:') for r in connects)
        assert c['fresh']['echo']=='blanc-http3-proof'
    log=(p/(schedule['kind']+'-normal-throttle.log')).read_text()
    assert 'after=300 s' in log
held=json.loads((p/'held-report.json').read_text())
assert len(held['results'])==2 and not held['errors']
for s in held['results']:
    assert s['cycles'][0]['passed'] and s['error']=='Error: Probe wait timed out'
    assert len(s['cycles'])==2 and not s['cycles'][1].get('passed',False)
    log=(p/(s['kind']+'-held-throttle.log')).read_text()
    assert 'after=300 s' in log
    delays=[float(v) for v in re.findall(r'with delay=([0-9.]+) s',log)]
    assert max(delays)>10
print('PASS: normal mixed admission completes; held all-pending barrier reproduces timeout with native throttle penalties/delays')
