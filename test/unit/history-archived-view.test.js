'use strict';

// F52: the History sheet's Archived view and the /archive command. Structural
// checks on the files that must change together; the behavior is covered by
// spec/acceptance/tab-archive.feature (F52-8, F52-9).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (rel) => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');

test('pages:archive:* are handled only for the history host', () => {
  const pages = read('src/main/pages.js');
  for (const channel of ['list', 'restore', 'forget', 'clear']) {
    assert.match(pages, new RegExp(`handle\\('pages:archive:${channel}', 'history',`), channel);
  }
  const bridges = JSON.parse(read('browser-api/bridges.json'));
  const members = JSON.stringify(bridges);
  for (const channel of ['list', 'restore', 'forget', 'clear']) {
    assert.ok(members.includes(`"pages:archive:${channel}"`), `bridges.json lists pages:archive:${channel}`);
  }
});

test('the History page offers Visits and Archived views and a Clear Archive button', () => {
  const html = read('src/renderer/pages/history.html');
  assert.match(html, /id="viewVisits"[^>]*aria-pressed="true"/);
  assert.match(html, /id="viewArchived"[^>]*aria-pressed="false"/);
  assert.match(html, /id="clearArchive"/);
  const js = read('src/renderer/pages/history.js');
  assert.match(js, /new URLSearchParams\(location\.search\)\.get\('view'\) === 'archived'/);
  assert.match(js, /bowserPages\.archive\.restore\(/);
  assert.match(js, /bowserPages\.archive\.forget\(/);
  assert.match(js, /bowserPages\.archive\.clear\(/);
});

test('/archive opens the History sheet on its Archived view', () => {
  assert.match(read('src/renderer/overlay.js'),
    /\{ cmd: '\/archive', hint: blancI18n\.t\('slash\.archive\.hint'\), run: \(\) => window\.browserAPI\.openPage\('history', 'archived'\) \}/);
  assert.match(read('src/main/main.js'), /blanc:\/\/history\/\?view=archived/);
  assert.match(read('src/renderer/pages/shortcuts.js'), /\['\/archive', 'slash\.archive\.hint'\]/);
  assert.ok(JSON.parse(read('copy/slash-commands.json')).commands.some((c) => c.command === '/archive'));
});
