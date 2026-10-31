#ifndef BLANC_CONTEXT_LINK_NAVIGATION_H_
#define BLANC_CONTEXT_LINK_NAVIGATION_H_

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "context_link_origin.h"
#include "content/public/browser/page_navigator.h"

namespace content { class WebContents; }
namespace blanc::glance::draft {

enum class ContextLinkOpenResult {
  kOpenedForPresentation,
  kInvalidParams,
  kOriginChanged,
  kNoTab,
  kUnexpectedTarget,
};

// The menu caller must first enforce its normal navigation/DLP policy, the
// shipping forbidden-URL rules, and external-protocol handoff. `params` must
// be built by Chromium's normal context-menu helper from the captured link and
// frame; it carries referrer, initiator and context-menu attribution.
// The presentation callback must revalidate `origin` and `reference` after
// any asynchronous storage or lifecycle transition. An existing old Glance
// must not be discarded until its replacement is ready.
ContextLinkOpenResult OpenContextLinkForGlance(
    const ContextLinkOrigin& origin, const content::OpenURLParams& params,
    base::OnceCallback<void(content::NavigationHandle&)> navigation_callback,
    base::OnceCallback<void(ContextLinkOrigin,
                            base::WeakPtr<content::WebContents>)> present);
}  // namespace blanc::glance::draft
#endif  // BLANC_CONTEXT_LINK_NAVIGATION_H_
