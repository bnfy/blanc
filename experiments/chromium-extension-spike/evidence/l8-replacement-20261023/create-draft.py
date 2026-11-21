from pathlib import Path
import subprocess,json,hashlib
r=Path(__file__).parent;c=Path('/private/tmp/blanc-l6-restore-final');gh='/opt/homebrew/bin/gh';d=json.loads((c/'artifact-details.json').read_text());tag='blanc-chromium-preview-l8-20261023-6b9a05a0';artifacts=c/'artifacts'
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
 body='''Unpublished L8 validation fixture for PR #1028; not approved for public distribution.

Developer ID signed, Apple accepted and stapled. Exact source6b9a05a0; Chromium157.0.8103.15, Apple Silicon/macOS27.2. All125 frozen signed checkpoints passed and L6 is accepted again. The checksum manifest must verify as anthony@bnfy.me through https://github.com/login/oauth before use.

The startup scheduling repair moves restoration after the native main-loop entry. L8 native download/quarantine/launch/restart and extension integration acceptance remain pending on this replacement. No public release, hosted-build/hermetic-reproduction, merge or final go/no-go approval is implied. Google baseline separate; latency and Electron diagnostic build pending.
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
