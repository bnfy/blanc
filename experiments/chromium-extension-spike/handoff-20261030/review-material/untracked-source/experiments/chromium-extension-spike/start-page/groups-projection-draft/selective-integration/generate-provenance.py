#!/usr/bin/env python3
"""Create an isolated, hash-bound provenance manifest; never write source trees."""
import hashlib,json,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
GROUPS=HERE.parent;SPIKE=GROUPS.parents[1];PREVIEW=SPIKE.parents[2]
G=PREVIEW/'evidence/start-page-groups-20261029';SEARCH=PREVIEW/'evidence/search-host-routing-20261029'
SRC=Path('<local-home>/Projects/BlancChromium158/src')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def checked(p,expected):
 h=sha(p)
 if h!=expected:raise ValueError('durable identity mismatch: '+p.name)
 return h
def inventory(root):
 found={}
 for p in root.rglob('*'):
  if p.is_symlink():raise ValueError('asset symlink not accepted')
  if p.is_file():found[p.relative_to(root).as_posix()]={'sha256':sha(p)}
 return dict(sorted(found.items()))
def build():
 patch_manifest=HERE/'manifest.json';patches=json.loads(patch_manifest.read_text())
 for name,v in patches['files'].items():checked(HERE/(name+'.patch'),v['patch_sha256'])
 stage=G/'stage-groups1/transaction.json';checked(stage,'94547d6a0072858aad43a87411f2e728b94857bcae5fc2ada742514ce973cf9e')
 transaction=json.loads(stage.read_text());base=inventory(SEARCH/'preserved-assets-v1')
 if len(base)!=78 or base!=transaction['searchAssets']:raise ValueError('78-file unverified preimage inventory mismatch')
 output_manifest=GROUPS/'manifest-visible-v2.json';checked(output_manifest,'ad4ae8585d0c4617464b92c4b35ae063d1512eb6c50f88c3104d8a0b47cefa54')
 output=json.loads(output_manifest.read_text());candidate=inventory(GROUPS/'assets-visible-v2')
 changed=sorted(k for k in set(base)|set(candidate) if base.get(k)!=candidate.get(k))
 if changed!=['host.js','overlay.js','pages/newtab-adapter.js','pages/newtab-prototype.css','pages/newtab.js']:raise ValueError('unexpected 78-file delta')
 if len(candidate)!=78 or {k:v['sha256'] for k,v in candidate.items()}!=output['assets']:raise ValueError('78-file candidate inventory mismatch')
 receipt=G/'build-closure1/receipt.json';checked(receipt,'a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23')
 build_receipt=json.loads(receipt.read_text());search_receipt=SEARCH/'preserved-candidate-receipt.json';checked(search_receipt,'ab141b1d916134af1df7a37a18f902c32a794ffad8490500c4dca70c5495f335')
 if 'Unverified candidate' not in json.loads(search_receipt.read_text())['scope']:raise ValueError('unexpected preimage provenance')
 checked(G/'build-closure1/guard.log','bd3e193a067a449f20bfde39103c696274340837dbd38d3a07f52335179d907a')
 checked(G/'build-closure1/app-inventory.json','0ba944b62fbaa465d56473d5b0518e77904d1d1bf683b6d87005d0595794e788')
 checked(GROUPS/'asset-only-visible-v2-link.json','f0ab9cb5054e7a67086302823de8b37b533736c21e0bff74f43f192ddb594e12')
 for f,h in (('fore1.json','eb3942b66f845629e836650a86e413c8843b76d1fe6e7a608cc832db4ba52199'),('layouts1.json','2634d7407cbee8f309f133d8e43e3f79a746f014db9b9d1795d0783de794d0b0')):checked(G/f,h)
 head=subprocess.check_output(['/usr/bin/git','-C',str(SRC),'rev-parse','HEAD'],text=True,timeout=5).strip()
 repo_head=subprocess.check_output(['/usr/bin/git','-C',str(PREVIEW/'repo'),'rev-parse','HEAD'],text=True,timeout=5).strip()
 if head!='681cd621e82e606d7536eae8ea2576afb3c7d65c':raise ValueError('Chromium checkout revision drift')
 args=SRC/'out/BlancPrototype/args.gn';checked(args,build_receipt['environment']['argsSha256'])
 renderer_manifest=SPIKE/'renderer-1.44.1/manifest.json';checked(renderer_manifest,'7e1feb0f221719515177c294a436feb69d64da8057c6bc8d9b103f15475ce0b3')
 return {
  'scope':'isolated reconstruction only; 158 preimage assets are from an unverified combined search candidate, not clean shipping; no complete assembly or release qualification',
  'patch_manifest_sha256':sha(patch_manifest),'prior_provenance_manifest_sha256':sha(HERE/'provenance-manifest.json'),
  'producer_sha256':{'generate.py':sha(HERE/'generate.py'),'generate-provenance.py':sha(HERE/'generate-provenance.py'),'renderer-transform.mjs':sha(HERE/'renderer-transform.mjs')},
  'chromium':{'version':'158.0.8127.2','verified_tag':'681cd621e82e606d7536eae8ea2576afb3c7d65c','checkout_head_observed':head,'checkout_note':'HEAD observed during journal creation; working tree contains staged changes; build receipt does not itself record HEAD'},
  'repository':{'head_observed':repo_head,'note':'repository working tree has uncommitted work; this HEAD does not capture it'},
  'shipping_reference':{'release':'1.45.0','source_commit':'6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d','note':'reference recorded in existing 2026-10-29 review; the unverified combined preimage is not shown to be this clean release','renderer_extraction_version':'1.44.1','renderer_extraction_source':'3b0c000b569ee33a1548dd1b9a60817fae9288a6','renderer_extraction_manifest_sha256':sha(renderer_manifest)},
  'build':{'receipt_sha256':sha(receipt),'stage_transaction_sha256':sha(stage),'guard_sha256':sha(G/'build-closure1/guard.log'),'app_inventory_sha256':sha(G/'build-closure1/app-inventory.json'),'framework_sha256':build_receipt['frameworkSha256'],'environment_recorded':build_receipt['environment'],'current_args_sha256':sha(args)},
  'assets':{'preimage_scope':json.loads(search_receipt.read_text())['scope'],'preimage_receipt_sha256':sha(search_receipt),'preimage_count':78,'preimage_inventory':base,'candidate_manifest_sha256':sha(output_manifest),'candidate_count':78,'candidate_inventory':candidate,'changed_assets':changed,'non_group_changes':['host.js','overlay.js'],'non_group_note':'candidate host and overlay differ from the unverified search preimage and reverse search-routing draft changes; the four groups patches alone cannot reconstruct the whole 78-file candidate or preserve that draft simultaneously','asset_link_sha256':sha(GROUPS/'asset-only-visible-v2-link.json'),'note':'preimage already includes non-groups search, Sunrise, Top Sites, pins and other combined changes; not independently verified as a complete shipping assembly'},
  'browser_evidence':{'fore1_sha256':sha(G/'fore1.json'),'layouts1_sha256':sha(G/'layouts1.json'),'scope':'isolated group checks; fixture hashes not embedded in those receipts'}
 }
if __name__=='__main__':
 result=(json.dumps(build(),sort_keys=True,indent=2)+'\n').encode();p=HERE/'provenance-manifest-v2.json'
 if p.is_symlink():raise SystemExit('refusing symlink')
 if p.exists():
  if p.read_bytes()!=result:raise SystemExit('refusing to replace existing provenance manifest')
 else:
  with p.open('xb') as f:f.write(result)
 print('wrote isolated provenance manifest')
