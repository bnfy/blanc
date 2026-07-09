const assert = require('node:assert/strict');
const test = require('node:test');

// build.mjs is ESM and self-executes when run directly; the entry guard lets a
// CommonJS test import its pure helpers without triggering a build.
let patternToRegex;
test.before(async () => {
  ({ patternToRegex } = await import('../../adblock/build.mjs'));
});

// WebKit's `url-filter` is a restricted regex. An unescaped metacharacter that
// survives from a filter's literal path is read as regex syntax — and a raw
// mid-pattern `$` (end-of-URL anchor) makes `compileContentRuleList` reject the
// ENTIRE list (WKErrorDomain 6), silently disabling all blocking. This is the
// one class of converter bug the byte-identity drift guard (`adblock:check`)
// cannot catch, and no CI job runs WebKit — so guard it here.

test('escapes a literal $ in the pattern body', () => {
  const out = patternToRegex('/foo$bar');
  assert.ok(!/(?<!\\)\$/.test(out), `unescaped $ leaked: ${out}`);
});

test('escapes a literal | in the pattern body', () => {
  const out = patternToRegex('/addyn|adtech');
  assert.ok(!/(?<!\\)\|/.test(out), `unescaped | leaked: ${out}`);
});

test('leaves no unescaped regex metacharacter in an all-literal pattern', () => {
  // Every character here is a JS/WebKit regex metachar and a literal in the URL;
  // none carries ABP meaning (no leading/trailing `|`, no `^` separator, no `*`
  // wildcard), so all must come back backslash-escaped.
  const out = patternToRegex('a.b+c?d{e}f(g)h[i]j$k');
  const leaked = out.match(/(?<!\\)[.+?${}()[\]|]/g);
  assert.equal(leaked, null, `leaked metachars ${leaked} in ${out}`);
});

test('preserves ABP anchors and wildcard semantics', () => {
  // `||host^` → domain-anchored prefix + separator class; `*` → `.*`.
  assert.match(patternToRegex('||example.com^'), /^\^\[\^:\]\+/);
  assert.ok(patternToRegex('/ads/*').includes('.*'), 'wildcard * should map to .*');
  // A trailing `|` is an end-anchor, not a literal — it becomes `$` at the tail.
  assert.ok(patternToRegex('/banner.gif|').endsWith('$'), 'trailing | should anchor with $');
});
