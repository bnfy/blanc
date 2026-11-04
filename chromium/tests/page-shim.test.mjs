import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Locator} from './lib/page-shim.mjs';

// A page whose document holds a few elements, enough for the locator's query.
const fakePage = (texts) => {
  const els = texts.map(textContent => ({textContent}));
  const document = {querySelectorAll: () => els};
  return {evalExpression: async (expression) => vm.runInNewContext(expression, {document})};
};

test('filter({hasText}) keeps only the matches whose text contains it', async () => {
  const page = fakePage(['Rename group', 'A group named “Work” already exists', 'Rename group  again']);
  const all = new Locator(page, ['#islandList .name-prompt']);
  assert.equal(await all.count(), 3);
  assert.equal(await all.filter({hasText: 'rename GROUP'}).count(), 2);
  assert.equal(await all.filter({hasText: /already exists$/}).count(), 1);
  assert.throws(() => all.filter({has: 'x'}), /hasText on a plain selector/);
});
