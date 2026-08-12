// Consent-first newsletter enrollment. An address is not a subscriber until
// its owner follows a one-time confirmation link. Confirmation mail is sent
// through Resend; the verified subscriber list remains in Blanc's own KV.

const MAX_EMAIL_LENGTH = 254;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const ALLOWED_ORIGINS = new Set([
  'https://blancbrowser.com',
  'http://localhost:4321',
]);
const SUBSCRIBE_RATE_LIMIT = 6;
const EMAIL_RETRY_TTL = 10 * 60;
const CONFIRM_TTL = 24 * 60 * 60;
const QUARANTINE_TTL = 30 * 24 * 60 * 60;

const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...headers,
  },
});

function allowedCors(request) {
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

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function keyedEmail(env, email) {
  if (!env.NEWSLETTER_TOKEN_SECRET) return null;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.NEWSLETTER_TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function ipRateLimited(env, ip) {
  if (!ip) return true;
  const key = `ip:${ip}:${Math.floor(Date.now() / 60000)}`;
  const count = Number.parseInt((await env.SUBSCRIBERS.get(key)) ?? '0', 10);
  if (count >= SUBSCRIBE_RATE_LIMIT) return true;
  await env.SUBSCRIBERS.put(key, String(count + 1), { expirationTtl: 120 });
  return false;
}

async function sendConfirmation(env, email, confirmationUrl, idempotencyKey) {
  if (!env.RESEND_API_KEY || !env.NEWSLETTER_FROM) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from: env.NEWSLETTER_FROM,
      to: [email],
      subject: 'Confirm your Blanc release notes subscription',
      text: `Confirm that you want occasional Blanc release notes:\n\n${confirmationUrl}\n\nIf you did not request this, ignore this email. The request expires in 24 hours.`,
      html: `<p>Confirm that you want occasional Blanc release notes.</p><p><a href="${confirmationUrl}">Confirm subscription</a></p><p>If you did not request this, ignore this email. The request expires in 24 hours.</p>`,
    }),
  });
  return response.ok;
}

async function handleSubscribe(request, env, cors) {
  if (
    !env.NEWSLETTER_TOKEN_SECRET ||
    !env.RESEND_API_KEY ||
    !env.NEWSLETTER_FROM
  ) return json({ error: 'service unavailable' }, 503, cors);
  if (await ipRateLimited(env, request.headers.get('CF-Connecting-IP'))) {
    return json({ error: 'rate-limited' }, 429, cors);
  }
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'bad request' }, 400, cors); }
  if (!body || typeof body !== 'object') return json({ error: 'bad request' }, 400, cors);

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const emailValid = email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email);
  // Autofill can trip a visually hidden honeypot for a real person. Keep a
  // bounded, separately exported quarantine so the false positive is visible,
  // but never send mail or create a subscriber without a clean re-submission
  // followed by mailbox confirmation.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    if (emailValid && (await env.SUBSCRIBERS.get(`sub:${email}`)) === null) {
      await env.SUBSCRIBERS.put(
        `hp:${email}`,
        JSON.stringify({ ts: new Date().toISOString() }),
        { expirationTtl: QUARANTINE_TTL }
      );
    }
    return json({ ok: true, confirmationRequired: true }, 202, cors);
  }
  if (!emailValid) return json({ error: 'invalid email' }, 400, cors);

  // Enumeration-resistant and mailbomb-resistant: subscribed addresses and
  // recently sent confirmations produce the same generic response.
  if ((await env.SUBSCRIBERS.get(`sub:${email}`)) !== null) {
    return json({ ok: true, confirmationRequired: true }, 202, cors);
  }
  const emailKey = await keyedEmail(env, email);
  const sentKey = `sent:${emailKey}`;
  if ((await env.SUBSCRIBERS.get(sentKey)) !== null) {
    return json({ ok: true, confirmationRequired: true }, 202, cors);
  }

  const token = randomToken();
  const unsubscribeToken = randomToken();
  const tokenHash = await sha256(token);
  const pendingKey = `pending:${tokenHash}`;
  await env.SUBSCRIBERS.put(pendingKey, JSON.stringify({
    email,
    unsubscribeToken,
    requestedAt: new Date().toISOString(),
  }), { expirationTtl: CONFIRM_TTL });
  const confirmationUrl = `${new URL(request.url).origin}/confirm?token=${token}`;
  let sent = false;
  try {
    sent = await sendConfirmation(env, email, confirmationUrl, `blanc-confirm-${tokenHash}`);
  } catch { /* fail closed below */ }
  if (!sent) {
    await env.SUBSCRIBERS.delete(pendingKey);
    return json({ error: 'service unavailable' }, 503, cors);
  }
  await env.SUBSCRIBERS.put(sentKey, '1', { expirationTtl: EMAIL_RETRY_TTL });
  await env.SUBSCRIBERS.delete(`hp:${email}`);
  return json({ ok: true, confirmationRequired: true }, 202, cors);
}

