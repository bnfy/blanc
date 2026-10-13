'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'cloudflare/blancbrowser-redirects');
const load = () => import(pathToFileURL(path.join(DIR, 'src/index.js')).href);

async function go(url, method = 'GET') {
  const { default: worker } = await load();
  const response = await worker.fetch(new Request(url, { method, body: method === 'POST' ? '{}' : undefined }));
  return [response.status, response.headers.get('location')];
}

test('the former hosts send every path and query to the same place on blanc.day', async () => {
  assert.deepEqual(await go('https://blancbrowser.com/'), [301, 'https://blanc.day/']);
  assert.deepEqual(await go('https://blancbrowser.com/features/island?x=1'), [301, 'https://blanc.day/features/island?x=1']);
  assert.deepEqual(await go('https://www.blancbrowser.com/changelog'), [301, 'https://blanc.day/changelog']);
  assert.deepEqual(await go('https://www.blanc.day/mail'), [301, 'https://blanc.day/mail']);
  // The store extensions' handoff link: the browser keeps its #fragment across the redirect.
  assert.deepEqual(await go('https://blancbrowser.com/import-tabs/'), [301, 'https://blanc.day/import-tabs/']);
});

test('HEAD redirects like GET, and anything else keeps its method', async () => {
  assert.deepEqual(await go('https://blancbrowser.com/about', 'HEAD'), [301, 'https://blanc.day/about']);
  assert.deepEqual(await go('https://blancbrowser.com/mail/api/v1/license/validate', 'POST'), [308, 'https://blanc.day/mail/api/v1/license/validate']);
});

test('no other host is redirected, the tab relay least of all', async () => {
  for (const url of ['https://tabs.blancbrowser.com/v1/handoffs/x', 'https://blanc.day/', 'https://example.com/']) {
    assert.deepEqual(await go(url), [404, null], url);
  }
});

test('the routes name exact hosts and leave the relay and workers.dev alone', () => {
  const toml = fs.readFileSync(path.join(DIR, 'wrangler.toml'), 'utf8');
  const routes = [...toml.matchAll(/\{ pattern = "([^"]+)", zone_name = "([^"]+)" \}/g)].map((match) => `${match[1]} @ ${match[2]}`);
  assert.deepEqual(routes, [
    'blancbrowser.com/* @ blancbrowser.com',
    'www.blancbrowser.com/* @ blancbrowser.com',
    'www.blanc.day/* @ blanc.day',
  ]);
  assert.match(toml, /^workers_dev = false$/m);
  assert.doesNotMatch(toml, /pattern = "(?:\*|tabs\.)/);
});
