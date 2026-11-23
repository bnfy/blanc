// Starts the Android security clock (design §8.3): when Chrome stable for Android moves past the
// lane's pin, a fix must reach Play's production track within 7 days, or 72 hours when Google says
// an exploit exists in the wild. Run daily by .github/workflows/android-stable-watch.yml, which keeps
// one open issue per clock. Reads only public pages, with no credentials.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DAY = 24 * 3600 * 1000;
const RELEASES = 'https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Android&num=20';
const FEED = 'https://chromereleases.googleblog.com/feeds/posts/default?max-results=50';
const LABEL = 'android-security-clock';
const VERSION = /^\d+\.\d+\.\d+\.\d+$/;
const check = (value, message) => { if (!value) throw new Error(message); };

export function compareVersions(a, b) {
  check(VERSION.test(a) && VERSION.test(b), 'a Chrome version has four numbers');
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
const build = version => version.split('.').slice(0, 3).join('.');

const unescape = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
export function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => {
    const field = name => unescape(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(entry)?.[1] ?? '');
    const plain = html => unescape(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([.,&])/g, ' $1').trim();
    return { title: plain(field('title')), text: plain(field('content')) };
  });
}

// The clock runs from the first Android stable newer than the pin, and names the newest one.
export function watch({ pinned, releases, posts, now }) {
  check(Array.isArray(releases) && Array.isArray(posts), 'releases and posts must be lists');
  const newer = releases.filter(r => r?.channel === 'Stable' && r.platform === 'Android' && VERSION.test(r.version ?? '') && Number.isFinite(r.time) && compareVersions(r.version, pinned) > 0);
  if (!newer.length) return { newer: null };
  const latest = newer.reduce((a, b) => compareVersions(a.version, b.version) >= 0 ? a : b);
  const first = Math.min(...newer.map(r => r.time));
  const builds = new Set(newer.map(r => build(r.version)));
  const urgent = posts.some(p => /exists in the wild/i.test(p.text) && (p.text.match(/\d+\.\d+\.\d+\.\d+/g) ?? []).some(v => builds.has(build(v))));
  const due = first + (urgent ? 3 : 7) * DAY;
  return { newer: { version: latest.version, releasedAt: new Date(first).toISOString(), dueBy: new Date(due).toISOString(), urgent, overdue: now > due } };
}

export const issueTitle = ({ version, dueBy, urgent }) => `Android: Chrome ${version} is out${urgent ? ', exploited in the wild' : ''} (security clock due ${dueBy.slice(0, 10)})`;
function issueBody(pinned, newer) {
  return `Chrome stable for Android is at **${newer.version}**; Blanc for Android is pinned at ${pinned} (\`chromium/lanes/android.json\`).

- First Android stable newer than the pin: ${newer.releasedAt}
- Due on Play's production track by: **${newer.dueBy}** (${newer.urgent ? '72 hours: Google reports an exploit in the wild for this build' : '7 days'})${newer.overdue ? '\n- **Overdue.** Record the miss and its reason in `chromium/STATUS.md` (design §8.3).' : ''}

Rebase with \`docs/android/rebase.md\`, then ship the patch release as \`docs/android/channels.md\` describes. This issue closes itself when the pin reaches that version.`;
}

async function getJSON(url) { const r = await fetch(url, { redirect: 'follow' }); check(r.ok, `${url} answered ${r.status}`); return r.json(); }
async function getText(url) { const r = await fetch(url, { redirect: 'follow' }); check(r.ok, `${url} answered ${r.status}`); return r.text(); }
function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  check(!result.error && result.status === 0, `gh ${args[0]} ${args[1]} failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function main(argv) {
  const pinned = JSON.parse(fs.readFileSync(new URL('../../lanes/android.json', import.meta.url), 'utf8')).version;
  const result = watch({ pinned, releases: await getJSON(RELEASES), posts: parseFeed(await getText(FEED)), now: Date.now() });
  console.log(JSON.stringify({ pinned, ...result }, null, 2));
  if (!argv.includes('--issue')) return;
  gh(['label', 'create', LABEL, '--force', '--color', 'B60205', '--description', 'Blanc for Android security update clock']);
  const open = JSON.parse(gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number,title']));
  if (!result.newer) {
    for (const issue of open) gh(['issue', 'close', String(issue.number), '--comment', `The Android pin is at ${pinned}; the clock is met.`]);
    return;
  }
  const title = issueTitle(result.newer), body = issueBody(pinned, result.newer);
  if (open.length) gh(['issue', 'edit', String(open[0].number), '--title', title, '--body', body]);
  else gh(['issue', 'create', '--label', LABEL, '--title', title, '--body', body]);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch(error => { console.error(`Android stable watch: ${error.message}`); process.exitCode = 1; });
}
