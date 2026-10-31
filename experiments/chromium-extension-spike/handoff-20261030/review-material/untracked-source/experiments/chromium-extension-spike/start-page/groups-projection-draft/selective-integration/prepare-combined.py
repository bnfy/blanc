#!/usr/bin/env python3
"""Prepare one unbuilt, isolated search+groups candidate; never stage a checkout."""
import difflib,hashlib,importlib.util,json,shutil,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent;GROUPS=HERE.parent;SPIKE=GROUPS.parents[1];PREVIEW=SPIKE.parents[2]
SEARCH=SPIKE/'search-host-routing-draft';BASE=SPIKE/'start-page/launch-sunrise-integration-draft/ui-restored-base.cc';GROUP=GROUPS/'ui-candidate.cc';SEARCH_UI=SEARCH/'blanc_prototype_ui.candidate.cc'
PROV=HERE/'provenance-manifest-v2.json';OUTPUT=HERE/'combined-assets-v1';NATIVE=HERE/'combined-native-v1';RESULT=HERE/'combined-manifest.json'
SEARCH_RECEIPT_SHA='efdf044a1af9428c90fa74a49ce98c3cd535b4c5142a12405e3ea6884b19c10b'
EXPECTED_MODULES={
 'custom_template.cc':'cfecac0516a96d6eb62f9ed0f0171dccb3f9ac12747a652fc600a7c516277c0c',
 'custom_template.h':'d5e4d9e602a7fd74c604a6bfb44da5305e1402b828ecd9df8f080d30d10454ca',
 'selected_custom.cc':'f0adf7f8298beefa82f6662fdc22bda965fe505d6356e91e7a21baa277beba40',
 'selected_custom.h':'9ab2ad9c99cf640cef07947f4ec9782bf6a28a0d94e22f47b1cdc3a5d03e6e92',
 'selected_shipping.cc':'a3ec9e9244ae62205994c9e475ab85046479c661cb9419222d045c1b924e194d',
 'selected_shipping.h':'22cf60920620ed482df8286f9399feba8b595949805db6cdd4139a451147b7ee',
 'selected_shipping_browser.cc':'950d071452d53421a68f9887eb65226c8919c31bfa9536b92e81c258cf08a882',
}

def sha(data):return hashlib.sha256(data).hexdigest()
def readsha(p,expected):
 data=p.read_bytes()
 if sha(data)!=expected:raise ValueError('identity mismatch: '+p.name)
 return data
