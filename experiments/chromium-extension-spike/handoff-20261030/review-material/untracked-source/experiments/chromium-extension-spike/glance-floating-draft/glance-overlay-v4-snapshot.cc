#include "glance_overlay_view.h"

#include <utility>

#include "base/check.h"
#include "chrome/browser/ui/views/frame/contents_container_view.h"
#include "chrome/browser/ui/views/frame/contents_web_view.h"
#include "glance_modal_dialog_host.h"
#include "ui/views/controls/webview/webview.h"

namespace blanc::glance::draft {

GlanceOverlayView::GlanceOverlayView(BrowserView* browser,
                                     std::unique_ptr<views::WebView> chrome,
                                     std::unique_ptr<ContentsContainerView> page) {
  CHECK(browser);
  CHECK(chrome);
  CHECK(page);
  // The page is the later Views child. Native-view stacking remains to be
  // verified on each platform before this hierarchy is used in a browser.
  chrome_ = AddChildView(std::move(chrome));
  page_ = AddChildView(std::move(page));
  modal_host_ = std::make_unique<GlanceModalDialogHost>(browser, page_);
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
  if (!chrome_->web_contents() || !page_->contents_view()->web_contents() ||
      chrome_->web_contents() == page_->contents_view()->web_contents() ||
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

ContentsContainerView* GlanceOverlayView::ContainerFor(
    content::WebContents* contents) {
  if (!contents || page_->contents_view()->web_contents() != contents) {
    return nullptr;
  }
  return page_;
}

GlanceModalDialogHost* GlanceOverlayView::ModalHostFor(
    content::WebContents* contents) {
  return ContainerFor(contents) ? modal_host_.get() : nullptr;
}

}  // namespace blanc::glance::draft
