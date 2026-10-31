const isPrivate = new URLSearchParams(location.search).has('private');
const isMac = navigator.platform.startsWith('Mac');
const { t } = blancI18n;
const TOP_SITES_HIDDEN_KEY = 'blanc.billboard.hidden-top-sites.v1';
const MAX_HIDDEN_TOP_SITES = 200;
const TOP_SITES_PAGE_SIZE = 48;
const startPins = globalThis.blancStartPins;

function readHiddenTopSites() {
  if (isPrivate) return new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(TOP_SITES_HIDDEN_KEY) || '[]');
    return new Set(
      (Array.isArray(saved) ? saved : [])
        // Main owns hostname parsing. A bounded string is enough here: saved
        // values can only suppress an exact key that main later supplies.
        .filter((key) => typeof key === 'string' && key.length > 0 && key.length <= 255)
        .slice(-MAX_HIDDEN_TOP_SITES),
    );
  } catch {
    return new Set();
  }
}

const hiddenTopSites = readHiddenTopSites();
let topSitesExhausted = isPrivate;
let topSitesLoad = null;
let topSitesReady = false;
let topSitesOffset = 0;

function saveHiddenTopSites() {
  try {
    localStorage.setItem(TOP_SITES_HIDDEN_KEY, JSON.stringify([...hiddenTopSites]));
  } catch {
    // Storage may be unavailable; the in-memory dismissal still lasts for
    // this page without falling back to any main-process or network store.
  }
}

function rememberHiddenTopSite(key) {
  if (isPrivate || typeof key !== 'string' || !key) return;
  hiddenTopSites.delete(key);
  hiddenTopSites.add(key);
  while (hiddenTopSites.size > MAX_HIDDEN_TOP_SITES) {
    hiddenTopSites.delete(hiddenTopSites.values().next().value);
  }
  saveHiddenTopSites();
}

// Start Page pins live in main (start-page-pins.js), so a tab's menu and the
// Favorites page can pin too. Every layout draws them first. A private start
// page draws them but never changes them.
async function loadPins({ propagateError = false } = {}) {
  const epoch = window.blancPinIconsEpoch?.();
  const listed = await window.bowserPages?.pins?.list?.().catch((error) => {
    if (!isPrivate && window.blancPinIconsSnapshotCurrent?.(epoch)) window.blancPinIconsUnavailable?.();
    if (propagateError) throw error;
    return null;
  });
  if (!window.blancPinIconsSnapshotCurrent?.(epoch)) return false;
  if (!Array.isArray(listed?.pins)) {
    if (!isPrivate) window.blancPinIconsUnavailable?.();
    return false;
  }
  if (!isPrivate) window.blancPinIconsAvailable?.();
  state.pinsMax = listed.max;
  if (startPins.samePins(listed.pins, state.pins)) return false;
  state.pins = listed.pins;
  return true;
}

/** Pin or unpin one page, then draw the result on every layout. Resolves to
 * whether it changed. A refusal (every pin taken) is announced; a change that
 * didn't happen (another page or a sync got there first) or a failed request
 * just redraws what main holds, without claiming success. */
async function togglePin(page, pinned, statusId) {
  if (isPrivate) return false;
  const title = page.title || page.url;
  const status = document.getElementById(statusId);
  let changed = false;
  try {
    if (pinned) {
      changed = (await window.bowserPages.pins.unpin(page.url)) === true;
    } else {
      const result = await window.bowserPages.pins.pin(page.url, page.title);
      changed = result?.ok === true;
      if (result?.reason === 'full') status.textContent = t('newtab.pin.full', { count: state.pinsMax });
    }
  } catch {
    changed = false;
  }
  if ((await loadPins()) || changed) renderPinnedLayouts();
  if (changed) status.textContent = pinned ? t('newtab.unpin.done', { title }) : t('newtab.pin.done', { title });
  return changed;
}

/** The pin button every layout's tiles share: filled and on show once pinned. */
function pinButton(page, pinned) {
  const title = page.title || page.url;
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.title = pinned ? t('newtab.unpin.title', { title }) : t('newtab.pin.title', { title });
  pin.setAttribute('aria-label', pinned ? t('newtab.unpin.label', { title }) : t('newtab.pin.label', { title }));
  pin.appendChild(startPins.glyph(document, 'pin'));
  return pin;
}

// Opened as a private tab (blanc://newtab/?private=1): private theme,
// and the ledger's margin copy explains the deal instead of stats.
if (isPrivate) document.documentElement.dataset.theme = 'private';

// Shared by every layout through the single Sunrise header. Private tabs show
// the date too; the Island's Private chip already marks the mode.
const dateText = new Date().toLocaleDateString(blancI18n.formatLocale(), { weekday: 'long', month: 'long', day: 'numeric' });

document.getElementById('startDate').textContent = dateText;
// The date comes from the locale's own formats, not the catalog.
document.getElementById('startDate').dataset.i18nIgnore = '';

const islandShortcut = isMac ? '⌘L' : `${t('key.ctrl')}+L`;
document.getElementById('goAnywhere').textContent = t('newtab.goAnywhere', { shortcut: islandShortcut });
// Onboarding's hint; tag 0 is the shortcut, drawn as a key.
document.getElementById('obIslandHint').replaceChildren(
  ...blancI18n.parts('onboarding.island.hint', { shortcut: islandShortcut }).map((part) => {
    if (part.tag === undefined) return document.createTextNode(part.text);
    const key = document.createElement('span');
    key.className = 'ob-kbd';
    key.id = 'obIslandShortcut';
    key.textContent = part.text;
    key.setAttribute('aria-label', isMac ? t('onboarding.island.shortcutMac') : t('onboarding.island.shortcut'));
    return key;
  }));

// Short enough for one line beside the version at a 1200px window. Passkeys
// made here aren't deleted at quit, they stop working (webauthn.js), hence
// "ends" rather than "cleared".
if (isPrivate) {
  document.getElementById('footerLeft').textContent = t('newtab.private.footer');
}

const startupCard = document.getElementById('startupCard');
const startupTitle = document.getElementById('startupTitle');
const startupMessage = document.getElementById('startupMessage');
const startupActions = document.getElementById('startupActions');
const startupRetry = document.getElementById('startupRetry');
const startupContinue = document.getElementById('startupContinue');
const recoveryActions = document.getElementById('recoveryActions');
const recoveryRestore = document.getElementById('recoveryRestore');
const recoveryFresh = document.getElementById('recoveryFresh');
const recoveryError = document.getElementById('recoveryError');
function renderLaunchStatus({ startup, recovery, privacy } = {}) {
  if (isPrivate) {
    startupCard.hidden = true;
    return;
  }

  const showRecovery = recovery?.required === true;
  const showStartup = !showRecovery &&
    (startup?.phase === 'initializing' || startup?.phase === 'failed');
  const startupWasHidden = startupCard.hidden;
  startupCard.hidden = !(showRecovery || showStartup);
  startupActions.hidden = true;
  recoveryActions.hidden = true;
  recoveryError.hidden = true;
  if (showRecovery) {
    const tabs = Number.isInteger(recovery.tabCount) ? recovery.tabCount : 0;
    const windows = Number.isInteger(recovery.windowCount) ? recovery.windowCount : 0;
    startupTitle.textContent = t('newtab.recovery.title');
    startupMessage.textContent = t('newtab.recovery.message', {
      tabs: t('newtab.recovery.tabs', { count: tabs }),
      windows: t('newtab.recovery.windows', { count: windows }),
    });
    recoveryActions.hidden = false;
    if (recovery.error) {
      recoveryError.textContent = recovery.error;
      recoveryError.hidden = false;
    }
    if (startupWasHidden) recoveryRestore.focus();
  } else if (showStartup) {
    const failed = startup.phase === 'failed';
    startupTitle.textContent = failed
      ? t('newtab.startup.failed')
      : startup.attempt > 1
        ? t('newtab.startup.retrying')
        : t('newtab.startup.preparing');
    startupMessage.textContent = failed
      ? t('newtab.startup.failedMessage', { error: startup.error || t('newtab.startup.unknownError') })
      : t('newtab.startup.preparingMessage');
    startupActions.hidden = !failed;
    if (failed && startupWasHidden) startupRetry.focus();
  }

  // First-run onboarding replaced the privacy card outright (privacy is its
  // step 5, migration its step 2). It waits out the startup card and needs
  // the onboarding projection from start.data() before it will open.
  window.blancOnboarding?.maybeShow({
    startup: showRecovery ? { phase: 'initializing' } : startup,
    privacy,
  }, state.onboarding);
}

// Quiet Patron pill on the footer's left. Hidden for Patrons, for 90 days
// after it is closed (main owns that clock), and, whatever the Patron state,
// in private tabs: a private window is never a place to sell. Driven from
// both the initial pages:start:data load and every later pages:start:status
// push.
const patronCalloutEl = document.getElementById('patronCallout');
const patronCalloutHide = document.getElementById('patronCalloutHide');
const patronCallout = { active: false, snoozedUntil: 0 };

// What's new pill after an update. Main decides when it shows (7 days after
// the update first launches, until it is opened or closed) and supplies the
// changelog link; private tabs never show it.
const whatsNewEl = document.getElementById('whatsNew');
const whatsNewLink = document.getElementById('whatsNewLink');
const whatsNewLabel = document.getElementById('whatsNewLabel');
const whatsNewHide = document.getElementById('whatsNewHide');
let whatsNew = null;
function renderWhatsNew() {
  const show = !isPrivate && typeof whatsNew?.version === 'string' && typeof whatsNew?.url === 'string';
  whatsNewEl.hidden = !show;
  if (!show) return;
  whatsNewLink.href = whatsNew.url;
  whatsNewLabel.textContent = t('newtab.whatsNew.label', { version: whatsNew.version });
}
function dismissWhatsNew() {
  whatsNew = null;
  renderWhatsNew();
  renderPatronCallout();
  window.bowserPages?.start.dismissWhatsNew().catch(() => {});
}
whatsNewHide.addEventListener('click', dismissWhatsNew);
// Opening the changelog counts as seen; the link still navigates.
whatsNewLink.addEventListener('click', () => {
  window.bowserPages?.start.dismissWhatsNew().catch(() => {});
});
function renderPatronCallout() {
  // One footer invitation at a time: the What's new pill wins while it shows.
  const hide = patronCallout.active || Date.now() < patronCallout.snoozedUntil || isPrivate || !whatsNewEl.hidden;
  patronCalloutEl.hidden = hide;
}
function applyPatronStatus(status) {
  if ('patronActive' in status) patronCallout.active = !!status.patronActive;
  if ('patronCalloutSnoozedUntil' in status) patronCallout.snoozedUntil = Number(status.patronCalloutSnoozedUntil) || 0;
  if ('whatsNew' in status) whatsNew = status.whatsNew;
  renderWhatsNew();
  renderPatronCallout();
}
// A page left open past the snooze's end shows the pill the next time it is
// on screen; the 90-day span is too long for a single timer.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderPatronCallout();
});
patronCalloutHide.addEventListener('click', () => {
  patronCallout.snoozedUntil = Infinity;
  renderPatronCallout();
  window.bowserPages?.start.dismissPatronCallout().catch(() => {});
});

