'use strict';

// One controller per native window. Only the main process chooses a target
// and reads pixels; page notifications carry no color or browsing data.
function createPageTintController({ getTarget, sample, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  let timer = null;
  let running = false;
  let disposed = false;
  let inFlight = false;
  let generation = 0;
  let lastSample = -Infinity;
  let burstUntil = 0;
  const clear = () => { if (timer !== null) cancel(timer); timer = null; };
  function arm(delay) {
    clear();
    if (running && !disposed && !inFlight) timer = schedule(tick, delay);
  }
  function pause() {
    running = false;
    generation += 1;
    burstUntil = 0;
    clear();
  }
  async function tick() {
    timer = null;
    if (disposed || !running || inFlight) return;
    const target = getTarget();
    if (!target) { pause(); return; }
    const request = generation;
    inFlight = true;
    lastSample = now();
    let changed = false;
    try { changed = await sample(target, () => running && !disposed && generation === request); }
    catch { /* A view can close or navigate during capture. */ }
    finally { inFlight = false; }
    if (!running || disposed) return;
    if (!getTarget()) { pause(); return; }
    if (changed && generation === request) burstUntil = Math.max(burstUntil, now() + 1200);
    arm(Math.max(0, lastSample + (now() < burstUntil ? 80 : 1000) - now()));
  }
  return {
    request() {
      if (disposed) return;
      if (!getTarget()) { pause(); return; }
      running = true;
      burstUntil = Math.max(burstUntil, now() + 2400);
      arm(Math.max(0, lastSample + 80 - now()));
    },
    pause,
    dispose() { pause(); disposed = true; },
  };
}
module.exports = { createPageTintController };
