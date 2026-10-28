'use strict';

// While Settings shows a live pairing code, watch for the device that takes
// it (design 2026-10-28 §6.3). The new device announces itself with a
// presence entry, so a device id absent when the code was shown means the
// code was claimed. Reads are spaced to spend at most 3 of the desktop's
// 10 GETs a minute. Pure, no Electron: the caller supplies the read, the
// device list and the clock.

const PAIR_WATCH_MS = 20_000;
const PAIR_WATCH_MAX_READS = 30;

function createPairWatch({
  read, devices, onJoined,
  now = Date.now, setInterval: every = setInterval, clearInterval: clear = clearInterval,
}) {
  let session = null; // { baseline: Set, expiresAt, reads }
  let active = false;
  let timer = null;

  const stopTimer = () => {
    if (timer !== null) clear(timer);
    timer = null;
  };

  function stop() {
    session = null;
    stopTimer();
  }

  function check() {
    if (!session) return;
    const found = devices().find((device) => !session.baseline.has(device.id));
    if (!found) return;
    stop();
    onJoined(found);
  }

  async function tick() {
    if (!session) return stopTimer();
    if (now() >= session.expiresAt || session.reads >= PAIR_WATCH_MAX_READS) return stopTimer();
    session.reads += 1;
    try {
      await read();
    } catch { /* the next tick, or the ordinary schedule, tries again */ }
    check();
  }

  function sync() {
    if (active && session && timer === null) {
      timer = every(tick, PAIR_WATCH_MS);
      timer?.unref?.();
    } else if (!active || !session) {
      stopTimer();
    }
  }

  return {
    start({ expiresAt }) {
      stopTimer();
      session = { baseline: new Set(devices().map((device) => device.id)), expiresAt, reads: 0 };
      sync();
    },
    setActive(value) {
      active = !!value;
      sync();
    },
    check,
    stop,
  };
}

module.exports = { createPairWatch, PAIR_WATCH_MS, PAIR_WATCH_MAX_READS };