// Main owns durable checklist progress; this renderer only reflects that
// projection. The one local exception is the 1.5 s final confirmation, which
// lets an already-open page show 2/2 on the footer pill before the
// now-complete checklist retires. The full list lives in the pill's popover.
const migrationChecklistShell = document.getElementById('migrationChecklistShell');
const migrationChecklistTitle = document.getElementById('migrationChecklistTitle');
const migrationChecklistCompact = document.getElementById('migrationChecklistCompact');
const migrationChecklistLabel = document.getElementById('migrationChecklistLabel');
const migrationChecklist = document.getElementById('migrationChecklist');
const migrationDefaultTask = document.getElementById('migrationDefaultTask');
const migrationDefaultAction = document.getElementById('migrationDefaultAction');
const migrationSyncTask = document.getElementById('migrationSyncTask');
const migrationTabsTask = document.getElementById('migrationTabsTask');
const migrationSyncAction = document.getElementById('migrationSyncAction');
const migrationTabsAction = document.getElementById('migrationTabsAction');
const migrationSpaceTask = document.getElementById('migrationSpaceTask');
const migrationSpaceAction = document.getElementById('migrationSpaceAction');
const migrationChecklistHide = document.getElementById('migrationChecklistHide');
let migrationChecklistProjection = null;
let migrationChecklistRetireTimer = null;
let migrationChecklistPendingCompletion = null;
let migrationChecklistUtilitySheetVisible = false;

function setMigrationTask(task, action, complete, label) {
  task.classList.toggle('is-complete', complete);
  task.querySelector('.migration-task-status').textContent = complete
    ? t('newtab.checklist.completed')
    : t('newtab.checklist.notCompleted');
  action.setAttribute('aria-label', complete
    ? t('newtab.checklist.taskCompleted', { task: label })
    : t('newtab.checklist.taskNotCompleted', { task: label }));
}

// Main decides how many tasks apply (the default-browser task only where
// Blanc can ask the OS); the projection always carries that count.
const migrationTaskCount = (checklist) => checklist?.taskCount ?? 3;
function paintMigrationChecklist(checklist, { completing = false } = {}) {
  for (const el of document.querySelectorAll('.js-migration-progress')) {
    el.textContent = `${checklist.completedCount}/${migrationTaskCount(checklist)}`;
  }
  migrationChecklistTitle.textContent = completing ? t('newtab.checklist.doneTitle') : t('newtab.checklist.title');
  migrationChecklistLabel.textContent = completing ? t('newtab.checklist.doneLabel') : t('newtab.checklist.label');
  migrationDefaultTask.hidden = checklist.defaultAvailable !== true;
  setMigrationTask(migrationDefaultTask, migrationDefaultAction, checklist.defaultComplete === true, t('newtab.checklist.default'));
  setMigrationTask(migrationSyncTask, migrationSyncAction, checklist.syncComplete, t('newtab.checklist.sync'));
  setMigrationTask(migrationTabsTask, migrationTabsAction, checklist.tabsComplete, t('newtab.checklist.tabs'));
  setMigrationTask(migrationSpaceTask, migrationSpaceAction, checklist.spaceComplete, t('newtab.checklist.space'));
}

function hideMigrationChecklist() {
  clearTimeout(migrationChecklistRetireTimer);
  migrationChecklistRetireTimer = null;
  migrationChecklistPendingCompletion = null;
  if (migrationChecklist.matches(':popover-open')) migrationChecklist.hidePopover();
  migrationChecklistShell.hidden = true;
  migrationChecklistShell.classList.remove('is-completing');
}

function canPresentMigrationChecklistCompletion() {
  return document.hasFocus() &&
    document.visibilityState !== 'hidden' &&
    !migrationChecklistUtilitySheetVisible &&
    startupCard.hidden &&
    !document.querySelector('[role="dialog"][aria-modal="true"]:not([hidden])');
}

function presentPendingMigrationChecklistCompletion() {
  const checklist = migrationChecklistPendingCompletion;
  if (!checklist || !canPresentMigrationChecklistCompletion()) return false;
  migrationChecklistPendingCompletion = null;
  paintMigrationChecklist(checklist, { completing: true });
  migrationChecklistShell.hidden = false;
  // The pill confirms 2/2 itself and fades with its popover if that happens
  // to be open; completion never opens the popover on its own.
  migrationChecklistShell.classList.add('is-completing');
  clearTimeout(migrationChecklistRetireTimer);
  migrationChecklistRetireTimer = setTimeout(hideMigrationChecklist, 1500);
  return true;
}

function renderMigrationChecklist(checklist) {
  const previous = migrationChecklistProjection;
  migrationChecklistProjection = checklist;

  if (!checklist) {
    hideMigrationChecklist();
    return;
  }

  const total = migrationTaskCount(checklist);
  const justCompleted = previous?.visible === true &&
    previous.completedCount < total && checklist.completedCount === total;
  if (justCompleted) {
    migrationChecklistPendingCompletion = checklist;
    paintMigrationChecklist(checklist, { completing: true });
    migrationChecklistShell.hidden = false;
    presentPendingMigrationChecklistCompletion();
    return;
  }

  // Settings and the tab-import sheet are separate focused WebContentsViews.
  // Their completion push reaches this page while it is covered. Preserve the
  // pending confirmation across later status pushes and start its dwell only
  // after the start page itself becomes presentable again.
  if (migrationChecklistPendingCompletion && checklist.completedCount === total) {
    presentPendingMigrationChecklistCompletion();
    return;
  }

  if (!checklist.visible) {
    hideMigrationChecklist();
    return;
  }

  clearTimeout(migrationChecklistRetireTimer);
  migrationChecklistRetireTimer = null;
  paintMigrationChecklist(checklist);
  migrationChecklistShell.classList.remove('is-completing');
  migrationChecklistShell.hidden = false;
}

// Both tasks leave the start page (Settings, the tab-import sheet), so the
// popover closes behind them instead of waiting there on return.
const closeMigrationChecklistPopover = () => {
  if (migrationChecklist.matches(':popover-open')) migrationChecklist.hidePopover();
};
// The OS answers the default-browser request (a macOS prompt, or Windows'
// Default apps page); main notes the result when Blanc regains focus.
migrationDefaultAction.addEventListener('click', () => {
  closeMigrationChecklistPopover();
  window.bowserPages?.start.setDefaultBrowser().catch(() => {});
});
migrationSyncAction.addEventListener('click', () => {
  closeMigrationChecklistPopover();
  window.bowserPages?.start.openSettings('sync').catch(() => {});
});
migrationTabsAction.addEventListener('click', closeMigrationChecklistPopover);
migrationSpaceAction.addEventListener('click', () => {
  closeMigrationChecklistPopover();
  window.bowserPages?.start.openSpaces().catch(() => {});
});
migrationChecklistHide.addEventListener('click', () => {
  window.bowserPages?.start.dismissMigrationChecklist().catch(() => {});
});
migrationChecklist.addEventListener('toggle', (event) => {
  migrationChecklistCompact.setAttribute('aria-expanded', String(event.newState === 'open'));
});
window.addEventListener('focus', presentPendingMigrationChecklistCompletion);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) presentPendingMigrationChecklistCompletion();
});
window.bowserPages?.start.onUtilitySheetVisibility((visible) => {
  migrationChecklistUtilitySheetVisible = visible;
  if (!visible) presentPendingMigrationChecklistCompletion();
});

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

async function chooseRecovery(choice) {
  recoveryRestore.disabled = true;
  recoveryFresh.disabled = true;
  try {
    const result = await window.bowserPages?.start.recoverSession(choice);
    if (result?.recovery) renderLaunchStatus({ recovery: result.recovery });
  } finally {
    recoveryRestore.disabled = false;
    recoveryFresh.disabled = false;
  }
}
recoveryRestore.addEventListener('click', () => chooseRecovery('restore'));
recoveryFresh.addEventListener('click', () => chooseRecovery('fresh'));

window.bowserPages?.appVersion().then((version) => {
  document.getElementById('version').textContent = t('newtab.version', { version });
});

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// Synced icons are the ONE thing this page draws from another device. The sync
// design guarantees them as inert `data:image/png` payloads resolved by the
// PUBLISHING device (2026-07-21-tab-sync-design.md), so rendering them adds no
// data flow — but only if we refuse anything that isn't that exact shape.
const SYNCED_ICON_PREFIX = 'data:image/png;base64,';

/** Letter first, favicon when it loads — never a blank tile while a (maybe
 * slow) icon request is in flight. Private tabs skip the favicon entirely:
 * fetching a bookmarked site's icon on every new private tab would be a live
 * network trace, which private mode otherwise avoids.
 *
 * mode 'synced' is for tabs open on ANOTHER device, and differs twice:
 * it accepts only the inert PNG data URL above (a remote http(s) value would
 * turn this page into the network client the sync design exists to avoid), and
 * it never clears a favicon on failure — a synced tab is not a bookmark, so
 * clearFavicon would reach into whichever bookmark merely shares its URL. */
function decorateTile(tile, item, { mode = 'local' } = {}) {
  const host = hostOf(item.url);
  tile.textContent = (host || item.title || '').trim().charAt(0).toLowerCase() || '·';
  tile.dataset.i18nIgnore = ''; // a site's initial
  if (isPrivate || !item.favicon) return;
  const synced = mode === 'synced';
  if (synced && !item.favicon.toLowerCase().startsWith(SYNCED_ICON_PREFIX)) return;
  const probe = new Image();
  probe.onload = () => {
    tile.textContent = '';
    tile.classList.add('has-icon');
    tile.style.backgroundImage = `url("${item.favicon.replace(/["\\]/g, '\\$&')}")`;
  };
  // A failed decode does NOT clear the stored icon. Stored favicons are already
  // validated PNG data URLs, so a failure here means corrupt bytes, not a dead
  // remote request — and there is no re-fetch path, so clearing was a one-way
  // ratchet toward a permanent letter tile. The letter set above is enough.
  probe.onerror = () => {};
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
  row.dataset.i18nIgnore = ''; // page titles and hosts
  row.append(tile, name, hostEl);
  return row;
}

