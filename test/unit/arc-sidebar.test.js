const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_SPACE_TABS,
  parseArcSidebar,
  planArcSpacesImport,
  uniqueWorkspaceName,
} = require('../../src/main/arc-sidebar');

// Arc stores spaces and items as flat arrays alternating string ids and
// objects. These helpers build that shape so each test reads as a sidebar.
function sidebar({ spaces, items }) {
  const flat = (records) => records.flatMap((record) => [record.id, record]);
  return {
    sidebar: {
      containers: [
        { global: {} },
        { spaces: flat(spaces), items: flat(items), topAppsContainerIDs: [] },
      ],
    },
  };
}

const tab = (id, parentID, url, extra = {}) => ({
  id, parentID, childrenIds: [], title: null,
  data: { tab: { savedURL: url, savedTitle: `Saved ${id}` } }, ...extra,
});
const folder = (id, parentID, title, childrenIds) => ({
  id, parentID, childrenIds, title, data: { list: {} },
});
const container = (id, childrenIds, containerType = { spaceItems: { _0: 'space' } }) => ({
  id, parentID: null, childrenIds, title: null, data: { itemContainer: { containerType } },
});
const space = (id, title, pinnedId, todayId, extra = {}) => ({
  id, title,
  newContainerIDs: [{ pinned: {} }, pinnedId, { unpinned: { _0: { shared: {} } } }, todayId],
  ...extra,
});

function workSidebar() {
  return sidebar({
    spaces: [space('s-work', 'Work', 'p1', 't1')],
    items: [
      container('p1', ['tab-mail', 'f-eng']),
      tab('tab-mail', 'p1', 'https://mail.example.com/', { title: 'Inbox' }),
      folder('f-eng', 'p1', 'Engineering', ['tab-ci', 'f-nested']),
      tab('tab-ci', 'f-eng', 'https://ci.example.com/'),
      folder('f-nested', 'f-eng', 'Docs', ['tab-docs']),
      tab('tab-docs', 'f-nested', 'https://docs.example.com/'),
      container('t1', ['tab-news']),
      tab('tab-news', 't1', 'https://news.example.com/'),
    ],
  });
}

test('parses a Space into ordered pinned, foldered and Today tabs', () => {
  const parsed = parseArcSidebar(JSON.stringify(workSidebar()));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.spaces.length, 1);
  const [work] = parsed.spaces;
  assert.equal(work.name, 'Work');
  assert.equal(work.arcProfile, 'default');
  assert.deepEqual(work.tabs.map((t) => [t.url, t.section, t.folderKey]), [
    ['https://mail.example.com/', 'pinned', null],
    ['https://ci.example.com/', 'pinned', 'f-eng'],
    ['https://docs.example.com/', 'pinned', 'f-eng'],
    ['https://news.example.com/', 'today', null],
  ]);
  assert.deepEqual(work.folders, [{ key: 'f-eng', name: 'Engineering' }]);
  // A renamed tab keeps the user's title; otherwise Arc's saved title.
  assert.equal(work.tabs[0].title, 'Inbox');
  assert.equal(work.tabs[1].title, 'Saved tab-ci');
});

test('accepts the older containerIDs string markers', () => {
  const data = workSidebar();
  const record = data.sidebar.containers[1].spaces[1];
  delete record.newContainerIDs;
  record.containerIDs = ['pinned', 'p1', 'unpinned', 't1'];
  const parsed = parseArcSidebar(data);
  assert.equal(parsed.spaces[0].tabs.length, 4);
});

test('falls back to parentID order when childrenIds omits a child', () => {
  const data = workSidebar();
  const items = data.sidebar.containers[1].items;
  items.push('tab-late', tab('tab-late', 't1', 'https://late.example.com/'));
  const parsed = parseArcSidebar(data);
  assert.deepEqual(parsed.spaces[0].tabs.slice(-2).map((t) => t.url), [
    'https://news.example.com/',
    'https://late.example.com/',
  ]);
});

test('skips non-web tabs, notes and unknown items and counts them', () => {
  const parsed = parseArcSidebar(sidebar({
    spaces: [space('s', 'Mixed', 'p', 't')],
    items: [
      container('p', ['ok', 'file', 'note', 'easel']),
      tab('ok', 'p', 'https://ok.example.com/'),
      tab('file', 'p', 'file:///Users/me/secret.txt'),
      { id: 'note', parentID: 'p', childrenIds: [], title: 'Note', data: { arcDocument: {} } },
      { id: 'easel', parentID: 'p', childrenIds: [], title: 'Easel', data: { easel: {} } },
      container('t', []),
    ],
  }));
  assert.deepEqual(parsed.spaces[0].tabs.map((t) => t.url), ['https://ok.example.com/']);
  assert.equal(parsed.skippedCount, 3);
});

