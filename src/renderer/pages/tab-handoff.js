'use strict';

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
  accept.textContent = newWindow.checked ? 'Open in new window' : 'Open in this window';
  if (!readyData) return;
  const source = SOURCE_LABELS[readyData.sourceBrowser] || 'your other browser';
  const count = readyData.tabs.length;
  const destination = newWindow.checked
    ? `a new ${readyData.profileName || 'Personal'} window`
    : `this ${readyData.profileName || 'Personal'} window`;
  summary.textContent = `${count} ${count === 1 ? 'tab' : 'tabs'} from ${source} will open in ${destination}. Only the selected imported tab loads now; the rest start quiet.`;
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
  summary.textContent = 'The tab handoff is unavailable.';
  error.textContent = message || 'Return to the source browser and create a new handoff.';
  error.hidden = false;
  list.hidden = true;
  skipped.hidden = true;
  accept.disabled = true;
  newWindow.disabled = true;
}

function render(data) {
  if (data?.state === 'waiting') {
    summary.textContent = 'Waiting for the canceled retrieval to finish before opening this handoff…';
    return;
  }
  if (data?.state === 'loading') {
    summary.textContent = 'Retrieving and verifying the one-time handoff…';
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
    title.textContent = tab.title || tab.domain || 'Imported tab';
    const domain = document.createElement('span');
    domain.className = 'url';
    domain.textContent = tab.domain || '';
    main.append(title, domain);
    row.append(main);

    if (tab.active) {
      const badge = document.createElement('span');
      badge.className = 'meta tab-handoff-active';
      badge.textContent = 'opens first';
      row.append(badge);
    }
    list.append(row);
  }
  list.hidden = false;
  if (data.skippedCount > 0) {
    skipped.textContent = `${data.skippedCount} unsupported or unsafe ${data.skippedCount === 1 ? 'tab was' : 'tabs were'} left behind.`;
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
  accept.textContent = 'Opening…';
  try {
    const result = await api.accept(newWindow.checked ? 'new-window' : 'current-window');
    if (!result?.ok) {
      if (result?.retryable) {
        error.textContent = 'Blanc could not open these tabs. Your existing tabs are unchanged. Try again.';
        error.hidden = false;
        accept.disabled = false;
        newWindow.disabled = false;
      } else showError('This handoff is no longer available.');
    }
  } catch {
    showError('Blanc could not open this tab set. Try the handoff again.');
  } finally {
    cancel.disabled = false;
    updateDestination();
  }
});

cancel.addEventListener('click', () => api?.cancel());

if (!api) showError('Tab import is not available in this build of Blanc.');
else api.get().then(render).catch(() => showError('Blanc could not read this handoff.'));