/** One tile in a favorites layout with its pin beside it, never inside the
 * link. Pinned pages lead every favorites layout and keep their pin on show.
 * Private start pages draw no pin. */
function pinnableFavorite(b, link, className) {
  const item = document.createElement('div');
  item.className = className;
  item.classList.toggle('pinned', b.pinned);
  item.dataset.favoriteUrl = b.url;
  item.appendChild(link);
  if (isPrivate || !startPins.siteKey(b.url)) return item;

  const pin = pinButton(b, b.pinned);
  pin.className = 'fav-pin';
  pin.addEventListener('click', async () => {
    const list = item.parentElement;
    const index = [...list.children].indexOf(item);
    if (!(await togglePin(b, b.pinned, 'favoritesPinStatus'))) return;
    // Focus follows the page to its new place, or stays in the slot it left
    // when unpinning drops it past the layout's last tile.
    const moved = [...list.children].find((candidate) => candidate.dataset.favoriteUrl === b.url);
    const next = moved?.querySelector('.fav-pin') ??
      list.children[Math.min(index, list.children.length - 1)]?.querySelector('a, .fav-pin');
    next?.focus();
  });
  item.appendChild(pin);
  return item;
}

/** The favorites a layout draws, pinned first, up to its limit. */
function favoriteTilesFor(limit) {
  return startPins.favoriteTiles(state.pins, state.favorites, limit);
}

/** Group chip for billboard/shelf/tally. `withCount` adds the trailing number
 * the shelf card shows; the billboard and tally chips carry the name alone. */
/** A colored group's dots take its color (tab group colors spec §7). Main
 * sends only a Spaces preset hex or null. */
function paintGroupDots(el, group) {
  if (typeof group.color !== 'string' || !/^#[0-9a-f]{6}$/.test(group.color)) return;
  el.classList.add('group-colored');
  el.style.setProperty('--group-color', group.color);
}

function groupChip(group, { withCount = false } = {}) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'group-chip';
  chip.dataset.groupId = group.id;
  const dots = document.createElement('span');
  dots.className = 'chip-dots';
  for (let i = 0; i < Math.min(group.count, 5); i++) dots.appendChild(document.createElement('i'));
  paintGroupDots(dots, group);
  const name = document.createElement('span');
  name.className = 'chip-name';
  name.textContent = group.name;
  name.dataset.i18nIgnore = '';
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

// One empty state for every layout that draws the Favorites feed. Billboard
// draws recent sites instead, so this copy would be untrue there.
function emptyFavoritesHint() {
  const hint = document.createElement('p');
  hint.className = 'start-empty-hint';
  hint.textContent = t('newtab.favorites.empty');
  return hint;
}

function renderLedgerFavorites() {
  const list = document.getElementById('favoritesList');
  list.replaceChildren();
  const tiles = favoriteTilesFor(6);
  if (!tiles.length) {
    list.appendChild(emptyFavoritesHint());
    return;
  }
  for (const b of tiles) list.appendChild(pinnableFavorite(b, favRow(b), 'fav-item'));
}

/** A pin shows on every layout: Ledger, which is always drawn, and the
 * showing layout redraw now; the others redraw when they are next shown. */
function renderPinnedLayouts() {
  renderLedgerFavorites();
  invalidate();
  if (state.layout === 'billboard') renderBillboard();
  if (state.layout === 'shelf') renderShelf();
  if (state.layout === 'tally') renderTally();
  rendered.add(state.layout);
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
      // The same letter-then-icon treatment favorites get; 'synced' restricts it
      // to the inert PNG payload and skips the bookmark-clearing error path.
      decorateTile(tile, t, { mode: 'synced' });
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = t.title || t.url;
      const hostEl = document.createElement('span');
      hostEl.className = 'host';
      hostEl.textContent = `${host} · ${device.name}`;
      row.dataset.i18nIgnore = ''; // page titles, hosts and device names
      row.append(tile, name, hostEl);
      list.appendChild(row);
    }
  }
}

// Send to device (M7b): pages other devices sent here wait above Other
// devices until opened (a new tab, which hides them here) or dismissed. A
// private Start Page gets none from main.
const sentRelativeTime = new Intl.RelativeTimeFormat(blancI18n.formatLocale(), { style: 'narrow', numeric: 'always' });
function sentAgo(ts) {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return sentRelativeTime.format(-mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours < 24) return sentRelativeTime.format(-hours, 'hour');
  return sentRelativeTime.format(-Math.round(hours / 24), 'day');
}

function renderSent(items) {
  const section = document.getElementById('sentSection');
  const list = document.getElementById('sentList');
  list.replaceChildren();
  section.hidden = !items?.length;
  if (section.hidden) return;
  for (const sent of items) {
    const item = document.createElement('div');
    item.className = 'fav-item sent-item';
    const row = document.createElement('a');
    row.className = 'fav';
    row.href = sent.url;
    const tile = document.createElement('span');
    tile.className = 'tile';
    decorateTile(tile, { url: sent.url, title: sent.title }, { mode: 'synced' });
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = sent.title || sent.url;
    name.dataset.i18nIgnore = ''; // a page title
    const from = document.createElement('span');
    from.className = 'host';
    from.textContent = t('sends.from', { device: sent.fromName, time: sentAgo(sent.sentAt) });
    row.append(tile, name, from);
    row.addEventListener('click', (event) => {
      event.preventDefault();
      window.bowserPages?.start.openSent(sent.id);
    });
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'fav-pin sent-dismiss';
    dismiss.title = t('sends.dismiss');
    dismiss.setAttribute('aria-label', t('row.actionLabel', { action: t('sends.dismiss'), title: sent.title || sent.url }));
    dismiss.dataset.i18nIgnore = 'aria-label'; // carries the page title
    dismiss.appendChild(startPins.glyph(document, 'close'));
    dismiss.addEventListener('click', () => window.bowserPages?.start.dismissSent(sent.id));
    item.append(row, dismiss);
    list.appendChild(item);
  }
}

// Everything the three alternative layouts draw from. They render lazily —
// only when their layout is first shown — so the cache is cleared whenever a
// feed changes, or a layout drawn from stale data would never redraw.
const state = {
  layout: 'billboard',
  groups: [],
  groupsUnavailable: false,
  blockerStatisticsAvailable: false,
  blockedThisWeek: 0,
  blockedByDay: [0, 0, 0, 0, 0, 0, 0],
  blockedBarHeights: [0, 0, 0, 0, 0, 0, 0],
  favorites: [],
  pins: [],
  pinsMax: 0,
  topSites: [],
  onboarding: null,
};
const rendered = new Set();
const invalidate = () => rendered.clear();

// Monday-first weekday names in the interface's locale, lowercase like the
// rest of Tally: a two-letter initial under each bar and the full name.
const weekdays = (style) => {
  const format = new Intl.DateTimeFormat(blancI18n.formatLocale(), { weekday: style });
  // 1 January 2024 was a Monday.
  return [0, 1, 2, 3, 4, 5, 6].map((i) => format.format(new Date(2024, 0, 1 + i)).toLocaleLowerCase(blancI18n.formatLocale()));
};
const DAY_INITIALS = weekdays('short').map((day) => day.replace(/\.$/, '').slice(0, 2));
const DAY_NAMES = weekdays('long');
const todayIndex = () => (new Date().getDay() + 6) % 7;

function appendGroupFailure(container) {
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.textContent = `${t('newtab.groups')} — ${t('shield.badge.unavailable')} `;
  const retry = document.createElement('button');
  retry.type = 'button'; retry.dataset.groupRetry = 'true';
  retry.textContent = t('error.retry');
  retry.addEventListener('click', () => window.blancRetryStartGroups?.());
  container.append(status, retry);
}
function groupProjectionSignature(groups) {
  return JSON.stringify([state.groupsUnavailable, groups]);
}
function renderGroupChips(name, groups) {
  const node = document.getElementById(name);
  const signature = groupProjectionSignature(groups);
  if (node.dataset.groupProjectionSignature === signature) return;
  node.replaceChildren();
  node.hidden = !groups.length && !state.groupsUnavailable;
  if (name === 'shGroups') node.closest('.shelf-card').hidden = !groups.length && !state.groupsUnavailable;
  if (name === 'tlGroups') document.querySelector('.tally-label-groups').hidden = !groups.length && !state.groupsUnavailable;
  for (const group of groups) node.appendChild(groupChip(group, { withCount: name === 'shGroups' }));
  if (state.groupsUnavailable) appendGroupFailure(node);
  node.dataset.groupProjectionSignature = signature;
}
// Update only group elements, preserving a keyboard target by stable group ID.
window.blancApplyStartGroups = (groups, unavailable) => {
  const same = state.groupsUnavailable === unavailable && JSON.stringify(state.groups) === JSON.stringify(groups);
  if (same) return;
  const containers = ['groupsList', 'bbGroups', 'shGroups', 'tlGroups'].map(id => document.getElementById(id));
  const active = document.activeElement;
  const within = containers.find(node => node?.contains(active));
  const groupId = within && active?.dataset?.groupId;
  const wasRetry = within && active?.dataset?.groupRetry === 'true';
  state.groups = groups; state.groupsUnavailable = unavailable;
  renderLedgerGroups(groups);
  for (const name of ['bbGroups', 'shGroups', 'tlGroups']) renderGroupChips(name, groups);
  if (within) {
    const replacement = groupId && [...within.querySelectorAll('[data-group-id]')].find(x => x.dataset.groupId === groupId);
    const retry = within.querySelector('[data-group-retry]');
    // The group section may now be hidden (last group removed or empty
    // recovery). Use the always-visible Start Page content as the fallback.
    const fallback = (groupId || wasRetry) ? document.getElementById('startContent') : null;
    const focusTarget = replacement || retry || fallback;
    if (focusTarget) { if (focusTarget === fallback) fallback.tabIndex = -1; focusTarget.focus(); }
  }
};

function renderLedgerGroups(groups) {
  const section = document.getElementById('groupsSection');
  const list = document.getElementById('groupsList');
  const signature = groupProjectionSignature(groups);
  if (list.dataset.groupProjectionSignature === signature) return;
  list.replaceChildren();
  section.hidden = !groups.length && !state.groupsUnavailable;
  for (const g of groups) {
    const row = document.createElement('button');
    row.className = 'fav group-row';
    row.dataset.groupId = g.id;
    const cluster = document.createElement('span');
    cluster.className = 'cluster';
    for (let i = 0; i < Math.min(g.count, 5); i++) cluster.appendChild(document.createElement('i'));
    paintGroupDots(cluster, g);
    const name = document.createElement('span');
    name.className = 'gname';
    name.textContent = g.name;
    name.dataset.i18nIgnore = '';
    const count = document.createElement('span');
    count.className = 'gcount';
    count.textContent = t('newtab.groups.count', { count: g.count });
    row.append(cluster, name, count);
    row.addEventListener('click', () => window.bowserPages.start.focusGroup(g.id));
    list.appendChild(row);
  }
  if (state.groupsUnavailable) appendGroupFailure(list);
  list.dataset.groupProjectionSignature = signature;
}

