#include "glance_modal_dialog_host.h"

#include "base/check.h"
#include "chrome/browser/ui/views/frame/browser_view.h"
#include "chrome/browser/ui/views/frame/contents_container_view.h"
#include "glance_modal_position.h"
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
  auto point = ModalPosition({page.x(), page.y(), page.width(), page.height()},
                             {bounds.x(), bounds.y(), bounds.width(), bounds.height()},
                             {dialog_size.width(), dialog_size.height()});
  return point ? gfx::Point(point->x, point->y)
               : TabModalDialogHost::GetDialogPosition(dialog_size);
}

}  // namespace blanc::glance::draft
