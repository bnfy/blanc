(async () => {
  const { t } = blancI18n;
  const list = document.getElementById('list');
  const clearFinished = document.getElementById('clearFinished');
  let refreshGeneration = 0;
  let lastSignature = null;
  let refreshInFlight = null;
  let mutationInFlight = false;
  let activeError = null;

  // Unit symbols read the same in every language; the number follows the locale.
  const units = ['B', 'KB', 'MB', 'GB'];
  const numbers = [0, 1].map((digits) => new Intl.NumberFormat(blancI18n.formatLocale(),
    { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  const fmtBytes = (n) => {
    if (!n) return `${numbers[0].format(0)} B`;
    const i = Math.min(units.length - 1, Math.floor(Math.log2(n) / 10));
    return `${numbers[i === 0 ? 0 : 1].format(n / 2 ** (10 * i))} ${units[i]}`;
  };

  const STATE_LABELS = {
    progressing: t('downloads.state.progressing'),
    interrupted: t('downloads.state.interrupted'),
    completed: t('downloads.state.completed'),
    cancelled: t('downloads.state.cancelled'),
  };

  // Fail closed on stale or unavailable data: old action buttons must not
  // remain usable after a refresh or native command fails.
  function showError(messageKey = 'downloads.loadError') {
    const moveFocus = list.contains(document.activeElement) || document.activeElement === clearFinished;
    lastSignature = null;
    clearFinished.disabled = true;
    const error = document.createElement('div');
    error.className = 'empty';
    error.setAttribute('role', 'alert');
    error.tabIndex = -1;
    error.textContent = t(messageKey);
    list.replaceChildren(error);
    activeError = error;
    if (moveFocus) error.focus({ preventScroll: true });
  }

  async function refreshOnce() {
    const generation = ++refreshGeneration;
    let items;
    try { items = await window.bowserPages.downloads.list(); }
    catch { if (generation === refreshGeneration) showError(); return; }
    if (generation !== refreshGeneration) return;
    clearFinished.disabled = false;
    const recoverFocus = document.activeElement === activeError && activeError !== null;
    activeError = null;
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
      empty.textContent = t('downloads.empty');
      list.append(empty);
      if (focusedAction || recoverFocus) clearFinished.focus({ preventScroll: true });
      return;
    }

    for (const d of items) {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.state = d.state;

      const main = document.createElement('div');
      main.className = 'main';
      main.dataset.i18nIgnore = ''; // the file's name and source
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

      if (d.security !== 'safe') {
        const warning = document.createElement('div');
        warning.className = 'meta';
        warning.setAttribute('role', 'status');
        warning.textContent = t(d.security === 'unknown' ? 'downloads.securityUnknown' : 'downloads.securityReview');
        main.append(warning);
      }

      if (d.state === 'progressing' && d.totalBytes > 0) {
        const percent = Math.max(0, Math.min(100, Math.round((d.receivedBytes / d.totalBytes) * 100)));
        const progress = document.createElement('div');
        progress.className = 'progress';
        progress.setAttribute('role', 'progressbar');
        progress.setAttribute('aria-label', t('downloads.progressLabel', { file: d.filename }));
        progress.setAttribute('aria-valuemin', '0');
        progress.setAttribute('aria-valuemax', '100');
        progress.setAttribute('aria-valuenow', String(percent));
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.width = `${percent}%`;
        progress.append(bar);
        main.append(progress);
      }

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.dataset.state = d.state;
      const size = fmtBytes(d.receivedBytes);
      if (d.state === 'progressing') {
        meta.textContent = d.totalBytes ? `${size} / ${fmtBytes(d.totalBytes)}` : size;
        meta.dataset.i18nIgnore = ''; // sizes only
      } else {
        const state = STATE_LABELS[d.state] ?? d.state;
        meta.textContent = d.private ? t('downloads.metaPrivate', { state, size }) : t('downloads.meta', { state, size });
      }

      const actions = document.createElement('div');
      actions.className = 'actions';
      const mkBtn = (label, accessibleName, fn, actionKey, cls) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.dataset.actionKey = `${d.id}:${actionKey}`;
        b.setAttribute('aria-label', accessibleName);
        if (cls) b.className = cls;
        b.addEventListener('click', async () => {
          await mutate(fn);
        });
        return b;
      };
      const api = window.bowserPages.downloads;
      const file = { file: d.filename };
      const ACTIONS = {
        cancel: () => mkBtn(t('downloads.cancel'), t('downloads.cancelLabel', file), () => api.cancel(d.id), 'cancel', 'danger'),
        resume: () => mkBtn(t('downloads.resume'), t('downloads.resumeLabel', file), () => api.resume(d.id), 'resume'),
        retry: () => mkBtn(t('downloads.retry'), t('downloads.retryLabel', file), () => api.retry(d.id), 'retry'),
        open: () => mkBtn(t('downloads.open'), t('downloads.openLabel', file), () => api.open(d.id), 'open'),
        show: () => mkBtn(t('downloads.show'), t('downloads.showLabel', file), () => api.show(d.id), 'show'),
      };
      for (const action of window.bowserPages.downloads.safeActions(d)) actions.append(ACTIONS[action]());
      row.append(main, meta, actions);
      list.append(row);
    }
    if (focusedAction) {
      const replacement = [...list.querySelectorAll('[data-action-key]')]
        .find((button) => button.dataset.actionKey === focusedAction);
      (replacement ?? clearFinished).focus({ preventScroll: true });
    } else if (recoverFocus) clearFinished.focus({ preventScroll: true });
  }

  // Polls share the current request; a mutation explicitly waits for any
  // older request and then starts a new post-mutation read.
  function refresh() {
    if (mutationInFlight) return Promise.resolve();
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = refreshOnce().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  async function mutate(fn) {
    if (mutationInFlight) return;
    mutationInFlight = true;
    ++refreshGeneration;
    lastSignature = null;
    const moveFocus = list.contains(document.activeElement) || document.activeElement === clearFinished;
    clearFinished.disabled = true;
    const status = document.createElement('div');
    status.className = 'empty';
    status.setAttribute('role', 'status');
    status.tabIndex = -1;
    status.textContent = t('downloads.updating');
    list.replaceChildren(status);
    activeError = status;
    if (moveFocus) status.focus({ preventScroll: true });
    try { await fn(); }
    // A timed-out or ambiguous native mutation may still complete. Keep the
    // sheet in an explicit unconfirmed state; a poll cannot authorize retry.
    // A future native operation-identity protocol must resolve this state.
    catch { ++refreshGeneration; showError('downloads.actionUnconfirmed'); return; }
    ++refreshGeneration;
    if (refreshInFlight) await refreshInFlight;
    mutationInFlight = false;
    await refresh();
  }

  clearFinished.addEventListener('click', async () => {
    await mutate(() => window.bowserPages.downloads.clearFinished());
  });

  // Live progress: poll while the page is visible.
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 750);
  refresh();
})();
