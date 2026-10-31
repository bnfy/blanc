#include "glance_geometry.h"

#include <algorithm>
#include <cmath>

namespace blanc::glance::draft {
namespace {
double FiniteOr(double x, double fallback) { return std::isfinite(x) ? x : fallback; }
double Clamp(double x, double low, double high) { return std::min(high, std::max(low, x)); }
double Round(double x) { return std::floor(x + 0.5); }
Rect Rounded(Rect r) { return {Round(r.x), Round(r.y), Round(r.width), Round(r.height)}; }
Rect Area(Rect r) {
  return {FiniteOr(r.x, 0), FiniteOr(r.y, 0), std::max(0.0, FiniteOr(r.width, 0)),
          std::max(0.0, FiniteOr(r.height, 0))};
}
bool Tiny(Rect r) { return r.width < 360 || r.height < 280; }
Rect TinyFrame(Rect r) {
  return Rounded({r.x + 8, r.y + 8, std::max(0.0, r.width - 16),
                  std::max(0.0, r.height - 16)});
}
}  // namespace

Rect ClampFrame(Rect frame, Rect page_area) {
  const auto a = Area(page_area);
  if (Tiny(a)) return TinyFrame(a);
  const double w = Clamp(FiniteOr(frame.width, 360), 360, a.width);
  const double h = Clamp(FiniteOr(frame.height, 280), 280, a.height);
  return Rounded({Clamp(FiniteOr(frame.x, a.x), a.x, a.x + a.width - w),
                  Clamp(FiniteOr(frame.y, a.y), a.y, a.y + a.height - h), w, h});
}
Rect DefaultFrame(Rect page_area) {
  const auto a = Area(page_area);
  const double width = std::min(1100.0, Round(a.width * 0.8));
  return ClampFrame({a.x + (a.width - width) / 2, a.y + 16, width,
                     a.height - 48}, a);
}
Rect FrameToFractions(Rect frame, Rect page_area) {
  const auto a = Area(page_area);
  const auto share = [](double value, double size) {
    return size > 0 ? Clamp(value / size, 0, 1) : 0;
  };
  return {share(frame.x - a.x, a.width), share(frame.y - a.y, a.height),
          share(frame.width, a.width), share(frame.height, a.height)};
}
Rect FractionsToFrame(std::optional<Rect> fractions, Rect page_area) {
  const auto a = Area(page_area);
  if (!fractions) return DefaultFrame(a);
  const auto f = *fractions;
  return ClampFrame({a.x + f.x * a.width, a.y + f.y * a.height,
                     f.width * a.width, f.height * a.height}, a);
}
Rect MoveFrame(Rect frame, double dx, double dy, Rect page_area) {
  frame.x += FiniteOr(dx, 0);
  frame.y += FiniteOr(dy, 0);
  return ClampFrame(frame, page_area);
}
Rect ResizeFrame(Rect frame, std::string_view edge, double dx, double dy,
                 Rect page_area) {
  const auto a = Area(page_area);
  if (edge != "n" && edge != "s" && edge != "e" && edge != "w" &&
      edge != "ne" && edge != "nw" && edge != "se" && edge != "sw")
    return ClampFrame(frame, a);
  if (Tiny(a)) return ClampFrame(frame, a);
  dx = FiniteOr(dx, 0); dy = FiniteOr(dy, 0);
  double left = frame.x, top = frame.y, right = frame.x + frame.width,
         bottom = frame.y + frame.height;
  if (edge.find('w') != edge.npos) left = Clamp(left + dx, a.x, right - 360);
  if (edge.find('e') != edge.npos) right = Clamp(right + dx, left + 360, a.x + a.width);
  if (edge.find('n') != edge.npos) top = Clamp(top + dy, a.y, bottom - 280);
  if (edge.find('s') != edge.npos) bottom = Clamp(bottom + dy, top + 280, a.y + a.height);
  return ClampFrame({left, top, right - left, bottom - top}, a);
}
CardGeometry Geometry(Rect frame, std::optional<Rect> page_area) {
  const double top = page_area ? std::min(12.0, std::max(0.0, frame.y - page_area->y)) : 12;
  return {Rounded({frame.x - 20, frame.y - top, frame.width + 40, frame.height + top + 28}),
          Rounded(frame), Rounded({frame.x, frame.y, frame.width, 40}),
          Rounded({frame.x + 6, frame.y + 40, frame.width - 12, frame.height - 46})};
}
}  // namespace blanc::glance::draft
