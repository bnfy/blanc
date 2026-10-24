"""Validate the archived actual HTTP/3 controls independently of the runner."""
import json
from pathlib import Path
root = Path(__file__).parent
report = json.loads((root / 'native-run-02/report.json').read_text())
assert not report['errors']
assert len(report['results']) == 8
for row in report['results']:
    blocked = row['protection'] == 'enforced' and row['host'] == '000491b06a.com'
    assert row['result']['ready'] == (not blocked)
    connects = [r for r in row['arrivals'] if r['event'] == 'connect']
    if blocked:
        assert not row['arrivals']
        assert 'Opening handshake failed' in row['result']['error']
    else:
        assert row['result']['echo'] == 'blanc-http3-proof'
        assert len(connects) == 1 and connects[0]['accepted']
        assert connects[0]['headers'][':protocol'] == 'webtransport'
        assert connects[0]['headers'][':authority'].split(':')[0] == row['host']
        assert any(r == {'event': 'alpn', 'value': 'h3'} for r in row['arrivals'])
        assert any(r['event'] == 'echo' for r in row['arrivals'])
    if row['protection'] == 'enforced':
        assert len(row['decisions']) == 1
        decision = row['decisions'][0]
        assert decision['engine_result'] == int(blocked)
        assert decision['private'] == (row['kind'] == 'private')
        records = [json.loads(line) for line in (root / ('native-run-02/enforced-' + row['kind'] + '-decisions.jsonl')).read_text().splitlines()]
        assert any(r.get('bundle_sha256') == '9acdfb68963e89c9c9be04a1a68ae831c7c35b800555790cadc8575a7172382d' for r in records)
        assert any(r.get('event') == 'webtransport-pending' and r['request_id'] == decision['request_id'] for r in records)
    else:
        assert not row['decisions']
print('PASS: 8 controls, 6 HTTP/3 CONNECT/datagram exchanges, 2 native filter refusals, pinned engine')
