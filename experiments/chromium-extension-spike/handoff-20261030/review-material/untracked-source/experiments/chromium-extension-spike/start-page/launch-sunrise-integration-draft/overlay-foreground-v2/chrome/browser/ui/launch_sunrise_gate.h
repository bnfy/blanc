#ifndef BLANC_LAUNCH_SUNRISE_GATE_H_
#define BLANC_LAUNCH_SUNRISE_GATE_H_

#include <cstdint>
#include <optional>

// Isolated model of the shipping process-wide grant. The caller must provide
// browser-owned WebContents lifetime, visibility, privacy and persisted setting.
// Use only from one browser sequence; this does not itself bind to a WebUI.
class LaunchSunriseGate {
 public:
  explicit LaunchSunriseGate(std::optional<int64_t> process_start_ms)
      : start_ms_(process_start_ms) {}

  bool Take(int64_t now_ms, bool enabled, bool is_private, bool visible) {
    if (spent_ || !start_ms_) return false;
    // The released JS admits clock movement backward. Avoid signed overflow.
    if (now_ms > *start_ms_ &&
        static_cast<uint64_t>(now_ms) - static_cast<uint64_t>(*start_ms_) >
            30000u) {
      spent_ = true;
      return false;
    }
    if (!enabled || is_private || !visible) return false;
    spent_ = true;
    return true;
  }

 private:
  std::optional<int64_t> start_ms_;
  bool spent_ = false;
};

// One instance per WebContents lifetime, matching the released wc.id guard.
// A denial consumes its opportunity but not the process-wide grant. The
// browser must additionally validate that the calling document is trusted.
class LaunchSunriseContentsAttempt {
 public:
  bool Take(LaunchSunriseGate& gate, int64_t now_ms, bool enabled,
            bool is_private, bool visible) {
    if (asked_) return false;
    asked_ = true;
    return gate.Take(now_ms, enabled, is_private, visible);
  }

 private:
  bool asked_ = false;
};

#endif
