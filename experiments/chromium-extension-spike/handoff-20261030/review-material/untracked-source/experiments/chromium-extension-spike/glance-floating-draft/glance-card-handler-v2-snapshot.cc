#include "glance_card_handler.h"

#include <utility>

#include "base/check.h"
#include "base/functional/bind.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "url/gurl.h"

namespace blanc::glance::draft {

GlanceCardHandler::GlanceCardHandler(Authorize authorize, Dispatch dispatch)
    : authorize_(std::move(authorize)), dispatch_(std::move(dispatch)) {
  CHECK(authorize_);
  CHECK(dispatch_);
}
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
  auto authorize = authorize_;
  auto dispatch = dispatch_;
  const bool allowed = authorize.Run(web_ui()->GetWebContents(), request->generation);
  if (!weak || !allowed || !weak->IsCardDocument()) return;
  weak->AllowJavascript();
  CardReply reply = dispatch.Run(*request);
  if (!weak || !weak->IsJavascriptAllowed() || !weak->IsCardDocument()) return;
  const bool still_allowed = authorize.Run(weak->web_ui()->GetWebContents(), request->generation);
  if (!weak || !still_allowed || !weak->IsJavascriptAllowed() || !weak->IsCardDocument()) return;
  weak->web_ui()->CallJavascriptFunctionUnsafe("blancGlanceCardReply",
      base::Value(request->id), base::Value(reply.success), reply.value);
}
}  // namespace blanc::glance::draft
