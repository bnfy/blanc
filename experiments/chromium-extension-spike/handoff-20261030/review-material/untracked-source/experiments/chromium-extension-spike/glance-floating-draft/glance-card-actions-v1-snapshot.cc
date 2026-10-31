#include "glance_card_actions.h"

#include <utility>

#include "base/check.h"
#include "base/functional/bind.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/reload_type.h"
#include "content/public/browser/web_contents.h"
#include "glance_card_authority.h"
#include "glance_frame_controller.h"
#include "ui/views/controls/webview/webview.h"

namespace blanc::glance::draft {
namespace {
CardReply Rejected() { return {false, base::Value()}; }
CardReply Result(bool value) { return {true, base::Value(value)}; }
CardReply FrameResult(std::optional<Rect> frame) {
  if (!frame) return Rejected();
  base::DictValue data;
  data.Set("x", frame->x).Set("y", frame->y)
      .Set("width", frame->width).Set("height", frame->height);
  return {true, base::Value(std::move(data))};
}
}  // namespace

GlanceCardActions::GlanceCardActions(views::WebView* card,
    base::WeakPtr<GlanceCardAuthority> authority,
    base::WeakPtr<FrameController> frame, Transition transition)
    : card_(card), authority_(std::move(authority)), frame_(std::move(frame)),
      transition_(std::move(transition)) {
  CHECK(card);
  card_.SetTrackEntireViewHierarchy(true);
}
GlanceCardActions::~GlanceCardActions() = default;
GlanceCardHandler::Dispatch GlanceCardActions::MakeDispatchCallback() {
  return base::BindRepeating(
      [](base::WeakPtr<GlanceCardActions> self, const CardRequest& request) {
        return self ? self->Dispatch(request) : Rejected();
      }, weak_factory_.GetWeakPtr());
}
CardReply GlanceCardActions::Dispatch(const CardRequest& request) {
  auto* card = static_cast<views::WebView*>(card_.view());
  if (!card || !authority_) return Rejected();
  auto* reference = authority_->ReferenceContents(card->web_contents(), request.generation);
  if (!reference || reference->IsBeingDestroyed()) return Rejected();
  const std::string action = request.action;
  if (action == "back") {
    auto& navigation = reference->GetController();
    if (!navigation.CanGoBack()) return Result(false);
    navigation.GoBack();
    return Result(true);
  }
  if (action == "reload") {
    reference->GetController().Reload(content::ReloadType::NORMAL, true);
    return Result(true);
  }
  if (action == "stop") {
    reference->Stop();
    return Result(true);
  }
  if (action == "move" || action == "resize") {
    const auto dx = request.arguments.FindDouble("dx");
    const auto dy = request.arguments.FindDouble("dy");
    if (!frame_ || !dx || !dy) return Rejected();
    if (action == "move") return FrameResult(frame_->Move(request.generation, *dx, *dy));
    const auto* edge = request.arguments.FindString("edge");
    if (!edge) return Rejected();
    return FrameResult(frame_->Resize(request.generation, *edge, *dx, *dy));
  }
  if (action == "reset") {
    return frame_ ? FrameResult(frame_->Reset(request.generation)) : Rejected();
  }
  if (action == "change" || action == "openAsTab" ||
      action == "keepSplit" || action == "close") {
    auto transition = transition_;
    return transition ? Result(transition.Run(action, request.generation)) : Rejected();
  }
  return Rejected();
}
}  // namespace blanc::glance::draft
