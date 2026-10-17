'use strict';
const path = require('node:path');
const { fileURLToPath } = require('node:url');
// Chromium's built-in PDF viewer, a component extension with a fixed ID. Its
// page renders a document the page already fetched through the blocker.
const PDF_VIEWER_ORIGIN = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai';
// Recovery documents are browser capabilities; webpage requests remain gated.
function isBrowserResource(url, appRoot) {
  if (/^(blanc:|blanc-chrome:|about:|blob:|data:)/.test(url || '')) return true;
  if (url?.startsWith(`${PDF_VIEWER_ORIGIN}/`)) return true;
  if (!url?.startsWith('file:')) return false;
  try {
    const relative = path.relative(appRoot, fileURLToPath(url)).split(path.sep).join('/');
    return relative.startsWith('src/renderer/');
  } catch { return false; }
}
module.exports = { isBrowserResource, PDF_VIEWER_ORIGIN };
