'use strict';

// The launch Sunrise (#1179): with Settings → Appearance → Play the Sunrise
// when Blanc opens on, the first Start Page shown soon after launch draws the
// website's Sunrise once over the finished page. Pure, so the rule is
// unit-tested without Electron. The Start Page itself skips it when the system
// asks for reduced motion.

// Long enough for a restored session to settle on a Start Page; short enough
// that a new tab opened later never plays a launch animation.
const LAUNCH_SUNRISE_WINDOW_MS = 30_000;

function createLaunchSunrise({ startedAt, windowMs = LAUNCH_SUNRISE_WINDOW_MS }) {
  let start = startedAt;
  let spent = false;
  return {
    /** Whether this Start Page plays it: true at most once per launch, and
     * only for a visible, non-private page inside the launch window. A page
     * that can't play it (private, or behind another tab) leaves it for the
     * next one; the window closing spends it. */
    take({ enabled, private: isPrivate, visible, now }) {
      if (spent || enabled !== true) return false;
      if (!(now - start <= windowMs)) {
        spent = true;
        return false;
      }
      if (isPrivate || !visible) return false;
      spent = true;
      return true;
    },
    /** Test hook only: start a fresh launch window at `now`. */
    rearm(now) {
      start = now;
      spent = false;
    },
  };
}

module.exports = { LAUNCH_SUNRISE_WINDOW_MS, createLaunchSunrise };
