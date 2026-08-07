const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const preloadPath = path.join(__dirname, '../../src/main/chrome-compat-preload.js');
const preloadSource = fs.readFileSync(preloadPath, 'utf8');

function runPreload({ protocol, pathname }) {
  const inserted = [];
  const webFrame = {
    insertCSS(css, options) {
      inserted.push({ css, options });
      return 'inserted-style-key';
    },
    executeJavaScript() {
      return Promise.resolve();
    },
  };

  vm.runInNewContext(preloadSource, {
    require(moduleName) {
      assert.equal(moduleName, 'electron');
      return { webFrame };
    },
    window: { location: { protocol, pathname } },
  }, { filename: preloadPath });

  return inserted;
}

test('browsed pages get a light-DOM native drag-region reset', () => {
  for (const location of [
    { protocol: 'https:', pathname: '/design/project' },
    { protocol: 'blanc:', pathname: '/newtab/' },
    { protocol: 'file:', pathname: '/Users/me/page.html' },
  ]) {
    const inserted = runPreload(location);
    assert.equal(inserted.length, 1);
    assert.match(inserted[0].css, /-webkit-app-region: no-drag !important/);
    assert.equal(inserted[0].options.cssOrigin, 'user');
  }
});

test('the trusted strip keeps its intentional native drag region', () => {
  const inserted = runPreload({
    protocol: 'file:',
    pathname: '/Applications/Blanc.app/Contents/Resources/app.asar/src/renderer/index.html',
  });

  assert.equal(inserted.length, 0);
});
