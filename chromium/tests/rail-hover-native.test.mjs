// Rail hover previews, native side (docs/superpowers/specs/2026-11-14-rail-hover-previews-design.md):
// the rules that would cost most if lost. Source-level, no Chromium build;
// the syntax-only compile and the on-screen check cover the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../blanc/browser/ui/blanc_prototype_ui.cc', import.meta.url), 'utf8');
const between = (start, end) => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `missing ${end} after ${start}`);
  return source.slice(from, to);
};
const handler = name => between(`method == "${name}"`, '\n      return;\n    }\n');

test('a private tab never reaches its thumbnail', () => {
  const helper = between('ThumbnailTabHelper* ThumbnailHelperFor(', '\n}\n');
  const isPrivate = helper.indexOf('blanc::private_tabs::IsPrivateTab(contents)');
  assert.ok(isPrivate > 0 && isPrivate < helper.indexOf('ThumbnailTabHelper::From('), 'checked before the helper');
  assert.equal(source.split('ThumbnailTabHelper::From(').length - 1, 1, 'ThumbnailHelperFor is the only way in');
  for (const name of ['tabThumbnail', 'watchThumbnail']) assert.match(handler(name), /ThumbnailHelperFor\(/, name);
});

test('a quiet tab is never subscribed to', () => {
  const snapshot = handler('tabThumbnail');
  const asleep = snapshot.indexOf('TabAsleep(page)');
  assert.ok(asleep > 0 && asleep < snapshot.indexOf('Subscribe()'), 'tabThumbnail answers a quiet tab before subscribing');
  const watch = handler('watchThumbnail');
  assert.ok(watch.indexOf('TabAsleep(page)') < watch.indexOf('Subscribe()'), 'watchThumbnail refuses a quiet tab');
  assert.match(between('bool TabAsleep(', '\n}\n'), /DISCARDED[\s\S]*NeedsReload\(\)/, 'the snapshot\'s asleep rule');
});

test('the list card takes the pointer only while it shows', () => {
  const intersects = between('bool DoesIntersectRect(const views::View*, const gfx::Rect& rect) const override {', '\n  }\n');
  const check = intersects.indexOf('owner->hover_card_bounds.Intersects(rect)');
  assert.ok(check > 0 && check < intersects.indexOf('if (!owner->split_geometry.empty())'), 'before both branches');
  assert.match(handler('hoverCardBounds'), /owner->hover_card_bounds = gfx::Rect\(/);
});

test('the watch ends with its tab', () => {
  const changed = between('  void OnTabStripModelChanged(TabStripModel*, const TabStripModelChange& change,', '\n  }\n');
  assert.match(changed, /thumbnail_watch_tab[\s\S]*thumbnail_watch\.reset\(\)/);
  assert.match(handler('unwatchThumbnail'), /thumbnail_watch\.reset\(\)/);
});

