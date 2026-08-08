const isPrivate = new URLSearchParams(location.search).has('private');
const isMac = navigator.platform.startsWith('Mac');

// Opened as a private tab (blanc://newtab/?private=1): private theme,
// and the ledger's margin copy explains the deal instead of stats.
if (isPrivate) document.documentElement.dataset.theme = 'private';

document.getElementById('dateLine').textContent = isPrivate
  ? 'private tab'
  : new Date()
      .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      .toLowerCase();

document.getElementById('goAnywhere').textContent = `${isMac ? '⌘' : 'Ctrl+'}L to go anywhere`;

if (isPrivate) {
  document.getElementById('footerLeft').textContent =
    'not saved to history · site data stays in a private in-memory session · passkeys created here are lost on quit';
}

const startupCard = document.getElementById('startupCard');
const startupTitle = document.getElementById('startupTitle');
const startupMessage = document.getElementById('startupMessage');
const startupActions = document.getElementById('startupActions');
const startupRetry = document.getElementById('startupRetry');
const startupContinue = document.getElementById('startupContinue');
const privacyCard = document.getElementById('privacyCard');
const privacySuggestions = document.getElementById('privacySuggestions');
const privacyPing = document.getElementById('privacyPing');
const privacyContinue = document.getElementById('privacyContinue');
const privacyError = document.getElementById('privacyError');
const migrationChoice = document.getElementById('migrationChoice');
const migrationSource = document.getElementById('migrationSource');
const migrationImport = document.getElementById('migrationImport');
const migrationFind = document.getElementById('migrationFind');
const migrationStatus = document.getElementById('migrationStatus');

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The offer is shown unconditionally; discovery reads other browsers' profile
// directories, so it waits for an explicit ask rather than running on render.
async function loadMigrationSources() {
  if (isPrivate) return false;
  const sources = await window.bowserPages?.bookmarks.browserSources();
  migrationSource.replaceChildren();
  for (const source of sources ?? []) {
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = source.label;
    migrationSource.append(option);
  }
  const available = !!sources?.length;
  migrationSource.hidden = !available;
  migrationImport.hidden = !available;
  migrationFind.hidden = available;
  return available;
}

migrationFind.addEventListener('click', async () => {
  migrationFind.disabled = true;
  migrationStatus.textContent = 'Looking for other browsers…';
  try {
    const found = await loadMigrationSources();
    migrationStatus.textContent = found ? '' : 'No other browser profiles found.';
  } catch {
    migrationStatus.textContent = "Couldn't check for other browsers.";
  } finally {
    migrationFind.disabled = false;
  }
});

function renderLaunchStatus({ startup, privacy } = {}) {
  if (isPrivate) {
    startupCard.hidden = true;
    privacyCard.hidden = true;
    return;
  }

  const showStartup = startup?.phase === 'initializing' || startup?.phase === 'failed';
  const startupWasHidden = startupCard.hidden;
  startupCard.hidden = !showStartup;
  if (showStartup) {
    const failed = startup.phase === 'failed';
    startupTitle.textContent = failed
      ? 'Blocking could not start.'
      : startup.attempt > 1
        ? 'Retrying blocking…'
        : 'Preparing blocking…';
    startupMessage.textContent = failed
      ? 'Blanc has not opened queued web pages because its ad and tracker filters are unavailable. Retry, or explicitly continue with blocking turned off.'
      : 'Blanc is preparing its local ad and tracker filters before opening web pages.';
    startupActions.hidden = !failed;
    if (failed && startupWasHidden) startupRetry.focus();
  }

  const showPrivacy = !!privacy?.required;
  const privacyWasHidden = privacyCard.hidden;
  privacyCard.hidden = !showPrivacy;
  if (showPrivacy) {
    // Offer migration up front; nothing is read until "Look for other browsers".
    migrationChoice.hidden = false;
    if (privacyWasHidden) {
      privacySuggestions.checked = !!privacy.searchSuggestions;
      privacyPing.checked = !!privacy.usagePing;
    }
    if (privacyWasHidden && startup?.phase !== 'failed') privacyContinue.focus();
  }
}

startupRetry.addEventListener('click', async () => {
  startupRetry.disabled = true;
  startupContinue.disabled = true;
  try {
    await window.bowserPages?.start.retryStartup();
  } finally {
    startupRetry.disabled = false;
    startupContinue.disabled = false;
  }
});

migrationImport.addEventListener('click', async () => {
  if (!migrationSource.value) return;
  migrationImport.disabled = true;
  migrationSource.disabled = true;
  migrationStatus.textContent = 'Importing favorites…';
  try {
    const result = await window.bowserPages?.bookmarks.importBrowser(migrationSource.value);
    if (result?.error === 'source-unavailable') {
      migrationStatus.textContent = 'That browser profile is no longer available.';
      migrationSourcesLoaded = false;
      await loadMigrationSources();
    } else if (result?.error === 'empty') {
      migrationStatus.textContent = 'No favorites found in that browser profile.';
    } else if (result?.error === 'too-large') {
      migrationStatus.textContent = 'That browser profile is too large to import safely.';
    } else if (result?.error) {
      migrationStatus.textContent = "Couldn't read that browser profile.";
    } else {
      const skipped = result.skipped
        ? `; skipped ${plural(result.skipped, 'favorite')} already saved`
        : '';
      migrationStatus.textContent =
        `Imported ${plural(result.added, 'favorite')} from ${result.source.label}${skipped}.`;
    }
  } finally {
    migrationImport.disabled = false;
    migrationSource.disabled = false;
  }
});

