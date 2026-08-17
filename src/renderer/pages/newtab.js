const isPrivate = new URLSearchParams(location.search).has('private');
const isMac = navigator.platform.startsWith('Mac');

// Opened as a private tab (blanc://newtab/?private=1): private theme,
// and the ledger's margin copy explains the deal instead of stats.
if (isPrivate) document.documentElement.dataset.theme = 'private';

// Shared by every layout's date line.
const dateText = isPrivate
  ? 'private tab'
  : new Date()
      .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      .toLowerCase();

document.getElementById('dateLine').textContent = dateText;

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

/** Short label for a favicon-only tile — the site's own name, not whatever
 * subdomain it happens to serve from: "github.com" and "developer.mozilla.org"
 * give "github" and "mozilla", not "github" and "developer". Drops the TLD,
 * then a second-level suffix like the "co" in "bbc.co.uk". */
const shortLabel = (url, title) => {
  const parts = hostOf(url).split('.').filter(Boolean);
  if (parts.length > 1) {
    parts.pop();
    if (parts.length > 1 && parts[parts.length - 1].length <= 3) parts.pop();
  }
  return (parts[parts.length - 1] || (title || '').trim().split(/\s+/)[0] || '·').toLowerCase();
};

/** Letter first, favicon when it loads — never a blank tile while a (maybe
 * slow) icon request is in flight. Private tabs skip the favicon entirely:
 * fetching a bookmarked site's icon on every new private tab would be a live
 * network trace, which private mode otherwise avoids. */
function decorateTile(tile, item) {
  const host = hostOf(item.url);
  tile.textContent = (host || item.title || '').trim().charAt(0).toLowerCase() || '·';
  if (isPrivate || !item.favicon) return;
  const probe = new Image();
  probe.onload = () => {
    tile.textContent = '';
    tile.classList.add('has-icon');
    tile.style.backgroundImage = `url("${item.favicon.replace(/["\\]/g, '\\$&')}")`;
  };
  // A stored favicon URL can go stale (site changed/removed it) — clear it so
  // future loads stop retrying a dead request.
  probe.onerror = () => window.bowserPages?.bookmarks.clearFavicon(item.url);
  probe.src = item.favicon;
}

/** The ledger's favorite row, also used verbatim by the tally column. */
function favRow(b) {
  const row = document.createElement('a');
  row.className = 'fav';
  row.href = b.url;
  const tile = document.createElement('span');
  tile.className = 'tile';
  decorateTile(tile, b);
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = b.title || b.url;
  const hostEl = document.createElement('span');
  hostEl.className = 'host';
  hostEl.textContent = hostOf(b.url);
  row.append(tile, name, hostEl);
  return row;
}

/** Group chip for billboard/shelf/tally. `withCount` adds the trailing number
 * the shelf card shows; the billboard and tally chips carry the name alone. */
function groupChip(group, { withCount = false } = {}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'group-chip';
  const dots = document.createElement('span');
  dots.className = 'chip-dots';
  for (let i = 0; i < Math.min(group.count, 5); i++) dots.appendChild(document.createElement('i'));
  const name = document.createElement('span');
  name.className = 'chip-name';
  name.textContent = group.name;
  chip.append(dots, name);
  if (withCount) {
    const count = document.createElement('span');
    count.className = 'chip-count';
    count.textContent = String(group.count);
    chip.append(count);
  }
  chip.addEventListener('click', () => window.bowserPages.start.focusGroup(group.id));
  return chip;
}

function renderLedgerFavorites(items) {
  const list = document.getElementById('favoritesList');
  list.replaceChildren();
  if (!items.length) {
    const hint = document.createElement('div');
    hint.className = 'ledger-empty';
    hint.textContent = '♥ a page to pin it here';
    list.appendChild(hint);
    return;
  }
  for (const b of items.slice(0, 6)) list.appendChild(favRow(b));
}

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

// Everything the three alternative layouts draw from. They render lazily —
// only when their layout is first shown — so the cache is cleared whenever a
// feed changes, or a layout drawn from stale data would never redraw.
const state = {
  layout: 'ledger',
  groups: [],
  blockedThisWeek: 0,
  blockedByDay: [0, 0, 0, 0, 0, 0, 0],
  blockedBarHeights: [0, 0, 0, 0, 0, 0, 0],
  favorites: [],
  onboarding: null,
};
const rendered = new Set();
const invalidate = () => rendered.clear();

const DAY_INITIALS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const todayIndex = () => (new Date().getDay() + 6) % 7;

