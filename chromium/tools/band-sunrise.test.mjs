// The launch Sunrise over the Island's band (shipping #1624): the page's
// launch Sunrise covers it with a flat animated sky, and the band, which
// otherwise continues the page's wallpaper, plays the same sky in step from
// when the page started it. These keep the pieces joined: the page marks the
// start, the adapter reports it, native passes a recent start through, and
// the host plays the page's own keyframes with its timing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const island = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../blanc/island');
const read = file => fs.readFileSync(path.join(island, file), 'utf8');
const frames = (css, name) => new RegExp(`@keyframes ${name} \\{(.*)\\}\\n`).exec(css)?.[1];

test('the band plays the page\'s own Sunrise keyframes, with its timing', () => {
  const page = read('pages/newtab-prototype.css');
  const host = read('host.css');
  assert.ok(frames(page, 'launch-sunrise-sky'));
  assert.equal(frames(host, 'band-sunrise-sky'), frames(page, 'launch-sunrise-sky'));
  assert.equal(frames(host, 'band-sunrise-out'), frames(page, 'launch-sunrise-out'));
  // 2.6s after 0.15s, with the same curve; the host sets the delay itself.
  assert.match(page, /animation-duration: 2\.6s;\s*animation-delay: 0\.15s;\s*animation-timing-function: cubic-bezier\(0\.33, 0, 0\.2, 1\);/);
  assert.match(host, /#bandSunrise \{[^}]*animation-duration: 2\.6s;[^}]*animation-timing-function: cubic-bezier\(0\.33, 0, 0\.2, 1\);/);
  assert.match(read('host.js'), /const SUNRISE_DELAY_MS = 150, SUNRISE_MS = 2600;/);
});

test('the page marks the Sunrise\'s start and end, and the adapter reports it', () => {
  const page = read('pages/newtab.js');
  const body = /function playLaunchSunrise\(\) \{([\s\S]*?)\n\}/.exec(page)?.[1] ?? '';
  assert.match(body, /document\.body\.dataset\.launchSunriseAt = String\(Date\.now\(\)\);\s*$/);
  assert.match(body, /const end = \(\) => \{[^}]*delete document\.body\.dataset\.launchSunriseAt;/);
  const adapter = read('pages/newtab-adapter.js');
  assert.match(adapter, /Number\(document\.body\.dataset\.launchSunriseAt\)/);
  assert.match(adapter, /out\.sunriseAt = sunriseAt/);
});

test('native passes only a recent whole start through, without refusing the wallpaper', () => {
  const cc = fs.readFileSync(path.join(island, '../browser/ui/blanc_prototype_ui.cc'), 'utf8');
  const handler = /method == "islandBackdrop"[\s\S]*?IslandBackdrop\(contents/.exec(cc)?.[0] ?? '';
  assert.match(handler, /number\(in\.Find\("sunriseAt"\), now - 10000, now \+ 1000\)/);
  assert.match(handler, /\*sunrise_at == std::floor\(\*sunrise_at\)\) spec->Set\("sunriseAt", \*sunrise_at\)/);
  // It's read after the spec is made, so a bad start never drops the spec.
  assert.ok(handler.indexOf('spec = base::DictValue()') < handler.indexOf('"sunriseAt"'));
});
