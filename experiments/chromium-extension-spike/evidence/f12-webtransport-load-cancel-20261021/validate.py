import json
from pathlib import Path
r=json.loads((Path(__file__).parent/'report.json').read_text())
assert len(r['results'])==4 and not r['errors']
for x in r['results']:
    assert x['passed']
    assert len(x['cycles'])==3
    schedule=x
    ids=[i for c in x["cycles"] for i in c["pendingIds"]]
    assert len(ids)==len(set(ids))==48
    for x in schedule['cycles']:
        x={**x,'kind':schedule['kind'],'mode':schedule['mode']}
        assert len(x['outcomes'])==16 and len({o['id'] for o in x['outcomes']})==16
        assert len(set(x['pendingIds']))==16 and len(x['decisions'])==16
        assert sum(p['engine_result']==0 for p in x['decisions'])==16
        assert sum(p['engine_result']==1 for p in x['decisions'])==0
        assert all(p['private']==(x['kind']=='private') for p in x['decisions'])
        assert all(p['request_id'] in x['pendingIds'] for p in x['decisions'])
        for q in x['requests']:
            o=next(p['result'] for p in x['outcomes'] if p['id']==q['id'])
            assert o['ready']==(not q['blocked'])
            if not q['blocked']:assert o['echo']=='blanc-http3-proof'
        connects=[p for p in x['arrivals'] if p['event']=='connect']
        assert len(connects)==16
        assert all(p['headers'][':authority'].startswith('page.blanc-fixture.test:') for p in connects)
        if x['mode']=='cancel-deletion':
            assert x['events']==['16-native-pending','native-beforeunload','deletion-cancelled','default-profile-retained']
        assert x['fresh']['echo']=='blanc-http3-proof'
print('PASS: twelve sixteen-request batches; native cancellation preserves admission; fresh controls work')
