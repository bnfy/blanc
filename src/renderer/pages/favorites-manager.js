'use strict';

// The Favorites manager (F63, spec docs/superpowers/specs/2026-11-16-
// favorites-manager-design.md §5): a floating folder sidebar beside the open
// folder, whose sub-folders and favorites sit in two grouped cards in the
// order the person chose. bookmarks.js mounts it when the host says it can
// draw the tree (capabilities.tree); otherwise that page keeps its flat list.
// The rules that need no page live in favorites-manager-model.js.

(function attach(root) {
  const Model = root.FavoritesManagerModel;
  const STORE_OPEN = 'favorites.manager.open';
  const STORE_SELECTED = 'favorites.manager.selected';
  const ERROR_KEYS = {
    'too-long': 'favorites.manager.error.tooLong',
    cycle: 'favorites.manager.error.cycle',
    invalid: 'favorites.manager.error.invalid',
    missing: 'favorites.manager.error.missing',
  };
  // A favorite's edit: its own words, since 'missing' there is a favorite.
  const EDIT_ERROR_KEYS = {
    exists: 'favorites.manager.error.exists',
    'invalid-url': 'favorites.manager.error.invalidUrl',
    missing: 'favorites.manager.error.favoriteMissing',
  };

  // ---------- Escape, shared by every in-sheet surface ----------
  // Main swallows Escape (it closes the sheet) unless the page arms it; then
  // it forwards each press here. Surfaces claim it while they are open, and
  // the newest claim answers first: a menu over a name field over a search.
  const escapeClaims = [];
  const surface = () => root.bowserPages?.surface;
  let escapeWired = false;
  const Escape = {
    claim(name, onEscape) {
      Escape.release(name);
      escapeClaims.push({ name, onEscape });
      if (!escapeWired) {
        escapeWired = true;
        surface()?.onEscape?.(() => escapeClaims.at(-1)?.onEscape());
        // When the key reaches the page itself (no sheet routing), the same
        // claim answers it.
        document.addEventListener('keydown', (event) => {
          if (event.key !== 'Escape' || event.defaultPrevented || !escapeClaims.length) return;
          event.preventDefault();
          escapeClaims.at(-1).onEscape();
        });
      }
      surface()?.armEscape?.(true);
    },
    release(name) {
      const at = escapeClaims.findIndex((claim) => claim.name === name);
      if (at < 0) return;
      escapeClaims.splice(at, 1);
      if (!escapeClaims.length) surface()?.armEscape?.(false);
    },
  };
  root.FavoritesEscape = Escape;

  const remember = (key, value) => {
    try { root.localStorage.setItem(key, JSON.stringify(value)); } catch { /* per-viewer convenience only */ }
  };
  const recall = (key, valid, fallback) => {
    try {
      const raw = root.localStorage.getItem(key);
      const value = raw === null ? fallback : JSON.parse(raw);
      return valid(value) ? value : fallback;
    } catch { return fallback; }
  };
  const reducedMotion = () => root.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const samePath = (a, b) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

  /** The address as a row shows it: https:// and a lone trailing slash add
   * nothing, so they go; any other scheme (http:// included) stays. */
  function shownAddress(url) {
    return String(url).replace(/^https:\/\//i, '').replace(/^([^/?#]+)\/$/, '$1');
  }

  /** Favorites in a folder and everything under it. */
  function countIn(node) {
    let n = 0;
    for (const child of node.children) n += child.kind === 'folder' ? countIn(child.folder) : 1;
    return n;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function mount({ root: host, status, t, editable, canPin, isWebPage, pins, rowIcon, showError }) {
    const api = root.bowserPages.bookmarks;
    // A host without the edit call (an older bridge) offers no Edit.
    const canEdit = editable && typeof api.edit === 'function';

    // ---------- skeleton ----------
    // Edge's layout (owner, November 16, 2026): search at the top of the
    // folder sidebar; the open folder's name as the heading, with New folder
    // beside it; one list of single-line rows.
    const treeNav = el('nav', 'fav-tree');
    treeNav.setAttribute('aria-label', t('favorites.manager.tree'));
    const search = el('input', 'fav-search');
    search.type = 'search';
    search.placeholder = t('favorites.manager.search');
    search.setAttribute('aria-label', t('favorites.manager.search'));
    const treeList = el('div', 'fav-tree-list');
    treeList.setAttribute('role', 'tree');
    treeNav.append(search, treeList);
    const pane = el('section', 'fav-pane');
    const paneHead = el('div', 'fav-pane-head');
    const titleBlock = el('div', 'fav-title-block');
    const crumbs = el('nav', 'fav-crumbs');
    crumbs.setAttribute('aria-label', t('favorites.manager.breadcrumb'));
    const heading = el('h2', 'fav-heading');
    heading.dataset.i18nIgnore = '';
    titleBlock.append(crumbs, heading);
    const folderSelect = el('select', 'fav-folder-select');
    folderSelect.setAttribute('aria-label', t('favorites.manager.chooseFolder'));
    const newFolderBtn = el('button', 'fav-new-folder');
    newFolderBtn.type = 'button';
    newFolderBtn.hidden = !editable;
    const newFolderGlyph = el('span', 'fav-tool-glyph fav-glyph-new-folder');
    newFolderGlyph.setAttribute('aria-hidden', 'true');
    newFolderBtn.append(newFolderGlyph, el('span', '', t('favorites.manager.newFolder')));
    const tools = el('div', 'fav-tools');
    tools.append(newFolderBtn);
    paneHead.append(titleBlock, folderSelect, tools);
    const selectionBar = el('div', 'fav-selection');
    selectionBar.hidden = true;
    const list = el('div', 'fav-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-multiselectable', 'true');
    list.setAttribute('aria-label', t('pagesNav.bookmarks'));
    pane.append(paneHead, selectionBar, list);
    host.replaceChildren(treeNav, pane);
    host.hidden = false;

    // ---------- state ----------
    let tree = { path: null, name: '', key: '', children: [] };
    let current = recall(STORE_SELECTED, (v) => v === null || typeof v === 'string', null);
    const open = new Set(recall(STORE_OPEN, (v) => Array.isArray(v) && v.every((p) => typeof p === 'string'), []));
    let selected = new Set();
    let anchor = null;
    let focusKey = null;
    let wantListFocus = false;
    let naming = null;          // { kind: 'create' | 'rename', key?, path?, name?, draft }
    let editing = null;         // { key, id, title, url, draftTitle, draftUrl, focus, select, saving }
    let confirming = false;     // the selection bar asks before removing several
    let drag = null;

    const say = (text) => { status.textContent = text; };
    const fail = (result) => {
      if (result && result.ok === false) {
        say(t(ERROR_KEYS[result.error] ?? 'favorites.manager.error.invalid'));
        return true;
      }
      return false;
    };
    /** One edit: say its error (or clear an old one), run `onOk` before the
     * redraw (so the open folder can follow a moved folder), then redraw. */
    async function act(call, { onOk } = {}) {
      try {
        const result = await call();
        if (!fail(result)) { say(''); onOk?.(result); }
        await refresh();
        return result;
      } catch (error) {
        showError(error);
        return null;
      }
    }

    const currentNode = () => Model.findFolder(tree, current) ?? tree;
    const visibleChildren = () => currentNode().children;
    const searching = () => search.value.trim() !== '';
    const folderKeysOf = (children) => children.filter((c) => c.kind === 'folder').map((c) => c.key);
    const favoriteKeysOf = (children) => children.filter((c) => c.kind === 'favorite').map((c) => c.key);
    const childByKey = (key) => visibleChildren().find((child) => child.key === key);
    /** Rows as drawn: folders first, then favorites. */
    const drawnKeys = () => [...folderKeysOf(visibleChildren()), ...favoriteKeysOf(visibleChildren())];
    const childrenFor = (keys) => visibleChildren().filter((child) => keys.includes(child.key));

    function setCurrent(path) {
      current = path;
      remember(STORE_SELECTED, current);
      // The open folder and the folders above it show their sub-folders.
      for (const crumb of Model.breadcrumb(tree, path)) open.add(crumb.path.toLowerCase());
      remember(STORE_OPEN, [...open]);
      selected = new Set();
      anchor = null;
      focusKey = null;
      confirming = false;
      endEditing();
    }

    /** A folder renamed or moved: the open folder and the open sidebar
     * branches under it follow it. */
    function follow(from, to) {
      if (current !== null && Model.isWithinPath(current, from)) {
        current = Model.remapPath(current, from, to);
        remember(STORE_SELECTED, current);
      }
      for (const path of [...open]) {
        if (!Model.isWithinPath(path, from)) continue;
        open.delete(path);
        open.add(Model.remapPath(path, from, to).toLowerCase());
      }
      remember(STORE_OPEN, [...open]);
    }

    // ---------- the sidebar ----------
    function treeRow(node, depth) {
      const row = el('div', 'fav-tree-row');
      const isRoot = node.path === null;
      const kids = node.children.filter((child) => child.kind === 'folder');
      const isOpen = isRoot || open.has(node.path.toLowerCase());
      const isCurrent = samePath(current, node.path);
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-level', String(depth + 1));
      row.setAttribute('aria-selected', String(isCurrent));
      if (kids.length && !isRoot) row.setAttribute('aria-expanded', String(isOpen));
      row.tabIndex = isCurrent ? 0 : -1;
      row.dataset.path = node.path ?? '';
      row.style.setProperty('--depth', String(depth));
      row.classList.toggle('current', isCurrent);

      const twisty = el('span', 'fav-twisty');
      twisty.classList.toggle('open', isOpen);
      twisty.classList.toggle('none', isRoot || !kids.length);
      twisty.setAttribute('aria-hidden', 'true');
      twisty.addEventListener('click', (event) => {
        if (isRoot || !kids.length) return;
        event.stopPropagation();
        toggleOpen(node.path);
      });
      const glyph = el('span', isRoot ? 'fav-glyph fav-glyph-heart' : 'fav-glyph fav-glyph-folder');
      glyph.setAttribute('aria-hidden', 'true');
      const name = el('span', 'fav-tree-name', isRoot ? t('favorites.manager.all') : node.name);
      if (!isRoot) name.dataset.i18nIgnore = '';
      row.append(twisty, glyph, name, el('span', 'fav-count', String(countIn(node))));
      row.addEventListener('click', () => {
        search.value = '';
        Escape.release('search');
        setCurrent(node.path);
        render();
        focusTree(node.path);
      });
      if (!isRoot) {
        const folderChild = { kind: 'folder', key: `f:${node.name.toLowerCase()}`, folder: node };
        row.addEventListener('contextmenu', (event) => {
          if (!editable) return;
          event.preventDefault();
          openMenu(row, folderChild, { ownPath: Model.parentOf(node.path), fromTree: true });
        });
        if (editable) {
          row.draggable = true;
          row.addEventListener('dragstart', (event) => startDrag(event, {
            keys: [folderChild.key], ids: [], folders: [node.path], from: Model.parentOf(node.path),
          }));
          row.addEventListener('dragend', endDrag);
        }
      }
      if (editable) acceptTreeDrops(row, node);
      const group = [row];
      if (isOpen) for (const child of kids) group.push(...treeRow(child.folder, depth + 1));
      return group;
    }

    function toggleOpen(path) {
      const key = path.toLowerCase();
      if (open.has(key)) open.delete(key); else open.add(key);
      remember(STORE_OPEN, [...open]);
      renderTree();
    }

    function renderTree() {
      const hadFocus = treeList.contains(document.activeElement) ? document.activeElement.dataset.path : null;
      treeList.replaceChildren(...treeRow(tree, 0));
      if (hadFocus !== null && hadFocus !== undefined) focusTree(hadFocus || null);
    }

    function focusTree(path) {
      [...treeList.children].find((row) => row.dataset.path === (path ?? ''))?.focus({ preventScroll: true, focusVisible: false });
    }

    treeList.addEventListener('keydown', (event) => {
      const rows = [...treeList.children];
      const at = rows.indexOf(document.activeElement);
      if (at < 0) return;
      const row = rows[at];
      const path = row.dataset.path || null;
      const move = (to) => rows[to]?.focus();
      if (event.key === 'ArrowDown') { event.preventDefault(); move(Math.min(rows.length - 1, at + 1)); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move(Math.max(0, at - 1)); }
      else if (event.key === 'Home') { event.preventDefault(); move(0); }
      else if (event.key === 'End') { event.preventDefault(); move(rows.length - 1); }
      else if (event.key === 'ArrowRight' && path && row.getAttribute('aria-expanded') === 'false') { event.preventDefault(); toggleOpen(path); focusTree(path); }
      else if (event.key === 'ArrowLeft' && path) {
        event.preventDefault();
        if (row.getAttribute('aria-expanded') === 'true') { toggleOpen(path); focusTree(path); }
        else focusTree(Model.parentOf(path));
      } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); row.click(); }
      else if ((event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) && path && editable) {
        event.preventDefault();
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      }
    });

    // ---------- the open folder ----------
    function renderHead() {
      const trail = Model.breadcrumb(tree, current);
      const open = trail.at(-1);
      heading.textContent = searching() ? t('favorites.manager.results', { count: Model.searchFavorites(tree, search.value).length })
        : open ? open.name : t('favorites.manager.all');
      // Where the open folder sits, above its name; nothing at the top level.
      const ancestors = open && !searching() ? [{ name: t('favorites.manager.all'), path: null }, ...trail.slice(0, -1)] : [];
      crumbs.replaceChildren();
      crumbs.hidden = ancestors.length === 0;
      ancestors.forEach((crumb, index) => {
        if (index) crumbs.append(el('span', 'fav-crumb-sep', '›'));
        const button = el('button', 'fav-crumb', crumb.name);
        button.type = 'button';
        if (index) button.dataset.i18nIgnore = '';
        button.addEventListener('click', () => { setCurrent(crumb.path); render(); });
        if (editable) acceptIntoDrops(button, crumb.path);
        crumbs.append(button);
      });
      folderSelect.replaceChildren();
      const top = el('option', '', t('favorites.manager.all'));
      top.value = '';
      folderSelect.append(top);
      for (const folder of Model.listFolders(tree)) {
        // The whole path, so two sub-folders with one name stay apart.
        const option = el('option', '', folder.path);
        option.value = folder.path;
        option.dataset.i18nIgnore = '';
        folderSelect.append(option);
      }
      folderSelect.value = currentNode().path ?? '';
    }
    folderSelect.addEventListener('change', () => { setCurrent(folderSelect.value || null); render(); });

    function renderSelectionBar() {
      selectionBar.replaceChildren();
      selectionBar.hidden = !editable || selected.size < 1 || searching();
      if (selectionBar.hidden) { confirming = false; Escape.release('confirm'); return; }
      const keys = [...selected];
      if (confirming && keys.length < 2) { confirming = false; Escape.release('confirm'); }
      if (confirming) {
        selectionBar.classList.add('confirming');
        selectionBar.append(el('span', 'fav-selection-count', t('favorites.manager.removeConfirm', { count: keys.length })));
        const yes = el('button', 'fav-bar-button danger', t('favorites.manager.remove'));
        yes.type = 'button';
        yes.addEventListener('click', () => { confirming = false; Escape.release('confirm'); removeChildren(childrenFor(keys)); });
        const no = el('button', 'fav-bar-button fav-confirm-cancel', t('favorites.manager.cancel'));
        no.type = 'button';
        no.addEventListener('click', cancelConfirm);
        selectionBar.append(yes, no);
        Escape.claim('confirm', cancelConfirm);
        return;
      }
      selectionBar.classList.remove('confirming');
      selectionBar.append(el('span', 'fav-selection-count', t('favorites.manager.selected', { count: keys.length })));
      const moveBtn = el('button', 'fav-bar-button', t('favorites.manager.moveTo'));
      moveBtn.type = 'button';
      moveBtn.addEventListener('click', () => openMoveMenu(moveBtn, childrenFor(keys), current));
      const removeBtn = el('button', 'fav-bar-button danger', t('favorites.manager.remove'));
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', askRemove);
      const clear = el('button', 'fav-bar-button', t('favorites.manager.clearSelection'));
      clear.type = 'button';
      clear.addEventListener('click', () => { selected = new Set(); renderList(); });
      selectionBar.append(moveBtn, removeBtn, clear);
    }
    function askRemove() {
      if (selected.size === 1) { removeChildren(childrenFor([...selected])); return; }
      confirming = true;
      renderSelectionBar();
      // Cancel, not Remove: a held key must not confirm a deletion.
      selectionBar.querySelector('.fav-confirm-cancel')?.focus({ focusVisible: false });
    }
    function cancelConfirm() {
      confirming = false;
      Escape.release('confirm');
      wantListFocus = true;
      renderList();
    }

    function favoriteRow(child, { path } = {}) {
      const { item } = child;
      const row = el('div', 'fav-row');
      row.dataset.key = child.key;
      row.dataset.url = item.url;
      const pin = canPin && isWebPage(item.url) ? pins.state(item.url) : null;
      row.classList.toggle('start-pinned', pin?.pinned === true);

      // Edge's row: name, then the address in a column of its own.
      const main = el('div', 'fav-main');
      main.dataset.i18nIgnore = '';
      const title = el('a', 'title', item.title);
      title.href = item.url;
      title.draggable = false;
      title.tabIndex = -1;
      // The address column; a search result also names its folder there.
      const address = el('span', 'fav-address');
      address.append(el('span', 'url', shownAddress(item.url)));
      main.append(title, address);
      const meta = el('div', 'fav-meta');
      if (path !== undefined) {
        const where = el('button', 'fav-path', path ?? t('favorites.manager.all'));
        where.type = 'button';
        where.tabIndex = -1;
        if (path !== null) where.dataset.i18nIgnore = '';
        where.addEventListener('click', (event) => {
          event.stopPropagation();
          search.value = '';
          Escape.release('search');
          setCurrent(path);
          focusKey = child.key;
          wantListFocus = true;
          render();
        });
        address.append(where);
      }
      if (pin?.pinned) {
        const mark = el('span', 'row-pin-mark');
        mark.setAttribute('role', 'img');
        mark.setAttribute('aria-label', t('favorites.row.pinned'));
        mark.title = t('favorites.row.pinned');
        mark.appendChild(root.blancStartPins.glyph(document, 'pin'));
        meta.prepend(mark);
      }

      const actions = el('div', 'fav-actions');
      if (pin) {
        const pinBtn = el('button', 'pin-toggle fav-row-pin', pin.pinned ? t('favorites.manager.unpin') : t('favorites.manager.pin'));
        pinBtn.type = 'button';
        pinBtn.tabIndex = -1;
        pinBtn.setAttribute('aria-label', pin.pinned
          ? t('favorites.row.unpinLabel', { title: item.title })
          : t('favorites.row.pinLabel', { title: item.title }));
        if (!pin.pinned && pin.full) {
          pinBtn.disabled = true;
          pinBtn.title = t('favorites.row.pinFull', { count: pin.max });
        }
        pinBtn.addEventListener('click', (event) => { event.stopPropagation(); togglePin(child); });
        actions.append(pinBtn);
      }
      const ownPath = path === undefined ? current : path;
      if (editable) actions.append(moreButton(child, ownPath, path !== undefined));
      if (editable) actions.append(removeButton(child, item.title));
      row.append(checkMark(), rowIcon(item.url, item.favicon), main, meta, actions);
      return row;
    }

    /** Pin or unpin a favorite on the Start Page; the keyboard stays on its
     * row’s pin. */
    async function togglePin(child) {
      try { await pins.toggle(child.item); await refresh(); } catch (error) { showError(error); }
      list.querySelector(`[data-key="${CSS.escape(child.key)}"] .pin-toggle`)?.focus();
    }

    function folderRow(child) {
      const node = child.folder;
      const row = el('div', 'fav-row fav-folder-row');
      row.dataset.key = child.key;
      const glyph = el('span', 'fav-row-folder');
      glyph.setAttribute('aria-hidden', 'true');
      const main = el('div', 'fav-main');
      const name = el('button', 'title fav-folder-open', node.name);
      name.type = 'button';
      name.tabIndex = -1;
      name.dataset.i18nIgnore = '';
      name.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.stopPropagation();
        setCurrent(node.path);
        wantListFocus = true;
        render();
      });
      main.append(name, el('span', 'url', t('favorites.manager.items', { count: countIn(node) })));
      const actions = el('div', 'fav-actions');
      if (editable) actions.append(moreButton(child, current, false), removeButton(child, node.name));
      row.append(checkMark(), glyph, main, el('div', 'fav-meta'), actions);
      return row;
    }

    /** The select circle. A pointer target only: the keyboard selects with
     * Space, and the row itself carries aria-selected. */
    function checkMark() {
      const check = el('span', 'fav-check');
      check.setAttribute('aria-hidden', 'true');
      return check;
    }

    /** The × at the end of every row. A folder's × deletes only the folder:
     * what was in it moves up a level. */
    function removeButton(child, title) {
      const button = el('button', 'fav-remove');
      button.type = 'button';
      button.tabIndex = -1;
      button.setAttribute('aria-label', child.kind === 'folder'
        ? t('favorites.manager.deleteFolderLabel', { title })
        : t('favorites.row.removeLabel', { title }));
      button.title = child.kind === 'folder' ? t('favorites.manager.deleteFolder') : t('favorites.manager.remove');
      button.addEventListener('click', (event) => { event.stopPropagation(); removeChildren([child]); });
      return button;
    }

    function moreButton(child, ownPath, inSearch) {
      const button = el('button', 'fav-more');
      button.type = 'button';
      button.tabIndex = -1;
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', t('favorites.manager.more', {
        title: child.kind === 'folder' ? child.folder.name : child.item.title,
      }));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openMenu(button, child, { ownPath, inSearch });
      });
      return button;
    }

    function wireRow(row, child) {
      const { key } = child;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(selected.has(key)));
      row.tabIndex = key === focusKey ? 0 : -1;
      row.classList.toggle('selected', selected.has(key));
      row.addEventListener('click', (event) => {
        const range = event.shiftKey;
        const toggle = event.metaKey || event.ctrlKey || Boolean(event.target.closest('.fav-check'));
        if ((range || toggle) && event.target.closest('a')) event.preventDefault();
        if (!range && !toggle && event.target.closest('a, button')) return;
        const next = Model.selectionAfterClick(drawnKeys(), selected, key, { toggle, range, anchor });
        selected = next.selected;
        anchor = next.anchor;
        focusKey = key;
        wantListFocus = true;
        renderList();
      });
      row.addEventListener('dblclick', (event) => {
        if (child.kind === 'folder' && !event.target.closest('button')) { setCurrent(child.folder.path); render(); }
      });
      row.addEventListener('contextmenu', (event) => {
        if (!editable) return;
        event.preventDefault();
        if (!selected.has(key)) { selected = new Set([key]); anchor = key; focusKey = key; renderList(); }
        const more = list.querySelector(`[data-key="${CSS.escape(key)}"] .fav-more`);
        openMenu(more ?? row, child, { ownPath: current });
      });
      if (editable) {
        row.draggable = true;
        row.addEventListener('dragstart', (event) => {
          if (!selected.has(key)) {
            selected = new Set([key]);
            anchor = key;
            for (const other of list.querySelectorAll('.fav-row.selected')) other.classList.remove('selected');
            row.classList.add('selected');
            // The selection bar waits for the drag to end (endDrag): showing
            // it now would push every row down under the pointer.
          }
          const children = childrenFor([...selected]);
          startDrag(event, {
            keys: children.map((c) => c.key),
            ids: children.filter((c) => c.kind === 'favorite').map((c) => c.item.id),
            folders: children.filter((c) => c.kind === 'folder').map((c) => c.folder.path),
            from: current,
          });
        });
        row.addEventListener('dragend', endDrag);
      }
    }

    list.addEventListener('keydown', (event) => {
      if (event.target.closest('input')) return;
      const rows = [...list.querySelectorAll('.fav-row[role="option"]')];
      // From the row or anything in it (⋯ after its menu, Pin after a pin).
      const at = rows.indexOf(document.activeElement?.closest?.('.fav-row[role="option"]'));
      if (at < 0) return;
      // Space and Enter on a button or link inside the row press it.
      const onControl = document.activeElement !== rows[at];
      if (onControl && (event.key === ' ' || event.key === 'Enter')) return;
      const key = rows[at].dataset.key;
      const go = (to) => {
        const target = rows[Math.max(0, Math.min(rows.length - 1, to))];
        focusKey = target.dataset.key;
        if (event.shiftKey && !searching()) {
          const next = Model.selectionAfterClick(drawnKeys(), selected, focusKey, { range: true, anchor: anchor ?? key });
          selected = next.selected;
          anchor = next.anchor;
          wantListFocus = true;
          renderList();
        } else {
          for (const row of rows) row.tabIndex = -1;
          target.tabIndex = 0;
          target.focus();
        }
      };
      if (event.key === 'ArrowDown') { event.preventDefault(); go(at + 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); go(at - 1); }
      else if (event.key === 'Home') { event.preventDefault(); go(0); }
      else if (event.key === 'End') { event.preventDefault(); go(rows.length - 1); }
      else if (event.key === ' ' && !searching()) {
        event.preventDefault();
        const next = Model.selectionAfterClick(drawnKeys(), selected, key, { toggle: true, anchor });
        selected = next.selected;
        anchor = next.anchor;
        focusKey = key;
        wantListFocus = true;
        renderList();
      } else if (event.key === 'Enter') {
        const child = searching() ? null : childByKey(key);
        if (child?.kind === 'folder') { event.preventDefault(); setCurrent(child.folder.path); wantListFocus = true; render(); }
        else rows[at].querySelector('a.title')?.click();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && editable && !searching()) {
        event.preventDefault();
        if (selected.size > 1 && selected.has(key)) askRemove();
        else removeChildren(childrenFor([key]));
      } else if (event.key === 'F2' && editable && !searching()) {
        // F2 renames, as in a file manager: a folder's name, a favorite's name and address.
        const child = childByKey(key);
        if (child?.kind === 'folder') {
          event.preventDefault();
          startNaming({ kind: 'rename', key: child.key, path: child.folder.path, name: child.folder.name, draft: child.folder.name });
        } else if (child?.kind === 'favorite' && canEdit) {
          event.preventDefault();
          startEditing(child);
        }
      } else if ((event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) && editable) {
        event.preventDefault();
        rows[at].querySelector('.fav-more')?.click();
      }
    });

    function emptyLine(text) {
      // No rows: a plain message, not an empty list box.
      list.removeAttribute('role');
      list.removeAttribute('aria-multiselectable');
      const empty = el('div', 'fav-empty', text);
      empty.setAttribute('role', 'status');
      return empty;
    }

    /** One run of rows (the open folder's folders, or its favorites). Edge
     * draws them as one list, so the label is for assistive tech only. */
    function group(label, kind, rows) {
      const card = el('div', 'fav-group');
      card.setAttribute('role', 'group');
      card.setAttribute('aria-label', label);
      card.append(...rows);
      if (editable && kind && !searching()) acceptListDrops(card, kind);
      return card;
    }

    function renderList() {
      const hadFocus = wantListFocus || list.contains(document.activeElement);
      const focusedIndex = [...list.querySelectorAll('.fav-row[role="option"]')].indexOf(document.activeElement?.closest?.('.fav-row[role="option"]'));
      wantListFocus = false;
      // FLIP: rows that stay slide from where they were.
      const before = new Map([...list.querySelectorAll('.fav-row')].map((row) => [row.dataset.key, row.getBoundingClientRect().top]));
      list.replaceChildren();
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-multiselectable', 'true');
      pane.classList.toggle('searching', searching());
      list.classList.remove('has-selection');

      if (searching()) {
        renderSelectionBar();
        const matches = Model.searchFavorites(tree, search.value);
        if (!matches.length) { list.append(emptyLine(t('favorites.manager.noResults'))); return; }
        const rows = matches.map((match) => {
          if (editing?.key === match.item.key) return editRow();
          const row = favoriteRow({ kind: 'favorite', key: match.item.key, item: match.item }, { path: match.path });
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', 'false');
          row.tabIndex = -1;
          return row;
        });
        const at = Math.max(0, Math.min(rows.length - 1, focusedIndex));
        rows[at].tabIndex = 0;
        list.append(group(t('favorites.manager.results', { count: matches.length }), null, rows));
        if (hadFocus && focusedIndex >= 0 && !editing) rows[at].focus({ preventScroll: false, focusVisible: false });
        return;
      }

      const children = visibleChildren();
      const folders = children.filter((c) => c.kind === 'folder');
      const favorites = children.filter((c) => c.kind === 'favorite');
      const keys = drawnKeys();
      selected = new Set([...selected].filter((key) => keys.includes(key)));
      renderSelectionBar();
      list.classList.toggle('has-selection', selected.size > 0);
      if (focusKey === null || !keys.includes(focusKey)) {
        focusKey = keys[Math.max(0, Math.min(keys.length - 1, focusedIndex))] ?? null;
      }
      const folderRows = [];
      if (naming?.kind === 'create') folderRows.push(nameRow());
      for (const child of folders) {
        if (naming?.kind === 'rename' && naming.key === child.key) { folderRows.push(nameRow()); continue; }
        const row = folderRow(child);
        wireRow(row, child);
        folderRows.push(row);
      }
      const favoriteRows = favorites.map((child) => {
        if (editing?.key === child.key) return editRow();
        const row = favoriteRow(child);
        wireRow(row, child);
        return row;
      });
      if (folderRows.length) list.append(group(t('favorites.manager.tree'), 'folder', folderRows));
      if (favoriteRows.length) list.append(group(t('pagesNav.bookmarks'), 'favorite', favoriteRows));
      if (!folderRows.length && !favoriteRows.length) {
        list.append(emptyLine(tree.children.length ? t('favorites.manager.emptyFolder') : t('favorites.empty')));
      }
      if (hadFocus && !naming && !editing) focusRow(focusKey);
      animateFrom(before);
    }

    function animateFrom(before) {
      if (reducedMotion() || !before.size) return;
      for (const row of list.querySelectorAll('.fav-row')) {
        const was = before.get(row.dataset.key);
        if (was === undefined) continue;
        const delta = was - row.getBoundingClientRect().top;
        if (Math.abs(delta) < 1) continue;
        row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' });
      }
    }

    function focusRow(key) {
      if (key === null) return;
      const row = list.querySelector(`.fav-row[data-key="${CSS.escape(key)}"]`);
      if (!row) return;
      for (const other of list.querySelectorAll('.fav-row[role="option"]')) other.tabIndex = -1;
      row.tabIndex = 0;
      row.focus({ preventScroll: false, focusVisible: false });
    }

    // ---------- naming: a new folder, or a rename ----------
    function nameRow() {
      const row = el('div', 'fav-row fav-name-row');
      const glyph = el('span', 'fav-row-folder');
      glyph.setAttribute('aria-hidden', 'true');
      const input = el('input', 'fav-name-input');
      input.type = 'text';
      input.maxLength = 100;
      input.value = naming.draft;
      input.placeholder = t('favorites.manager.newFolderPlaceholder');
      input.setAttribute('aria-label', naming.kind === 'create' ? t('favorites.manager.newFolderPlaceholder') : t('favorites.manager.rename'));
      input.addEventListener('input', () => { if (naming) naming.draft = input.value; });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); finishNaming(true); }
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finishNaming(false); }
      });
      // A real blur commits. A refresh that replaces the row is not a blur:
      // the field comes back with its text, and nothing is saved.
      input.addEventListener('blur', () => {
        if (!input.isConnected || !naming) return;
        queueMicrotask(() => { if (input.isConnected && document.activeElement !== input) finishNaming(true); });
      });
      row.append(checkMark(), glyph, input);
      queueMicrotask(() => {
        if (!input.isConnected) return;
        input.focus();
        if (naming?.selectOnce) { input.select(); naming.selectOnce = false; }
      });
      return row;
    }

    function startNaming(state) {
      endEditing();
      naming = { draft: '', selectOnce: true, ...state };
      Escape.claim('naming', () => finishNaming(false));
      renderList();
    }

    async function finishNaming(keep) {
      const state = naming;
      if (!state) return;
      naming = null;
      Escape.release('naming');
      const name = state.draft.trim();
      if (!keep || !name || (state.kind === 'rename' && name === state.name)) {
        wantListFocus = true;
        if (state.kind === 'rename') focusKey = state.key;
        renderList();
        return;
      }
      let result;
      if (state.kind === 'create') {
        result = await act(() => api.createFolder(current, name));
        if (result?.ok) { focusKey = `f:${Model.leafOf(result.path).toLowerCase()}`; wantListFocus = true; renderList(); }
      } else {
        const to = Model.joinPath(Model.parentOf(state.path), name);
        result = await act(() => api.renameFolder(state.path, name), { onOk: () => follow(state.path, to) });
        if (result?.ok) {
          focusKey = `f:${name.toLowerCase()}`;
          wantListFocus = true;
          render();
        }
      }
      // Refused (a name in use, too long): the field stays with what was typed.
      if (result && result.ok === false) startNaming({ ...state, selectOnce: true });
    }

    // ---------- editing a favorite: its name and address ----------
    /** The row being edited: the two fields in the row's own columns, then
     * Save and Cancel. Enter saves from either field and Escape cancels. A
     * redraw while it is open (a sync, a pin) keeps what was typed. */
    function editRow() {
      const state = editing;
      const row = el('div', 'fav-row fav-name-row fav-edit-row');
      row.dataset.key = state.key;
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', t('favorites.manager.editLabel', { title: state.title }));
      const fields = el('div', 'fav-main fav-edit-fields');
      const field = (name, value, label) => {
        const input = el('input', 'fav-edit-input');
        input.type = 'text';
        input.value = value;
        input.placeholder = label;
        input.setAttribute('aria-label', label);
        input.dataset.field = name;
        input.dataset.i18nIgnore = '';
        input.spellcheck = name === 'title';
        input.addEventListener('focus', () => { if (editing === state) state.focus = name; });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') { event.preventDefault(); finishEditing(true); }
          else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finishEditing(false); }
        });
        return input;
      };
      const titleInput = field('title', state.draftTitle, t('favorites.manager.editName'));
      titleInput.maxLength = 500;
      titleInput.addEventListener('input', () => { state.draftTitle = titleInput.value; });
      const urlInput = field('url', state.draftUrl, t('favorites.manager.editAddress'));
      urlInput.maxLength = 4096;
      urlInput.inputMode = 'url';
      urlInput.autocapitalize = 'off';
      urlInput.addEventListener('input', () => { state.draftUrl = urlInput.value; });
      fields.append(titleInput, urlInput);

      const actions = el('div', 'fav-actions fav-edit-actions');
      const save = el('button', 'fav-bar-button fav-edit-save', t('favorites.manager.editSave'));
      save.type = 'button';
      save.addEventListener('click', () => finishEditing(true));
      const cancel = el('button', 'fav-bar-button', t('favorites.manager.editCancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', () => finishEditing(false));
      actions.append(save, cancel);

      row.append(checkMark(), rowIcon(state.url, state.favicon), fields, actions);
      queueMicrotask(() => {
        const input = state.focus === 'url' ? urlInput : titleInput;
        if (!input.isConnected || editing !== state) return;
        input.focus();
        if (state.select) { input.select(); state.select = false; }
      });
      return row;
    }

    function startEditing(child) {
      if (naming) { naming = null; Escape.release('naming'); }
      const { item } = child;
      editing = {
        key: child.key, id: item.id, title: item.title, url: item.url, favicon: item.favicon,
        draftTitle: item.title, draftUrl: item.url, focus: 'title', select: true, saving: false,
      };
      Escape.claim('editing', () => finishEditing(false));
      say('');
      renderList();
    }

    /** Close an edit without saving or redrawing (the open folder changed). */
    function endEditing() {
      if (!editing) return;
      editing = null;
      Escape.release('editing');
    }

    async function finishEditing(keep) {
      const state = editing;
      if (!state || state.saving) return;
      if (!keep) {
        endEditing();
        say('');
        focusKey = state.key;
        wantListFocus = true;
        renderList();
        return;
      }
      state.saving = true;
      let result;
      try {
        result = await api.edit(state.id, { title: state.draftTitle, url: state.draftUrl });
      } catch (error) {
        state.saving = false;
        showError(error);
        return;
      }
      state.saving = false;
      if (editing !== state) return;
      if (result?.ok) {
        endEditing();
        say('');
        focusKey = result.key ?? state.key;
        wantListFocus = true;
        await refresh();
        return;
      }
      say(t(EDIT_ERROR_KEYS[result?.error] ?? 'favorites.manager.error.invalid'));
      if (result?.error === 'missing') {
        endEditing();
        await refresh();
        return;
      }
      // Refused ('exists' or 'invalid-url'): the fields stay with what was
      // typed, the address selected.
      state.focus = 'url';
      state.select = true;
      renderList();
    }

    // ---------- drag and drop ----------
    const DRAG_TYPE = 'application/x-blanc-favorites';
    function startDrag(event, payload) {
      drag = payload;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(DRAG_TYPE, '1');
      host.classList.add('dragging');
    }
    function endDrag() {
      drag = null;
      host.classList.remove('dragging');
      clearMarks();
      if (!searching()) {
        renderSelectionBar();
        list.classList.toggle('has-selection', selected.size > 0);
      }
    }
    function clearMarks() {
      for (const node of host.querySelectorAll('.drop-into, .drop-before, .drop-after')) {
        node.classList.remove('drop-into', 'drop-before', 'drop-after');
      }
    }
    function mark(node, kind) {
      clearMarks();
      node.classList.add(`drop-${kind}`);
    }
    const canInto = (path) => drag && Model.canDropInto(path, drag.folders) && !samePath(path, drag.from);

    /** A breadcrumb: drop into that folder. */
    function acceptIntoDrops(target, path) {
      target.addEventListener('dragover', (event) => {
        if (!canInto(path) || searching()) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        mark(target, 'into');
      });
      target.addEventListener('dragleave', (event) => { if (!target.contains(event.relatedTarget)) target.classList.remove('drop-into'); });
      target.addEventListener('drop', async (event) => {
        if (!canInto(path)) return;
        event.preventDefault();
        const moving = drag;
        endDrag();
        await moveInto(moving, path);
      });
    }

    /** A grouped card: reorder within its own kind, or drop into a folder row. */
    function acceptListDrops(card, kind) {
      const place = (event) => {
        const rows = [...card.querySelectorAll('.fav-row[role="option"]')];
        const y = event.clientY;
        const over = rows.find((row) => { const box = row.getBoundingClientRect(); return y >= box.top && y <= box.bottom; });
        if (over && over.classList.contains('fav-folder-row')) {
          const box = over.getBoundingClientRect();
          const f = (y - box.top) / box.height;
          const child = childByKey(over.dataset.key);
          if (f > 0.25 && f < 0.75 && child && canInto(child.folder.path)) return { kind: 'into', row: over, path: child.folder.path };
        }
        // Otherwise the gap nearest the pointer, between rows included.
        const next = rows.find((row) => { const box = row.getBoundingClientRect(); return y < box.top + box.height / 2; });
        return next ? { kind: 'before', row: next, key: next.dataset.key } : { kind: 'after', row: rows.at(-1), key: null };
      };
      const reorderable = () => drag && samePath(drag.from, current)
        && drag.keys.every((key) => childByKey(key)?.kind === kind);
      card.addEventListener('dragover', (event) => {
        if (!drag || searching()) return;
        const where = place(event);
        if (where.kind !== 'into' && !reorderable()) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (where.row) mark(where.row, where.kind);
      });
      card.addEventListener('dragleave', (event) => { if (!card.contains(event.relatedTarget)) clearMarks(); });
      card.addEventListener('drop', async (event) => {
        if (!drag) return;
        const where = place(event);
        if (where.kind !== 'into' && !reorderable()) return;
        event.preventDefault();
        const moving = drag;
        endDrag();
        if (where.kind === 'into') { await moveInto(moving, where.path); return; }
        const children = visibleChildren();
        const ofKind = kind === 'folder' ? folderKeysOf(children) : favoriteKeysOf(children);
        const reordered = Model.orderAfterDrop(ofKind, moving.keys, where.key);
        if (reordered.join('\n') === ofKind.join('\n')) return;
        focusKey = moving.keys[0];
        wantListFocus = true;
        await act(() => api.reorder(current, Model.combineOrder(children, kind, reordered)));
      });
    }

    /** A sidebar folder: into it (middle), or beside it (top or bottom third)
     * when the dragged folders are its siblings. */
    function acceptTreeDrops(row, node) {
      const isRoot = node.path === null;
      const place = (event) => {
        if (isRoot) return 'into';
        const box = row.getBoundingClientRect();
        const f = (event.clientY - box.top) / box.height;
        const siblings = drag && drag.ids.length === 0 && drag.folders.length > 0
          && samePath(drag.from, Model.parentOf(node.path))
          && !drag.folders.some((path) => samePath(path, node.path));
        if (siblings && f < 0.3) return 'before';
        if (siblings && f > 0.7) return 'after';
        return 'into';
      };
      row.addEventListener('dragover', (event) => {
        if (!drag || searching()) return;
        const where = place(event);
        if (where === 'into' && !canInto(node.path)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        mark(row, where);
      });
      row.addEventListener('dragleave', (event) => { if (!row.contains(event.relatedTarget)) row.classList.remove('drop-into', 'drop-before', 'drop-after'); });
      row.addEventListener('drop', async (event) => {
        if (!drag) return;
        const where = place(event);
        if (where === 'into' && !canInto(node.path)) return;
        event.preventDefault();
        const moving = drag;
        endDrag();
        if (where === 'into') { await moveInto(moving, node.path); return; }
        const parentPath = Model.parentOf(node.path);
        const parent = Model.findFolder(tree, parentPath) ?? tree;
        const folderKeys = folderKeysOf(parent.children);
        const targetKey = `f:${node.name.toLowerCase()}`;
        const beforeKey = where === 'before' ? targetKey : folderKeys[folderKeys.indexOf(targetKey) + 1] ?? null;
        const reordered = Model.orderAfterDrop(folderKeys, moving.keys, beforeKey);
        if (reordered.join('\n') !== folderKeys.join('\n')) {
          await act(() => api.reorder(parentPath, Model.combineOrder(parent.children, 'folder', reordered)));
        }
      });
    }

    async function moveInto(moving, path) {
      // One move after another; the first refusal stays on screen.
      const done = (result) => result !== null && result?.ok !== false;
      let ok = true;
      if (moving.ids.length) ok = done(await act(() => api.move(moving.ids, path)));
      for (const folder of moving.folders) {
        if (!ok) break;
        const to = Model.joinPath(path, Model.leafOf(folder));
        ok = done(await act(() => api.moveFolder(folder, path), { onOk: () => follow(folder, to) }));
      }
      selected = new Set();
      wantListFocus = true;
      render();
    }

    // ---------- menus ----------
    let menu = null;
    let menuAnchor = null;
    function closeMenu({ refocus = false } = {}) {
      if (!menu) return;
      const back = menuAnchor;
      menu.remove();
      menu = null;
      menuAnchor = null;
      Escape.release('menu');
      // Focus first: ⋮ is hidden at rest, and only an open menu or focus in
      // its row shows it.
      if (refocus) back?.focus?.({ preventScroll: true });
      if (back?.classList.contains('fav-more')) back.setAttribute('aria-expanded', 'false');
    }
    document.addEventListener('pointerdown', (event) => {
      if (!menu || menu.contains(event.target)) return;
      if (menuAnchor && menuAnchor.contains(event.target)) return; // its own button toggles it
      closeMenu();
    }, true);
    document.querySelector('.page')?.addEventListener('scroll', () => closeMenu(), { passive: true });
    root.addEventListener('resize', () => closeMenu());

    function showMenu(anchorEl, label, items) {
      closeMenu();
      menu = el('div', 'fav-menu');
      menu.popover = 'manual';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', label);
      for (const item of items) {
        if (item === 'sep') {
          const sep = el('div', 'fav-menu-sep');
          sep.setAttribute('role', 'separator');
          menu.append(sep);
          continue;
        }
        const button = el('button', item.danger ? 'fav-menu-item danger' : 'fav-menu-item', item.label);
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        if (item.indent) button.style.setProperty('--indent', String(item.indent));
        if (item.ignore) button.dataset.i18nIgnore = '';
        if (item.disabled) button.disabled = true;
        button.addEventListener('click', () => { closeMenu(); item.run(); });
        menu.append(button);
      }
      menu.addEventListener('keydown', (event) => {
        const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
        const at = buttons.indexOf(document.activeElement);
        if (event.key === 'ArrowDown') { event.preventDefault(); buttons[(at + 1) % buttons.length]?.focus(); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); buttons[(at - 1 + buttons.length) % buttons.length]?.focus(); }
        else if (event.key === 'Home') { event.preventDefault(); buttons[0]?.focus(); }
        else if (event.key === 'End') { event.preventDefault(); buttons.at(-1)?.focus(); }
        else if (event.key === 'Tab') closeMenu({ refocus: true });
      });
      document.body.append(menu);
      menuAnchor = anchorEl;
      if (anchorEl.classList.contains('fav-more')) anchorEl.setAttribute('aria-expanded', 'true');
      menu.showPopover();
      const box = anchorEl.getBoundingClientRect();
      const pad = 8;
      const below = root.innerHeight - box.bottom - pad;
      const up = menu.offsetHeight > below && box.top > below;
      const left = Math.max(pad, Math.min(box.right - menu.offsetWidth, root.innerWidth - menu.offsetWidth - pad));
      menu.style.setProperty('--menu-max', `${Math.max(120, (up ? box.top : below) - pad)}px`);
      menu.style.left = `${left}px`;
      menu.style.top = `${up ? Math.max(pad, box.top - menu.offsetHeight - 4) : box.bottom + 4}px`;
      // It grows from its button.
      menu.style.transformOrigin = `${Math.round(box.left + box.width / 2 - left)}px ${up ? '100%' : '0'}`;
      Escape.claim('menu', () => closeMenu({ refocus: true }));
      menu.querySelector('button:not(:disabled)')?.focus({ focusVisible: false });
    }

    /** The menu for one row. `ownPath` is the folder the row sits in (a search
     * result's own folder, a sidebar folder's parent). */
    function openMenu(anchorEl, child, { ownPath = current, fromTree = false, inSearch = false } = {}) {
      if (menu && menuAnchor === anchorEl) { closeMenu({ refocus: true }); return; }
      const many = !fromTree && !inSearch && selected.has(child.key) && selected.size > 1;
      if (many) {
        const keys = [...selected];
        showMenu(anchorEl, t('favorites.manager.selected', { count: keys.length }), [
          { label: t('favorites.manager.moveTo'), run: () => openMoveMenu(anchorEl, childrenFor(keys), current) },
          { label: t('favorites.manager.remove'), danger: true, run: askRemove },
        ]);
        return;
      }
      const parent = fromTree ? (Model.findFolder(tree, ownPath) ?? tree) : currentNode();
      const keys = parent.children.filter((c) => c.kind === child.kind).map((c) => c.key);
      const at = keys.indexOf(child.key);
      const canStep = !inSearch && at >= 0;
      const step = (direction) => {
        focusKey = child.key;
        wantListFocus = !fromTree;
        return act(() => api.reorder(ownPath, Model.combineOrder(parent.children, child.kind, Model.orderAfterStep(keys, child.key, direction))));
      };
      const title = child.kind === 'folder' ? child.folder.name : child.item.title;
      const items = [];
      if (child.kind === 'folder') {
        items.push({ label: t('favorites.manager.open'), run: () => { setCurrent(child.folder.path); render(); } });
        items.push({ label: t('favorites.manager.rename'), run: () => {
          if (!samePath(current, ownPath)) { setCurrent(ownPath); render(); }
          startNaming({ kind: 'rename', key: child.key, path: child.folder.path, name: child.folder.name, draft: child.folder.name });
        } });
        items.push({ label: t('favorites.manager.newFolderInside'), run: () => {
          setCurrent(child.folder.path);
          render();
          startNaming({ kind: 'create' });
        } });
      }
      if (child.kind === 'favorite' && canEdit) {
        items.push({ label: t('favorites.manager.edit'), run: () => startEditing(child) });
      }
      // Pin is in the menu too, for the keyboard: the row’s own Pin shows on hover.
      const pin = child.kind === 'favorite' && canPin && isWebPage(child.item.url) ? pins.state(child.item.url) : null;
      if (pin) {
        items.push({
          label: pin.pinned ? t('favorites.manager.unpin') : t('favorites.manager.pin'),
          disabled: !pin.pinned && pin.full,
          run: () => togglePin(child),
        });
      }
      items.push({ label: t('favorites.manager.moveTo'), run: () => openMoveMenu(anchorEl, [child], ownPath) });
      if (canStep) {
        items.push({ label: t('favorites.manager.moveUp'), disabled: at === 0, run: () => step(-1) });
        items.push({ label: t('favorites.manager.moveDown'), disabled: at === keys.length - 1, run: () => step(1) });
      }
      items.push('sep');
      items.push(child.kind === 'folder'
        ? { label: t('favorites.manager.deleteFolder'), danger: true, run: () => removeChildren([child]) }
        : { label: t('favorites.manager.remove'), danger: true, run: () => removeChildren([child]) });
      showMenu(anchorEl, t('favorites.manager.more', { title }), items);
    }

    function openMoveMenu(anchorEl, children, from) {
      const moving = {
        keys: children.map((c) => c.key),
        ids: children.filter((c) => c.kind === 'favorite').map((c) => c.item.id),
        folders: children.filter((c) => c.kind === 'folder').map((c) => c.folder.path),
        from,
      };
      const items = [{ label: t('favorites.manager.topLevel'), disabled: samePath(null, from), run: () => moveInto(moving, null) }];
      for (const folder of Model.listFolders(tree)) {
        items.push({
          label: folder.name,
          indent: folder.depth + 1,
          ignore: true,
          disabled: samePath(folder.path, from) || !Model.canDropInto(folder.path, moving.folders),
          run: () => moveInto(moving, folder.path),
        });
      }
      showMenu(anchorEl, t('favorites.manager.moveTo'), items);
    }

    /** Remove favorites (by id, wherever they sit) and folders (by path). */
    async function removeChildren(children) {
      const ids = children.filter((c) => c.kind === 'favorite').map((c) => c.item.id);
      const order = drawnKeys();
      const positions = children.map((c) => order.indexOf(c.key)).filter((i) => i >= 0);
      let last = ids.length ? await act(() => api.removeMany(ids)) : { ok: true };
      for (const folder of children.filter((c) => c.kind === 'folder')) {
        if (!last || last.ok === false) break; // keep the first failure on screen
        last = await act(() => api.removeFolder(folder.folder.path));
      }
      selected = new Set();
      // The row that took the first removed row's place keeps the focus.
      const after = drawnKeys();
      focusKey = positions.length ? after[Math.min(Math.min(...positions), after.length - 1)] ?? null : focusKey;
      wantListFocus = !searching();
      renderList();
    }

    // ---------- head tools ----------
    newFolderBtn.addEventListener('click', () => {
      if (searching()) { search.value = ''; Escape.release('search'); renderHead(); }
      startNaming({ kind: 'create' });
    });
    search.addEventListener('input', () => {
      selected = new Set();
      if (searching()) Escape.claim('search', clearSearch); else Escape.release('search');
      renderHead();
      renderList();
    });
    function clearSearch() {
      search.value = '';
      Escape.release('search');
      renderHead();
      renderList();
      search.focus();
    }

    function render() {
      closeMenu();
      if (Model.findFolder(tree, current) === null) { current = null; remember(STORE_SELECTED, null); }
      renderTree();
      renderHead();
      renderList();
    }

    async function refresh() {
      try {
        const [next] = await Promise.all([api.tree(), pins.reload()]);
        tree = next;
      } catch (error) {
        showError(error);
        return;
      }
      const exists = new Set(Model.listFolders(tree).map((folder) => folder.path.toLowerCase()));
      const kept = [...open].filter((path) => exists.has(path));
      if (kept.length !== open.size) {
        for (const path of [...open]) if (!exists.has(path)) open.delete(path);
        remember(STORE_OPEN, kept);
      }
      render();
    }

    return { refresh };
  }

  root.FavoritesManager = { mount };
})(globalThis);