function renderLedgerGroups(groups) {
  const section = document.getElementById('groupsSection');
  const list = document.getElementById('groupsList');
  list.replaceChildren();
  section.hidden = !groups.length;
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

function renderBillboard() {
  document.getElementById('bbDate').textContent = dateText;
  updateClock();
  document.getElementById('bbBlocked').textContent = isPrivate
    ? 'nothing here is saved · nothing followed you home'
    : `${state.blockedThisWeek.toLocaleString()} ads blocked this week · nothing followed you home`;

  const favs = document.getElementById('bbFavorites');
  favs.replaceChildren();
  for (const b of state.favorites.slice(0, 6)) {
    const item = document.createElement('a');
    item.className = 'bb-fav';
    item.href = b.url;
    const tile = document.createElement('span');
    tile.className = 'tile';
    decorateTile(tile, b);
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = shortLabel(b.url, b.title);
    item.append(tile, label);
    favs.appendChild(item);
  }

  const groups = document.getElementById('bbGroups');
  groups.replaceChildren();
  for (const g of state.groups) groups.appendChild(groupChip(g));
}

function renderShelf() {
  document.getElementById('shDate').textContent = dateText;
  document.getElementById('shBlocked').textContent = state.blockedThisWeek.toLocaleString();

  const grid = document.getElementById('shFavorites');
  grid.replaceChildren();
  for (const b of state.favorites.slice(0, 8)) {
    const tileLink = document.createElement('a');
    tileLink.className = 'shelf-tile';
    tileLink.href = b.url;
    const tile = document.createElement('span');
    tile.className = 'tile';
    decorateTile(tile, b);
    const text = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = b.title || b.url;
    const host = document.createElement('span');
    host.className = 'host';
    host.textContent = hostOf(b.url);
    text.append(name, host);
    tileLink.append(tile, text);
    grid.appendChild(tileLink);
  }

  const groups = document.getElementById('shGroups');
  groups.replaceChildren();
  for (const g of state.groups) groups.appendChild(groupChip(g, { withCount: true }));
}

function renderTally() {
  document.getElementById('tlDate').textContent = dateText;
  document.getElementById('tlCount').textContent = state.blockedThisWeek.toLocaleString();

  const favs = document.getElementById('tlFavorites');
  favs.replaceChildren();
  for (const b of state.favorites.slice(0, 5)) favs.appendChild(favRow(b));

  const groups = document.getElementById('tlGroups');
  groups.replaceChildren();
  for (const g of state.groups) groups.appendChild(groupChip(g));
  // The label above an empty chip row would name nothing.
  document.querySelector('.tally-label-groups').hidden = !state.groups.length;

  // Bars run oldest to newest so today lands last, under its own initial.
  const chart = document.getElementById('tlChart');
  const days = document.getElementById('tlDays');
  chart.replaceChildren();
  days.replaceChildren();
  const today = todayIndex();
  for (let k = 0; k < 7; k++) {
    const i = (today + 1 + k) % 7;
    const bar = document.createElement('span');
    bar.className = 'tally-bar' + (i === today ? ' today' : '');
    // Heights come from main's normalized counts; a week that blocked
    // nothing draws no bars, including today's.
    bar.style.height = `${state.blockedBarHeights[i]}%`;
    chart.appendChild(bar);
    const label = document.createElement('span');
    label.textContent = DAY_INITIALS[i];
    days.appendChild(label);
  }

  const peak = Math.max(...state.blockedByDay);
  const caption = document.getElementById('tlCaption');
  caption.replaceChildren();
  if (peak > 0) {
    caption.append(
      `busiest day ${DAY_NAMES[state.blockedByDay.indexOf(peak)]}.`,
      document.createElement('br'),
    );
  }
  caption.append('nothing followed you home.');
}

// The billboard clock ticks on the minute, and only while it is on screen.
let clockTimer = null;
function updateClock() {
  const t = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  document.getElementById('bbClock').textContent = t.replace(/\s?[AP]M$/i, '');
  // 24-hour locales have no meridiem; the span simply stays empty.
  document.getElementById('bbMeridiem').textContent = (t.match(/[AP]M$/i) || [''])[0].toLowerCase();
}
function startClock() {
  updateClock();
  const tick = () => {
    updateClock();
    clockTimer = setTimeout(tick, 60000);
  };
  clockTimer = setTimeout(tick, 60000 - (Date.now() % 60000));
}
function stopClock() {
  if (clockTimer) clearTimeout(clockTimer);
  clockTimer = null;
}

function applyLayout(name) {
  state.layout = name;
  document.body.dataset.layout = name;
  for (const button of document.querySelectorAll('[data-layout-pick]')) {
    button.classList.toggle('active', button.dataset.layoutPick === name);
  }
  stopClock();
  if (!rendered.has(name)) {
    if (name === 'billboard') renderBillboard();
    if (name === 'shelf') renderShelf();
    if (name === 'tally') renderTally();
    rendered.add(name);
  }
  if (name === 'billboard') startClock();
}

for (const button of document.querySelectorAll('[data-layout-pick]')) {
  button.addEventListener('click', () => {
    const pick = button.dataset.layoutPick;
    applyLayout(pick); // instant, per the handoff — the write follows
    window.bowserPages?.start.setLayout(pick);
  });
}

// Favorites and start data resolve independently. A layout rendered from
// whichever landed first would cache a half-empty draw, so the alternative
// layouts wait for both; the ledger still paints incrementally as it always
// has.
const favoritesReady = window.bowserPages?.bookmarks.list().then((items) => {
  state.favorites = items;
  renderLedgerFavorites(items);
  invalidate();
});

const dataReady = window.bowserPages?.start.data().then((data) => {
  Object.assign(state, {
    layout: data.layout ?? 'ledger',
    groups: data.groups,
    blockedThisWeek: data.blockedThisWeek,
    blockedByDay: data.blockedByDay ?? state.blockedByDay,
    blockedBarHeights: data.blockedBarHeights ?? state.blockedBarHeights,
    onboarding: data.onboarding ?? null,
  });
  renderLaunchStatus({ startup: data.startup, privacy: data.privacy });
  if (!isPrivate) {
    document.getElementById('footerLeft').textContent =
      `${state.blockedThisWeek.toLocaleString()} ads blocked this week`;
  }
  renderLedgerGroups(state.groups);
  renderRemote(data.remoteDevices);
  invalidate();
});

Promise.all([favoritesReady, dataReady]).then(() => applyLayout(state.layout));

window.bowserPages?.start.onRemoteTabs(renderRemote);
window.bowserPages?.start.onStatus((status) => {
  renderLaunchStatus(status);
  if (status?.layout && status.layout !== state.layout) applyLayout(status.layout);
});
