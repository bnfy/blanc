'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  shouldRemindDefaultBrowser,
  REMINDER_MIN_AGE_MS,
  REMINDER_MAX_AGE_MS,
} = require('../../src/main/default-browser-reminder');

const HOUR = 60 * 60 * 1000;
const finished = 1_800_000_000_000;
const base = {
  firstRunCompletedAt: finished,
  now: finished + 24 * HOUR,
  firstRunComplete: true,
  reminderShown: false,
  canSet: true,
  isDefault: () => false,
};
const remind = (extra) => shouldRemindDefaultBrowser({ ...base, ...extra });

test('the reminder asks once, a day or so after setup, only if Blanc is still not the default', () => {
  assert.equal(remind({}), true);
  assert.equal(remind({ isDefault: () => true }), false);
  assert.equal(remind({ reminderShown: true }), false, 'never twice');
  assert.equal(remind({ firstRunComplete: false }), false);
  assert.equal(remind({ canSet: false }), false, 'never in dev runs or on Linux');
  assert.equal(remind({ isDefault: () => { throw new Error('registry'); } }), false, 'an unreadable answer never asks');
});

test('the reminder waits 12 hours after setup and stops after 14 days', () => {
  assert.equal(REMINDER_MIN_AGE_MS, 12 * HOUR);
  assert.equal(REMINDER_MAX_AGE_MS, 14 * 24 * HOUR);
  assert.equal(remind({ now: finished + REMINDER_MIN_AGE_MS - 1 }), false, 'not in the first session');
  assert.equal(remind({ now: finished + REMINDER_MIN_AGE_MS }), true);
  assert.equal(remind({ now: finished + REMINDER_MAX_AGE_MS }), true);
  assert.equal(remind({ now: finished + REMINDER_MAX_AGE_MS + 1 }), false, 'long-time users are not asked');
  assert.equal(remind({ firstRunCompletedAt: 0 }), false, 'profiles from before the stamp are never asked');
  assert.equal(remind({ firstRunCompletedAt: Number.NaN }), false);
});

test('the default check runs last, so a Windows registry read happens only when everything else agrees', () => {
  let reads = 0;
  const isDefault = () => { reads += 1; return false; };
  remind({ isDefault, reminderShown: true });
  remind({ isDefault, canSet: false });
  remind({ isDefault, now: finished });
  assert.equal(reads, 0);
  remind({ isDefault });
  assert.equal(reads, 1);
});

test('main marks the reminder shown before the dialog opens and reuses the shared request', () => {
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const fn = main.match(/function scheduleDefaultBrowserReminder\(\) \{[\s\S]*?\n\}\n/)?.[0] ?? '';
  assert.ok(fn, 'the reminder is scheduled from one function');
  assert.ok(fn.indexOf('defaultBrowserReminderShown: true') < fn.indexOf('dialog.showMessageBox('),
    'marked shown first, so a crash cannot ask twice');
  assert.match(fn, /requestDefaultBrowser\(\{ app, platform: process\.platform, shell \}\)/);
  assert.match(fn, /cancelId: 1/);
  assert.match(main, /maybeSendLaunchPing\(\);\s*scheduleDefaultBrowserReminder\(\);/,
    'scheduled once, after session restore and external URLs are handled');
});
