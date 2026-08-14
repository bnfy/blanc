const assert = require('node:assert/strict');
const test = require('node:test');

const {
  pageFaviconSources,
  pickBestDeclaredFavicon,
  declaredPageFavicons,
  refineDeclaredStaticFavicon,
  resolvedFavicon,
  shouldClearFaviconOnNavigate,
  updateFaviconAfterDomReady,
  updateFaviconFromPage,
} = require('../../src/main/favicon-policy');

// Regression guard for the recurring "favicon vanishes in the island" bug.
// Root cause: did-navigate blanked tab.favicon on every URL change and relied on
// Chromium re-firing page-favicon-updated to restore it — but that event does
// NOT re-fire on a same-origin navigation whose favicon is already known
// (apple.com/ -> apple.com/mac/), and a favicon.ico-only site may have no later
// event to restore it. Clearing must therefore be cross-origin ONLY.

test('keeps favicon on a same-origin path change (the apple.com/mac regression)', () => {
  assert.equal(shouldClearFaviconOnNavigate('https://www.apple.com/', 'https://www.apple.com/mac/'), false);
});

test('keeps favicon on an identical-URL soft reload (the cnn.com case, 2c1da79)', () => {
  assert.equal(shouldClearFaviconOnNavigate('https://www.cnn.com/', 'https://www.cnn.com/'), false);
});

test('keeps favicon across same-origin query/hash changes', () => {
  assert.equal(shouldClearFaviconOnNavigate('https://x.com/home', 'https://x.com/search?q=a'), false);
  assert.equal(shouldClearFaviconOnNavigate('https://x.com/a', 'https://x.com/a#section'), false);
});

test('clears favicon on a cross-origin navigation', () => {
  assert.equal(shouldClearFaviconOnNavigate('https://github.com/', 'https://www.apple.com/'), true);
});

test('clears favicon on a cross-subdomain navigation (different origin)', () => {
  assert.equal(shouldClearFaviconOnNavigate('https://apple.com/', 'https://www.apple.com/'), true);
  assert.equal(shouldClearFaviconOnNavigate('https://docs.github.com/', 'https://github.com/'), true);
});

test('clears favicon on a scheme change to the same host', () => {
  assert.equal(shouldClearFaviconOnNavigate('http://example.com/', 'https://example.com/'), true);
});

test('keeps the working icon when a sharper page candidate fails sanitization', () => {
  const working = 'data:image/png;base64,working';
  assert.equal(
    resolvedFavicon(working, 'https://x.com/apple-touch-icon.png', null),
    working
  );
  assert.equal(
    resolvedFavicon(null, 'https://x.com/apple-touch-icon.png', null),
    null
  );
  assert.equal(
    resolvedFavicon(working, 'https://x.com/apple-touch-icon.png', 'data:image/png;base64,sharp'),
    'data:image/png;base64,sharp'
  );
  assert.equal(resolvedFavicon(working, null, null), null, 'an explicit clear still clears');
});

test('uses Chromium order and appends one conventional same-origin fallback', () => {
  assert.deepEqual(
    pageFaviconSources('https://www.united.com/en/us', [
      'https://www.united.com/icons/icon-72x72.png',
      'https://www.united.com/icons/icon-72x72.png',
      'javascript:alert(1)',
    ]),
    [
      'https://www.united.com/icons/icon-72x72.png',
      'https://www.united.com/favicon.ico',
    ]
  );
});

test('tries candidates in order until one produces sanitized pixels', async () => {
  const tab = { id: 'united', url: 'https://www.united.com/en/us', favicon: null };
  const calls = [];
  await updateFaviconFromPage(
    tab,
    ['https://www.united.com/icons/icon-72x72.png'],
    {
      setTabFavicon: async (record, source) => {
        calls.push(source);
        if (source.endsWith('/favicon.ico')) {
          record.faviconSource = source;
          record.favicon = 'data:image/png;base64,working';
        }
        return true;
      },
    }
  );
  assert.deepEqual(calls, [
    'https://www.united.com/icons/icon-72x72.png',
    'https://www.united.com/favicon.ico',
  ]);
});

test('a superseded page event stops before trying another candidate', async () => {
  const calls = [];
  await updateFaviconFromPage(
    { id: 'x', url: 'https://x.com/', favicon: null },
    ['https://x.com/favicon.ico'],
    { setTabFavicon: async (_tab, source) => { calls.push(source); return false; } }
  );
  assert.deepEqual(calls, ['https://x.com/favicon.ico']);
});

