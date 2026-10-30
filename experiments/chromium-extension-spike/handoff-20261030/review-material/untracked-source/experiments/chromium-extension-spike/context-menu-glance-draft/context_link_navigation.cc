#include "context_link_navigation.h"

#include <utility>

#include "content/public/browser/web_contents.h"
#include "ui/base/window_open_disposition.h"

namespace blanc::glance::draft {
ContextLinkOpenResult OpenContextLinkForGlance(
    const ContextLinkOrigin& origin, const content::OpenURLParams& params,
    base::OnceCallback<void(content::NavigationHandle&)> navigation_callback,
    base::OnceCallback<void(ContextLinkOrigin,
                            base::WeakPtr<content::WebContents>)> present) {
  if (!present || !params.url.is_valid() || !params.started_from_context_menu ||
      params.disposition != WindowOpenDisposition::kNewBackgroundTab)
    return ContextLinkOpenResult::kInvalidParams;
  auto* opener = origin.opener();
  if (!opener)
    return ContextLinkOpenResult::kOriginChanged;

  // Use the native path unchanged so Chromium retains navigation attribution,
  // renderer initiator, referrer, security and browser policy behavior.
  auto* reference = opener->OpenURL(params, std::move(navigation_callback));
  if (!reference)
    return ContextLinkOpenResult::kNoTab;
  auto weak_reference = reference->GetWeakPtr();
  if (!origin.IsCurrent())
    return ContextLinkOpenResult::kOriginChanged;
  if (!weak_reference || !origin.AcceptsReference(weak_reference.get()))
    return ContextLinkOpenResult::kUnexpectedTarget;
  std::move(present).Run(origin, std::move(weak_reference));
  return ContextLinkOpenResult::kOpenedForPresentation;
}
}  // namespace blanc::glance::draft
