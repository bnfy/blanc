'use strict';
/* global DOMPurify, blancReaderContent */
(() => {
  const api = window.readerAPI;
  const article = document.getElementById('article');
  const reading = document.getElementById('reading');
  const toggle = document.getElementById('appearanceToggle');
  const popover = document.getElementById('appearance');
  const controls = Object.fromEntries(['theme', 'font', 'size', 'width'].map(key => [key, document.getElementById(key)]));
  const fontPicker = document.getElementById('fontPicker');
  const fontToggle = document.getElementById('fontToggle');
  const fontOptions = document.getElementById('fontOptions');
  const fontSelected = document.getElementById('fontSelected');
  const fontRadios = [...fontOptions.querySelectorAll('input[type=radio]')];
  function apply(value) {
    for (const key of ['theme', 'font', 'width']) document.documentElement.dataset[key] = value[key];
    document.documentElement.style.setProperty('--size', `${value.size}px`);
    for (const [key, control] of Object.entries(controls)) control.value = value[key];
    document.getElementById('sizeValue').value = String(value.size);
    for (const radio of fontRadios) radio.checked = radio.value === value.font;
    const selected = fontRadios.find(radio => radio.checked);
    if (selected) {
      fontSelected.textContent = blancI18n.t(selected.nextElementSibling.dataset.i18n);
      fontSelected.dataset.font = value.font;
    }
  }
  function closeFontPicker(restoreFocus = false) {
    fontOptions.hidden = true;
    fontToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) fontToggle.focus();
  }
  function visibleViewport() {
    const viewport = window.visualViewport;
    return { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? document.documentElement.clientWidth,
      height: viewport?.height ?? window.innerHeight };
  }
  function placeFontPicker() {
    if (fontOptions.hidden || popover.hidden) return;
    const viewport = visibleViewport();
    const button = fontToggle.getBoundingClientRect();
    const margin = 8, gap = 6;
    const left = viewport.left + margin, right = viewport.left + viewport.width - margin;
    const top = viewport.top + margin, bottom = viewport.top + viewport.height - margin;
    fontOptions.style.maxHeight = 'none';
    fontOptions.style.width = 'max-content';
    const width = Math.min(Math.max(button.width, fontOptions.getBoundingClientRect().width), right - left);
    fontOptions.style.width = `${Math.max(0, width)}px`;
    const height = fontOptions.scrollHeight + 2;
    const below = Math.max(0, bottom - button.bottom - gap);
    const above = Math.max(0, button.top - gap - top);
    const downward = below >= height || below >= above;
    const room = downward ? below : above;
    fontOptions.style.maxHeight = `${room}px`;
    const drawnHeight = fontOptions.getBoundingClientRect().height;
    fontOptions.style.left = `${Math.max(left, Math.min(button.right - width, right - width))}px`;
    fontOptions.style.top = `${Math.max(top, downward ? button.bottom + gap : button.top - gap - drawnHeight)}px`;
  }
  function placeAppearance() {
    if (popover.hidden) return;
    const viewport = visibleViewport();
    popover.style.maxHeight = `${Math.max(0, viewport.top + viewport.height - popover.getBoundingClientRect().top - 8)}px`;
    placeFontPicker();
  }
  window.addEventListener('resize', placeAppearance);
  window.visualViewport?.addEventListener('resize', placeAppearance);
  window.visualViewport?.addEventListener('scroll', placeAppearance);
  popover.addEventListener('scroll', placeFontPicker);
  function openFontPicker() {
    fontOptions.hidden = false;
    fontToggle.setAttribute('aria-expanded', 'true');
    placeFontPicker();
    const selected = fontRadios.find(radio => radio.checked);
    selected?.focus({ preventScroll: true });
    if (selected) fontOptions.scrollTop = Math.max(0, selected.parentElement.offsetTop - fontOptions.clientHeight / 2);

  }
  fontToggle.addEventListener('click', () => fontOptions.hidden ? openFontPicker() : closeFontPicker());
  fontToggle.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openFontPicker(); }
  });
  fontOptions.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); closeFontPicker(true);
    }
  });
  for (const radio of fontRadios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      controls.font.value = radio.value;
      controls.font.dispatchEvent(new Event('change'));
    });
    radio.addEventListener('click', event => {
      // Native radio arrow/Space activation dispatches a zero-detail click.
      // Keep the group open for keyboard browsing until Enter or Escape.
      if (event.detail > 0 || !event.isTrusted) closeFontPicker(true);
    });
  }
  function closeAppearance() { closeFontPicker(); popover.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  document.getElementById('exit').addEventListener('click', () => api.exit());
  toggle.addEventListener('click', () => {
    popover.hidden = !popover.hidden;
    toggle.setAttribute('aria-expanded', String(!popover.hidden));
    if (!popover.hidden) { placeAppearance(); controls.theme.focus(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !popover.hidden) { event.preventDefault(); closeAppearance(); toggle.focus(); }
  });
  document.addEventListener('pointerdown', event => {
    if (!fontPicker.contains(event.target)) closeFontPicker();
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
