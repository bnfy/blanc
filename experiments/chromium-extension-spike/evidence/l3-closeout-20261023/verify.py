import json,hashlib,subprocess,datetime
from pathlib import Path
r=Path('/private/tmp/blanc-l3-closeout');repo=Path('/private/tmp/blanc-chromium157-work');src=Path('/private/tmp/blanc-chromium157-update/src')
old=json.loads((repo/'experiments/chromium-extension-spike/evidence/beta15-update-20261022/security-source-check.json').read_text())
result={'observedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceHead':subprocess.check_output(['git','-C',str(src),'rev-parse','HEAD'],text=True).strip(),'fixes':[],'files':[],'dependencyPins':[]}
assert result['sourceHead']=='1aa07b638799e59656559ae6c6649d4b197f555e'
for row in old['fixes']:
 p=subprocess.run(['git','-C',str(src),'merge-base','--is-ancestor',row['commit'],'HEAD']);assert p.returncode==0,row
 result['fixes'].append({'commit':row['commit'],'included':True})
for row in old['files']:
 digest=hashlib.sha256((src/row['path']).read_bytes()).hexdigest();assert digest==row['sha256'],row
 result['files'].append({'path':row['path'],'sha256':digest,'matchesReviewedTarget':True})
pins=json.loads((repo/'experiments/chromium-extension-spike/evidence/beta15-update-20261022/dependency-pins.json').read_text())
for folder,pin in pins.items():
 head=subprocess.check_output(['git','-C',str(src/folder),'rev-parse','HEAD'],text=True).strip();assert head==pin,folder
 result['dependencyPins'].append({'path':folder,'revision':head,'matchesReviewedPin':True})
result['currentInventory']=json.loads(Path('/private/tmp/blanc-l7-repair/inventory-final.json').read_text())
result['candidate']=json.loads(Path('/private/tmp/blanc-l7-repair/final-artifact.json').read_text())
result['maintenanceDecision']=json.loads((repo/'experiments/chromium-extension-spike/evidence/l3-baseline-review-20261022/maintenance-decision.json').read_text())
(r/'verified-baseline.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'upstream':result['sourceHead'],'includedSecurityFixes':len(result['fixes']),'matchingFiles':len(result['files']),'dependencyPins':len(result['dependencyPins']),'patchFiles':result['currentInventory']['upstream_files'],'patchHunks':result['currentInventory']['hunks']}))