test('flattens split views into the surrounding section or folder', () => {
  const parsed = parseArcSidebar(sidebar({
    spaces: [space('s', 'Split', 'p', 't')],
    items: [
      container('p', []),
      container('t', ['split']),
      { id: 'split', parentID: 't', childrenIds: ['a', 'b'], title: null, data: { splitView: {} } },
      tab('a', 'split', 'https://a.example.com/'),
      tab('b', 'split', 'https://b.example.com/'),
    ],
  }));
  assert.deepEqual(parsed.spaces[0].tabs.map((t) => [t.url, t.section, t.folderKey]), [
    ['https://a.example.com/', 'today', null],
    ['https://b.example.com/', 'today', null],
  ]);
  assert.deepEqual(parsed.spaces[0].folders, []);
});

test('reads top-row Favorites once each and keeps them out of Spaces', () => {
  const data = workSidebar();
  const items = data.sidebar.containers[1].items;
  items.push(
    'fav', container('fav', ['fa', 'fb', 'fc'], { topApps: { _0: { default: {} } } }),
    'fa', tab('fa', 'fav', 'https://calendar.example.com/', { title: 'Calendar' }),
    'fb', tab('fb', 'fav', 'https://calendar.example.com/'),
    'fc', tab('fc', 'fav', 'javascript:alert(1)'),
  );
  const parsed = parseArcSidebar(data);
  assert.deepEqual(parsed.favorites, [{ url: 'https://calendar.example.com/', title: 'Calendar' }]);
  assert.equal(parsed.spaces[0].tabs.length, 4);
});

test('marks Spaces that use a separate Arc profile', () => {
  const parsed = parseArcSidebar(sidebar({
    spaces: [
      space('a', 'Home', 'pa', 'ta', { profile: { default: true } }),
      space('b', 'Client', 'pb', 'tb', { profile: { custom: { _0: { directoryBasename: 'Profile 1' } } } }),
    ],
    items: [container('pa', []), container('ta', []), container('pb', []), container('tb', [])],
  }));
  assert.deepEqual(parsed.spaces.map((s) => s.arcProfile), ['default', 'custom']);
  // The Arc profile directory name never leaves the parser.
  assert.equal(JSON.stringify(parsed).includes('Profile 1'), false);
});

test('rejects files that are not an Arc sidebar', () => {
  assert.deepEqual(parseArcSidebar('{not json'), { error: 'unreadable' });
  assert.deepEqual(parseArcSidebar({ roots: {} }), { error: 'not-arc' });
  assert.deepEqual(parseArcSidebar({ sidebar: { containers: [{ global: {} }] } }), { error: 'not-arc' });
});

test('survives cycles and refuses pathological depth', () => {
  const cyclic = parseArcSidebar(sidebar({
    spaces: [space('s', 'Loop', 'p', 't')],
    items: [
      container('p', ['f1']),
      folder('f1', 'p', 'One', ['f2']),
      folder('f2', 'f1', 'Two', ['f1', 'x']),
      tab('x', 'f2', 'https://x.example.com/'),
      container('t', []),
    ],
  }));
  assert.deepEqual(cyclic.spaces[0].tabs.map((t) => t.url), ['https://x.example.com/']);

  const items = [container('p', ['d0']), container('t', [])];
  for (let i = 0; i < 40; i += 1) {
    items.push(folder(`d${i}`, i ? `d${i - 1}` : 'p', `D${i}`, [`d${i + 1}`]));
  }
  const deep = parseArcSidebar(sidebar({ spaces: [space('s', 'Deep', 'p', 't')], items }));
  assert.deepEqual(deep, { error: 'too-complex' });
});

test('plans a workspace: pinned lead, folders become groups that keep their names, Today follows', () => {
  const { spaces } = parseArcSidebar(workSidebar());
  let n = 0;
  const plan = planArcSpacesImport({
    spaces,
    selectedSpaceIds: ['s-work'],
    randomId: () => `g${n += 1}`,
  });
  assert.equal(plan.planned.length, 1);
  const [{ name, capture, droppedCount }] = plan.planned;
  assert.equal(name, 'Work');
  assert.equal(droppedCount, 0);
  assert.deepEqual(capture.urls, [
    'https://mail.example.com/',
    'https://ci.example.com/',
    'https://docs.example.com/',
    'https://news.example.com/',
  ]);
  assert.deepEqual(capture.pinned, [true, false, false, false]);
  assert.deepEqual(capture.groups, [{ id: 'g1', name: 'Engineering', collapsed: false, color: null }]);
  assert.deepEqual(capture.groupIds, [null, 'g1', 'g1', null]);
  assert.equal(capture.meta.length, capture.urls.length);
  assert.deepEqual(capture.meta[0], { title: 'Inbox', favicon: null });
});

