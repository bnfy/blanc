import assert from 'node:assert/strict';
import test from 'node:test';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';

const capture = (html, patterns) => {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return '';
};

test('unknown routes return the branded noindex page with a real 404 status', async () => {
  const response = await fetch(`${baseURL}/__blanc_not_found_test__`, { redirect: 'manual' });
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') || '', /text\/html/);

  const html = await response.text();
  assert.match(html, /<h1\b[^>]*>\s*This page isn’t here\.\s*<\/h1>/i);
  assert.equal(capture(html, [
    /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i,
    /<link[^>]+href="([^"]*)"[^>]+rel="canonical"/i,
  ]), 'https://blancbrowser.com/404');
  assert.match(capture(html, [
    /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i,
    /<meta[^>]+content="([^"]*)"[^>]+name="robots"/i,
  ]), /\bnoindex\b/i);
  assert.match(html, /href="\/features"/);
});
