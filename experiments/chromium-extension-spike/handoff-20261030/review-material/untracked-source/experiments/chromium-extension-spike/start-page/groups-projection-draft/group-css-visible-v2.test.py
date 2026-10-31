"""Static asset-delta checks only; no browser or CSS rendering claim."""
from pathlib import Path
import hashlib,json,re
h=Path(__file__).resolve().parent;old=h/'assets-v1';new=h/'assets-visible-v2';base=json.loads((h/'manifest.json').read_text());candidate=json.loads((h/'manifest-visible-v2.json').read_text());link=json.loads((h/'asset-only-visible-v2-link.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert base['overlay']==candidate['overlay'];assert set(base['assets'])==set(candidate['assets']) and len(base['assets'])==78
assert [x for x in base['assets'] if base['assets'][x]!=candidate['assets'][x]]==['pages/newtab-prototype.css']
for root,manifest in ((old,base),(new,candidate)):
 files={str(p.relative_to(root)):sha(p) for p in root.rglob('*') if p.is_file() and not p.is_symlink()};assert files==manifest['assets'];assert not any(p.is_symlink() for p in root.rglob('*'))
oldcss=(old/'pages/newtab-prototype.css').read_text();newcss=(new/'pages/newtab-prototype.css').read_text()
oldrule='''#bbGroups, #groupsSection, #remoteSection,
.shelf-card-groups, .shelf-card-blocked, .tally-label-groups,
#tlGroups, .tally-right { display: none !important; }'''
newrule='#remoteSection, .shelf-card-blocked, .tally-right { display: none !important; }'
assert oldcss.count(oldrule)==1 and oldcss.replace(oldrule,newrule)==newcss
assert all(x in oldrule and x not in newrule for x in ('#bbGroups','#groupsSection','.shelf-card-groups','.tally-label-groups','#tlGroups'))
assert all(x in newrule for x in ('#remoteSection','.shelf-card-blocked','.tally-right'))
assert link['baseManifestSha256']==sha(h/'manifest.json') and link['candidateManifestSha256']==sha(h/'manifest-visible-v2.json')
assert link['baseCssSha256']==sha(old/'pages/newtab-prototype.css') and link['candidateCssSha256']==sha(new/'pages/newtab-prototype.css')
assert link['nativeBuildReceiptSha256']=='a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23'
fixture=(h/'browser-check-groups-visible-v2.mjs').read_text();assert "await start.page.send('Page.bringToFront')" in fixture and "document.hasFocus()&&document.visibilityState==='visible'" in fixture
assert "nativeGroupRequest(start.page,'focusGroup',[privateGroupId])" in fixture and "privateGroupPresent(after,privateMember.id,privateGroupId)" in fixture
print('PASS exact five-selector CSS delta, 78 assets/link, foreground control and retained private native-denial gates')
