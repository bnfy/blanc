#ifndef BLANC_RESTART_SAFE_SEARCH_COHORT_H_
#define BLANC_RESTART_SAFE_SEARCH_COHORT_H_
#include <string_view>
namespace blanc::fresh_default {
// Pure decision model only. Production must derive VERIFIED evidence from an
// authenticated installation-bound journal and actual profile identity;
// a marker or caller-provided boolean is not evidence by itself.
enum class Record { kAbsent, kPending, kCommitted, kRetired, kCorrupt };
enum class Origin { kUnverified, kCurrentExclusiveProof, kVerifiedRestart };
enum class Source { kUnknown, kFallback, kUser, kExtension, kPolicy, kRecommendedPolicy };
enum class Action { kPreserve, kWait, kPersistPending, kCommitCohort, kUseDuckDuckGoFallback, kRetirePending };
struct CohortSnapshot {
  Record record = Record::kAbsent;
  Origin origin = Origin::kUnverified;
  Source source = Source::kUnknown;
  bool regular = false;
  bool verified_record_binding = false;
  bool import_state_known = false;
  bool no_import_or_restore = false;
  bool identity_ready = false;
  bool no_account = false;
  bool model_ready = false;
  // Required before using a committed fallback after an account appears.
  // Meaningful only if backed by the real Sync reconciliation lifecycle.
  bool sync_reconciled = false;
  bool untouched_provider_prefs = false;
  bool no_override = false;
  bool choice_definitely_outside_scope = false;
};
inline Action DecideCohort(const CohortSnapshot& x) {
  if (!x.regular || x.record == Record::kRetired || x.record == Record::kCorrupt)
    return Action::kPreserve;
  if (x.record == Record::kAbsent) {
    // A missing record after restart is not a new profile.
    if (x.origin != Origin::kCurrentExclusiveProof) return Action::kPreserve;
    if (!x.import_state_known) return Action::kWait;
    return x.no_import_or_restore ? Action::kPersistPending : Action::kPreserve;
  }
  // On either the current start or a restart, an existing record must bind to
  // the current installation and exact directory; copied/unknown records fail.
  if (!x.verified_record_binding || x.origin == Origin::kUnverified)
    return Action::kPreserve;
  if (!x.import_state_known) return Action::kWait;
  if (!x.no_import_or_restore)
    return x.record == Record::kPending ? Action::kRetirePending : Action::kPreserve;
  if (!x.identity_ready || !x.model_ready || x.source == Source::kUnknown)
    return Action::kWait;
  if (x.source != Source::kFallback || !x.untouched_provider_prefs ||
      !x.no_override || !x.choice_definitely_outside_scope) {
    return x.record == Record::kPending ? Action::kRetirePending : Action::kPreserve;
  }
  if (x.record == Record::kPending)
    return x.no_account ? Action::kCommitCohort : Action::kRetirePending;
  if (!x.no_account && !x.sync_reconciled) return Action::kWait;
  return x.record == Record::kCommitted ? Action::kUseDuckDuckGoFallback : Action::kPreserve;
}
struct CandidateSet {
  int matching_id = 0;
  int exact = 0;
  void Add(int id, std::string_view url, bool normal, bool extension, bool post) {
    if (id != 92) return;
    ++matching_id;
    if (normal && !extension && !post && url == "https://duckduckgo.com/?q={searchTerms}") ++exact;
  }
  bool SafeUnique() const { return matching_id == 1 && exact == 1; }
};
}
#endif
