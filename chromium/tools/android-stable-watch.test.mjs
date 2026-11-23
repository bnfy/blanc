import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, parseFeed, watch, issueTitle } from '../android/release/stable-watch.mjs';

const day = 24 * 3600 * 1000, t0 = Date.parse('2026-11-20T18:00:00Z');
const release = (version, time) => ({ channel: 'Stable', platform: 'Android', version, time });
const post = (title, text) => ({ title, text });

test('versions compare by number, not as text', () => {
  assert.ok(compareVersions('156.0.8078.100', '156.0.8078.79') > 0);
  assert.ok(compareVersions('157.0.8103.1', '156.0.9999.999') > 0);
  assert.equal(compareVersions('156.0.8078.79', '156.0.8078.79'), 0);
  assert.throws(() => compareVersions('156.0.8078', '156.0.8078.79'), /version/);
});

test('nothing newer than the pin means no clock', () => {
  assert.deepEqual(watch({ pinned: '156.0.8078.79', releases: [release('156.0.8078.79', t0), release('155.0.7000.1', t0 - 9 * day)], posts: [], now: t0 }), { newer: null });
});

test('a newer stable starts a 7-day clock from the first release newer than the pin', () => {
  const releases = [release('156.0.8078.120', t0), release('156.0.8078.100', t0 - 2 * day), release('156.0.8078.79', t0 - 9 * day)];
  assert.deepEqual(watch({ pinned: '156.0.8078.79', releases, posts: [post('Chrome for Android Update', 'Stability fixes.')], now: t0 }), { newer: {
    version: '156.0.8078.120', releasedAt: new Date(t0 - 2 * day).toISOString(), dueBy: new Date(t0 + 5 * day).toISOString(), urgent: false, overdue: false,
  } });
});

test('an exploit in the wild for that build makes it 72 hours', () => {
  const releases = [release('156.0.8078.120', t0)];
  const posts = [post('Stable Channel Update for Desktop', 'The Stable channel has been updated to 156.0.8078.118/.119. Google is aware that an exploit for CVE-2026-0001 exists in the wild.')];
  const { newer } = watch({ pinned: '156.0.8078.79', releases, posts, now: t0 });
  assert.equal(newer.urgent, true); assert.equal(newer.dueBy, new Date(t0 + 3 * day).toISOString());
  // Another build's exploit doesn't count.
  const other = [post('Stable Channel Update for Desktop', 'Updated to 155.0.7000.5. An exploit for CVE-2026-0002 exists in the wild.')];
  assert.equal(watch({ pinned: '156.0.8078.79', releases, posts: other, now: t0 }).newer.urgent, false);
});

test('a clock past its due date is overdue, and an older listing first is ignored', () => {
  const releases = [release('156.0.8078.79', t0), release('156.0.8078.90', t0 - 10 * day)];
  const { newer } = watch({ pinned: '156.0.8078.79', releases, posts: [], now: t0 });
  assert.equal(newer.version, '156.0.8078.90'); assert.equal(newer.overdue, true);
});

test('non-stable or non-Android rows are ignored, and malformed input is refused', () => {
  assert.deepEqual(watch({ pinned: '156.0.8078.79', releases: [{ ...release('157.0.1.1', t0), channel: 'Beta' }, { ...release('157.0.1.1', t0), platform: 'Windows' }], posts: [], now: t0 }), { newer: null });
  assert.throws(() => watch({ pinned: '156.0.8078.79', releases: {}, posts: [], now: t0 }), /releases/);
});

test('the Chrome Releases Atom feed parses into titles and plain text', () => {
  const xml = "<feed><entry><title type='text'>Chrome for Android Update</title><content type='html'>Updated to &lt;b&gt;159.0.8154.18&lt;/b&gt; &amp;amp; exists in the wild</content></entry><entry><title>B</title><content>x</content></entry></feed>";
  assert.deepEqual(parseFeed(xml), [{ title: 'Chrome for Android Update', text: 'Updated to 159.0.8154.18 & exists in the wild' }, { title: 'B', text: 'x' }]);
});

test('the issue title names the version and the due date', () => {
  assert.equal(issueTitle({ version: '159.0.8154.18', dueBy: '2026-11-27T18:00:00.000Z', urgent: false }), 'Android: Chrome 159.0.8154.18 is out (security clock due 2026-11-27)');
  assert.equal(issueTitle({ version: '159.0.8154.18', dueBy: '2026-11-23T18:00:00.000Z', urgent: true }), 'Android: Chrome 159.0.8154.18 is out, exploited in the wild (security clock due 2026-11-23)');
});
