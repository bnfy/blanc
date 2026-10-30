#include "glance_card_handler.h"

#include <cmath>
#include <limits>
#include <string_view>
#include <utility>

#include "base/check.h"
#include "base/functional/bind.h"
#include "base/strings/string_number_conversions.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "url/gurl.h"

namespace blanc::glance::draft {
namespace {
constexpr double kMaxSafeInteger = 9007199254740991.0;
bool IsAction(std::string_view action) {
  return action == "back" || action == "reload" || action == "stop" ||
      action == "change" || action == "openAsTab" || action == "keepSplit" ||
      action == "close" || action == "move" || action == "resize" || action == "reset";
}
bool IsEdge(std::string_view edge) {
  return edge == "n" || edge == "s" || edge == "e" || edge == "w" ||
      edge == "ne" || edge == "nw" || edge == "se" || edge == "sw";
}
bool IsDelta(const base::DictValue& arguments, std::string_view key) {
  const auto value = arguments.FindDouble(key);
  return value && std::isfinite(*value) && std::abs(*value) <= 1000000;
}
}  // namespace

std::optional<CardRequest> ParseCardRequest(const base::ListValue& message) {
  if (message.size() != 3 || !message[0].is_string() ||
      !message[1].is_string() || !message[2].is_dict()) return std::nullopt;
  const std::string& id = message[0].GetString();
  const std::string& action = message[1].GetString();
  const auto& data = message[2].GetDict();
  uint64_t number = 0;
  if (id.empty() || id.size() > 16 || id[0] == '0' ||
      id.find_first_not_of("0123456789") != std::string::npos ||
      !base::StringToUint64(id, &number) || number == 0 ||
      number > static_cast<uint64_t>(kMaxSafeInteger) || !IsAction(action)) return std::nullopt;
  const auto generation = data.FindDouble("generation");
  if (!generation || !std::isfinite(*generation) || *generation < 1 ||
      *generation > kMaxSafeInteger || std::trunc(*generation) != *generation) return std::nullopt;
  if (action == "move" || action == "resize") {
    if (data.size() != (action == "move" ? 3u : 4u) ||
        !IsDelta(data, "dx") || !IsDelta(data, "dy")) return std::nullopt;
    if (action == "resize") {
      const auto* edge = data.FindString("edge");
      if (!edge || !IsEdge(*edge)) return std::nullopt;
    }
  } else if (data.size() != 1u) {
    return std::nullopt;
  }
  return CardRequest{id, action, static_cast<uint64_t>(*generation), data.Clone()};
}

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
