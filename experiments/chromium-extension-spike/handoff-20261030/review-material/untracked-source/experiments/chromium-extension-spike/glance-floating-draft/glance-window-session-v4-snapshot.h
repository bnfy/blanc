#ifndef BLANC_GLANCE_FLOATING_DRAFT_WINDOW_SESSION_H_
#define BLANC_GLANCE_FLOATING_DRAFT_WINDOW_SESSION_H_

#include <cstdint>
#include <memory>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "glance_card_actions.h"
#include "ui/views/view_tracker.h"

class BrowserView;
namespace tabs { class TabInterface; }
namespace views { class View; class WebView; }
namespace blanc::glance::draft {
class FrameController;
class GlanceCardBinding;
class GlanceTabAttachment;
class GlanceOverlayView;
struct CardGeometry;

// Unintegrated window session. The caller owns and lays out the overlay, and
// must call BeforeTabChange/BeforeSplit before Chromium reattaches contents.
class GlanceWindowSession {
 public:
  using Suspended = base::RepeatingCallback<void(bool frame_saved)>;
  static std::unique_ptr<GlanceWindowSession> Create(
      BrowserView* browser, GlanceOverlayView* overlay, views::WebView* card,
      views::WebView* page, tabs::TabInterface* main, tabs::TabInterface* reference,
      uint64_t generation, std::unique_ptr<FrameController> frame,
      GlanceCardActions::Transition transition, Suspended suspended);
  ~GlanceWindowSession();
  GlanceWindowSession(const GlanceWindowSession&) = delete;
  GlanceWindowSession& operator=(const GlanceWindowSession&) = delete;
  // Explicit close can fail when pending frame persistence fails.
  bool Close();
  // Reports queueing only; a separate draw acknowledgement is still needed.
  bool Publish(const CardGeometry& geometry, bool focused);
  // Lays out and queues state but deliberately does not reveal the overlay.
  bool LayoutAndPublish(bool focused);
  // Handoff cannot veto Chromium's change: revoke and detach immediately,
  // keeping this object alive for the owner to retry an unsuccessful flush.
  void BeforeTabChange();
  void BeforeSplit();

 private:
  GlanceWindowSession(GlanceOverlayView* overlay, uint64_t generation,
                      std::unique_ptr<FrameController> frame,
                      Suspended suspended);
  void Suspend();
  void OnTabInvalidated();
  views::ViewTracker overlay_;
  std::unique_ptr<FrameController> frame_;
  std::unique_ptr<GlanceTabAttachment> attachment_;
  std::unique_ptr<GlanceCardBinding> binding_;
  Suspended suspended_callback_;
  const uint64_t generation_;
  bool suspended_ = false;
  bool closed_ = false;
  bool saving_ = false;
  base::WeakPtrFactory<GlanceWindowSession> weak_factory_{this};
};
}  // namespace blanc::glance::draft
#endif
