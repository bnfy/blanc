'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// npm run site:whats-new drafts a release's What's New page from its release
// notes (site/scripts/whats-new-draft.mjs). A draft is a starting point only:
// its media stay a TODO that the shared validator rejects, and the owner signs
// off the final page.

const ROOT = path.join(__dirname, '../..');
const FIXTURE = path.join(ROOT, 'test/fixtures/whats-new-draft/releases.json');
const draft = () => import('../../site/scripts/whats-new-draft.mjs');
const lib = () => import('../../site/src/lib/whats-new.mjs');
const releases = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

const TOPICS = [
  { id: 'tab-groups', label: 'Named Groups', page: 'support' },
  { id: 'start-page', label: 'Start Page & Mahjong', page: 'support' },
  { id: 'sync', label: 'Sync', page: 'support' },
];
const FEATURE_PAGES = ['tab-groups', 'start-page'];
const CAPTURES = ['tab-group-colors-v1.38.0.webp', 'tab-group-colors-v1.38.0.png', 'start-page-color-v1.38.0.webp', 'bangs-v1.36.0.webp'];

// A throwaway site/ with the fixture releases and an empty What's New file.
function tempSite(whatsNew = { firstRelease: '2.1', noPage: [], pages: [] }) {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'whats-new-draft-'));
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(site, rel)), { recursive: true });
    fs.writeFileSync(path.join(site, rel), content);
  };
  write('src/data/releases.json', JSON.stringify(releases));
  write('src/data/guide-topics.json', JSON.stringify(TOPICS));
  write('src/data/whats-new.json', `${JSON.stringify(whatsNew, null, 2)}\n`);
  for (const page of FEATURE_PAGES) write(`src/pages/features/${page}.astro`, '');
  for (const file of CAPTURES) write(`public/feature-captures/${file}`, '');
  return site;
}
const readWhatsNew = (site) => JSON.parse(fs.readFileSync(path.join(site, 'src/data/whats-new.json'), 'utf8'));
const quiet = () => {};

test('only Added bullets that lead with a bold name become highlights', async () => {
  const { featureBullets } = await draft();
  assert.deepEqual(featureBullets(releases[0]), [
    { name: 'Tab group notes', text: 'Right-click a group\'s header and choose Add Note to keep a line of text with it.' },
    { name: 'Sunset wallpaper', text: 'the Start Page gains a sunset wallpaper.' },
  ]);
});

test('a draft draws its words only from the notes and guesses learnMore and captures', async () => {
  const { run } = await draft();
  const site = tempSite();
  const lines = [];
  run(['--release', '2.1'], { site, log: (line) => lines.push(line) });
  const [page] = readWhatsNew(site).pages;
  assert.equal(page.release, '2.1');
  assert.deepEqual(page.highlights.map((h) => [h.id, h.tile, h.title, h.body, h.learnMore]), [
    ['tab-group-notes', 'Tab group notes', 'Tab group notes', 'Right-click a group\'s header and choose Add Note to keep a line of text with it.', '/features/tab-groups'],
    ['sunset-wallpaper', 'Sunset wallpaper', 'Sunset wallpaper', 'the Start Page gains a sunset wallpaper.', '/features/start-page'],
  ]);
  assert.deepEqual(page.highlights[0].media.candidates, ['/feature-captures/tab-group-colors-v1.38.0.webp']);
  const out = lines.join('\n');
  assert.match(out, /\/feature-captures\/tab-group-colors-v1\.38\.0\.webp/);
  assert.match(out, /http:\/\/localhost:4321\/whats-new\/2\.1/);
  assert.match(out, /owner must explicitly sign off the final text and media/);
});

test('a draft marks its media as a TODO', async () => {
  const { run } = await draft();
  const { TODO_MEDIA_KIND } = await lib();
  const site = tempSite();
  run(['--release', '2.1'], { site, log: quiet });
  for (const h of readWhatsNew(site).pages[0].highlights) {
    assert.equal(h.media.kind, TODO_MEDIA_KIND);
    assert.equal(TODO_MEDIA_KIND, 'todo');
    assert.match(h.media.todo, /sign-off/);
  }
});

