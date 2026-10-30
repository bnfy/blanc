#include "glance_window_session.h"

#include <utility>

#include "base/functional/bind.h"
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
  session->binding_ = GlanceCardBinding::Create(
      browser->browser(), card, page, main, reference, generation,
      session->frame_->GetWeakPtr(), std::move(transition));
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
bool GlanceWindowSession::Close() {
  if (closed_ || saving_) return false;
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
