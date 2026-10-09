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

test('the page head preloads the condensed Newsreader latin file the headings use', () => {
  const layout = read('site/src/layouts/BaseLayout.astro');
  assert.match(layout, /import newsreaderLatin from '\.\.\/fonts\/newsreader-condensed-latin-opsz-normal\.woff2\?url';/);
  assert.match(layout, /<link rel="preload" href=\{newsreaderLatin\} as="font" type="font\/woff2" crossorigin>/);
});

// The website's headings use Newsreader condensed to 92% (decision of 8 Oct
// 2026, widened from 88% on 9 Oct because 88% read too tall and narrow) with
// 0.02em tracking built in, generated from the pinned fontsource files. The display stack must not reach the wider upstream face, and the
// Georgia fallback is matched to the condensed build's measured width.
test('the display stack uses the condensed Newsreader build and a matching fallback', () => {
  const css = read('site/src/styles/site.css');
  const script = read('site/scripts/build-condensed-newsreader.py');
  assert.match(script, /^WIDTH = 0\.92$/m);
  assert.match(script, /^TRACKING = 0\.02 /m);
  assert.match(css, /--site-font-patron: "Newsreader Condensed", "Newsreader Fallback",/);
  assert.doesNotMatch(css.match(/--site-font-patron:[^;]*/)[0], /Newsreader Variable/);
  assert.match(css, /font-family: "Newsreader Fallback"; src: local\("Georgia"\); font-weight: 400; size-adjust: 91\.9%;/);
  for (const file of ['newsreader-condensed.css', 'newsreader-condensed-italic.css']) {
    const faces = read(`site/src/styles/${file}`);
    const urls = [...faces.matchAll(/url\(\.\.\/fonts\/(newsreader-condensed-[a-z-]+\.woff2)\)/g)].map(m => m[1]);
    assert.equal(urls.length, 3, file);
    for (const url of urls) assert.ok(fs.existsSync(path.join(ROOT, 'site/src/fonts', url)), url);
    assert.doesNotMatch(faces, /Newsreader Variable/, file);
  }
});
