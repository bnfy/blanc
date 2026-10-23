from pathlib import Path
import hashlib,json,gzip
r=Path(__file__).parent
members={}
for line in (r/'SHA256SUMS').read_text().splitlines():
 digest,name=line.split('  ',1);assert name not in members;assert not Path(name).is_absolute() and '..' not in Path(name).parts
 p=r/name;assert p.is_file() and not p.is_symlink();assert hashlib.sha256(p.read_bytes()).hexdigest()==digest,name;members[name]=digest
actual={str(p.relative_to(r)) for p in r.rglob('*') if p.is_file() and p.name!='SHA256SUMS'}
# Nested artifact/SHA256SUMS is itself a hashed evidence member.
actual.add('artifact/SHA256SUMS');assert actual==set(members),(actual-set(members),set(members)-actual)
def read(name):return json.loads((r/name).read_text())
s=read('signed-qualification/local-runtime-summary.json');assert s['totalPassingCheckpoints']==125 and s['recoveryPassingCheckpoints']==92
assert s['sourceRevision']=='6b9a05a00f321bfbde617c181103d5a455ff45f3'
for row in s['schedules']:
 d=read('signed-qualification/'+row['report']);assert not d.get('error');assert len(d['checks'])==row['passingCheckpoints']
 if row['schedule'] in ['private-lifecycle','grouped-windows-spaces','native-cancellation-close']:assert d['pass'] is True and all('value' in c for c in d['checks'])
 else:assert all(c.get('pass') is True for c in d['checks'])
assert sum(x['passingCheckpoints'] for x in s['schedules'])==125
assert read('signed-qualification/frozen-before.json')==read('signed-qualification/frozen-after.json')
f=read('signed-qualification/frozen-complete.json');assert f['notarizationCompletedBeforeTests'] and f['allMemberBytesAndSymlinksUnchanged'] and f['members']==463 and all(x['exitCode']==0 for x in f['suites'])
assert read('signed-qualification/post-ordering-frozen.json')['allMemberBytesAndSymlinksUnchanged']
a=read('signed-qualification/artifact-details.json');assert a['archiveSha256']=='a7fe468c648e1b3d096a49e663e06b182bb483353fb5c4bb1c37dc8349994aca'
assert a['regularFiles']==458 and a['symlinks']==5
n=read('signed-qualification/notary-result.json');assert n['status']=='Accepted' and n['id']==a['notary']
b=read('signed-qualification/signed-candidate-audit.json');c=read('signed-qualification/final-candidate-audit.json');assert b['machO']==c['machO'] and b['assets']==c['assets'] and b['compliance']==c['compliance'];assert len(c['machO'])==17 and len(c['assets'])==7
for mode in ['old','fixed','final']:
 d=read('ordering/'+mode+'/report.json');assert d['complete'] and not d.get('error');m=d['mainMarkers'][0];loops=[e for e in d['restoreMarkers'] if e['pid']==m['pid'] and e['tid']==m['tid']];assert loops
 assert all(e['ts']>m['ts'] for e in loops)==(mode!='old'),mode
 # Compressed raw traces remain parseable independent source evidence.
 trace=json.loads(gzip.decompress((r/'ordering'/mode/'startup.json.gz').read_bytes()));assert trace.get('traceEvents')
u=read('signed-qualification/unchanged-source-map.json');assert len(u['assets'])==7 and all(v['identicalToOwnerConfirmed7065'] for v in u['assets'].values());assert u['recoveryUI']['identicalToOwnerConfirmed7065']
print(json.dumps({'verifiedEvidenceMembers':len(members),'finalPassingCheckpoints':125,'recoveryPassingCheckpoints':92,'oldNegativeControlFailsOrdering':True,'finalCandidatePassesOrdering':True,'frozenMembers':463,'gate':'L6 accepted;8/12, delta+1;L4/L8/L11/L12 remain open'}))
