#ifndef CONTENT_PUBLIC_BROWSER_BLANC_DOWNLOAD_LIFECYCLE_H_
#define CONTENT_PUBLIC_BROWSER_BLANC_DOWNLOAD_LIFECYCLE_H_
#include <optional>
#include "base/unguessable_token.h"
#include "content/common/content_export.h"
namespace content {
class BrowserContext;
// Browser-owned lifetime evidence, never a renderer identifier or permission.
struct BlancDownloadLifetime {
  base::UnguessableToken context;
  base::UnguessableToken manager_generation;
  bool operator==(const BlancDownloadLifetime&) const = default;
};
// UI sequence only. Callers must establish a live BrowserContext and trusted
// document/family. Returns no value for absent, untracked or shut-down manager;
// never creates a manager or private context. Conditional on the existing
// supported UI-sequence shutdown contract; not safe for off-sequence shutdown.
CONTENT_EXPORT std::optional<BlancDownloadLifetime>
GetBlancDownloadLifetime(BrowserContext* context);
CONTENT_EXPORT bool IsBlancDownloadLifetimeCurrent(
    BrowserContext* context, const BlancDownloadLifetime& expected);
}  // namespace content
#endif
