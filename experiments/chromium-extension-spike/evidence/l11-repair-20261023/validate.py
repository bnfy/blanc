from pathlib import Path
import json,gzip,hashlib
r=Path(__file__).parent
for row in (r/'SHA256SUMS').read_text().splitlines():
 h,n=row.split('  ',1);assert (r/n).is_file() and hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
read=lambda n:json.loads((r/n).read_text())
a=read('spki-api-verification.json');assert a['complete'] and len(a['checks'])==16 and all(x['result']=='REVOKED' for x in a['checks']) and a['unlistedControl']!='CRLSet::CheckSPKI=0'
p=read('patched-verification.json')['results'];assert len(p)==16 and sum(x['revoked'] for x in p)==12
assert 'CertVerifyProc result: OK' in gzip.decompress((r/'unrevoked-certificate-control.log.gz').read_bytes()).decode()
assert read('diagnostic-source-restored.json')['restoredByteForByte']
i=read('inventory-final.json');assert i['upstream_files']==73 and i['hunks']==179 and i['within_budget']
assert 'scheduled actions: 0' in gzip.decompress((r/'final-browser-guard.log.gz').read_bytes()).decode()
assert len(read('codeql-remediations.json'))==48
assert '# pass 4175' in gzip.decompress((r/'unit-tests.log.gz').read_bytes()).decode()
assert 'site: no unsuppressed high or critical' in gzip.decompress((r/'dependency-audit.log.gz').read_bytes()).decode()
assert read('status.json')['electronDiagnosticBuild']=='pending approval; unstarted'
ci=read('hosted-ci.json');assert ci['codeql']['openAlerts']==[] and ci['codeql']['analysis']['commit_sha']==ci['mergeCommit']
assert any(c['name']=='substrate' and c['conclusion']=='success' for c in ci['checks'])
assert read('remaining-sandbox-failure.json')['allTemporaryChangesRemoved']
print('Original dependency/CodeQL findings cleared; separate sandbox failure and signed replacement remain pending')
