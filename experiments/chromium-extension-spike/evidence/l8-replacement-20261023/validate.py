from pathlib import Path
import hashlib,json,argparse,subprocess
r=Path(__file__).parent;parser=argparse.ArgumentParser();parser.add_argument('--cosign');args=parser.parse_args()
entries={}
for line in (r/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert n not in entries and not Path(n).is_absolute() and '..' not in Path(n).parts
 p=r/n;assert p.is_file() and not p.is_symlink() and hashlib.sha256(p.read_bytes()).hexdigest()==h,n;entries[n]=h
assert set(entries)=={str(p.relative_to(r)) for p in r.rglob('*') if p.is_file() and p!=r/'SHA256SUMS'}
def read(name):return json.loads((r/name).read_text())
a=read('packet-audit.json');assert a['regularFilesVerified']==458 and a['symlinksVerified']==5 and a['sourceTreeMatchesCommit'] and a['provenanceSubjectAndMaterialsBound'] and all(v['exitCode']==0 for v in a['verification'].values())
expected={'source':'6b9a05a00f321bfbde617c181103d5a455ff45f3','archiveSha256':'a7fe468c648e1b3d096a49e663e06b182bb483353fb5c4bb1c37dc8349994aca','signer':'anthony@bnfy.me','issuer':'https://github.com/login/oauth'}
for path in ['manifest-verification.json','remote-manifest-verification.json','fresh-hosted-manifest-verification.json']:
 d=read(path);assert all(d[k]==v for k,v in expected.items()) and d['authenticatedFiles']==4
assert len(read('negative-verification.json'))==2 and all(x['rejected'] and x['exitCode']!=0 for x in read('negative-verification.json'))
u=read('draft-uploaded.json');assert u['draft'] and u['target_commitish']==expected['source'] and len(u['assets'])==6
assert len(read('uploaded-byte-verification.json'))==6 and all(x['matched'] for x in read('uploaded-byte-verification.json'))
f=read('fresh-hosted-byte-verification.json');assert len(f)==6 and all(x['anonymousAssetGET']==200 and not x['accountAuthorizationForwarded'] for x in f)
assert read('owner-state-replacement-before.json')['shippingFilesUnchanged']
n=read('native-download.json');assert n['source']==expected['source'] and n['regularFilesVerified']==458 and n['symlinksVerified']==5 and 'Safari' in n['quarantine']['stdout'] and all(n[k]['exitCode']==0 for k in ['quarantine','codesign','gatekeeper','stapler'])
assert read('native-prelaunch.json')['downloadedPreviewProcesses']==[]
s=read('status.json');assert s['gate']=='L8 accepted' and s['pending']==[] and not s['draft']['published'] and s['readiness']=='9/12,delta+1L8'
o=read('owner-acceptance.json');assert o['answer']=='All checks passed' and all(o['criteria'].values()) and o['sourceRevision']==expected['source'] and o['archiveSha256']==expected['archiveSha256']
p=read('native-post-owner.json')['runtimeBinding'];assert p['runtimeBytesMatchAuthenticatedDownloadedCandidate'] and p['sourceRevision']==expected['source'] and p['allRegularFilesVerified']==458 and p['allSymlinksVerified']==5
assert read('owner-state-replacement-owner-passed.json')['shippingFilesUnchanged']
m=read('prior-controls-source-map.json');assert m['allSevenUIBlockerAssetsUnchanged'] and m['allTenBundleIdentitiesUnchanged'] and m['sameDeveloperIDAuthorityAndTeam'] and m['runtimeRecipeChanges']==['experiments/chromium-extension-spike/startup-session.mjs']
fresh=read('fresh-profile-smoke.json');assert fresh['complete'] and len(fresh['checks'])==3 and all(c['pass'] for c in fresh['checks'])
cleanup=read('fresh-profile-cleanup.json');assert cleanup['disposableProfileRemoved'] and not cleanup['permanentProfilesCopiedOrReset'] and not cleanup['googleProfileTouched'] and cleanup['sourceRevision']==expected['source']
if args.cosign:subprocess.run([args.cosign,'verify-blob','--bundle',str(r/'artifact/SHA256SUMS.sigstore.json'),'--certificate-identity',expected['signer'],'--certificate-oidc-issuer',expected['issuer'],str(r/'artifact/SHA256SUMS')],check=True)
print(json.dumps({'evidenceMembers':len(entries),'hostedFiles':6,'pinnedAuthenticationVerified':True,'actualTamperControlsReject':True,'readiness':'9/12,delta+1L8','L8':'accepted for exact signed candidate;no release approval'}))
