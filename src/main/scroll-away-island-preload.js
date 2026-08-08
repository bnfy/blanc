// Session-wide, unprivileged scroll-direction reporter for the scroll-away
// Island experiment. It exposes nothing to a page: the sole output is a
// direction token sent to main. A programmatic scroll may never hide browser
// chrome: we only react to a recent, trusted user scroll gesture. Main then
// independently verifies the sender is the active tab's main frame before
// changing any window geometry.
const { ipcRenderer } = require('electron');

const MIN_SCROLL_DELTA = 24;
const USER_SCROLL_INTENT_MS = 400;
let lastScrollTop = 0;
let accumulatedDelta = 0;
let lastDirection = null;
let pendingUserDirection = null;
let userIntentExpiresAt = 0;
let lastTouchY = null;

function pageScrollTop() {
  return window.scrollY || document.scrollingElement?.scrollTop || 0;
}

function resetScrollTracking() {
  lastScrollTop = pageScrollTop();
  accumulatedDelta = 0;
  pendingUserDirection = null;
  userIntentExpiresAt = 0;
}

function armUserScrollIntent(direction) {
  pendingUserDirection = direction;
  userIntentExpiresAt = Date.now() + USER_SCROLL_INTENT_MS;
}

function editableTarget(target) {
  return target instanceof Element && (
    target.matches('input, textarea, select, [contenteditable="true"]') ||
    target.closest('[contenteditable="true"]')
  );
}

function reportDirection(direction) {
  if (direction === lastDirection) return;
  lastDirection = direction;
  ipcRenderer.send('tabs:scroll-direction', direction);
}

function onScroll() {
  const nextScrollTop = pageScrollTop();
  const delta = nextScrollTop - lastScrollTop;
  lastScrollTop = nextScrollTop;
  if (!delta) return;

  const direction = delta > 0 ? 'down' : 'up';
  if (Date.now() > userIntentExpiresAt || pendingUserDirection !== direction) {
    accumulatedDelta = 0;
    return;
  }

  // Require a deliberate root-page move. It avoids flicker from tiny layout
  // corrections while still responding naturally to a wheel, trackpad, or
  // keyboard scroll.
  if (Math.sign(delta) !== Math.sign(accumulatedDelta)) accumulatedDelta = 0;
  accumulatedDelta += delta;
  if (Math.abs(accumulatedDelta) < MIN_SCROLL_DELTA) return;
  reportDirection(direction);
  accumulatedDelta = 0;
}

resetScrollTracking();
window.addEventListener('scroll', onScroll, { capture: true, passive: true });
window.addEventListener('wheel', (event) => {
  if (!event.isTrusted || Math.abs(event.deltaY) < 1) return;
  armUserScrollIntent(event.deltaY > 0 ? 'down' : 'up');
}, { capture: true, passive: true });
window.addEventListener('keydown', (event) => {
  if (!event.isTrusted || editableTarget(event.target)) return;
  const down = ['ArrowDown', 'PageDown', 'End', ' '];
  const up = ['ArrowUp', 'PageUp', 'Home'];
  if (down.includes(event.key)) armUserScrollIntent('down');
  if (up.includes(event.key)) armUserScrollIntent('up');
}, { capture: true });
window.addEventListener('touchstart', (event) => {
  lastTouchY = event.isTrusted ? event.touches[0]?.clientY ?? null : null;
}, { capture: true, passive: true });
window.addEventListener('touchmove', (event) => {
  if (!event.isTrusted || lastTouchY === null) return;
  const nextTouchY = event.touches[0]?.clientY;
  if (!Number.isFinite(nextTouchY)) return;
  const delta = lastTouchY - nextTouchY;
  lastTouchY = nextTouchY;
  if (Math.abs(delta) >= 1) armUserScrollIntent(delta > 0 ? 'down' : 'up');
}, { capture: true, passive: true });
window.addEventListener('touchend', () => { lastTouchY = null; }, { capture: true, passive: true });
window.addEventListener('pageshow', resetScrollTracking, { passive: true });
