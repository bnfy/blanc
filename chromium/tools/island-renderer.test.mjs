// The Island's shipping renderer files must be exactly what island-renderer.mjs
// generates from the recorded release: shipping's own code, Trusted Types
// for its HTML sinks, and only the fork's declared, anchored edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {generate, FILES, EDITS, MAIN_FILES} from './island-renderer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const record = JSON.parse(fs.readFileSync(path.join(root, 'blanc/island-renderer.json'), 'utf8'));

test('committed Island files are the generated ones', () => {
  const files = generate(record.ref);
  assert.deepEqual(record.files, FILES);
  assert.deepEqual(record.mainFiles, Object.keys(MAIN_FILES));
  for (const [file, text] of Object.entries(files))
    assert.equal(fs.readFileSync(path.join(root, 'blanc/island', file), 'utf8'), text, file);
});

test('hardened scripts accept only their packaged static markup', () => {
  const files = generate(record.ref);
  for (const file of ['overlay.js', 'renderer.js', 'vertical-tabs.js']) {
    let rule;
    const stop = Error('captured');
    assert.throws(() => vm.runInNewContext(files[file], {trustedTypes: {createPolicy(name, rules) { rule = rules.createHTML; throw stop; }}}), e => e === stop);
    for (const bad of ['<img src=x onerror=alert(1)>', '<svg onload=alert(1)></svg>', 'page title'])
      assert.throws(() => rule(bad), file);
  }
});

test('every declared edit says why and changes its file', () => {
  for (const [file, edits] of Object.entries(EDITS)) {
    assert.ok(FILES.includes(file), file);
    for (const [find, replace] of edits) assert.notEqual(find, replace, file);
  }
});

// The wrapped module must be shipping's: every state the hover machine can be
// in, given every event, steps exactly as shipping's module does.
test('the host runs shipping\'s hover-open state machine unchanged', () => {
  const window = {};
  vm.runInNewContext(generate(record.ref)['island-hover-open.js'], {window});
  const module = {exports: {}};
  vm.runInNewContext(execFileSync('git', ['show', `${record.ref}:src/main/island-hover-open.js`], {cwd: root, encoding: 'utf8'}), {module});
  const shipping = module.exports, host = window.BlancIslandHoverOpen;
  // Each runs in its own realm, so values are compared as plain data.
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(Object.keys(host)), plain(Object.keys(shipping)));
  assert.equal(host.HOVER_OPEN_DWELL_MS, shipping.HOVER_OPEN_DWELL_MS);
  assert.deepEqual(plain(host.initialHoverState()), plain(shipping.initialHoverState()));
  const bools = [false, true];
  const events = [{type: 'ineligible'}, {type: 'fired'}, {type: 'other'}];
  for (const inside of bools) for (const eligible of bools) for (const buttonsDown of bools) for (const sampled of bools)
    events.push({type: 'move', inside, eligible, buttonsDown, sampled});
  for (const inside of bools) for (const armed of bools) for (const dwelling of bools)
    for (const event of events) {
      const state = {inside, armed, dwelling};
      assert.deepEqual(plain(host.hoverStep(state, event)), plain(shipping.hoverStep(state, event)), JSON.stringify({state, event}));
    }
  for (const [point, rect] of [[{x: 5, y: 5}, {x: 0, y: 0, width: 10, height: 10}], [{x: 11, y: 5}, {x: 0, y: 0, width: 10, height: 10}],
    [null, {x: 0, y: 0, width: 10, height: 10}], [{x: 0, y: 0}, {x: 0, y: 0, width: 0, height: 10}], [{x: 10, y: 10}, {x: 0, y: 0, width: 10, height: 10}]])
    assert.equal(host.pointInRect(point, rect), shipping.pointInRect(point, rect));
});
