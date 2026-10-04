'use strict';
const path = require('node:path');
const { fileURLToPath } = require('node:url');
// Recovery documents are browser capabilities; webpage requests remain gated.
function isBrowserResource(url, appRoot) {
  if (/^(blanc:|blanc-chrome:|about:|blob:|data:)/.test(url || '')) return true;
  if (!url?.startsWith('file:')) return false;
  try {
    const relative = path.relative(appRoot, fileURLToPath(url)).split(path.sep).join('/');
    return relative.startsWith('src/renderer/');
  } catch { return false; }
}
module.exports = { isBrowserResource };
