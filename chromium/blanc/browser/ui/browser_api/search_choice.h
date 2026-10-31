// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
// Standard library only: tools/search-settings.test.mjs compiles this file.
#ifndef BLANC_BROWSER_UI_BROWSER_API_SEARCH_CHOICE_H_
#define BLANC_BROWSER_UI_BROWSER_API_SEARCH_CHOICE_H_

#include <array>
#include <optional>
#include <string>
#include <string_view>

namespace blanc::browser_api {

// Shipping v1.45.1's five stock engines (src/main/settings.js SEARCH_ENGINES)
// and the Chromium prepopulated engines that serve them, as in
// modules/selected_shipping.cc.
struct StockEngine {
  std::string_view name;
  int prepopulate_id;
};
inline constexpr std::array<StockEngine, 5> kStockEngines = {{
    {"duckduckgo", 92}, {"google", 1}, {"bing", 3}, {"brave", 109}, {"kagi", 115}}};

// The keyword of the one Chromium search engine entry that holds Blanc's
// custom search address.
inline constexpr char16_t kCustomKeyword[] = u"blanc-custom";

inline std::optional<int> StockPrepopulateId(std::string_view name) {
  for (const auto& engine : kStockEngines)
    if (engine.name == name) return engine.prepopulate_id;
  return std::nullopt;
}
inline std::optional<std::string_view> StockName(int prepopulate_id) {
  for (const auto& engine : kStockEngines)
    if (engine.prepopulate_id == prepopulate_id) return engine.name;
  return std::nullopt;
}

// A shipping custom address (one %s) as a Chromium search URL, and back.
// Braces can't be stored: Chromium reads them as replacement variables, and
// the search resolver refuses them (modules/selected_custom.cc).
inline std::optional<std::string> ToChromiumPattern(std::string literal) {
  const size_t at = literal.find("%s");
  if (at == std::string::npos || literal.find("%s", at + 2) != std::string::npos ||
      literal.find_first_of("{}") != std::string::npos) return std::nullopt;
  literal.replace(at, 2, "{searchTerms}");
  return literal;
}
inline std::optional<std::string> FromChromiumPattern(std::string pattern) {
  constexpr std::string_view marker = "{searchTerms}";
  const size_t at = pattern.find(marker);
  if (at == std::string::npos) return std::nullopt;
  pattern.replace(at, marker.size(), "%s");
  if (pattern.find_first_of("{}") != std::string::npos) return std::nullopt;
  return pattern;
}

}  // namespace blanc::browser_api

#endif  // BLANC_BROWSER_UI_BROWSER_API_SEARCH_CHOICE_H_
