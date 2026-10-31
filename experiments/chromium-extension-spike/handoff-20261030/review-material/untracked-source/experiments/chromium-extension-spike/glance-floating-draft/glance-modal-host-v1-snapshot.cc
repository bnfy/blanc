#include "glance_modal_dialog_host.h"

#include <algorithm>
#include <cstdint>

#include "base/check.h"
#include "chrome/browser/ui/views/frame/browser_view.h"
#include "chrome/browser/ui/views/frame/contents_container_view.h"
#include "ui/gfx/geometry/point.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/gfx/geometry/size.h"
#include "ui/views/view.h"

namespace blanc::glance::draft {

GlanceModalDialogHost::GlanceModalDialogHost(BrowserView* browser,
                                             ContentsContainerView* page)
    : TabModalDialogHost(browser, page), browser_(browser), page_(page) {
  CHECK(browser);
  CHECK(page);
}

GlanceModalDialogHost::~GlanceModalDialogHost() = default;

gfx::Point GlanceModalDialogHost::GetDialogPosition(
    const gfx::Size& dialog_size) {
  views::View* area = browser_->contents_container();
  if (!area || !page_->GetWidget() || page_->GetWidget() != area->GetWidget() ||
      dialog_size.width() < 0 || dialog_size.height() < 0) {
    return TabModalDialogHost::GetDialogPosition(dialog_size);
  }
  const gfx::Rect page = page_->ConvertRectToWidget(page_->GetLocalBounds());
  const gfx::Rect bounds = area->ConvertRectToWidget(area->GetLocalBounds());
  if (page.IsEmpty() || bounds.IsEmpty()) {
    return TabModalDialogHost::GetDialogPosition(dialog_size);
  }
  // Compute with wider integers so centering cannot overflow. Dialogs larger
  // than the available content start at its leading edge; the inherited
  // maximum-size policy remains in force.
  const int64_t x = static_cast<int64_t>(page.x()) + page.width() / 2 -
                    static_cast<int64_t>(dialog_size.width()) / 2;
  const int64_t max_x = std::max<int64_t>(bounds.x(),
      static_cast<int64_t>(bounds.right()) - dialog_size.width());
  const int64_t max_y = std::max<int64_t>(bounds.y(),
      static_cast<int64_t>(bounds.bottom()) - dialog_size.height());
  return gfx::Point(static_cast<int>(std::clamp<int64_t>(x, bounds.x(), max_x)),
                    static_cast<int>(std::clamp<int64_t>(page.y(), bounds.y(), max_y)));
}

}  // namespace blanc::glance::draft
