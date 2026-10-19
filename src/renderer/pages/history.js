(async () => {
  const { t } = blancI18n;
  const list = document.getElementById('list');
  const search = document.getElementById('search');
  const clearAll = document.getElementById('clearAll');
  const clearArchive = document.getElementById('clearArchive');
  const viewVisits = document.getElementById('viewVisits');
  const viewArchived = document.getElementById('viewArchived');
  // F52: /archive opens this sheet on the Archived view.
  let archivedView = new URLSearchParams(location.search).get('view') === 'archived';

  function historyRow(e) {
    const row = document.createElement('div');
    row.className = 'row';

    const main = document.createElement('div');
    main.className = 'main';
    main.dataset.i18nIgnore = ''; // the page's title and address
    const title = document.createElement('a');
    title.className = 'title';
    title.href = e.url;
    title.textContent = e.title;
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = e.url;
    main.append(title, url);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = window.blancHistoryGroups.timeLabel(e.visitedAt, blancI18n.formatLocale());
    meta.dataset.i18nIgnore = ''; // the locale's own time format

    const actions = document.createElement('div');
    actions.className = 'actions';
    const remove = document.createElement('button');
    remove.className = 'danger';
    remove.textContent = t('history.remove');
    remove.setAttribute('aria-label', t('history.removeLabel', { title: e.title }));
    remove.addEventListener('click', async () => {
      await window.bowserPages.history.remove(e.url, e.visitedAt);
      refresh();
    });
    actions.append(remove);

    row.append(window.blancRowIcon.rowIcon(document, e.url, e.favicon), main, meta, actions);
    return row;
  }

  function archivedRow(e) {
    const row = document.createElement('div');
    row.className = 'row';

    const main = document.createElement('div');
    main.className = 'main';
    main.dataset.i18nIgnore = ''; // the page's title and address
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = e.title || e.url;
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = e.url;
    main.append(title, url);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const when = window.blancHistoryGroups.timeLabel(e.archivedAt, blancI18n.formatLocale());
    meta.textContent = e.spaceName ? `${e.spaceName} · ${when}` : when;
    meta.dataset.i18nIgnore = ''; // a Space name and the locale's own time format

    const actions = document.createElement('div');
    actions.className = 'actions';
    const restore = document.createElement('button');
    restore.className = 'archived-restore';
    restore.textContent = t('history.archived.restore');
    restore.setAttribute('aria-label', t('history.archived.restoreLabel', { title: e.title || e.url }));
    restore.addEventListener('click', async () => {
      await window.bowserPages.archive.restore(e.id);
      refresh();
    });
    const forget = document.createElement('button');
    forget.className = 'danger';
    forget.textContent = t('history.remove');
    forget.setAttribute('aria-label', t('history.archived.forgetLabel', { title: e.title || e.url }));
    forget.addEventListener('click', async () => {
      await window.bowserPages.archive.forget(e.id);
      refresh();
    });
    actions.append(restore, forget);

    row.append(window.blancRowIcon.rowIcon(document, e.url, e.favicon), main, meta, actions);
    return row;
  }

  function dayHeading(group) {
    const heading = document.createElement('h2');
    heading.className = 'day-heading';
    heading.textContent = group.label;
    // Today and Yesterday come from the catalog; other days are locale dates.
    if (!group.relative) heading.dataset.i18nIgnore = '';
    return heading;
  }

  function emptyState(message) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.setAttribute('role', 'status');
    empty.textContent = message;
    list.append(empty);
  }

  function applyView() {
    viewVisits.setAttribute('aria-pressed', String(!archivedView));
    viewArchived.setAttribute('aria-pressed', String(archivedView));
    clearAll.hidden = archivedView;
    clearArchive.hidden = !archivedView;
    const label = t(archivedView ? 'history.archived.search' : 'history.search');
    search.placeholder = label;
    search.setAttribute('aria-label', label);
  }

  async function refreshArchived() {
    const entries = await window.bowserPages.archive.list({ query: search.value });
    list.replaceChildren();
    if (entries.length === 0) {
      emptyState(search.value ? t('history.noMatches') : t('history.archived.empty'));
      return;
    }
    // Day headings, like the visit list, keyed by when each tab was archived.
    const dated = entries.map((e) => ({ ...e, visitedAt: e.archivedAt }));
    for (const group of window.blancHistoryGroups.groupByDay(dated, new Date(), blancI18n.formatLocale())) {
      list.append(dayHeading(group));
      for (const e of group.entries) list.append(archivedRow(e));
    }
  }

  async function refresh() {
    if (archivedView) return refreshArchived();
    const entries = await window.bowserPages.history.list({ query: search.value, limit: 500 });
    list.replaceChildren();

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.setAttribute('role', 'status');
      empty.textContent = search.value ? t('history.noMatches') : t('history.empty');
      list.append(empty);
      return;
    }

    for (const group of window.blancHistoryGroups.groupByDay(entries, new Date(), blancI18n.formatLocale())) {
      list.append(dayHeading(group));
      for (const e of group.entries) list.append(historyRow(e));
    }
  }

  let debounce = null;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 150);
  });

  clearAll.addEventListener('click', async () => {
    await window.bowserPages.history.clear();
    refresh();
  });

  clearArchive.addEventListener('click', async () => {
    await window.bowserPages.archive.clear();
    refresh();
  });

  function showView(archived) {
    archivedView = archived;
    applyView();
    refresh();
  }
  viewVisits.addEventListener('click', () => showView(false));
  viewArchived.addEventListener('click', () => showView(true));

  applyView();
  refresh();
})();
