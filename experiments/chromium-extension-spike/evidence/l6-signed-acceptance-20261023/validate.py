from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parent
summary=json.loads((root/'summary.json').read_text())
assert summary['archiveSHA256']=='4c86c89e7ec81791ef8bedf525187b302c313f913a5e5b07a26d4d2a45b9ef00'
assert summary['totalPassingCheckpoints']==49 and len(summary['schedules'])==8
assert summary['L6']=='accepted for this signed candidate'
owner=json.loads((root/'owner-acceptance.json').read_text())
assert owner['answer']=='Accept mapped UI evidence; close L6'
assert owner['archiveSHA256']==summary['archiveSHA256']
assert summary['freshRecoveryUIObservation'] is False
for s in summary['schedules']:
 report=json.loads((root/s['report']).read_text())
 assert report.get('complete',report.get('pass')) is True,s
 assert len(report['checks'])==s['checks'],s
 assert not report.get('error'),s
 assert all(c.get('pass',True) is True for c in report['checks']),s
assert json.loads((root/'grouped/runtime.json').read_text())['checks'][-1]['value']['exitCode']==0
assert json.loads((root/'artifact-after.json').read_text())['unchanged'] is True
assert all(x['sameSource'] for x in json.loads((root/'recovery-ui-source-map.json').read_text())['revisions'])
for name,digest in json.loads((root/'SHA256.json').read_text()).items():
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
print('Eight final schedules / 49 checkpoints; artifact and source mapping; all evidence hashes verified.')
