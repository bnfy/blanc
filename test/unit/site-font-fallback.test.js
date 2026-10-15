const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// The web fonts swap in after first paint. Without a metric-matched fallback
// the phone hero heading wrapped to two lines and then one, shifting the hero
// 46px (CLS 0.06 measured on 2026-10-05). Blubird falls back to Inter (the
// licensed Blubird files are absent in CI), and every Inter stack names its
// fallback.
test('every website Inter stack names its metric-matched fallback, and none names Newsreader', () => {
  const css = read('site/src/styles/site.css');
  assert.match(css, /@font-face \{ font-family: "Inter Fallback"; src: local\("Arial"\)[^}]*size-adjust:/);
  const stacks = [...css.matchAll(/(?:font-family:|font:|--[a-z-]*font[a-z-]*:)[^;]*/g)].map(match => match[0]);
  const inter = stacks.filter(stack => /\bInter\b/.test(stack) && !/Inter Fallback";/.test(stack));
  assert.ok(inter.length >= 1, 'the Inter stack was found');
  for (const stack of inter) assert.match(stack, /Inter Fallback/, stack);
  for (const file of ['site/src/styles/site.css', 'site/src/styles/mail.css', 'site/src/styles/revamp.css']) {
    const pageStacks = [...read(file).matchAll(/(?:font-family:|font:|--[a-z-]*font[a-z-]*:)[^;}]*/g)].map(match => match[0]);
    for (const stack of pageStacks) assert.doesNotMatch(stack, /Newsreader/, `${file}: ${stack}`);
  }
});

test('the page head loads Blubird and no longer preloads Newsreader', () => {
  const layout = read('site/src/layouts/BaseLayout.astro');
  assert.match(layout, /import '\.\.\/styles\/blubird\.css';/);
  assert.doesNotMatch(layout, /newsreader/i);
});

// Since October 15, 2026 every page is set in Blubird: headings in Blubird
// Display at 0 tracking (the face's own spacing, as on the homepage), text in
// Blubird Text. Product replicas keep Inter, the app's face.
test('headings use Blubird Display at 0 tracking and text uses Blubird Text', () => {
  const css = read('site/src/styles/site.css');
  assert.match(css, /--site-font-patron: var\(--font-brand-display\);/);
  assert.match(css, /--site-font-display: var\(--font-brand-display\);/);
  assert.match(css, /html, body \{[^}]*font-family: var\(--font-brand-text\);/);
  const blubird = read('site/src/styles/blubird.css');
  assert.match(blubird, /--font-brand-display: "Blubird Display", var\(--font-ui\);/);
  assert.match(blubird, /--font-brand-text: "Blubird Text", var\(--font-ui\);/);
  const sheets = fs.readdirSync(path.join(ROOT, 'site/src/styles')).filter(name => name.endsWith('.css'));
  for (const name of sheets) {
    for (const [, body] of read(`site/src/styles/${name}`).matchAll(/\{([^{}]*)\}/g)) {
      if (!/var\(--site-font-(display|patron)\)|var\(--font-brand-display\)/.test(body)) continue;
      assert.doesNotMatch(body, /letter-spacing:\s*-/, `${name}: ${body.trim().slice(0, 120)}`);
    }
  }
});
