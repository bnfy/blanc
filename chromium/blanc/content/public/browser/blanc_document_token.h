// Blanc prototype extension point; source version pinned by prepare.mjs.
#ifndef CONTENT_PUBLIC_BROWSER_BLANC_DOCUMENT_TOKEN_H_
#define CONTENT_PUBLIC_BROWSER_BLANC_DOCUMENT_TOKEN_H_
#include <optional>
#include <string>
#include "content/common/content_export.h"
namespace content {
class RenderFrameHost;
// Only live active committed documents qualify. Never exposes a speculative token.
CONTENT_EXPORT std::optional<std::string> BlancDocumentToken(RenderFrameHost* frame);
}
#endif
