// What a Blanc Mail survey answer may contain, and how answers are counted.
// The ids are shared with site/src/components/MailSurveyForm.astro; change
// them together (test/unit/mail-survey-site.test.js checks they match).
// Spec: docs/superpowers/specs/2026-11-12-mail-feature-survey-design.md.

export const CHOICES = Object.freeze({
  account: Object.freeze(['gmail', 'proton', 'both', 'other']),
  speed: Object.freeze(['instant', 'minute', 'few-minutes', 'whenever']),
  features: Object.freeze([
    'unsubscribe-mute',
    'calendar-replies',
    'sets',
    'snooze-send-later-templates',
    'rules-vacation',
    'saved-search',
    'trusted-images',
    'print-pdf-windows',
    'proton-drafts',
  ]),
});

export const MAX_FEATURES = 3;
export const MAX_NOTE = 500;

// The ISO 8601 week of a date, such as "2026-W46". Answers keep only the week
// (owner decision, 2026-11-12): a day could match the one waitlist sign-up
// that day in the signup alerts.
export function isoWeek(date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday); // the Thursday of this week
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day - yearStart) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// "website" is the honeypot the Worker checks before parsing.
const ALLOWED_FIELDS = new Set(['account', 'speed', 'features', 'note', 'website']);

const refuse = (reason) => ({ ok: false, reason });

export function parseAnswer(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return refuse('not an object');
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) return refuse(`unknown field ${key}`);
  }
  const { account = null, speed = null, features = [], note = null } = body;
  if (note !== null && typeof note !== 'string') return refuse('note');
  const trimmed = note === null ? '' : note.trim();
  // The first two questions may be skipped only by someone leaving a
  // suggestion (owner decision, 2026-11-12); an answer given must be valid.
  const optional = trimmed !== '';
  if (!(account === null && optional) && !CHOICES.account.includes(account)) return refuse('account');
  if (!(speed === null && optional) && !CHOICES.speed.includes(speed)) return refuse('speed');
  if (!Array.isArray(features) || features.length > MAX_FEATURES) return refuse('features');
  if (new Set(features).size !== features.length) return refuse('repeated feature');
  if (!features.every((id) => CHOICES.features.includes(id))) return refuse('feature');
  if ([...trimmed].length > MAX_NOTE) return refuse('note too long');
  return { ok: true, answer: { account, speed, features: [...features], note: trimmed || null } };
}

const zeros = (ids) => Object.fromEntries(ids.map((id) => [id, 0]));

export function summarize(records, open) {
  const accounts = zeros(CHOICES.account);
  const speed = zeros(CHOICES.speed);
  const features = zeros(CHOICES.features);
  const speedByAccount = Object.fromEntries(CHOICES.account.map((id) => [id, zeros(CHOICES.speed)]));
  const notes = [];
  let noteOnly = 0;
  for (const record of records) {
    if (record.account == null && record.speed == null) noteOnly += 1;
    if (record.account in accounts) accounts[record.account] += 1;
    if (record.speed in speed) speed[record.speed] += 1;
    if (record.account in speedByAccount && record.speed in speed) speedByAccount[record.account][record.speed] += 1;
    for (const id of record.features ?? []) if (id in features) features[id] += 1;
    if (record.note) notes.push({ week: record.week, text: record.note });
  }
  notes.sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));
  return { open, total: records.length, noteOnly, accounts, speed, speedByAccount, features, notes };
}
