#ifndef BLANC_GLANCE_FLOATING_DRAFT_GEOMETRY_H_
#define BLANC_GLANCE_FLOATING_DRAFT_GEOMETRY_H_

#include <optional>
#include <string_view>

namespace blanc::glance::draft {
// This models shipping geometry only. A native owner must validate dimensions,
// bind them to a live window/card generation, and safely convert to gfx::Rect.
struct Rect { double x, y, width, height; };
struct CardGeometry { Rect chrome, frame, header, page; };

Rect DefaultFrame(Rect page_area);
Rect ClampFrame(Rect frame, Rect page_area);
Rect FrameToFractions(Rect frame, Rect page_area);
Rect FractionsToFrame(std::optional<Rect> fractions, Rect page_area);
Rect MoveFrame(Rect frame, double dx, double dy, Rect page_area);
Rect ResizeFrame(Rect frame, std::string_view edge, double dx, double dy,
                 Rect page_area);
CardGeometry Geometry(Rect frame, std::optional<Rect> page_area);
}  // namespace blanc::glance::draft
#endif
