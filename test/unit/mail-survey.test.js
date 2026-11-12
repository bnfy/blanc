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

test('isoWeek follows ISO 8601, including across year ends', () => {
  const week = (iso) => survey.isoWeek(new Date(`${iso}T12:00:00Z`));
  assert.equal(week('2026-11-12'), '2026-W46');
  assert.equal(week('2026-11-09'), '2026-W46', 'Monday starts the week');
  assert.equal(week('2026-11-15'), '2026-W46', 'Sunday ends it');
  assert.equal(week('2027-01-01'), '2026-W53');
  assert.equal(week('2024-12-30'), '2025-W01');
  assert.equal(week('2021-01-03'), '2020-W53');
  assert.equal(week('2026-01-05'), '2026-W02');
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
    { week: '2026-W47', account: 'gmail', speed: 'instant', features: ['sets'], note: 'later' },
    { week: '2026-W46', account: 'proton', speed: 'whenever', features: ['sets', 'proton-drafts'], note: 'earlier' },
    { week: '2026-W47', account: 'gmail', speed: 'minute', features: [], note: null },
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
  assert.deepEqual(summary.notes, [{ week: '2026-W46', text: 'earlier' }, { week: '2026-W47', text: 'later' }]);
  assert.equal(survey.summarize([], false).total, 0);
});

// --- The Worker (cloudflare/mail-survey-worker/src/index.js) ---

const { readFileSync } = require('node:fs');
const WORKER_PATH = path.resolve(__dirname, '../../cloudflare/mail-survey-worker/src/index.js');
const WRANGLER_PATH = path.resolve(__dirname, '../../cloudflare/mail-survey-worker/wrangler.toml');
const NEWSLETTER_PATH = path.resolve(__dirname, '../../cloudflare/newsletter-worker/src/index.js');

let worker;
let MAX_ANSWERS;
test.before(async () => {
  const module = await import(pathToFileURL(WORKER_PATH));
  worker = module.default;
  MAX_ANSWERS = module.MAX_ANSWERS;
});

test('the cap leaves room for one summary or purge in a single request', () => {
  assert.equal(MAX_ANSWERS, 900);
});

