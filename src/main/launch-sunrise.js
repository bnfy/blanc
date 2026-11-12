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
     * next one; the window closing spends it. `describe()` reports the page
     * ({ enabled, private, visible }) and runs only while the Sunrise is still
     * to play, so later Start Pages cost nothing. */
    take(now, describe) {
      if (spent) return false;
      if (!(now - start <= windowMs)) {
        spent = true;
        return false;
      }
      const { enabled, private: isPrivate, visible } = describe();
      if (enabled !== true || isPrivate || !visible) return false;
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
