#include "selected_shipping.h"
#include "custom_template.h"
#include <string_view>

namespace blanc::custom_search {
namespace {
struct Stock {
  int id;
  std::string_view chromepattern;
  std::string_view shippingpattern;
};
// Full patterns and IDs both matter: a user or policy can alter a provider
// without changing its name or prepopulation ID. The Google stock template
// includes Chrome-specific substitutions; do not expand those parameters.
constexpr Stock kStock[] = {
  {1, "{google:baseURL}search?q={searchTerms}&{google:RLZ}"
      "{google:originalQueryForSuggestion}{google:assistedQueryStats}"
      "{google:searchFieldtrialParameter}{google:language}"
      "{google:prefetchSource}{google:searchClient}{google:sourceId}"
      "{google:searchSource}{google:contextualSearchVersion}ie={inputEncoding}",
      "https://www.google.com/search?q=%s"},
  {3, "https://www.bing.com/search?q={searchTerms}", "https://www.bing.com/search?q=%s"},
  {92, "https://duckduckgo.com/?q={searchTerms}", "https://duckduckgo.com/?q=%s"},
  {109, "https://search.brave.com/search?q={searchTerms}", "https://search.brave.com/search?q=%s"},
  {115, "https://kagi.com/search?q={searchTerms}", "https://kagi.com/search?q=%s"},
};
}  // namespace

ShippingResolution ResolveSelectedShipping(const SelectedProvider& before,
                                           const SelectedProvider& after,
                                           const std::string& query) {
  if (before != after) return {ShippingStatus::kChanged, std::nullopt};
  if (before.guid.empty()) return {ShippingStatus::kUnavailable, std::nullopt};
  // Honor the effective Chromium fallback when it is an exact known stock
  // provider. Initializing a genuinely new Blanc profile to DuckDuckGo is a
  // separate task: FROM_FALLBACK also covers regional/configured overrides.
  if ((before.source == DefaultSearchManager::FROM_USER ||
       before.source == DefaultSearchManager::FROM_FALLBACK) && !before.is_managed &&
      !before.is_extension_controlled && !before.has_extension_info &&
      before.type == TemplateURL::NORMAL && before.starter_pack_id == 0 &&
      before.post_params.empty()) {
    for (const Stock& stock : kStock) {
      if (before.prepopulate_id == stock.id && before.pattern == stock.chromepattern) {
        auto value = Validate(std::string(stock.shippingpattern));
        auto url = value ? Resolve(*value, query) : std::nullopt;
        std::string guid = url ? before.guid : std::string();
        return {url ? ShippingStatus::kReady : ShippingStatus::kUnavailable,
                std::move(url), std::move(guid)};
      }
    }
  }
  // User-authored representable entries and effective policy retain their
  // literal parameters. Unsupported extension/policy patterns fail closed.
  auto custom = ResolveSelectedCustom(before, after, query);
  std::string guid = custom ? before.guid : std::string();
  return {custom ? ShippingStatus::kReady : ShippingStatus::kUnavailable,
          std::move(custom), std::move(guid)};
}
}  // namespace blanc::custom_search
