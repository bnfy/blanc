#ifndef BLANC_FRESH_DEFAULT_POLICY_H_
#define BLANC_FRESH_DEFAULT_POLICY_H_
namespace blanc::fresh_default {
enum class Decision { kPreserve, kAwaitIdentity, kAwaitModel, kSelectDuckDuckGo };
struct Facts {
  bool regular = false;
  bool genuinely_new_store = false;
  bool untouched_default_pref = false;
  bool no_provider_overrides = false;
  bool no_accounts = false;
  bool tokens_loaded = false;
  bool choice_known_outside_scope = false;
  bool service_loaded = false;
  bool effective_fallback = false;
  bool exact_unique_builtin_ddg = false;
  bool candidate_allowed = false;
};
struct CandidateMatches {
  int id_matches = 0;
  int exact_matches = 0;
  void Add(bool same_id, bool exact) {
    if (!same_id) return;
    ++id_matches;
    if (exact) ++exact_matches;
  }
  bool IsUnique() const { return id_matches == 1 && exact_matches == 1; }
};
// Conservative policy: unknown or unsupported evidence is a preserve, never a
// reason to infer a new profile, replace a choice, or bypass a choice screen.
inline Decision Decide(const Facts& f) {
  if (!(f.regular && f.genuinely_new_store && f.untouched_default_pref &&
        f.no_provider_overrides && f.choice_known_outside_scope)) return Decision::kPreserve;
  if (!f.tokens_loaded) return Decision::kAwaitIdentity;
  if (!f.no_accounts) return Decision::kPreserve;
  if (!f.service_loaded) return Decision::kAwaitModel;
  return f.effective_fallback && f.exact_unique_builtin_ddg && f.candidate_allowed
      ? Decision::kSelectDuckDuckGo : Decision::kPreserve;
}
}  // namespace blanc::fresh_default
#endif
