#ifndef BLANC_CONTEXT_LINK_POLICY_H_
#define BLANC_CONTEXT_LINK_POLICY_H_
#include <string_view>

namespace blanc::glance::draft {
// Page-initiated links require consent for all external applications. This
// classifies only; callers must enforce DLP and use a real consent flow.
enum class ContextLinkPolicy { kBrowser, kExternalConsent, kDenied, kInvalid };
ContextLinkPolicy ClassifyContextLink(std::string_view raw_url);
}  // namespace blanc::glance::draft
#endif  // BLANC_CONTEXT_LINK_POLICY_H_
