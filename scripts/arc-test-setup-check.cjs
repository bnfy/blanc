#!/usr/bin/env node
'use strict';

// Checks the hand-built Arc test setup (docs/testing/arc-rich-test-setup.md)
// against a real StorableSidebar.json, read-only.
//
//   node scripts/arc-test-setup-check.cjs [sidebar.json] [--ids out.json]
//
// Only the three "Blanc Test …" Spaces are described: their folder names,
// custom tab names and example.com/.org paths are test data. Every other
// Space in the file is reported as a count and nothing more. --ids writes a
// SHA-256 prefix of each test item's Arc id, keyed by its sidebar path, so
// two computers' files can be compared without copying either one.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isDeepStrictEqual } = require('node:util');

const TEST_PREFIX = 'Blanc Test ';
const DEFAULT_MAC = path.join(os.homedir(), 'Library/Application Support/Arc/StorableSidebar.json');

// Expected tree, in Arc's sidebar order. tab: [path, customName?];
// folder: [name, children]; split: [panes]; note: a non-web item.
const tab = (p, name = null) => ({ kind: 'tab', path: p, name });
const folder = (name, children = []) => ({ kind: 'folder', name, children });
const split = (...panes) => ({ kind: 'split', children: panes });
const note = () => ({ kind: 'other' });

const EXPECTED = {
  'Blanc Test Nesting': {
    profile: 'default',
    pinned: [
      tab('example.com/p1', 'Custom pinned name'),
      tab('example.com/p2'),
      folder('Research', [
        tab('example.com/r1'),
        folder('Papers', [
          tab('example.com/r2'),
          folder('2026', [folder('Drafts', [tab('example.com/r3')])]),
        ]),
      ]),
      folder('Research', [tab('example.com/r4'), folder('Papers', [tab('example.com/r5')])]),
      folder('research', [tab('example.com/r6')]),
      folder('Clients', [folder('Active', [tab('example.com/c1')])]),
      folder('Clients / Active', [tab('example.com/c2')]),
      folder('Long folder name that runs well past forty characters', [
        folder('Another long nested folder name here', [tab('example.com/l1')]),
      ]),
      folder('Empty'),
      folder('Only empty inside', [folder('Empty child')]),
    ],
    today: [tab('example.com/t1'), tab('example.com/t2')],
  },
  'Blanc Test Splits': {
    profile: 'default',
    pinned: [
      split(tab('example.com/s1'), tab('example.com/s2')),
      folder('Split folder', [
        split(tab('example.com/s3'), tab('example.com/s4')),
        split(tab('example.com/s5'), tab('example.com/s6'), tab('example.com/s7')),
      ]),
      folder('Four pane', [
        split(tab('example.com/s8'), tab('example.com/s9'), tab('example.com/s10'), tab('example.com/s11')),
      ]),
      folder('Mixed', [
        tab('example.com/s12'),
        folder('Nested split', [split(tab('example.com/s13'), tab('example.com/s14'))]),
      ]),
      tab('example.com/r1'),
    ],
    today: [split(tab('example.com/s15'), tab('example.com/s16')), tab('example.com/s17'), note()],
  },
  'Blanc Test Profile': {
    profile: 'custom',
    pinned: [folder('Work', [tab('example.org/w1')]), tab('example.org/w2')],
    today: [tab('example.org/w3')],
    favorites: [tab('example.org/fav')],
  },
};

const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => isRecord(o) && Object.prototype.hasOwnProperty.call(o, k);
const idHash = (id) => crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 12);

function examplePath(raw) {
  try {
    const url = new URL(raw);
    if (!/^(www\.)?example\.(com|org|net)$/.test(url.hostname)) return '<not an example link>';
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return '<not a web link>';
  }
}

function readStable(file) {
  const before = fs.statSync(file);
  const text = fs.readFileSync(file, 'utf8');
  const after = fs.statSync(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error('Arc saved the file while it was being read; run the check again.');
  }
  return text;
}

