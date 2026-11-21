#ifndef BLANC_QUIET_SCHEDULE_H_
#define BLANC_QUIET_SCHEDULE_H_
#include <cstdint>
#include <optional>
#include <string_view>
namespace blanc::quiet {
constexpr bool ValidDelay(std::string_view value) {
  return value == "off" || value == "30m" || value == "1h" || value == "6h";
}
constexpr std::optional<int64_t> DelayMilliseconds(std::string_view value) {
  if (value == "off") return std::nullopt;
  if (value == "30m") return 30 * 60 * 1000;
  if (value == "6h") return 6 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}
constexpr bool SweepClockJump(int64_t last, int64_t now) {
  return last != 0 && (now < last || now - last > 60000);
}
constexpr bool IdleDue(int64_t age, std::optional<int64_t> delay) {
  return delay && age >= *delay;
}
}  // namespace blanc::quiet
#endif
