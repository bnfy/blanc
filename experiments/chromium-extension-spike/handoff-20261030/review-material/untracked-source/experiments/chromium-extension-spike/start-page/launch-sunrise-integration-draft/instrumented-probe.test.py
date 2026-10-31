"""Static consistency checks only; no browser or Chromium build."""
from pathlib import Path
import hashlib,json
h=Path(__file__).resolve().parent
v2=h/'overlay-foreground-v2';candidate=h/'overlay-visible-background-instrumented'
manifest=json.loads((h/'visible-background-instrumented-hashes.json').read_text());assert manifest['testOnly'] is True
files=lambda p:{str(x.relative_to(p)):hashlib.sha256(x.read_bytes()).hexdigest() for x in p.rglob('*') if x.is_file() and not x.is_symlink()}
assert files(candidate)==manifest['overlay']
before=files(v2);after=files(candidate);assert before.keys()==after.keys()
assert [x for x in before if before[x]!=after[x]]==['chrome/browser/ui/launch_sunrise_integration.inc']
old=(v2/'chrome/browser/ui/launch_sunrise_integration.inc').read_text();new=(candidate/'chrome/browser/ui/launch_sunrise_integration.inc').read_text()
start=old.index('  const bool visible = foreground &&');end=old.index('  return data->attempt.Take(',start)
assert old[start:end] in new
assert 'if (probe && enabled && !profile->IsOffTheRecord() && browser && !foreground)\n    contents->WasShown();' in new
assert 'base::Time::Now().InMillisecondsSinceUnixEpoch(), enabled,\n      profile->IsOffTheRecord(), visible)' in new
fixture=(h/'browser-check-visible-background-instrumented.mjs').read_text()
for word in ('--blanc-test-visible-background','foreground=0','native_visible=1','eligible=0','granted=0','foreground=1','eligible=1','granted=1'):
 assert word in fixture,word
assert json.loads((h/'overlay-visible-background-instrumented-manifest.json').read_text())['overlay']==manifest['overlay']
print('PASS isolated manifest, only test instrumentation delta, original predicate and gate inputs, negative and positive probe assertions')
