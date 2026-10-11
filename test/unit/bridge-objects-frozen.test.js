'use strict';

// contextBridge hands renderers frozen copies of window.bowserPages,
// window.browserAPI and window.blancFillStatus. Assigning to a member is a
// silent no-op in sloppy code and a TypeError in strict code, so neither can
// ever wrap or replace a bridge method. Bring Your Tabs once "wrapped"
// surface.close this way and the wrapper never ran.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const BRIDGES = '(?:bowserPages|browserAPI|blancFillStatus)';

function rendererScripts() {
  const dirs = ['src/renderer', 'src/renderer/pages'];
  return dirs.flatMap((dir) => fs.readdirSync(path.join(root, dir))
    .filter((name) => name.endsWith('.js') && !/^strings\./.test(name))
    .map((name) => path.join(dir, name)));
}

const stripComments = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

function bridgeAssignments(source) {
  const js = stripComments(source);
  const problems = [];
  // window.bowserPages.x = …, window.browserAPI.x.y = …
  const direct = new RegExp(String.raw`window\.${BRIDGES}(?:\??\.\w+)+\s*=(?!=)`, 'g');
  for (const m of js.matchAll(direct)) problems.push(m[0]);
  // const api = window.bowserPages?.tabImport; … api.cancel = …
  const bound = new RegExp(String.raw`(?:const|let|var)\s+(\w+)\s*=\s*window\.${BRIDGES}\b`, 'g');
  for (const [, name] of js.matchAll(bound)) {
    const member = new RegExp(String.raw`(?<![\w.])${name}(?:\??\.\w+)+\s*=(?!=)`, 'g');
    for (const m of js.matchAll(member)) problems.push(m[0]);
    const helper = new RegExp(String.raw`Object\.(?:assign|defineProperty|defineProperties)\(\s*${name}\b`, 'g');
    for (const m of js.matchAll(helper)) problems.push(m[0]);
  }
  return problems;
}

test('no renderer script assigns to a contextBridge object', () => {
  const offenders = rendererScripts().flatMap((file) =>
    bridgeAssignments(fs.readFileSync(path.join(root, file), 'utf8')).map((hit) => `${file}: ${hit}`));
  assert.deepEqual(offenders, []);
});

test('the scan catches the patterns that used to slip through', () => {
  assert.deepEqual(bridgeAssignments(`
    const surface = window.bowserPages?.surface;
    surface.close = async () => {};
  `), ['surface.close =']);
  assert.deepEqual(bridgeAssignments('window.bowserPages.surface.close = () => {};'), ['window.bowserPages.surface.close =']);
  assert.deepEqual(bridgeAssignments('const api = window.browserAPI; Object.assign(api, {});'), ['Object.assign(api']);
  // Reads, comparisons and calls are fine.
  assert.deepEqual(bridgeAssignments(`
    const api = window.bowserPages?.tabImport;
    if (api.cancel === undefined) api.cancel(id);
    const other = { close: null }; other.close = 1;
  `), []);
});
