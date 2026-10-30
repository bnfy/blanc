"""Prepare the narrow native guard; do not stage, build, or alter overlay."""
from pathlib import Path
import hashlib,json
h=Path(__file__).resolve().parent
baseline=h/'overlay/chrome/browser/ui/launch_sunrise_integration.inc'
manifest=json.loads((h/'overlay-manifest.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(baseline)==manifest['overlay']['chrome/browser/ui/launch_sunrise_integration.inc']
out=h/'launch-sunrise-foreground-v2.inc';assert not out.exists()
s=baseline.read_text()
old='#include "chrome/browser/ui/launch_sunrise_gate.h"'
assert s.count(old)==1
s=s.replace(old,old+'\n#include "chrome/browser/ui/foreground_membership.h"',1)
old='''  const bool visible = widget && widget->IsVisible() && !widget->IsMinimized() &&
      contents->GetVisibility() == content::Visibility::VISIBLE;
'''
new='''  const bool foreground = browser &&
      SunriseForegroundMember(browser->GetTabStripModel(), contents);
  auto* container = view ? view->GetContentsContainerViewFor(contents) : nullptr;
  const bool visible = foreground && container && container->IsDrawn() &&
      container->contents_view() && container->contents_view()->IsDrawn() &&
      widget && widget->IsVisible() &&
      !widget->IsMinimized() &&
      contents->GetVisibility() == content::Visibility::VISIBLE;
'''
assert s.count(old)==1
out.write_text(s.replace(old,new,1))
ui=h/'overlay/chrome/browser/ui/blanc_prototype_ui.cc';ui_candidate=h/'ui-foreground-v2.cc'
assert sha(ui)==manifest['overlay']['chrome/browser/ui/blanc_prototype_ui.cc'] and not ui_candidate.exists()
source=ui.read_text();inc='#include "chrome/browser/ui/views/frame/browser_view.h"'
assert source.count(inc)==1
ui_candidate.write_text(source.replace(inc,inc+'\n#include "chrome/browser/ui/views/frame/contents_container_view.h"\n#include "chrome/browser/ui/views/frame/contents_web_view.h"',1))
(h/'foreground-v2-hashes.json').write_text(json.dumps({'baseline':sha(baseline),'header':sha(h/'foreground_membership.h'),'candidate':sha(out),'uiBaseline':sha(ui),'uiCandidate':sha(ui_candidate),'scope':'isolated and unbuilt; no overlay or checkout changes'},indent=2)+'\n')
print('Prepared foreground-membership candidate without modifying staged source')