test('same-named folders share one group', () => {
  const { spaces } = parseArcSidebar(sidebar({
    spaces: [space('s', 'Dup', 'p', 't')],
    items: [
      container('p', ['f1', 'f2']),
      folder('f1', 'p', 'Reading', ['a']),
      folder('f2', 'p', 'reading ', ['b']),
      tab('a', 'f1', 'https://a.example.com/'),
      tab('b', 'f2', 'https://b.example.com/'),
      container('t', []),
    ],
  }));
  let n = 0;
  const [{ capture }] = planArcSpacesImport({
    spaces, selectedSpaceIds: ['s'], randomId: () => `g${n += 1}`,
  }).planned;
  assert.equal(capture.groups.length, 1);
  assert.equal(capture.groups[0].name, 'Reading', 'same-named folders share one group, first-seen case');
  assert.deepEqual(capture.groupIds, ['g1', 'g1']);
});

test('names avoid existing workspaces and untitled Spaces get stable names', () => {
  const { spaces } = parseArcSidebar(sidebar({
    spaces: [
      space('a', 'Work', 'pa', 'ta'),
      space('b', '', 'pb', 'tb'),
      space('c', null, 'pc', 'tc'),
    ],
    items: [
      container('pa', ['x']), tab('x', 'pa', 'https://x.example.com/'), container('ta', []),
      container('pb', ['y']), tab('y', 'pb', 'https://y.example.com/'), container('tb', []),
      container('pc', ['z']), tab('z', 'pc', 'https://z.example.com/'), container('tc', []),
    ],
  }));
  const plan = planArcSpacesImport({
    spaces,
    selectedSpaceIds: ['a', 'c'],
    existingWorkspaceNames: ['work', 'Work (Arc)'],
    randomId: () => 'g',
  });
  // "Space 2" even though the first untitled Space was not selected.
  assert.deepEqual(plan.planned.map((p) => p.name), ['Work (Arc 2)', 'Space 2']);
});

test('reports Spaces that do not fit or are empty instead of partially creating them', () => {
  const { spaces } = parseArcSidebar(sidebar({
    spaces: [space('a', 'A', 'pa', 'ta'), space('b', 'B', 'pb', 'tb'), space('e', 'E', 'pe', 'te')],
    items: [
      container('pa', ['x']), tab('x', 'pa', 'https://x.example.com/'), container('ta', []),
      container('pb', ['y']), tab('y', 'pb', 'https://y.example.com/'), container('tb', []),
      container('pe', []), container('te', []),
    ],
  }));
  const plan = planArcSpacesImport({
    spaces, selectedSpaceIds: ['a', 'b', 'e'], remainingSlots: 1, randomId: () => 'g',
  });
  assert.deepEqual(plan.planned.map((p) => p.sourceSpaceId), ['a']);
  assert.deepEqual(plan.noRoom, ['b']);
  assert.deepEqual(plan.empty, ['e']);
});

test('caps a Space at the tab limit and counts what was left out', () => {
  const ids = Array.from({ length: MAX_SPACE_TABS + 3 }, (_, i) => `t${i}`);
  const { spaces } = parseArcSidebar(sidebar({
    spaces: [space('s', 'Big', 'p', 'today')],
    items: [
      container('p', ids),
      ...ids.map((id) => tab(id, 'p', `https://example.com/${id}`)),
      container('today', []),
    ],
  }));
  const [{ capture, droppedCount }] = planArcSpacesImport({
    spaces, selectedSpaceIds: ['s'], randomId: () => 'g',
  }).planned;
  assert.equal(capture.urls.length, MAX_SPACE_TABS);
  assert.equal(droppedCount, 3);
});

test('uniqueWorkspaceName keeps suffixed names within the 60-character cap', () => {
  const long = 'x'.repeat(60);
  const name = uniqueWorkspaceName(long, new Set([long]));
  assert.equal(Array.from(name).length, 60);
  assert.ok(name.endsWith(' (Arc)'));
});
