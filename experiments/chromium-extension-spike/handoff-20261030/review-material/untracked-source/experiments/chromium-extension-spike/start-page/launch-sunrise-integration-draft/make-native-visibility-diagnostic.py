"""Prepare a local-only native logging candidate; never stages or builds it."""
from pathlib import Path
import hashlib,json
h=Path(__file__).resolve().parent
baseline=h/'overlay/chrome/browser/ui/launch_sunrise_integration.inc'
manifest=json.loads((h/'overlay-manifest.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(baseline)==manifest['overlay']['chrome/browser/ui/launch_sunrise_integration.inc']
out=h/'launch-sunrise-visibility-diagnostic.inc'
assert not out.exists(),'retain prior diagnostic'
s=baseline.read_text()
old='''  return data->attempt.Take(ProcessSunriseGate(),
      base::Time::Now().InMillisecondsSinceUnixEpoch(), enabled,
      profile->IsOffTheRecord(), visible);
'''
new='''  auto* model = browser ? browser->GetTabStripModel() : nullptr;
  const int index = model ? model->GetIndexOfWebContents(contents) : -1;
  const bool active = model && model->GetActiveWebContents() == contents;
  const auto target_split = model && index >= 0 ? model->GetSplitForTab(index) : std::nullopt;
  const auto active_split = model && model->active_index() >= 0
      ? model->GetSplitForTab(model->active_index()) : std::nullopt;
  const bool same_active_split = target_split && active_split && target_split == active_split;
  const bool granted = data->attempt.Take(ProcessSunriseGate(),
      base::Time::Now().InMillisecondsSinceUnixEpoch(), enabled,
      profile->IsOffTheRecord(), visible);
  // Fixture-only diagnostic: booleans and visibility enum, never URL or tab ID.
  LOG(ERROR) << "SUNRISE_FIXTURE_NATIVE"
             << " visibility=" << static_cast<int>(contents->GetVisibility())
             << " attached=" << (index >= 0) << " active=" << active
             << " active_split=" << same_active_split
             << " widget_visible=" << (widget && widget->IsVisible())
             << " widget_minimized=" << (widget && widget->IsMinimized())
             << " private=" << profile->IsOffTheRecord()
             << " enabled=" << enabled << " granted=" << granted;
  return granted;
'''
assert s.count(old)==1
out.write_text(s.replace(old,new,1))
(h/'visibility-diagnostic-hashes.json').write_text(json.dumps({'baseline':sha(baseline),'diagnostic':sha(out),'scope':'test-only native logging candidate; not staged or built'},indent=2)+'\n')
print('Prepared test-only native visibility log candidate')
