#!/usr/bin/env python3
"""Bind the existing isolated candidate to pinned inputs; never rewrite it."""
import hashlib,importlib.util,json
from pathlib import Path
H=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('combined',H/'prepare-combined.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def build():
 prior=H/'combined-manifest.json';old=json.loads(prior.read_text());provenance,g=m.loadprovenance()
 if sha(prior)!='37ca5d0c727758ef5f0c95c0fcc303ca9b9a797720253c524d7383543c4507a2':raise ValueError('prior combined manifest drift')
 native=m.merge_source();receipt,r,modules=m.module_inputs()
 if (m.NATIVE/'chrome/browser/ui/blanc_prototype_ui.cc').read_bytes()!=native:raise ValueError('combined source drift')
 for name,data in modules.items():
  if (m.NATIVE/'chrome/browser/ui/modules'/name).read_bytes()!=data:raise ValueError('combined module drift')
 inventory=g.inventory(m.OUTPUT)
 if inventory!=old['asset_inventory'] or len(inventory)!=78:raise ValueError('combined inventory drift')
 plan=H/'integration-plan.json';plan_data=json.loads(plan.read_text())
 if sha(plan)!='2c9275f5416874025bae5cef58268d66c3b1751b4f2e489be71bc902bcb1a739':raise ValueError('GN plan drift')
 if plan_data['gn_reference']['preimage_sha256']!='b663b8814097f9d6c9fdb7b6e8103c6d32955c390b86ed185e2dbbbc1fc7f4f1' or plan_data['gn_reference']['candidate_sha256']!='f5015b3be510c840a2956d30cb2d418e8f561411902fec0fa8e53b2958ffb219':raise ValueError('GN reference drift')
 old.update({'previous_combined_manifest_sha256':sha(prior),'generator_sha256':sha(H/'prepare-combined.py'),'binding_generator_sha256':sha(Path(__file__)),'integration_plan_sha256':sha(plan),'gn_reference':plan_data['gn_reference'],'search_receipt_sha256_pinned':m.SEARCH_RECEIPT_SHA,'module_sha256':dict(sorted(m.EXPECTED_MODULES.items())),'scope':'isolated unbuilt and unverified combined candidate; no prior receipt grants combined behavior credit'})
 return old
if __name__=='__main__':
 p=H/'combined-manifest-v2.json';data=(json.dumps(build(),indent=2,sort_keys=True)+'\n').encode()
 if p.is_symlink():raise SystemExit('refusing symlink')
 if p.exists():
  if p.read_bytes()!=data:raise SystemExit('refusing overwrite')
 else:
  with p.open('xb') as f:f.write(data)
 print('bound isolated combined candidate to pinned modules and GN reference')
