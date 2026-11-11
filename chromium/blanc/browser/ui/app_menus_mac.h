// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_APP_MENUS_MAC_H_
#define BLANC_BROWSER_UI_APP_MENUS_MAC_H_

#include <stdint.h>

#include <string>

#include "base/containers/span.h"

namespace blanc {
void InstallMiniWindowMenu();

// The app's menus as the test hooks read them (patch 0013 titles the
// private-browsing items): an item's title in a main-menu submenu or in the
// Dock menu, or "" when it isn't there, and clicking a Dock menu item.
std::u16string MainMenuItemTitle(int menu_tag, int item_tag);
// The Dock icon from PNG bytes; empty puts back the app's own icon.
void SetDockIcon(base::span<const uint8_t> png);
std::u16string DockMenuItemTitle(int item_tag);
bool ClickDockMenuItem(int item_tag);

}  // namespace blanc

#endif  // BLANC_BROWSER_UI_APP_MENUS_MAC_H_
