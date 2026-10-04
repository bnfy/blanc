'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ublockTool } = require('../../src/main/ublock-tool-url');
test('local restore admits only the current provider’s original dashboard and logger', () => {
  const id = 'abcdefghijklmnopabcdefghijklmnop';
  assert.equal(ublockTool(`chrome-extension://${id}/dashboard.html#settings`, id), 'dashboard');
  assert.equal(ublockTool(`chrome-extension://${id}/logger-ui.html?tab=1`, id), 'logger');
  for (const url of [`chrome-extension://${id}/background.html`, `chrome-extension://${id}/blanc-bridge.html`, `chrome-extension://${id}/popup-fenix.html`, `chrome-extension://other/dashboard.html`, `https://${id}/dashboard.html`, `chrome-extension://${id}/%64ashboard.html`, `chrome-extension://user@${id}/dashboard.html`]) assert.equal(ublockTool(url, id), null, url);
  assert.equal(ublockTool(`chrome-extension://${id}/dashboard.html`, null), null);
});