function renderBillboard() {
  updateClock();
  document.getElementById('bbBlocked').hidden = !isPrivate && !state.blockerStatisticsAvailable;
  document.getElementById('bbBlocked').textContent = isPrivate
    ? t('newtab.billboard.private')
    : t('newtab.billboard.blocked', { count: state.blockedThisWeek });

  // Empty sections disappear entirely — an empty flex row would still hold
  // its margin, leaving a silent gap where a section pretends to be.
  const favs = document.getElementById('bbFavorites');
  favs.replaceChildren();
  const sites = isPrivate ? [] : visibleBillboardSites();
  favs.hidden = !sites.length;
  for (const site of sites) {
    const item = document.createElement('div');
    item.className = 'bb-site';
    item.classList.toggle('pinned', site.pinned);
    item.dataset.siteKey = site.key;
    // Two pins can share a site; the page itself tells tiles apart.
    item.dataset.siteUrl = site.url;
    const link = document.createElement('a');
    link.className = 'bb-fav';
    link.href = site.url;
    const tile = document.createElement('span');
    tile.className = 'tile';
    decorateTile(tile, site);
    // A short name reads at a glance; the full title stays one hover or one
    // screen-reader announcement away.
    const fullTitle = (site.title || hostOf(site.url) || t('newtab.billboard.untitled')).trim();
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = globalThis.blancStartSiteName.shortSiteName(fullTitle, site.url);
    label.title = fullTitle;
    label.dataset.i18nIgnore = ''; // the site's own name
    link.setAttribute('aria-label', t('newtab.billboard.open', { title: fullTitle }));
    link.append(tile, label);

    // A pinned tile leads the row and stays whatever history does; its pin
    // stays on show so the row explains why it doesn't move. Only a ranked
    // tile can be hidden. Pinning one pins the page it opens: the site's page
    // visited last, under that page's title.
    const pin = pinButton({ url: site.url, title: fullTitle }, site.pinned);
    pin.className = 'bb-site-pin';
    pin.addEventListener('click', async () => {
      const index = [...favs.children].indexOf(item);
      const page = { url: site.url, title: fullTitle };
      if (!(await togglePin(page, site.pinned, 'bbTopSitesStatus'))) return;
      // Focus follows the site to its new place, or stays in the slot it left
      // when unpinning drops it off the row.
      const moved = [...favs.children].find((candidate) => candidate.dataset.siteUrl === site.url);
      const next = moved?.querySelector('.bb-site-pin') ??
        favs.children[Math.min(index, favs.children.length - 1)]?.querySelector('.bb-fav, .bb-site-pin');
      next?.focus();
      fillBillboardSites().catch(() => {});
    });
    item.append(link, pin);

    if (!site.pinned) {
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'bb-site-dismiss';
      dismiss.title = t('newtab.billboard.hideTitle', { title: fullTitle });
      dismiss.setAttribute('aria-label', t('newtab.billboard.hide', { title: fullTitle }));
      dismiss.appendChild(startPins.glyph(document, 'close'));
      dismiss.addEventListener('click', () => {
        const index = [...favs.children].indexOf(item);
        rememberHiddenTopSite(site.key);
        renderBillboard();
        document.getElementById('bbTopSitesStatus').textContent =
          t('newtab.billboard.hidden', { title: fullTitle });
        const next = favs.children[Math.min(index, favs.children.length - 1)]
          ?.querySelector('.bb-fav, .bb-site-dismiss');
        next?.focus();
        fillBillboardSites().catch(() => {});
      });
      item.append(dismiss);
    }
    favs.appendChild(item);
  }

  renderGroupChips('bbGroups', state.groups);
}

function visibleBillboardSites() {
  return startPins.billboardSites(state.pins, state.topSites, hiddenTopSites, 6);
}

async function fillBillboardSites() {
  if (
    isPrivate ||
    !topSitesReady ||
    topSitesExhausted ||
    visibleBillboardSites().length >= 6 ||
    typeof window.bowserPages?.start?.topSites !== 'function'
  ) return;
  if (topSitesLoad) return topSitesLoad;

  const offset = topSitesOffset;
  topSitesLoad = window.bowserPages.start.topSites({
    offset,
    limit: TOP_SITES_PAGE_SIZE,
  }).then((sites) => {
    const next = Array.isArray(sites) ? sites : [];
    topSitesOffset += next.length;
    const known = new Set(state.topSites.map((site) => site.key));
    state.topSites.push(...next.filter((site) => !known.has(site.key)));
    if (next.length < TOP_SITES_PAGE_SIZE) topSitesExhausted = true;
  }).finally(() => {
    topSitesLoad = null;
  });
  await topSitesLoad;
  renderBillboard();
  if (visibleBillboardSites().length < 6 && !topSitesExhausted) {
    await fillBillboardSites();
  }
}

/** Shelf's column count follows its favorites so the tiles form full rows:
 * up to four sit on one row (at least two columns), five to eight split into
 * two rows. The cards below then fill one row of the same grid. */
function shelfColumns(count) {
  if (count <= 4) return Math.max(count, 2);
  return Math.ceil(Math.min(count, 8) / 2);
}

function renderShelf() {
  document.getElementById('shBlocked').textContent = state.blockedThisWeek.toLocaleString(blancI18n.formatLocale());
  // The count is drawn large on its own; the words after it still agree with it.
  document.getElementById('shBlockedUnit').textContent = t('newtab.shelf.unit', { count: state.blockedThisWeek });
  // Private tabs show no blocked counts on any layout.
  document.getElementById('shBlocked').closest('.shelf-card').hidden = isPrivate || !state.blockerStatisticsAvailable;

  // Pins draw here too, so the grid and its empty hint count what is drawn.
  const grid = document.getElementById('shFavorites');
  grid.replaceChildren();
  const shelfTiles = favoriteTilesFor(8);
  document.getElementById('layoutShelf').dataset.columns = String(shelfColumns(shelfTiles.length));
  if (!shelfTiles.length) grid.appendChild(emptyFavoritesHint());
  for (const b of shelfTiles) {
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
    text.dataset.i18nIgnore = ''; // the page's title and host
    text.append(name, host);
    tileLink.append(tile, text);
    grid.appendChild(pinnableFavorite(b, tileLink, 'shelf-item'));
  }

  renderGroupChips('shGroups', state.groups);
}

function renderTally() {
  document.getElementById('tlCount').textContent = state.blockedThisWeek.toLocaleString(blancI18n.formatLocale());
  // Private tabs show no blocked counts; the data column goes entirely.
  document.querySelector('.tally-right').hidden = isPrivate || !state.blockerStatisticsAvailable;

  const favs = document.getElementById('tlFavorites');
  favs.replaceChildren();
  const tallyTiles = favoriteTilesFor(5);
  if (!tallyTiles.length) favs.appendChild(emptyFavoritesHint());
  for (const b of tallyTiles) favs.appendChild(pinnableFavorite(b, favRow(b), 'fav-item'));

  renderGroupChips('tlGroups', state.groups);

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
    label.dataset.i18nIgnore = ''; // from the locale's own weekday names
    days.appendChild(label);
  }

  const peak = Math.max(...state.blockedByDay);
  const caption = document.getElementById('tlCaption');
  caption.replaceChildren();
  if (peak > 0) {
    caption.append(
      t('newtab.tally.busiest', { day: DAY_NAMES[state.blockedByDay.indexOf(peak)] }),
      document.createElement('br'),
    );
  }
  caption.append(t('newtab.tally.nothingFollowed'));
}

// The billboard clock ticks on the minute, and only while it is on screen.
// It shows the hour and minute in the locale's own form but no day period
// (am/pm, p. m., 午後…): a glanceable clock, like the lock screen's.
let clockTimer = null;
const clockFormat = new Intl.DateTimeFormat(blancI18n.formatLocale(), { hour: 'numeric', minute: '2-digit' });
function updateClock() {
  document.getElementById('bbClock').textContent = clockFormat
    .formatToParts(new Date())
    .filter((part) => part.type !== 'dayPeriod')
    .map((part) => part.value)
    .join('')
    .trim();
  scheduleClockArt();
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

// The clock's Font & Color. Main finishes every value (start-clock-style.js):
// the weight already inside the face's range, and the ink as one hex, or null
// for the page's own text color. The page only previews a slider while it is
// dragged, then saves once on release.
const clockElement = document.getElementById('bbClock');
const clockPopover = document.getElementById('clockPopover');
const clockStyleOpen = document.getElementById('clockStyleOpen');
const clockStyleSample = document.getElementById('clockStyleSample');
const clockStyleSummary = document.getElementById('clockStyleSummary');
const CLOCK_FONT_NAMES = {
  instrument: 'newtab.clock.font.instrument', condensed: 'newtab.clock.font.condensed',
  inter: 'newtab.clock.font.inter', flex: 'newtab.clock.font.flex',
};
const clockPercent = new Intl.NumberFormat(blancI18n.formatLocale(), { style: 'percent' });
const clockFontPicks = [...document.querySelectorAll('[data-clock-font-pick]')];
const clockStylePicks = [...document.querySelectorAll('[data-clock-style-pick]')];
const clockWeight = document.getElementById('clockWeight');
const clockTone = document.getElementById('clockTone');
const clockToneLine = document.getElementById('clockToneLine');
const clockColors = document.getElementById('clockColors');
const clockHeight = document.getElementById('clockHeight');
const clockHeightLine = document.getElementById('clockHeightLine');
const clockRow = clockElement.parentElement;
const clockArt = document.getElementById('bbClockArt');
const clockLens = document.getElementById('bbClockLens');
const clockFace = document.getElementById('bbClockFace');
const clockShadow = document.getElementById('bbClockShadow');
const clockRefract = document.getElementById('bbClockRefract');
const clockRefractMap = document.getElementById('bbClockRefractMap');
const clockRefractBend = document.getElementById('bbClockRefractBend');
const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)');
let clockState = null;
let clockDragging = false;
// The Height thumb's value while it is dragged, drawn before it is saved.
let clockHeightPreview = null;
function paintClockWeight(weight) {
  for (const element of [clockElement, clockPopover, clockStyleSample]) element.style.setProperty('--clock-weight', String(weight));
  scheduleClockArt();
}
function paintClockInk(ink) {
  if (ink) {
    clockElement.dataset.ink = '';
    clockElement.style.setProperty('--clock-ink', ink);
    clockStyleSample.style.setProperty('--clock-ink', ink);
  } else {
    delete clockElement.dataset.ink;
    clockElement.style.removeProperty('--clock-ink');
    clockStyleSample.style.removeProperty('--clock-ink');
  }
  scheduleClockArt();
}

