const assert = require('node:assert/strict');
const test = require('node:test');

const { EXPECTED, checkSidebar, parseArgs } = require('../../scripts/arc-test-setup-check.cjs');

// Builds a synthetic StorableSidebar.json from the checker's own EXPECTED
// tree, in Arc's alternating [id, object] layout. `mutate` edits the tree
// after it's built, by the item's test-data name or path.
let counter = 0;
const nextId = () => `ITEM-${String(counter += 1).padStart(4, '0')}`;

function buildSidebar(expected = EXPECTED) {
  counter = 0;
  const items = [];
  const byKey = new Map();
  const push = (item) => { items.push(item.id, item); return item; };
  const add = (node, parentID) => {
    const item = push({ id: nextId(), parentID, childrenIds: [], title: null, data: {}, createdAt: 0, originatingDevice: 'X' });
    if (node.kind === 'tab') {
      item.data = { tab: { savedURL: `https://${node.path}`, savedTitle: 'Example Domain' } };
      item.title = node.name;
      byKey.set(node.path, item);
    } else if (node.kind === 'folder') {
      item.data = { list: {} };
      item.title = node.name;
      if (!byKey.has(node.name)) byKey.set(node.name, item);
    } else if (node.kind === 'split') {
      item.data = { splitView: { layoutOrientation: 'horizontal' } };
    } else {
      item.data = { easel: {} };
    }
    for (const child of node.children || []) item.childrenIds.push(add(child, item.id));
    return item.id;
  };
  const root = (nodes) => {
    const item = push({ id: nextId(), parentID: null, childrenIds: [], title: null, data: { itemContainer: {} } });
    for (const node of nodes) item.childrenIds.push(add(node, item.id));
    return item.id;
  };
  const spaces = [];
  const topApps = [];
  for (const [title, spec] of Object.entries(expected)) {
    const profile = spec.profile === 'default'
      ? { default: true }
      : { custom: { _0: { directoryBasename: 'Profile 1', displayName: 'Blanc Test' } } };
    const pinned = root(spec.pinned);
    const today = root(spec.today);
    const space = { id: nextId(), title, profile, newContainerIDs: [{ pinned: {} }, pinned, { unpinned: { _0: { shared: {} } } }, today] };
    spaces.push(space.id, space);
    byKey.set(title, space);
    if (spec.favorites) {
      // Arc may serialize the same profile with its keys in another order.
      const reordered = spec.profile === 'default' ? profile
        : { custom: { _0: { displayName: 'Blanc Test', directoryBasename: 'Profile 1' } } };
      topApps.push(reordered, root(spec.favorites));
    }
  }
  const data = { version: 1, sidebar: { containers: [{ global: {} }, { spaces, items, topAppsContainerIDs: topApps }] } };
  return { data, byKey, items };
}

test('a sidebar built from EXPECTED passes with no differences', () => {
  const { data } = buildSidebar();
  const result = checkSidebar(data);
  assert.deepEqual(result.problems, []);
  assert.equal(result.spaceCount, 3);
  assert.equal(result.testSpaceCount, 3);
  assert.equal(result.ids['Blanc Test Nesting/pinned/3:[Research]/1:example.com/r1'].length, 12);
});

test('id hashes are keyed by sidebar position, never by Arc id', () => {
  const a = checkSidebar(buildSidebar().data).ids;
  counter = 500; // a second computer with entirely different item ids
  const { data } = buildSidebar();
  const b = checkSidebar(data).ids;
  assert.deepEqual(Object.keys(a), Object.keys(b));
  assert.ok(Object.values(a).every((hash) => /^[0-9a-f]{12}$/.test(hash)));
});

test('a renamed folder is reported as exactly one difference', () => {
  const { data, byKey } = buildSidebar();
  byKey.get('Empty child').title = 'Renamed';
  const { problems } = checkSidebar(data);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Only empty inside #1: expected folder "Empty child", found "Renamed"/);
});

test('a custom name on a tab the checklist leaves unnamed is a difference', () => {
  const { data, byKey } = buildSidebar();
  byKey.get('example.com/p2').title = 'Oops, renamed';
  const { problems } = checkSidebar(data);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /example\.com\/p2.*no custom name.*"Oops, renamed"/);
});

test('a child attached only through parentID still counts, as in the importer', () => {
  const { data, byKey } = buildSidebar();
  const research = byKey.get('research');
  const r6 = byKey.get('example.com/r6');
  research.childrenIds = research.childrenIds.filter((id) => id !== r6.id);
  assert.equal(r6.parentID, research.id);
  assert.deepEqual(checkSidebar(data).problems, []);
});

test('a childrenIds cycle neither crashes nor loops', () => {
  const { data, byKey } = buildSidebar();
  const empty = byKey.get('Empty');
  empty.childrenIds = [empty.parentID];
  let result;
  assert.doesNotThrow(() => { result = checkSidebar(data); });
  assert.ok(result.problems.length >= 1);
});

test('an item with `tab: null` is reported, not a crash', () => {
  const { data, byKey } = buildSidebar();
  byKey.get('example.com/t2').data = { tab: null };
  let result;
  assert.doesNotThrow(() => { result = checkSidebar(data); });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /today #2: expected a tab, found a/);
});

test('a missing test Space is reported by name and the others still checked', () => {
  const { data } = buildSidebar();
  const container = data.sidebar.containers[1];
  const profileSpace = container.spaces.find((s) => s && s.title === 'Blanc Test Profile');
  profileSpace.title = 'Blanc Test Profil';
  const { problems, extraTestCount } = checkSidebar(data);
  assert.deepEqual(problems, ['Blanc Test Profile: expected one Space with this name, found 0']);
  assert.equal(extraTestCount, 1);
});

test('spaces outside the test prefix are only counted', () => {
  const { data } = buildSidebar();
  const container = data.sidebar.containers[1];
  container.spaces.push('OTHER', { id: 'OTHER', title: 'Personal secrets', profile: { default: true }, newContainerIDs: [] });
  const result = checkSidebar(data);
  assert.deepEqual(result.problems, []);
  assert.equal(result.spaceCount, 4);
  assert.equal(result.testSpaceCount, 3);
  assert.ok(!JSON.stringify(result.ids).includes('Personal secrets'));
});

test('parseArgs refuses --ids without a path and keeps the sidebar path either side of it', () => {
  assert.deepEqual(parseArgs(['--ids', 'out.json', 'sidebar.json']), { file: 'sidebar.json', idsOut: 'out.json' });
  assert.deepEqual(parseArgs(['sidebar.json', '--ids', 'out.json']), { file: 'sidebar.json', idsOut: 'out.json' });
  assert.throws(() => parseArgs(['sidebar.json', '--ids']), /--ids needs a file path/);
});
