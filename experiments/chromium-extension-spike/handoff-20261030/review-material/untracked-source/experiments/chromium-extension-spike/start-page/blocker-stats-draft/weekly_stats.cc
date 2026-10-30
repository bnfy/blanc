#include "weekly_stats.h"

#include <algorithm>
#include <cmath>
#include <memory>
#include <string_view>

#include "third_party/icu/source/i18n/unicode/ucal.h"
#include "third_party/icu/source/common/unicode/uenum.h"

namespace blanc::blocker_stats {
namespace {
bool IsCount(double n) { return std::isfinite(n) && n >= 0 && std::trunc(n) == n; }
bool ValidDays(const std::vector<double>& days) {
  return days.size() == 7 && std::all_of(days.begin(), days.end(), IsCount);
}
using Calendar = std::unique_ptr<UCalendar, decltype(&ucal_close)>;
}  // namespace

std::optional<CalendarPosition> LocalCalendarPosition(
    double unix_ms, const std::optional<std::u16string>& timezone) {
  // ECMAScript Date rejects values outside its TimeClip bound.
  if (!std::isfinite(unix_ms) || std::abs(unix_ms) > 8.64e15) return std::nullopt;
  UErrorCode status = U_ZERO_ERROR;
  if (timezone) {
    if (timezone->empty() || timezone->size() > 255) return std::nullopt;
    using ZoneList = std::unique_ptr<UEnumeration, decltype(&uenum_close)>;
    ZoneList zones(ucal_openTimeZones(&status), &uenum_close);
    if (U_FAILURE(status) || !zones) return std::nullopt;
    bool known = false;
    int32_t length = 0;
    while (const auto* name = uenum_unext(zones.get(), &length, &status)) {
      if (std::u16string_view(name, length) == *timezone) { known = true; break; }
    }
    if (U_FAILURE(status) || !known) return std::nullopt;
    UBool system = false;
    char16_t canonical[256];
    ucal_getCanonicalTimeZoneID(timezone->data(), static_cast<int32_t>(timezone->size()),
                                canonical, std::size(canonical), &system, &status);
    if (U_FAILURE(status) || !system) return std::nullopt;
    status = U_ZERO_ERROR;
  }
  Calendar calendar(ucal_open(timezone ? timezone->data() : nullptr,
                              timezone ? static_cast<int32_t>(timezone->size()) : 0,
                              "en_US_POSIX", UCAL_GREGORIAN, &status), &ucal_close);
  if (U_FAILURE(status) || !calendar) return std::nullopt;
  // ECMAScript uses a proleptic Gregorian calendar, without ICU's historical
  // Julian-to-Gregorian cutover.
  ucal_setGregorianChange(calendar.get(), -8.64e15, &status);
  if (U_FAILURE(status)) return std::nullopt;
  // JavaScript uses the earlier occurrence for repeated local wall time and
  // moves forward by the gap for skipped local wall time.
  ucal_setAttribute(calendar.get(), UCAL_REPEATED_WALL_TIME, UCAL_WALLTIME_FIRST);
  ucal_setAttribute(calendar.get(), UCAL_SKIPPED_WALL_TIME, UCAL_WALLTIME_LAST);
  ucal_setMillis(calendar.get(), std::trunc(unix_ms), &status);
  if (U_FAILURE(status)) return std::nullopt;
  const int weekday = ucal_get(calendar.get(), UCAL_DAY_OF_WEEK, &status);
  if (U_FAILURE(status) || weekday < UCAL_SUNDAY || weekday > UCAL_SATURDAY)
    return std::nullopt;
  const int index = (weekday + 5) % 7;
  ucal_set(calendar.get(), UCAL_HOUR_OF_DAY, 0);
  ucal_set(calendar.get(), UCAL_MINUTE, 0);
  ucal_set(calendar.get(), UCAL_SECOND, 0);
  ucal_set(calendar.get(), UCAL_MILLISECOND, 0);
  // Commit setHours before setDate, as the released JS code does.
  ucal_getMillis(calendar.get(), &status);
  if (U_FAILURE(status)) return std::nullopt;
  // Date.setDate() changes the local calendar field; adding elapsed calendar
  // days can count a jurisdiction's skipped date differently (Apia 2011).
  const int day_of_month = ucal_get(calendar.get(), UCAL_DATE, &status);
  ucal_set(calendar.get(), UCAL_DATE, day_of_month - index);
  const double week = ucal_getMillis(calendar.get(), &status);
  if (U_FAILURE(status) || !std::isfinite(week) || std::abs(week) > 8.64e15)
    return std::nullopt;
  return CalendarPosition{week, index};
}

void Normalize(State& state) {
  if (!ValidDays(state.days)) state.days.assign(7, 0);
  if (!state.blocked || !IsCount(*state.blocked)) state.blocked = 0;
}
bool Roll(State& state, double unix_ms,
          const std::optional<std::u16string>& timezone) {
  const auto position = LocalCalendarPosition(unix_ms, timezone);
  if (!position) return false;
  if (!state.week_start_ms || *state.week_start_ms != position->week_start_ms) {
    state.week_start_ms = position->week_start_ms;
    state.blocked = 0;
    state.days.assign(7, 0);
  }
  return true;
}
bool Record(State& state, double unix_ms,
            const std::optional<std::u16string>& timezone) {
  if (!state.blocked || !IsCount(*state.blocked) || !ValidDays(state.days)) return false;
  const auto position = LocalCalendarPosition(unix_ms, timezone);
  if (!position) return false;
  if (!state.week_start_ms || *state.week_start_ms != position->week_start_ms) {
    state.week_start_ms = position->week_start_ms;
    state.blocked = 0;
    state.days.assign(7, 0);
  }
  *state.blocked += 1;
  state.days[position->day_index] += 1;
  return true;
}
std::array<int, 7> BarHeights(const State& state) {
  std::array<int, 7> out{};
  if (!ValidDays(state.days)) return out;
  const auto largest = *std::max_element(state.days.begin(), state.days.end());
  if (largest == 0) return out;
  for (size_t i = 0; i < out.size(); ++i)
    out[i] = static_cast<int>(std::floor(state.days[i] / largest * 100 + 0.5));
  return out;
}
}  // namespace blanc::blocker_stats
