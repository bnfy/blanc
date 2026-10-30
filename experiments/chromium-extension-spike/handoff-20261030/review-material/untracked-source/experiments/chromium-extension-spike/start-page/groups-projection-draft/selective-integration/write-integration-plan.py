#!/usr/bin/env python3
"""Bind existing unbuilt candidate and prior GN references; stage nothing."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;GROUP=H.parent;SPIKE=GROUP.parents[1];PREVIEW=SPIKE.parents[2];SEARCH=SPIKE/'search-host-routing-draft';SRC=Path('<local-home>/Projects/BlancChromium158/src')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(p,want):
 if sha(p)!=want:raise ValueError('input drift: '+p.name)
 return want
def build():
 combined=check(H/'combined-manifest.json','37ca5d0c727758ef5f0c95c0fcc303ca9b9a797720253c524d7383543c4507a2')
 provenance=check(H/'provenance-manifest-v2.json','67b4cc48198170e55ac391bf6beb19b63ff43cd5f67c9de0fef563fa02a0c6a5')
 journal=PREVIEW/'evidence/search-host-routing-20261029/stage-158-transaction/journal.json'
 jsha=check(journal,'178e05883a74c06a817dbe1966572e0410235e3bdb780306ab27d957a8c2c712');j=json.loads(journal.read_text())
 entry=next(x for x in j['files'] if x['target']=='views/frame/BUILD.gn')
 if j['state']!='rolled-back' or entry['old']!='b663b8814097f9d6c9fdb7b6e8103c6d32955c390b86ed185e2dbbbc1fc7f4f1' or entry['new']!='f5015b3be510c840a2956d30cb2d418e8f561411902fec0fa8e53b2958ffb219':raise ValueError('unexpected prior GN journal')
 check(SRC/'chrome/browser/ui/views/frame/BUILD.gn',entry['old']);check(SEARCH/'BUILD.158-candidate.gn',entry['new'])
 return {'status':'prepared_not_staged','combined_manifest_sha256':combined,'provenance_manifest_v2_sha256':provenance,'plan_generator_sha256':sha(Path(__file__)),'prior_search_stage_journal_sha256':jsha,'gn_reference':{'state':'rolled-back','target':'chrome/browser/ui/views/frame/BUILD.gn','preimage_sha256':entry['old'],'candidate_sha256':entry['new'],'review_sha256':check(SEARCH/'gn-path-review-20261029.json','cc7d9b868fb78798479c3e0829232979d3debf0510b09576199c9b6472e11655'),'note':'reference only; combined graph and scope are not validated'},'qualifications':['unverified combined candidate; no stage/build/browser run','search and groups may interact via tab selection and epochs','reassess affected checks against combined bytes','preserve 157, profiles, caches, original evidence and separate Google baseline']}
if __name__=='__main__':
 data=(json.dumps(build(),indent=2,sort_keys=True)+'\n').encode();p=H/'integration-plan.json'
 if p.is_symlink():raise SystemExit('refusing symlink')
 if p.exists():
  if p.read_bytes()!=data:raise SystemExit('refusing overwrite')
 else:
  with p.open('xb') as f:f.write(data)
 print('wrote isolated integration plan')
