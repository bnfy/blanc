// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_WINDOW_BUTTONS_MAC_H_
#define BLANC_BROWSER_UI_WINDOW_BUTTONS_MAC_H_

#include "ui/gfx/native_ui_types.h"

namespace blanc {

// macOS's traffic lights, which Chromium exposes only to Objective-C++: shown
// or hidden together, as Electron's setWindowButtonVisibility does for
// shipping's auto-hide Island.
void SetWindowButtonsVisible(gfx::NativeWindow window, bool visible);
bool WindowButtonsVisible(gfx::NativeWindow window);

}  // namespace blanc

#endif  // BLANC_BROWSER_UI_WINDOW_BUTTONS_MAC_H_
