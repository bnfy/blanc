#ifndef BLANC_GLANCE_FLOATING_DRAFT_OVERLAY_VIEW_H_
#define BLANC_GLANCE_FLOATING_DRAFT_OVERLAY_VIEW_H_

#include <memory>

#include "base/memory/raw_ptr.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/views/view.h"

namespace views {
class WebView;
}

namespace blanc::glance::draft {

// A proposed view hierarchy only. Its caller must own both WebContents and
// guarantee each is detached from any other WebView before constructing this
// view. This class does not establish tab, profile, sender or focus authority.
// Do not attach it to BrowserView until the window owner enforces that lease.
class GlanceOverlayView : public views::View {
 public:
  GlanceOverlayView(std::unique_ptr<views::WebView> chrome,
                    std::unique_ptr<views::WebView> page);
  GlanceOverlayView(const GlanceOverlayView&) = delete;
  GlanceOverlayView& operator=(const GlanceOverlayView&) = delete;
  ~GlanceOverlayView() override;

  // Both rectangles are integer DIPs in the same parent coordinate system.
  // Invalid geometry hides the overlay instead of presenting stale bounds.
  bool SetCardBounds(const gfx::Rect& chrome_bounds,
                     const gfx::Rect& page_bounds);

 private:
  raw_ptr<views::WebView> chrome_;
  raw_ptr<views::WebView> page_;
};

}  // namespace blanc::glance::draft
#endif
