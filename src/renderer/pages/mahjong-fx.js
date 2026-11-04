// Pure geometry and timing for Mahjong's match trail and board-cleared
// celebration. No DOM access; mahjong.js measures and places elements. The
// helpers are exported for Node unit tests.
(() => {
  'use strict';

  const TRAIL_MS = 320;
  const AUTO_TRAIL_DELAY_MS = 180;
  const CELEBRATION_MS = Object.freeze({ none: 0, still: 0, quiet: 700, standard: 1200, grand: 1500 });

  const centre = (rect) => [rect.left + rect.width / 2, rect.top + rect.height / 2];

  // Rects are { left, top, width, height } in viewport pixels; the result is
  // relative to `origin`, the element the trail is appended to.
  function trailGeometry(from, to, origin) {
    const [fx, fy] = centre(from);
    const [tx, ty] = centre(to);
    const dx = tx - fx;
    const dy = ty - fy;
    const thickness = Math.min(8, Math.max(3, Math.min(from.width, to.width) * 0.12));
    return {
      x: fx - origin.left,
      y: fy - origin.top,
      length: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx) * 180 / Math.PI,
      thickness,
    };
  }

  function celebrationTier({ zen, outcome, reducedMotion, hidden }) {
    if (hidden) return 'none';
    if (reducedMotion) return 'still';
    if (zen) return 'quiet';
    if (outcome === 'record' || outcome === 'first') return 'grand';
    return 'standard';
  }

  const exports = { trailGeometry, celebrationTier, CELEBRATION_MS, TRAIL_MS, AUTO_TRAIL_DELAY_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  else window.MahjongFx = exports;
})();
