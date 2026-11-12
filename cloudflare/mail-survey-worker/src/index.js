// The anonymous Blanc Mail feature survey. Stores each answer with only the
// ISO week it arrived: no email address, IP address or browser details, and this
// Worker keeps no request logs (wrangler.toml). The survey page, this Worker
// and the privacy page's "Blanc Mail survey" section describe one contract;
// change them together. Spec:
// docs/superpowers/specs/2026-11-12-mail-feature-survey-design.md.

import { isoWeek, parseAnswer, summarize } from './survey.js';

// The site's origins: the newsletter Worker's list minus the former domain,
// which that Worker keeps only for pages opened before the move to blanc.day.
// The survey page has only ever been served from blanc.day
// (test/unit/mail-survey.test.js).
const ALLOWED_ORIGINS = new Set([
  'https://blanc.day',
  'http://localhost:4321',
  'http://localhost:4322',
  'http://127.0.0.1:4321',
  'http://127.0.0.1:4322',
]);

const ANSWER_PREFIX = 'answer:';
const MAX_BODY_LENGTH = 4096;
// A hard ceiling on stored answers, far above the few dozen expected. It
// bounds what one abusive visitor can add, and keeps a summary (one list plus
// one read per answer) or a purge (one delete per answer) inside a single
// request's 1,000 KV operations.
export const MAX_ANSWERS = 900;

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

function corsFor(request) {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const isOpen = (env) => env.SURVEY_OPEN === 'true';

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return ANSWER_PREFIX + btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

// Fails closed without ADMIN_TOKEN. Compares digests so the check does not
// stop early on the first differing character.
async function isAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const presented = await digest(request.headers.get('Authorization') ?? '');
  const expected = await digest(`Bearer ${env.ADMIN_TOKEN}`);
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= presented[i] ^ expected[i];
  return difference === 0;
}

// One list operation; the cap keeps every answer within its first page.
async function answerKeys(env) {
  const page = await env.SURVEY.list({ prefix: ANSWER_PREFIX, limit: 1000 });
  return page.keys.map((key) => key.name);
}

async function handleAnswer(request, env, cors) {
  if (!isOpen(env)) return json(410, { closed: true }, cors);
  if (!env.SURVEY_RATE_LIMITER) return json(503, { error: 'unavailable' }, cors);
  // The IP is used only as this minute's rate-limit key, never stored.
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !(await env.SURVEY_RATE_LIMITER.limit({ key: `survey:${ip}` })).success) {
    return json(429, { error: 'rate limited' }, cors);
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_LENGTH) return json(400, { error: 'invalid' }, cors);
  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) return json(400, { error: 'invalid' }, cors);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'invalid' }, cors);
  }
  if (body && typeof body === 'object' && typeof body.website === 'string' && body.website !== '') {
    return json(200, { ok: true }, cors);
  }
  const parsed = parseAnswer(body);
  if (!parsed.ok) return json(400, { error: 'invalid' }, cors);
  try {
    if ((await answerKeys(env)).length >= MAX_ANSWERS) return json(410, { closed: true }, cors);
    await env.SURVEY.put(randomKey(), JSON.stringify({ week: isoWeek(new Date()), ...parsed.answer }));
  } catch {
    return json(503, { error: 'unavailable' }, cors);
  }
  return json(200, { ok: true }, cors);
}

async function handleSummary(env) {
  const keys = await answerKeys(env);
  const records = [];
  for (const key of keys.slice(0, MAX_ANSWERS)) {
    const record = await env.SURVEY.get(key, { type: 'json' });
    if (record) records.push(record);
  }
  // A burst can slip a few answers past the cap (KV lists are eventually
  // consistent); say so rather than report a short total as complete.
  return json(200, { ...summarize(records, isOpen(env)), truncated: keys.length > MAX_ANSWERS });
}

async function handlePurge(env, url) {
  if (url.searchParams.get('confirm') !== 'delete-all') return json(400, { error: 'confirm=delete-all required' });
  // At most MAX_ANSWERS deletes a call; repeat until remaining is 0.
  const keys = (await answerKeys(env)).slice(0, MAX_ANSWERS);
  for (const key of keys) await env.SURVEY.delete(key);
  const remaining = (await answerKeys(env)).length;
  return json(200, { deleted: keys.length, remaining });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/mail-survey') {
      const cors = corsFor(request);
      if (!cors) return json(403, { error: 'origin denied' });
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (request.method === 'POST') return handleAnswer(request, env, cors);
      return json(405, { error: 'method not allowed' }, cors);
    }
    if (url.pathname === '/mail-survey/summary' && request.method === 'GET') {
      if (!(await isAdmin(request, env))) return json(401, { error: 'unauthorized' });
      return handleSummary(env);
    }
    if (url.pathname === '/mail-survey/answers' && request.method === 'DELETE') {
      if (!(await isAdmin(request, env))) return json(401, { error: 'unauthorized' });
      return handlePurge(env, url);
    }
    return json(404, { error: 'not found' });
  },
};