// Height and Glass (clock-art.js). Height is type: the clock is set larger,
// then narrower and lighter through its face's own width and weight axes, so
// it keeps its width and stroke and nothing is distorted; it stays real text.
// Glass is drawn over the page from that same text: each width and weight is
// loaded as a canvas face of its own, because canvas fonts can't take
// font-variation-settings.
const CLOCK_FACES = {
  instrument: {
    url: 'instrument-sans-latin-wdth-normal.woff2', stretch: 98,
    stretches: [75, 86.5, 98], weights: [400, 550, 700],
  },
  condensed: { url: 'instrument-sans-latin-wdth-normal.woff2', stretch: 75 },
  inter: { url: 'inter-latin.woff2', stretch: 100 },
  flex: {
    url: 'roboto-flex-clock.woff2', stretch: 100,
    stretches: [25, 37.5, 50, 62.5, 75, 87.5, 100], weights: [100, 250, 400, 550, 700, 850, 1000],
  },
};
// The figures stand about this much of the type size; the clock may take at
// most half the window's height.
const FIGURE_HEIGHT = 0.72;
const MOST_OF_WINDOW = 0.5;
// The glass's bevel and how far it bends the page, as shares of the clock's
// usual type size: Height keeps the strokes as they are, so the glass keeps
// its edge too.
const GLASS_BEVEL = 0.045;
const GLASS_BEND = 0.035;
// How far the glass's shadow may reach past the figures, as a share of the
// type size.
const GLASS_SHADOW_MARGIN = 0.3;
// While a slider is dragged the glass is redrawn at most this often (ms); the
// typeset figures follow every frame.
const GLASS_DRAG_INTERVAL = 120;
let clockArtFrame = 0;
function scheduleClockArt() {
  if (clockArtFrame) return;
  clockArtFrame = requestAnimationFrame(() => {
    clockArtFrame = 0;
    drawClockArt().catch(dropClockArt);
  });
}
// A face that would not load leaves the clock typeset rather than frozen as
// the last glass; the next change tries again.
function dropClockArt() {
  clockRow.removeAttribute('data-drawn');
  clockArt.hidden = true;
  clockArtKey = '';
}
const rgbOf = (color) => globalThis.blancClockArt.parseColor(color);
// What the last glass was made from; an unchanged clock is not redrawn. A
// newer draw makes an older one, still waiting on a face, give up.
let clockArtKey = '';
let clockDrawGeneration = 0;
let clockGlassAt = 0;
let clockGlassTrail = 0;
// The Weight thumb's value while it is dragged.
let clockWeightPreview = null;
async function drawClockArt() {
  if (!clockState || state.layout !== 'billboard') {
    globalThis.blancNativeClock?.render?.(null);
    return;
  }
  const art = globalThis.blancClockArt;
  const generation = ++clockDrawGeneration;
  const face = CLOCK_FACES[clockState.font] ?? CLOCK_FACES.instrument;
  const weight = clockWeightPreview ?? clockState.weight;

  // Height: the type size the stylesheet gives, times the factor, at the
  // fitted width and weight.
  const inline = clockElement.style.fontSize;
  clockElement.style.removeProperty('font-size');
  const size = parseFloat(getComputedStyle(clockElement).fontSize);
  clockElement.style.fontSize = inline;
  const height = clockHeightPreview ?? clockState.height ?? 100;
  const most = (clockState.heightRange?.max ?? 100) / 100;
  const fits = (innerHeight * MOST_OF_WINDOW) / (size * FIGURE_HEIGHT);
  const factor = face.stretches ? Math.max(1, Math.min(height / 100, most, fits)) : 1;
  let type = { stretch: face.stretch, weight };
  if (factor > 1) {
    const table = await art.measureFace(face.url, face.stretches, face.weights);
    if (generation !== clockDrawGeneration) return;
    const fit = art.fitHeight(table, { stretch: face.stretch, weight }, factor);
    // Snapped, so a drag reuses a handful of faces instead of making one for
    // every fraction of a step.
    type = { stretch: Math.round(fit.stretch * 2) / 2, weight: Math.round(fit.weight / 5) * 5 };
    clockElement.style.fontSize = `${size * factor}px`;
    clockElement.style.setProperty('--clock-wdth', type.stretch.toFixed(1));
    clockElement.style.fontWeight = String(type.weight);
  } else {
    clockElement.style.removeProperty('font-size');
    clockElement.style.removeProperty('--clock-wdth');
    clockElement.style.removeProperty('font-weight');
  }

  // Every clock carries a shadow opposite to its ink, so it reads over any
  // wallpaper in any color.
  const computed = getComputedStyle(clockElement);
  const shadow = art.shadowFor(rgbOf(computed.color));
  clockElement.style.setProperty('--clock-shadow', shadow);

  const glass = clockState.style === 'glass' && !reducedTransparency.matches;
  if (globalThis.blancNativeClock?.render) {
    dropClockArt();
    const rect = clockElement.getBoundingClientRect();
    const rendered = await globalThis.blancNativeClock?.render(glass && !document.getElementById('customizePopover').matches(':popover-open') ? {
      text: clockElement.textContent, font: clockState.font,
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      size: parseFloat(computed.fontSize), spacing: parseFloat(computed.letterSpacing) || 0,
      weight: type.weight, stretch: type.stretch, rgb: rgbOf(computed.color), tinted: clockState.color !== 'auto',
    } : null);
    clockElement.classList.toggle('native-clock-glass', rendered);
    return;
  }

  if (!glass) {
    dropClockArt();
    return;
  }
  const typeSize = parseFloat(computed.fontSize);
  const letterSpacing = parseFloat(computed.letterSpacing) || 0;
  const scale = devicePixelRatio || 1;
  const text = clockElement.textContent;
  const key = JSON.stringify([text, face.url, type.stretch, type.weight, typeSize, letterSpacing, scale, computed.color]);
  if (key === clockArtKey) return;
  if (clockDragging) {
    const wait = GLASS_DRAG_INTERVAL - (performance.now() - clockGlassAt);
    if (wait > 0) {
      clearTimeout(clockGlassTrail);
      clockGlassTrail = setTimeout(scheduleClockArt, wait);
      return;
    }
  }
  clockGlassAt = performance.now();
  // Until the face for this width and weight has loaded, the clock stays as
  // it is (typeset, or the last glass).
  const family = await art.instance(face.url, type.stretch, type.weight);
  if (generation !== clockDrawGeneration) return;
  clockArtKey = key;
  const drawn = art.drawClock(text, { family, weight: type.weight, size: typeSize, letterSpacing }, scale);
  clockArt.style.width = `${drawn.width}px`;
  clockArt.style.height = `${drawn.height}px`;
  clockArt.style.marginInline = `${-drawn.left}px`;
  const bend = size * GLASS_BEND * scale;
  const { map, face: light } = art.paintGlass(drawn.mask, {
    bevel: size * GLASS_BEVEL * scale, bend, scale: bend * 2, tint: rgbOf(computed.color),
  });
  for (const element of [clockRefract, clockRefractMap]) {
    element.setAttribute('width', String(drawn.width));
    element.setAttribute('height', String(drawn.height));
  }
  clockRefractMap.setAttribute('href', map.toDataURL());
  // The map is in device pixels; the filter bends in CSS pixels.
  clockRefractBend.setAttribute('scale', String((bend * 2) / scale));
  const mask = `url(${drawn.mask.toDataURL()})`;
  clockLens.style.maskImage = mask;
  clockLens.style.webkitMaskImage = mask;
  // A contact shadow and a wide soft one, outside the figures.
  const margin = Math.ceil(typeSize * GLASS_SHADOW_MARGIN * scale);
  const cast = art.paintShadow(drawn.mask, [
    { blur: typeSize * 0.012 * scale, y: typeSize * 0.008 * scale, alpha: 0.42 },
    { blur: typeSize * 0.09 * scale, y: typeSize * 0.05 * scale, alpha: 0.3 },
  ], margin);
  clockShadow.width = cast.width;
  clockShadow.height = cast.height;
  clockShadow.getContext('2d').drawImage(cast, 0, 0);
  clockShadow.style.left = clockShadow.style.top = `${-margin / scale}px`;
  clockShadow.style.width = `${cast.width / scale}px`;
  clockShadow.style.height = `${cast.height / scale}px`;
  clockFace.width = light.width;
  clockFace.height = light.height;
  clockFace.getContext('2d').drawImage(light, 0, 0);
  // Shown only once drawn, so the clock never blanks while a face loads.
  clockRow.setAttribute('data-drawn', '');
  clockArt.hidden = false;
}
addEventListener('resize', scheduleClockArt);
// The drawing is made at the display's pixel density, so moving the window to
// another display redraws it.
function watchClockScale() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => {
    scheduleClockArt();
    watchClockScale();
  }, { once: true });
}
watchClockScale();
reducedTransparency.addEventListener('change', scheduleClockArt);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', scheduleClockArt);
// The rule main uses (clock-ink.js), so the clock follows the tone thumb.
function previewClockTone(tone) {
  const base = clockState?.base;
  if (base) paintClockInk(globalThis.blancClockInk.toneInk(base, tone));
}
async function setClock(partial) {
  try {
    applyClock(await window.bowserPages.start.setClock(partial));
  } catch {
    // Not saved: back to the clock as last saved, dropping any preview.
    clockDragging = false;
    clockHeightPreview = null;
    clockWeightPreview = null;
    try {
      applyClock((await window.bowserPages.start.data()).clock);
    } catch {
      applyClock(clockState);
    }
  }
}
// Auto first, then one swatch per Spaces preset in main's order.
function renderClockSwatches(presets) {
  if (clockColors.childElementCount === presets.length + 1) return;
  const swatch = (id, hex) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clock-swatch';
    button.dataset.clockColorPick = id;
    button.setAttribute('aria-label', id === 'auto' ? t('newtab.clock.auto') : SWATCH_NAMES[id] ? t(SWATCH_NAMES[id]) : id);
    if (hex) button.style.setProperty('--swatch', hex);
    button.addEventListener('click', () => setClock({ color: id }));
    return button;
  };
  clockColors.replaceChildren(swatch('auto'), ...presets.map(({ id, hex }) => swatch(id, hex)));
}
function applyClock(clock) {
  if (!clock || typeof clock !== 'object') return;
  clockState = clock;
  clockElement.dataset.font = clock.font;
  clockElement.dataset.style = clock.style;
  // Customize's Clock row: a live sample, and the face, height and style in words.
  clockStyleSample.dataset.font = clock.font;
  clockStyleSample.dataset.style = clock.style;
  const styleName = clock.style === 'glass' ? t('newtab.clock.glass') : t('newtab.clock.solid');
  const summary = [t(CLOCK_FONT_NAMES[clock.font] ?? CLOCK_FONT_NAMES.instrument)];
  if ((clock.height ?? 100) > 100) summary.push(clockPercent.format(clock.height / 100));
  summary.push(styleName);
  clockStyleSummary.textContent = summary.join(' · ');
  renderClockSwatches(clock.presets ?? []);
  for (const button of clockFontPicks) button.setAttribute('aria-pressed', String(button.dataset.clockFontPick === clock.font));
  for (const button of clockStylePicks) button.setAttribute('aria-pressed', String(button.dataset.clockStylePick === clock.style));
  for (const button of clockColors.children) button.setAttribute('aria-pressed', String(button.dataset.clockColorPick === clock.color));
  clockToneLine.hidden = !clock.base;
  // Only a face with room on its width axis can stand taller.
  const tallest = clock.heightRange?.max ?? 100;
  clockHeightLine.hidden = tallest <= 100;
  // Tone's track shows the color from its deepest to its lightest.
  if (clock.base) {
    const { toneInk } = globalThis.blancClockInk;
    clockToneLine.style.setProperty('--clock-tone-deep', toneInk(clock.base, 0));
    clockToneLine.style.setProperty('--clock-tone-mid', clock.base);
    clockToneLine.style.setProperty('--clock-tone-light', toneInk(clock.base, 100));
  }
  scheduleClockArt();
  // A status broadcast must not yank a thumb out from under a drag.
  if (clockDragging) return;
  clockWeight.min = String(clock.range?.min ?? 400);
  clockWeight.max = String(clock.range?.max ?? 700);
  clockWeight.value = String(clock.weight);
  clockTone.value = String(clock.tone);
  clockHeight.max = String(tallest);
  clockHeight.value = String(clock.height ?? 100);
  for (const slider of [clockWeight, clockHeight, clockTone]) paintSliderFill(slider);
  paintClockWeight(clock.weight);
  paintClockInk(clock.ink);
}
// A slider's track is filled up to its thumb (pages.css reads --fill, 0–1,
// from the row, so Weight's rail behind the slider reads it too).
function paintSliderFill(slider) {
  const min = Number(slider.min), max = Number(slider.max);
  const fill = max > min ? (Number(slider.value) - min) / (max - min) : 0;
  slider.parentElement.style.setProperty('--fill', String(Math.max(0, Math.min(1, fill))));
}
// Weight's wedge: a rounded taper from a hairline to a thick end, cut to the
// rail's exact width so its rounded ends stay round.
const clockWeightRail = document.getElementById('clockWeightRail');
const RAIL_THIN = 2;
const RAIL_THICK = 10;
function shapeWeightRail() {
  const width = clockWeightRail.clientWidth;
  if (!width) return;
  const mid = RAIL_THICK / 2, a = RAIL_THIN / 2, b = RAIL_THICK / 2;
  clockWeightRail.style.clipPath = `path('M ${a} ${mid - a} L ${width - b} ${mid - b} `
    + `A ${b} ${b} 0 0 1 ${width - b} ${mid + b} L ${a} ${mid + a} A ${a} ${a} 0 0 1 ${a} ${mid - a} Z')`;
}
new ResizeObserver(shapeWeightRail).observe(clockWeightRail);
for (const button of clockFontPicks) {
  button.addEventListener('click', () => setClock({ font: button.dataset.clockFontPick }));
}
for (const button of clockStylePicks) {
  button.addEventListener('click', () => setClock({ style: button.dataset.clockStylePick }));
}
for (const slider of [clockWeight, clockHeight, clockTone]) {
  slider.addEventListener('input', () => paintSliderFill(slider));
}
clockWeight.addEventListener('input', () => {
  clockDragging = true;
  clockWeightPreview = Number(clockWeight.value);
  paintClockWeight(clockWeightPreview);
});
clockTone.addEventListener('input', () => {
  clockDragging = true;
  previewClockTone(Number(clockTone.value));
});
clockHeight.addEventListener('input', () => {
  clockDragging = true;
  clockHeightPreview = Number(clockHeight.value);
  scheduleClockArt();
});
// A drag ends in `change` only when the value moved. Let go where it started
// and no change comes, so the drag ends on release, back at the saved clock.
function endClockDrag() {
  clockDragging = false;
  clockHeightPreview = null;
  clockWeightPreview = null;
  applyClock(clockState);
}
for (const [slider, key] of [[clockWeight, 'weight'], [clockTone, 'tone'], [clockHeight, 'height']]) {
  slider.addEventListener('change', async () => {
    const value = Number(slider.value);
    clockDragging = false;
    // Kept at once, so the clock doesn't fall back to the old height while the
    // save is on its way (or a new drag has begun).
    if (key === 'height') {
      clockState = { ...clockState, height: value };
      clockHeightPreview = null;
    }
    if (key === 'weight') {
      clockState = { ...clockState, weight: value };
      clockWeightPreview = null;
    }
    await setClock({ [key]: value });
  });
  const release = () => setTimeout(() => {
    if (clockDragging && clockState?.[key] === Number(slider.value)) endClockDrag();
  });
  for (const type of ['pointerup', 'pointercancel', 'keyup', 'blur']) slider.addEventListener(type, release);
}
// Customize closes and the clock's own popover opens under the clock, so the
// clock stays in view while it changes.
// Opened from the keyboard (a click with no pointer behind it), focus lands
// on the chosen font, ringed; opened with the pointer, it lands on the sheet
// itself, so no ring shows until Tab moves into it.
function openClockSheet(fromKeyboard) {
  document.getElementById('customizePopover').hidePopover();
  clockPopover.showPopover();
  if (fromKeyboard) clockFontPicks.find((button) => button.getAttribute('aria-pressed') === 'true')?.focus();
  else clockPopover.focus();
}
clockStyleOpen.addEventListener('click', (event) => openClockSheet(event.detail === 0));
// Right-clicking the clock opens its sheet, as a long press on the Lock
// Screen does, instead of the page's context menu. On macOS and Linux the
// event comes on press, and the release that follows would count as a click
// outside the new sheet and close it, so it opens once the button is up.
// A press that never ends in a release here (the window loses focus, the
// pointer is cancelled) opens nothing and leaves no listener behind.
let clockMenuPress = null;
clockRow.addEventListener('contextmenu', (event) => {
  if (state.layout !== 'billboard') return;
  event.preventDefault();
  if (clockPopover.matches(':popover-open')) return;
  clockMenuPress?.abort();
  clockMenuPress = null;
  const open = () => setTimeout(() => openClockSheet(false));
  if (!event.buttons) {
    open();
    return;
  }
  const press = new AbortController();
  clockMenuPress = press;
  const end = () => {
    press.abort();
    if (clockMenuPress === press) clockMenuPress = null;
  };
  // Any button: Control-click on a Mac is a primary press.
  addEventListener('pointerup', () => {
    end();
    open();
  }, { signal: press.signal });
  for (const type of ['pointercancel', 'blur']) addEventListener(type, end, { signal: press.signal });
});
// Back returns to Customize, where the sheet was opened from. From the
// keyboard, focus lands on the Clock row again.
let clockGoingBack = false;
document.getElementById('clockPopoverBack').addEventListener('click', (event) => {
  // Cleared by the toggle event, which comes after this handler.
  clockGoingBack = true;
  clockPopover.hidePopover();
  document.getElementById('customizePopover').showPopover();
  if (event.detail === 0) clockStyleOpen.focus();
});
clockPopover.addEventListener('toggle', (event) => {
  if (event.newState !== 'closed') return;
  if (clockGoingBack) {
    clockGoingBack = false;
    return;
  }
  // Closed any other way, keyboard focus returns to the Customize button.
  if (document.activeElement === document.body || clockPopover.contains(document.activeElement)) {
    document.getElementById('customizeButton').focus();
  }
});

