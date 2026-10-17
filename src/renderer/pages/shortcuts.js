// The shortcut sections are rendered from the live application menu
// (pages:shortcuts:list), so they can never drift from the real bindings.
// SLASH_COMMANDS pairs each command's reference spelling with the catalog key
// of its description; copy:check holds it to copy/slash-commands.json.
const { t } = blancI18n;
const SLASH_COMMANDS = [
  ['/favorites', 'slash.favorites.hint'],
  ['/bring-tabs', 'slash.bringTabs.hint'],
  ['/save [folder]', 'slash.save.doc'],
  ['/history', 'slash.history.hint'],
  ['/downloads', 'slash.downloads.hint'],
  ['/settings', 'slash.settings.hint'],
  ['/sync', 'slash.sync.hint'],
  ['/clear', 'slash.clear.hint'],
  ['/new', 'slash.new.hint'],
  ['/private', 'slash.private.hint'],
  ['/close', 'slash.close.hint'],
  ['/reopen', 'slash.reopen.hint'],
  ['/pin', 'slash.pin.hint'],
  ['/mute', 'slash.mute.hint'],
  ['/sleep', 'slash.sleep.hint'],
  ['/rename [name]', 'slash.rename.doc'],
  ['/group <name>', 'slash.group.doc'],
  ['/ungroup', 'slash.ungroup.hint'],
  ['/close-group', 'slash.closeGroup.hint'],
  ['/find', 'slash.find.hint'],
  ['/block-ads', 'slash.blockAds.hint'],
  ['/allow-ads', 'slash.allowAds.hint'],
  ['/dark-site', 'slash.darkSite.hint'],
  ['/1password', 'slash.1password.hint'],
  ['/theme [system|light|dark]', 'slash.theme.doc'],
  ['/patron', 'slash.patron.hint'],
  ['/space', 'slash.space.hint'],
  ['/glance <text>', 'slash.glance.doc'],
  ['/invite', 'slash.invite.hint'],
];

/** One titled section of label/keys rows. */
function section(title, pairs) {
  const wrap = document.createElement('section');
  wrap.className = 'shortcut-section';
  const heading = document.createElement('h2');
  heading.className = 'section-title';
  heading.textContent = title;
  wrap.appendChild(heading);
  const list = document.createElement('div');
  list.className = 'shortcut-list';
  for (const [label, keys] of pairs) {
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    const name = document.createElement('span');
    name.textContent = label;
    const kbd = document.createElement('kbd');
    kbd.textContent = keys;
    kbd.dataset.i18nIgnore = ''; // key combinations and command syntax
    row.append(name, kbd);
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

(async () => {
  const response = await window.bowserPages.shortcuts.list();
  const rows = Array.isArray(response) ? response : (response.rows ?? []);
  const onePasswordAvailable = !Array.isArray(response) &&
    response.onePasswordAvailable === true;
  const byCategory = new Map();
  for (const row of rows) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category).push([row.label, row.keys]);
  }
  const root = document.getElementById('sections');
  for (const [title, pairs] of byCategory) root.appendChild(section(title, pairs));
  const slashCommands = SLASH_COMMANDS
    .filter(([cmd]) => onePasswordAvailable || cmd !== '/1password');
  root.appendChild(section(t('shortcuts.slashCommands'), [
    ...slashCommands.map(([cmd, key]) => [t(key), cmd]),
    // Bangs sit with the slash commands: both are typed into the same input.
    [t('shortcuts.bangs'), '!code words'],
  ]));
})();
