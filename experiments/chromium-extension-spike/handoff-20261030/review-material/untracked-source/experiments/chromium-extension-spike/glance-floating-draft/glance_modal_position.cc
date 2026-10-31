#include "glance_modal_position.h"

#include <algorithm>
#include <cstdint>

namespace blanc::glance::draft {
namespace {
constexpr int kLimit = 1000000;
bool ValidRect(ModalRect r) {
  return r.x >= -kLimit && r.x <= kLimit && r.y >= -kLimit && r.y <= kLimit &&
         r.width > 0 && r.width <= kLimit && r.height > 0 && r.height <= kLimit;
}
}  // namespace

std::optional<ModalPoint> ModalPosition(ModalRect page, ModalRect area,
                                        ModalSize dialog) {
  if (!ValidRect(page) || !ValidRect(area) || dialog.width < 0 ||
      dialog.height < 0 || dialog.width > kLimit || dialog.height > kLimit) {
    return std::nullopt;
  }
  const int64_t x = static_cast<int64_t>(page.x) + page.width / 2 -
                    static_cast<int64_t>(dialog.width) / 2;
  const int64_t max_x = std::max<int64_t>(area.x,
      static_cast<int64_t>(area.x) + area.width - dialog.width);
  const int64_t max_y = std::max<int64_t>(area.y,
      static_cast<int64_t>(area.y) + area.height - dialog.height);
  return ModalPoint{static_cast<int>(std::clamp<int64_t>(x, area.x, max_x)),
                    static_cast<int>(std::clamp<int64_t>(page.y, area.y, max_y))};
}
}  // namespace blanc::glance::draft
