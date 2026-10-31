#!/usr/bin/env python3
"""Prepare a bounded Chromium 158 patch without modifying the checkout."""
import argparse
import difflib
import hashlib
from pathlib import Path

EXPECTED = '177d616a6010c6c6b9ea5907a526eb11e80fab2e4b0cd7b58dc30eb6fd065959'
OLD = '''void Zoom(BrowserWindowInterface* browser, content::PageZoom zoom) {
  zoom::PageZoom::Zoom(browser->GetTabStripModel()->GetActiveWebContents(),
                       zoom);
}'''
NEW = '''void Zoom(BrowserWindowInterface* browser, content::PageZoom zoom) {
  auto* contents = browser->GetTabStripModel()->GetActiveWebContents();
  if (blanc_prototype::IsIslandWindow(browser)) {
    if (!contents || contents->IsCrashed() || !contents->GetPrimaryMainFrame() ||
        !contents->GetPrimaryMainFrame()->IsRenderFrameLive())
      return;
    auto* controller = zoom::ZoomController::FromWebContents(contents);
    if (!controller ||
        controller->zoom_mode() == zoom::ZoomController::ZOOM_MODE_DISABLED)
      return;
    if (zoom == content::PAGE_ZOOM_RESET) {
      controller->SetZoomLevel(0.0);
      return;
    }
    if (zoom != content::PAGE_ZOOM_IN && zoom != content::PAGE_ZOOM_OUT)
      return;
    const double current = controller->GetZoomLevel();
    if (!std::isfinite(current))
      return;
    constexpr double kStep = 0.5;
    const double delta = zoom == content::PAGE_ZOOM_IN ? kStep : -kStep;
    // Electron clamps both the requested level and Chromium's display range.
    const double requested = std::clamp(current + delta, -8.0, 8.0);
    const double minimum = blink::ZoomFactorToZoomLevel(
        blink::kMinimumBrowserZoomFactor);
    const double maximum = blink::ZoomFactorToZoomLevel(
        blink::kMaximumBrowserZoomFactor);
    controller->SetZoomLevel(std::clamp(requested, minimum, maximum));
    return;
  }
  zoom::PageZoom::Zoom(contents, zoom);
}'''

def prepare(data: bytes) -> str:
    if hashlib.sha256(data).hexdigest() != EXPECTED:
        raise ValueError('unexpected browser_commands.cc; refusing to stage')
    text = data.decode('utf-8')
    include = '#include <algorithm>\n'
    if text.count(include) != 1 or text.count(OLD) != 1 or '#include <cmath>' in text:
        raise ValueError('unexpected includes or Zoom body')
    third_party = '#include "third_party/omnibox_proto/chrome_aim_entry_point.pb.h"\n'
    render = '#include "content/public/browser/render_view_host.h"\n'
    if (text.count(third_party) != 1 or text.count(render) != 1 or
        '#include "third_party/blink/public/common/page/page_zoom.h"' in text or
        '#include "content/public/browser/render_frame_host.h"' in text):
        raise ValueError('unexpected zoom includes')
    new = (text.replace(include, include + '#include <cmath>\n', 1)
           .replace(render, '#include "content/public/browser/render_frame_host.h"\n' + render, 1)
           .replace(third_party, '#include "third_party/blink/public/common/page/page_zoom.h"\n' + third_party, 1)
           .replace(OLD, NEW, 1))
    return ''.join(difflib.unified_diff(text.splitlines(keepends=True),
        new.splitlines(keepends=True), fromfile='a/chrome/browser/ui/browser_commands.cc',
        tofile='b/chrome/browser/ui/browser_commands.cc'))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('patch', type=Path)
    args = parser.parse_args()
    patch = prepare(args.input.read_bytes())
    with args.patch.open('x', encoding='utf-8') as output:
        output.write(patch)
    print('prepared patch sha256', hashlib.sha256(patch.encode()).hexdigest())

if __name__ == '__main__':
    main()
