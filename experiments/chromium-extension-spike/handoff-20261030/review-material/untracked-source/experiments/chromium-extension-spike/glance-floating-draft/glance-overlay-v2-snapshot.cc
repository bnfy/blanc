#include "glance_overlay_view.h"

#include <utility>

#include "base/check.h"
#include "ui/views/controls/webview/webview.h"

namespace blanc::glance::draft {

GlanceOverlayView::GlanceOverlayView(std::unique_ptr<views::WebView> chrome,
                                     std::unique_ptr<views::WebView> page) {
  CHECK(chrome);
  CHECK(page);
  // The page is the later Views child. Native-view stacking remains to be
  // verified on each platform before this hierarchy is used in a browser.
  chrome_ = AddChildView(std::move(chrome));
  page_ = AddChildView(std::move(page));
  SetVisible(false);
}

GlanceOverlayView::~GlanceOverlayView() = default;

bool GlanceOverlayView::SetCardBounds(const gfx::Rect& chrome_bounds,
                                      const gfx::Rect& page_bounds) {
  constexpr int kCoordinateLimit = 1000000;
  const auto bounded = [](const gfx::Rect& r) {
    return r.x() >= -kCoordinateLimit && r.y() >= -kCoordinateLimit &&
           r.x() <= kCoordinateLimit && r.y() <= kCoordinateLimit &&
           r.width() > 0 && r.height() > 0 &&
           r.width() <= kCoordinateLimit && r.height() <= kCoordinateLimit;
  };
  if (!chrome_->web_contents() || !page_->web_contents() ||
      chrome_->web_contents() == page_->web_contents() ||
      !bounded(chrome_bounds) || !bounded(page_bounds) ||
      !chrome_bounds.Contains(page_bounds)) {
    SetVisible(false);
    return false;
  }
  SetBoundsRect(chrome_bounds);
  chrome_->SetBoundsRect(GetLocalBounds());
  gfx::Rect local_page(page_bounds);
  local_page.Offset(-chrome_bounds.x(), -chrome_bounds.y());
  page_->SetBoundsRect(local_page);
  SetVisible(true);
  return true;
}

}  // namespace blanc::glance::draft
