(async () => {
  const list = document.getElementById('list');
  const importBtn = document.getElementById('importBtn');
  const importStatus = document.getElementById('importStatus');

  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  function importSummary(added, skipped) {
    if (added === 0 && skipped > 0) return `All ${plural(skipped, 'favorite')} were already saved.`;
    const tail = skipped > 0 ? ` (skipped ${skipped} already saved)` : '';
    return `Imported ${plural(added, 'favorite')}${tail}.`;
  }

  importBtn.addEventListener('click', async () => {
    importBtn.disabled = true;
    importStatus.textContent = 'Choose a bookmarks file…';
    const res = await window.bowserPages.bookmarks.import();
    importBtn.disabled = false;
    if (res.cancelled) { importStatus.textContent = ''; return; }
    if (res.error === 'empty') { importStatus.textContent = 'No bookmarks found in that file.'; return; }
    if (res.error === 'unreadable') { importStatus.textContent = "Couldn't read that file."; return; }
    if (res.error === 'too-large') { importStatus.textContent = 'That file is too large to import.'; return; }
    importStatus.textContent = importSummary(res.added, res.skipped);
    refresh();
  });

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
