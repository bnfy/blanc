// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_WINDOW_BUTTONS_MAC_H_
#define BLANC_BROWSER_UI_WINDOW_BUTTONS_MAC_H_

#include "ui/gfx/geometry/point.h"
#include "ui/gfx/native_ui_types.h"

namespace blanc {

// macOS's traffic lights, which Chromium exposes only to Objective-C++: shown
// or hidden together, as Electron's setWindowButtonVisibility does for
// shipping's auto-hide Island.
void SetWindowButtonsVisible(gfx::NativeWindow window, bool visible);
bool WindowButtonsVisible(gfx::NativeWindow window);
// The close button's top-left corner, measured from the window's top-left
// (what Electron's getWindowButtonPosition reports), for the test hook.
gfx::Point WindowButtonPosition(gfx::NativeWindow window);
// Keeps a window out of the Window menu and the Dock's list.
void KeepWindowOutOfMenus(gfx::NativeWindow window);

}  // namespace blanc

#endif  // BLANC_BROWSER_UI_WINDOW_BUTTONS_MAC_H_
