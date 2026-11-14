// Copyright 2026 Bananify Creative. MIT; see the Blanc repository LICENSE.
#ifndef BLANC_BROWSER_UI_BROWSER_API_SUGGESTION_POLICY_H_
#define BLANC_BROWSER_UI_BROWSER_API_SUGGESTION_POLICY_H_

#include <optional>
#include <string>
#include <string_view>

namespace blanc::browser_api {

// Shipping v1.45.1's search suggestion rules (src/main/search-suggestions.js
// and parseBang in src/renderer/pages/bangs.js), in plain C++ so
// tools/suggestion-policy.test.mjs can compile it and compare it with
// shipping's own code. Text is UTF-8; invalid UTF-8 is never eligible.

// Whether typed text may be sent to the selected engine's suggestion service:
// not an address, path or credential-shaped value.
bool IsSuggestionEligible(std::string_view query);

// The suggestion request for a stock engine ("duckduckgo", "google", "bing",
// "brave", "kagi"), or nothing for a custom engine or ineligible length.
std::optional<std::string> SuggestionRequestUrl(std::string_view engine, std::string_view query,
                                                std::string_view locale);

// Whether the text carries a bang token (`!code`) as its first or last word.
// Suggestions refuse such text: the words beside a bang are meant for one site.
bool HasBangToken(std::string_view text);

// One provider suggestion as shipping shows it: whitespace collapsed and
// trimmed, or nothing when empty or longer than shipping's limit.
std::optional<std::string> CleanSuggestion(std::string_view value);

inline constexpr size_t kMaxSuggestions = 8;
inline constexpr size_t kMaxSuggestionResponseBytes = 64 * 1024;

}  // namespace blanc::browser_api

#endif  // BLANC_BROWSER_UI_BROWSER_API_SUGGESTION_POLICY_H_
