// The hosts the server may answer for: site/public/bang-hosts.json as
// blanc.day serves it, so each release's re-pin and site deploy update the
// list with no Worker deploy. Kept in memory for ten minutes; a failed fetch
// throws and is never kept.

const KEEP_MS = 600000;
let kept = null;

/** The allowed hosts as a Set, from `env.HOSTS_URL`. */
export async function allowedHosts(env, fetchImpl = fetch) {
  if (kept && kept.url === env.HOSTS_URL && Date.now() - kept.at < KEEP_MS) return kept.hosts;
  const response = await fetchImpl(env.HOSTS_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`host list answered ${response.status}`);
  const list = await response.json();
  if (!Array.isArray(list?.hosts)) throw new Error('host list has no hosts');
  kept = { url: env.HOSTS_URL, at: Date.now(), hosts: new Set(list.hosts) };
  return kept.hosts;
}
