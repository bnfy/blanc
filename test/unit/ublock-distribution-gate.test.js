'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../scripts/before-pack-ublock.js'), 'utf8');
function pack({ internal = false, configuration = {}, embedded = {}, gate = {} } = {}) {
  const checked = [];
  const module = { exports: {} };
  vm.runInNewContext(source, { module, process: { env: internal ? { BLANC_UBLOCK_INTERNAL_BUILD: '1' } : {} },
    require: name => {
      if (name === '../ublock/distribution.json') return gate;
      assert(['./check-ublock-package.cjs', './build-ublock-adaptation.cjs'].includes(name));
      checked.push(name); return {};
    },
  });
  const context = { packager: { config: { extraMetadata: configuration }, info: { metadata: embedded } } };
  return { execute: () => module.exports(context), checked, context };
}
test('ordinary packaging excludes uncleared upstream assets while Blanc builds remain usable', () => {
  const candidate = pack(); candidate.execute();
  assert.equal(candidate.context.packager.info.metadata.blancUblockBundled, false);
  assert(candidate.context.packager.config.files.includes('!ublock{,/**/*}'));
  assert.equal(candidate.checked.length, 0);
});
test('public packaging rejects stale validation markers from both metadata sources', () => {
  const gate = { cleared: true, assessment: true, correspondingSource: true, noticeReview: true };
  for (const source of ['configuration', 'embedded']) {
    const candidate = pack({ gate, [source]: { blancUblockInternalValidation: true } });
    assert.throws(candidate.execute, /marker forbidden/);
  }
});
test('an explicit internal package embeds its marker without clearing the public distribution gate', () => {
  const candidate = pack({ internal: true, configuration: { retained: 1 }, embedded: { version: 'candidate' } });
  candidate.execute();
  assert.equal(candidate.context.packager.config.extraMetadata.blancUblockInternalValidation, true);
  assert.equal(candidate.context.packager.info.metadata.blancUblockInternalValidation, true);
  assert.equal(candidate.context.packager.config.extraMetadata.retained, 1);
  assert.equal(candidate.context.packager.info.metadata.version, 'candidate');
  assert.equal(candidate.checked.length, 2);
});
