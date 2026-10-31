#include "browser_weekly_stats.h"
#include <cmath>
#include "chrome/browser/profiles/profile.h"
#include "components/prefs/pref_service.h"

namespace blanc::blocker_stats {
BrowserWeeklyStats::BrowserWeeklyStats(Profile* profile)
    : profile_(profile ? profile->GetWeakPtr() : base::WeakPtr<Profile>()) {}
BrowserWeeklyStats::~BrowserWeeklyStats() = default;
PrefService* BrowserWeeklyStats::Eligible(Profile* caller) const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Profile* bound = profile_.get();
  if (!bound || caller != bound || !bound->IsRegularProfile() || bound->IsOffTheRecord())
    return nullptr;
  return bound->GetPrefs();
}
void BrowserWeeklyStats::AttestFullWeek(base::PassKey<VerifiedBlockerEventSink>,
                                        Profile* source, double start) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  covered_week_.reset();
  if (Eligible(source) && std::isfinite(start)) covered_week_ = start;
}
void BrowserWeeklyStats::RevokeCoverage(base::PassKey<VerifiedBlockerEventSink>) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  covered_week_.reset();
}
std::optional<State> BrowserWeeklyStats::Project(
    Profile* requester, double now, const std::optional<std::u16string>& zone) const {
  PrefService* prefs = Eligible(requester);
  auto position = LocalCalendarPosition(now, zone);
  if (!prefs || !position || !covered_week_ || *covered_week_ != position->week_start_ms)
    return std::nullopt;
  return ReadWeeklyPref(*prefs, *covered_week_);
}
bool BrowserWeeklyStats::Record(base::PassKey<VerifiedBlockerEventSink>,
                                 Profile* source, double now,
                                 const std::optional<std::u16string>& zone) {
  auto state = Project(source, now, zone);
  PrefService* prefs = Eligible(source);
  if (!state || !prefs || *state->blocked >= 9007199254740991.0 ||
      !blocker_stats::Record(*state, now, zone)) return false;
  return WriteWeeklyPref(*prefs, *state);
}
}  // namespace blanc::blocker_stats
