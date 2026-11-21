// Copyright 2026 Bananify Creative. MIT; see LICENSE.

#ifndef BLANC_ANDROID_BROWSER_ISLAND_POSITION_H_
#define BLANC_ANDROID_BROWSER_ISLAND_POSITION_H_

namespace blanc {
// Whether the Island sits along the top (Settings → Island position), which the Start Page makes
// room for (blanc_pages_ui.cc). Read from the setting each time: IslandPositionBridge.java.
bool IslandAtTop();
}  // namespace blanc

#endif  // BLANC_ANDROID_BROWSER_ISLAND_POSITION_H_
