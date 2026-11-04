// The Island's Android strings come from copy/messages, never typed by hand:
// tools/android-strings.mjs writes one blanc_strings.xml per language, and
// --check fails when a committed file differs from what it would write.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ANDROID_KEYS, ANDROID_PLURALS, LOCALES, resourceName, androidText, androidPlural, render} from './android-strings.mjs';

const messages = locale => JSON.parse(fs.readFileSync(new URL(`../../copy/messages/${locale}.json`, import.meta.url)));

test('every key exists in every language', () => {
  for (const [locale] of LOCALES) for (const key of ANDROID_KEYS) assert.ok(messages(locale)[key]?.message, `${locale} lacks ${key}`);
});

test('resource names are prefixed and never collide', () => {
  assert.equal(resourceName('ios.island.searchOrSwitch'), 'blanc_ios_island_search_or_switch');
  assert.equal(resourceName('pill.private.chip'), 'blanc_pill_private_chip');
  assert.equal(new Set(ANDROID_KEYS.map(resourceName)).size, ANDROID_KEYS.length);
});

test('placeholders become positional and text is escaped for Android', () => {
  assert.equal(androidText('Search or switch tabs, {domain}', ['domain']), 'Search or switch tabs, %1$s');
  assert.equal(androidText("Don't & <stop> \"now\" 100%", []), "Don\\'t &amp; &lt;stop&gt; \\\"now\\\" 100%");
  assert.equal(androidText('{n}% done', ['n']), '%1$s%% done', 'a literal % doubles only where the string takes arguments');
  assert.equal(androidText('@home', []), '\\@home');
});

test('the Android folders follow Android\'s locale names', () => {
  assert.deepEqual(LOCALES.map(([, dir]) => dir), ['values', 'values-de', 'values-es', 'values-fr', 'values-it', 'values-pt-rBR']);
  assert.match(render('en'), /<string name="blanc_ios_island_reload">Reload page<\/string>/);
});

test('the committed files are current', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./android-strings.mjs', import.meta.url)), '--check'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
});

test('plurals become Android <plurals>, # as the count', () => {
  assert.equal(androidPlural('{count, plural, one {# tab} other {# tabs}}', 'blanc_tabs_menu_header'),
    '    <plurals name="blanc_tabs_menu_header">\n        <item quantity="one">%d tab</item>\n        <item quantity="other">%d tabs</item>\n    </plurals>');
  assert.match(androidPlural('{count, plural, one {# aba} many {# abas} other {# abas}}', 'x'), /quantity="many">%d abas</);
  assert.throws(() => androidPlural('{count} tabs', 'x'), /plural/);
});

test('the TalkBack tab count is in every language', () => {
  assert.ok(ANDROID_PLURALS.includes('tabsMenu.header'));
  for (const [locale] of LOCALES) assert.match(render(locale), /<plurals name="blanc_tabs_menu_header">/, locale);
});
