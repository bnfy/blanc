'use strict';

// The anonymous Blanc Mail feature survey (cloudflare/mail-survey-worker/).
// Spec: docs/superpowers/specs/2026-11-12-mail-feature-survey-design.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SURVEY_PATH = path.resolve(__dirname, '../../cloudflare/mail-survey-worker/src/survey.js');

let survey;
test.before(async () => {
  survey = await import(pathToFileURL(SURVEY_PATH));
});

const answer = (fields = {}) => ({ account: 'gmail', speed: 'minute', ...fields });

test('parseAnswer accepts a full answer', () => {
  const result = survey.parseAnswer(answer({ features: ['sets', 'saved-search'], note: ' Fast search ' }));
  assert.deepEqual(result, {
    ok: true,
    answer: { account: 'gmail', speed: 'minute', features: ['sets', 'saved-search'], note: 'Fast search' },
  });
});

test('parseAnswer requires account and speed', () => {
  assert.equal(survey.parseAnswer({ speed: 'minute' }).ok, false);
  assert.equal(survey.parseAnswer({ account: 'gmail' }).ok, false);
});

test('parseAnswer refuses unknown ids and extra fields', () => {
  assert.equal(survey.parseAnswer(answer({ account: 'icloud' })).ok, false);
  assert.equal(survey.parseAnswer(answer({ speed: 'hourly' })).ok, false);
  assert.equal(survey.parseAnswer(answer({ features: ['push'] })).ok, false);
  assert.equal(survey.parseAnswer(answer({ email: 'a@example.com' })).ok, false);
  assert.equal(survey.parseAnswer(answer({ features: 'sets' })).ok, false);
  assert.equal(survey.parseAnswer(answer({ note: 5 })).ok, false);
});

test('parseAnswer refuses more than three features and repeats', () => {
  assert.equal(survey.parseAnswer(answer({ features: ['sets', 'saved-search', 'trusted-images', 'proton-drafts'] })).ok, false);
  assert.equal(survey.parseAnswer(answer({ features: ['sets', 'sets'] })).ok, false);
  assert.deepEqual(survey.parseAnswer(answer({ features: [] })).answer.features, []);
  assert.deepEqual(survey.parseAnswer(answer()).answer.features, []);
});

test('parseAnswer treats a blank note as none and refuses a long one', () => {
  assert.equal(survey.parseAnswer(answer({ note: '   ' })).answer.note, null);
  assert.equal(survey.parseAnswer(answer()).answer.note, null);
  assert.equal(survey.parseAnswer(answer({ note: 'x'.repeat(500) })).ok, true);
  assert.equal(survey.parseAnswer(answer({ note: 'x'.repeat(501) })).ok, false);
  assert.equal(survey.parseAnswer(answer({ note: '📬'.repeat(500) })).ok, true, 'counted in characters, not UTF-16 units');
});

test('parseAnswer ignores only the honeypot field', () => {
  assert.equal(survey.parseAnswer(answer({ website: '' })).ok, true);
});

test('parseAnswer refuses non-objects', () => {
  for (const body of [null, [], 'a', 3, undefined]) assert.equal(survey.parseAnswer(body).ok, false, String(body));
});

test('the choices and limits match the spec', () => {
  assert.deepEqual(survey.CHOICES.account, ['gmail', 'proton', 'both', 'other']);
  assert.deepEqual(survey.CHOICES.speed, ['instant', 'minute', 'few-minutes', 'whenever']);
  assert.deepEqual(survey.CHOICES.features, [
    'unsubscribe-mute', 'calendar-replies', 'sets', 'snooze-send-later-templates', 'rules-vacation',
    'saved-search', 'trusted-images', 'print-pdf-windows', 'proton-drafts',
  ]);
  assert.equal(survey.MAX_FEATURES, 3);
  assert.equal(survey.MAX_NOTE, 500);
});

test('summarize counts every id, splits speed by account and keeps notes', () => {
  const records = [
    { day: '2026-11-14', account: 'gmail', speed: 'instant', features: ['sets'], note: 'later' },
    { day: '2026-11-13', account: 'proton', speed: 'whenever', features: ['sets', 'proton-drafts'], note: 'earlier' },
    { day: '2026-11-15', account: 'gmail', speed: 'minute', features: [], note: null },
  ];
  const summary = survey.summarize(records, true);
  assert.equal(summary.open, true);
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.accounts, { gmail: 2, proton: 1, both: 0, other: 0 });
  assert.deepEqual(summary.speed, { instant: 1, minute: 1, 'few-minutes': 0, whenever: 1 });
  assert.equal(summary.speedByAccount.gmail.instant, 1);
  assert.equal(summary.speedByAccount.gmail.minute, 1);
  assert.equal(summary.speedByAccount.proton.whenever, 1);
  assert.equal(summary.speedByAccount.other.instant, 0);
  assert.equal(summary.features.sets, 2);
  assert.equal(summary.features['proton-drafts'], 1);
  assert.equal(summary.features['saved-search'], 0);
  assert.deepEqual(summary.notes, [{ day: '2026-11-13', text: 'earlier' }, { day: '2026-11-14', text: 'later' }]);
  assert.equal(survey.summarize([], false).total, 0);
});