test('a draft fails validateWhatsNew until its media are filled', async () => {
  const { run } = await draft();
  const { validateWhatsNew } = await lib();
  const site = tempSite();
  const data = run(['--release', '2.1'], { site, log: quiet });
  const options = { publicDir: path.join(site, 'public') };
  const errors = validateWhatsNew(data, releases, options);
  assert.equal(errors.length, 2);
  for (const error of errors) assert.match(error, /media is still a TODO/);
  // The dev server's preview accepts the draft; nothing else does.
  assert.deepEqual(validateWhatsNew(data, releases, { ...options, allowDrafts: true }), []);

  data.pages[0].highlights[0].media = { kind: 'image', src: '/feature-captures/tab-group-colors-v1.38.0.webp', width: 1440, height: 900, alt: 'Alt.' };
  data.pages[0].highlights[1].media = { kind: 'image', src: '/feature-captures/start-page-color-v1.38.0.webp', width: 1440, height: 900, alt: 'Alt.' };
  assert.deepEqual(validateWhatsNew(data, releases, options), []);
});

test('the generator never overwrites a page; --force replaces only a draft', async () => {
  const { run } = await draft();
  const site = tempSite();
  run(['--release', '2.1'], { site, log: quiet });
  const drafted = fs.readFileSync(path.join(site, 'src/data/whats-new.json'), 'utf8');
  assert.throws(() => run(['--release', '2.1'], { site, log: quiet }), /never overwritten.*--force/);
  assert.equal(fs.readFileSync(path.join(site, 'src/data/whats-new.json'), 'utf8'), drafted);

  // A draft can be redrafted with --force.
  run(['--release', '2.1', '--force'], { site, log: quiet });
  assert.equal(readWhatsNew(site).pages.length, 1);

  // Once its media are chosen it is a finished page, safe even from --force.
  const data = readWhatsNew(site);
  for (const h of data.pages[0].highlights) h.media = { kind: 'demo', demo: 'spaces' };
  data.pages[0].highlights[0].title = 'Signed-off words';
  fs.writeFileSync(path.join(site, 'src/data/whats-new.json'), `${JSON.stringify(data, null, 2)}\n`);
  assert.throws(() => run(['--release', '2.1', '--force'], { site, log: quiet }), /finished page/);
  assert.equal(readWhatsNew(site).pages[0].highlights[0].title, 'Signed-off words');
});

test('the generator refuses a release without two named bullets, an unknown release, or a noPage one', async () => {
  const { run } = await draft();
  assert.throws(() => run(['--release', '2.0'], { site: tempSite(), log: quiet }), /needs 2.*noPage/);
  assert.throws(() => run(['--release', '9.9'], { site: tempSite(), log: quiet }), /not in releases\.json/);
  assert.throws(() => run(['--release', '2.1'], { site: tempSite({ firstRelease: '2.1', noPage: ['2.1'], pages: [] }), log: quiet }), /noPage/);
  assert.throws(() => run([], { site: tempSite(), log: quiet }), /Usage/);
});

test('draft ids stay unique across pages and the page sorts newest first', async () => {
  const { draftPage, addDraft } = await draft();
  const data = { firstRelease: '2.0', noPage: [], pages: [{ release: '2.0', highlights: [{ id: 'tab-group-notes' }] }] };
  const { page } = draftPage('2.1', releases, { data });
  assert.deepEqual(page.highlights.map((h) => h.id), ['tab-group-notes-2-1', 'sunset-wallpaper']);
  assert.deepEqual(addDraft(data, page).pages.map((p) => p.release), ['2.1', '2.0']);
});

test('the post-release runbooks run the What\'s New generator first', () => {
  for (const rel of ['CLAUDE.md', 'AGENTS.md', '.claude/skills/releasing-blanc/SKILL.md']) {
    const doc = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(doc, /npm run site:whats-new -- --release X\.Y/, rel);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['site:whats-new'], 'node site/scripts/whats-new-draft.mjs');
});
