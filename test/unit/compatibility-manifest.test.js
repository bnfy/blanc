const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const original = JSON.parse(fs.readFileSync(path.join(root, 'docs/compatibility/manifest.json'), 'utf8'));
const checker = import('../../scripts/compatibility-check.mjs');
const copy = () => structuredClone(original);

test('current compatibility evidence validates every required platform/category independently', async () => {
  const { validateManifest, CATEGORIES, PLATFORMS } = await checker;
  const data = validateManifest(copy());
  assert.equal(data.scenarios.length, CATEGORIES.length * PLATFORMS.length);
});

const mutations = [
  ['wrong release tag', data => { data.release.tag = 'v1.21.0'; }, /immutable version/],
  ['wrong immutable source', data => { data.release.sha = 'a'.repeat(40); }, /immutable release/],
  ['publication from the wrong version', data => {
    data.release.publicationEvidence.path = 'docs/compatibility/manifest.json';
    data.release.publicationEvidence.commit = data.release.sha;
  }, /publication evidence must bind/],
  ['invalid calendar date', data => { data.generatedAt = '2026-02-30'; }, /calendar date/],
  ['future evidence date', data => { data.scenarios[0].evidenceDate = '2027-01-01'; }, /after generatedAt/],
  ['unknown category', data => { data.scenarios[0].category = 'invented'; }, /category is invalid/],
  ['combined platforms', data => { data.scenarios[0].os = 'macOS, Windows'; }, /one supported platform/],
  ['duplicate ID', data => { data.scenarios[1].id = data.scenarios[0].id; }, /duplicated/],
  ['missing platform coverage', data => { data.scenarios.pop(); }, /missing required category\/platform/],
  ['unknown result', data => { data.scenarios[0].result = 'probably'; }, /invalid result/],
  ['unknown classification', data => { data.scenarios[0].classification = 'probably'; }, /invalid result\/classification/],
  ['invented pass with no evidence', data => { data.scenarios[0].result = 'pass'; data.scenarios[0].evidence = []; }, /source AND recorded execution/],
  ['source-only pass', data => { data.scenarios[0].result = 'pass'; data.scenarios[0].evidence = data.scenarios[0].evidence.filter(ref => ref.kind === 'source'); }, /source AND recorded execution/],
  ['arbitrary HTTPS evidence', data => { data.scenarios[0].evidence = ['https://example.com/pass']; }, /kind is invalid/],
  ['uncommitted evidence', data => { data.scenarios[0].evidence[0].commit = 'main'; }, /full commit SHA/],
  ['path traversal', data => { data.scenarios[0].evidence[0].path = 'docs/../package.json'; }, /safe repository path/],
  ['missing evidence object', data => { data.scenarios[0].evidence[0].path = 'docs/does-not-exist.md'; }, /evidence is missing/],
  ['post-release source presented as release code', data => { data.scenarios[0].evidence[0].commit = data.release.publicationEvidence.commit; }, /source evidence must be at the release SHA/],
  ['execution without exact release identity', data => {
    data.scenarios[0].evidence.find(ref => ref.kind === 'execution').path = 'docs/compatibility/method.md';
  }, /execution evidence must identify/],
  ['unsupported disguised as supported', data => { data.scenarios[0].result = 'unsupported'; }, /explicit capability\/product classification/],
];
for (const [name, mutate, expected] of mutations) {
  test(`compatibility rejects ${name}`, async () => {
    const data = copy(); mutate(data);
    const { validateManifest } = await checker;
    assert.throws(() => validateManifest(data), expected);
  });
}

test('generated matrix exposes pinned references, dates and untested limitations', async () => {
  const { render } = await checker;
  const rendered = render(copy());
  assert.match(rendered, /Evidence date \| Pinned evidence/);
  assert.match(rendered, new RegExp(original.release.sha));
  const pinnedLinks = [...rendered.matchAll(/\]\((https:[^)\s]+)\)/g)]
    .map((match) => new URL(match[1]))
    .filter((url) => url.hostname === 'github.com' && /^\/bnfy\/blanc\/blob\/[a-f0-9]{40}\//.test(url.pathname));
  assert.ok(pinnedLinks.length > 0, 'expected commit-pinned github.com/bnfy/blanc links');
  assert.equal(rendered, fs.readFileSync(path.join(root, 'docs/compatibility/README.md'), 'utf8'));
  const special = copy(); special.scenarios[0].notes = 'one | two\nthree';
  assert.ok(render(special).includes('one \\| two three'));
});

test('v1.21 manifest and matrix remain byte-for-byte historical snapshots', () => {
  for (const name of ['manifest.json', 'README.md']) {
    const prior = execFileSync('git', ['show', `${original.release.sha}:docs/compatibility/${name}`], { cwd: root, encoding: 'utf8' });
    assert.equal(fs.readFileSync(path.join(root, 'docs/compatibility/releases/v1.21.0', name), 'utf8'), prior);
  }
});
