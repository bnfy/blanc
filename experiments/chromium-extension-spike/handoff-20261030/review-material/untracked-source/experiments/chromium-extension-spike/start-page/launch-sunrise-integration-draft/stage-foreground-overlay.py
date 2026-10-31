"""Create an isolated foreground-v2 source overlay, without staging 158."""
from pathlib import Path
import hashlib,json,shutil
h=Path(__file__).resolve().parent;old=h/'overlay';new=h/'overlay-foreground-v2'
old_manifest=json.loads((h/'overlay-manifest.json').read_text());candidate=json.loads((h/'foreground-v2-hashes.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert not new.exists()
for name,digest in old_manifest['overlay'].items():assert sha(old/name)==digest,name
assert sha(h/'launch-sunrise-foreground-v2.inc')==candidate['candidate']
assert sha(h/'foreground_membership.h')==candidate['header']
assert sha(h/'ui-foreground-v2.cc')==candidate['uiCandidate']
shutil.copytree(old,new)
files={'chrome/browser/ui/launch_sunrise_integration.inc':h/'launch-sunrise-foreground-v2.inc',
       'chrome/browser/ui/foreground_membership.h':h/'foreground_membership.h',
       'chrome/browser/ui/blanc_prototype_ui.cc':h/'ui-foreground-v2.cc'}
for relative,source in files.items():shutil.copy2(source,new/relative)
old_manifest['overlay']={str(p.relative_to(new)):sha(p) for p in sorted(new.rglob('*')) if p.is_file()}
(h/'overlay-foreground-v2-manifest.json').write_text(json.dumps(old_manifest,indent=2)+'\n')
print('Staged isolated v2 source overlay only')
