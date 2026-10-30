#ifndef BLANC_GLANCE_FLOATING_DRAFT_OVERLAY_VIEW_H_
#define BLANC_GLANCE_FLOATING_DRAFT_OVERLAY_VIEW_H_

#include <memory>

#include "base/memory/raw_ptr.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/views/view.h"

namespace views {
class WebView;
}
class ContentsContainerView;
class BrowserView;
namespace content { class WebContents; }

namespace blanc::glance::draft {
class GlanceModalDialogHost;

// A proposed view hierarchy only. Its caller must own both WebContents and
// guarantee each is detached from any other WebView before constructing this
// view. This class does not establish tab, profile, sender or focus authority.
// Do not attach it to BrowserView until the window owner enforces that lease.
class GlanceOverlayView : public views::View {
  METADATA_HEADER(GlanceOverlayView, views::View)
 public:
  GlanceOverlayView(BrowserView* browser,
                    std::unique_ptr<views::WebView> chrome,
                    std::unique_ptr<ContentsContainerView> page);
  GlanceOverlayView(const GlanceOverlayView&) = delete;
  GlanceOverlayView& operator=(const GlanceOverlayView&) = delete;
  ~GlanceOverlayView() override;

  // Both rectangles are integer DIPs in the same parent coordinate system.
  // Invalid geometry hides the overlay. A valid layout does not reveal it;
  // the owner must wait for the card's draw readiness before showing it.
  bool SetCardBounds(const gfx::Rect& chrome_bounds,
                     const gfx::Rect& page_bounds);

  // BrowserView's future dialog and blocked-state routing may use this only
  // while the requested WebContents is actually attached to this container.
  ContentsContainerView* ContainerFor(content::WebContents* contents);
  GlanceModalDialogHost* ModalHostFor(content::WebContents* contents);

 private:
  raw_ptr<views::WebView> chrome_;
  raw_ptr<ContentsContainerView> page_;
  std::unique_ptr<GlanceModalDialogHost> modal_host_;
};

}  // namespace blanc::glance::draft
#endif
