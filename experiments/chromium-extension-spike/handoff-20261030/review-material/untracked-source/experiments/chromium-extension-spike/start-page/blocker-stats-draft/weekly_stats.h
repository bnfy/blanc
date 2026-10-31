#ifndef BLANC_BLOCKER_WEEKLY_STATS_H_
#define BLANC_BLOCKER_WEEKLY_STATS_H_

#include <array>
#include <optional>
#include <string>
#include <vector>

namespace blanc::blocker_stats {
// Pure, unwired reducer. The caller owns all persistence, event provenance,
// profile/privacy checks, and ordering. Doubles represent JavaScript Numbers.
struct State {
  std::optional<double> week_start_ms;
  std::optional<double> blocked;
  std::vector<double> days;
};
struct CalendarPosition {
  double week_start_ms;
  int day_index;  // Monday = 0.
};

// A null timezone uses ICU's process default. Explicit IANA zones are for
// tests; invalid names and out-of-range times are rejected without mutation.
std::optional<CalendarPosition> LocalCalendarPosition(
    double unix_ms, const std::optional<std::u16string>& timezone = std::nullopt);
void Normalize(State& state);
bool Roll(State& state, double unix_ms,
          const std::optional<std::u16string>& timezone = std::nullopt);
bool Record(State& state, double unix_ms,
            const std::optional<std::u16string>& timezone = std::nullopt);
std::array<int, 7> BarHeights(const State& state);
}  // namespace blanc::blocker_stats
#endif
