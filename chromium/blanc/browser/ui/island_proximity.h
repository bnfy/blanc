// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_ISLAND_PROXIMITY_H_
#define BLANC_BROWSER_UI_ISLAND_PROXIMITY_H_

#include <cmath>

namespace blanc::island_proximity {

// The native half of the approach swell (shipping v1.45.1's main.js
// updateIslandProximity, the host half in host.js). The host measures how
// close the cursor is with shipping's own island-proximity.js; native only
// forwards the page's moves, which the host cannot see, and draws the swell on
// Chromium's extension buttons. Standard library only, so
// tools/island-proximity.test.mjs can compile it beside shipping's module.
// Points and boxes are Island host view coordinates.

// island-proximity.js RANGE: farther out the pill is at rest.
inline constexpr double kRangePx = 250;
// A move this far from the Island's clickable box is forwarded once, which
// settles the pill at rest, and then no more until a move comes back within it.
inline constexpr double kForwardReachPx = kRangePx + 10;
// At most one move a frame reaches the host (shipping's 16 ms budget).
inline constexpr int kFrameMs = 16;
// The swell grows the pill 2% and lifts it 2px (styles.css, at --pill-zoom);
// anything well beyond that is not a swell.
inline constexpr double kMaxSwellScale = 1.05;
inline constexpr double kMaxSwellShiftPx = 64;

struct Point {
  double x;
  double y;
};

struct Rect {
  double x;
  double y;
  double width;
  double height;
};

// island-proximity.js distanceToRect: to the box's edge, 0 inside.
inline double DistanceToRect(Point point, Rect rect) {
  const double dx = std::fmax(std::fmax(rect.x - point.x, 0.0), point.x - (rect.x + rect.width));
  const double dy = std::fmax(std::fmax(rect.y - point.y, 0.0), point.y - (rect.y + rect.height));
  return std::hypot(dx, dy);
}

inline bool Near(Point point, Rect rect) {
  return std::isfinite(point.x) && std::isfinite(point.y) && rect.width > 0 && rect.height > 0 &&
         DistanceToRect(point, rect) <= kForwardReachPx;
}

enum class Forward {
  kNone,  // Out of reach and already said so.
  kSend,  // Send it now and start the frame.
  kPark,  // A frame is running: keep it as the newest, sent when it ends.
};

// One page move. `was_near` is the window's memory of the last move; the first
// move out of reach still goes, so the host hears the pill should rest. The
// pointer leaving the Island's own view sets it too (IslandPointerLeft): that
// view's moves never pass through here.
inline Forward PageMove(bool& was_near, bool frame_running, Point point, Rect island) {
  const bool near = Near(point, island);
  if (!near && !was_near) return Forward::kNone;
  was_near = near;
  return frame_running ? Forward::kPark : Forward::kSend;
}

// The host's measure of the extension slot's swell (host.js
// syncExtensionsSwell): its growth and its move from its resting place.
inline bool ValidSwell(double scale, double dx, double dy) {
  return std::isfinite(scale) && std::isfinite(dx) && std::isfinite(dy) && scale >= 1 &&
         scale <= kMaxSwellScale && std::fabs(dx) <= kMaxSwellShiftPx && std::fabs(dy) <= kMaxSwellShiftPx;
}

}  // namespace blanc::island_proximity

#endif  // BLANC_BROWSER_UI_ISLAND_PROXIMITY_H_
