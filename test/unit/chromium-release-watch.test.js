'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');
const watch = () => import(pathToFileURL(path.join(root, 'scripts', 'chromium-release-watch.mjs')).href);
const t = iso => Date.parse(iso);

// The real situation on 2026-11-22: the desktop pin is 158's first beta, 158 is
// stable, and 159 shows on the Stable channel only as an Early Stable build.
const releases = [
  { version: '159.0.8154.13', milestone: 159, time: t('2026-11-18T18:00:00Z') },
  { version: '157.0.8103.81', milestone: 157, time: t('2026-11-18T17:00:00Z') },
  { version: '158.0.8127.37', milestone: 158, time: t('2026-11-12T20:00:00Z') },
  { version: '158.0.8127.36', milestone: 158, time: t('2026-11-12T19:00:00Z') },
  { version: '158.0.8127.20', milestone: 158, time: t('2026-11-05T19:00:00Z') },
];
const now = t('2026-11-22T12:00:00Z');

test('compareVersions orders all four numbers', async () => {
  const { compareVersions } = await watch();
  assert.equal(compareVersions('158.0.8127.37', '158.0.8127.2'), 1);
  assert.equal(compareVersions('158.0.8127.2', '159.0.8154.13'), -1);
  assert.equal(compareVersions('158.0.8127.2', '158.0.8127.2'), 0);
  assert.throws(() => compareVersions('158.0', '158.0.8127.2'));
});

test('the current milestone ignores Early Stable builds of the next one', async () => {
  const { currentStableMilestone } = await watch();
  const schedules = [
    { mstone: 158, stable_date: '2026-11-17T00:00:00' },
    { mstone: 159, stable_date: '2026-12-08T00:00:00' },
  ];
  assert.equal(currentStableMilestone(schedules, now), 158);
  assert.equal(currentStableMilestone(schedules, t('2026-12-08T01:00:00Z')), 159);
});

test('a lane behind a security update gets 7 days from the first newer release', async () => {
  const { assessLane, DEADLINE_MS } = await watch();
  const a = assessLane({ pin: '158.0.8127.2', releases, milestone: 158, now });
  assert.equal(a.behind, true);
  assert.equal(a.target, '158.0.8127.37');
  assert.equal(a.kind, 'security update');
  assert.equal(a.since, t('2026-11-05T19:00:00Z'));
  assert.equal(a.deadline, t('2026-11-05T19:00:00Z') + DEADLINE_MS);
  assert.equal(a.overdue, true);
});

test('an exploited-in-the-wild fix shortens the deadline to 72 hours from its release', async () => {
  const { assessLane, EXPLOITED_DEADLINE_MS } = await watch();
  const a = assessLane({ pin: '158.0.8127.20', releases, milestone: 158, exploitedVersions: ['158.0.8127.36'], now: t('2026-11-13T00:00:00Z') });
  assert.deepEqual(a.exploited, ['158.0.8127.36']);
  assert.equal(a.deadline, t('2026-11-12T19:00:00Z') + EXPLOITED_DEADLINE_MS);
  assert.equal(a.overdue, false);
});

test('a lane on a newer milestone than stable is not behind', async () => {
  const { assessLane } = await watch();
  assert.equal(assessLane({ pin: '159.0.8154.13', releases, milestone: 158, now }).behind, false);
  assert.equal(assessLane({ pin: '158.0.8127.37', releases, milestone: 158, now }).behind, false);
});

test('a new milestone counts as a milestone', async () => {
  const { assessLane } = await watch();
  const later = [...releases, { version: '159.0.8154.40', milestone: 159, time: t('2026-12-08T18:00:00Z') }];
  const a = assessLane({ pin: '158.0.8127.37', releases: later, milestone: 159, now: t('2026-12-09T00:00:00Z') });
  assert.equal(a.target, '159.0.8154.40');
  assert.equal(a.kind, 'milestone');
  // The Early Stable 159.0.8154.13 counts once 159 is the stable milestone.
  assert.equal(a.since, t('2026-11-18T18:00:00Z'));
});

test('exploitedFromFeed reads only matching stable posts that say "in the wild"', async () => {
  const { exploitedFromFeed, LANES } = await watch();
  const feed = [
    '<entry><title type="text">Stable Channel Update for Desktop</title><content>158.0.8127.36/.37 ... Google is aware that an exploit for CVE-2026-1 exists in the wild. 158.0.8127.37</content></entry>',
    '<entry><title type="text">Chrome Beta for Desktop Update</title><content>159.0.8154.13 exists in the wild</content></entry>',
    '<entry><title type="text">Stable Channel Update for Desktop</title><content>158.0.8127.20 no exploit note</content></entry>',
  ].join('');
  assert.deepEqual(exploitedFromFeed(feed, LANES.desktop.postTitle).sort(), ['158.0.8127.36', '158.0.8127.37']);
});

test('decide creates, comments on a new target, and closes when current', async () => {
  const { decide, targetMarker } = await watch();
  const behind = { behind: true, target: '158.0.8127.37' };
  assert.deepEqual(decide(null, behind), { action: 'create' });
  assert.deepEqual(decide({ body: targetMarker('158.0.8127.36') }, behind), { action: 'update', comment: true });
  assert.deepEqual(decide({ body: targetMarker('158.0.8127.37') }, behind), { action: 'update', comment: false });
  assert.deepEqual(decide({ body: '' }, { behind: false }), { action: 'close' });
  assert.deepEqual(decide(null, { behind: false }), { action: 'none' });
});

test('the issue body names the pin, target and deadline', async () => {
  const { assessLane, issueBody } = await watch();
  const body = issueBody('desktop', assessLane({ pin: '158.0.8127.2', releases, milestone: 158, now }));
  assert.match(body, /pinned to \*\*158\.0\.8127\.2\*\*/);
  assert.match(body, /\*\*158\.0\.8127\.37\*\*/);
  assert.match(body, /\(overdue\)/);
  assert.match(body, /docs\/chromium-updates\.md/);
});

test('the workflow reads the desktop lane from chromium/next and runs daily', () => {
  const yml = fs.readFileSync(path.join(root, '.github', 'workflows', 'chromium-release-watch.yml'), 'utf8');
  assert.match(yml, /schedule:/);
  assert.match(yml, /origin\/chromium\/next:chromium\/lanes\/desktop\.json/);
  assert.match(yml, /issues: write/);
  assert.match(yml, /scripts\/chromium-release-watch\.mjs/);
});
