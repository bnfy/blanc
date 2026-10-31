#ifndef BLANC_CUSTOM_SEARCH_TEMPLATE_H_
#define BLANC_CUSTOM_SEARCH_TEMPLATE_H_

#include <optional>
#include <string>

namespace blanc::custom_search {
struct Template {
  std::string literal;
  std::string display_host;
};
// Unwired browser-side validator. Callers must separately establish the
// provenance and authorization of the supplied template.
std::optional<Template> Validate(const std::string& candidate);
std::optional<std::string> Resolve(const Template& validated,
                                   const std::string& utf8_query);
struct Settings { std::string engine; std::string custom_template; };
struct Patch { std::optional<std::string> engine; std::optional<std::string> custom_template; };
// Pure atomic merge, no persistence, sync, renderer or policy access.
std::optional<Settings> Apply(const Settings& previous, const Patch& patch);
}  // namespace blanc::custom_search
#endif
