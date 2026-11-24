// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_WINDOW_BUTTONS_LINUX_H_
#define BLANC_BROWSER_UI_WINDOW_BUTTONS_LINUX_H_

#include <array>

#include "base/values.h"
#include "ui/gfx/geometry/rect.h"

namespace views { class View; }

namespace blanc {

// The opaque frame's drawn controls in DIPs from the supplied view's left edge.
// A restored window can have shadows outside the strip and GTK can put
// margins between the controls. Keep the actual rectangles for input.
struct LinuxWindowButtons {
  static LinuxWindowButtons Measure(const views::View& origin);
  int HitTest(const gfx::Point& point) const;
  base::DictValue ToValue() const;

  std::array<gfx::Rect, 3> bounds;
  gfx::Rect leading;
  gfx::Rect trailing;
  int strip_width = 0;
};

}  // namespace blanc
#endif  // BLANC_BROWSER_UI_WINDOW_BUTTONS_LINUX_H_
