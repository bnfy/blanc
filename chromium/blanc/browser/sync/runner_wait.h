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
// A serialized call that timed out holds the lane until its late reply. A
// call that never answers must not hold it for the life of the process, so
// the service probes the runner while the lane is held. Nothing waiting,
// nothing on the wire and no retry pending: an unknown count is never idle.
inline bool RunnerQueueIdle(int waiting, int running, bool backoff) {
  return waiting == 0 && running == 0 && !backoff;
}
// Only for a runner that answered the probe. One idle answer can be the gap
// between two requests of one pass; two in a row, ten seconds apart, leave
// nothing of the abandoned call in flight. A busy runner keeps the lane until
// no call can still be running: the longest one is allowed four minutes.
inline bool ReleaseTimedOutLane(int idle_probes, double held_ms) {
  if (!std::isfinite(held_ms) || held_ms < 0) return false;
  return idle_probes >= 2 || held_ms >= 300000;
}
}
#endif
