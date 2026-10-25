'use strict';
/* global DOMPurify, blancReaderContent */
(() => {
  const api = window.readerAPI;
  const article = document.getElementById('article');
  const reading = document.getElementById('reading');
  const toggle = document.getElementById('appearanceToggle');
  const popover = document.getElementById('appearance');
  const controls = Object.fromEntries(['theme', 'font', 'size', 'width'].map(key => [key, document.getElementById(key)]));
  function apply(value) {
    for (const key of ['theme', 'font', 'width']) document.documentElement.dataset[key] = value[key];
    document.documentElement.style.setProperty('--size', `${value.size}px`);
    for (const [key, control] of Object.entries(controls)) control.value = value[key];
    document.getElementById('sizeValue').value = String(value.size);
  }
  function closeAppearance() { popover.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  document.getElementById('exit').addEventListener('click', () => api.exit());
  toggle.addEventListener('click', () => {
    popover.hidden = !popover.hidden;
    toggle.setAttribute('aria-expanded', String(!popover.hidden));
    if (!popover.hidden) controls.theme.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !popover.hidden) { event.preventDefault(); closeAppearance(); toggle.focus(); }
  });
  document.addEventListener('pointerdown', event => {
    if (!popover.hidden && !popover.contains(event.target) && event.target !== toggle) closeAppearance();
  });
  let writeGeneration = 0;
  for (const control of Object.values(controls)) control.addEventListener('change', async () => {
    const value = { theme: controls.theme.value, font: controls.font.value, size: Number(controls.size.value), width: controls.width.value };
    apply(value);
    const generation = ++writeGeneration;
    const saved = await api.appearance(value);
    if (saved && generation === writeGeneration) apply(saved);
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || link.getAttribute('href').startsWith('#')) return;
    event.preventDefault();
    const modified = event.metaKey || event.ctrlKey;
    const disposition = event.shiftKey ? (modified ? 'foreground-tab' : 'new-window')
      : modified ? 'background-tab' : 'current-tab';
    api.openLink(link.href, disposition);
  });
  document.addEventListener('auxclick', event => {
    const link = event.target.closest('a[href]');
    if (event.button !== 1 || !link || link.getAttribute('href').startsWith('#')) return;
    event.preventDefault(); api.openLink(link.href, event.shiftKey ? 'foreground-tab' : 'background-tab');
  });
  async function initialize() {
    const data = await api.initialize();
    if (!data) return;
    apply(data.appearance);
    const { article: content, sourceUrl } = data;
    const source = document.getElementById('source');
    source.textContent = new URL(sourceUrl).hostname;
    source.href = sourceUrl;
    document.getElementById('title').textContent = content.title;
    document.title = content.title || blancI18n.t('reader.title');
    reading.dir = content.dir === 'rtl' ? 'rtl' : 'ltr';
    if (/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(content.lang)) reading.lang = content.lang;
    const metadata = document.getElementById('metadata');
    metadata.textContent = [content.byline, content.publishedTime].filter(Boolean).join(' · ');
    metadata.hidden = !metadata.textContent;
    const clean = blancReaderContent.sanitizeArticle(document, DOMPurify, content.content, sourceUrl, content.images);
    // The shared sanitizer returns only allowed HTML and reader image indexes.
    article.innerHTML = clean.content;
    const images = [...article.querySelectorAll('img[data-reader-image]')];
    async function loadImages() {
      for (;;) {
        const image = images.shift();
        if (!image) return;
        const index = Number(image.getAttribute('data-reader-image'));
        // Keep the original broker indexes even if sanitizer omitted an image.
        const originalIndex = content.images.indexOf(clean.images[index]);
        if (originalIndex < 0) continue;
        await new Promise(resolve => {
          image.onload = resolve;
          image.onerror = () => {
            const alternative = document.createElement('p');
            alternative.className = 'missing-image';
            alternative.textContent = image.alt;
            alternative.hidden = !image.alt;
            image.replaceWith(alternative);
            resolve();
          };
          image.src = `image/${originalIndex}`;
        });
      }
    }
    for (let i = 0; i < 3; i++) void loadImages();
    reading.focus({ preventScroll: true });
  }
  void initialize();
})();
