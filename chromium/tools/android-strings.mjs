// Writes Blanc for Android's interface strings from copy/messages (A1 plan,
// Task 3): one chromium/blanc/android/island/res/values*/blanc_strings.xml per
// language, holding only ANDROID_KEYS, named blanc_<key> so they never
// collide with Chromium's resources. --check fails when a file is stale.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// The file's text, or null if it isn't there: one read, so nothing can change between a check and it.
function readIfPresent(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

const chromium = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(chromium);
const RES = path.join(chromium, 'blanc/android/island/res');

// The iPhone Island's keys (ContentView.swift), shared so Android needs no new translations.
export const ANDROID_KEYS = [
  'ios.island.pageActions', 'ios.island.reload', 'ios.island.searchOrSwitch', 'ios.island.showAllTabs',
  'ios.island.stop', 'ios.palette.placeholder', 'ios.tabs.startPage', 'pagesNav.bookmarks', 'pagesNav.history', 'pill.private.chip',
  'pill.private.title', 'tab.new',
  // The Sunrise menu (A1 Task 7), with the iPhone's labels.
  'menu.newPrivateTab', 'share.picker.share', 'tabMenu.removeFavorite', 'tabMenu.saveFavorite',
  // A2's slash commands (SlashCommands.available()), the iPhone's hints.
  'slash.close.hint', 'slash.closeGroup.hint', 'slash.favorites.hint', 'slash.find.hint', 'slash.group.hint',
  'slash.history.hint', 'slash.new.hint', 'slash.private.hint', 'slash.reopen.hint', 'slash.theme.hint',
  'slash.ungroup.hint',
  // The palette (A2 Task 4).
  'group.fold', 'group.unfold', 'ios.island.collapse', 'ios.palette.clear', 'ios.palette.noCommand',
  'ios.palette.noMatches', 'ios.tabs.close', 'ios.tabs.openTabs', 'tab.untitled',
  // The tab grid (A2 Task 5).
  'groupMenu.close', 'groupMenu.colorLabel', 'groupMenu.colorNone', 'groupMenu.duplicate', 'groupMenu.nameLabel',
  'groupMenu.newTab', 'groupMenu.options', 'groupMenu.rename', 'groupMenu.ungroup', 'ios.tabs.switchTo', 'menu.undo',
  'settings.gesture.action.closeTab', 'sharedSpaces.cancel', 'spaces.color.clay', 'spaces.color.graphite',
  'spaces.color.iris', 'spaces.color.rose', 'spaces.color.sage', 'spaces.color.sand', 'spaces.color.sky',
  'spaces.color.slate', 'tabGroups.closedToast', 'tabMenu.duplicate', 'tabMenu.moveToGroup', 'tabMenu.mute',
  'tabMenu.newGroup', 'tabMenu.pin', 'tabMenu.removeFromGroup', 'tabMenu.unmute', 'tabMenu.unpin', 'tabs.closedToast',
  'ws.editor.done',
  // Find in page (A2 Task 6).
  'find.next', 'find.placeholder', 'find.prev', 'menu.findInPage',
  // Blocking (A3 Task 5), the iPhone's and desktop's words.
  'newtab.startup.failed', 'newtab.startup.retry', 'shield.adBlocking', 'shield.count.globalOff', 'shield.count.none',
  'shield.count.siteOff', 'slash.allowAds.hint', 'slash.blockAds.hint',
  // Sync (A4), with the iPhone's copy.
  'sync.error.localKeyUnlock', 'footer.devices', 'sends.section', 'sends.from', 'sends.dismiss', 'sends.sent',
  'sends.unavailable', 'sends.failed', 'slash.send.hint', 'ios.settings.shareTabs', 'ios.settings.shareTabsHelp',
  'tabMenu.sendToDevice',
  'ios.settings.connected', 'ios.settings.notConnected', 'ios.settings.status', 'ios.settings.account',
  'ios.settings.lastSynced', 'ios.settings.pairingCode', 'ios.settings.switchAccount', 'ios.settings.passphrase',
  'ios.settings.signIn', 'ios.settings.deviceName', 'ios.settings.saveName', 'ios.settings.saved',
  'ios.settings.disconnect', 'ios.settings.working', 'ios.settings.syncHelp', 'ios.settings.pairingHelp',
  'ios.settings.syncOffTitle', 'ios.settings.syncOffBody', 'ios.settings.pairWithBlanc', 'ios.settings.otherWays',
  'ios.settings.enterCode', 'ios.settings.usePassphrase', 'ios.settings.typeCodeShown', 'ios.settings.disconnectHelp',
  'settings.nav.sync', 'settings.sync.switch.connect', 'settings.sync.syncName', 'fill.setupEnable.cancelLabel',
  'settings.sync.syncNow', 'settings.sync.addAnotherDevice', 'settings.sync.recovery.copy', 'settings.sync.recovery.dialogMessage',
  'settings.sync.createOnComputer', 'settings.sync.pairing.instruction', 'shield.done', 'sync.error.badPassphrase',
  'sync.error.pairNotFound', 'sync.error.pairUnavailable', 'sync.error.pairInvalid', 'sync.error.rateLimited',
  'sync.error.offline', 'sync.error.server', 'sync.error.serverError', 'sync.error.syncOn',
  'sync.error.off', 'sync.error.credentialsSave', 'sync.error.accountGone', 'slash.sync.hint',
];
// ICU plurals, as Android <plurals>: the Island's tab count for TalkBack.
export const ANDROID_PLURALS = ['newtab.groups.count', 'shield.count.blocked', 'tabGroups.tucked', 'tabsMenu.header'];
export const LOCALES = [['en', 'values'], ['de', 'values-de'], ['es', 'values-es'], ['fr', 'values-fr'],
  ['it', 'values-it'], ['pt-BR', 'values-pt-rBR']];

export const resourceName = key =>
  'blanc_' + key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/\./g, '_').toLowerCase();

