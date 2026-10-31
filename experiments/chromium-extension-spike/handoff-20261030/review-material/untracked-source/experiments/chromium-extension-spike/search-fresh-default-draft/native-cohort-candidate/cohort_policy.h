#ifndef BLANC_COHORT_POLICY_H_
#define BLANC_COHORT_POLICY_H_
namespace blanc_cohort {
inline constexpr char kPrefName[] = "blanc.search_default_cohort";
struct Facts {
  bool eligible_marker;
  bool overrides_absent;
  bool native_choice_region;
  bool os_country_valid;
  bool os_choice_region;
};
constexpr bool Eligible(const Facts& f) {
  return f.eligible_marker && f.overrides_absent && !f.native_choice_region &&
         f.os_country_valid && !f.os_choice_region;
}
constexpr bool RejectEditedCollision(bool fallback, int engine_id,
                                     bool introduced, bool exists, bool safe) {
  return fallback && engine_id == 92 && introduced && (!exists || !safe);
}
constexpr bool AcceptCanonicalDdg(int count, bool exact_url_and_no_post) {
  return count == 1 && exact_url_and_no_post;
}
}
#endif
