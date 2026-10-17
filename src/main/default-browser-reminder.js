'use strict';

// The one later ask to make Blanc the default browser. Onboarding asks once,
// on its first step; someone who passes it by then sees this a single time,
// on a launch at least REMINDER_MIN_AGE_MS after they finished setup and only
// within REMINDER_MAX_AGE_MS of it, so long-time users who chose another
// default are never asked (their firstRunCompletedAt is 0). Pure: main.js
// injects settings and the (on Windows, registry-reading) default check,
// which runs last.

const REMINDER_MIN_AGE_MS = 12 * 60 * 60 * 1000;
const REMINDER_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const REMINDER_DELAY_MS = 20 * 1000;

function shouldRemindDefaultBrowser({
  firstRunCompletedAt,
  now,
  firstRunComplete,
  reminderShown,
  canSet,
  isDefault,
}) {
  if (firstRunComplete !== true || reminderShown === true || canSet !== true) return false;
  if (!Number.isFinite(firstRunCompletedAt) || firstRunCompletedAt <= 0) return false;
  const age = now - firstRunCompletedAt;
  if (age < REMINDER_MIN_AGE_MS || age > REMINDER_MAX_AGE_MS) return false;
  try {
    return isDefault() !== true;
  } catch {
    return false;
  }
}

module.exports = {
  shouldRemindDefaultBrowser,
  REMINDER_MIN_AGE_MS,
  REMINDER_MAX_AGE_MS,
  REMINDER_DELAY_MS,
};
