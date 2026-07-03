(async () => {
  const list = document.getElementById('list');
  const search = document.getElementById('search');
  const clearAll = document.getElementById('clearAll');

  function formatWhen(ts) {
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  async function refresh() {
    const entries = await window.bowserPages.history.list({ query: search.value, limit: 500 });
    list.replaceChildren();

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = search.value ? 'Nothing matches that search.' : 'No history yet.';
      list.append(empty);
      return;
    }

    for (const e of entries) {
      const row = document.createElement('div');
      row.className = 'row';

      const main = document.createElement('div');
      main.className = 'main';
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
      meta.textContent = formatWhen(e.visitedAt);

      const actions = document.createElement('div');
      actions.className = 'actions';
      const remove = document.createElement('button');
      remove.className = 'danger';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        await window.bowserPages.history.remove(e.url, e.visitedAt);
        refresh();
      });
      actions.append(remove);

      row.append(main, meta, actions);
      list.append(row);
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
