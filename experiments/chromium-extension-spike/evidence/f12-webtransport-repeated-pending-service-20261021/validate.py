import json,re
from pathlib import Path
p=Path(__file__).parent
r=json.loads((p/'report.json').read_text())
assert len(r['results'])==4 and not r['errors']
for s in r['results']:
    assert s['passed'] and len(s['cycles'])==1
    c=s['cycles'][0]
    assert 'Default' not in c['registrationBeforeRequests']
    assert 'Default' not in s['registrationAfterCrash']
    assert len(s['serviceWorkerScopesAfterRestart'])==(0 if s['kind']=='private' else 1)
    assert s['crashPid']==c['processes']['browserPid']
    assert c['passed'] and 0<len(c['pendingAtCrash'])<16 and not c['decisionsBeforeCrash']
    assert c['promptOpenAtCrash']==(s['lossPoint']=='at-prompt')
    assert ('deletion-cancelled' in c['events'])==(s['lossPoint']=='after-cancel')
    assert any(re.search(r'throttled_connections_=[1-9]',l) for l in c['throttleAtPrompt'])
    assert s['profileRegisteredAfterRestart'] and s['privateContextsAfterRestart']==[]
    assert not any(a['event']=='connect' for a in s['restartQuietArrivals'])
    assert s['restartAllowed']['echo']=='blanc-http3-proof'
    assert not s['restartBlocked']['ready'] and 'fixture deadline' not in s['restartBlocked']['error']
    decisions=[d for d in s['restartFreshRecords'] if d['event']=='webtransport-decision']
    assert [d['engine_result'] for d in decisions]==[0,1]
    assert all(d['private']==(s['kind']=='private') for d in decisions)
    arrivals=[a for a in s['restartFreshArrivals'] if a['event']=='connect']
    assert len(arrivals)==1 and arrivals[0]['headers'][':authority'].startswith('page.blanc-fixture.test:')
    assert s['serviceWorkerRegistrationMode']==('fresh-private' if s['kind']=='private' else 'retained-regular')
    assert s['serviceAllowed']['echo']=='blanc-http3-proof'
    assert not s['serviceBlocked']['ready'] and 'fixture deadline' not in s['serviceBlocked']['error']
    sd=[d for d in s['serviceRecords'] if d['event']=='webtransport-decision']
    assert [d['engine_result'] for d in sd]==[0,1]
    assert all(d['private']==(s['kind']=='private') and d['owner']=='frame-less-worker' and d['source_contract']=='webtransport-initiator-origin' for d in sd)
    sc=[a for a in s['serviceArrivals'] if a['event']=='connect']
    assert len(sc)==1 and sc[0]['headers'][':authority'].startswith('page.blanc-fixture.test:')
    assert len(s['additionalRestarts'])==2
    assert len({s['crashPid'],*[rr['crashPid'] for rr in s['additionalRestarts']]})==3
    for rr in s['additionalRestarts']:
        assert 0<len(rr['pendingIds'])<8 and not rr['decisionsBeforeCrash'] and not rr['outcomesBeforeCrash']
        assert rr['passed'] and rr['privateContexts']==[]
        assert len(rr['scopes'])==(0 if s['kind']=='private' else 1)
        assert not any(a['event']=='connect' for a in rr['quietArrivals'])
        assert rr['allowed']['echo']=='blanc-http3-proof'
        assert not rr['blocked']['ready'] and 'fixture deadline' not in rr['blocked']['error']
        dd=[d for d in rr['records'] if d['event']=='webtransport-decision']
        assert [d['engine_result'] for d in dd]==[0,1]
        assert all(d['owner']=='frame-less-worker' and d['private']==(s['kind']=='private') for d in dd)
        aa=[a for a in rr['arrivals'] if a['event']=='connect']
        assert len(aa)==1 and aa[0]['headers'][':authority'].startswith('page.blanc-fixture.test:')
assert sum(a['event']=='connect' for a in r['serverRows'])==20
print('PASS: twelve pending-crash restart worker allow/block pairs, regular retention/private exclusion and bounded no replay')
