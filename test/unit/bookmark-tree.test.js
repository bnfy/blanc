const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  buildChromiumTree,
  buildNetscapeTree,
  extractSubtree,
  dedupeCandidatesByUrl,
  enforceCandidateCap,
  folderIdFromPath,
  normalizeUrl,
  DEFAULT_MAX_CANDIDATES,
} = require('../../src/main/bookmark-tree');

const NOW = Date.UTC(2026, 6, 30);
const fixture = (name) => fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'tab-import', name),
  'utf8',
);

test('normalizeUrl serializes valid http(s) URLs', () => {
  assert.equal(normalizeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(
    normalizeUrl('https://news.example.com/tech?q=a&b=1'),
    'https://news.example.com/tech?q=a&b=1',
  );
});

test('buildChromiumTree counts HTTP(S) only and builds folder hierarchy', () => {
  const tree = buildChromiumTree(JSON.parse(fixture('chromium-mini.json')), { now: NOW });
  assert.ok(tree.rootFolderIds.length >= 1);
  const barId = folderIdFromPath(['Bookmarks bar']);
  const bar = tree.folders.find((f) => f.folderId === barId);
  assert.ok(bar);
  assert.equal(bar.name, 'Bookmarks bar');
  assert.ok(bar.subtreeHttpCount >= 4);
  const resetId = folderIdFromPath(['Bookmarks bar', 'tab reset']);
  const reset = tree.folders.find((f) => f.folderId === resetId);
  assert.ok(reset);
  assert.equal(reset.httpCount, 1);
  assert.equal(reset.subtreeHttpCount, 4);
});

test('extractSubtree preserves folderPath and immediate-parent favorite folders', () => {
  const tree = buildChromiumTree(JSON.parse(fixture('chromium-mini.json')), { now: NOW });
  const resetId = folderIdFromPath(['Bookmarks bar', 'tab reset']);
  const { candidates } = extractSubtree(tree, resetId);
  const byUrl = new Map(candidates.map((c) => [c.url, c]));
  assert.equal(byUrl.get('https://github.com/org/repo').folderPath.join('/'), 'work/github.com');
  assert.equal(byUrl.get('https://github.com/org/repo').favoriteFolder, 'github.com');
  assert.equal(byUrl.get('https://hotels.example/').folderPath.join('/'), 'travel');
  assert.equal(byUrl.get('https://hotels.example/').favoriteFolder, 'travel');
  assert.deepEqual(byUrl.get('https://direct-in-root.example/').folderPath, []);
  assert.equal(byUrl.get('https://direct-in-root.example/').favoriteFolder, null);
});

test('extractSubtree preserves page/folder interleaving from the source tree', () => {
  const tree = buildChromiumTree({
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Bookmarks bar',
        children: [{
          type: 'folder',
          name: 'tab reset',
          children: [
            {
              type: 'folder',
              name: 'first folder',
              children: [{ type: 'url', name: 'First', url: 'https://first.example/' }],
            },
            { type: 'url', name: 'Middle', url: 'https://middle.example/' },
            {
              type: 'folder',
              name: 'last folder',
              children: [{ type: 'url', name: 'Last', url: 'https://last.example/' }],
            },
          ],
        }],
      },
    },
  }, { now: NOW });
  const resetId = folderIdFromPath(['Bookmarks bar', 'tab reset']);
  assert.deepEqual(
    extractSubtree(tree, resetId).candidates.map((candidate) => candidate.title),
    ['First', 'Middle', 'Last'],
  );
});

test('buildNetscapeTree matches nested folder paths for HTML exports', () => {
  const tree = buildNetscapeTree(fixture('netscape-mini.html'), { now: NOW });
  const resetId = folderIdFromPath(['Bookmarks bar', 'tab reset']);
  const { candidates } = extractSubtree(tree, resetId);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].url, 'https://hotels.example/stay');
  assert.deepEqual(candidates[0].folderPath, ['travel', 'hotels']);
  assert.equal(candidates[0].favoriteFolder, 'hotels');
});

test('dedupeCandidatesByUrl collapses exact URLs after normalization', () => {
  const { candidates, duplicateCount } = dedupeCandidatesByUrl([
    { url: 'https://github.com/org/repo', title: 'a' },
    { url: 'https://github.com/org/repo', title: 'b' },
    { url: 'https://hotels.example/', title: 'c' },
  ]);
  assert.equal(duplicateCount, 1);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].url, 'https://github.com/org/repo');
});

test('enforceCandidateCap rejects more than 500 deduplicated candidates', () => {
  const many = Array.from({ length: DEFAULT_MAX_CANDIDATES + 1 }, (_, i) => ({
    url: `https://example.com/${i}`,
  }));
  const capped = enforceCandidateCap(many);
  assert.equal(capped.ok, false);
  assert.equal(capped.count, DEFAULT_MAX_CANDIDATES + 1);
  const ok = enforceCandidateCap(many.slice(0, DEFAULT_MAX_CANDIDATES));
  assert.equal(ok.ok, true);
  assert.equal(ok.candidates.length, DEFAULT_MAX_CANDIDATES);
});

test('buildChromiumTree enforces node and depth limits', () => {
  const deep = {
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Bookmarks bar',
        children: [{ type: 'folder', name: 'a', children: [] }],
      },
    },
  };
  let node = deep.roots.bookmark_bar.children[0];
  for (let i = 0; i < 70; i += 1) {
    const child = { type: 'folder', name: `f${i}`, children: [] };
    node.children = [child];
    node = child;
  }
  assert.throws(
    () => buildChromiumTree(deep, { now: NOW, maxDepth: 64 }),
    /bookmarks-too-complex/,
  );
  assert.throws(
    () => buildChromiumTree(deep, { now: NOW, maxNodes: 1 }),
    /bookmarks-too-complex/,
  );
});

test('buildNetscapeTree counts folders and bookmarks and bounds nesting', () => {
  const twoNodes = [
    '<DL><p><DT><H3>root</H3><DL><p>',
    '<DT><A HREF="https://example.com/">Example</A>',
    '</DL><p></DL><p>',
  ].join('');
  assert.throws(
    () => buildNetscapeTree(twoNodes, { now: NOW, maxNodes: 1 }),
    /bookmarks-too-complex/,
  );

  const opens = Array.from(
    { length: 6 },
    (_, i) => `<DT><H3>folder ${i}</H3><DL><p>`,
  ).join('');
  const closes = '</DL><p>'.repeat(7);
  assert.throws(
    () => buildNetscapeTree(`<DL><p>${opens}${closes}`, { now: NOW, maxDepth: 4 }),
    /bookmarks-too-complex/,
  );
});

test('public folder projections omit bookmark payloads', () => {
  const tree = buildChromiumTree(JSON.parse(fixture('chromium-mini.json')), { now: NOW });
  for (const folder of tree.folders) {
    assert.equal('bookmarks' in folder, false);
    assert.equal('urls' in folder, false);
  }
  assert.deepEqual(Object.keys(tree), ['folders', 'rootFolderIds']);
  assert.equal('nodes' in tree, false);
  assert.equal(JSON.stringify(tree).includes('https://github.com/org/repo'), false);
  assert.ok(extractSubtree(tree, tree.rootFolderIds[0]).candidates.length > 0);
});