// Same shapes as test/unit/newsletter-worker.test.js.
// Like Workers KV, one request may make at most 1,000 KV operations.
class FakeKV {
  constructor() { this.values = new Map(); this.operations = 0; this.failPuts = false; }
  count() {
    this.operations += 1;
    if (this.operations > 1000) throw new Error('Too many API requests by single Worker invocation');
  }
  resetCount() { this.operations = 0; }
  async get(key, options) {
    this.count();
    const value = this.values.get(key) ?? null;
    return options?.type === 'json' && value !== null ? JSON.parse(value) : value;
  }
  async put(key, value) {
    this.count();
    if (this.failPuts) throw new Error('KV put() limit exceeded for the day');
    this.values.set(key, String(value));
  }
  async delete(key) { this.count(); this.values.delete(key); }
  async list({ prefix = '', limit = 1000, cursor } = {}) {
    this.count();
    const names = [...this.values.keys()].filter((name) => name.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = names.slice(start, start + limit);
    const end = start + page.length;
    return { keys: page.map((name) => ({ name })), list_complete: end >= names.length, cursor: end >= names.length ? undefined : String(end) };
  }
}

class FakeRateLimiter {
  constructor(limit = 4) { this.limitValue = limit; this.counts = new Map(); }
  async limit({ key }) {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return { success: count <= this.limitValue };
  }
}

const surveyEnv = (fields = {}) => ({
  SURVEY: new FakeKV(),
  SURVEY_RATE_LIMITER: new FakeRateLimiter(),
  SURVEY_OPEN: 'true',
  ADMIN_TOKEN: 'admin',
  ...fields,
});

function post(body, headers = {}) {
  return new Request('https://survey.test/mail-survey', {
    method: 'POST',
    headers: {
      Origin: 'https://blanc.day',
      'CF-Connecting-IP': '203.0.113.20',
      'User-Agent': 'test-agent',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const admin = (method, url, token = 'admin') => new Request(`https://survey.test${url}`, {
  method,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

test('posting from blanc.day stores one anonymous answer', async () => {
  const env = surveyEnv();
  const response = await worker.fetch(post({ account: 'gmail', speed: 'instant', features: ['sets'], note: 'hi' }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://blanc.day');
  assert.equal(env.SURVEY.values.size, 1);
  const [[key, value]] = [...env.SURVEY.values];
  for (const secret of ['203.0.113.20', 'test-agent', '@']) {
    assert.ok(!key.includes(secret) && !value.includes(secret), `stored record leaks ${secret}`);
  }
  const record = JSON.parse(value);
  // Owner decision (2026-11-12): the ISO week, not the day, so an answer can't
  // be matched to the one waitlist sign-up of that day.
  assert.match(record.week, /^\d{4}-W\d{2}$/);
  assert.deepEqual(Object.keys(record).sort(), ['account', 'features', 'note', 'speed', 'week']);
});

test('the preflight answers only allowed origins', async () => {
  const preflight = (origin) => new Request('https://survey.test/mail-survey', { method: 'OPTIONS', headers: { Origin: origin } });
  assert.equal((await worker.fetch(preflight('https://blanc.day'), surveyEnv())).status, 204);
  assert.equal((await worker.fetch(preflight('https://evil.example'), surveyEnv())).status, 403);
});

test('other origins, closed survey and bad bodies store nothing', async () => {
  const env = surveyEnv();
  const valid = { account: 'proton', speed: 'whenever' };
  assert.equal((await worker.fetch(post(valid, { Origin: 'https://evil.example' }), env)).status, 403);
  for (const flag of [undefined, 'false', 'TRUE', '1']) {
    const response = await worker.fetch(post(valid), { ...env, SURVEY_OPEN: flag });
    assert.equal(response.status, 410, String(flag));
    assert.deepEqual(await response.json(), { closed: true });
  }
  assert.equal((await worker.fetch(post('not json'), env)).status, 400);
  assert.equal((await worker.fetch(post([valid]), env)).status, 400);
  assert.equal((await worker.fetch(post({ account: 'gmail' }), env)).status, 400);
  assert.equal(env.SURVEY.values.size, 0);
});

test('a filled honeypot looks accepted but stores nothing', async () => {
  const env = surveyEnv();
  const response = await worker.fetch(post({ account: 'gmail', speed: 'minute', website: 'x' }), env);
  assert.equal(response.status, 200);
  assert.equal(env.SURVEY.values.size, 0);
});

test('the fifth post in a minute is rate limited, and a missing limiter fails closed', async () => {
  const env = surveyEnv();
  const valid = { account: 'both', speed: 'few-minutes' };
  for (let i = 0; i < 4; i += 1) assert.equal((await worker.fetch(post(valid), env)).status, 200);
  assert.equal((await worker.fetch(post(valid), env)).status, 429);
  assert.equal(env.SURVEY.values.size, 4);
  const noLimiter = surveyEnv({ SURVEY_RATE_LIMITER: undefined });
  assert.equal((await worker.fetch(post(valid), noLimiter)).status, 503);
  assert.equal(noLimiter.SURVEY.values.size, 0);
  const noIp = surveyEnv();
  assert.equal((await worker.fetch(post(valid, { 'CF-Connecting-IP': '' }), noIp)).status, 429);
  assert.equal(noIp.SURVEY.values.size, 0);
});

async function seed(env, n) {
  for (let i = 0; i < n; i += 1) {
    env.SURVEY.values.set(`answer:${String(i).padStart(5, '0')}`, JSON.stringify({ week: '2026-W46', account: 'gmail', speed: 'instant', features: [], note: null }));
  }
}

test('summary and purge need the admin token and stay within one request at the cap', async () => {
  const env = surveyEnv();
  await seed(env, MAX_ANSWERS);
  for (const request of [admin('GET', '/mail-survey/summary', null), admin('GET', '/mail-survey/summary', 'wrong')]) {
    assert.equal((await worker.fetch(request, env)).status, 401);
  }
  assert.equal((await worker.fetch(admin('GET', '/mail-survey/summary'), { ...env, ADMIN_TOKEN: undefined })).status, 401);
  env.SURVEY.resetCount();
  const summary = await (await worker.fetch(admin('GET', '/mail-survey/summary'), env)).json();
  assert.equal(summary.total, MAX_ANSWERS);
  assert.equal(summary.truncated, false);
  assert.equal(summary.open, true);
  assert.equal((await worker.fetch(admin('DELETE', '/mail-survey/answers'), env)).status, 400);
  assert.equal((await worker.fetch(admin('DELETE', '/mail-survey/answers?confirm=delete-all', 'wrong'), env)).status, 401);
  assert.equal(env.SURVEY.values.size, MAX_ANSWERS);
  env.SURVEY.resetCount();
  const purged = await worker.fetch(admin('DELETE', '/mail-survey/answers?confirm=delete-all'), env);
  assert.deepEqual(await purged.json(), { deleted: MAX_ANSWERS, remaining: 0 });
  assert.equal(env.SURVEY.values.size, 0);
});

test('a full survey stores nothing more and answers as closed', async () => {
  const env = surveyEnv();
  await seed(env, MAX_ANSWERS);
  const response = await worker.fetch(post({ account: 'gmail', speed: 'minute' }), env);
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { closed: true });
  assert.equal(env.SURVEY.values.size, MAX_ANSWERS);
});

test('a storage failure is a 503 the page can show, not a crash', async () => {
  const env = surveyEnv();
  env.SURVEY.failPuts = true;
  const response = await worker.fetch(post({ account: 'gmail', speed: 'minute' }), env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://blanc.day');
});

test('unknown routes are not found', async () => {
  assert.equal((await worker.fetch(admin('GET', '/'), surveyEnv())).status, 404);
});

test('the survey Worker keeps request logging off and accepts only the site origins', () => {
  const toml = readFileSync(WRANGLER_PATH, 'utf8');
  assert.match(toml, /\[observability\]\s*\nenabled = false/);
  assert.doesNotMatch(toml, /logpush\s*=\s*true/);
  assert.match(toml, /SURVEY_OPEN = "false"/, 'deploys closed until the page is live');
  const origins = (file) => {
    const block = readFileSync(file, 'utf8').match(/const ALLOWED_ORIGINS = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(block, file);
    return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
  };
  const newsletter = origins(NEWSLETTER_PATH).filter((origin) => origin !== 'https://blancbrowser.com');
  assert.deepEqual(origins(WORKER_PATH), newsletter);
});

test('the summary says when answers past the cap were not counted', async () => {
  const env = surveyEnv();
  await seed(env, MAX_ANSWERS + 5);
  const summary = await (await worker.fetch(admin('GET', '/mail-survey/summary'), env)).json();
  assert.equal(summary.total, MAX_ANSWERS);
  assert.equal(summary.truncated, true);
});
