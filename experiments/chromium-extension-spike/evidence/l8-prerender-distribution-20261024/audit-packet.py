from pathlib import Path
import json,hashlib,subprocess,importlib.util,os,shutil
r=Path(__file__).parent;candidate=Path('/private/tmp/blanc-prerender-final-20261024');artifacts=candidate/'artifacts';details=json.loads((candidate/'artifact-details.json').read_text());source=details['source'];repo=Path('/private/tmp/blanc-chromium157-work')
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
checks=[]
for line in (artifacts/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert digest(artifacts/n)==h,n;checks.append({'name':n,'sha256':h,'matches':True})
inventory=json.loads(next(artifacts.glob('*.files.json')).read_text());prov=json.loads(next(artifacts.glob('*.provenance.json')).read_text());bom=json.loads(next(artifacts.glob('*.cdx.json')).read_text())
assert prov['subject']==[{'name':details['archive'],'digest':{'sha256':details['archiveSha256']}}]
params=prov['predicate']['buildDefinition']['externalParameters'];assert params['sourceRevision']==source and params['version']=='157.0.8103.15';materials=params['packageSource'];assert materials['sourceRevision']==source
assert subprocess.check_output(['git','rev-parse',source+'^{tree}'],cwd=repo,text=True).strip()==materials['sourceTree']
assert bom['metadata']['component']['version']=='157.0.8103.15';assert inventory['sourceRevision']==source and inventory['archiveSha256']==details['archiveSha256']
extracted=r/'archive-extracted';extracted.mkdir();subprocess.run(['ditto','-x','-k',str(artifacts/details['archive']),str(extracted)],check=True);app=extracted/'Blanc Chromium Preview.app'
actual_files={str(p.relative_to(app)) for p in app.rglob('*') if p.is_file() and not p.is_symlink()};actual_links={str(p.relative_to(app)) for p in app.rglob('*') if p.is_symlink()};assert actual_files==set(inventory['files']) and actual_links==set(inventory['symlinks'])
for n,record in inventory['files'].items():assert digest(app/n)==record['sha256'] and (app/n).stat().st_size==record['size'],n
for n,target in inventory['symlinks'].items():assert os.readlink(app/n)==target and app in (app/n).resolve().parents,n
resources=app/'Contents/Resources';spec=importlib.util.spec_from_file_location('compliance',repo/'experiments/chromium-extension-spike/preview/compliance.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
m=module.validate(resources/'Compliance',resources/'BlancAssets',resources/'BlancBlocker',details['version'],source);assert materials==json.loads((resources/'Compliance/source-materials.json').read_text())
spdx=json.loads((resources/'Compliance/chromium.spdx.json').read_text());results={}
for name,command in [('codesign',['codesign','--verify','--deep','--strict',str(app)]),('stapler',['xcrun','stapler','validate',str(app)]),('gatekeeper',['spctl','--assess','--type','execute','--verbose=4',str(app)])]:
 p=subprocess.run(command,capture_output=True,text=True);results[name]={'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr};assert p.returncode==0,results[name]
out={'sourceRevision':source,'version':details['version'],'archiveSha256':details['archiveSha256'],'manifestDigestMatches':checks,'regularFilesVerified':len(actual_files),'symlinksVerified':len(actual_links),'sourceTreeMatchesCommit':True,'provenanceSubjectAndMaterialsBound':True,'complianceValidated':True,'componentCount':m['componentCount'],'nativeLicenseComponents':len(spdx['packages']),'fullNativeLicenseTexts':len(spdx['hasExtractedLicensingInfos']),'verification':results,'limits':['Local archive extraction, not a native browser download or quarantine proof','Sigstore manifest authentication pending','No app launched or profile modified','Not independent hermetic reproduction or a hosted-build attestation']}
(r/'packet-audit.json').write_text(json.dumps(out,indent=2)+'\n');shutil.rmtree(extracted);print(json.dumps({k:v for k,v in out.items() if k not in ['verification','manifestDigestMatches']}))
