#ifndef BLANC_GLANCE_FLOATING_DRAFT_CARD_BINDING_H_
#define BLANC_GLANCE_FLOATING_DRAFT_CARD_BINDING_H_

#include <cstdint>
#include <memory>

#include "base/memory/weak_ptr.h"
#include "glance_card_actions.h"
#include "glance_card_handler.h"

class BrowserWindowInterface;
namespace content { class WebContents; }
namespace tabs { class TabInterface; }
namespace views { class WebView; }
namespace blanc::glance::draft {
class FrameController;
class GlanceCardAuthority;

// Window-owned lease joining the authority, dispatcher and card WebContents.
// The window must close it on every card replacement, teardown or handoff.
class GlanceCardBinding {
 public:
  static std::unique_ptr<GlanceCardBinding> Create(
      BrowserWindowInterface* browser, views::WebView* card, views::WebView* page,
      tabs::TabInterface* main, tabs::TabInterface* reference, uint64_t generation,
      base::WeakPtr<FrameController> frame, GlanceCardActions::Transition transition);
  ~GlanceCardBinding();
  GlanceCardBinding(const GlanceCardBinding&) = delete;
  GlanceCardBinding& operator=(const GlanceCardBinding&) = delete;
  void Revoke();

 private:
  GlanceCardBinding();
  base::WeakPtr<content::WebContents> card_;
  base::WeakPtr<GlanceCardHandler::Capability> capability_;
  std::unique_ptr<GlanceCardAuthority> authority_;
  std::unique_ptr<GlanceCardActions> actions_;
};
}  // namespace blanc::glance::draft
#endif
