'use strict';

// The start page's Patron upgrade pill can be closed. Closing it stores the
// time (settings.patronCalloutDismissedAt, device-local, never synced) and
// keeps the pill away for 90 days, after which it returns once more.
const PATRON_CALLOUT_SNOOZE_MS = 90 * 24 * 60 * 60 * 1000;

function isPatronCalloutSnoozed(dismissedAt, now) {
  if (typeof dismissedAt !== 'number' || !Number.isFinite(dismissedAt) || dismissedAt <= 0) return false;
  // A timestamp more than one snooze ahead of the clock is corrupt, not a
  // reason to hide the pill indefinitely.
  if (dismissedAt - now > PATRON_CALLOUT_SNOOZE_MS) return false;
  return now - dismissedAt < PATRON_CALLOUT_SNOOZE_MS;
}

// When the current snooze ends (ms since the epoch), or 0 when the pill is
// not snoozed. Start pages get this rather than a boolean, so a page left
// open past the end shows the pill again without a reload.
function patronCalloutSnoozedUntil(dismissedAt, now) {
  return isPatronCalloutSnoozed(dismissedAt, now) ? dismissedAt + PATRON_CALLOUT_SNOOZE_MS : 0;
}

module.exports = { PATRON_CALLOUT_SNOOZE_MS, isPatronCalloutSnoozed, patronCalloutSnoozedUntil };
