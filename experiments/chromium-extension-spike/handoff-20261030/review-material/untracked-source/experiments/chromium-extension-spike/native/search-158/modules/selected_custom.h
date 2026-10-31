#ifndef BLANC_SELECTED_CUSTOM_DRAFT_H_
#define BLANC_SELECTED_CUSTOM_DRAFT_H_
#include <cstdint>
#include <optional>
#include <string>
#include "components/search_engines/default_search_manager.h"
#include "components/search_engines/template_url.h"
class Profile;
namespace blanc::custom_search {
// This is an internal browser-owned snapshot, never renderer-supplied. It may
// contain sensitive template parameters and must not be logged or persisted.
struct SelectedProvider {
  DefaultSearchManager::Source source;
  TemplateURL::Type type;
  int prepopulate_id;
  int starter_pack_id;
  bool is_managed;
  bool is_extension_controlled;
  bool has_extension_info;
  int64_t id;
  std::string guid;
  std::string pattern;
  std::string post_params;
  bool operator==(const SelectedProvider&) const = default;
};
// No stock-provider fallback or automatic Chromium substitutions; caller must
// display a useful failure if null. Both snapshots must originate from trusted
// browser state on the UI sequence, never from a renderer.
std::optional<std::string> ResolveSelectedCustom(
    const SelectedProvider& before, const SelectedProvider& after,
    const std::string& query);
enum class ResolutionStatus { kReady, kRetryWhenLoaded, kUnavailable, kSelectionChanged };
struct Resolution {
  ResolutionStatus status;
  std::optional<std::string> url;
  // Native provider identity is returned only for a ready result and is not
  // an authorship proof. Never emit the template or query in diagnostics.
  std::string provider_guid;
};
// Chromium Load() is idempotent. Do not assume it completes synchronously and
// do not retain a user query for automatic replay while it is loading.
template <typename Service>
ResolutionStatus EnsureServiceLoaded(Service* service) {
  if (!service) return ResolutionStatus::kUnavailable;
  if (service->loaded()) return ResolutionStatus::kReady;
  service->Load();
  return ResolutionStatus::kRetryWhenLoaded;
}
// Draft only: read actual current service twice within a single UI task. The
// caller must separately bind a trusted user navigation intent to the active
// tab and document and navigate in the original profile/OTR WebContents.
Resolution ResolveCurrentSelectedCustom(Profile* context,
                                                        const std::string& query);
}  // namespace blanc::custom_search
#endif
