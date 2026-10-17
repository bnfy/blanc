const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A bang the website asks you to type (`!yt lofi`) is drawn as the app draws
// a bang code: the ⌘L panel's chip, never code type or plain words.
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const BANG = /(?:^|\s)![a-z0-9_.-]*(?:\s|$)/i;

function astroFiles(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return astroFiles(file);
    return entry.name.endsWith('.astro') ? [file] : [];
  });
}

test('no site page sets a bang in <code>', () => {
  for (const file of astroFiles('site/src')) {
    for (const [, inner] of read(file).matchAll(/<code>([^<]*)<\/code>/g)) {
      assert.doesNotMatch(inner, BANG, `${file}: <code>${inner}</code> should be <kbd class="bang-chip">`);
    }
  }
});

test('the site chip is the app\'s bang chip, sized to the words around it', () => {
  const app = read('src/renderer/styles.css');
  const site = read('site/src/styles/site.css');
  const appChip = app.match(/\.island-row \.row-cmd \{([^}]*)\}/)[1];
  const chip = site.match(/\n\.bang-chip \{([^}]*)\}/)[1];
  // App: Instrument Sans, 550, a 7% tint of the text ink, 12px in a 12.5px
  // row, 7px across, 6px round.
  assert.match(appChip, /font-family: var\(--font-text\);/);
  assert.match(appChip, /font-weight: 550;/);
  assert.match(appChip, /background: color-mix\(in srgb, var\(--text\) 7%, transparent\);/);
  assert.match(appChip, /font-size: 12px;/);
  assert.match(appChip, /padding: 0 7px;/);
  assert.match(appChip, /border-radius: 6px;/);
  assert.match(chip, /font-family: var\(--font-app\);/);
  assert.match(chip, /font-variation-settings: "wdth" 98;/);
  assert.match(chip, /font-weight: 550;/);
  assert.match(chip, /background: color-mix\(in srgb, var\(--bang-chip-ink, var\(--site-text\)\) 7%, transparent\);/);
  assert.match(chip, /color: var\(--bang-chip-ink, var\(--site-text\)\);/);
  assert.match(chip, /font-size: 0\.96em;/);
  assert.match(chip, /padding: 0\.21em 0\.58em;/);
  assert.match(chip, /border-radius: 0\.5em;/);
  // The homepage's dark cards give it their light ink.
  assert.match(read('site/src/styles/home.css'), /\.tool-card \{\s*--bang-chip-ink: var\(--night-text\);/);
});

test('release notes chip a bang and leave other code as code', () => {
  const component = read('site/src/components/ReleaseText.astro');
  assert.match(component, /span\.type === 'code' && BANG\.test\(span\.value\) \? <kbd class="bang-chip">\{span\.value\}<\/kbd>/);
  const pattern = new RegExp(component.match(/const BANG = \/(.+)\/i;/)[1], 'i');
  for (const bang of ['!yt lofi', 'lofi !yt', '!yt', '!']) assert.match(bang, pattern, bang);
  for (const code of ['op run', 'BLANC_TEST=1', 'blanc://newtab', '!==', 'a!b']) assert.doesNotMatch(code, pattern, code);
});
