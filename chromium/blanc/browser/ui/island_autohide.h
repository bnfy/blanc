// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_ISLAND_AUTOHIDE_H_
#define BLANC_BROWSER_UI_ISLAND_AUTOHIDE_H_

#include <algorithm>
#include <cmath>
#include <optional>
#include <string_view>

namespace blanc::island_autohide {

// Shipping v1.45.1's auto-hide Island policy (src/main/island-autohide.js),
// line for line: the page fills the window, the top edge (or a rest just
// below it) reveals the Island, and it hides once the pointer has left it.
// Anything drawn from the Island keeps it revealed. Standard library only,
// so tools/island-autohide.test.mjs can compile it beside shipping's module.
// Points are window content coordinates.

inline constexpr std::string_view kPref = "blanc.island.auto_hide";
inline constexpr std::string_view kStylePref = "blanc.island.auto_hide_style";

inline constexpr double kRevealEdgePx = 10;
inline constexpr double kReachAbovePx = 16;
inline constexpr double kRevealDwellBandPx = 40;
inline constexpr double kRevealDwellMs = 300;
inline constexpr double kRevealDwellDriftPx = 8;
inline constexpr int kRevealWatchMs = 120;
inline constexpr double kHideSlackPx = 24;
inline constexpr int kHideCheckMs = 450;
inline constexpr int kFloatHideCheckMs = 120;
inline constexpr int kIntroMs = 5000;
inline constexpr int kSlideInMs = 160;
inline constexpr int kSlideOutMs = 200;

struct Point {
  double x;
  double y;
};

// Float over the page (the default), or push the page down as v1.39.0 did.
inline std::string_view NormalizeStyle(std::string_view value) {
  return value == "push" ? "push" : "float";
}

inline int HideCheckDelay(bool floating) {
  return floating ? kFloatHideCheckMs : kHideCheckMs;
}

struct HoldState {
  bool revealed = false;
  double chrome_height = 68;
  double width = 0;
  double height = 0;
  double reach_above = 0;
  double left = 0;
  bool floating = false;
};

// Whether a pointer position reveals the Island or keeps it revealed. Outside
// the window only the `reach_above` px directly above its top edge count; the
// bands start at the page pane's left edge (the vertical rail's column is its
// own), and a floating Island gets no slack below the strip.
inline bool PointHoldsIsland(std::optional<Point> point, const HoldState& s) {
  if (!point || !std::isfinite(point->x) || !std::isfinite(point->y)) return false;
  const double above = std::isfinite(s.reach_above) ? std::max(0.0, s.reach_above) : 0;
  const double from = std::isfinite(s.left) ? std::max(0.0, s.left) : 0;
  if (point->x < from || point->y < -above || point->x > s.width || point->y > s.height) return false;
  if (point->y <= kRevealEdgePx) return true;
  const double slack = s.floating ? 0 : kHideSlackPx;
  return s.revealed && point->y < std::max(0.0, s.chrome_height) + slack;
}

struct Dwell {
  Point anchor;
  double since;
};
struct DwellStep {
  std::optional<Dwell> dwell;
  bool reveal = false;
};

// One cursor sample for the band just below the instant edge: resting there
// for kRevealDwellMs (drifting at most kRevealDwellDriftPx) reveals the
// Island. A floating Island has no dwell band: a site's own header sits there.
inline DwellStep RevealDwellStep(std::optional<Dwell> dwell, std::optional<Point> point, double now,
                                 double width, double left, bool floating) {
  const double from = std::isfinite(left) ? std::max(0.0, left) : 0;
  const bool in_band = !floating && point && std::isfinite(point->x) && std::isfinite(point->y) &&
      point->x >= from && point->x <= width &&
      point->y > kRevealEdgePx && point->y <= kRevealDwellBandPx;
  if (!in_band) return {std::nullopt, false};
  const bool resting = dwell && std::abs(point->x - dwell->anchor.x) <= kRevealDwellDriftPx &&
      std::abs(point->y - dwell->anchor.y) <= kRevealDwellDriftPx;
  if (!resting) return {Dwell{*point, now}, false};
  return {dwell, now - dwell->since >= kRevealDwellMs};
}

// How far above the window the pointer may be and still be at its top edge:
// up to the top of the screen for a window against the top of the work area
// (under the macOS menu bar), else a short band for overshoot. Screen
// coordinates.
inline double ReachAboveWindow(double content_top, double work_area_top, double display_top) {
  if (!std::isfinite(content_top) || !std::isfinite(work_area_top) || !std::isfinite(display_top)) return 0;
  if (content_top <= work_area_top + 2) return std::max(0.0, content_top - display_top);
  return kReachAbovePx;
}

// Ease-out cubic over 0..1.
inline double EaseOutCubic(double t) {
  const double clamped = std::min(1.0, std::max(0.0, std::isfinite(t) ? t : 1));
  return 1 - std::pow(1 - clamped, 3);
}

// Surfaces drawn from or anchored to the Island, and the how-to tip, keep it
// revealed whatever the pointer does.
inline bool IslandPinned(bool overlay_open, bool popup_open, bool introducing) {
  return overlay_open || popup_open || introducing;
}

// Whether the layout leaves the strip out: auto-hide on, the Island neither
// revealed nor pinned.
inline bool StripHidden(bool auto_hide, bool revealed, bool pinned) {
  return auto_hide && !revealed && !pinned;
}

// Whether the page ignores the strip because the Island floats over it.
inline bool FloatingLayout(bool auto_hide, std::string_view style) {
  return auto_hide && style == "float";
}

}  // namespace blanc::island_autohide

#endif  // BLANC_BROWSER_UI_ISLAND_AUTOHIDE_H_
