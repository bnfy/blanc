#include "bang_navigation.h"
#include "base/strings/utf_string_conversions.h"
namespace blanc::bangs::draft {
NavigationResult ResolveNavigation(std::u16string_view text,
                                   const BangPrefSnapshot* prefs,
                                   const BangCatalog* catalog) {
  const bool shaped = ParseBang(text).has_value();
  if (!shaped) return {NavigationStatus::kSearch, false, std::nullopt, {}};
  if (!prefs) return {NavigationStatus::kUnavailable, true, std::nullopt, {}};
  if (!prefs->enabled) return {NavigationStatus::kSearch, true, std::nullopt, {}};
  if (!catalog) return {NavigationStatus::kUnavailable, true, std::nullopt, {}};
  const auto result = ResolveBang(text, true, prefs->custom, catalog->entries);
  if (result.status == ResolveStatus::kUnknown)
    return {NavigationStatus::kSearch, true, std::nullopt, {}};
  if (result.status != ResolveStatus::kResolved)
    return {NavigationStatus::kInvalid, true, std::nullopt, {}};
  std::string utf8;
  if (!base::UTF16ToUTF8(result.url.data(), result.url.size(), &utf8))
    return {NavigationStatus::kInvalid, true, std::nullopt, {}};
  GURL url(utf8);
  if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS())
    return {NavigationStatus::kInvalid, true, std::nullopt, {}};
  return {NavigationStatus::kBang, true, std::move(url), result.code};
}
}  // namespace blanc::bangs::draft
