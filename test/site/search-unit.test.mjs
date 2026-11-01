import { test } from 'node:test';
import assert from 'node:assert/strict';

test('site search ranks titles, requires all words, handles accents, aliases and typos', async () => {
  const { prepareIndex, search } = await import('../../site/src/lib/search.mjs');
  const docs = prepareIndex([
    { title: 'Glance', text: 'View two tabs side by side.', url: '/features/glance', category: 'Features' },
    { title: 'Older update', text: 'Glance was added.', url: '/changelog#v1', category: 'Release notes' },
    { title: '1Password', text: 'Fill passwords with your installed app.', url: '/features/1password', category: 'Features' },
    { title: 'Blanc Spaces', text: 'Separate your projects.', url: '/features/workspaces', category: 'Features' },
  ]);
  assert.equal(search(docs, 'glance')[0].url, '/features/glance');
  assert.equal(search(docs, 'glanc')[0].url, '/features/glance');
  assert.equal(search(docs, 'glánce')[0].url, '/features/glance');
  assert.equal(search(docs, 'workspaces')[0].url, '/features/workspaces');
  assert.equal(search(docs, 'passwords')[0].url, '/features/1password');
  assert.equal(search(docs, 'glance impossible').length, 0);
  assert.equal(search(docs, '  ').length, 0);
  assert.equal(search(docs, 'glance', 1).length, 1);
});

test('search index includes rendered public content and deep links, excluding scripts and noindex', async () => {
  const { indexPage } = await import('../../site/scripts/search-index.mjs');
  const html = '<title>Help — Blanc</title><nav>Secret navigation</nav><main><h1>Help</h1><details id="sync"><summary>How does sync work?</summary><p>Encrypted &amp; private.</p></details><script>tracking()</script></main>';
  const docs = indexPage(html, '/support');
  assert.equal(docs.length, 2);
  assert.equal(docs[1].url, '/support#sync');
  assert.equal(docs[1].text, 'How does sync work? Encrypted & private.');
  assert.equal(docs[0].text.includes('tracking'), false);
  assert.equal(docs[0].text.includes('Secret'), false);
  assert.deepEqual(indexPage('<meta name="robots" content="noindex,follow">' + html, '/upcoming'), []);
});

test('development indexing reads only local canonical pages and shares production extraction', async () => {
  const { buildDevelopmentIndex, indexCanonicalPage } = await import('../../site/scripts/search-index.mjs');
  const html = '<link rel="canonical" href="https://blanc.day/support"><title>Support</title><main><details id="help"><summary>Help</summary>Answer</details></main>';
  const calls = [];
  const fetchPage = async url => {
    calls.push(String(url));
    return new Response(url.pathname === '/sitemap.xml' ? '<urlset><url><loc>https://blanc.day/support</loc></url></urlset>' : html);
  };
  assert.deepEqual(await buildDevelopmentIndex('http://127.0.0.1:4325', fetchPage), indexCanonicalPage(html, '/support'));
  assert.deepEqual(calls, ['http://127.0.0.1:4325/sitemap.xml', 'http://127.0.0.1:4325/support']);
  await assert.rejects(buildDevelopmentIndex('http://127.0.0.1:4325', async () => new Response('', { status: 500 })), /returned 500/);
});

test('development cache shares builds, invalidates changes, and retries failures', async () => {
  const { developmentIndexCache } = await import('../../site/scripts/search-index.mjs');
  let calls = 0;
  let reject = false;
  const cache = developmentIndexCache(async () => { calls++; if (reject) throw new Error('Page failed'); return [calls]; });
  assert.deepEqual(await Promise.all([cache.get(), cache.get()]), [[1], [1]]);
  assert.deepEqual(await cache.get(), [1]);
  cache.invalidate();
  reject = true;
  await assert.rejects(cache.get(), /Page failed/);
  reject = false;
  assert.deepEqual(await cache.get(), [3]);
});

test('an invalidated in-flight generation cannot replace the fresh cache', async () => {
  const { developmentIndexCache } = await import('../../site/scripts/search-index.mjs');
  const completions = [];
  const cache = developmentIndexCache(() => new Promise(resolve => completions.push(resolve)));
  const old = cache.get();
  await Promise.resolve();
  cache.invalidate();
  const current = cache.get();
  await Promise.resolve();
  completions[1](['fresh']);
  await current;
  completions[0](['stale']);
  await old;
  assert.deepEqual(await cache.get(), ['fresh']);
});