// Android string-resource text: {name} placeholders become %N$s in the order
// `names` gives; a literal % doubles only where the string takes arguments.
export function androidText(message, names) {
  let text = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
  if (names.length) text = text.replace(/%/g, '%%');
  text = text.replace(/\{([A-Za-z0-9_]+)\}/g, (m, name) => {
    const i = names.indexOf(name);
    if (i < 0) throw Error(`Unknown placeholder {${name}} in "${message}"`);
    return `%${i + 1}$s`;
  });
  return /^[@?]/.test(text) ? `\\${text}` : text;
}

// `{count, plural, one {# tab} other {# tabs}}` as an Android <plurals> entry.
export function androidPlural(message, name) {
  const body = /^\{\w+, plural,(.*)\}$/s.exec(message.trim());
  if (!body) throw Error(`Not a plural: "${message}"`);
  const items = [...body[1].matchAll(/(zero|one|two|few|many|other)\s*\{([^{}]*)\}/g)]
    .map(([, quantity, text]) => `        <item quantity="${quantity}">${androidText(text, []).replace(/#/g, '%d')}</item>`);
  if (!items.length) throw Error(`Not a plural: "${message}"`);
  return `    <plurals name="${name}">\n${items.join('\n')}\n    </plurals>`;
}

const read = locale => JSON.parse(fs.readFileSync(path.join(repo, 'copy/messages', `${locale}.json`), 'utf8'));

export function render(locale) {
  const english = read('en'), own = read(locale);
  const lines = ANDROID_KEYS.map(key => {
    const names = [...english[key].message.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(m => m[1]);
    const message = own[key]?.message;
    if (!message) throw Error(`${locale} lacks ${key}`);
    return `    <string name="${resourceName(key)}">${androidText(message, names)}</string>`;
  });
  for (const key of ANDROID_PLURALS) {
    const message = own[key]?.message;
    if (!message) throw Error(`${locale} lacks ${key}`);
    lines.push(androidPlural(message, resourceName(key)));
  }
  return `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by chromium/tools/android-strings.mjs from copy/messages; do not edit. -->\n<resources>\n${lines.join('\n')}\n</resources>\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [locale, dir] of LOCALES) {
    const file = path.join(RES, dir, 'blanc_strings.xml');
    const next = render(locale);
    const current = readIfPresent(file);
    if (current === next) continue;
    if (check) { stale.push(path.relative(repo, file)); continue; }
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, next);
  }
  if (stale.length) { console.error(`Stale Android strings: ${stale.join(', ')}. Run node chromium/tools/android-strings.mjs.`); process.exitCode = 1; }
}