// A separate footer action opens the standalone game. Target=_blank is
// adopted by the browser's managed-tab handler; its session follows this tab.
document.getElementById('mahjongLink').href = isPrivate
  ? 'blanc://mahjong/?private=1'
  : 'blanc://mahjong/';
document.getElementById('mahjongLink').addEventListener('click', (event) => {
  event.preventDefault();
  window.bowserPages.start.openMahjong(event.metaKey || event.ctrlKey).catch(() => {});
});
document.getElementById('mahjongLink').addEventListener('auxclick', (event) => {
  if (event.button !== 1) return;
  event.preventDefault();
  window.bowserPages.start.openMahjong(true).catch(() => {});
});

function applyLayout(name) {
  if (!['ledger', 'billboard', 'shelf', 'tally'].includes(name)) name = 'billboard';
  state.layout = name;
  document.body.dataset.layout = name;
  presentPendingMigrationChecklistCompletion();
  window.bowserPages?.start?.layoutUsed?.(name).catch(() => {});
  for (const button of document.querySelectorAll('[data-layout-pick]')) {
    const isActive = button.dataset.layoutPick === name;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
  stopClock();
  if (name !== 'billboard' && clockPopover.matches(':popover-open')) clockPopover.hidePopover();
  if (!rendered.has(name)) {
    if (name === 'billboard') renderBillboard();
    if (name === 'shelf') renderShelf();
    if (name === 'tally') renderTally();
    rendered.add(name);
  }
  if (name === 'billboard') startClock();
  if (name === 'billboard') fillBillboardSites().catch(() => {});
}

const layoutButtons = [...document.querySelectorAll('[data-layout-pick]')];
const layoutSaveStatus = document.getElementById('layoutSaveStatus');
let layoutWritePending = false;
for (const button of layoutButtons) {
  button.addEventListener('click', async () => {
    if (layoutWritePending) return;
    const pick = button.dataset.layoutPick;
    layoutWritePending = true;
    layoutSaveStatus.hidden = true;
    for (const item of layoutButtons) item.setAttribute('aria-disabled', 'true');
    try {
      const saved = await window.bowserPages.start.setLayout(pick);
      applyLayout(saved);
    } catch {
      // A timeout can occur after the write: do not claim it was not saved.
      layoutSaveStatus.textContent = t('start.layout.unconfirmed');
      layoutSaveStatus.hidden = false;
    } finally {
      layoutWritePending = false;
      for (const item of layoutButtons) item.removeAttribute('aria-disabled');
      // Reconcile the actual shared setting, including other windows' changes.
      window.blancNewTabEvent('layout');
    }
  });
}
const clockReadStatus = document.getElementById('clockReadStatus');
document.addEventListener('blancClockReadFailure', () => {
  clockReadStatus.textContent = t('start.clock.readFailed');
  clockReadStatus.hidden = false;
});
document.addEventListener('blancClockReadSuccess', () => { clockReadStatus.hidden = true; });

// Customize: the native popover owns opening, Escape, click-outside and
// focus return. This only mirrors its state onto the opener. Picking a layout
// leaves it open so layouts can be compared.
const customizeButton = document.getElementById('customizeButton');
const customizePopover = document.getElementById('customizePopover');
customizePopover.addEventListener('toggle', (event) => {
  customizeButton.setAttribute('aria-expanded', String(event.newState === 'open'));
});

// Favorites and start data resolve independently. A layout rendered from
// whichever landed first would cache a half-empty draw, so the alternative
// layouts wait for both; the ledger still paints incrementally as it always
// has.
const favoritesReady = window.bowserPages?.bookmarks.list().then((items) => {
  state.favorites = items;
  renderLedgerFavorites();
  invalidate();
});
const pinsReady = loadPins({ propagateError: true }).then(() => {
  renderLedgerFavorites();
  invalidate();
});
// Pins change from other pages too (another start page, the Favorites page,
// a tab's menu); a notice that brings nothing new changes nothing here.
window.bowserPages?.pins?.onChanged?.(() => {
  return loadPins().then((changed) => {
    if (changed) renderPinnedLayouts();
  }).catch(() => {});
});

const wallpaper = window.blancNewtabWallpaper.mount(document, window);
const wallpaperToggle = document.getElementById('dynamicWallpaperToggle');
const customWallpaperToggle = document.getElementById('customWallpaperToggle');
const sunriseWallpaperPick = document.getElementById('sunriseWallpaperPick');
const customWallpaperRow = document.getElementById('customWallpaperRow');
const customWallpaperCover = document.getElementById('customWallpaperCover');
const customWallpaperActions = document.getElementById('customWallpaperActions');
const customWallpaperChange = document.getElementById('customWallpaperChange');
const customWallpaperRemove = document.getElementById('customWallpaperRemove');
const customWallpaperError = document.getElementById('customWallpaperError');
const customWallpaperWash = document.getElementById('customWallpaperWash');
const customWallpaperStyleRow = document.getElementById('customWallpaperStyleRow');
const customWallpaperStyles = [...customWallpaperStyleRow.querySelectorAll('[data-wallpaper-style-pick]')];
const colorWallpaperPick = document.getElementById('colorWallpaperPick');
const colorWallpaperOptions = document.getElementById('colorWallpaperOptions');
const colorWallpaperSwatches = document.getElementById('colorWallpaperSwatches');
const colorWallpaperFills = [...document.querySelectorAll('[data-wallpaper-fill-pick]')];
const colorWallpaperFollow = document.getElementById('colorWallpaperFollow');
const colorWallpaperFollowHint = document.getElementById('colorWallpaperFollowHint');
// The Spaces color names, shared with the Spaces menu.
const SWATCH_NAMES = {
  sage: 'spaces.color.sage', sky: 'spaces.color.sky', iris: 'spaces.color.iris', rose: 'spaces.color.rose',
  clay: 'spaces.color.clay', sand: 'spaces.color.sand', slate: 'spaces.color.slate', graphite: 'spaces.color.graphite',
};
// Main's finished paint for the Color wallpaper, as pages.css custom properties.
const COLOR_PAINT_PROPERTIES = {
  base: '--start-color-base', glow: '--start-color-glow', deep: '--start-color-deep',
  ink: '--start-color-ink', dim: '--start-color-dim', softLight: '--start-color-soft-light', softDark: '--start-color-soft-dark',
};
const WALLPAPER_ERRORS = {
  'too-large': 'newtab.wallpaper.error.tooLarge',
  unsupported: 'newtab.wallpaper.error.unsupported',
  unreadable: 'newtab.wallpaper.error.unreadable',
};
let dynamicWallpaperEnabled = false;
// Main's projection for this page (F49): { source, hasImage, image, wash,
// style, color }; `color` is null in a private tab.
let wallpaperState = { source: 'sunrise', hasImage: false, image: null, wash: 100, style: 'auto', color: null };
let washDragging = false;
// The wash is a 0–1 multiplier on the theme's image overlay in pages.css.
const washPercent = new Intl.NumberFormat(blancI18n.formatLocale(), { style: 'percent' });
const customWallpaperWashValue = document.getElementById('customWallpaperWashValue');
function paintWash(percent) {
  document.body.style.setProperty('--start-wallpaper-wash', String(percent / 100));
  customWallpaperWashValue.textContent = washPercent.format(percent / 100);
}
let wallpaperUpdatePending = false;
// A private Start Page never shows the person's own image, so it offers no choice.
if (isPrivate) {
  document.getElementById('wallpaperSourcePicker').hidden = true;
  customWallpaperCover.hidden = true;
}
// One swatch per Spaces preset, in main's order, named in this language.
function renderColorSwatches(presets) {
  if (colorWallpaperSwatches.childElementCount === presets.length) return;
  colorWallpaperSwatches.replaceChildren(...presets.map(({ id, hex }) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'wallpaper-swatch';
    swatch.dataset.wallpaperColorPick = id;
    swatch.setAttribute('aria-label', SWATCH_NAMES[id] ? t(SWATCH_NAMES[id]) : id);
    swatch.style.setProperty('--swatch', hex);
    swatch.addEventListener('click', () => updateWallpaper(async () => applyWallpaper(
      await window.bowserPages.start.setWallpaperColor(id))));
    return swatch;
  }));
}
function renderColorControls(color) {
  if (!color) return;
  renderColorSwatches(color.presets ?? []);
  for (const swatch of colorWallpaperSwatches.children) {
    swatch.setAttribute('aria-pressed', String(swatch.dataset.wallpaperColorPick === color.preset));
  }
  const paint = color.paint;
  // While this window shows its space's color, the swatches apply only
  // outside spaces, so they step back.
  colorWallpaperSwatches.classList.toggle('is-overridden', paint?.fromSpace === true);
  for (const button of colorWallpaperFills) {
    button.setAttribute('aria-pressed', String(button.dataset.wallpaperFillPick === paint?.fill));
  }
  colorWallpaperFollow.setAttribute('aria-pressed', String(color.followSpace === true));
  colorWallpaperFollowHint.textContent = color.followSpace && color.inSpace
    ? t('newtab.wallpaper.followSpaceShowing')
    : t('newtab.wallpaper.followSpaceHint');
  if (!paint) return;
  for (const [key, property] of Object.entries(COLOR_PAINT_PROPERTIES)) {
    document.body.style.setProperty(property, paint[key]);
  }
  customWallpaperCover.dataset.fill = paint.fill;
}
function renderWallpaperControls() {
  const storeTheme = wallpaperState.source === 'web-store';
  const custom = wallpaperState.source === 'custom';
  const color = wallpaperState.source === 'color';
  sunriseWallpaperPick.setAttribute('aria-pressed', String(!custom && !color));
  colorWallpaperPick.setAttribute('aria-pressed', String(color));
  customWallpaperToggle.setAttribute('aria-pressed', String(custom));
  // Each wallpaper shows only its own options.
  wallpaperToggle.hidden = custom || color || storeTheme;
  wallpaperToggle.setAttribute('aria-pressed', String(dynamicWallpaperEnabled));
  colorWallpaperOptions.hidden = !color;
  customWallpaperRow.hidden = !custom;
  customWallpaperActions.hidden = !custom;
  renderColorControls(wallpaperState.color);
  // pages.css paints the page from the color only while it is the wallpaper.
  const paint = color ? wallpaperState.color?.paint : null;
  if (paint) {
    document.body.dataset.wallpaperFill = paint.fill;
    // Light ink takes the dark text set, dark ink the light one.
    document.body.dataset.wallpaperInk = paint.ink === '#ffffff' ? 'light' : 'dark';
  } else {
    delete document.body.dataset.wallpaperFill;
    delete document.body.dataset.wallpaperInk;
  }
  // The cover previews whatever the Start Page shows.
  customWallpaperCover.dataset.source = custom || storeTheme ? 'custom' : color ? 'color' : 'sunrise';
  if (wallpaperState.image) customWallpaperCover.style.setProperty('--wallpaper-thumb', `url("${wallpaperState.image}")`);
  else customWallpaperCover.style.removeProperty('--wallpaper-thumb');
  const style = wallpaperState.style ?? 'auto';
  for (const button of customWallpaperStyles) {
    button.setAttribute('aria-pressed', String(button.dataset.wallpaperStylePick === style));
  }
  // pages.css keys the forced Light/Dark colors and the Spotlight shape off this.
  if (custom || storeTheme) document.body.dataset.wallpaperStyle = style;
  else delete document.body.dataset.wallpaperStyle;
  // A status broadcast must not yank the thumb out from under a drag.
  if (!washDragging && Number.isInteger(wallpaperState.wash)) {
    customWallpaperWash.value = String(wallpaperState.wash);
    paintWash(wallpaperState.wash);
  }
  for (const control of [wallpaperToggle, sunriseWallpaperPick, colorWallpaperPick, customWallpaperToggle, customWallpaperChange,
    customWallpaperRemove, ...customWallpaperStyles, ...colorWallpaperSwatches.children, ...colorWallpaperFills, colorWallpaperFollow]) {
    control.disabled = wallpaperUpdatePending;
  }
}
function applyWallpaper(state) {
  if (state && typeof state === 'object') wallpaperState = state;
  wallpaper.setSource(wallpaperState.source === 'web-store' ? { ...wallpaperState, source: wallpaperState.hasImage ? 'custom' : 'sunrise' } : wallpaperState);
  renderWallpaperControls();
  // The wallpaper can change the page's ink, and so an Automatic clock's.
  scheduleClockArt();
}
function applyDynamicWallpaper(enabled) {
  dynamicWallpaperEnabled = enabled === true;
  // The synced switch decides the artwork unless a color or this device's own
  // image shows instead.
  if (wallpaperState.source === 'custom' || wallpaperState.source === 'color' || wallpaperState.source === 'web-store') renderWallpaperControls();
  else applyWallpaper({ ...wallpaperState, source: dynamicWallpaperEnabled ? 'time-of-day' : 'sunrise' });
}
function showWallpaperError(code) {
  const key = WALLPAPER_ERRORS[code];
  customWallpaperError.hidden = !key;
  customWallpaperError.textContent = key ? t(key) : '';
}
async function updateWallpaper(write) {
  wallpaperUpdatePending = true;
  renderWallpaperControls();
  try {
    await write();
  } catch {
    // Keep the last acknowledged state when the write fails.
  } finally {
    wallpaperUpdatePending = false;
    renderWallpaperControls();
  }
}
const chooseWallpaperImage = () => updateWallpaper(async () => {
  const reply = await window.bowserPages.start.chooseWallpaper();
  showWallpaperError(reply?.error);
  applyWallpaper(reply?.wallpaper);
});
wallpaperToggle.addEventListener('click', () => updateWallpaper(async () => {
  applyDynamicWallpaper(await window.bowserPages.start.setDynamicWallpaper(!dynamicWallpaperEnabled));
}));
sunriseWallpaperPick.addEventListener('click', () => {
  showWallpaperError(null);
  if (wallpaperState.source !== 'custom' && wallpaperState.source !== 'color' && wallpaperState.source !== 'web-store') return;
  // Back to Sunrise, keeping whatever the time-of-day switch says.
  updateWallpaper(async () => applyWallpaper(
    await window.bowserPages.start.setWallpaper(dynamicWallpaperEnabled ? 'time-of-day' : 'sunrise')));
});
customWallpaperToggle.addEventListener('click', () => {
  showWallpaperError(null);
  if (wallpaperState.source === 'custom') return;
  if (wallpaperState.hasImage) {
    updateWallpaper(async () => applyWallpaper(await window.bowserPages.start.setWallpaper('custom')));
  } else {
    chooseWallpaperImage();
  }
});
customWallpaperChange.addEventListener('click', () => chooseWallpaperImage());
colorWallpaperPick.addEventListener('click', () => {
  showWallpaperError(null);
  if (wallpaperState.source === 'color') return;
  updateWallpaper(async () => applyWallpaper(await window.bowserPages.start.setWallpaper('color')));
});
for (const button of colorWallpaperFills) {
  button.addEventListener('click', () => updateWallpaper(async () => applyWallpaper(
    await window.bowserPages.start.setWallpaperFill(button.dataset.wallpaperFillPick))));
}
colorWallpaperFollow.addEventListener('click', () => updateWallpaper(async () => applyWallpaper(
  await window.bowserPages.start.setWallpaperFollowSpace(wallpaperState.color?.followSpace !== true))));
