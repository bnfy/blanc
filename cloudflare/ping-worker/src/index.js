// Collector for Bowser's opt-in launch ping (see src/main/telemetry.js in
// the main repo). Tallies anonymous counts in Workers KV — no IPs, no
// persistent ids, no browsing data are ever stored.

const ALLOWED_PLATFORMS = new Set(['darwin', 'win32', 'linux']);

// Not atomic (KV has no increment primitive) — a handful of concurrent
// pings can undercount by a request or two. Fine here: nothing downstream
// needs an exact number, only the aggregate trend.
async function bump(kv, key) {
  const current = parseInt((await kv.get(key)) ?? '0', 10);
  await kv.put(key, String(current + 1));
}

function todayKey() {
  return `day:${new Date().toISOString().slice(0, 10)}`;
}

async function handlePing(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const version = typeof body.version === 'string' ? body.version.slice(0, 32) : 'unknown';
  const platform = ALLOWED_PLATFORMS.has(body.platform) ? body.platform : 'unknown';

  await Promise.all([
    bump(env.PINGS, 'total'),
    bump(env.PINGS, todayKey()),
    bump(env.PINGS, `version:${version}`),
    bump(env.PINGS, `platform:${platform}`),
  ]);

  return new Response(null, { status: 204 });
}

// GET /stats — bearer-token-gated readout so the counts are visible
// without opening the Cloudflare dashboard's KV browser.
async function handleStats(request, env) {
  if (request.headers.get('Authorization') !== `Bearer ${env.STATS_TOKEN}`) {
    return new Response('unauthorized', { status: 401 });
  }
  const { keys } = await env.PINGS.list();
  const stats = {};
  for (const { name } of keys) {
    stats[name] = parseInt((await env.PINGS.get(name)) ?? '0', 10);
  }
  return new Response(JSON.stringify(stats, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/ping') return handlePing(request, env);
    if (request.method === 'GET' && url.pathname === '/stats') return handleStats(request, env);
    return new Response('not found', { status: 404 });
  },
};
