import json,re
from pathlib import Path
p=Path(__file__).parent
normal=json.loads((p/'report.json').read_text())
assert len(normal['results'])==2 and not normal['errors']
for schedule in normal['results']:
    assert schedule['passed'] and len(schedule['cycles'])==2
    for c in schedule['cycles']:
        assert 0<len(c['admittedAtPrompt'])<16
        assert set(c['admittedAtPrompt'])<=set(c['pendingIds'])
        assert any(re.search(r'throttled_connections_=[1-9]',l) for l in c['throttleAtPrompt'])
        assert 'deletion-cancelled' in c['events'] and 'default-profile-retained' in c['events']
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
    assert len({i for c in schedule['cycles'] for i in c['pendingIds']})==32
print('PASS: four mixed queued/admitted cancellation cycles, 64 decisions, 32 allowed exchanges, 32 refusals')
