#include "browser_weekly_stats.h"
#include <cmath>
#include "base/values.h"
#include "components/prefs/pref_service.h"

namespace blanc::blocker_stats {
namespace {
bool SafeCount(double n) {
  return std::isfinite(n) && n >= 0 && n <= 9007199254740991.0 && std::floor(n) == n;
}
bool Ready(PrefService& prefs) {
  const auto status = prefs.GetInitializationStatus();
  return (status == PrefService::INITIALIZATION_STATUS_SUCCESS ||
          status == PrefService::INITIALIZATION_STATUS_CREATED_NEW_PREF_STORE) &&
         prefs.FindPreference(kWeeklyPref) && prefs.IsUserModifiablePreference(kWeeklyPref);
}
bool Valid(const State& state) {
  if (!state.week_start_ms || !std::isfinite(*state.week_start_ms) ||
      !state.blocked || !SafeCount(*state.blocked) || state.days.size() != 7)
    return false;
  double sum = 0;
  for (double n : state.days) { if (!SafeCount(n)) return false; sum += n; }
  return SafeCount(sum) && sum == *state.blocked;
}
}
std::optional<State> ReadWeeklyPref(PrefService& prefs, double week_start) {
  if (!Ready(prefs) || !std::isfinite(week_start)) return std::nullopt;
  const auto& dict = prefs.GetDict(kWeeklyPref);
  if (dict.empty()) {
    if (prefs.HasPrefPath(kWeeklyPref)) return std::nullopt;
    return State{week_start, 0.0, std::vector<double>(7, 0.0)};
  }
  if (dict.FindInt("version") != 1) return std::nullopt;
  auto start = dict.FindDouble("week_start_ms");
  auto total = dict.FindDouble("blocked");
  const auto* days = dict.FindList("days");
  if (!start || !total || !days || days->size() != 7) return std::nullopt;
  State result{start, total, {}};
  for (const auto& day : *days) {
    auto n = day.GetIfDouble();
    if (!n) return std::nullopt;
    result.days.push_back(*n);
  }
  if (!Valid(result) || *start > week_start) return std::nullopt;
  if (*start < week_start) return State{week_start, 0.0, std::vector<double>(7, 0.0)};
  return result;
}
bool WriteWeeklyPref(PrefService& prefs, const State& state) {
  if (!Ready(prefs) || !Valid(state)) return false;
  base::ListValue days;
  for (double n : state.days) days.Append(n);
  base::DictValue dict;
  dict.Set("version", 1);
  dict.Set("week_start_ms", *state.week_start_ms);
  dict.Set("blocked", *state.blocked);
  dict.Set("days", std::move(days));
  prefs.SetDict(kWeeklyPref, std::move(dict));
  return true;
}
}  // namespace blanc::blocker_stats
