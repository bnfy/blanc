#ifndef BLANC_CONTEXT_LINK_ORIGIN_H_
#define BLANC_CONTEXT_LINK_ORIGIN_H_

#include <cstdint>
#include <optional>

#include "base/memory/weak_ptr.h"
#include "content/public/browser/global_routing_id.h"
#include "url/gurl.h"

class BrowserWindowInterface;
namespace content {
class RenderFrameHost;
class WebContents;
}

namespace blanc::glance::draft {

// Identity captured when a link menu is created. The caller must still apply
// Chromium's normal URL, referrer, policy and external-protocol handling.
class ContextLinkOrigin {
 public:
  static std::optional<ContextLinkOrigin> Capture(
      BrowserWindowInterface* browser, content::WebContents* opener,
      content::RenderFrameHost* frame);
  ContextLinkOrigin(const ContextLinkOrigin&);
  ContextLinkOrigin& operator=(const ContextLinkOrigin&);
  ~ContextLinkOrigin();

  // Check again immediately before navigation and before attaching a Glance
  // reference, since tab switches, frame navigations and window closure can
  // occur while the menu or the asynchronous frame-store operation is open.
  bool IsCurrent() const;
  content::WebContents* opener() const;

 private:
  ContextLinkOrigin(BrowserWindowInterface* browser,
                    content::WebContents* opener,
                    content::RenderFrameHost* frame);
  base::WeakPtr<BrowserWindowInterface> browser_;
  base::WeakPtr<content::WebContents> opener_;
  content::GlobalRenderFrameHostId frame_id_;
  int64_t frame_navigation_id_;
  int64_t main_navigation_id_;
  GURL frame_url_;
  GURL main_url_;
};
}  // namespace blanc::glance::draft
#endif  // BLANC_CONTEXT_LINK_ORIGIN_H_
