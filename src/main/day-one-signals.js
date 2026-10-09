'use strict';

// First-day retention signals (docs/superpowers/specs/2026-10-09-first-day-
// retention-signals-design.md). Pure: main.js injects install metadata, the
// consent gate, the sender and the default-browser check, so the whole policy
// runs under plain node --test.
//
// Each signal is sent at most once per install and only within 24 hours of
// the install time in install.json. The sent flag must reach disk before the
// event leaves. Nothing starts until START_DELAY_MS after the launch report,
// so the collector has already recorded the install's first-seen day.
// notePageLoaded receives a URL only to check its scheme; the count lives in
// memory, holds no addresses, and resets with the process.

const DAY_ONE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const START_DELAY_MS = 2 * 60 * 1000;
const BROWSED_PAGE_THRESHOLD = 3;

function withinDayOne(createdAt, now) {
  return typeof createdAt === 'number' && Number.isFinite(createdAt)
    && now >= createdAt && now - createdAt < DAY_ONE_WINDOW_MS;
}

function isCountableWebPage(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function createDayOneSignals({
  readMeta,
  markSent,
  send,
  canSend,
  isDefaultBrowser,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let pageLoads = 0;
  let starting = false;
  let active = false;
  let timer = null;

  function stopTimer() {
    if (timer === null) return;
    clearIntervalFn(timer);
    timer = null;
  }

  function emit(signal) {
    const meta = readMeta();
    if (meta.sent[signal] || !withinDayOne(meta.createdAt, now()) || !canSend()) return false;
    if (!markSent(signal)) return false;
    send(signal);
    return true;
  }

  function checkDefault() {
    if (!active) return false;
    const meta = readMeta();
    if (meta.sent.default || !withinDayOne(meta.createdAt, now())) {
      stopTimer();
      return false;
    }
    let isDefault = false;
    try {
      isDefault = isDefaultBrowser() === true;
    } catch {
      isDefault = false;
    }
    if (!isDefault || !emit('default')) return false;
    stopTimer();
    return true;
  }

  function notePageLoaded(url) {
    if (pageLoads >= BROWSED_PAGE_THRESHOLD || !isCountableWebPage(url)) return false;
    pageLoads += 1;
    return active && pageLoads === BROWSED_PAGE_THRESHOLD && emit('browsed');
  }

  function activate() {
    active = true;
    const meta = readMeta();
    if (!withinDayOne(meta.createdAt, now())) return;
    if (pageLoads >= BROWSED_PAGE_THRESHOLD) emit('browsed');
    if (meta.sent.default || checkDefault()) return;
    timer = setIntervalFn(checkDefault, DEFAULT_CHECK_INTERVAL_MS);
    timer?.unref?.();
  }

  function start() {
    if (starting) return;
    starting = true;
    setTimeoutFn(activate, START_DELAY_MS);
  }

  return { start, stop: stopTimer, checkDefault, notePageLoaded };
}

module.exports = {
  createDayOneSignals,
  DAY_ONE_WINDOW_MS,
  DEFAULT_CHECK_INTERVAL_MS,
  START_DELAY_MS,
  BROWSED_PAGE_THRESHOLD,
};
