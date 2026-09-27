(async () => {
  const list = document.getElementById('list');
  const clearFinished = document.getElementById('clearFinished');
  let refreshGeneration = 0;
  let lastSignature = null;

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

  async function refresh() {
    const generation = ++refreshGeneration;
    const items = await window.bowserPages.downloads.list();
    if (generation !== refreshGeneration) return;
    const signature = JSON.stringify(items);
    if (signature === lastSignature) return;
    lastSignature = signature;
    const focusedAction = list.contains(document.activeElement)
      ? document.activeElement.dataset.actionKey : null;
    list.replaceChildren();

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.setAttribute('role', 'status');
      empty.textContent = 'Nothing downloaded yet.';
      list.append(empty);
      if (focusedAction) clearFinished.focus({ preventScroll: true });
      return;
    }

    for (const d of items) {
      const row = document.createElement('div');
      row.className = 'row';

      const main = document.createElement('div');
      main.className = 'main';
      const title = document.createElement('div');
      title.className = 'title file-name';
      title.title = d.filename;
      const { stem, ext } = window.blancDownloadsRow.splitFileName(d.filename);
      const stemEl = document.createElement('span');
      stemEl.className = 'stem';
      stemEl.textContent = stem;
      const extEl = document.createElement('span');
      extEl.className = 'ext';
      extEl.textContent = ext;
      title.append(stemEl, extEl);
      const url = document.createElement('div');
      url.className = 'url';
      url.textContent = window.blancDownloadsRow.sourceLabel(d.url);
      url.title = d.url;
      main.append(title, url);

      if (d.state === 'progressing' && d.totalBytes > 0) {
        const progress = document.createElement('div');
        progress.className = 'progress';
        progress.setAttribute('role', 'progressbar');
        progress.setAttribute('aria-label', `Downloading ${d.filename}`);
        progress.setAttribute('aria-valuemin', '0');
        progress.setAttribute('aria-valuemax', '100');
        progress.setAttribute('aria-valuenow', String(Math.round((d.receivedBytes / d.totalBytes) * 100)));
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.width = `${Math.round((d.receivedBytes / d.totalBytes) * 100)}%`;
        progress.append(bar);
        main.append(progress);
      }

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.dataset.state = d.state;
      meta.textContent =
        d.state === 'progressing'
          ? `${fmtBytes(d.receivedBytes)}${d.totalBytes ? ` / ${fmtBytes(d.totalBytes)}` : ''}`
          : `${d.private ? 'Private · ' : ''}${STATE_LABELS[d.state] ?? d.state} · ${fmtBytes(d.receivedBytes)}`;

      const actions = document.createElement('div');
      actions.className = 'actions';
      const mkBtn = (label, fn, actionKey, cls) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.dataset.actionKey = `${d.id}:${actionKey}`;
        b.setAttribute('aria-label', `${label} ${d.filename}`);
        if (cls) b.className = cls;
        b.addEventListener('click', async () => { await fn(); refresh(); });
        return b;
      };
      if (d.state === 'progressing') {
        actions.append(mkBtn('Cancel', () => window.bowserPages.downloads.cancel(d.id), 'cancel', 'danger'));
      }
      if (d.state === 'completed') {
        actions.append(
          mkBtn('Open', () => window.bowserPages.downloads.open(d.id), 'open'),
          mkBtn('Show in folder', () => window.bowserPages.downloads.show(d.id), 'show')
        );
      }
      row.append(main, meta, actions);
      list.append(row);
    }
    if (focusedAction) {
      const replacement = [...list.querySelectorAll('[data-action-key]')]
        .find((button) => button.dataset.actionKey === focusedAction);
      (replacement ?? clearFinished).focus({ preventScroll: true });
    }
  }

  clearFinished.addEventListener('click', async () => {
    await window.bowserPages.downloads.clearFinished();
    refresh();
  });

  // Live progress: poll while the page is visible.
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 750);
  refresh();
})();
