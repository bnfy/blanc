#include "glance_card_binding.h"

#include <utility>

#include "content/public/browser/web_contents.h"
#include "glance_card_authority.h"
#include "glance_card_state.h"
#include "glance_frame_controller.h"
#include "ui/views/controls/webview/webview.h"

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
}  // namespace blanc::glance::draft
