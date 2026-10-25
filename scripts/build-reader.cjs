'use strict';
// Desktop and iOS ship the same sanitizer, extractor, and reading document.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildReaderProbe, buildReaderExtraction } = require('../src/main/reader-extract');
const root = path.join(__dirname, '..');
const check = process.argv.includes('--check');
const iosExtraction = `(() => {
  const article = ${buildReaderExtraction()};
  if (!article) return null;
  article.imageData = {};
  let total = 0;
  let totalPixels = 0;
  const loaded = Array.from(document.images);
  // WKContentRuleList has no per-request query API. Reuse only images that
  // WebKit already loaded under the source tab's policy; never fetch around it.
  for (let i = 0; i < Math.min(article.images.length, 30); i++) {
    const image = loaded.find(img => img.currentSrc === article.images[i] && img.complete && img.naturalWidth > 0);
    if (!image || image.naturalWidth * image.naturalHeight > 4000000
        || totalPixels + image.naturalWidth * image.naturalHeight > 16000000) continue;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const data = canvas.toDataURL('image/png');
      if (data.length > 5000000 || total + data.length > 20000000) continue;
      total += data.length; totalPixels += image.naturalWidth * image.naturalHeight; article.imageData[i] = data;
    } catch { /* Cross-origin canvas restrictions: retain alt text/caption. */ }
  }
  return article;
})()`;
const files = {
  'src/renderer/pages/reader-probe.generated.js': buildReaderProbe(),
  'src/renderer/pages/reader-extract.generated.js': iosExtraction,
  'src/renderer/pages/reader-purify.generated.js': fs.readFileSync(path.join(path.dirname(require.resolve('dompurify')), 'purify.js'), 'utf8'),
  'src/renderer/pages/reader-readability-LICENSE.txt': fs.readFileSync(path.join(root, 'node_modules/@mozilla/readability/LICENSE.md'), 'utf8'),
  'src/renderer/pages/reader-dompurify-LICENSE.txt': fs.readFileSync(path.join(root, 'node_modules/dompurify/LICENSE'), 'utf8'),
  'src/renderer/pages/reader-dompurify-MPL.txt': fs.readFileSync(path.join(root, 'node_modules/dompurify/LICENSE-MPL'), 'utf8'),
};
const copy = {};
for (const locale of ['en', 'de', 'es', 'fr', 'it', 'pt-BR']) {
  const messages = JSON.parse(fs.readFileSync(path.join(root, `copy/messages/${locale}.json`)));
  copy[locale] = Object.fromEntries(Object.entries(messages).filter(([key]) => key.startsWith('reader.')).map(([key, value]) => [key, value.message]));
}
files['src/renderer/pages/reader-copy.generated.json'] = JSON.stringify(copy, null, 2) + '\n';
const pins = Object.fromEntries(['src/renderer/pages/source-serif-4-regular.woff2', 'src/renderer/pages/source-serif-4-OFL.txt',
  'node_modules/@mozilla/readability/Readability.js', 'node_modules/@mozilla/readability/Readability-readerable.js',
  'node_modules/dompurify/dist/purify.js', 'src/main/reader-readability-adaptation.js'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
files['reader-pinned.json'] = JSON.stringify({ readability: require('@mozilla/readability/package.json').version,
  dompurify: JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve('dompurify')), '../package.json'))).version, sha256: pins }, null, 2) + '\n';
for (const [file, content] of Object.entries(files)) {
  const target = path.join(root, file);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) throw new Error(`Reader resource is stale: ${file}; run npm run reader:build`);
  } else fs.writeFileSync(target, content);
}
console.log(check ? 'Reader resources and pins verified' : 'Reader resources generated');
