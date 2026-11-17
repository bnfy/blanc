// F63: the nested Favorites menu and `/save` with a folder path.
const assert = require('node:assert');
const { Given, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('./../support/poll');

Given('a favorite for {string} titled {string} in {string}', async function (url, title, folder) {
  await this.call('saveFavoriteTo', url, title, folder);
});

Given('a favorite for {string} titled {string} in no folder', async function (url, title) {
  await this.call('saveFavoriteTo', url, title, null);
});

/** The Favorites menu's entries after Add All Open Tabs and the separator
 * below it, up to the separator above Show Favorites. The menu is rebuilt
 * on a timer, so this waits for `ready` to hold. */
async function favoritesEntries(world, ready) {
  return waitForValue(async () => {
    const outline = await world.call('favoritesMenuOutline');
    if (!outline) return null;
    const first = outline.indexOf('—');
    const last = outline.lastIndexOf('—');
    return last > first ? outline.slice(first + 1, last) : [];
  }, (entries) => !!entries && ready(entries), 'the Favorites menu to show the favorites');
}

const labelOf = (entry) => (typeof entry === 'string' ? entry : Object.keys(entry)[0]);

Then('the Favorites menu holds {string}, then a separator, then {string}', async function (folder, favorite) {
  const entries = await favoritesEntries(this, (list) => list.map(labelOf).includes(favorite));
  assert.deepStrictEqual(entries.map(labelOf), [folder, '—', favorite]);
});

Then("the Favorites menu's {string} submenu holds {string} with {string} in it", async function (folder, child, favorite) {
  const entries = await favoritesEntries(this, (list) => list.some((entry) => labelOf(entry) === folder));
  const top = entries.find((entry) => labelOf(entry) === folder)[folder];
  assert.deepStrictEqual(top, [{ [child]: [favorite] }]);
});

Then('{string} is a favorite in {string}', async function (name, folder) {
  const url = this.fixtureUrl(name);
  const record = await waitForValue(
    async () => (await this.call('bookmarkRecords')).find((r) => r.url === url),
    (found) => found?.folder === folder,
    `${name} to be a favorite in ${folder}`,
  );
  assert.strictEqual(record.folder, folder);
});
