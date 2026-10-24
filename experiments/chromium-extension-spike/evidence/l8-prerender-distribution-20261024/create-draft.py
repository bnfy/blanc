from pathlib import Path
import subprocess,json,hashlib
r=Path(__file__).parent;c=Path('/private/tmp/blanc-prerender-final-20261024');gh='/opt/homebrew/bin/gh';d=json.loads((c/'artifact-details.json').read_text());tag='blanc-chromium-preview-l8-20261024-14706b0e';artifacts=c/'artifacts'
assert (c/'manifest-verification.json').is_file(),'Pinned Sigstore verification required before uploading'
assert len(list(artifacts.iterdir()))==6 and (artifacts/'SHA256SUMS.sigstore.json').is_file()
def api(endpoint,*args):return json.loads(subprocess.check_output([gh,'api',endpoint,*args],text=True))
found=[];page=1
while True:
 batch=api('repos/bnfy/blanc/releases?per_page=100&page='+str(page));found.extend(x for x in batch if x['tag_name']==tag)
 if len(batch)<100:break
 page+=1
assert len(found)<=1,'Multiple drafts share this validation identity'
if found:created=found[0]
else:
 body='''Unpublished validation fixture for PR #1028. Not approved for public release.

Prerender utility-loss repair: source 14706b0e8d4753d2a7ef35ea32a875b516366b0d, Chromium 157.0.8103.15, Apple Silicon/macOS 27.2. Developer ID signed, Apple accepted and stapled; 72 bounded post-notarization checks passed. Authenticate SHA256SUMS as anthony@bnfy.me / https://github.com/login/oauth.

Native Safari download and second-machine acceptance for these exact bytes remain pending. Google upgrade and final release gates remain open. No public release, merge or hermetic reproduction claim. Google baseline separate; Electron paused; latency deferred.
'''
 payload={'tag_name':tag,'target_commitish':d['source'],'name':'Blanc Chromium Preview — L8 replacement validation (unpublished)','body':body,'draft':True,'prerelease':True,'make_latest':'false'};(r/'release-create.json').write_text(json.dumps(payload))
 created=api('repos/bnfy/blanc/releases','--method','POST','--input',str(r/'release-create.json'))
assert created['draft'] and created['target_commitish']==d['source']
(r/'draft-created.json').write_text(json.dumps(created,indent=2)+'\n')
existing={a['name']:a for a in api('repos/bnfy/blanc/releases/'+str(created['id']))['assets']}
for p in sorted(artifacts.iterdir()):
 if p.name in existing:
  assert existing[p.name]['size']==p.stat().st_size and existing[p.name]['digest']=='sha256:'+hashlib.sha256(p.read_bytes()).hexdigest(),p.name
 else:subprocess.run([gh,'release','upload',tag,str(p),'--repo','bnfy/blanc'],check=True)
uploaded=api('repos/bnfy/blanc/releases/'+str(created['id']));assert uploaded['draft'] and uploaded['target_commitish']==d['source'] and {a['name'] for a in uploaded['assets']}=={p.name for p in artifacts.iterdir()}
(r/'draft-uploaded.json').write_text(json.dumps(uploaded,indent=2)+'\n');print(json.dumps({'id':uploaded['id'],'url':uploaded['html_url'],'tag':tag,'assets':len(uploaded['assets']),'draft':True}))