for (const button of customWallpaperStyles) {
  button.addEventListener('click', () => updateWallpaper(async () => applyWallpaper(
    await window.bowserPages.start.setWallpaperStyle(button.dataset.wallpaperStylePick))));
}
// Paint while dragging; save once, on release.
customWallpaperWash.addEventListener('input', () => {
  washDragging = true;
  paintWash(Number(customWallpaperWash.value));
});
customWallpaperWash.addEventListener('change', async () => {
  try {
    applyWallpaper(await window.bowserPages.start.setWallpaperWash(Number(customWallpaperWash.value)));
  } catch {
    // The saved value comes back with the next status.
  } finally {
    washDragging = false;
    renderWallpaperControls();
  }
});
customWallpaperRemove.addEventListener('click', () => updateWallpaper(async () => {
  showWallpaperError(null);
  applyWallpaper(await window.bowserPages.start.removeWallpaper());
}));
function applyStartData(data) {
  // An earlier initial request may resolve after a history deletion event.
  const currentTopSites = isPrivate || window.blancTopSitesSnapshotCurrent?.(data.__topSitesEpoch) === true;
  const validTopSites = isPrivate || (data.__topSitesAvailable === true && currentTopSites);
  if (!validTopSites) {
    // Keep a newer successful projection if this older response was delayed.
    // An invalidation already removed any ranking derived from deleted history.
    if (currentTopSites) window.blancTopSitesUnavailable?.();
    data = { ...data, topSites: state.topSites };
    window.blancNewTabEvent?.('topSites');
  }
  wallpaper.setVisible(data.wallpaperVisible === true);
  // The projection first, so the switch below cannot paint a frame the
  // projection then replaces.
  applyWallpaper(data.wallpaper);
  applyDynamicWallpaper(data.dynamicWallpaperEnabled);
  applyClock(data.clock);
  migrationChecklistUtilitySheetVisible = data.utilitySheetVisible === true;
  Object.assign(state, {
    layout: data.layout ?? 'billboard',
    groups: data.groups ?? state.groups,
    blockerStatisticsAvailable: data.blockerStatisticsAvailable === true,
    blockedThisWeek: data.blockedThisWeek,
    blockedByDay: data.blockedByDay ?? state.blockedByDay,
    blockedBarHeights: data.blockedBarHeights ?? state.blockedBarHeights,
    topSites: data.topSites ?? [],
    onboarding: data.onboarding ?? null,
  });
  if (validTopSites) {
    topSitesReady = true;
    topSitesOffset = state.topSites.length;
    topSitesExhausted = isPrivate || state.topSites.length < TOP_SITES_PAGE_SIZE;
  }
  renderLaunchStatus({ startup: data.startup, recovery: data.recovery, privacy: data.privacy });
  applyPatronStatus(data);
  renderMigrationChecklist(data.migrationChecklist ?? null);
  if (!isPrivate) {
    const footer = document.getElementById('footerLeft');
    footer.hidden = !state.blockerStatisticsAvailable;
    footer.textContent = t('newtab.footer.blocked', { count: state.blockedThisWeek });
  }
  renderLedgerGroups(state.groups);
  renderRemote(data.remoteDevices);
  renderSent(data.sentItems);
  invalidate();
}
const dataReady = window.bowserPages?.start.data().then(applyStartData);

