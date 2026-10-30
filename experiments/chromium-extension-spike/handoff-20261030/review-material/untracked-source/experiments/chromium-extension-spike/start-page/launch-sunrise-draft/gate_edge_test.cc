#include "launch_sunrise_gate.h"

#include <cassert>
#include <cstdint>
#include <limits>

int main() {
  LaunchSunriseGate invalid(std::nullopt);
  LaunchSunriseContentsAttempt missing_start;
  assert(!missing_start.Take(invalid, 0, true, false, true));
  LaunchSunriseGate extremes(std::numeric_limits<int64_t>::min());
  LaunchSunriseContentsAttempt expired;
  assert(!expired.Take(extremes, std::numeric_limits<int64_t>::max(), true, false, true));
  LaunchSunriseContentsAttempt later;
  assert(!later.Take(extremes, std::numeric_limits<int64_t>::min(), true, false, true));
  LaunchSunriseGate backward(std::numeric_limits<int64_t>::max());
  LaunchSunriseContentsAttempt moved_back;
  assert(moved_back.Take(backward, std::numeric_limits<int64_t>::min(), true, false, true));
}
