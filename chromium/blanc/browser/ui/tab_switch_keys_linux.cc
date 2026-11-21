// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#include "blanc/browser/ui/tab_switch_keys_aura.h"

#include <algorithm>

#include "base/auto_reset.h"
#include "ui/base/accelerators/accelerator.h"
#include "ui/views/focus/focus_manager.h"
#include "ui/views/view.h"

namespace blanc {
namespace {
constexpr ui::Accelerator kForward(ui::VKEY_TAB, ui::EF_CONTROL_DOWN);
constexpr ui::Accelerator kReverse(ui::VKEY_TAB, ui::EF_CONTROL_DOWN | ui::EF_SHIFT_DOWN);
base::TimeTicks dispatch_time;
}  // namespace

void RegisterTabSwitchAccelerators(views::View& island) {
  // BrowserView installs its accelerators in AddedToWidget. Register after
  // it, at normal priority, so fullscreen pages keep their first chance.
  if (std::ranges::contains(island.GetAccelerators(), kForward)) return;
  auto* manager = island.GetFocusManager();
  if (!manager || !manager->IsAcceleratorRegistered(kForward)) return;
  island.AddAccelerator(kForward);
  island.AddAccelerator(kReverse);
}

bool DispatchTabSwitchAccelerator(views::View& browser, const ui::Accelerator& accelerator) {
  if (accelerator != kForward && accelerator != kReverse) return false;
  // Keep Chromium's normal enabled-command checks and invocation context.
  // Only that command sees this identity, including on a renderer reply.
  base::AutoReset<base::TimeTicks> dispatch(&dispatch_time, accelerator.time_stamp());
  return browser.AcceleratorPressed(accelerator);
}

TabSwitchKey CurrentTabSwitchKey() {
  return dispatch_time.is_null() ? TabSwitchKey::kNone : TabSwitchKey::kCtrlTab;
}

base::TimeTicks TabSwitchPressTime() {
  return dispatch_time;
}

}  // namespace blanc