Promise.allSettled([favoritesReady, dataReady, pinsReady]).then((results) => {
  // A failed initial source must not permanently suppress later changes.
  // Keep the unavailable blocker count hidden; no failed source is treated
  // as a successful empty result.
  try { applyLayout(state.layout); }
  catch { console.warn('Start Page layout is unavailable'); }
  document.dispatchEvent(new Event('blancStartDataReady'));
  if (results[0].status === 'rejected') window.blancNewTabEvent('bookmarks');
  if (results[1].status === 'rejected') window.blancNewTabEvent('startData');
  if (results[2].status === 'rejected') window.blancNewTabEvent('pins');
  // Layout changes fade in from now on; the first paint never does.
  requestAnimationFrame(() => document.body.classList.add('layout-ready'));
});

window.bowserPages?.start.onVisibility((visible) => wallpaper.setVisible(visible));
window.bowserPages?.start.onRemoteTabs(renderRemote);
window.bowserPages?.start.onSentItems?.(renderSent);
window.bowserPages?.start.onStatus((status) => {
  renderLaunchStatus(status);
  if (status && 'wallpaper' in status) applyWallpaper(status.wallpaper);
  if (status && 'clock' in status) applyClock(status.clock);
  if (status && 'dynamicWallpaperEnabled' in status) {
    applyDynamicWallpaper(status.dynamicWallpaperEnabled);
  }
  if (!layoutWritePending && status?.layout && status.layout !== state.layout) applyLayout(status.layout);
  if (status) applyPatronStatus(status);
  if (status && 'migrationChecklist' in status) {
    renderMigrationChecklist(status.migrationChecklist ?? null);
  }
});

// Footer edge: the fixed footer shows a soft fade only while content runs
// underneath it. The sentinel ends the content area; "under" means it sits
// below the band the footer leaves visible.
const startContentEnd = document.getElementById('startContentEnd');
const layoutFooter = document.getElementById('layoutFooter');
let underflowObserver = null;
function observeUnderflow() {
  underflowObserver?.disconnect();
  underflowObserver = new IntersectionObserver(([entry]) => {
    const under = !entry.isIntersecting && entry.boundingClientRect.top >= entry.rootBounds.bottom;
    document.body.classList.toggle('has-underflow', under);
  }, { rootMargin: `0px 0px -${layoutFooter.offsetHeight}px 0px` });
  underflowObserver.observe(startContentEnd);
}

// The fixed footer wraps to two rows in narrow windows and the brand row
// changes with the viewport, so the stylesheet reads their real heights:
// the body reserves exactly the footer, and Billboard centres its content
// in the open area between the window top and the footer. One observer
// watches both and also re-aims the footer-edge fade above.
const startHeader = document.querySelector('.start-header');
function publishFrameHeights() {
  const root = document.documentElement.style;
  root.setProperty('--start-header-h', `${startHeader.offsetHeight}px`);
  root.setProperty('--start-footer-h', `${layoutFooter.offsetHeight}px`);
  observeUnderflow();
}
publishFrameHeights();
const frameHeightObserver = new ResizeObserver(publishFrameHeights);
frameHeightObserver.observe(startHeader);
frameHeightObserver.observe(layoutFooter);

// The pill's caret says keystrokes land somewhere. They do: a printable
// character typed on a blank start page opens the island with that character
// already in it.
//
// This lives in the renderer rather than a main-side before-input-event
// because only the renderer knows what is focused — a main-side hook fires
// before page dispatch and would steal keys from the onboarding dialog's own
// controls. `target === document.body` is that check: a keystroke aimed at
// any control has that control as its target.
document.addEventListener('keydown', (e) => {
  if (e.target !== document.body) return;
  // ...and not while a modal is up. The onboarding dialog focuses its own
  // Continue button when it opens, so target is that button and the check
  // above is usually enough — but clicking any non-focusable part of the
  // dialog (its body copy) puts activeElement back on <body>, and typing
  // would then open the island BEHIND the modal. Matched by role rather
  // than by id so a future modal is covered without touching this file.
  if (document.querySelector('[role="dialog"][aria-modal="true"]:not([hidden])')) return;
  if (!globalThis.blancTypeToOpen.isTypeToOpenKey(e, isMac)) return;
  e.preventDefault();
  // `?.` on the bridge matches the rest of this file — tab-preload only
  // exposes bowserPages on the blanc: protocol. The gate is called directly:
  // if type-to-open.js failed to load that is a build error worth surfacing,
  // not something to swallow on every keystroke.
  window.bowserPages?.start.openIsland(e.key);
});

document.getElementById('storeThemeWallpaperPick').addEventListener('click', () => updateWallpaper(async () => applyWallpaper(await window.bowserPages.start.setWallpaper('web-store'))));
