'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { MAX_ARTICLE_BYTES, MAX_ARTICLE_ELEMENTS } = require('./reader-model');
const { adaptReadability } = require('./reader-readability-adaptation');
let scripts;
function sources() {
  return scripts ??= {
    heuristic: fs.readFileSync(require.resolve('@mozilla/readability/Readability-readerable.js'), 'utf8'),
    readability: adaptReadability(fs.readFileSync(require.resolve('@mozilla/readability/Readability.js'), 'utf8')),
    purify: fs.readFileSync(path.join(path.dirname(require.resolve('dompurify')), 'purify.js'), 'utf8'),
    content: fs.readFileSync(path.join(__dirname, '../renderer/pages/reader-content.js'), 'utf8'),
  };
}
function buildReaderProbe() {
  return `(() => { ${sources().heuristic}\n
    if (document.contentType !== 'text/html' && document.contentType !== 'application/xhtml+xml') return false;
    if (document.getElementsByTagName('*').length > ${MAX_ARTICLE_ELEMENTS}) return false;
    return isProbablyReaderable(document);
  })()`;
}
function buildReaderExtraction() {
  const code = sources();
  return `(() => { ${code.readability}\n${code.purify}\n${code.content}\n
    if (!['text/html', 'application/xhtml+xml'].includes(document.contentType)) return null;
    if (document.getElementsByTagName('*').length > ${MAX_ARTICLE_ELEMENTS}) return null;
    if (document.documentElement.outerHTML.length > ${MAX_ARTICLE_BYTES}) return null;
    const clone = document.cloneNode(true);
    // Content hidden behind a consent gate, paywall, or collapsed section
    // must not become newly visible through extraction. Do not expand it.
    const originals = document.querySelectorAll('*');
    const copies = clone.querySelectorAll('*');
    for (let i = originals.length - 1; i >= 0; i--) {
      const original = originals[i], copy = copies[i];
      if (!copy || ['HTML', 'HEAD', 'BODY'].includes(original.tagName) || document.head?.contains(original)) continue;
      if (original.hidden || original.getAttribute('aria-hidden') === 'true'
          || (typeof original.checkVisibility === 'function' && !original.checkVisibility({checkVisibilityCSS: true, checkOpacity: true}))) copy.remove();
      if (original.tagName === 'IMG' && original.currentSrc) copy.setAttribute('src', original.currentSrc);
    }
    const article = new Readability(clone, { maxElemsToParse: ${MAX_ARTICLE_ELEMENTS} }).parse();
    if (!article || !article.textContent || article.textContent.trim().length < 200) return null;
    const clean = blancReaderContent.sanitizeArticle(document, DOMPurify, article.content, location.href);
    if (clean.content.length > ${MAX_ARTICLE_BYTES}) return null;
    const text = value => typeof value === 'string' ? value.slice(0, 1000) : '';
    return { content: clean.content, images: clean.images, textContent: article.textContent.slice(0, ${MAX_ARTICLE_BYTES}),
      title: text(article.title), byline: text(article.byline), publishedTime: text(article.publishedTime),
      lang: text(article.lang), dir: article.dir === 'rtl' ? 'rtl' : 'ltr' };
  })()`;
}
module.exports = { buildReaderProbe, buildReaderExtraction };
