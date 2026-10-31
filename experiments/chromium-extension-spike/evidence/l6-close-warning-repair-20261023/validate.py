from pathlib import Path
import json,hashlib,gzip
r=Path(__file__).parent
for line in (r/'SHA256SUMS').read_text().splitlines():
 expected,name=line.split('  ',1);p=r/name
 assert hashlib.sha256(p.read_bytes()).hexdigest()==expected,name
 if p.suffix=='.gz':gzip.decompress(p.read_bytes())
s=json.loads((r/'summary.json').read_text());assert s['signedChecks']==70 and s['readiness']['count']==8
assert len(s['recoverySchedules'])==8 and sum(x['checkpoints'] for x in s['recoverySchedules'])==49
for mode in ['signed-boundaries','signed-empty-session-failure','signed-loaded-history']:
 d=json.loads((r/('report-'+mode+'.json')).read_text());assert d['complete'] and all(x['pass'] for x in d['checks'])
a=json.loads((r/'signed-candidate-audit.json').read_text());b=json.loads((r/'final-candidate-audit.json').read_text());assert a['machO']==b['machO'] and len(b['machO'])==17;assert a['assets']==b['assets'] and len(b['assets'])==7
assert json.loads((r/'notary-result.json').read_text())['status']=='Accepted'
print('All archived hashes/compressed logs, signed equality, 70 checks and L6 accounting verified')
