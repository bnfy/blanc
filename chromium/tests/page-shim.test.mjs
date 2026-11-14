import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Locator,Page,createAppShim} from './lib/page-shim.mjs';

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

test('page.$ is the first match or null, and $$eval sees every match', async () => {
  const page = new Page({cdp: {}, url: 'about:blank'});
  page.evalExpression = fakePage(['one', 'two']).evalExpression;
  assert.equal(await (await page.$('.x')).textContent(), 'one');
  assert.equal(await page.$$eval('.x', els => els.map(e => e.textContent).join()), 'one,two');
  page.evalExpression = fakePage([]).evalExpression;
  assert.equal(await page.$('.x'), null);
});

test('context().pages() lists tabs, follows navigation, and a closed tab ends waitForEvent', async () => {
  let targets = [{id: 'a', type: 'page', url: 'http://one/'}];
  const app = createAppShim({targets: async () => targets, host: {}, browser: {send: async () => ({cookies: []})}});
  await app.refresh();
  const [tab] = app.context().pages();
  assert.equal(app.context().pages().length, 1, 'the Island frames are not tabs');
  assert.equal(tab.url(), 'http://one/');
  targets = [{id: 'a', type: 'page', url: 'http://two/'}];
  await app.refresh();
  assert.equal(tab.url(), 'http://two/');
  assert.deepEqual(await tab.context().cookies(), []);
  targets = [];
  await tab.waitForEvent('close');
  assert.equal(tab.isClosed(), true);
});
