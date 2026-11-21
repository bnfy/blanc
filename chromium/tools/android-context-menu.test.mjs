import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {patchedChromiumFile} from './android-patched-file.mjs';
import {androidText, LOCALES, resourceName} from './android-strings.mjs';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const populator = patchedChromiumFile(
  'chrome/android/java/src/org/chromium/chrome/browser/contextmenu/ChromeContextMenuPopulator.java');
const menuItem = patchedChromiumFile(
  'chrome/android/java/src/org/chromium/chrome/browser/contextmenu/ChromeContextMenuItem.java');
const menu = populator.match(/public List<ModelList> buildContextMenu\(\) \{([\s\S]*?)\n    \}/)[1];
const itemNames = Array.from(menu.matchAll(/\bItem\.([A-Z_]+)/g), match => match[1]);
const overrideXml = directory =>
  read(`../blanc/android/res_chromium_strings/${directory}/blanc_chromium_strings.xml`);

test('only forced sign-in gates the menu on a fresh install', () => {
  const gate = populator.match(/private boolean areMandatoryFlowsCompleted\(Profile profile\) \{([\s\S]*?)\n    \}/)[1];
  assert.equal(gate.replace(/\/\/[^\n]*/g, '').trim(),
    'return !ForcedSigninStatusProvider.getForProfile(profile).isForcedSigninShowing();');
  const firstMinute = read('../blanc/android/java/src/org/chromium/blanc/firstrun/FirstMinute.java');
  assert.doesNotMatch(firstMinute, /FirstRunStatus|setFirstRunFlowComplete/);
  const target = read('../blanc/android/BUILD.gn').match(/android_library\("island_view_java"\) \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(target, /"\/\/chrome\/browser\/first_run\/android:java"/);
});

test('only tabs already in a non-private group offer to open a link in that group', () => {
  const compact = menu.replace(/\s+/g, '');
  assert.ok(compact.includes('TabsourceTab=getTab();booleancanOpenInExistingGroup='
    + '!mItemDelegate.isIncognito()&&sourceTab!=null&&sourceTab.getTabGroupId()!=null;'),
  'the source tab must exist, be non-private and already have a group ID');
  for (const [condition, item] of [
    ['canOpenInExistingGroup', 'createManagedListItem(Item.OPEN_IN_NEW_TAB_IN_GROUP,isIncognitoForced)'],
    ['canOpenInExistingGroup&&mItemDelegate.supportsOpenInNewTabInGroup()', 'createListItem(Item.OPEN_IN_NEW_TAB_IN_GROUP)'],
  ]) {
    assert.ok(compact.includes(`if(${condition}){linkGroup.add(${item});}`), `group action requires ${condition}`);
  }
  assert.equal(itemNames.filter(name => name === 'OPEN_IN_NEW_TAB_IN_GROUP').length, 2);
});

test('normal and Thin WebView link menus offer private tabs only when they stay in the same window', () => {
  const modes = menu.match(/if \(mMode == ContextMenuMode\.NORMAL\) \{([\s\S]*?)\} else if \(mMode == ContextMenuMode\.THIN_WEB_VIEW\) \{([\s\S]*?)\n                \}/);
  const privateTab = 'linkGroup.add(createListItem(Item.OPEN_IN_INCOGNITO_TAB));';
  const supported = '!mItemDelegate.isIncognito()&&mItemDelegate.isIncognitoSupported()&&!shouldOpenIncognitoAsWindow()';
  for (const [body, condition] of [
    [modes[1], supported],
    [modes[2], supported + '&&mItemDelegate.supportsOpenInNewIncognitoTab()'],
  ]) {
    assert.ok(body.replace(/\s+/g, '').includes(`if(${condition}){${privateTab}}`), condition);
  }
});

test('no menu mode offers a window action', async t => {
  await t.test('window actions and the private Custom Tab handoff never appear', () => {
    assert.deepEqual(itemNames.filter(name =>
      name.endsWith('_WINDOW') || name === 'OPEN_IN_CHROME_INCOGNITO_TAB'), []);
  });

  await t.test('Custom Tabs offer the regular handoff only when private tabs share the window', () => {
    const customTab = menu.match(/else if \(mMode == ContextMenuMode\.CUSTOM_TAB && !mItemDelegate\.isIncognito\(\)\) \{([\s\S]*?)\n                \}/)[1];
    assert.ok(customTab.replace(/\s+/g, '').includes(
      'if(isDefaultBrowser()&&addNewEntries){if(!shouldOpenIncognitoAsWindow()){'
      + 'items.add(0,createListItem(Item.OPEN_IN_NEW_CHROME_TAB));}}elseif('),
    'the default browser must guard its regular handoff without falling through to Open in browser');
    assert.equal(itemNames.filter(name => name === 'OPEN_IN_NEW_CHROME_TAB').length, 1);
  });
});

test('the menu offers open, preview, copy, share and download without image search, Lens or Gemini', () => {
  assert.deepEqual(itemNames.filter(name => /GOOGLE|LENS|GEMINI|^SEARCH_BY_IMAGE$/.test(name)), []);
  // Blanc for Android has no reading list to open what this would save.
  assert.ok(!itemNames.includes('READ_LATER'), 'no "Add to reading list"');

  const normalLink = menu.match(/if \(mMode == ContextMenuMode\.NORMAL\) \{([\s\S]*?)\} else if/)[1];
  assert.match(normalLink, /openInNewTabItem\s*=\s*createManagedListItem\(Item\.OPEN_IN_NEW_TAB,/);
  assert.ok(normalLink.includes('linkGroup.add(openInNewTabItem)'));
  assert.ok(normalLink.includes('linkGroup.add(createListItem(Item.OPEN_IN_INCOGNITO_TAB))'));

  for (const [group, items] of [
    ['linkGroup', ['OPEN_IN_EPHEMERAL_TAB', 'COPY_LINK_ADDRESS', 'COPY_LINK_TEXT', 'SHARE_LINK', 'SAVE_LINK_AS']],
    ['imageGroup', ['OPEN_IMAGE_IN_NEW_TAB', 'OPEN_IMAGE_IN_EPHEMERAL_TAB', 'COPY_IMAGE', 'SHARE_IMAGE', 'SAVE_IMAGE']],
    ['videoGroup', ['SAVE_VIDEO', 'COPY_VIDEO_FRAME', 'DOWNLOAD_VIDEO_FRAME', 'PICTURE_IN_PICTURE']],
  ]) {
    for (const item of items) {
      assert.match(menu, new RegExp(`${group}\\.add\\(\\s*create(?:Share)?ListItem\\(\\s*Item\\.${item}\\b`));
    }
    assert.ok(menu.includes(`groupedItems.add(${group})`));
  }
});

const labels = [
  ['OPEN_IN_INCOGNITO_TAB', 'android.contextMenu.privateTab'],
  ['OPEN_IN_NEW_CHROME_TAB', 'android.contextMenu.newBlancTab'],
  ['OPEN_IN_CHROME', 'mini.openInBlanc'],
];

test('tab and external open actions always use Blanc resource IDs, including when Chromium prefers windows', () => {
  const titles = menuItem.match(/int\[\] STRING_IDS = \{([\s\S]*?)\};/)[1];
  for (const [item, key] of labels) {
    assert.ok(titles.includes(`org.chromium.blanc.island.R.string.${resourceName(key)}, // Item.${item}:`), item);
    assert.ok(!menuItem.includes(`case Item.${item}:`), `${item} must use its mapped title`);
  }
});

test('menu labels come from the six Blanc catalogs and default to English for other languages', () => {
  for (const [locale, directory] of LOCALES) {
    const xml = read(`../blanc/android/island/res/${directory}/blanc_strings.xml`);
    const catalog = JSON.parse(read(`../../copy/messages/${locale}.json`));
    for (const [, key] of labels) {
      const title = catalog[key].message;
      assert.doesNotMatch(title, /Chrome|Chromium|Incognito/i);
      assert.ok(xml.includes(`<string name="${resourceName(key)}">${androidText(title, [])}</string>`), `${directory} needs ${key}`);
    }
  }
});

test('the Chromium overlay only supplies the Safety Hub summary', () => {
  for (const [, directory] of LOCALES) {
    assert.deepEqual(Array.from(overrideXml(directory).matchAll(/<string name="([^"]+)"/g), match => match[1]),
      ['safety_hub_autorevocation_toggle_summary'], directory);
  }
});

test('regional Chromium overrides match the base language for every string', () => {
  for (const [regional, base] of [
    ['values-en-rGB', 'values'], ['values-es-rUS', 'values-es'],
    ['values-fr-rCA', 'values-fr'], ['values-pt-rPT', 'values-pt-rBR'],
  ]) {
    const xml = overrideXml(base);
    assert.match(xml, /<string name="safety_hub_autorevocation_toggle_summary">/);
    assert.equal(overrideXml(regional), xml, regional);
  }
  assert.ok(!fs.existsSync(new URL('../blanc/android/res_chromium_strings/values-en-rXA', import.meta.url)));
});
