#ifndef BLANC_GLANCE_FLOATING_DRAFT_MODAL_POSITION_H_
#define BLANC_GLANCE_FLOATING_DRAFT_MODAL_POSITION_H_

#include <optional>

namespace blanc::glance::draft {
struct ModalRect { int x, y, width, height; };
struct ModalSize { int width, height; };
struct ModalPoint { int x, y; };

// Widget-coordinate positioning only. No view, widget, or modal ownership.
std::optional<ModalPoint> ModalPosition(ModalRect page, ModalRect area,
                                        ModalSize dialog);
}  // namespace blanc::glance::draft
#endif
