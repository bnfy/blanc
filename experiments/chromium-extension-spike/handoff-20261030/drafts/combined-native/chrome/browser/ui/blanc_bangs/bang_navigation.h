#ifndef BLANC_BANGS_DRAFT_NAVIGATION_H_
#define BLANC_BANGS_DRAFT_NAVIGATION_H_
#include "bang_catalog.h"
#include "bang_prefs.h"
#include "url/gurl.h"
#include <optional>
#include <string>
#include <string_view>
namespace blanc::bangs::draft {
enum class NavigationStatus { kSearch, kBang, kUnavailable, kInvalid };
struct NavigationResult {
  NavigationStatus status;
  bool suppress_suggestions;
  std::optional<GURL> url;
  std::string recent_code;
};
// The owner supplies a validated catalog and settings for the actual tab.
// Missing settings or catalog must never disclose a bang-shaped query to a
// search provider; navigation and recent writes remain the owner's authority.
NavigationResult ResolveNavigation(std::u16string_view text,
                                   const BangPrefSnapshot* prefs,
                                   const BangCatalog* catalog);
}  // namespace blanc::bangs::draft
#endif
