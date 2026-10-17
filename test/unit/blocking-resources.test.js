'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { isBrowserResource, PDF_VIEWER_ORIGIN } = require('../../src/main/blocking-resources');

const appRoot = path.resolve(__dirname, '../..');

test("Chromium's built-in PDF viewer is a browser resource; other extensions and web pages are not", () => {
  // Its page, scripts and the document stream it loads into its inner frame.
  // The PDF itself was fetched by the page and already passed the blocker.
  assert.equal(PDF_VIEWER_ORIGIN, 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai');
  for (const url of [`${PDF_VIEWER_ORIGIN}/index.html`, `${PDF_VIEWER_ORIGIN}/pdf_viewer_wrapper.js`,
    `${PDF_VIEWER_ORIGIN}/0f7c5a2e-6c3d-4a8e-9a43-3f2a1e7d9b10`]) {
    assert.equal(isBrowserResource(url, appRoot), true, url);
  }
  for (const url of [`${PDF_VIEWER_ORIGIN}.evil/index.html`, PDF_VIEWER_ORIGIN,
    'chrome-extension://cjpalhdlnbpafiamejdnhcphjbkeiagm/dashboard.html',
    'https://external.found.com/api/public-invoice/invoice_13/pdf']) {
    assert.equal(isBrowserResource(url, appRoot), false, url);
  }
});
