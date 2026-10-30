#include "glance_window_session.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/time/time.h"
#include "chrome/browser/ui/views/frame/browser_view.h"
#include "glance_card_binding.h"
#include "glance_frame_controller.h"
#include "glance_overlay_view.h"
#include "glance_tab_attachment.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/views/view.h"

namespace blanc::glance::draft {
GlanceWindowSession::GlanceWindowSession(GlanceOverlayView* overlay, uint64_t generation,
    std::unique_ptr<FrameController> frame, Suspended suspended)
    : overlay_(overlay), frame_(std::move(frame)),
      suspended_callback_(std::move(suspended)), generation_(generation) {
  overlay_.SetTrackEntireViewHierarchy(true);
}
GlanceWindowSession::~GlanceWindowSession() {
  binding_.reset();
  attachment_.reset();
}
std::unique_ptr<GlanceWindowSession> GlanceWindowSession::Create(
    BrowserView* browser, GlanceOverlayView* overlay, views::WebView* card,
    views::WebView* page, tabs::TabInterface* main, tabs::TabInterface* reference,
    uint64_t generation, std::unique_ptr<FrameController> frame,
    GlanceCardActions::Transition transition, Suspended suspended) {
  if (!browser || !overlay || !card || !page || !main || !reference ||
      overlay->GetVisible() || !frame || !transition || !suspended || !generation ||
      generation > 9007199254740991ULL)
    return nullptr;
  auto session = std::unique_ptr<GlanceWindowSession>(
      new GlanceWindowSession(overlay, generation, std::move(frame), std::move(suspended)));
  if (!session->frame_->Open(generation)) return nullptr;
  session->attachment_ = std::make_unique<GlanceTabAttachment>(
      browser, page, base::BindRepeating(&GlanceWindowSession::OnTabInvalidated,
                                         session->weak_factory_.GetWeakPtr()));
  if (!session->attachment_->Attach(reference) || session->suspended_) return nullptr;
  auto wrapped_transition = base::BindRepeating(
      [](base::WeakPtr<GlanceWindowSession> self,
         GlanceCardActions::Transition transition, const std::string& action,
         uint64_t action_generation) {
        if (!self || self->generation_ != action_generation) return false;
        if (action == "ready") return self->MarkDrawn(action_generation);
        return transition.Run(action, action_generation);
      }, session->weak_factory_.GetWeakPtr(), std::move(transition));
  session->binding_ = GlanceCardBinding::Create(
      browser->browser(), card, page, main, reference, generation,
      session->frame_->GetWeakPtr(), std::move(wrapped_transition));
  if (!session->binding_) return nullptr;
  return session;
}
bool GlanceWindowSession::Publish(const CardGeometry& geometry, bool focused) {
  if (closed_ || suspended_ || !binding_) return false;
  return binding_->Publish(generation_, geometry, focused);
}
bool GlanceWindowSession::LayoutAndPublish(bool focused) {
  if (closed_ || suspended_ || !binding_) return false;
  auto weak = weak_factory_.GetWeakPtr();
  auto geometry = frame_->CardLayout();
  if (!weak || !geometry || weak->closed_ || weak->suspended_) return false;
  auto* overlay = static_cast<GlanceOverlayView*>(weak->overlay_.view());
  if (!overlay) return false;
  // CardLayout returns bounded, rounded geometry. Overlay validates containment
  // before applying it; its actual parent must use the same coordinate space.
  const auto convert = [](Rect r) {
    return gfx::Rect(static_cast<int>(r.x), static_cast<int>(r.y),
                     static_cast<int>(r.width), static_cast<int>(r.height));
  };
  if (!overlay->SetCardBounds(convert(geometry->chrome), convert(geometry->page)))
    return false;
  if (!weak) return false;
  const bool queued = weak->Publish(*geometry, focused);
  if (!weak) return false;
  if (!queued) {
    if (auto* view = weak->overlay_.view()) view->SetVisible(false);
    return false;
  }
  return true;
}
bool GlanceWindowSession::BeginReveal(bool focused) {
  if (closed_ || suspended_ || saving_ || reveal_waiting_ || !binding_ ||
      !binding_->IsDocumentReady(generation_)) return false;
  auto weak = weak_factory_.GetWeakPtr();
  reveal_waiting_ = true;
  reveal_focused_ = focused;
  if (!LayoutAndPublish(focused)) {
    if (weak) weak->reveal_waiting_ = false;
    return false;
  }
  if (!weak) return false;
  if (weak->reveal_waiting_) {
    weak->reveal_timer_.Start(FROM_HERE, base::Milliseconds(300),
        base::BindOnce([](base::WeakPtr<GlanceWindowSession> session,
                          uint64_t generation) {
          if (session) session->MarkDrawn(generation);
        }, weak, generation_));
  }
  return true;
}
bool GlanceWindowSession::MarkDrawn(uint64_t generation) {
  if (generation != generation_ || closed_ || suspended_ || saving_ ||
      !reveal_waiting_ || !binding_ || !binding_->IsDocumentReady(generation))
    return false;
  reveal_waiting_ = false;
  reveal_timer_.Stop();
  auto weak = weak_factory_.GetWeakPtr();
  if (!LayoutAndPublish(reveal_focused_) || !weak) return false;
  auto* overlay = weak->overlay_.view();
  if (!overlay) return false;
  overlay->SetVisible(true);
  return !!weak;
}
bool GlanceWindowSession::Close() {
  if (closed_ || saving_) return false;
  reveal_timer_.Stop();
  reveal_waiting_ = false;
  const bool was_suspended = suspended_;
  saving_ = true;
  auto weak = weak_factory_.GetWeakPtr();
  const bool saved = frame_->Close();
  if (!weak) return false;
  weak->saving_ = false;
  if (!was_suspended && weak->suspended_) {
    auto callback = weak->suspended_callback_;
    callback.Run(saved);
    if (!weak) return false;
  }
  if (!saved) return false;
  weak->closed_ = true;
  weak->binding_.reset();
  if (!weak) return false;
  if (auto* overlay = weak->overlay_.view()) overlay->SetVisible(false);
  if (!weak) return false;
  weak->attachment_->Detach();
  return !!weak;
}
void GlanceWindowSession::Suspend() {
  if (closed_ || suspended_) return;
  reveal_timer_.Stop();
  reveal_waiting_ = false;
  suspended_ = true;
  auto weak = weak_factory_.GetWeakPtr();
  binding_.reset();
  if (!weak) return;
  if (auto* overlay = weak->overlay_.view()) overlay->SetVisible(false);
  if (!weak) return;
  weak->attachment_->Detach();
  if (!weak) return;
  if (weak->saving_) return;
  weak->saving_ = true;
  const bool saved = weak->frame_->Flush();
  if (!weak) return;
  weak->saving_ = false;
  auto callback = weak->suspended_callback_;
  callback.Run(saved);
}
void GlanceWindowSession::BeforeTabChange() { Suspend(); }
void GlanceWindowSession::BeforeSplit() { Suspend(); }
void GlanceWindowSession::OnTabInvalidated() { Suspend(); }
}  // namespace blanc::glance::draft
