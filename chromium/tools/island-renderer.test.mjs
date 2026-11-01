// The Island's shipping renderer files must be exactly what island-renderer.mjs
// generates from the recorded release: shipping's own code, Trusted Types
// for its HTML sinks, and only the fork's declared, anchored edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {generate, FILES, EDITS} from './island-renderer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const record = JSON.parse(fs.readFileSync(path.join(root, 'blanc/island-renderer.json'), 'utf8'));

test('committed Island files are the generated ones', () => {
  const files = generate(record.ref);
  assert.deepEqual(record.files, FILES);
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
