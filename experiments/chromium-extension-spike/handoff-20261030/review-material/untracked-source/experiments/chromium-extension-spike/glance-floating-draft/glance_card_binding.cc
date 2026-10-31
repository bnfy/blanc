#include "glance_card_binding.h"

#include <utility>

#include "content/public/browser/web_contents.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_ui.h"
#include "glance_card_authority.h"
#include "glance_card_state.h"
#include "glance_frame_controller.h"
#include "ui/views/controls/webview/webview.h"
#include "url/gurl.h"

namespace blanc::glance::draft {

GlanceCardBinding::GlanceCardBinding() = default;
GlanceCardBinding::~GlanceCardBinding() { Revoke(); }

std::unique_ptr<GlanceCardBinding> GlanceCardBinding::Create(
    BrowserWindowInterface* browser, views::WebView* card, views::WebView* page,
    tabs::TabInterface* main, tabs::TabInterface* reference, uint64_t generation,
    base::WeakPtr<FrameController> frame, GlanceCardActions::Transition transition) {
  if (!browser || !card || !page || !main || !reference || !generation ||
      !frame || !transition || !card->web_contents()) return nullptr;
  auto binding = std::unique_ptr<GlanceCardBinding>(new GlanceCardBinding());
  auto* contents = card->web_contents();
  binding->card_ = contents->GetWeakPtr();
  binding->authority_ = std::make_unique<GlanceCardAuthority>(
      browser, card, page, main, reference, generation);
  if (!binding->authority_->Authorize(contents, generation)) return nullptr;
  binding->actions_ = std::make_unique<GlanceCardActions>(
      card, binding->authority_->GetWeakPtr(), std::move(frame), std::move(transition));
  binding->capability_ = GlanceCardHandler::InstallCapability(
      contents, binding->authority_->MakeAuthorizeCallback(),
      binding->actions_->MakeDispatchCallback());
  if (!binding->capability_) return nullptr;
  return binding;
}
void GlanceCardBinding::Revoke() {
  if (card_) GlanceCardHandler::RevokeCapability(card_.get(), capability_);
  capability_.reset();
  actions_.reset();
  authority_.reset();
  card_.reset();
}
bool GlanceCardBinding::Publish(uint64_t generation, const CardGeometry& geometry,
                                bool focused) {
  if (!card_ || !authority_ || !capability_) return false;
  return PublishCardState(card_.get(), authority_->GetWeakPtr(), generation,
                          geometry, focused);
}
bool GlanceCardBinding::IsDocumentReady(uint64_t generation) {
  if (!card_ || !authority_ || !capability_ ||
      !authority_->Authorize(card_.get(), generation) ||
      !card_->IsDocumentOnLoadCompletedInPrimaryMainFrame()) return false;
  auto* frame = card_->GetPrimaryMainFrame();
  auto* web_ui = card_->GetWebUI();
  const GURL expected("chrome://blanc-prototype/glance/card.html");
  return frame && web_ui && frame == web_ui->GetRenderFrameHost() &&
      frame->IsRenderFrameLive() && web_ui->CanCallJavascript() &&
      frame->GetLastCommittedURL() == expected &&
      card_->GetLastCommittedURL() == expected;
}
}  // namespace blanc::glance::draft