startupContinue.addEventListener('click', async () => {
  startupRetry.disabled = true;
  startupContinue.disabled = true;
  try {
    await window.bowserPages?.start.continueWithoutBlocking();
  } finally {
    startupRetry.disabled = false;
    startupContinue.disabled = false;
  }
});

privacyContinue.addEventListener('click', async () => {
  privacyContinue.disabled = true;
  privacyError.textContent = '';
  try {
    const result = await window.bowserPages?.start.completePrivacy({
      searchSuggestions: privacySuggestions.checked,
      usagePing: privacyPing.checked,
    });
    if (!result?.completed) {
      privacyError.textContent = result?.error === 'write-failed'
        ? 'Could not save these choices. Check disk access and try again.'
        : 'Choose both options and try again.';
    }
  } finally {
    privacyContinue.disabled = false;
  }
});

window.bowserPages?.appVersion().then((version) => {
  document.getElementById('version').textContent = `v${version}`;
});

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

window.bowserPages?.bookmarks.list().then((items) => {
  const list = document.getElementById('favoritesList');
  if (!items.length) {
    const hint = document.createElement('div');
    hint.className = 'ledger-empty';
    hint.textContent = '♥ a page to pin it here';
    list.appendChild(hint);
    return;
  }
  for (const b of items.slice(0, 6)) {
    const row = document.createElement('a');
    row.className = 'fav';
    row.href = b.url;
    const host = hostOf(b.url);
    const tile = document.createElement('span');
    tile.className = 'tile';
    // Letter shows immediately and synchronously — never a blank tile
    // while a favicon is (maybe slowly) loading. Private tabs skip the
    // favicon entirely: fetching a bookmarked site's icon on every new
    // private tab would be a live network trace, which private mode
    // otherwise avoids.
    tile.textContent = (host || b.title || '').trim().charAt(0).toLowerCase() || '·';
    if (!isPrivate && b.favicon) {
      const probe = new Image();
      probe.onload = () => {
        tile.textContent = '';
        tile.classList.add('has-icon');
        tile.style.backgroundImage = `url("${b.favicon.replace(/["\\]/g, '\\$&')}")`;
      };
      // A stored favicon URL can go stale (site changed/removed it) —
      // clear it so future loads stop retrying a dead request.
      probe.onerror = () => window.bowserPages?.bookmarks.clearFavicon(b.url);
      probe.src = b.favicon;
    }
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = b.title || b.url;
    const hostEl = document.createElement('span');
    hostEl.className = 'host';
    hostEl.textContent = host;
    row.append(tile, name, hostEl);
    list.appendChild(row);
  }
});

// Tab sync: other devices' tabs, read-only — clicking navigates the current
// tab, same as favorites above. Renders only when snapshots exist so the
// ledger stays quiet otherwise. Re-rendered in place when a pull completes
// after first paint (pages:start:remote-tabs).
function renderRemote(remoteDevices) {
  const section = document.getElementById('remoteSection');
  const list = document.getElementById('remoteList');
  list.replaceChildren();
  section.hidden = !remoteDevices?.length;
  if (section.hidden) return;
  for (const device of remoteDevices) {
    for (const t of device.tabs.slice(0, 4)) {
      const row = document.createElement('a');
      row.className = 'fav';
      row.href = t.url;
      const host = hostOf(t.url);
      const tile = document.createElement('span');
      tile.className = 'tile';
      tile.textContent = (host || t.title || '').trim().charAt(0).toLowerCase() || '·';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = t.title || t.url;
      const hostEl = document.createElement('span');
      hostEl.className = 'host';
      hostEl.textContent = `${host} · ${device.name}`;
      row.append(tile, name, hostEl);
      list.appendChild(row);
    }
  }
}

window.bowserPages?.start.data().then(({
  groups,
  blockedThisWeek,
  remoteDevices,
  startup,
  privacy,
}) => {
  renderLaunchStatus({ startup, privacy });
  if (!isPrivate) {
    document.getElementById('footerLeft').textContent =
      `${blockedThisWeek.toLocaleString()} ads blocked this week`;
  }
  if (groups.length) {
    document.getElementById('groupsSection').hidden = false;
    const list = document.getElementById('groupsList');
    for (const g of groups) {
      const row = document.createElement('button');
      row.className = 'fav group-row';
      const cluster = document.createElement('span');
      cluster.className = 'cluster';
      for (let i = 0; i < Math.min(g.count, 5); i++) cluster.appendChild(document.createElement('i'));
      const name = document.createElement('span');
      name.className = 'gname';
      name.textContent = g.name;
      const count = document.createElement('span');
      count.className = 'gcount';
      count.textContent = g.count === 1 ? '1 tab' : `${g.count} tabs`;
      row.append(cluster, name, count);
      row.addEventListener('click', () => window.bowserPages.start.focusGroup(g.id));
      list.appendChild(row);
    }
  }
  renderRemote(remoteDevices);
});

window.bowserPages?.start.onRemoteTabs(renderRemote);
window.bowserPages?.start.onStatus(renderLaunchStatus);
