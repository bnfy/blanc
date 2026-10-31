#include "glance_window_session.h"

#include <utility>

#include "base/functional/bind.h"
#include "chrome/browser/ui/views/frame/browser_view.h"
#include "glance_card_binding.h"
#include "glance_frame_controller.h"
#include "glance_tab_attachment.h"
#include "ui/views/view.h"

namespace blanc::glance::draft {
GlanceWindowSession::GlanceWindowSession(views::View* overlay,
    std::unique_ptr<FrameController> frame, Suspended suspended)
    : overlay_(overlay), frame_(std::move(frame)),
      suspended_callback_(std::move(suspended)) {
  overlay_.SetTrackEntireViewHierarchy(true);
}
GlanceWindowSession::~GlanceWindowSession() {
  binding_.reset();
  attachment_.reset();
}
std::unique_ptr<GlanceWindowSession> GlanceWindowSession::Create(
    BrowserView* browser, views::View* overlay, views::WebView* card,
    views::WebView* page, tabs::TabInterface* main, tabs::TabInterface* reference,
    uint64_t generation, std::unique_ptr<FrameController> frame,
    GlanceCardActions::Transition transition, Suspended suspended) {
  if (!browser || !overlay || !card || !page || !main || !reference ||
      !frame || !transition || !suspended || !generation) return nullptr;
  auto session = std::unique_ptr<GlanceWindowSession>(
      new GlanceWindowSession(overlay, std::move(frame), std::move(suspended)));
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
bool GlanceWindowSession::Close() {
  if (closed_) return false;
  auto weak = weak_factory_.GetWeakPtr();
  const bool saved = frame_->Close();
  if (!weak || !saved) return false;
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
  const bool saved = weak->frame_->Flush();
  if (!weak) return;
  auto callback = weak->suspended_callback_;
  callback.Run(saved);
}
void GlanceWindowSession::BeforeTabChange() { Suspend(); }
void GlanceWindowSession::BeforeSplit() { Suspend(); }
void GlanceWindowSession::OnTabInvalidated() { Suspend(); }
}  // namespace blanc::glance::draft
