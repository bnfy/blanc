#ifndef BLANC_GLANCE_FLOATING_DRAFT_CARD_STATE_H_
#define BLANC_GLANCE_FLOATING_DRAFT_CARD_STATE_H_

#include <cstdint>

#include "base/memory/weak_ptr.h"
#include "glance_geometry.h"

namespace content { class WebContents; }
namespace blanc::glance::draft {
class GlanceCardAuthority;

// Returns whether delivery was queued, not whether the renderer painted it.
// The caller owns layout and must use geometry from the same current frame.
bool PublishCardState(content::WebContents* card,
                      base::WeakPtr<GlanceCardAuthority> authority,
                      uint64_t generation, const CardGeometry& geometry,
                      bool focused);
}  // namespace blanc::glance::draft
#endif
