#!/usr/bin/env node
// Watches Chrome's stable releases against the Chromium fork's pins and keeps one
// GitHub issue open per public lane that is behind (docs/chromium-updates.md).
//
//   node scripts/chromium-release-watch.mjs --desktop FILE --android FILE [--dry-run]
//
// FILE is a lane file (chromium/lanes/<lane>.json). The workflow passes the desktop
// lane from chromium/next, where desktop fork work lands, and the Android lane from
// main. --dry-run prints what it would do and touches no issue.
//
// The rule (owner, 2026-11-22, the Android lane's from design §8.3): a lane follows
// each Chrome stable release, milestone or security update, within 7 days of the first
// stable release newer than its pin, and within 72 hours when Google's release notes
// say a fixed flaw is exploited in the wild.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEADLINE_MS = 7 * DAY_MS;
export const EXPLOITED_DEADLINE_MS = 3 * DAY_MS;
export const LABEL = 'chromium-update';

// Platforms each lane ships on (chromiumdash names), the Chrome Releases blog post
// titles that announce their stable updates, and whether the lane is public yet. A
// lane that isn't public gets no issue: the rule applies from its first release.
export const LANES = {
  desktop: {
    platforms: ['Mac', 'Windows', 'Linux'],
    postTitle: /^Stable Channel Update for Desktop$/,
    public: true,
    name: 'Blanc Beta (Mac, Windows, Linux)',
  },
  android: {
    platforms: ['Android'],
    postTitle: /^Chrome for Android Update$/,
    public: false,
    name: 'Blanc for Android',
  },
};

export function parseVersion(text) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(text ?? '')) throw new Error(`Not a Chromium version: ${text}`);
  return text.split('.').map(Number);
}

export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

// The newest milestone whose scheduled stable date has passed. chromiumdash's Stable
// channel also lists Early Stable builds of the next milestone (159.0.8154.13 on
// 2026-11-18, three weeks before 159's stable date), which the public doesn't get yet.
export function currentStableMilestone(schedules, now) {
  const due = schedules
    .filter(s => Number.isInteger(s.mstone) && s.stable_date && Date.parse(`${s.stable_date}Z`) <= now)
    .map(s => s.mstone);
  if (!due.length) throw new Error('No milestone has reached its stable date.');
  return Math.max(...due);
}

// releases: chromiumdash Stable releases for the lane's platforms ({version, milestone, time}).
// exploitedVersions: versions whose release notes say a flaw is exploited in the wild.
export function assessLane({ pin, releases, milestone, exploitedVersions = [], now }) {
  const newer = releases
    .filter(r => r.milestone <= milestone && compareVersions(r.version, pin) > 0)
    .sort((a, b) => a.time - b.time);
  if (!newer.length) return { behind: false, pin };
  const target = newer.reduce((best, r) => (compareVersions(r.version, best.version) > 0 ? r : best)).version;
  const since = newer[0].time;
  const exploited = newer.filter(r => exploitedVersions.includes(r.version)).sort((a, b) => a.time - b.time);
  const deadlines = [since + DEADLINE_MS];
  if (exploited.length) deadlines.push(exploited[0].time + EXPLOITED_DEADLINE_MS);
  const deadline = Math.min(...deadlines);
  return {
    behind: true,
    pin,
    target,
    kind: parseVersion(target)[0] > parseVersion(pin)[0] ? 'milestone' : 'security update',
    since,
    exploited: [...new Set(exploited.map(r => r.version))],
    deadline,
    overdue: now > deadline,
  };
}

// Versions named by a matching post that also says an exploit exists in the wild.
export function exploitedFromFeed(xml, postTitle) {
  const found = new Set();
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry)?.[1]?.trim() ?? '';
    if (!postTitle.test(title) || !/exists? in the wild/i.test(entry)) continue;
    for (const [v] of entry.matchAll(/\b\d{3}\.\d+\.\d{4,5}\.\d+\b/g)) found.add(v);
  }
  return [...found];
}

const date = ms => new Date(ms).toISOString().replace(/:\d\d\.\d+Z$/, ' UTC').replace('T', ' ');

