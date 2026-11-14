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


test('a reloaded host leaves no click area, watch or pending card state', () => {
  const handler = between('class Handler : public content::WebUIMessageHandler', '\n};\n');
  const disallowed = handler.slice(handler.indexOf('  void OnJavascriptDisallowed() override {'));
  const body = disallowed.slice(0, disallowed.indexOf('\n  }\n'));
  assert.match(body, /hover_card_bounds = gfx::Rect\(\)/);
  assert.match(body, /thumbnail_watch\.reset\(\)/);
  assert.match(body, /rail_cards_shown = false/);
  assert.match(body, /thumbnail_requests_\.clear\(\)/);
  assert.match(source, /owner->vertical && owner->hover_card_bounds\.Intersects\(rect\)/);
});

test('a key or click in the page closes the rail cards', () => {
  const input = between('  void OnInputEvent(const content::RenderWidgetHost&,', '\n  }\n');
  assert.match(input, /rail_cards_shown/);
  assert.match(input, /BlancPrototypeHost\?\.railDismiss/);
  assert.match(handler('railCardsShown'), /rail_cards_shown = /);
  const host = fs.readFileSync(new URL('../blanc/island/host.js', import.meta.url), 'utf8');
  assert.ok(host.includes("'railCardsShown'") && /railDismiss: \(/.test(host));
});

test('a picture ahead of time: never private, never a quiet tab, a few at once', () => {
  const warm = handler('warmThumbnail');
  assert.match(warm, /ThumbnailHelperFor\(page\)/);
  const asleep = warm.indexOf('TabAsleep(page)');
  assert.ok(asleep > 0 && asleep < warm.indexOf('Subscribe()'), 'a quiet tab is refused before any subscription');
  assert.match(warm, /has_data\(\)/, 'a tab that has a picture is left alone');
  assert.match(warm, /thumbnail_warms_\.size\(\) >= kMaxThumbnailWarms/);
});
