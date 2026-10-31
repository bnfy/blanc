#include "context_link_origin.h"

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"

namespace blanc::glance::draft {
ContextLinkOrigin::ContextLinkOrigin(BrowserWindowInterface* browser,
                                     content::WebContents* opener,
                                     content::RenderFrameHost* frame)
    : browser_(browser->GetWeakPtr()),
      opener_(opener->GetWeakPtr()),
      frame_id_(frame->GetGlobalId()),
      frame_navigation_id_(frame->GetNavigationId()),
      main_navigation_id_(opener->GetPrimaryMainFrame()->GetNavigationId()),
      frame_url_(frame->GetLastCommittedURL()),
      main_url_(opener->GetPrimaryMainFrame()->GetLastCommittedURL()) {}
ContextLinkOrigin::ContextLinkOrigin(const ContextLinkOrigin&) = default;
ContextLinkOrigin& ContextLinkOrigin::operator=(const ContextLinkOrigin&) = default;
ContextLinkOrigin::~ContextLinkOrigin() = default;

std::optional<ContextLinkOrigin> ContextLinkOrigin::Capture(
    BrowserWindowInterface* browser, content::WebContents* opener,
    content::RenderFrameHost* frame) {
  if (!browser || !opener || !frame || !opener->GetPrimaryMainFrame())
    return std::nullopt;
  ContextLinkOrigin origin(browser, opener, frame);
  return origin.IsCurrent() ? std::optional<ContextLinkOrigin>(origin)
                            : std::nullopt;
}

bool ContextLinkOrigin::IsCurrent() const {
  if (!browser_ || !opener_ || !browser_->GetTabStripModel() ||
      browser_->GetTabStripModel()->GetActiveWebContents() != opener_.get() ||
      opener_->GetBrowserContext() != browser_->GetProfile() ||
      opener_->GetController().GetPendingEntry())
    return false;
  auto* frame = content::RenderFrameHost::FromID(frame_id_);
  auto* main = opener_->GetPrimaryMainFrame();
  return frame && main && frame->IsRenderFrameLive() &&
      content::WebContents::FromRenderFrameHost(frame) == opener_.get() &&
      frame->GetMainFrame() == main &&
      frame->GetNavigationId() == frame_navigation_id_ &&
      main->GetNavigationId() == main_navigation_id_ &&
      frame->GetLastCommittedURL() == frame_url_ &&
      main->GetLastCommittedURL() == main_url_;
}
bool ContextLinkOrigin::AcceptsReference(content::WebContents* reference) const {
  if (!IsCurrent() || !reference || reference == opener_.get() ||
      reference->GetBrowserContext() != opener_->GetBrowserContext())
    return false;
  const int index = browser_->GetTabStripModel()->GetIndexOfWebContents(reference);
  return index >= 0 && !browser_->GetTabStripModel()->GetSplitForTab(index);
}
content::WebContents* ContextLinkOrigin::opener() const {
  return IsCurrent() ? opener_.get() : nullptr;
}
}  // namespace blanc::glance::draft
