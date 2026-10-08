const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// The web fonts swap in after first paint. Without metric-matched fallbacks the
// phone hero heading wrapped to two lines and then one, shifting the hero 46px
// (CLS 0.06 measured on 2026-10-05). Every stack must name its fallback.
test('every website Newsreader and Inter stack names its metric-matched fallback', () => {
  const css = read('site/src/styles/site.css');
  assert.match(css, /@font-face \{ font-family: "Newsreader Fallback"; src: local\("Georgia"\);[^}]*size-adjust:/);
  assert.match(css, /@font-face \{ font-family: "Inter Fallback"; src: local\("Arial"\)[^}]*size-adjust:/);
  const stacks = [...css.matchAll(/(?:font-family:|font:|--[a-z-]*font[a-z-]*:)[^;]*/g)].map(match => match[0]);
  const newsreader = stacks.filter(stack => /Newsreader/.test(stack) && !/Newsreader Fallback";/.test(stack));
  const inter = stacks.filter(stack => /\bInter\b/.test(stack) && !/Inter Fallback";/.test(stack));
  // Counts track the live stacks; unused legacy rules carried more until they were removed.
  assert.ok(newsreader.length >= 2 && inter.length >= 3, 'the font stacks were found');
  for (const stack of newsreader) assert.match(stack, /Newsreader Fallback/, stack);
  for (const stack of inter) assert.match(stack, /Inter Fallback/, stack);
  // Page stylesheets reuse the site.css stacks through their variables rather
  // than restating a stack that could miss its fallback.
  for (const file of ['site/src/styles/mail.css']) {
    const pageStacks = [...read(file).matchAll(/(?:font-family:|font:)[^;}]*/g)].map(match => match[0]);
    for (const stack of pageStacks.filter(stack => /Newsreader|\bInter\b/.test(stack))) {
      assert.match(stack, /Newsreader Fallback|Inter Fallback/, `${file}: ${stack}`);
    }
  }
});

test('the page head preloads the Newsreader latin file the headings use', () => {
  const layout = read('site/src/layouts/BaseLayout.astro');
  assert.match(layout, /import newsreaderLatin from '@fontsource-variable\/newsreader\/files\/newsreader-latin-opsz-normal\.woff2\?url';/);
  assert.match(layout, /<link rel="preload" href=\{newsreaderLatin\} as="font" type="font\/woff2" crossorigin>/);
});