test('prefers Blanc’s declared SVG over an earlier ICO mislabeled as sizes=any', () => {
  assert.equal(pickBestDeclaredFavicon([
    {
      href: 'https://blancbrowser.com/favicon.ico',
      rel: 'icon',
      sizes: 'any',
      type: '',
    },
    {
      href: 'https://blancbrowser.com/favicon.svg',
      rel: 'icon',
      sizes: '',
      type: 'image/svg+xml',
    },
    {
      href: 'https://blancbrowser.com/favicon-32x32.png',
      rel: 'icon',
      sizes: '32x32',
      type: 'image/png',
    },
  ]), 'https://blancbrowser.com/favicon.svg');
});

test('prefers a declared Retina-sized icon over a 16px icon', () => {
  assert.equal(pickBestDeclaredFavicon([
    { href: 'https://example.com/16.png', rel: 'icon', sizes: '16x16', type: 'image/png' },
    { href: 'https://example.com/64.png', rel: 'icon', sizes: '64x64', type: 'image/png' },
  ]), 'https://example.com/64.png');
});

test('uses an Apple touch icon only when the page declares no ordinary favicon', () => {
  assert.equal(pickBestDeclaredFavicon([
    { href: 'https://example.com/favicon-16.png', rel: 'icon', sizes: '16x16', type: 'image/png' },
    { href: 'https://example.com/apple-touch-icon.png', rel: 'apple-touch-icon', sizes: '180x180', type: 'image/png' },
  ]), 'https://example.com/favicon-16.png');
  assert.equal(pickBestDeclaredFavicon([
    { href: 'https://example.com/apple-touch-icon.png', rel: 'apple-touch-icon', sizes: '180x180', type: 'image/png' },
  ]), 'https://example.com/apple-touch-icon.png');
});

test('document-ready refines a working low-resolution favicon without blanking first', async () => {
  const working = 'data:image/png;base64,working';
  const tab = {
    id: 'blanc',
    url: 'https://blancbrowser.com/changelog',
    favicon: working,
    faviconSource: 'https://blancbrowser.com/favicon.ico',
  };
  const calls = [];
  await updateFaviconAfterDomReady(tab, {
    executeJavaScript: async () => [
      { href: 'https://blancbrowser.com/favicon.ico', rel: 'icon', sizes: 'any', type: '' },
      { href: 'https://blancbrowser.com/favicon.svg', rel: 'icon', sizes: '', type: 'image/svg+xml' },
    ],
  }, {
    setTabFavicon: async (record, source) => {
      calls.push({ source, faviconAtCall: record.favicon });
      record.faviconSource = source;
      record.favicon = 'data:image/png;base64,sharp';
      return true;
    },
  });
  assert.deepEqual(calls, [{
    source: 'https://blancbrowser.com/favicon.svg',
    faviconAtCall: working,
  }]);
});

test('settled static favicon replay is refined without depending on DOM-ready ordering', async () => {
  const tab = {
    url: 'https://blancbrowser.com/changelog',
    favicon: 'data:image/png;base64,working',
    faviconSource: 'https://blancbrowser.com/favicon.ico',
  };
  const calls = [];
  const webContents = {
    executeJavaScript: async () => [
      { href: 'https://blancbrowser.com/favicon.ico', rel: 'icon', sizes: 'any', type: '' },
      { href: 'https://blancbrowser.com/favicon.svg', rel: 'icon', sizes: '', type: 'image/svg+xml' },
    ],
  };
  await refineDeclaredStaticFavicon(tab, webContents, {
    setTabFavicon: async (record, source) => {
      calls.push(source);
      record.faviconSource = source;
      record.favicon = 'data:image/png;base64,sharp';
      return true;
    },
  });
  assert.deepEqual(calls, ['https://blancbrowser.com/favicon.svg']);
});

test('settled dynamic favicon remains visible over the declared static choice', async () => {
  const tab = {
    url: 'https://blancbrowser.com/changelog',
    favicon: 'data:image/png;base64,badge',
    faviconSource: 'data:image/png;base64,dW5yZWFkLWJhZGdl',
  };
  const calls = [];
  await refineDeclaredStaticFavicon(tab, {
    executeJavaScript: async () => [
      { href: 'https://blancbrowser.com/favicon.ico', rel: 'icon', sizes: 'any', type: '' },
      { href: 'https://blancbrowser.com/favicon.svg', rel: 'icon', sizes: '', type: 'image/svg+xml' },
    ],
  }, {
    setTabFavicon: async (_record, source) => {
      calls.push(source);
      return true;
    },
  });
  assert.deepEqual(calls, []);
});

