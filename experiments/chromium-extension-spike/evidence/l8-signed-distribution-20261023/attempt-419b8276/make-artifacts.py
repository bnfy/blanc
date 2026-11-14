from pathlib import Path
import hashlib,json,datetime,uuid,shutil,os,subprocess
r=Path(__file__).parent;app=r/'Blanc Chromium Preview.app';resources=app/'Contents/Resources'
assert (r/'notarization-complete').exists(),'Apple acceptance/stapling is pending'
notary=json.loads((r/'notary-result.json').read_text());assert notary['status']=='Accepted'
subprocess.run(['python3',str(r/'audit-candidate.py'),'final'],check=True)
source=(r/'source-revision').read_text().strip();metadata=json.loads((resources/'preview-build.json').read_text());assert metadata['revision']==source
version=metadata['version'];stem='Blanc-Chromium-Preview-'+version+'-'+source[:8];out=r/'artifacts';out.mkdir(exist_ok=False)
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def write(name,value):(out/name).write_text(json.dumps(value,indent=2,sort_keys=True)+'\n')
archive=out/(stem+'-arm64.zip');subprocess.run(['cp','-c',str(r/'Blanc-Chromium-Preview-stapled.zip'),str(archive)],check=True);sha=digest(archive)
shutil.copyfile(resources/'Compliance/runtime-sbom.cdx.json',out/(stem+'.cdx.json'))
files={};links={}
for p in sorted(app.rglob('*')):
 name=p.relative_to(app).as_posix()
 if p.is_symlink():
  if app not in p.resolve().parents:raise ValueError('External app symlink '+name)
  links[name]=os.readlink(p)
 elif p.is_file():files[name]={'sha256':digest(p),'size':p.stat().st_size}
write(stem+'.files.json',{'sourceRevision':source,'version':version,'archiveSha256':sha,'files':files,'symlinks':links,'signatureAudit':json.loads((r/'final-candidate-audit.json').read_text()),'notarization':notary,'runtimeVerification':json.loads((r/'local-runtime-summary.json').read_text())})
materials=json.loads((resources/'Compliance/source-materials.json').read_text())
provenance={'_type':'https://in-toto.io/Statement/v1','subject':[{'name':archive.name,'digest':{'sha256':sha}}],
'predicateType':'https://slsa.dev/provenance/v1','predicate':{
 'buildDefinition':{'buildType':'https://github.com/bnfy/blanc/blob/'+source+'/experiments/chromium-extension-spike/preview/README.md',
  'externalParameters':{'sourceRevision':source,'version':version,'target':'Apple Silicon macOS 27 (tested 27.2)','nativeOutput':'out/BlancPrototype','packageSource':materials},
  'internalParameters':{'nativeCompilationInThisPackagingStep':False,'execution':'Existing local guarded incremental native output; Developer ID signing on the separate release Mac; Apple notarization. No hosted-build, independent-rebuild or SLSA-level claim.'},
  'resolvedDependencies':[{'uri':'git+https://github.com/bnfy/blanc','digest':{'gitCommit':source}},{'uri':'git+https://chromium.googlesource.com/chromium/src','digest':{'gitCommit':materials['nativeUpstreamRevision']}},{'name':'source-materials.json','digest':{'sha256':digest(resources/'Compliance/source-materials.json')}}]},
 'runDetails':{'builder':{'id':'https://github.com/bnfy/blanc/local-preview-packager'},'metadata':{'invocationId':str(uuid.uuid4()),'startedOn':metadata['packagedAt'],'finishedOn':datetime.datetime.now(datetime.timezone.utc).isoformat()},'byproducts':[{'name':'Apple notarization','annotations':{'id':notary['id'],'status':'Accepted'}},{'name':'runtime-sbom.cdx.json','digest':{'sha256':digest(out/(stem+'.cdx.json'))}}]}}}
write(stem+'.provenance.json',provenance)
(r/'artifact-details.json').write_text(json.dumps({'stem':stem,'source':source,'version':version,'archive':archive.name,'archiveSha256':sha,'notary':notary['id'],'regularFiles':len(files),'symlinks':len(links)},indent=2)+'\n')
subprocess.run(['/usr/local/bin/node','scripts/create-checksums.mjs',str(out)],cwd='/private/tmp/blanc-chromium157-work',check=True)
print(json.dumps({'artifact':archive.name,'sha256':sha,'regularFiles':len(files),'symlinks':len(links)}))
