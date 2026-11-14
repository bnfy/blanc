import json,re
from pathlib import Path
p=Path(__file__).parent
r=json.loads((p/'report.json').read_text())
assert len(r['results'])==4 and not r['errors']
assert {(s['kind'],s['lossPoint']) for s in r['results']}=={(k,t) for k in ['regular','private'] for t in ['at-prompt','after-cancel']}
for s in r['results']:
    assert s['passed'] and len(s['cycles'])==1
    c=s['cycles'][0]
    assert c['passed'] and 0<len(c['admittedAtPrompt'])<16
    assert set(c['admittedAtPrompt'])<=set(c['pendingIds'])
    assert any(re.search(r'throttled_connections_=[1-9]',l) for l in c['throttleAtPrompt'])
    assert 'utility-killed-'+s['lossPoint'] in c['events']
    assert 'deletion-cancelled' in c['events'] and 'default-profile-retained' in c['events']
    assert len(set(c['pendingIds']))==16 and len(c['decisions'])==16
    assert len({d['request_id'] for d in c['decisions']})==16
    assert all(d['engine_result']==-1 and d['private']==(s['kind']=='private') for d in c['decisions'])
    assert len(c['outcomes'])==16 and len({o['id'] for o in c['outcomes']})==16
    assert all(not o['result']['ready'] and 'fixture deadline' not in o['result']['error'] for o in c['outcomes'])
    assert not any(a['event']=='connect' for a in c['arrivals'])
    assert not c['fresh']['ready'] and 'fixture deadline' not in c['fresh']['error']
    assert s['profileRetainedAfterRestart'] and s['privateContextsAfterRestart']==[]
    assert not any(a['event']=='connect' for a in s['restartQuietArrivals'])
    assert s['restartAllowed']['echo']=='blanc-http3-proof'
    assert not s['restartBlocked']['ready'] and 'fixture deadline' not in s['restartBlocked']['error']
    decisions=[d for d in s['restartFreshRecords'] if d['event']=='webtransport-decision']
    assert [d['engine_result'] for d in decisions]==[0,1]
    assert all(d['private']==(s['kind']=='private') for d in decisions)
    arrivals=[a for a in s['restartFreshArrivals'] if a['event']=='connect']
    assert len(arrivals)==1 and arrivals[0]['headers'][':authority'].startswith('page.blanc-fixture.test:')
assert sum(a['event']=='connect' for a in r['serverRows'])==8
print('PASS: four clean restarts retain profile, exclude private contexts, show no replay in bounded observation, restore fresh allow/block decisions')
