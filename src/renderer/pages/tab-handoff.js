'use strict';

const { t } = blancI18n;
const api = window.bowserPages?.tabHandoff;
const summary = document.getElementById('summary');
const error = document.getElementById('error');
const list = document.getElementById('list');
const skipped = document.getElementById('skipped');
const accept = document.getElementById('accept');
const cancel = document.getElementById('cancel');
const newWindow = document.getElementById('newWindow');
let readyData = null;

function updateDestination() {
  accept.textContent = newWindow.checked ? t('tabHandoff.openNew') : t('tabHandoff.openHere');
  if (!readyData) return;
  const params = {
    count: readyData.tabs.length,
    source: SOURCE_LABELS[readyData.sourceBrowser] || t('tabHandoff.otherBrowser'),
    profile: readyData.profileName || t('tabHandoff.personalProfile'),
  };
  summary.textContent = newWindow.checked ? t('tabHandoff.summaryNew', params) : t('tabHandoff.summaryHere', params);
}

const SOURCE_LABELS = {
  chrome: 'Chrome',
  edge: 'Edge',
  brave: 'Brave',
  opera: 'Opera',
  vivaldi: 'Vivaldi',
  firefox: 'Firefox',
  safari: 'Safari',
};

function showError(message) {
  summary.textContent = t('tabHandoff.unavailable');
  error.textContent = message || t('tabHandoff.createNew');
  error.hidden = false;
  list.hidden = true;
  skipped.hidden = true;
  accept.disabled = true;
  newWindow.disabled = true;
}

function render(data) {
  if (data?.state === 'waiting') {
    summary.textContent = t('tabHandoff.waiting');
    return;
  }
  if (data?.state === 'loading') {
    summary.textContent = t('tabHandoff.loading');
    return;
  }
  if (!data || data.state !== 'ready' || !Array.isArray(data.tabs) || !data.tabs.length) {
    showError(data?.message);
    return;
  }
  readyData = data;
  updateDestination();
  list.replaceChildren();
  for (const tab of data.tabs) {
    const row = document.createElement('div');
    row.className = 'row tab-handoff-row';

    const main = document.createElement('div');
    main.className = 'main';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = tab.title || tab.domain || t('tabHandoff.untitled');
    // The tab's own title and domain.
    if (tab.title || tab.domain) main.dataset.i18nIgnore = '';
    const domain = document.createElement('span');
    domain.className = 'url';
    domain.textContent = tab.domain || '';
    main.append(title, domain);
    row.append(main);

    if (tab.active) {
      const badge = document.createElement('span');
      badge.className = 'meta tab-handoff-active';
      badge.textContent = t('tabHandoff.opensFirst');
      row.append(badge);
    }
    list.append(row);
  }
  list.hidden = false;
  if (data.skippedCount > 0) {
    skipped.textContent = t('tabHandoff.skipped', { count: data.skippedCount });
    skipped.hidden = false;
  }
  accept.disabled = false;
  newWindow.disabled = false;
}

newWindow.addEventListener('change', updateDestination);

accept.addEventListener('click', async () => {
  accept.disabled = true;
  cancel.disabled = true;
  newWindow.disabled = true;
  error.hidden = true;
  accept.textContent = t('tabHandoff.opening');
  try {
    const result = await api.accept(newWindow.checked ? 'new-window' : 'current-window');
    if (!result?.ok) {
      if (result?.retryable) {
        error.textContent = t('tabHandoff.openFailed');
        error.hidden = false;
        accept.disabled = false;
        newWindow.disabled = false;
      } else showError(t('tabHandoff.gone'));
    }
  } catch {
    showError(t('tabHandoff.openThrew'));
  } finally {
    cancel.disabled = false;
    updateDestination();
  }
});

cancel.addEventListener('click', () => api?.cancel());

// The summary is this script's alone (the page's static text is applied after
// it runs), so it starts here.
summary.textContent = t('tabHandoff.checking');
if (!api) showError(t('tabHandoff.unsupported'));
else api.get().then(render).catch(() => showError(t('tabHandoff.readFailed')));
