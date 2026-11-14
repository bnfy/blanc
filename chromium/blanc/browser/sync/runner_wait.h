// Copyright 2026 Bananify Creative. MIT; see LICENSE.
#ifndef BLANC_BROWSER_SYNC_RUNNER_WAIT_H_
#define BLANC_BROWSER_SYNC_RUNNER_WAIT_H_
#include <algorithm>
#include <cmath>
namespace blanc::sync_merge {
// Only a responsive runner reporting a real scheduler wait gets more time.
// The shipping request window is one minute; never trust an arbitrary date
// from the utility process or extend the caller's monotonic hard deadline.
inline double RunnerQueueWaitMs(int waiting, int running, double frees_at,
                                double now, double remaining) {
  const double delay = frees_at - now;
  if (waiting <= 0 || running != 0 || !std::isfinite(delay) ||
      !std::isfinite(remaining) || delay <= 0 || delay > 60000 || remaining <= 0)
    return 0;
  return std::min(delay + 5000, remaining);
}
}
#endif