const htmlResult = (title, message) => new Response(
  `<!doctype html><meta charset="utf-8"><title>${title}</title><h1>${title}</h1><p>${message}</p><p><a href="https://blancbrowser.com/">Return to Blanc</a></p>`,
  {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  }
);

async function handleConfirm(env, url) {
  const token = url.searchParams.get('token') ?? '';
  if (!TOKEN_RE.test(token)) return htmlResult('Confirmation unavailable', 'This confirmation link is invalid or expired.');
  const pendingKey = `pending:${await sha256(token)}`;
  const pending = await env.SUBSCRIBERS.get(pendingKey, { type: 'json' });
  if (!pending || typeof pending.email !== 'string' || !TOKEN_RE.test(pending.unsubscribeToken)) {
    return htmlResult('Confirmation unavailable', 'This confirmation link is invalid or expired.');
  }
  const ts = new Date().toISOString();
  const unsubscribeHash = await sha256(pending.unsubscribeToken);
  await Promise.all([
    env.SUBSCRIBERS.put(`sub:${pending.email}`, JSON.stringify({ ts, unsubscribeToken: pending.unsubscribeToken })),
    env.SUBSCRIBERS.put(`unsub:${unsubscribeHash}`, pending.email),
    env.SUBSCRIBERS.delete(pendingKey),
    env.SUBSCRIBERS.delete(`hp:${pending.email}`),
  ]);
  return htmlResult('Subscription confirmed', 'You will receive occasional Blanc release notes.');
}

async function handleUnsubscribe(env, url) {
  const token = url.searchParams.get('token') ?? '';
  if (!TOKEN_RE.test(token)) return htmlResult('Unsubscribe complete', 'No active subscription was found.');
  const key = `unsub:${await sha256(token)}`;
  const email = await env.SUBSCRIBERS.get(key);
  if (email) await Promise.all([env.SUBSCRIBERS.delete(`sub:${email}`), env.SUBSCRIBERS.delete(key)]);
  return htmlResult('Unsubscribe complete', 'The address has been removed from Blanc release notes.');
}

const authorized = (request, env) =>
  env.ADMIN_TOKEN && request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}`;

async function listSubscribers(env) {
  const subscribers = [];
  let cursor;
  do {
    const result = await env.SUBSCRIBERS.list({ prefix: 'sub:', cursor });
    for (const { name } of result.keys) {
      const record = await env.SUBSCRIBERS.get(name, { type: 'json' });
      const token = record?.unsubscribeToken;
      subscribers.push({
        email: name.slice(4),
        ts: record?.ts,
        unsubscribeUrl: TOKEN_RE.test(token ?? '')
          ? `https://blanc-newsletter.bnfy-441.workers.dev/unsubscribe?token=${token}`
          : null,
      });
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  subscribers.sort((a, b) => (a.ts < b.ts ? -1 : 1));

  const quarantined = [];
  cursor = undefined;
  do {
    const result = await env.SUBSCRIBERS.list({ prefix: 'hp:', cursor });
    for (const { name } of result.keys) {
      const record = await env.SUBSCRIBERS.get(name, { type: 'json' });
      quarantined.push({ email: name.slice(3), ts: record?.ts });
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  quarantined.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return json({ count: subscribers.length, subscribers, quarantined });
}

async function handleRemove(env, url) {
  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase();
  if (!email) return json({ error: 'email required' }, 400);
  const record = await env.SUBSCRIBERS.get(`sub:${email}`, { type: 'json' });
  const tokenHash = TOKEN_RE.test(record?.unsubscribeToken ?? '')
    ? await sha256(record.unsubscribeToken)
    : null;
  await Promise.all([
    env.SUBSCRIBERS.delete(`sub:${email}`),
    env.SUBSCRIBERS.delete(`hp:${email}`),
    tokenHash ? env.SUBSCRIBERS.delete(`unsub:${tokenHash}`) : Promise.resolve(),
  ]);
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/confirm' && request.method === 'GET') return handleConfirm(env, url);
    if (url.pathname === '/unsubscribe' && request.method === 'GET') return handleUnsubscribe(env, url);

    if (url.pathname === '/subscribe') {
      const cors = allowedCors(request);
      if (!cors) return json({ error: 'origin denied' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (request.method === 'POST') return handleSubscribe(request, env, cors);
    }
    if (url.pathname === '/subscribers' || url.pathname === '/subscriber') {
      if (!authorized(request, env)) return new Response('unauthorized', { status: 401 });
      if (request.method === 'GET' && url.pathname === '/subscribers') return listSubscribers(env);
      if (request.method === 'DELETE' && url.pathname === '/subscriber') return handleRemove(env, url);
    }
    return new Response('not found', { status: 404 });
  },
};
