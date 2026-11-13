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
const migrationIphoneTask = document.getElementById('migrationIphoneTask');
const migrationIphoneAction = document.getElementById('migrationIphoneAction');
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
  migrationIphoneTask.hidden = checklist.iphoneAvailable !== true;
  setMigrationTask(migrationIphoneTask, migrationIphoneAction, checklist.iphoneComplete === true, t('newtab.checklist.iphone'));
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
// Settings → Sync with the pairing sheet open (design 2026-10-28 §6.1).
migrationIphoneAction.addEventListener('click', () => {
  closeMigrationChecklistPopover();
  window.bowserPages?.start.openSettings('sync-pair').catch(() => {});
});
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
  // The Favorites widget (V24) lists up to eight, the most any old layout
  // showed; given a size (or while being resized) it lists them all and
  // scrolls inside its card.
  const sized = document.getElementById('favoritesWidget')?.dataset.size !== undefined;
  const tiles = favoriteTilesFor(sized ? 500 : 8);
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
  rendered.add(state.layout);
}

// Tab sync: other devices' tabs, read-only — clicking navigates the current
// tab, same as favorites above. Renders only when snapshots exist so the
// ledger stays quiet otherwise. Re-rendered in place when a pull completes
// after first paint (pages:start:remote-tabs).
// Grouped by device (fork redesign, 2026-11-13): each device's name once,
// with a laptop or phone glyph and its tab count; under it its tabs as
// two-line rows, the whole title on the first line and the site under it.
// Three tabs a device, the rest one tap away. The row keeps shipping's
// .fav/.tile/.name/.host parts; its device is data-device.
const REMOTE_TABS_SHOWN = 3;
const remoteExpanded = new Set();
function remoteDeviceKind(device) {
  const hint = `${device.platform ?? ''} ${device.name ?? ''}`.toLowerCase();
  return /iphone|ipad|ios|android|phone|pixel|galaxy/.test(hint) ? 'phone' : 'computer';
}
function remoteDeviceGlyph(kind) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'remote-device-glyph');
  const shapes = kind === 'phone'
    ? [['rect', { x: 4.5, y: 1.75, width: 7, height: 12.5, rx: 1.8 }], ['path', { d: 'M7 11.9h2' }]]
    : [['rect', { x: 2.5, y: 3, width: 11, height: 7.5, rx: 1.2 }], ['path', { d: 'M1 13h14' }]];
  for (const [tag, attrs] of shapes) {
    const node = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    svg.append(node);
  }
  return svg;
}
function renderRemote(remoteDevices) {
  const section = document.getElementById('remoteSection');
  const list = document.getElementById('remoteList');
  list.replaceChildren();
  const devices = (remoteDevices ?? []).filter((device) => device?.tabs?.length);
  section.hidden = !devices.length;
  if (section.hidden) return;
  list.classList.add('remote-grouped');
  for (const device of devices) {
    const key = String(device.deviceId ?? device.name);
    const group = document.createElement('div');
    group.className = 'remote-device';
    group.dataset.i18nIgnore = ''; // page titles, hosts and device names
    const head = document.createElement('div');
    head.className = 'remote-device-head';
    const name = document.createElement('span');
    name.className = 'remote-device-name';
    name.textContent = device.name;
    const count = document.createElement('span');
    count.className = 'remote-device-count';
    count.textContent = t('start.devices.tabs', { count: device.tabs.length });
    head.append(remoteDeviceGlyph(remoteDeviceKind(device)), name, count);
    const rows = document.createElement('div');
    rows.className = 'remote-device-tabs';
    const open = remoteExpanded.has(key);
    const shown = open ? device.tabs : device.tabs.slice(0, REMOTE_TABS_SHOWN);
    for (const tab of shown) {
      const row = document.createElement('a');
      row.className = 'fav remote-tab';
      row.href = tab.url;
      row.dataset.device = device.name;
      const host = hostOf(tab.url);
      const tile = document.createElement('span');
      tile.className = 'tile';
      // The same letter-then-icon treatment favorites get; 'synced' restricts it
      // to the inert PNG payload and skips the bookmark-clearing error path.
      decorateTile(tile, tab, { mode: 'synced' });
      const text = document.createElement('span');
      text.className = 'remote-tab-text';
      const title = document.createElement('span');
      title.className = 'name';
      title.textContent = tab.title && tab.title !== tab.url ? tab.title : host || tab.url;
      const hostEl = document.createElement('span');
      hostEl.className = 'host';
      hostEl.textContent = host;
      text.append(title, hostEl);
      row.title = tab.title || tab.url;
      row.append(tile, text);
      rows.append(row);
    }
    group.append(head, rows);
    const hidden = device.tabs.length - REMOTE_TABS_SHOWN;
    if (hidden > 0) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'remote-device-more';
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? t('start.devices.fewer') : t('start.devices.more', { count: hidden });
      more.addEventListener('click', () => {
        if (open) remoteExpanded.delete(key); else remoteExpanded.add(key);
        renderRemote(remoteDevices);
        list.querySelector(`.remote-device:nth-child(${devices.indexOf(device) + 1}) .remote-device-more`)?.focus();
      });
      group.append(more);
    }
    list.append(group);
  }
  remoteFade(list);
}
// The list scrolls inside its card when the devices outgrow the page; a soft
// fade at the edge says there is more, and goes away at the end.
function remoteFade(list) {
  const more = list.scrollHeight - list.clientHeight - list.scrollTop > 2;
  list.dataset.fadeEnd = String(more);
  list.dataset.fadeStart = String(list.scrollTop > 2);
}
let remoteScrollIdle = 0;
for (const scroller of [document.getElementById('remoteList'), document.getElementById('favoritesList')]) scroller?.addEventListener('scroll', (event) => {
  const list = event.currentTarget;
  remoteFade(list);
  // The scrollbar shows while the list moves (a finger, a wheel or keys),
  // then hides again unless the pointer is over it.
  list.dataset.scrolling = 'true';
  clearTimeout(remoteScrollIdle);
  remoteScrollIdle = setTimeout(() => { list.dataset.scrolling = 'false'; }, 900);
}, { passive: true });
for (const list of [document.getElementById('remoteList'), document.getElementById('favoritesList')]) {
  if (list) new ResizeObserver(() => remoteFade(list)).observe(list);
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
  widgets: { favorites: false, devices: false, chart: false, shortcuts: false },
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
    // The count alone (owner, 2026-11-13; fork string).
    : t('start.billboard.blocked', { count: state.blockedThisWeek });

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

const billboardSiteCount = () => (state.widgets?.shortcuts ? 12 : 6);
function visibleBillboardSites() {
  return startPins.billboardSites(state.pins, state.topSites, hiddenTopSites, billboardSiteCount());
}

async function fillBillboardSites() {
  if (
    isPrivate ||
    !topSitesReady ||
    topSitesExhausted ||
    visibleBillboardSites().length >= billboardSiteCount() ||
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
  if (visibleBillboardSites().length < billboardSiteCount() && !topSitesExhausted) {
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
  // The week's chart card is gone from the fork's Start Page (V26).
  if (!document.getElementById('tlCount')) return;
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
  // The busiest day alone (owner, 2026-11-13: no "nothing followed you home").
  if (peak > 0) caption.append(t('newtab.tally.busiest', { day: DAY_NAMES[state.blockedByDay.indexOf(peak)] }));
  caption.hidden = peak <= 0;
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

  // Optical centring (owner, 2026-11-13): the figures' ink, not their
  // advance box, sits on the page's centre line. Measured with the same face
  // the glass draws with (proportional figures at this exact width and
  // weight); the row moves, so the glass and native clock move with it.
  try {
    const inkFamily = await art.instance(face.url, type.stretch, type.weight);
    if (generation !== clockDrawGeneration) return;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `${Math.round(type.weight)} ${parseFloat(computed.fontSize)}px ${inkFamily}`;
    measure.letterSpacing = computed.letterSpacing === 'normal' ? '0px' : computed.letterSpacing;
    const m = measure.measureText(clockElement.textContent);
    const offset = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 - m.width / 2;
    clockElement.closest('.bb-clock-row')?.style.setProperty('--clock-optical', `${(-offset).toFixed(2)}px`);
  } catch {
    clockElement.closest('.bb-clock-row')?.style.removeProperty('--clock-optical');
  }

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

// V24 (fork only): Billboard is the one layout. What Ledger, Shelf and Tally
// showed comes back as optional widgets (applyWidgets below).
function applyLayout(name) {
  name = 'billboard';
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

// V26 (owner, 2026-11-13): no Blocked this week widget; Billboard's line
// under the clock always says the week's count.
const WIDGET_NAMES = ['favorites', 'devices', 'shortcuts'];
/** Shows the widgets that are on and sets their switches. Turning More
 * shortcuts on or off redraws Billboard's tiles at 12 or 6. */
function applyWidgets(widgets) {
  const next = Object.fromEntries(WIDGET_NAMES.map((name) => [name, widgets?.[name] === true]));
  const tilesChanged = state.widgets?.shortcuts !== next.shortcuts;
  next.place = widgets?.place ?? state.widgets?.place ?? { left: ['favorites', 'devices'], right: ['sent'] };
  next.panels = widgets?.panels ?? state.widgets?.panels ?? [];
  next.sizes = widgets?.sizes ?? state.widgets?.sizes ?? {};
  state.widgets = next;
  syncPanelCards(next.panels);
  if (!cardDrag && !cardResize) placeCards(next.place);
  applyCardSizes(next.sizes);
  placePanels();
  for (const section of document.querySelectorAll('#bbWidgets [data-widget]')) {
    section.classList.toggle('widget-on', next[section.dataset.widget] === true);
  }
  for (const button of widgetButtons) {
    button.setAttribute('aria-checked', String(next[button.dataset.widgetPick] === true));
  }
  for (const button of document.querySelectorAll('[data-shortcuts]')) {
    button.setAttribute('aria-pressed', String((button.dataset.shortcuts === '12') === next.shortcuts));
  }
  updateShortcutsHint();
  if (tilesChanged && rendered.has('billboard')) {
    renderBillboard();
    fillBillboardSites().catch(() => {});
  }
}

// The cards' columns (V24): each card in its column and order, top to
// bottom. A column with nothing showing folds away under the clock.
const cardRails = { left: document.getElementById('bbRailLeft'), right: document.getElementById('bbRailRight') };
const widgetMoveStatus = document.getElementById('widgetMoveStatus');
let cardDrag = null;
const cardShown = (card) => getComputedStyle(card).display !== 'none';
const cardName = (card) => card.querySelector('.ledger-label')?.textContent.trim() ?? '';
// Moves only the cards that are out of place: re-inserting one that is
// already right would drop a pointer it holds (a resize in progress) and
// its focus.
function placeCards(place) {
  for (const side of ['left', 'right']) {
    const rail = cardRails[side];
    let at = 0;
    for (const name of place?.[side] ?? []) {
      const card = document.querySelector(`.bb-widget[data-card="${name}"]`);
      if (!card) continue;
      if (rail.children[at] !== card) rail.insertBefore(card, rail.children[at] ?? null);
      at += 1;
    }
  }
  refreshRails();
}
function refreshRails() {
  for (const rail of Object.values(cardRails)) {
    rail.dataset.empty = String(![...rail.children].some((card) => card.matches('.bb-widget') && cardShown(card)));
  }
  for (const grip of document.querySelectorAll('.bb-widget-grip')) {
    grip.setAttribute('aria-label', t('start.widgets.move', { name: cardName(grip.closest('.bb-widget')) }));
  }
}
const railOrder = (rail) => [...rail.children].filter((card) => card.matches('.bb-widget')).map((card) => card.dataset.card);
async function saveCardPlace(card) {
  const side = card.parentElement === cardRails.right ? 'right' : 'left';
  const shown = [...cardRails[side].children].filter((c) => c.matches('.bb-widget') && cardShown(c));
  widgetMoveStatus.textContent = t(side === 'left' ? 'start.widgets.movedLeft' : 'start.widgets.movedRight',
    { name: cardName(card), position: shown.indexOf(card) + 1 });
  refreshRails();
  try { applyWidgets(await window.bowserPages.start.setWidgetPlace(railOrder(cardRails.left), railOrder(cardRails.right))); }
  catch { window.blancNewTabEvent('widgets'); }
}
// Which column and slot a point is over: the nearer column, and the slot
// before the first shown card whose middle is below the point.
function dropSlot(x, y) {
  const rails = Object.entries(cardRails).map(([side, rail]) => {
    const r = rail.getBoundingClientRect();
    return { side, rail, distance: Math.abs(x - (r.left + r.width / 2)) };
  }).sort((a, b) => a.distance - b.distance);
  const { rail } = rails[0];
  const before = [...rail.children].find((card) => card.matches('.bb-widget') && card !== cardDrag?.card &&
    cardShown(card) && card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2 > y);
  return { rail, before: before ?? null };
}
const CARD_DRAG_PREVIEW = 220;
function bindGrip(grip) {
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || cardDrag) return;
    event.preventDefault();
    const card = grip.closest('.bb-widget');
    const r = card.getBoundingClientRect();
    // A tall card is carried as a short preview, and its slot is as short.
    const height = Math.min(r.height, CARD_DRAG_PREVIEW);
    const holder = document.createElement('div');
    holder.className = 'bb-widget-holder';
    holder.style.height = `${height}px`;
    card.after(holder);
    document.body.classList.add('widget-dragging');
    card.classList.add('dragging');
    card.classList.toggle('drag-clipped', height < r.height);
    Object.assign(card.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`,
      height: `${height}px`, zIndex: '60', pointerEvents: 'none' });
    cardDrag = { card, holder, dx: event.clientX - r.left, dy: event.clientY - r.top };
    grip.setPointerCapture(event.pointerId);
    placePanels();
  });
  grip.addEventListener('pointermove', (event) => {
    if (!cardDrag) return;
    cardDrag.card.style.left = `${event.clientX - cardDrag.dx}px`;
    cardDrag.card.style.top = `${event.clientY - cardDrag.dy}px`;
    const { rail, before } = dropSlot(event.clientX, event.clientY);
    if (before) rail.insertBefore(cardDrag.holder, before); else rail.appendChild(cardDrag.holder);
  });
  const end = () => {
    if (!cardDrag) return;
    const { card, holder } = cardDrag;
    cardDrag = null;
    holder.replaceWith(card);
    card.classList.remove('dragging', 'drag-clipped');
    for (const key of ['position', 'left', 'top', 'width', 'height', 'zIndex', 'pointerEvents']) card.style[key] = '';
    document.body.classList.remove('widget-dragging');
    saveCardPlace(card);
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  // Up and Down move a card past its shown neighbours; Left and Right move
  // it to the other column, at the same height where it can.
  grip.addEventListener('keydown', (event) => {
    const card = grip.closest('.bb-widget');
    const rail = card.parentElement;
    const shownIn = (r) => [...r.children].filter((c) => c.matches('.bb-widget') && cardShown(c));
    const list = shownIn(rail);
    const index = list.indexOf(card);
    if (event.key === 'ArrowUp' && index > 0) list[index - 1].before(card);
    else if (event.key === 'ArrowDown' && index < list.length - 1) list[index + 1].after(card);
    else if ((event.key === 'ArrowLeft' && rail === cardRails.right) || (event.key === 'ArrowRight' && rail === cardRails.left)) {
      const other = rail === cardRails.left ? cardRails.right : cardRails.left;
      const target = shownIn(other)[index];
      if (target) target.before(card); else other.appendChild(card);
    } else return;
    event.preventDefault();
    grip.focus();
    saveCardPlace(card);
  });
}
for (const grip of document.querySelectorAll('.bb-widget-grip')) bindGrip(grip);

// Resizing a scrolling card by its bottom edge (owner, 2026-11-13): the
// card follows the pointer or finger 1:1, past the smallest and largest
// sizes with growing resistance; a dashed outline shows the size it will
// take; on release it settles on the size nearest where the gesture was
// heading (its speed projected forward), with a critically damped spring
// that starts at the gesture's speed. The sizes are the page's fixed grid,
// the largest the column has room for; double-click (or Delete) fits the
// column again. Arrow keys step through the sizes.
var CARD_SIZES = [240, 360, 480, 600, 720];
var cardResize = null;
var cardSpring = new Map();
function applyCardSizes(sizes) {
  for (const card of document.querySelectorAll('#bbWidgets .bb-widget-sizable')) {
    if (card.dataset.resizing === 'true' || cardSpring.has(card)) continue;
    setCardHeight(card, sizes?.[card.dataset.card] || 0);
  }
}
function setCardHeight(card, px, live = false) {
  const wasSized = card.dataset.size !== undefined;
  if (px) {
    card.dataset.size = live ? 'live' : String(px);
    card.style.setProperty('--card-size', `${px}px`);
  } else {
    delete card.dataset.size;
    card.style.removeProperty('--card-size');
  }
  // Favorites lists all its favorites once it has a size, eight otherwise.
  if (card.id === 'favoritesWidget' && wasSized !== (card.dataset.size !== undefined)) renderLedgerFavorites();
  if (!live) updateResizeAria(card);
}
// The sizes this card can take where it is: those its column has room for
// beside the other cards (at least the smallest).
function cardSteps(card) {
  const rail = card.parentElement;
  const max = parseFloat(getComputedStyle(rail).maxHeight);
  if (!rail?.matches('.bb-rail') || !Number.isFinite(max)) return CARD_SIZES;
  const gap = parseFloat(getComputedStyle(rail).rowGap) || 0;
  const others = [...rail.children].filter((c) => c !== card && c.matches('.bb-widget') && cardShown(c));
  const room = max - others.reduce((sum, c) => sum + c.getBoundingClientRect().height + gap, 0);
  const fits = CARD_SIZES.filter((size) => size <= room);
  return fits.length ? fits : CARD_SIZES.slice(0, 1);
}
const nearestStep = (steps, h) => steps.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a));
function rubberband(value, min, max) {
  const resist = (over) => (over * 200 * 0.55) / (200 + 0.55 * over);
  return value < min ? min - resist(min - value) : value > max ? max + resist(value - max) : value;
}
function updateResizeAria(card) {
  const edge = card.querySelector(':scope > .bb-widget-resize');
  if (!edge) return;
  const size = Number(card.dataset.size) || 0;
  const index = CARD_SIZES.indexOf(size);
  edge.setAttribute('aria-label', t('start.widgets.resize', { name: cardName(card) }));
  edge.setAttribute('aria-valuemin', '0');
  edge.setAttribute('aria-valuemax', String(CARD_SIZES.length));
  edge.setAttribute('aria-valuenow', String(index + 1));
  edge.setAttribute('aria-valuetext', index < 0 ? t('start.widgets.sizeAuto')
    : t('start.widgets.size', { size: index + 1, count: CARD_SIZES.length }));
}
// The outline of the size a resize will settle on.
function snapGuide(card, height) {
  let guide = document.getElementById('cardSnapGuide');
  if (!card) { guide?.remove(); return; }
  if (!guide) {
    guide = document.createElement('div');
    guide.id = 'cardSnapGuide';
    guide.className = 'bb-widget-snap';
    guide.setAttribute('aria-hidden', 'true');
    document.body.append(guide);
  }
  const r = card.getBoundingClientRect();
  Object.assign(guide.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${height}px` });
}
// A critically damped spring (damping 1, response 0.3 s) from the card's
// height now to `target`, starting at `velocity` px/s.
function springCardTo(card, target, velocity, done) {
  cardSpring.get(card)?.cancel();
  const from = card.getBoundingClientRect().height;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(from - target) < 0.5) {
    setCardHeight(card, target); done?.(); return;
  }
  const omega = (2 * Math.PI) / 0.3;
  const x0 = from - target;
  const start = performance.now();
  let frame = 0;
  const step = (now) => {
    const time = (now - start) / 1000;
    const decay = Math.exp(-omega * time);
    const x = (x0 + (velocity + omega * x0) * time) * decay;
    const v = (velocity - omega * (velocity + omega * x0) * time) * decay;
    if (Math.abs(x) < 0.5 && Math.abs(v) < 8) {
      cardSpring.delete(card); setCardHeight(card, target); done?.(); return;
    }
    setCardHeight(card, target + x, true);
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  cardSpring.set(card, { cancel: () => { cancelAnimationFrame(frame); cardSpring.delete(card); } });
}
async function saveCardSize(card, size, announce = true) {
  setCardHeight(card, size);
  if (announce) {
    const index = CARD_SIZES.indexOf(size);
    widgetMoveStatus.textContent = index < 0
      ? t('start.widgets.resizedAuto', { name: cardName(card) })
      : t('start.widgets.resized', { name: cardName(card), size: index + 1, count: CARD_SIZES.length });
  }
  try { applyWidgets(await window.bowserPages.start.setWidgetSize(card.dataset.card, size)); }
  catch { window.blancNewTabEvent('widgets'); }
}
function addResizeEdge(card) {
  if (!card || card.querySelector(':scope > .bb-widget-resize')) return;
  card.classList.add('bb-widget-sizable');
  const edge = document.createElement('div');
  edge.className = 'bb-widget-resize';
  edge.setAttribute('role', 'separator');
  edge.setAttribute('aria-orientation', 'horizontal');
  edge.tabIndex = 0;
  edge.append(document.createElement('span'));
  card.append(edge);
  updateResizeAria(card);
  edge.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || cardDrag || cardResize) return;
    event.preventDefault();
    event.stopPropagation();
    cardSpring.get(card)?.cancel();
    edge.setPointerCapture(event.pointerId);
    const height = card.getBoundingClientRect().height;
    cardResize = { card, edge, startY: event.clientY, startHeight: height, height, steps: cardSteps(card),
      samples: [{ y: event.clientY, t: event.timeStamp }] };
    card.dataset.resizing = 'true';
    document.body.classList.add('widget-resizing');
    snapGuide(card, nearestStep(cardResize.steps, height));
  });
  edge.addEventListener('pointermove', (event) => {
    if (cardResize?.edge !== edge) return;
    const { steps } = cardResize;
    const raw = cardResize.startHeight + (event.clientY - cardResize.startY);
    cardResize.height = rubberband(raw, steps[0], steps[steps.length - 1]);
    setCardHeight(card, cardResize.height, true);
    cardResize.samples.push({ y: event.clientY, t: event.timeStamp });
    while (cardResize.samples.length > 2 && event.timeStamp - cardResize.samples[0].t > 100) cardResize.samples.shift();
    snapGuide(card, nearestStep(steps, cardResize.height));
  });
  const end = (event) => {
    if (cardResize?.edge !== edge) return;
    const { steps, samples, height } = cardResize;
    cardResize = null;
    snapGuide(null);
    document.body.classList.remove('widget-resizing');
    const first = samples[0], last = samples[samples.length - 1];
    // A pointer that rested before letting go carries no speed.
    const rested = event.timeStamp - last.t > 100;
    const velocity = !rested && last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
    // Where the gesture was heading (Apple's projection, deceleration .99).
    const projected = height + (velocity / 1000) * 0.99 / (1 - 0.99);
    const target = event.type === 'pointercancel' ? nearestStep(steps, height) : nearestStep(steps, projected);
    springCardTo(card, target, velocity, () => {
      delete card.dataset.resizing;
      saveCardSize(card, target);
    });
  };
  edge.addEventListener('pointerup', end);
  edge.addEventListener('pointercancel', end);
  edge.addEventListener('dblclick', () => saveCardSize(card, 0));
  edge.addEventListener('keydown', (event) => {
    const steps = cardSteps(card);
    const now = Number(card.dataset.size) || nearestStep(steps, card.getBoundingClientRect().height);
    const at = steps.indexOf(nearestStep(steps, now));
    let next = null;
    if (event.key === 'ArrowUp') next = steps[Math.max(0, at - 1)];
    else if (event.key === 'ArrowDown') next = steps[Math.min(steps.length - 1, at + 1)];
    else if (event.key === 'Home') next = steps[0];
    else if (event.key === 'End') next = steps[steps.length - 1];
    else if (event.key === 'Delete' || event.key === 'Backspace') next = 0;
    else return;
    event.preventDefault();
    if (next === 0) { saveCardSize(card, 0); return; }
    springCardTo(card, next, 0, () => saveCardSize(card, next));
  });
}
addResizeEdge(document.getElementById('remoteSection'));
addResizeEdge(document.getElementById('favoritesWidget'));
new MutationObserver(() => { if (!cardDrag) refreshRails(); placePanels(); }).observe(document.getElementById('bbWidgets'),
  { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });

