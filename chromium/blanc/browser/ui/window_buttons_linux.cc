// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/window_buttons_linux.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <utility>

#include "base/i18n/rtl.h"
#include "chrome/browser/ui/view_ids.h"
#include "ui/base/hit_test.h"
#include "ui/views/view.h"
#include "ui/views/widget/widget.h"
#include "ui/views/window/frame_buttons.h"
#include "ui/views/window/frame_view.h"
#include "ui/views/window/non_client_view.h"
#include "ui/views/window/window_button_order_provider.h"

namespace blanc {
namespace {
struct Button {
  int id;
  views::FrameButton button;
  const char* kind;
  int component;
};
// std::array, not a C array: Chromium's -Wunsafe-buffer-usage rejects raw array indexing.
constexpr auto kButtons = std::to_array<Button>({
    {VIEW_ID_MINIMIZE_BUTTON, views::FrameButton::kMinimize, "minimize", HTMINBUTTON},
    {VIEW_ID_MAXIMIZE_BUTTON, views::FrameButton::kMaximize, "maximize", HTMAXBUTTON},
    {VIEW_ID_CLOSE_BUTTON, views::FrameButton::kClose, "close", HTCLOSE},
});
}  // namespace

LinuxWindowButtons LinuxWindowButtons::Measure(const views::View& origin) {
  LinuxWindowButtons result;
  result.strip_width = origin.width();
  const auto* widget = origin.GetWidget();
  const auto* frame = widget && widget->non_client_view()
                          ? widget->non_client_view()->frame_view() : nullptr;
  if (!frame || !result.strip_width) return result;
  const auto& leading = views::WindowButtonOrderProvider::GetInstance()->leading_buttons();
  for (const views::View* view : frame->children()) {
    if (!view->IsDrawn() || view->size().IsEmpty()) continue;
    const int id = view->GetID() == VIEW_ID_RESTORE_BUTTON
                       ? VIEW_ID_MAXIMIZE_BUTTON : view->GetID();
    for (size_t i = 0; i < result.bounds.size(); ++i) {
      if (kButtons[i].id != id) continue;
      auto rect = views::View::ConvertRectToTarget(view, &origin, view->GetLocalBounds());
      result.bounds[i] = rect;
      // Use physical sides, including when Views mirrors the GTK order for RTL.
      const bool left = std::ranges::contains(leading, kButtons[i].button) != base::i18n::IsRTL();
      auto& side = left ? result.leading : result.trailing;
      side.Union(rect);
    }
  }
  return result;
}

int LinuxWindowButtons::HitTest(const gfx::Point& point) const {
  for (size_t i = 0; i < bounds.size(); ++i)
    if (bounds[i].Contains(point)) return kButtons[i].component;
  return HTNOWHERE;
}

base::DictValue LinuxWindowButtons::ToValue() const {
  base::ListValue buttons;
  for (size_t i = 0; i < bounds.size(); ++i) {
    const auto& r = bounds[i];
    if (!r.IsEmpty()) buttons.Append(base::DictValue().Set("kind", kButtons[i].kind)
        .Set("x", r.x()).Set("y", r.y()).Set("width", r.width()).Set("height", r.height()));
  }
  return base::DictValue().Set("buttons", std::move(buttons))
      .Set("leading", leading.IsEmpty() ? 0 : std::max(0, leading.right()))
      .Set("trailing", trailing.IsEmpty() ? 0 : std::max(0, strip_width - trailing.x()));
}

}  // namespace blanc
