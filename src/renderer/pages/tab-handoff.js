'use strict';

const api = window.bowserPages?.tabHandoff;
const summary = document.getElementById('summary');
const error = document.getElementById('error');
const list = document.getElementById('list');
const skipped = document.getElementById('skipped');
const accept = document.getElementById('accept');
const cancel = document.getElementById('cancel');

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
  const source = SOURCE_LABELS[data.sourceBrowser] || 'your other browser';
  const count = data.tabs.length;
  summary.textContent = `${count} ${count === 1 ? 'tab' : 'tabs'} from ${source} will open in a new ${data.profileName || 'Personal'} window. Only the selected tab loads now; the rest start quiet.`;
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
}

accept.addEventListener('click', async () => {
  accept.disabled = true;
  cancel.disabled = true;
  accept.textContent = 'Opening…';
  try {
    const result = await api.accept();
    if (!result?.ok) showError('This handoff is no longer available.');
  } catch {
    showError('Blanc could not open this tab set. Try the handoff again.');
  } finally {
    cancel.disabled = false;
  }
});

cancel.addEventListener('click', () => api?.cancel());

if (!api) showError('Tab import is not available in this build of Blanc.');
else api.get().then(render).catch(() => showError('Blanc could not read this handoff.'));
