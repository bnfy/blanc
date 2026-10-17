const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// The website lists slash commands from copy/slash-commands.json, which runs
// ahead of the public release. A command the latest public release does not
// ship is held back in unreleased-slash-commands.json, and leaves that list
// once a release ships it (docs/marketing-claims.md).
test('the website lists only the slash commands the latest public release ships', async () => {
  const [latest] = JSON.parse(read('site/src/data/releases.json'));
  const shipped = JSON.parse(execFileSync('git', ['show', `${latest.tag}:copy/slash-commands.json`], { cwd: ROOT, encoding: 'utf8' }));
  const released = new Set(shipped.commands.map(entry => entry.command));
  const catalog = JSON.parse(read('copy/slash-commands.json')).commands.map(entry => entry.command);
  const unreleased = Object.keys(JSON.parse(read('site/src/data/unreleased-slash-commands.json')).commands);

  for (const command of catalog) {
    assert.ok(released.has(command) || unreleased.includes(command),
      `${command} is not in ${latest.tag}: add it to site/src/data/unreleased-slash-commands.json until a release ships it`);
  }
  for (const command of unreleased) {
    assert.ok(!released.has(command), `${command} shipped in ${latest.tag}: remove it from site/src/data/unreleased-slash-commands.json`);
    assert.ok(catalog.includes(command), `${command} is no longer in copy/slash-commands.json`);
  }

  const { releasedSlashCommands } = await import(pathToFileURL(path.join(ROOT, 'site/src/lib/released-slash-commands.mjs')).href);
  assert.deepEqual(releasedSlashCommands.map(entry => entry.command), catalog.filter(command => released.has(command)));
  // The registry lost its text to the interface catalog in F44, and the site
  // went on reading it from the registry: every hint on the page was blank.
  for (const entry of releasedSlashCommands) {
    assert.ok(entry.hint?.trim(), `${entry.command} has no hint`);
    if (entry.doc) assert.ok(entry.doc.hint?.trim(), `${entry.doc.command} has no description`);
  }
  for (const file of ['site/src/pages/features/command-palette.astro', 'site/src/components/guides/command-palette.astro']) {
    const source = read(file);
    assert.match(source, /releasedSlashCommands/, file);
    assert.doesNotMatch(source, /copy\/slash-commands\.json/, `${file} reads the working-tree catalog directly`);
  }
});
