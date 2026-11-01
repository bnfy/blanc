'use strict';

// Shared by the isolated extractor and the reader document. No privileges.
// Sanitize into a detached fragment, resolve its URLs, then sanitize again
// before insertion. Never let an article choose a reader asset or IPC action.
((root) => {
  function sanitizeArticle(document, purify, html, sourceUrl, imageUrls = null) {
    const tags = ['article', 'section', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'img', 'figure', 'figcaption', 'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'pre', 'code',
      'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'br', 'hr', 'span', 'time'];
    const options = { ALLOWED_TAGS: tags,
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'id', 'lang', 'dir', 'colspan', 'rowspan', 'start',
        ...(imageUrls ? ['data-reader-image'] : [])],
      ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, RETURN_DOM_FRAGMENT: true };
    const fragment = purify.sanitize(html, options);
    const images = [];
    const urlFor = (value) => {
      try {
        const url = new URL(value, sourceUrl);
        return /^https?:$/.test(url.protocol) && !url.username && !url.password && url.href.length <= 8192 ? url : null;
      } catch { return null; }
    };
    const source = new URL(sourceUrl);
    const readerId = value => value.startsWith('reader-content-') ? value : `reader-content-${value}`;
    for (const node of fragment.querySelectorAll('[id]')) node.id = readerId(node.id);
    for (const link of fragment.querySelectorAll('a')) {
      const url = urlFor(link.getAttribute('href') || '');
      link.removeAttribute('href');
      if (url) {
        const sameDocument = url.origin === source.origin && url.pathname === source.pathname && url.search === source.search;
        let fragmentId = null;
        try { if (sameDocument && url.hash) fragmentId = readerId(decodeURIComponent(url.hash.slice(1))); } catch {}
        link.setAttribute('href', fragmentId ? `#${encodeURIComponent(fragmentId)}` : url.href);
        link.setAttribute('rel', 'noreferrer noopener');
      }
    }
    for (const image of fragment.querySelectorAll('img')) {
      const imageIndex = image.getAttribute('data-reader-image');
      const raw = imageUrls && /^(0|[1-9]\d?)$/.test(imageIndex || '')
        ? imageUrls[Number(imageIndex)] : image.getAttribute('src');
      image.removeAttribute('src');
      image.removeAttribute('data-reader-image');
      const url = raw ? urlFor(raw) : null;
      const permitted = url && (!imageUrls || imageUrls.includes(url.href));
      if (permitted && images.length < 100) {
        const index = images.push(url.href) - 1;
        image.setAttribute('data-reader-image', String(index));
      }
    }
    const holder = document.createElement('div');
    holder.append(fragment);
    return { content: holder.innerHTML, images };
  }
  root.blancReaderContent = { sanitizeArticle };
})(typeof self === 'object' ? self : globalThis);
