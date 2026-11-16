// The first-run walkthrough as Blanc Beta serves it: shipping's November 2026
// wording and picture fixes, ported to the fork's own copies. (The ⌘L panel
// fix is not ported: below 800px the fork already drops the panel under the
// window buttons, prototype.css.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const island = path.join(root, 'blanc/island');
const pageStrings = fs.readFileSync(path.join(island, 'pages/strings.js'), 'utf8');
const LANGUAGES = ['en', 'de', 'es', 'fr', 'it', 'pt-BR'];

/** The page messages one interface language serves. */
function messages(language) {
  const sandbox = {__blancUiLanguage: language, navigator: {languages: [language], language}, Intl};
  sandbox.self = sandbox;
  vm.runInNewContext(pageStrings, sandbox);
  return sandbox.blancStrings.messages;
}

const LABELS = [
  'onboarding.skip', 'onboarding.step.default', 'onboarding.step.import', 'onboarding.step.island',
  'onboarding.step.blocking', 'onboarding.step.privacy', 'onboarding.step.theme',
  'onboarding.theme.light', 'onboarding.theme.dark',
];

test('the walkthrough names /allow-ads, the command that exists', () => {
  for (const language of LANGUAGES) {
    const body = messages(language)['onboarding.blocking.body'];
    assert.match(body, /\/allow-ads\b/, language);
    assert.doesNotMatch(body, /off-leash/, language);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(island, 'pages/newtab.html'), 'utf8'), /off-leash/);
});

test('the walkthrough labels are capitalized, and so is the Island', () => {
  for (const language of LANGUAGES) {
    const catalog = messages(language);
    for (const key of LABELS) {
      const first = catalog[key].replace(/^[^\p{L}]+/u, '')[0];
      assert.equal(first, first.toLocaleUpperCase(language), `${language} ${key}: ${catalog[key]}`);
    }
    for (const key of ['onboarding.step.island', 'onboarding.island.title']) {
      assert.doesNotMatch(catalog[key], /\bisland\b/, `${language} ${key}`);
    }
  }
});

test('the walkthrough picture shows blanc.day, not the old domain, at its own size', () => {
  const html = fs.readFileSync(path.join(island, 'pages/newtab.html'), 'utf8');
  const png = fs.readFileSync(path.join(island, 'pages/onboarding-island-light.png'));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.match(html, new RegExp(`class="ob-quiet-island" src="onboarding-island-light.png" width="${width}" height="${height}"`));
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'blanc/island-assets.json'), 'utf8'));
  const record = spec.shippingFiles['pages/onboarding-island-light.png'];
  assert.equal(record, undefined, 'the refreshed picture is the fork\'s own file, not the older shipping copy');
});
