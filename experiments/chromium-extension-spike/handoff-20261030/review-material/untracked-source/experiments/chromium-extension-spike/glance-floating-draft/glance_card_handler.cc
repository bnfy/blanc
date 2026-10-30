#include "glance_card_handler.h"

#include <utility>

#include "base/check.h"
#include "base/functional/bind.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "url/gurl.h"

namespace blanc::glance::draft {
namespace {
constexpr char kCardCapabilityKey[] = "blanc-glance-card-capability";
}  // namespace

GlanceCardHandler::Capability::Capability(Authorize authorize, Dispatch dispatch)
    : authorize_(std::move(authorize)), dispatch_(std::move(dispatch)) {
  CHECK(authorize_);
  CHECK(dispatch_);
}
GlanceCardHandler::Capability::~Capability() = default;
base::WeakPtr<GlanceCardHandler::Capability>
GlanceCardHandler::InstallCapability(content::WebContents* card,
                                     Authorize authorize, Dispatch dispatch) {
  if (!card || card->IsBeingDestroyed() || !authorize || !dispatch ||
      card->GetUserData(kCardCapabilityKey)) return {};
  auto capability = std::make_unique<Capability>(std::move(authorize), std::move(dispatch));
  auto lease = capability->weak_factory_.GetWeakPtr();
  card->SetUserData(kCardCapabilityKey, std::move(capability));
  return lease;
}
void GlanceCardHandler::RevokeCapability(content::WebContents* card,
                                         base::WeakPtr<Capability> lease) {
  if (card && lease && card->GetUserData(kCardCapabilityKey) == lease.get())
    card->RemoveUserData(kCardCapabilityKey);
}
GlanceCardHandler::GlanceCardHandler() = default;
GlanceCardHandler::~GlanceCardHandler() = default;
void GlanceCardHandler::RegisterMessages() {
  web_ui()->RegisterMessageCallback("blancGlanceCard", base::BindRepeating(
      &GlanceCardHandler::Handle, base::Unretained(this)));
}
void GlanceCardHandler::OnJavascriptDisallowed() {
  weak_factory_.InvalidateWeakPtrs();
}
bool GlanceCardHandler::IsCardDocument() {
  auto* contents = web_ui()->GetWebContents();
  auto* frame = web_ui()->GetRenderFrameHost();
  const GURL expected("chrome://blanc-prototype/glance/card.html");
  return contents && frame && frame == contents->GetPrimaryMainFrame() &&
      frame->GetLastCommittedURL() == expected &&
      contents->GetLastCommittedURL() == expected && frame->IsRenderFrameLive();
}
void GlanceCardHandler::Handle(const base::ListValue& message) {
  auto request = ParseCardRequest(message);
  if (!request || !IsCardDocument()) return;
  auto weak = weak_factory_.GetWeakPtr();
  auto* card = web_ui()->GetWebContents();
  auto* capability = static_cast<Capability*>(card->GetUserData(kCardCapabilityKey));
  if (!capability) return;
  auto lease = capability->weak_factory_.GetWeakPtr();
  auto authorize = capability->authorize_;
  auto dispatch = capability->dispatch_;
  const bool allowed = authorize.Run(card, request->generation);
  if (!weak || !lease || !allowed || !weak->IsCardDocument() ||
      weak->web_ui()->GetWebContents() != card) return;
  weak->AllowJavascript();
  CardReply reply = dispatch.Run(*request);
  if (!weak || !lease || !weak->IsJavascriptAllowed() || !weak->IsCardDocument() ||
      weak->web_ui()->GetWebContents() != card) return;
  const bool still_allowed = authorize.Run(card, request->generation);
  if (!weak || !lease || !still_allowed || !weak->IsJavascriptAllowed() ||
      !weak->IsCardDocument() || weak->web_ui()->GetWebContents() != card) return;
  weak->web_ui()->CallJavascriptFunctionUnsafe("blancGlanceCardReply",
      base::Value(request->id), base::Value(reply.success), reply.value);
}
}  // namespace blanc::glance::draft
