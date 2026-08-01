(async () => {
  const list = document.getElementById('list');
  const clearFinished = document.getElementById('clearFinished');

  const fmtBytes = (n) => {
    if (!n) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log2(n) / 10));
    return `${(n / 2 ** (10 * i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const STATE_LABELS = {
    progressing: 'Downloading…',
    interrupted: 'Interrupted',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  let refreshing = false;
  let refreshQueued = false;

  async function refresh() {
    // A progress burst can arrive while an IPC list request is in flight.
    // Coalesce it into one follow-up refresh so a slower earlier response can
    // never leave the visible sheet behind the latest main-process record.
    if (refreshing) {
      refreshQueued = true;
      return;
    }
    refreshing = true;
    try {
      do {
        refreshQueued = false;
        const items = await window.bowserPages.downloads.list();
        list.replaceChildren();

        if (items.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'empty';
          empty.textContent = 'Nothing downloaded yet.';
          list.append(empty);
          continue;
        }

        for (const d of items) {
          const row = document.createElement('div');
          row.className = 'row';

          const main = document.createElement('div');
          main.className = 'main';
          const title = document.createElement('div');
          title.className = 'title';
          title.textContent = d.filename;
          const url = document.createElement('div');
          url.className = 'url';
          url.textContent = d.url;
          main.append(title, url);

          if (d.state === 'progressing' && d.totalBytes > 0) {
            const progress = document.createElement('div');
            progress.className = 'progress';
            const bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.width = `${Math.round((d.receivedBytes / d.totalBytes) * 100)}%`;
            progress.append(bar);
            main.append(progress);
          }

          const meta = document.createElement('div');
          meta.className = 'meta';
          meta.textContent =
            d.state === 'progressing'
              ? `${fmtBytes(d.receivedBytes)}${d.totalBytes ? ` / ${fmtBytes(d.totalBytes)}` : ''}`
              : `${STATE_LABELS[d.state] ?? d.state} · ${fmtBytes(d.receivedBytes)}`;

          const actions = document.createElement('div');
          actions.className = 'actions';
          const mkBtn = (label, fn, cls) => {
            const b = document.createElement('button');
            b.textContent = label;
            if (cls) b.className = cls;
            b.addEventListener('click', async () => { await fn(); refresh(); });
            return b;
          };
          if (d.state === 'progressing') {
            actions.append(mkBtn('Cancel', () => window.bowserPages.downloads.cancel(d.id), 'danger'));
          }
          if (d.state === 'completed') {
            actions.append(
              mkBtn('Open', () => window.bowserPages.downloads.open(d.id)),
              mkBtn('Show in folder', () => window.bowserPages.downloads.show(d.id))
            );
          }
          row.append(main, meta, actions);
          list.append(row);
        }
      } while (refreshQueued);
    } finally {
      refreshing = false;
    }
  }

  clearFinished.addEventListener('click', async () => {
    await window.bowserPages.downloads.clearFinished();
    refresh();
  });

  window.bowserPages.downloads.onChanged(refresh);
  refresh();
})();
