(async () => {
  const { t } = blancI18n;
  const list = document.getElementById('list');
  const search = document.getElementById('search');
  const clearAll = document.getElementById('clearAll');

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

  async function refresh() {
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
      const heading = document.createElement('h2');
      heading.className = 'day-heading';
      heading.textContent = group.label;
      // Today and Yesterday come from the catalog; other days are locale dates.
      if (!group.relative) heading.dataset.i18nIgnore = '';
      list.append(heading);
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

  refresh();
})();
