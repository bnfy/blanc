#!/usr/bin/env python3
"""Reconstruct reviewed 158-only patch files in this isolated draft directory."""
import difflib, hashlib, json
from pathlib import Path
HERE=Path(__file__).resolve().parent
GROUPS=HERE.parent
SPIKE=GROUPS.parents[1]
PREVIEW=SPIKE.parents[2]
BASE=PREVIEW/'evidence/search-host-routing-20261029/preserved-assets-v1/pages'
CASES={
 'native':(SPIKE/'start-page/launch-sunrise-integration-draft/ui-restored-base.cc',GROUPS/'ui-candidate.cc','chrome/browser/ui/blanc_prototype_ui.cc','75a8c1f7dd6f7488b35350628883a022424dd46b5ea462670dd9265127626070','ab7da9ea16b821746b22f1fb1fa66f9cd86aa7b9b2638432e3c95dc1a0294abf'),
 'renderer':(BASE/'newtab.js',GROUPS/'assets-visible-v2/pages/newtab.js','pages/newtab.js','ab12f106b14675816316de3ec99e22fc4d9720ff5767feb1cc6129264091fddb','d986a76148ede29bfc3429f03c9557238ac88f5a37471b6f8e4f8337dc5f9f89'),
 'adapter':(BASE/'newtab-adapter.js',GROUPS/'assets-visible-v2/pages/newtab-adapter.js','pages/newtab-adapter.js','d524fec7c1ad4f84a0baf4563a357fa1cca09f4cd38f1b819c1d49a8133e0ce1','7d076052cd9a62990eb2a6d47d3b720515c5f3ea3a06abc0030164a329ba621c'),
 'css':(BASE/'newtab-prototype.css',GROUPS/'assets-visible-v2/pages/newtab-prototype.css','pages/newtab-prototype.css','01057613fb07da702ddea15350fba0adc6c6325263aedc71f0a6d4bf3473a352','0d5c60f962dc5228e14cdbb7961e41ed3e3b672045a3d62f39a9b697675da225'),
}
def digest(data):return hashlib.sha256(data).hexdigest()
def patches():
 out={}
 for name,(base,candidate,target,old_hash,new_hash) in CASES.items():
  old=base.read_bytes();new=candidate.read_bytes()
  if digest(old)!=old_hash or digest(new)!=new_hash:raise ValueError(f'{name}: preimage or candidate identity mismatch')
  if not old.endswith(b'\n') or not new.endswith(b'\n'):raise ValueError(f'{name}: unsupported newline state')
  diff=''.join(difflib.unified_diff(old.decode().splitlines(keepends=True),new.decode().splitlines(keepends=True),fromfile='a/'+target,tofile='b/'+target,n=3)).encode()
  out[name]=(diff,{'target':target,'preimage_sha256':old_hash,'candidate_sha256':new_hash,'patch_sha256':digest(diff)})
 return out
if __name__=='__main__':
 generated=patches(); manifest={'scope':'isolated exact Chromium 158 combined-base reconstruction; not a 157 patch','files':{k:v[1] for k,v in generated.items()}}
 def keep_or_create(p,data):
  if p.is_symlink():raise SystemExit(f'refusing symlink {p.name}')
  if p.exists():
   if not p.is_file() or p.read_bytes()!=data:raise SystemExit(f'refusing to overwrite changed {p.name}')
   return
  with p.open('xb') as f:f.write(data)
 for k,(data,_) in generated.items():keep_or_create(HERE/(k+'.patch'),data)
 data=(json.dumps(manifest,indent=2,sort_keys=True)+'\n').encode()
 keep_or_create(HERE/'manifest.json',data)
 print('wrote isolated patch bundle')
