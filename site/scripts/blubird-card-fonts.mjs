// Blubird @font-face rules for the card renderers (render-og-cards.mjs,
// render-press-card.mjs, render-mail-og-card.mjs), embedded as data URLs so a
// card renders with no network. The cards set titles in Blubird Display and
// everything else in Blubird Text, like the website. The licensed files are
// never committed (see blubird-fonts.mjs): rendering a card needs them
// installed, and stops rather than falling back to another face.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/fonts/blubird');
const FACES = [
  ['Blubird Display', 'Blubird-RegularDisplay.woff2', '400'],
  ['Blubird Text', 'Blubird-RegularText.woff2', '400'],
  ['Blubird Text', 'Blubird-MediumText.woff2', '500'],
  ['Blubird Text', 'Blubird-SemiBoldText.woff2', '600 700'],
];

export function blubirdFontFaces() {
  const missing = FACES.filter(([, file]) => !fs.existsSync(path.join(DIR, file))).map(([, file]) => file);
  if (missing.length) {
    throw new Error(`Blubird is not installed (${missing.join(', ')} missing). Install the licensed fonts first:\n  npm run site:fonts -- /path/to/Blubird.zip`);
  }
  return FACES.map(([family, file, weight]) => {
    const data = fs.readFileSync(path.join(DIR, file)).toString('base64');
    return `@font-face { font-family: '${family}'; src: url('data:font/woff2;base64,${data}') format('woff2'); font-weight: ${weight}; font-style: normal; }`;
  }).join('\n');
}
