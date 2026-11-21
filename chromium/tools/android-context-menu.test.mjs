import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {patchedChromiumFile} from './android-patched-file.mjs';
import {LOCALES} from './android-strings.mjs';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const populator = patchedChromiumFile(
  'chrome/android/java/src/org/chromium/chrome/browser/contextmenu/ChromeContextMenuPopulator.java');

test('FirstMinute opens the first-run gate for new and returning installs', () => {
  const firstMinute = read('../blanc/android/java/src/org/chromium/blanc/firstrun/FirstMinute.java');
  const start = firstMinute.match(/public static void start\([^)]*\) \{([\s\S]*?)\n    \}/)?.[1];
  // On the launch path itself, including when the walkthrough was completed in an older build.
  assert.match(start.replace(/\/\/[^\n]*/g, '').trimStart(),
    /^if \(!FirstRunStatus\.getFirstRunFlowComplete\(\)\) \{\s*FirstRunStatus\.setFirstRunFlowComplete\(true\);\s*\}/);
  assert.match(firstMinute, /import org\.chromium\.chrome\.browser\.firstrun\.FirstRunStatus;/);
  const target = read('../blanc/android/BUILD.gn').match(/android_library\("island_view_java"\) \{[\s\S]*?\n\}/)[0];
  assert.match(target, /"java\/src\/org\/chromium\/blanc\/firstrun\/FirstMinute\.java"/);
  assert.match(target, /"\/\/chrome\/browser\/first_run\/android:java"/);
});

test('the menu offers open, preview, copy, share and download without image search, Lens or Gemini', () => {
  const menu = populator.match(/public List<ModelList> buildContextMenu\(\) \{([\s\S]*?)\n    \}/)[1];
  const itemNames = Array.from(menu.matchAll(/\bItem\.([A-Z_]+)/g), match => match[1]);
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

test('tab, window and external open actions use Blanc’s labels in all six languages', () => {
  const labels = {
    contextmenu_open_in_incognito_tab: 'Open in private tab',
    contextmenu_open_in_incognito_window: 'Open in private window',
    contextmenu_open_in_new_chrome_tab: 'Open in new tab in Blanc',
    contextmenu_open_in_chrome_incognito_tab: 'Open in private tab in Blanc',
    contextmenu_open_in_chrome_window: 'Open in new window in Blanc',
    menu_open_in_chrome: 'Open in Blanc',
  };
  for (const [locale, directory] of LOCALES) {
    const xml = read(`../blanc/android/res_chromium_strings/${directory}/blanc_chromium_strings.xml`);
    for (const [id, english] of Object.entries(labels)) {
      const title = xml.match(new RegExp(`<string name="${id}">([^<]+)</string>`))?.[1];
      assert.ok(title, `${locale} needs ${id}`);
      assert.doesNotMatch(title, /Chrome|Chromium|Incognito/i);
      if (locale === 'en') assert.equal(title, english);
    }
  }
});
