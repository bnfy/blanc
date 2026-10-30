#include "glance_card_state.h"

#include <cmath>
#include <string>
#include <utility>

#include "base/strings/utf_string_conversions.h"
#include "base/values.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "glance_card_authority.h"
#include "url/gurl.h"

namespace blanc::glance::draft {
namespace {
bool ValidRect(Rect r) {
  constexpr double limit = 1000000;
  return std::isfinite(r.x) && std::isfinite(r.y) &&
      std::isfinite(r.width) && std::isfinite(r.height) &&
      std::abs(r.x) <= limit && std::abs(r.y) <= limit &&
      r.width >= 0 && r.height >= 0 && r.width <= limit && r.height <= limit;
}
base::DictValue RectValue(Rect r) {
  base::DictValue value;
  value.Set("x", r.x);
  value.Set("y", r.y);
  value.Set("width", r.width);
  value.Set("height", r.height);
  return value;
}
}  // namespace

bool PublishCardState(content::WebContents* card,
                      base::WeakPtr<GlanceCardAuthority> authority,
                      uint64_t generation, const CardGeometry& geometry,
                      bool focused) {
  constexpr uint64_t max_generation = 9007199254740991ULL;
  if (!card || !authority || !generation || generation > max_generation ||
      !ValidRect(geometry.frame) || !ValidRect(geometry.chrome)) return false;
  const double top = geometry.frame.y - geometry.chrome.y;
  if (top < 0 || top > 12 || geometry.frame.x - geometry.chrome.x != 20 ||
      geometry.chrome.width != geometry.frame.width + 40 ||
      geometry.chrome.height != geometry.frame.height + top + 28) return false;
  auto* reference = authority->ReferenceContents(card, generation);
  if (!reference || reference->IsBeingDestroyed()) return false;
  auto* frame = card->GetPrimaryMainFrame();
  auto* web_ui = card->GetWebUI();
  const GURL expected("chrome://blanc-prototype/glance/card.html");
  if (!frame || !web_ui || web_ui->GetRenderFrameHost() != frame ||
      !frame->IsRenderFrameLive() || !web_ui->CanCallJavascript() ||
      frame->GetLastCommittedURL() != expected || card->GetLastCommittedURL() != expected)
    return false;
  // Bound text before conversion; the card uses textContent for both values.
  const std::u16string title = reference->GetTitle().substr(0, 2048);
  const std::string url = reference->GetLastCommittedURL().spec();
  if (url.size() > 4096) return false;
  base::DictValue state;
  state.Set("generation", static_cast<double>(generation));
  state.Set("frame", RectValue(geometry.frame));
  state.Set("chrome", RectValue(geometry.chrome));
  state.Set("title", base::UTF16ToUTF8(title));
  state.Set("url", url);
  state.Set("private", Profile::FromBrowserContext(reference->GetBrowserContext())->IsOffTheRecord());
  state.Set("canGoBack", reference->GetController().CanGoBack());
  state.Set("isLoading", reference->IsLoading());
  state.Set("focused", focused);
  web_ui->CallJavascriptFunctionUnsafe("blancGlanceCardApplyState", base::Value(std::move(state)));
  return true;
}
}  // namespace blanc::glance::draft
