(async () => {
  // On the desktop, Favorites is a page in a tab of its own (owner, November
  // 18, 2026). The markup stays a sheet page because Blanc for iPhone
  // restyles that one (ios-pages.css); everywhere else it turns into the
  // full page before it draws.
  if (document.documentElement?.dataset?.platform !== 'ios') {
    document.body?.classList?.replace('sheet', 'fav-page');
  }
  const { t } = blancI18n;
  const list = document.getElementById('list');
  const importStatus = document.getElementById('importStatus');
  const importMenuBtn = document.getElementById('importMenuBtn');
  const importDialog = document.getElementById('importDialog');
  const importForm = document.getElementById('importForm');
  const importDialogNote = document.getElementById('importDialogNote');
  const importCancelBtn = document.getElementById('importCancelBtn');
  const importWhatFavorites = document.getElementById('importWhatFavorites');
  const importWhatTabs = document.getElementById('importWhatTabs');
  const browserSource = document.getElementById('browserSource');
  const browserImportBtn = document.getElementById('browserImportBtn');
  const browserImportGuidance = document.getElementById('browserImportGuidance');

  // iOS edits Favorites but has no import and no Start Page pins; desktop
  // leaves both flags out.
  const capabilities = await window.bowserPages.bookmarks.capabilities();
  const { editable } = capabilities;
  const canImport = editable && capabilities.import !== false;
  const canPin = editable && capabilities.pins !== false;
  document.querySelector('.import-actions').hidden = !canImport;
  document.getElementById('readOnlyNote').hidden = editable;
  const showEditError = (error) => {
    importStatus.textContent = error?.message || t('favorites.editOnComputer');
  };


  // Start Page pins (start-page-pins.js in main): a favorite can be pinned to
  // the front of every Start Page layout from here. Main says how many fit and
  // tells this page when they change elsewhere. Pins are stored in URL's
  // standard form, so a favorite is matched in that form (start-pins.js).
  const startPins = globalThis.blancStartPins;
  let pinnedUrls = [];
  let pinsMax = 0;
  let ownPinChange = false;

  /** Re-read the pins; resolves to whether they changed. */
  async function loadPins() {
    if (!canPin) return false;
    const listed = await window.bowserPages.pins.list().catch(() => null);
    if (!Array.isArray(listed?.pins)) return false;
    const urls = listed.pins.map((pin) => pin.url);
    const changed = urls.join('\n') !== pinnedUrls.join('\n') || listed.max !== pinsMax;
    pinnedUrls = urls;
    pinsMax = listed.max;
    return changed;
  }

  if (canPin) window.bowserPages.pins.onChanged(() => {
    // This page's own pin redraws when its request returns.
    if (ownPinChange) return;
    loadPins().then((changed) => {
      if (changed) refresh();
    }).catch(() => {});
  });

  // The same test the Start Page uses: any http(s) URL, in any letter case.
  const isWebPage = (url) => startPins.siteKey(url) !== null;

  // The Favorites manager (F63, favorites-manager.js) when the host can draw
  // the folder tree; otherwise this page keeps its flat list (the Chromium
  // fork and Android serve this page through bridges without the tree).
  let manager = null;
  const refresh = () => (manager ? manager.refresh() : refreshFlat());

  // "Bring my stuff to Blanc" (owner, November 16, 2026): one dialog, as in
  // Chrome and Edge. Opening it is the explicit ask that lets Blanc look for
  // other browsers (F30, D22); the page never looks on its own. Escape
  // reaches the page itself, so the dialog's own Escape closes it.
  const escapeArm = window.FavoritesEscape ?? { claim() {}, release() {} };
  const FILE_SOURCE = 'file';
  const dialogNote = (text) => { importDialogNote.textContent = text; };
  let lookup = 0;
  let busy = false;

  function closeDialog() {
    if (importDialog.open) importDialog.close();
  }
  importDialog.addEventListener('close', () => {
    lookup += 1; // a lookup still running no longer fills the menu
    escapeArm.release('import');
    importMenuBtn.focus({ preventScroll: true, focusVisible: false });
  });
  // A click on the backdrop closes it, as a click outside a sheet does.
  importDialog.addEventListener('click', (event) => { if (event.target === importDialog) closeDialog(); });
  importCancelBtn.addEventListener('click', closeDialog);

  importMenuBtn.addEventListener('click', () => {
    if (importDialog.open) return;
    importStatus.textContent = '';
    dialogNote('');
    importWhatFavorites.checked = true;
    importWhatTabs.checked = false;
    importDialog.showModal();
    escapeArm.claim('import', closeDialog);
    findBrowsers();
  });

  function updateImportButton() {
    const source = browserSource.value;
    const favorites = importWhatFavorites.checked && Boolean(source);
    browserImportBtn.disabled = busy || (!favorites && !importWhatTabs.checked);
    // Open tabs are found on Bring Your Tabs, whatever From says.
    browserSource.disabled = busy || !importWhatFavorites.checked;
  }
  browserSource.addEventListener('change', updateImportButton);
  importWhatFavorites.addEventListener('change', updateImportButton);
  importWhatTabs.addEventListener('change', updateImportButton);

  // The menu: every profile found, those that need permission (greyed), and
  // a bookmarks file, which is always there.
  function fillSources({ sources = [], unavailable = [] } = {}) {
    browserSource.replaceChildren();
    for (const source of sources) {
      const option = new Option(source.label, source.id);
      option.dataset.i18nIgnore = ''; // a browser profile's name
      browserSource.append(option);
    }
    for (const entry of unavailable) {
      const option = new Option(t('favorites.import.permissionNeeded', { source: entry.label }), '');
      option.disabled = true;
      browserSource.append(option);
    }
    browserSource.append(new Option(t('favorites.import.fileOption'), FILE_SOURCE));
    browserSource.value = sources[0]?.id ?? FILE_SOURCE;
    browserImportGuidance.textContent = [...new Set(unavailable.map((entry) => entry.guidance).filter(Boolean))].join(' ');
    browserImportGuidance.hidden = !unavailable.length;
    return sources.length > 0;
  }

  async function findBrowsers() {
    const mine = ++lookup;
    busy = true;
    browserSource.replaceChildren(new Option(t('favorites.import.looking'), ''));
    browserImportGuidance.hidden = true;
    updateImportButton();
    let failed = false;
    let result = null;
    try {
      result = await window.bowserPages.bookmarks.browserSources();
    } catch {
      // A failed lookup must say so rather than leave an empty menu.
      failed = true;
    }
    if (mine !== lookup) return;
    const found = fillSources(result ?? {});
    dialogNote(failed ? t('favorites.import.checkFailed') : found ? '' : t('favorites.import.noneFound'));
    busy = false;
    updateImportButton();
    const at = document.activeElement;
    if (!at || at === document.body || at === importDialog || at === browserSource) browserSource.focus({ focusVisible: false });
  }

  // This stays inside the existing utility sheet. Main's will-navigate guard
  // permits only allowlisted blanc:// utility pages and updates the sheet's
  // owned URL before this document is replaced.
  const bringTabs = () => { window.location.href = 'blanc://tab-import/'; };

  // One sentence per count: a message holds at most one plural.
  function importSummary({ added, skipped, moved = 0, shortened = 0, orderDropped = 0 }) {
    const sentences = [];
    if (added === 0 && moved === 0 && skipped > 0) {
      sentences.push(t('favorites.import.allSaved', { count: skipped }));
    } else {
      if (added > 0 || moved === 0) sentences.push(t('favorites.import.imported', { count: added }));
      if (moved > 0) sentences.push(t('favorites.import.moved', { count: moved }));
      if (skipped > 0) sentences.push(t('favorites.import.skipped', { count: skipped }));
    }
    if (shortened > 0) sentences.push(t('favorites.import.shortened', { count: shortened }));
    if (orderDropped > 0) sentences.push(t('favorites.import.orderDropped'));
    return sentences.join(' ');
  }

  /** A bookmarks file: Blanc's own file picker. Resolves to whether the
   * favorites arrived (a cancelled picker is not a failure to report). */
  async function importFile() {
    importStatus.textContent = t('favorites.import.choosing');
    let res;
    try {
      res = await window.bowserPages.bookmarks.import();
    } catch (error) {
      showEditError(error);
      return false;
    }
    if (res.cancelled) { importStatus.textContent = ''; return false; }
    if (res.error === 'empty') { importStatus.textContent = t('favorites.import.fileEmpty'); return false; }
    if (res.error === 'unreadable') { importStatus.textContent = t('favorites.import.fileUnreadable'); return false; }
    if (res.error === 'too-large') { importStatus.textContent = t('favorites.import.fileTooLarge'); return false; }
    importStatus.textContent = importSummary(res);
    refresh();
    return true;
  }

  async function importProfile(id) {
    importStatus.textContent = t('favorites.import.importing');
    try {
      const res = await window.bowserPages.bookmarks.importBrowser(id);
      if (res.error === 'source-unavailable') { importStatus.textContent = t('favorites.import.sourceGone'); return false; }
      if (res.error === 'empty') { importStatus.textContent = t('favorites.import.sourceEmpty'); return false; }
      if (res.error === 'too-large') { importStatus.textContent = t('favorites.import.sourceTooLarge'); return false; }
      if (res.error) { importStatus.textContent = t('favorites.import.sourceUnreadable'); return false; }
      importStatus.textContent = t('favorites.import.fromSource', { source: res.source.label, result: importSummary(res) });
      refresh();
      return true;
    } catch (error) {
      showEditError(error);
      return false;
    }
  }

  // Import: the dialog closes and the result is said on the page, under the
  // heading, where the new favorites appear. Open tabs come after the
  // favorites, on Bring Your Tabs, which finds them in the other browser.
  importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (browserImportBtn.disabled) return;
    const source = browserSource.value;
    const favorites = importWhatFavorites.checked && Boolean(source);
    const tabsToo = importWhatTabs.checked;
    closeDialog();
    if (!favorites) { if (tabsToo) bringTabs(); return; }
    busy = true;
    importMenuBtn.disabled = true;
    let ok;
    try {
      ok = source === FILE_SOURCE ? await importFile() : await importProfile(source);
    } finally {
      busy = false;
      importMenuBtn.disabled = false;
      // The button was disabled when the dialog closed, so focus fell to
      // the page; give it back.
      if (!document.activeElement || document.activeElement === document.body) {
        importMenuBtn.focus({ preventScroll: true, focusVisible: false });
      }
    }
    if (ok && tabsToo) bringTabs();
    // Asked for tabs too, but the favorites didn't arrive: say the tabs
    // weren't brought either, rather than leaving that half unanswered.
    else if (tabsToo) {
      importStatus.textContent = [importStatus.textContent, t('favorites.import.tabsSkipped')].filter(Boolean).join(' ');
    }
  });

  const folderKey = (name) => (typeof name === 'string' ? name.trim().toLowerCase() : '');
  const byDateDesc = (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0);

  // The flat list, for hosts without the tree (the fork): folders A–Z, items
  // newest first, ungrouped last. The native menu follows the tree instead
  // (favoritesMenuModel in src/main/bookmark-data.js).
  function group(items) {
    const byKey = new Map();       // key -> { name, items }
    const ungrouped = [];
    for (const b of items) {
      if (b.folder == null) { ungrouped.push(b); continue; }
      const key = folderKey(b.folder);
      if (!byKey.has(key)) byKey.set(key, { name: b.folder, items: [] });
      byKey.get(key).items.push(b);
    }
    const folders = [...byKey.values()].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    for (const f of folders) f.items.sort(byDateDesc);
    ungrouped.sort(byDateDesc);
    return { folders, ungrouped, names: folders.map((f) => f.name) };
  }

  async function refreshFlat() {
    const [items] = await Promise.all([window.bowserPages.bookmarks.list(), loadPins()]);
    closeMenu();
    list.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.setAttribute('role', 'status');
      empty.textContent = t('favorites.empty');
      list.append(empty);
      return;
    }
    const { folders, ungrouped, names } = group(items);
    for (const f of folders) list.append(folderSection(f, names));
    if (ungrouped.length) list.append(ungroupedSection(ungrouped, names));
  }

  function folderSection(folder, allNames) {
    const section = document.createElement('section');
    section.className = 'folder-section';

    const head = document.createElement('div');
    head.className = 'folder-header';
    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = folder.name;
    name.dataset.i18nIgnore = '';
    const count = document.createElement('span');
    count.className = 'folder-count';
    count.textContent = String(folder.items.length);

    const acts = document.createElement('div');
    acts.className = 'folder-actions';
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.textContent = t('favorites.folder.rename');
    // `title` only (no aria-label): the visible text is the accessible name,
    // so voice control's "click rename" resolves; title adds the detail. An
    // aria-label would replace the name with text the label doesn't contain
    // (WCAG 2.5.3 Label in Name).
    renameBtn.title = t('favorites.folder.renameTitle', { folder: folder.name });
    renameBtn.addEventListener('click', () => startRename(head, folder.name));
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = t('favorites.folder.remove');
    removeBtn.title = t('favorites.folder.removeTitle', { folder: folder.name });
    removeBtn.addEventListener('click', async () => {
      try {
        await window.bowserPages.bookmarks.removeFolder(folder.name);
        await refresh();
      } catch (error) { showEditError(error); }
    });
    if (editable) acts.append(renameBtn, removeBtn);
    head.append(name, count, acts);
    section.append(head);
    for (const b of folder.items) section.append(row(b, allNames));
    return section;
  }

  function ungroupedSection(items, allNames) {
    const section = document.createElement('section');
    section.className = 'folder-section';
    if (allNames.length) {
      const head = document.createElement('div');
      head.className = 'folder-header';
      const name = document.createElement('span');
      name.className = 'folder-name folder-name-dim';
      name.textContent = t('favorites.ungrouped');
      head.append(name);
      section.append(head);
    }
    for (const b of items) section.append(row(b, allNames));
    return section;
  }

  function startRename(head, oldName) {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 100;
    input.value = oldName;
    input.className = 'folder-rename-input';
    // One-shot guard shared by Enter/Escape/blur: Escape (and Enter) call
    // refresh(), which detaches the input and fires its own blur handler —
    // without this guard, an Escape-cancel would still commit via that blur.
    let settled = false;
    const commit = async () => {
      if (settled) return;
      settled = true;
      const next = input.value.trim();
      try {
        if (next && next !== oldName) await window.bowserPages.bookmarks.renameFolder(oldName, next);
        await refresh();
      } catch (error) { showEditError(error); }
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      refresh();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
    head.replaceChildren(input);
    input.focus();
    input.select();
  }

  function row(b, allNames) {
    const el = document.createElement('div');
    el.className = 'row';
    el.dataset.url = b.url;
    const pinned = pinnedUrls.includes(startPins.canonicalUrl(b.url));
    el.classList.toggle('start-pinned', pinned);

    const main = document.createElement('div');
    main.className = 'main';
    main.dataset.i18nIgnore = ''; // the page's title and address
    const title = document.createElement('a');
    title.className = 'title';
    title.href = b.url;
    title.textContent = b.title;
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = b.url;
    main.append(title, url);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = new Date(b.addedAt).toLocaleDateString(blancI18n.formatLocale());
    meta.dataset.i18nIgnore = ''; // the locale's own date format
    if (pinned) {
      const mark = document.createElement('span');
      mark.className = 'row-pin-mark';
      mark.setAttribute('role', 'img');
      mark.setAttribute('aria-label', t('favorites.row.pinned'));
      mark.title = t('favorites.row.pinned');
      mark.appendChild(startPins.glyph(document, 'pin'));
      meta.prepend(mark);
    }

    const actions = document.createElement('div');
    actions.className = 'actions bookmark-actions';
    // Quiet ledger actions: the section header already names the folder, so
    // the chip no longer repeats it on every row — "move ▸" is the picker's
    // anchor and says what it does instead of where the row already is.
    const folderBtn = document.createElement('button');
    folderBtn.type = 'button';
    folderBtn.className = 'folder-chip';
    folderBtn.textContent = t('favorites.row.move');
    folderBtn.setAttribute('aria-haspopup', 'dialog');
    folderBtn.setAttribute('aria-expanded', 'false');
    // `title` only — see the folder-header buttons above (WCAG 2.5.3).
    folderBtn.title = b.folder ? t('favorites.row.moveFromFolder', { folder: b.folder }) : t('favorites.row.moveToFolder');
    folderBtn.addEventListener('click', () => openPicker(folderBtn, b, allNames));
    const remove = document.createElement('button');
    remove.className = 'danger';
    remove.textContent = t('favorites.row.remove');
    remove.setAttribute('aria-label', t('favorites.row.removeLabel', { title: b.title }));
    remove.addEventListener('click', async () => {
      try {
        await window.bowserPages.bookmarks.remove(b.id);
        await refresh();
      } catch (error) { showEditError(error); }
    });
    if (editable) actions.append(folderBtn);
    if (canPin && isWebPage(b.url)) {
      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.className = 'pin-toggle';
      pinBtn.textContent = pinned ? t('favorites.row.unpin') : t('favorites.row.pin');
      pinBtn.setAttribute('aria-label', pinned
        ? t('favorites.row.unpinLabel', { title: b.title })
        : t('favorites.row.pinLabel', { title: b.title }));
      // Every pin taken: say so rather than fail on click.
      if (!pinned && pinsMax > 0 && pinnedUrls.length >= pinsMax) {
        pinBtn.disabled = true;
        pinBtn.title = t('favorites.row.pinFull', { count: pinsMax });
      }
      pinBtn.addEventListener('click', async () => {
        ownPinChange = true;
        try {
          if (pinned) await window.bowserPages.pins.unpin(b.url);
          else await window.bowserPages.pins.pin(b.url, b.title);
          await refresh();
        } catch (error) {
          showEditError(error);
        } finally {
          ownPinChange = false;
        }
        // The rebuilt row keeps focus on its pin, now saying the opposite.
        [...list.querySelectorAll('.row')]
          .find((candidate) => candidate.dataset.url === b.url)
          ?.querySelector('.pin-toggle')
          ?.focus();
      });
      actions.append(pinBtn);
    }
    if (editable) actions.append(remove);

    el.append(window.blancRowIcon.rowIcon(document, b.url, b.favicon), main, meta, actions);
    return el;
  }

  let openMenu = null;
  let openAnchor = null;
  function closeMenu() {
    if (!openMenu) return;
    openMenu?.remove();
    openAnchor?.setAttribute('aria-expanded', 'false');
    openMenu = null;
    openAnchor = null;
    escapeArm.release('picker');
  }
  function escapeMenu() {
    if (!openMenu) return;
    const anchor = openAnchor;
    closeMenu();
    anchor?.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openMenu) {
      e.preventDefault();
      escapeMenu();
    }
  });
  document.addEventListener('click', (e) => {
    if (openMenu && !openMenu.contains(e.target) && !e.target.classList.contains('folder-chip')) closeMenu();
  });
  document.querySelector('.page')?.addEventListener('scroll', closeMenu, { passive: true });
  window.addEventListener('scroll', closeMenu, { passive: true });
  window.addEventListener('resize', closeMenu);

  function openPicker(anchor, b, allNames) {
    // Same chip toggles the picker closed; a different chip closes the old one
    // and opens the new one in a single click (not two).
    const sameAnchor = openAnchor === anchor;
    if (openMenu) closeMenu();
    if (sameAnchor) return;
    const menu = document.createElement('div');
    menu.className = 'folder-picker';
    // The top layer escapes row transforms and the sheet's overflow clipping.
    // Dismissal stays explicit so the existing chip-toggle and sheet Escape
    // policies keep working, including switching rows in a single click.
    menu.popover = 'manual';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', t('favorites.picker.label', { title: b.title }));
    const options = document.createElement('div');
    options.className = 'picker-options';
    menu.append(options);
    const pick = async (fn) => {
      try { await fn(); closeMenu(); await refresh(); }
      catch (error) { showEditError(error); }
    };

    for (const nm of allNames) {
      if (folderKey(nm) === folderKey(b.folder)) continue;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'picker-item';
      item.textContent = `→ ${nm}`;
      item.dataset.i18nIgnore = ''; // a folder's name
      item.addEventListener('click', () => pick(() => window.bowserPages.bookmarks.setFolder(b.id, nm)));
      options.append(item);
    }
    if (b.folder) {
      const none = document.createElement('button');
      none.type = 'button';
      none.className = 'picker-item';
      none.textContent = t('favorites.picker.none');
      none.addEventListener('click', () => pick(() => window.bowserPages.bookmarks.setFolder(b.id, null)));
      options.append(none);
    }
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 100;
    nameInput.placeholder = t('favorites.picker.newFolder');
    nameInput.className = 'picker-new';
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = nameInput.value.trim();
        if (v) pick(() => window.bowserPages.bookmarks.setFolder(b.id, v));
      }
    });
    menu.append(nameInput);

    anchor.parentElement.append(menu);
    openMenu = menu;
    openAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    menu.showPopover();

    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    const gap = 4;
    const below = Math.max(0, window.innerHeight - rect.bottom - pad - gap);
    const above = Math.max(0, rect.top - pad - gap);
    const openUp = menu.offsetHeight > below && above > below;
    menu.style.maxHeight = `${Math.min(320, openUp ? above : below)}px`;
    menu.style.left = `${Math.max(pad, Math.min(rect.left, window.innerWidth - menu.offsetWidth - pad))}px`;
    menu.style.top = `${openUp ? rect.top - menu.offsetHeight - gap : rect.bottom + gap}px`;
    escapeArm.claim('picker', escapeMenu);
    // Focusing the new-folder field used to scroll the entire sheet to the
    // end of an unbounded picker. Its footer now stays visible in place.
    nameInput.focus({ preventScroll: true });
  }

  if (capabilities.tree === true && window.FavoritesManager) {
    list.hidden = true;
    document.body.classList.add('fav-manager-page');
    const isPinned = (url) => pinnedUrls.includes(startPins.canonicalUrl(url));
    manager = window.FavoritesManager.mount({
      root: document.getElementById('manager'),
      header: document.getElementById('favTop'),
      status: importStatus,
      t,
      editable,
      canPin,
      isWebPage,
      pins: {
        state: (url) => ({ pinned: isPinned(url), full: pinsMax > 0 && pinnedUrls.length >= pinsMax, max: pinsMax }),
        async toggle(item) {
          ownPinChange = true;
          try {
            if (isPinned(item.url)) await window.bowserPages.pins.unpin(item.url);
            else await window.bowserPages.pins.pin(item.url, item.title);
          } finally {
            ownPinChange = false;
          }
        },
        reload: loadPins,
      },
      rowIcon: (url, favicon) => window.blancRowIcon.rowIcon(document, url, favicon),
      showError: showEditError,
    });
  }
  // A change made anywhere else (the heart, /save, Sync, another window).
  window.bowserPages.bookmarks.onChanged?.(() => { if (manager) manager.refreshFromElsewhere(); else refreshFlat(); });
  refresh();
})();