const widgetButtons = [...document.querySelectorAll('[data-widget-pick]')];
const widgetSaveStatus = document.getElementById('widgetSaveStatus');
let widgetWritePending = false;
for (const button of widgetButtons) {
  button.addEventListener('click', async () => {
    if (widgetWritePending) return;
    const pick = button.dataset.widgetPick;
    widgetWritePending = true;
    widgetSaveStatus.hidden = true;
    for (const item of widgetButtons) item.setAttribute('aria-disabled', 'true');
    try {
      applyWidgets(await window.bowserPages.start.setWidget(pick, state.widgets?.[pick] !== true));
    } catch {
      // A timeout can occur after the write: do not claim it was not saved.
      widgetSaveStatus.textContent = t('start.widgets.unconfirmed');
      widgetSaveStatus.hidden = false;
    } finally {
      widgetWritePending = false;
      for (const item of widgetButtons) item.removeAttribute('aria-disabled');
      // Reconcile the shared setting, including other windows' changes.
      window.blancNewTabEvent('widgets');
    }
  });
}
// Extensions' side panels as cards (prototype). An installed extension
// with a side panel can be turned on in Customize; its card holds a slot and
// Blanc draws the extension's own panel page over the slot (in the
// extension's process, never inside this page). The page says where the
// slot is whenever it moves, and hides the panels while anything covers them:
// a popover, a card being dragged, or another tab.
var installedPanels = [];
var panelSlots = null;
var panelFrame = 0;
function syncPanelCards(enabled) {
  const cards = document.getElementById('bbWidgetCards');
  if (!cards) return;
  panelSlots ??= new ResizeObserver(() => placePanels());
  const names = new Map((installedPanels ?? []).map((panel) => [panel.id, panel.name]));
  for (const card of document.querySelectorAll('.bb-widget[data-panel]')) {
    if (enabled.includes(card.dataset.panel) && names.has(card.dataset.panel)) continue;
    window.bowserPages?.start?.hidePanels?.(card.dataset.panel).catch(() => {});
    card.remove();
  }
  for (const id of enabled) {
    if (!names.has(id) || document.querySelector(`.bb-widget[data-panel="${id}"]`)) continue;
    const card = document.createElement('section');
    card.className = 'ledger-section bb-widget bb-widget-panel';
    card.dataset.card = `ext:${id}`;
    card.dataset.panel = id;
    const grip = document.querySelector('#bbWidgets .bb-widget-grip').cloneNode(true);
    const label = document.createElement('div');
    label.className = 'ledger-label';
    label.textContent = names.get(id);
    const slot = document.createElement('div');
    slot.className = 'bb-panel-slot';
    const note = document.createElement('p');
    note.className = 'start-empty-hint bb-panel-note';
    note.hidden = true;
    note.textContent = t('start.widgets.panelUnavailable');
    slot.append(note);
    card.append(grip, label, slot);
    cards.append(card);
    bindGrip(grip);
    addResizeEdge(card);
    panelSlots.observe(slot);
  }
  for (const tile of document.querySelectorAll('[data-panel-pick]')) {
    tile.setAttribute('aria-checked', String(enabled.includes(tile.dataset.panelPick)));
  }
}
function placePanels() {
  if (panelFrame) return;
  panelFrame = requestAnimationFrame(() => { panelFrame = 0; placePanelsNow(); });
}
async function placePanelsNow() {
  const start = window.bowserPages?.start;
  const cards = [...document.querySelectorAll('.bb-widget[data-panel]')];
  if (!start?.placePanel || !cards.length) return;
  if (document.hidden || cardDrag || document.querySelector(':popover-open')) {
    start.hidePanels('').catch(() => {});
    return;
  }
  for (const card of cards) {
    const slot = card.querySelector('.bb-panel-slot');
    const r = slot.getBoundingClientRect();
    if (!card.closest('.bb-rail') || !cardShown(card) || r.width < 1 || r.height < 1) {
      start.hidePanels(card.dataset.panel).catch(() => {});
      continue;
    }
    const shown = await start.placePanel(card.dataset.panel,
      { x: r.left, y: r.top, width: r.width, height: r.height }).catch(() => false);
    slot.querySelector('.bb-panel-note').hidden = shown === true;
  }
}
// Customize lists each extension that has a side panel as one more tile.
function renderPanelTiles() {
  const group = document.getElementById('widgetSwitches');
  for (const tile of group.querySelectorAll('[data-panel-pick]')) tile.remove();
  const ns = 'http://www.w3.org/2000/svg';
  for (const panel of installedPanels) {
    const tile = widgetButtons[0].cloneNode(true);
    tile.removeAttribute('data-widget-pick');
    tile.dataset.panelPick = panel.id;
    const art = document.createElementNS(ns, 'svg');
    art.setAttribute('class', 'widget-tile-art');
    art.setAttribute('viewBox', '0 0 64 36');
    art.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of [
      ['rect', { x: 12, y: 6, width: 40, height: 24, rx: 3, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }],
      ['path', { d: 'M38 6v24', stroke: 'currentColor', 'stroke-width': 1.6 }],
      ['rect', { x: 41, y: 10, width: 8, height: 3, rx: 1, fill: 'currentColor', opacity: '.55' }],
      ['rect', { x: 41, y: 16, width: 8, height: 3, rx: 1, fill: 'currentColor', opacity: '.55' }],
    ]) {
      const node = document.createElementNS(ns, tag);
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
      art.append(node);
    }
    tile.querySelector('.widget-tile-art').replaceWith(art);
    const name = tile.querySelector('span[data-i18n]');
    name.removeAttribute('data-i18n');
    name.textContent = panel.name;
    tile.setAttribute('aria-checked', String(state.widgets?.panels?.includes(panel.id) === true));
    tile.addEventListener('click', async () => {
      if (widgetWritePending) return;
      widgetWritePending = true;
      widgetSaveStatus.hidden = true;
      try {
        applyWidgets(await window.bowserPages.start.setPanel(panel.id, !state.widgets?.panels?.includes(panel.id)));
      } catch {
        widgetSaveStatus.textContent = t('start.widgets.unconfirmed');
        widgetSaveStatus.hidden = false;
      } finally {
        widgetWritePending = false;
        window.blancNewTabEvent('widgets');
      }
    });
    group.append(tile);
  }
}
async function refreshPanels() {
  try {
    installedPanels = await window.bowserPages?.start?.panels?.() ?? [];
  } catch { return; }
  renderPanelTiles();
  if (state.widgets) applyWidgets(state.widgets);
}
refreshPanels();
document.addEventListener('toggle', (event) => {
  if (event.target?.id === 'customizePopover' && event.newState === 'open') refreshPanels();
  placePanels();
}, true);
document.addEventListener('visibilitychange', placePanels);
window.addEventListener('resize', placePanels);
window.addEventListener('scroll', placePanels, { capture: true, passive: true });