def loadprovenance():
 spec=importlib.util.spec_from_file_location('pinned_provenance',HERE/'generate-provenance.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
 p=json.loads(PROV.read_text())
 if p!=g.build():raise ValueError('provenance no longer matches durable inputs')
 return p,g
def merge_source():
 a=readsha(BASE,'75a8c1f7dd6f7488b35350628883a022424dd46b5ea462670dd9265127626070')
 b=readsha(GROUP,'ab7da9ea16b821746b22f1fb1fa66f9cd86aa7b9b2638432e3c95dc1a0294abf')
 c=readsha(SEARCH_UI,'d1c4037f17b3b2c80c2c05807de7c5d8e90d078f6083e6f6ca584334c985038f')
 old=a.decode().splitlines(keepends=True);new=b.decode().splitlines(keepends=True)
 ops=[x for x in difflib.SequenceMatcher(None,old,new,autojunk=False).get_opcodes() if x[0]!='equal']
 if len(ops)!=1 or ops[0][0]!='insert':raise ValueError('groups native delta is not one insertion')
 _,i,j,k,l=ops[0]
 if i!=j or l-k!=77 or i<8 or i+8>len(old):raise ValueError('unexpected insertion shape')
 before=''.join(old[i-8:i]).encode();after=''.join(old[i:i+8]).encode();insert=''.join(new[k:l]).encode()
 anchor=before+after
 if c.count(anchor)!=1:raise ValueError('search source insertion context is not unique')
 direct=c.replace(anchor,before+insert+after,1)
 merge=subprocess.run(['/usr/bin/git','merge-file','-p',str(SEARCH_UI),str(BASE),str(GROUP)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
 if merge.returncode!=0 or merge.stdout!=direct or sha(direct)!='e8cd2e37af0aeaf73f55d2afeee5afc10344fbb170dd444d68238aadcd67a76e':raise ValueError('native three-way merge not exact and conflict-free')
 return direct

def validate_module_map(mapping):
 if mapping!=EXPECTED_MODULES:raise ValueError('search module name/hash set mismatch')
def module_inputs():
 receipt=SEARCH/'unsafe-buffer-repair/native-receipt-built.json';data=readsha(receipt,SEARCH_RECEIPT_SHA);r=json.loads(data)
 if r.get('sourceSha256')!='d1c4037f17b3b2c80c2c05807de7c5d8e90d078f6083e6f6ca584334c985038f' or r.get('frameworkSha256')!='7428bc301fdaf9e2a559133e0e1ce2de5f8e6785a022a36313bdbfbb5d2bcaad':raise ValueError('unexpected search receipt')
 validate_module_map(r.get('moduleSha256'))
 files={name:readsha(SEARCH/'unsafe-buffer-repair/modules'/name,expected) for name,expected in EXPECTED_MODULES.items()}
 return receipt,r,files

def prepare():
 if OUTPUT.exists() or NATIVE.exists() or RESULT.exists():raise ValueError('refusing to overwrite a previous combined candidate')
 provenance,g=loadprovenance();merged=merge_source();receipt,r,modules=module_inputs()
 source=PREVIEW/'evidence/search-host-routing-20261029/preserved-assets-v1';shutil.copytree(source,OUTPUT,symlinks=False)
 if g.inventory(OUTPUT)!=provenance['assets']['preimage_inventory']:raise ValueError('copied preimage inventory mismatch')
 patches=json.loads((HERE/'manifest.json').read_text())['files']
 for name in ('renderer','adapter','css'):
  patch=HERE/(name+'.patch');item=patches[name]
  if sha(patch.read_bytes())!=item['patch_sha256']:raise ValueError('patch identity drift')
  target=OUTPUT/item['target'];readsha(target,item['preimage_sha256'])
  command=subprocess.run(['/usr/bin/patch','-p1','--fuzz=0','-i',str(patch)],cwd=OUTPUT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
  if command.returncode!=0:raise ValueError('isolated patch failed: '+name)
  readsha(target,item['candidate_sha256'])
 inventory=g.inventory(OUTPUT);expected=dict(provenance['assets']['preimage_inventory'])
 for name in ('renderer','adapter','css'):item=patches[name];expected[item['target']]={'sha256':item['candidate_sha256']}
 if inventory!=dict(sorted(expected.items())) or len(inventory)!=78:raise ValueError('combined asset inventory mismatch')
 out=NATIVE/'chrome/browser/ui';(out/'modules').mkdir(parents=True)
 (out/'blanc_prototype_ui.cc').write_bytes(merged)
 for name,data in modules.items():(out/'modules'/name).write_bytes(data)
 manifest={'status':'prepared_unbuilt_unverified','scope':'isolated search + groups candidate; no product stage, build or launch; existing checks do not qualify combined bytes',
 'provenance_sha256':sha(PROV.read_bytes()),'patch_manifest_sha256':sha((HERE/'manifest.json').read_bytes()),'generator_sha256':sha(Path(__file__).read_bytes()),
 'original_groups_manifest_sha256':provenance['assets']['candidate_manifest_sha256'],'original_groups_framework_sha256':provenance['build']['framework_sha256'],
 'original_search_receipt_sha256':sha(receipt.read_bytes()),'original_search_framework_sha256':r['frameworkSha256'],'native_preimage_sha256':sha(BASE.read_bytes()),
 'search_native_sha256':sha(SEARCH_UI.read_bytes()),'groups_native_sha256':sha(GROUP.read_bytes()),'combined_native_sha256':sha(merged),
 'module_sha256':{name:sha(data) for name,data in sorted(modules.items())},'asset_count':78,'asset_inventory':inventory,
 'preserved_search_assets':['host.js','overlay.js'],'changed_group_assets':[patches[n]['target'] for n in ('renderer','adapter','css')],
 'limitations':['GN dependency and module staging unverified for combined build','search epochs and group activation interactions untested','shipping visual, accessibility and mixed/private parity remain open']}
 with RESULT.open('x') as f:json.dump(manifest,f,sort_keys=True,indent=2);f.write('\n')
 print('prepared isolated combined assets and native source; not built')
if __name__=='__main__':prepare()
