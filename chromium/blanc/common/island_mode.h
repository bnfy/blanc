// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_COMMON_ISLAND_MODE_H_
#define BLANC_COMMON_ISLAND_MODE_H_

namespace blanc {

// Whether Blanc's browser behaviour (Island, Start Page, session and window
// defaults) applies. It no longer depends on a disk asset folder: the Island
// assets are compiled in. Header-only and dependency-free so any layer that
// patches in Blanc behaviour can ask. Not constexpr: callers keep their
// Chromium code paths compiled and reachable.
inline bool IslandMode() {
  return true;
}

}  // namespace blanc

#endif  // BLANC_COMMON_ISLAND_MODE_H_