// Shortcuts: 6 or 12 tiles under the clock. Billboard shows only the sites
// it has (pins and the most visited), so with fewer than the count chosen a
// note says how many there are so far; otherwise the choice would seem to
// do nothing.
for (const button of document.querySelectorAll('[data-shortcuts]')) {
  button.setAttribute('aria-label', t('start.shortcuts.count', { count: Number(button.dataset.shortcuts) }));
  button.addEventListener('click', async () => {
    const want = button.dataset.shortcuts === '12';
    if (widgetWritePending || state.widgets?.shortcuts === want) return;
    widgetWritePending = true;
    widgetSaveStatus.hidden = true;
    try {
      applyWidgets(await window.bowserPages.start.setWidget('shortcuts', want));
    } catch {
      widgetSaveStatus.textContent = t('start.widgets.unconfirmed');
      widgetSaveStatus.hidden = false;
    } finally {
      widgetWritePending = false;
      window.blancNewTabEvent('widgets');
    }
  });
}
function updateShortcutsHint() {
  const hint = document.getElementById('shortcutsHint');
  const grid = document.getElementById('bbFavorites');
  if (!hint || !grid) return;
  const count = grid.querySelectorAll('.bb-site').length;
  const fewer = count < billboardSiteCount();
  hint.hidden = !fewer;
  if (fewer) hint.textContent = t('start.shortcuts.sofar', { count });
}
{
  const grid = document.getElementById('bbFavorites');
  if (grid) new MutationObserver(updateShortcutsHint).observe(grid, { childList: true, subtree: true });
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
  sunriseWallpaperPick.setAttribute('aria-pressed', String(!custom && !color && !storeTheme));
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
let launchSunriseDue = false;
function playLaunchSunrise() {
  const scene = document.getElementById('launchSunrise');
  if (!scene || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    scene?.remove();
    return;
  }
  const end = () => {
    removeEventListener('keydown', end, true);
    removeEventListener('pointerdown', end, true);
    scene.remove();
  };
  addEventListener('keydown', end, true);
  addEventListener('pointerdown', end, true);
  scene.addEventListener('animationend', (event) => { if (event.target === scene) end(); });
  scene.hidden = false;
}

function applyStartData(data) {
  launchSunriseDue = data.launchSunrise === true;
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
    layout: 'billboard',
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
  applyWidgets(data.widgets);
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
  requestAnimationFrame(() => {
    document.body.classList.add('layout-ready');
    if (launchSunriseDue) playLaunchSunrise();
    else document.getElementById('launchSunrise')?.remove();
  });
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
  if (!widgetWritePending && status?.widgets) applyWidgets(status.widgets);
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
