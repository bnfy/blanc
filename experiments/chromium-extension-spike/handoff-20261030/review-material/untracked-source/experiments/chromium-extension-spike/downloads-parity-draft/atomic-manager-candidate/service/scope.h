#ifndef BLANC_DOWNLOADS_PROJECTION_SCOPE_H_
#define BLANC_DOWNLOADS_PROJECTION_SCOPE_H_
#include <string_view>
// Synthetic decision logic, not an authorization boundary. Inputs must be
// computed by a browser-owned service on its sequence, never by a renderer.
namespace blanc::downloads_projection {
enum class Scope { kRegular, kPrimaryPrivate };
struct ScopeEvidence {
  bool regular_owner;
  bool current_epoch_nonempty;
  bool epoch_matches;
  bool current_context_exists;
  bool context_is_expected_kind;
  bool manager_matches_context;
  bool manager_initialized;
  bool regular_history_ready;
};
enum class ScopeDecision { kReady, kDenied, kPending };
inline ScopeDecision CheckScope(Scope scope, const ScopeEvidence& e) {
  if ((scope != Scope::kRegular && scope != Scope::kPrimaryPrivate) ||
      !e.regular_owner || !e.current_epoch_nonempty || !e.epoch_matches ||
      !e.current_context_exists || !e.context_is_expected_kind ||
      !e.manager_matches_context) return ScopeDecision::kDenied;
  if (!e.manager_initialized || (scope == Scope::kRegular && !e.regular_history_ready))
    return ScopeDecision::kPending;
  return ScopeDecision::kReady;
}
inline bool ValidDisplayName(std::u16string_view name) {
  if (name.empty() || name == u"." || name == u"..") return false;
  if (name.size() >= 2 && name[1] == u':' &&
      ((name[0] >= u'A' && name[0] <= u'Z') ||
       (name[0] >= u'a' && name[0] <= u'z'))) return false;
  for (char16_t c : name) {
    if (c < 0x20 || c == 0x7f || c == u'/' || c == u'\\') return false;
  }
  return true;
}
}
#endif
