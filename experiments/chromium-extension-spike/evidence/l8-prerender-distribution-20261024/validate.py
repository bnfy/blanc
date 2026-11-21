from pathlib import Path
import hashlib,json
r=Path(__file__).parent
entries={}
for line in (r/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert n not in entries and not Path(n).is_absolute() and '..' not in Path(n).parts
 p=r/n;assert p.is_file() and not p.is_symlink() and hashlib.sha256(p.read_bytes()).hexdigest()==h,n;entries[n]=h
assert set(entries)=={str(p.relative_to(r)) for p in r.rglob('*') if p.is_file() and p.name!='SHA256SUMS' or p.is_file() and p.parent.name=='artifact'}
def read(n):return json.loads((r/n).read_text())
a=read('packet-audit.json');assert a['regularFilesVerified']==458 and a['symlinksVerified']==5 and a['sourceTreeMatchesCommit'] and a['provenanceSubjectAndMaterialsBound'];assert all(v['exitCode']==0 for v in a['verification'].values())
e={'source':'14706b0e8d4753d2a7ef35ea32a875b516366b0d','archiveSha256':'18a0c2ca240f2200fee3e8b250fbade27b7b86ec1c1dd77c21a538a6776aa8cc','signer':'anthony@bnfy.me','issuer':'https://github.com/login/oauth'}
for n in ['manifest-verification.json','fresh-hosted-manifest-verification.json']:
 d=read(n);assert all(d[k]==v for k,v in e.items()) and d['authenticatedFiles']==4
assert all(x['rejected'] and x['exitCode']!=0 for x in read('negative-verification.json'))
u=read('draft-uploaded.json');assert u['draft'] and u['target_commitish']==e['source'] and len(u['assets'])==6
assert len(read('uploaded-byte-verification.json'))==6 and all(x['matched'] for x in read('uploaded-byte-verification.json'))
f=read('fresh-hosted-byte-verification.json');assert len(f)==6 and all(x['anonymousAssetGET']==200 and not x['accountAuthorizationForwarded'] for x in f)
n=read('native-download.json');assert n['source']==e['source'] and n['regularFilesVerified']==458 and n['symlinksVerified']==5 and 'Safari' in n['quarantine']['stdout'] and all(n[k]['exitCode']==0 for k in ['quarantine','codesign','gatekeeper','stapler'])
assert read('native-prelaunch.json')['matchingReplacementProcesses']==[]
s=read('status.json');assert s['nativeDownloadVerified'];assert s['nativeDownloadAccepted'] and s['ownerAcceptanceComplete'] and s['pending']==[] and s['electron']=='paused' and s['latency']=='deferred'
o=read('owner-acceptance.json');assert o['answer']=='All checks passed' and all(o['criteria'].values()) and o['sourceRevision']==e['source'] and o['archiveSha256']==e['archiveSha256']
p=read('owner-restart-postcheck.json')['runningCandidate'];assert p['source']==e['source'] and p['regularFilesMatched']==458 and p['symlinksMatched']==5
assert read('owner-state-replacement-owner-passed.json')['shippingFilesUnchangedSinceCurrentPreflight']
print(json.dumps({'evidenceMembers':len(entries),'hostedAssets':6,'pinnedIdentityVerified':True,'nativeAndOwnerAcceptance':'passed; L8 reaccepted, delta 0'}))
