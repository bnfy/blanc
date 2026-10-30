#ifndef BLANC_GLANCE_FLOATING_DRAFT_CARD_ACTIONS_H_
#define BLANC_GLANCE_FLOATING_DRAFT_CARD_ACTIONS_H_

#include <cstdint>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "glance_card_handler.h"
#include "ui/views/view_tracker.h"

namespace views { class WebView; }
namespace blanc::glance::draft {
class FrameController;
class GlanceCardAuthority;

// Transition is the owning window's change/open-as-tab/split/close operation;
// it must perform its own current-generation and lifecycle checks.
class GlanceCardActions {
 public:
  using Transition = base::RepeatingCallback<bool(const std::string&, uint64_t)>;
  GlanceCardActions(views::WebView* card,
                    base::WeakPtr<GlanceCardAuthority> authority,
                    base::WeakPtr<FrameController> frame,
                    Transition transition);
  ~GlanceCardActions();
  GlanceCardHandler::Dispatch MakeDispatchCallback();

 private:
  CardReply Dispatch(const CardRequest& request);
  views::ViewTracker card_;
  base::WeakPtr<GlanceCardAuthority> authority_;
  base::WeakPtr<FrameController> frame_;
  Transition transition_;
  base::WeakPtrFactory<GlanceCardActions> weak_factory_{this};
};
}  // namespace blanc::glance::draft
#endif
