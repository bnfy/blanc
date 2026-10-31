#include "../blanc_quiet_schedule.h"
#include <cassert>
using namespace blanc::quiet;
int main() {
  assert(!DelayMilliseconds("off"));
  assert(DelayMilliseconds("30m") == 1800000);
  assert(DelayMilliseconds("1h") == 3600000);
  assert(DelayMilliseconds("6h") == 21600000);
  assert(DelayMilliseconds("invalid") == 3600000);
  assert(!ValidDelay("invalid"));
  assert(!IdleDue(999999999, DelayMilliseconds("off")));
  assert(!IdleDue(1799999, DelayMilliseconds("30m")));
  assert(IdleDue(1800000, DelayMilliseconds("30m")));
  assert(!SweepClockJump(0, 1000000));
  assert(!SweepClockJump(100, 60100));
  assert(SweepClockJump(100, 60101));
  assert(SweepClockJump(100, 99));
}