export const issueTitle = lane => `Chromium update due: ${LANES[lane].name}`;
export const targetMarker = target => `<!-- chromium-release-watch target=${target} -->`;

export function issueBody(lane, a) {
  const lines = [
    targetMarker(a.target),
    `The ${lane} lane is pinned to **${a.pin}**. Chrome stable is at **${a.target}** (a ${a.kind}).`,
    '',
    `- First stable release newer than the pin: ${date(a.since)}`,
    a.exploited.length
      ? `- **Google reports a flaw fixed in ${a.exploited.join(', ')} is exploited in the wild:** 72-hour deadline.`
      : '- No exploited-in-the-wild note in the release posts: 7-day deadline.',
    `- Deadline: **${date(a.deadline)}**${a.overdue ? ' (overdue)' : ''}`,
    '',
    'Move the pin as `docs/chromium-updates.md` describes. This issue closes itself once the lane file names the newest stable or later.',
  ];
  return lines.join('\n');
}

// What to do with the lane's open issue (or null) given the assessment.
export function decide(issue, a) {
  if (!a.behind) return issue ? { action: 'close' } : { action: 'none' };
  if (!issue) return { action: 'create' };
  if (!issue.body.includes(targetMarker(a.target))) return { action: 'update', comment: true };
  return { action: 'update', comment: false };
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const gh = args => execFileSync('gh', args, { encoding: 'utf8' });

function openIssue(title) {
  const list = JSON.parse(gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number,title,body', '--limit', '50']));
  return list.find(i => i.title === title) ?? null;
}

async function main(argv) {
  const opt = name => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dryRun = argv.includes('--dry-run');
  const now = Date.now();
  const feed = await getText('https://chromereleases.googleblog.com/feeds/posts/default?max-results=100');
  if (!dryRun) gh(['label', 'create', LABEL, '--color', 'B60205', '--description', 'A fork lane is behind Chrome stable', '--force']);
  for (const [lane, spec] of Object.entries(LANES)) {
    const file = opt(`--${lane}`);
    if (!file) throw new Error(`--${lane} FILE is required`);
    const pin = JSON.parse(readFileSync(file, 'utf8')).version;
    const releases = [];
    for (const platform of spec.platforms) {
      releases.push(...(await getJson(`https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=${platform}&num=40`)));
    }
    const milestones = [...new Set(releases.map(r => r.milestone))];
    const schedules = [];
    for (const m of milestones) schedules.push(...(await getJson(`https://chromiumdash.appspot.com/fetch_milestone_schedule?mstone=${m}`)).mstones);
    const milestone = currentStableMilestone(schedules, now);
    const a = assessLane({ pin, releases, milestone, exploitedVersions: exploitedFromFeed(feed, spec.postTitle), now });
    const summary = a.behind
      ? `${lane}: pin ${pin}, stable ${a.target} (${a.kind}), deadline ${date(a.deadline)}${a.overdue ? ' OVERDUE' : ''}${a.exploited.length ? `, exploited: ${a.exploited.join(', ')}` : ''}`
      : `${lane}: pin ${pin} is current with milestone ${milestone}`;
    if (!spec.public) {
      console.log(`${summary} (not public yet: no issue)`);
      continue;
    }
    const title = issueTitle(lane);
    const issue = dryRun ? null : openIssue(title);
    const { action, comment } = decide(issue, a);
    console.log(`${summary} -> ${action}${dryRun ? ' (dry run)' : ''}`);
    if (dryRun) continue;
    if (action === 'create') gh(['issue', 'create', '--title', title, '--label', LABEL, '--body', issueBody(lane, a)]);
    if (action === 'update') {
      gh(['issue', 'edit', String(issue.number), '--body', issueBody(lane, a)]);
      if (comment) gh(['issue', 'comment', String(issue.number), '--body', `Chrome stable moved to **${a.target}**. Deadline: **${date(a.deadline)}**.`]);
    }
    if (action === 'close') gh(['issue', 'close', String(issue.number), '--comment', `The ${lane} lane is at ${pin}, current with Chrome stable.`]);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
