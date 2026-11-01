import { prepareIndex, search, snippet } from '../lib/search.mjs';

const dialog = document.querySelector('#site-search');
const trigger = document.querySelector('[data-site-search]');
if (dialog && trigger && typeof dialog.showModal === 'function') {
  const input = dialog.querySelector('input');
  const results = dialog.querySelector('.site-search-results');
  const status = dialog.querySelector('[role="status"]');
  const suggestions = dialog.querySelector('.site-search-suggestions');
  const recovery = dialog.querySelector('.site-search-recovery');
  let documents;
  let loading;
  let controller;
  let active = -1;
  let returnFocus;
  let previousOverflow;
  let failed = false;
  trigger.hidden = false;

  const select = index => {
    const links = [...results.querySelectorAll('a')];
    active = links.length ? (index + links.length) % links.length : -1;
    links.forEach((link, i) => link.classList.toggle('is-active', i === active));
    links[active]?.focus({ preventScroll: true });
    links[active]?.scrollIntoView({ block: 'nearest' });
  };
  const render = () => {
    active = -1;
    results.replaceChildren();
    const query = input.value.trim();
    suggestions.hidden = Boolean(query);
    recovery.hidden = !failed;
    if (!documents) { status.textContent = failed ? 'Search couldn’t load. Try again or browse Support.' : 'Loading search…'; return; }
    if (!query) { status.textContent = 'Search features, support answers and release notes.'; return; }
    const matches = search(documents, query);
    status.textContent = matches.length ? `${matches.length === 12 ? 'Top 12' : matches.length} result${matches.length === 1 ? '' : 's'}` : 'No results. Try fewer words or a feature name.';
    for (const match of matches) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = match.url;
      const category = document.createElement('span'); category.className = 'search-result-category'; category.textContent = match.category;
      const title = document.createElement('strong'); title.textContent = match.title;
      const description = document.createElement('span'); description.className = 'search-result-description'; description.textContent = snippet(match.text, query);
      link.append(category, title, description);
      item.append(link); results.append(item);
    }
  };
  const load = () => {
    if (documents || loading) return loading;
    failed = false;
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    loading = fetch('/search-index.json', { signal: controller.signal, cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error('Search unavailable'); return response.json(); })
      .then(data => {
        if (!Array.isArray(data) || !data.every(doc => typeof doc.title === 'string' && typeof doc.text === 'string' && typeof doc.url === 'string' && /^\/(?!\/)/.test(doc.url))) throw new Error('Invalid search index');
        documents = prepareIndex(data);
      })
      .catch(() => { failed = true; })
      .finally(() => { clearTimeout(timeout); loading = undefined; if (dialog.open) render(); });
    return loading;
  };
  const open = () => {
    if (dialog.open) return;
    returnFocus = document.activeElement;
    previousOverflow = document.documentElement.style.overflow;
    dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
    trigger.setAttribute('aria-expanded', 'true');
    input.focus(); render(); load();
  };
  trigger.addEventListener('click', open);
  dialog.querySelector('.site-search-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = previousOverflow;
    trigger.setAttribute('aria-expanded', 'false');
    returnFocus?.focus();
  });
  // Same-page answer links must dismiss the modal too. Modified clicks keep
  // normal browser new-tab behavior without interrupting this search.
  results.addEventListener('click', event => {
    if (event.target.closest('a') && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) dialog.close();
  });
  input.addEventListener('input', render);
  dialog.querySelectorAll('[data-search-query]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.searchQuery; input.focus(); render(); }));
  dialog.querySelector('[data-search-retry]').addEventListener('click', () => { load(); render(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button, input, a[href]')].filter(element => !element.disabled && element.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    if (event.isComposing || event.altKey || event.metaKey || event.ctrlKey) return;
    if ((event.target === input || results.contains(event.target)) && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const index = [...results.querySelectorAll('a')].indexOf(event.target);
      select(event.key === 'ArrowDown' ? index + 1 : index < 0 ? -1 : index - 1);
    } else if (event.key === 'Enter' && event.target === input && results.firstElementChild) {
      event.preventDefault(); results.querySelector('a')?.click();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.isComposing || event.altKey) return;
    const editable = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]');
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !editable) { event.preventDefault(); open(); }
  });
}
