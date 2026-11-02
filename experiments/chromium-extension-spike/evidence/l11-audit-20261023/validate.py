from pathlib import Path
import hashlib,json,gzip,collections
r=Path(__file__).parent
for line in (r/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
s=json.loads((r/'ci-snapshot.json').read_text());assert s['head']=='dc9d5556aee9f490f302111802fcb19a39f1986e' and s['baseRef']=='codex/chromium157-rebase' and s['draft']
c=collections.Counter((x['status'],x['conclusion']) for x in s['checks']);assert c[('completed','success')]==14 and c[('completed','failure')]==1 and c[('in_progress',None)]==6
assert s['statuses']==[]
log=gzip.decompress((r/'substrate.log.gz').read_bytes()).decode('utf-8-sig');assert 'GHSA-JR5W-W6X2-84P9' in log and 'GHSA-MRHX-C7XC-M3W5' in log
for name,fix in [('electron-advisory.json','44.9.1'),('zod-advisory.json','4.6.6')]:
 a=json.loads((r/name).read_text());assert a['severity']=='high' and any(v['first_patched_version']==fix for v in a['vulnerabilities'])
a=json.loads((r/'security-context.json').read_text());assert len(a['alerts'])==48 and all(x['most_recent_instance']['commit_sha']=='f5aed8584a110902d7fff77ed5da2e2219475c35' for x in a['alerts'])
assert json.loads((r/'status.json').read_text())['L11']=='open; blocked'
print('L11 failure/pending evidence verified; gate remains open, delta0')
