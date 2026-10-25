'use strict';

const READER_WORLD_ID = 1004;
const READER_SCHEME = 'blanc-reader';
const DEFAULT_APPEARANCE = Object.freeze({ theme: 'system', font: 'serif', size: 20, width: 'comfortable' });
const MAX_ARTICLE_BYTES = 5 * 1024 * 1024;
const MAX_ARTICLE_ELEMENTS = 50000;

function normalizeAppearance(value) {
  return {
    theme: ['system', 'light', 'dark', 'sepia'].includes(value?.theme) ? value.theme : 'system',
    font: ['serif', 'sans', 'inter', 'mono'].includes(value?.font) ? value.font : 'serif',
    size: Number.isInteger(value?.size) && value.size >= 16 && value.size <= 28 && value.size % 2 === 0 ? value.size : 20,
    width: ['narrow', 'comfortable', 'wide'].includes(value?.width) ? value.width : 'comfortable',
  };
}

function webUrl(value, base) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value, base);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function eligible(tab, wc) {
  return !!wc && !wc.isDestroyed() && !tab.asleep && !tab.sleeping && !tab.inert
    && !tab.inheritsDocumentPolicy && !tab.isLoading && !!webUrl(wc.getURL());
}

function validArticle(article) {
  return !!article && typeof article.content === 'string' && article.content.length <= MAX_ARTICLE_BYTES
    && typeof article.textContent === 'string' && article.textContent.trim().length >= 200
    && Array.isArray(article.images) && article.images.length <= 100;
}

module.exports = { READER_WORLD_ID, READER_SCHEME, DEFAULT_APPEARANCE,
  MAX_ARTICLE_BYTES, MAX_ARTICLE_ELEMENTS, normalizeAppearance, webUrl, eligible, validArticle };
