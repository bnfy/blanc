from pathlib import Path
import hashlib, json, os

target = Path('<local-home>/Projects/BlancChromium158/src/chrome/browser/ui/views/frame/BUILD.gn')
here = Path(__file__).resolve().parent
before = 'f5015b3be510c840a2956d30cb2d418e8f561411902fec0fa8e53b2958ffb219'
sha = lambda data: hashlib.sha256(data).hexdigest()
for p in (target, *target.parents):
    if p.is_symlink(): raise RuntimeError('Unexpected symlink: ' + str(p))
original = target.read_bytes()
if sha(original) != before: raise RuntimeError('BUILD.gn differs from reviewed staged candidate')
anchor = b'    "//chrome/browser/bookmarks",\n    "//chrome/browser/history",\n    "//chrome/browser/search_engines",\n'
replacement = b'    "//chrome/browser/bookmarks",\n    "//chrome/browser/favicon",\n    "//chrome/browser/history",\n    "//chrome/browser/search_engines",\n    "//chrome/services/blanc_blocker:browser",\n'
if original.count(anchor) != 1: raise RuntimeError('BUILD.gn anchor is not unique')
updated = original.replace(anchor, replacement)
backup = here / 'BUILD.before-gn-include-fix.gn'
candidate = here / 'BUILD.with-gn-include-fix.gn'
if backup.exists() or candidate.exists(): raise RuntimeError('Evidence already exists')
backup.write_bytes(original)
candidate.write_bytes(updated)
tmp = target.with_name(target.name + '.blanc-include-stage')
if tmp.exists(): raise RuntimeError('Unexpected staging temp')
try:
    with tmp.open('xb') as f:
        f.write(updated)
        f.flush()
        os.fsync(f.fileno())
    os.chmod(tmp, target.stat().st_mode & 0o777)
    if sha(target.read_bytes()) != before: raise RuntimeError('BUILD.gn changed during staging')
    os.replace(tmp, target)
finally:
    if tmp.exists(): tmp.unlink()
if sha(target.read_bytes()) != sha(updated): raise RuntimeError('BUILD.gn readback mismatch')
(here / 'gn-include-stage-receipt.json').write_text(json.dumps({'target': str(target), 'before': before, 'after': sha(updated), 'backup': str(backup), 'candidate': str(candidate), 'reason': 'focused GN check found two pre-existing includes without declared dependencies'}, indent=2) + '\n')
print('Staged two missing existing include dependencies; prior BUILD saved')
