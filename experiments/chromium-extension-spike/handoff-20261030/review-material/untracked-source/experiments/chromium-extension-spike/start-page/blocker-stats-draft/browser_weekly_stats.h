#ifndef BLANC_BROWSER_WEEKLY_STATS_DRAFT_H_
#define BLANC_BROWSER_WEEKLY_STATS_DRAFT_H_

#include <optional>
#include <string>
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/types/pass_key.h"
#include "weekly_stats.h"

class Profile;
class PrefService;
namespace blanc::blocker_stats {
class VerifiedBlockerEventSink;
inline constexpr char kWeeklyPref[] = "blanc.prototype.weekly_blocker_stats_v1";

// Draft only: no registration, caller binding, or event wiring is supplied.
// A real event sink must prove attribution, deduplication and full-week
// coverage before it can attest a week. Do not expose these methods to WebUI.
class BrowserWeeklyStats {
 public:
  explicit BrowserWeeklyStats(Profile* profile);
  ~BrowserWeeklyStats();
  void AttestFullWeek(base::PassKey<VerifiedBlockerEventSink>, Profile* source,
                      double week_start_ms);
  void RevokeCoverage(base::PassKey<VerifiedBlockerEventSink>);
  bool Record(base::PassKey<VerifiedBlockerEventSink>, Profile* source,
              double now, const std::optional<std::u16string>& zone = std::nullopt);
  std::optional<State> Project(Profile* requester, double now,
              const std::optional<std::u16string>& zone = std::nullopt) const;
 private:
  PrefService* Eligible(Profile* caller) const;
  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtr<Profile> profile_;
  std::optional<double> covered_week_;
};

// Internal codec: actual access is gated by BrowserWeeklyStats. Exposed for
// standalone tests, not a renderer or extension API. SetDict stages a write;
// it does not establish disk durability.
std::optional<State> ReadWeeklyPref(PrefService& prefs, double week_start);
bool WriteWeeklyPref(PrefService& prefs, const State& state);
}  // namespace blanc::blocker_stats
#endif