test('document-ready tries Blanc’s best declared icon before lower-resolution fallbacks', async () => {
  const tab = {
    id: 'blanc',
    url: 'https://blancbrowser.com/changelog',
    favicon: null,
    faviconSource: null,
  };
  const calls = [];
  await updateFaviconAfterDomReady(tab, {
    executeJavaScript: async () => [
      { href: 'https://blancbrowser.com/favicon.ico', rel: 'icon', sizes: 'any', type: '' },
      { href: 'https://blancbrowser.com/favicon.svg', rel: 'icon', sizes: '', type: 'image/svg+xml' },
      { href: 'https://blancbrowser.com/favicon-32x32.png', rel: 'icon', sizes: '32x32', type: 'image/png' },
    ],
  }, {
    setTabFavicon: async (record, source) => {
      calls.push(source);
      record.faviconSource = source;
      record.favicon = 'data:image/png;base64,working';
      return true;
    },
  });
  assert.deepEqual(calls, ['https://blancbrowser.com/favicon.svg']);
});

test('document-ready supplies the declared favicon when Chromium emitted no icon event', async () => {
  const tab = { id: 'stack-overflow', url: 'https://stackoverflow.com/questions', favicon: null };
  const calls = [];
  await updateFaviconAfterDomReady(tab, {
    executeJavaScript: async () => [
      'https://stackoverflow.com/Content/Sites/stackoverflow/Img/favicon.ico?v=562fb39d93c8',
    ],
  }, {
    setTabFavicon: async (record, source) => {
      calls.push(source);
      record.faviconSource = source;
      record.favicon = 'data:image/png;base64,working';
      return true;
    },
  });
  assert.deepEqual(calls, [
    'https://stackoverflow.com/Content/Sites/stackoverflow/Img/favicon.ico?v=562fb39d93c8',
  ]);
});

test('declared page favicon fallback is bounded and failure-safe', async () => {
  assert.deepEqual(await declaredPageFavicons({ executeJavaScript: async () => ['https://example.com/icon.png'] }), [
    'https://example.com/icon.png',
  ]);
  const bounded = await declaredPageFavicons({
    executeJavaScript: async () => Array(30).fill('https://example.com/icon.png'),
  });
  assert.equal(bounded.length, 20);
  assert.deepEqual(await declaredPageFavicons({ executeJavaScript: async () => { throw new Error('gone'); } }), []);
});

test('document-ready discards icon links if the tab navigates during the query', async () => {
  const tab = { url: 'https://old.example/', favicon: null, faviconSource: null };
  let calls = 0;
  const result = await updateFaviconAfterDomReady(tab, {
    executeJavaScript: async () => {
      tab.url = 'https://new.example/';
      return ['https://old.example/favicon.ico'];
    },
  }, { setTabFavicon: async () => { calls++; } });
  assert.equal(result, false);
  assert.equal(calls, 0);
});

test('document-ready does not compete with a working or in-flight favicon event', async () => {
  let calls = 0;
  const deps = { setTabFavicon: async () => { calls++; } };
  const webContents = { executeJavaScript: async () => [] };
  assert.equal(await updateFaviconAfterDomReady({
    url: 'https://example.com/',
    favicon: 'data:image/png;base64,working',
    faviconSource: 'https://example.com/icon.png',
  }, webContents, deps), false);
  assert.equal(await updateFaviconAfterDomReady({
    url: 'https://example.com/',
    favicon: null,
    faviconSource: 'https://example.com/icon.png',
  }, webContents, deps), false);
  assert.equal(calls, 0);
});

test('document-ready retries declared links after an in-flight page event fails', async () => {
  const tab = {
    url: 'https://example.com/',
    favicon: null,
    faviconSource: 'https://example.com/first.ico',
  };
  tab.faviconPending = Promise.resolve().then(() => {
    tab.faviconSource = null;
    return false;
  });
  const calls = [];
  await updateFaviconAfterDomReady(tab, {
    executeJavaScript: async () => ['https://example.com/retry.ico'],
  }, {
    setTabFavicon: async (record, source) => {
      calls.push(source);
      record.favicon = 'data:image/png;base64,working';
      record.faviconSource = source;
      return true;
    },
  });
  assert.deepEqual(calls, ['https://example.com/retry.ico']);
});

test('clears when leaving or entering an internal blanc:// page', () => {
  assert.equal(shouldClearFaviconOnNavigate('blanc://newtab/', 'https://www.apple.com/'), true);
  assert.equal(shouldClearFaviconOnNavigate('https://www.apple.com/', 'blanc://newtab/'), true);
});

test('clears between two internal pages (opaque origins are not "same origin")', () => {
  // blanc:// (and data:/about:) serialize to the opaque origin "null"; two
  // different internal pages must not be mistaken for a same-origin nav.
  assert.equal(shouldClearFaviconOnNavigate('blanc://newtab/', 'blanc://history/'), true);
  assert.equal(shouldClearFaviconOnNavigate('about:blank', 'data:text/html,x'), true);
});

test('handles an empty/undefined prior URL (freshly created tab) by clearing', () => {
  assert.equal(shouldClearFaviconOnNavigate('', 'https://www.apple.com/'), true);
});
