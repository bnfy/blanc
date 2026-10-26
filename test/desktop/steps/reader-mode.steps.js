'use strict';
const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const ctx = require('../support/context');

async function chrome(method, id) {
  return ctx.app.evaluate(({ webContents }, { method, id }) => {
    const wc = webContents.getAllWebContents().find(item => item.getURL() === 'blanc-chrome://index/');
    return wc.executeJavaScript(`window.browserAPI[${JSON.stringify(method)}](${JSON.stringify(id)})`);
  }, { method, id });
}
async function readerScript(script) {
  return ctx.app.evaluate(({ webContents }, script) => {
    const wc = webContents.getAllWebContents().find(item => item.getURL().startsWith('blanc-reader:'));
    if (!wc) throw Error('Reader Mode is not open');
    return wc.executeJavaScript(script);
  }, script);
}
Given('a Reader Mode test article is open', async function () {
  this.readerTestId = await this.call('openTab', this.fixtureUrl('Reader Mode'));
  await this.waitForState(state => state.tabs.some(tab => tab.id === this.readerTestId && !tab.loading && !tab.isLoading));
  const paragraphs = Array.from({ length: 20 }, (_, i) => `<p>Reader acceptance paragraph ${i}. ${'Useful article text with clear explanations and enough context for reading. '.repeat(8)}</p>`).join('');
  const html = `<article><h1>Reader acceptance</h1>${paragraphs}<p hidden>HIDDEN_READER_SECRET</p><a href="javascript:alert(1)">Unsafe</a></article>`;
  await this.call('workspacePageScript', this.readerTestId,
    `document.title = 'Reader acceptance'; document.body.innerHTML = ${JSON.stringify(html)}; window.originalReaderMarker = true; window.scrollTo(0, 240);`);
  this.readerOriginalScroll = await this.call('workspacePageScript', this.readerTestId, 'window.scrollY');
});
When('I enter Reader Mode for the test article', async function () {
  assert.equal(await chrome('toggleReaderMode', this.readerTestId), true);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await readerScript("document.getElementById('article').textContent.length > 200")) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('Reader article did not initialize');
});
Then('the reader contains the article without hidden content or page scripts', async function () {
  const result = await readerScript(`({ text: document.getElementById('article').textContent,
    unsafe: document.querySelectorAll('article script, article iframe, article [onclick], article [onerror]').length,
    sourceAPI: typeof window.browserAPI })`);
  assert.match(result.text, /Reader acceptance/);
  assert.equal(result.text.includes('HIDDEN_READER_SECRET'), false);
  assert.equal(result.unsafe, 0);
  assert.equal(result.sourceAPI, 'undefined');
});
When('I exit Reader Mode for the test article', async function () {
  assert.equal(await chrome('toggleReaderMode', this.readerTestId), true);
});
Then('the original Reader Mode test document and scroll position are unchanged', async function () {
  const original = await this.call('workspacePageScript', this.readerTestId, '({marker: window.originalReaderMarker, scroll: window.scrollY})');
  assert.equal(original.marker, true);
  assert.equal(original.scroll, this.readerOriginalScroll);
});
When('I choose sepia Reader Mode with large sans-serif text', async function () {
  await readerScript("window.readerAPI.appearance({theme:'sepia',font:'sans',size:28,width:'wide'})");
});
Then('the reader remembers the chosen appearance', async function () {
  const data = await readerScript('window.readerAPI.initialize()');
  assert.deepEqual(data.appearance, { theme: 'sepia', font: 'sans', size: 28, width: 'wide' });
});