function main() {
  const args = process.argv.slice(2);
  const idsAt = args.indexOf('--ids');
  const idsOut = idsAt >= 0 ? args.splice(idsAt, 2)[1] : null;
  const file = args[0] || DEFAULT_MAC;

  const data = JSON.parse(readStable(file));
  const container = (data?.sidebar?.containers || []).find((c) => isRecord(c) && Array.isArray(c.items));
  if (!container) throw new Error('Not an Arc sidebar file.');
  const items = new Map(container.items.filter(isRecord).map((it) => [it.id, it]));
  const kids = (it) => (Array.isArray(it?.childrenIds) ? it.childrenIds : []).filter((id) => items.has(id));
  const ids = {};

  // Keys use sidebar position, never Arc's ids, so both computers' files
  // produce the same keys for the same item.
  const describe = (id, where, index) => {
    const it = items.get(id);
    const d = isRecord(it.data) ? it.data : {};
    const at = `${where}/${index + 1}`;
    const children = (key) => kids(it).map((c, i) => describe(c, key, i));
    if (has(d, 'tab')) {
      const p = examplePath(d.tab.savedURL);
      const title = typeof it.title === 'string' ? it.title.trim() : '';
      const custom = title && title !== d.tab.savedTitle ? title : null;
      ids[`${at}:${p}`] = idHash(id);
      return { kind: 'tab', path: p, name: custom };
    }
    if (has(d, 'list')) {
      const name = (it.title || '').trim();
      ids[`${at}:[${name}]`] = idHash(id);
      return { kind: 'folder', name, children: children(`${at}:[${name}]`) };
    }
    if (has(d, 'splitView')) {
      ids[`${at}:split`] = idHash(id);
      return { kind: 'split', children: children(`${at}:split`) };
    }
    return { kind: 'other' };
  };

  const sectionIds = (space) => {
    const list = space.newContainerIDs || space.containerIDs || [];
    const out = { pinned: [], today: [] };
    for (let i = 0; i + 1 < list.length; i += 1) {
      const m = list[i];
      const key = m === 'pinned' || has(m, 'pinned') ? 'pinned' : m === 'unpinned' || has(m, 'unpinned') ? 'today' : null;
      if (key && typeof list[i + 1] === 'string') out[key].push(list[i + 1]);
    }
    return out;
  };

  const problems = [];
  const compare = (where, expected, actual) => {
    if (expected.length !== actual.length) {
      problems.push(`${where}: expected ${expected.length} items, found ${actual.length}`);
    }
    expected.forEach((e, i) => {
      const a = actual[i];
      const at = `${where} #${i + 1}`;
      if (!a) return;
      if (e.kind !== a.kind) { problems.push(`${at}: expected a ${e.kind}, found a ${a.kind}`); return; }
      if (e.kind === 'tab') {
        if (e.path !== a.path) problems.push(`${at}: expected ${e.path}, found ${a.path}`);
        if (e.name && e.name !== a.name) problems.push(`${at}: expected the custom name "${e.name}", found ${a.name ? `"${a.name}"` : 'none'}`);
      }
      if (e.kind === 'folder' && e.name !== a.name) problems.push(`${at}: expected folder "${e.name}", found "${a.name}"`);
      if (e.children) compare(e.kind === 'folder' ? `${where} > ${e.name}` : `${at} (split)`, e.children, a.children || []);
    });
  };

  const spaces = container.spaces.filter(isRecord);
  const testSpaces = spaces.filter((s) => typeof s.title === 'string' && s.title.startsWith(TEST_PREFIX));
  for (const [title, expected] of Object.entries(EXPECTED)) {
    const matches = testSpaces.filter((s) => s.title === title);
    if (matches.length !== 1) { problems.push(`${title}: expected one Space with this name, found ${matches.length}`); continue; }
    const space = matches[0];
    ids[`${title}`] = idHash(space.id);
    const profile = !has(space, 'profile') || space.profile?.default === true ? 'default' : 'custom';
    if (profile !== expected.profile) problems.push(`${title}: expected the ${expected.profile} Arc profile, found ${profile}`);
    const sections = sectionIds(space);
    for (const section of ['pinned', 'today']) {
      const actual = sections[section].flatMap((root) => kids(items.get(root))).map((c, i) => describe(c, `${title}/${section}`, i));
      compare(`${title} ${section}`, expected[section], actual);
    }
    if (expected.favorites) {
      const markers = container.topAppsContainerIDs || [];
      const rowIds = [];
      for (let i = 0; i + 1 < markers.length; i += 1) {
        // Arc can serialize identical profile fields in different key orders.
        if (isDeepStrictEqual(markers[i], space.profile) && typeof markers[i + 1] === 'string') rowIds.push(markers[i + 1]);
      }
      const row = rowIds.flatMap((id) => kids(items.get(id))).map((c, i) => describe(c, `${title}/favorites`, i));
      compare(`${title} favorites`, expected.favorites, row);
    }
  }

  const extraTest = testSpaces.filter((s) => !EXPECTED[s.title]).length;
  console.log(`Sidebar: ${spaces.length} Spaces (${testSpaces.length} test, ${spaces.length - testSpaces.length} other, not inspected)`);
  if (extraTest) console.log(`Note: ${extraTest} other Space(s) start with "${TEST_PREFIX}" and were ignored.`);
  if (problems.length) {
    console.log(`\n${problems.length} difference(s) from docs/testing/arc-rich-test-setup.md:`);
    for (const p of problems) console.log(`- ${p}`);
  } else {
    console.log('The test setup matches docs/testing/arc-rich-test-setup.md exactly.');
  }
  if (idsOut) {
    fs.writeFileSync(idsOut, `${JSON.stringify(ids, null, 1)}\n`, { mode: 0o600 });
    console.log(`Wrote ${Object.keys(ids).length} id hashes to ${idsOut}`);
  }
  process.exitCode = problems.length ? 1 : 0;
}

if (require.main === module) main();
module.exports = { EXPECTED };
