#include "selected_custom.h"
#include "custom_template.h"
namespace blanc::custom_search {
std::optional<std::string> ResolveSelectedCustom(
    const SelectedProvider& before, const SelectedProvider& after,
    const std::string& query) {
  const bool user = before.source == DefaultSearchManager::FROM_USER;
  const bool mandatory = before.source == DefaultSearchManager::FROM_POLICY;
  const bool recommended = before.source == DefaultSearchManager::FROM_POLICY_RECOMMENDED;
  // Source is Chromium's effective selection, not a renderer assertion. A
  // recommended policy stops being effective once overridden by a user.
  // Reject internally inconsistent state rather than guessing precedence.
  if (before != after || !(user || mandatory || recommended) ||
      before.is_managed != mandatory ||
      (before.type != TemplateURL::NORMAL && before.type != TemplateURL::LOCAL) ||
      (user && (before.prepopulate_id != 0 || before.starter_pack_id != 0)) ||
      before.is_extension_controlled || before.has_extension_info ||
      !before.post_params.empty()) return std::nullopt;
  constexpr char marker[] = "{searchTerms}";
  auto pos = before.pattern.find(marker);
  if (pos == std::string::npos || before.pattern.find(marker, pos + sizeof(marker)-1) != std::string::npos)
    return std::nullopt;
  std::string literal = before.pattern;
  literal.replace(pos, sizeof(marker)-1, "%s");
  // Do not expand Chromium replacement variables or add attribution. This
  // also rejects literal raw braces, a documented representability gap.
  if (literal.find_first_of("{}") != std::string::npos) return std::nullopt;
  auto candidate = Validate(literal);
  return candidate ? Resolve(*candidate, query) : std::nullopt;
}
}  // namespace blanc::custom_search
