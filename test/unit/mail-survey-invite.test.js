'use strict';

// The Mail page's survey invitation card: when it shows, what it remembers in
// the visitor's own browser, and the survey preselection it links to.
// Spec: docs/superpowers/specs/2026-11-12-mail-feature-survey-design.md
// ("Invitation card on the Mail page").

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
let invite;
let CHOICES;
test.before(async () => {
  invite = await import(pathToFileURL(path.join(root, 'site/src/scripts/mail-survey-invite.mjs')));
  ({ CHOICES } = await import(pathToFileURL(path.join(root, 'cloudflare/mail-survey-worker/src/survey.js'))));
});

class MemoryStorage {
  constructor(initial = {}) { this.items = new Map(Object.entries(initial)); }
  getItem(key) { return this.items.has(key) ? this.items.get(key) : null; }
  setItem(key, value) { this.items.set(key, String(value)); }
}
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('the card shows until closed, stays away a week, and never returns once answered', () => {
  const now = Date.UTC(2026, 10, 12);
  assert.equal(invite.shouldShow({}, now), true);
  const snoozed = invite.snooze(now);
  assert.equal(snoozed.snoozedUntil, now + invite.SNOOZE_MS);
  assert.equal(invite.SNOOZE_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(invite.shouldShow(snoozed, now + 1000), false);
  assert.equal(invite.shouldShow(snoozed, now + invite.SNOOZE_MS), true);
  assert.equal(invite.shouldShow(invite.ANSWERED, now + 10 * invite.SNOOZE_MS), false);
  assert.equal(invite.shouldShow({ snoozedUntil: 'soon' }, now), true, 'a malformed note shows the card');
});

test('the browser note survives bad or blocked storage', () => {
  assert.equal(invite.INVITE_KEY, 'blanc-mail-survey-invite-v1');
  assert.deepEqual(invite.readState(new MemoryStorage()), {});
  assert.deepEqual(invite.readState(new MemoryStorage({ [invite.INVITE_KEY]: '{not json' })), {});
  assert.deepEqual(invite.readState(new MemoryStorage({ [invite.INVITE_KEY]: 'null' })), {});
  assert.deepEqual(invite.readState(throwing), {});
  assert.deepEqual(invite.readState(null), {});
  assert.doesNotThrow(() => invite.writeState(null, invite.ANSWERED));
  assert.doesNotThrow(() => invite.writeState(throwing, invite.ANSWERED));
  const storage = new MemoryStorage();
  invite.writeState(storage, { snoozedUntil: 5 });
  assert.deepEqual(invite.readState(storage), { snoozedUntil: 5 });
});

test('the survey preselects only a known account id from the link', () => {
  for (const id of CHOICES.account) assert.equal(invite.accountFromQuery(`?account=${id}`), id);
  assert.equal(invite.accountFromQuery('?account=icloud'), null);
  assert.equal(invite.accountFromQuery(''), null);
  assert.equal(invite.accountFromQuery('?other=1'), null);
  assert.deepEqual([...invite.ACCOUNT_IDS], [...CHOICES.account]);
});

test('overlaps tells when the card would cover a form', () => {
  const card = { top: 700, bottom: 780, left: 80, right: 360 };
  assert.equal(invite.overlaps({ top: 650, bottom: 720, left: 20, right: 355 }, card), true);
  assert.equal(invite.overlaps({ top: 600, bottom: 700, left: 20, right: 355 }, card), false, 'touching edges is not covering');
  assert.equal(invite.overlaps({ top: 790, bottom: 900, left: 20, right: 355 }, card), false);
  assert.equal(invite.overlaps({ top: 650, bottom: 720, left: 0, right: 80 }, card), false);
  assert.equal(invite.overlaps({ top: 0, bottom: 0, left: 0, right: 0 }, card), false, 'a hidden form never blocks');
});
