(async () => {
  const list = document.getElementById('list');

  async function refresh() {
    const items = await window.bowserPages.bookmarks.list();
    list.replaceChildren();

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No favorites yet. Press Ctrl/Cmd+D on a page to add one.';
      list.append(empty);
      return;
    }

    for (const b of [...items].reverse()) {
      const row = document.createElement('div');
      row.className = 'row';

      const main = document.createElement('div');
      main.className = 'main';
      const title = document.createElement('a');
      title.className = 'title';
      title.href = b.url;
      title.textContent = b.title;
      const url = document.createElement('div');
      url.className = 'url';
      url.textContent = b.url;
      main.append(title, url);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = new Date(b.addedAt).toLocaleDateString();

      const actions = document.createElement('div');
      actions.className = 'actions';
      const remove = document.createElement('button');
      remove.className = 'danger';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        await window.bowserPages.bookmarks.remove(b.id);
        refresh();
      });
      actions.append(remove);

      row.append(main, meta, actions);
      list.append(row);
    }
  }

  refresh();
})();
