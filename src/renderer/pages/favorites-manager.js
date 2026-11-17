'use strict';

// The Favorites manager (F63, spec docs/superpowers/specs/2026-11-16-
// favorites-manager-design.md §5): the folder tree on the left, the open
// folder's folders and favorites on the right, in the order the person
// chose. bookmarks.js mounts it when the host says it can draw the tree
// (capabilities.tree); otherwise that page keeps its flat list. The rules
// that need no page live in favorites-manager-model.js.

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

  const remember = (key, value) => {
    try { root.localStorage.setItem(key, JSON.stringify(value)); } catch { /* per-viewer convenience only */ }
  };
  const recall = (key, fallback) => {
    try {
      const raw = root.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  };
  const reducedMotion = () => root.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

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

  function mount({ root: host, toolbar, status, t, editable, canPin, isWebPage, pins, rowIcon, showError }) {
    const api = root.bowserPages.bookmarks;
    const search = toolbar.querySelector('.fav-search');
    const newFolderBtn = toolbar.querySelector('.fav-new-folder');
    toolbar.hidden = false;
    newFolderBtn.hidden = !editable;

    const treeNav = el('nav', 'fav-tree');
    treeNav.setAttribute('aria-label', t('favorites.manager.tree'));
    const treeList = el('div', 'fav-tree-list');
    treeList.setAttribute('role', 'tree');
    treeNav.append(treeList);
    const pane = el('section', 'fav-pane');
    const paneHead = el('div', 'fav-pane-head');
    const crumbs = el('nav', 'fav-crumbs');
    crumbs.setAttribute('aria-label', t('favorites.manager.breadcrumb'));
    const folderSelect = el('select', 'fav-folder-select');
    folderSelect.setAttribute('aria-label', t('favorites.manager.chooseFolder'));
    const selectionBar = el('div', 'fav-selection');
    selectionBar.hidden = true;
    paneHead.append(crumbs, folderSelect, selectionBar);
    const list = el('div', 'row-list fav-list');
    list.setAttribute('role', 'list');
    pane.append(paneHead, list);
    host.replaceChildren(treeNav, pane);
    host.hidden = false;

    let tree = { path: null, name: '', key: '', children: [] };
    let current = recall(STORE_SELECTED, null);
    const open = new Set(recall(STORE_OPEN, []));
    let selected = new Set();
    let anchor = null;
    let focusKey = null;
    let creating = false;
    let renaming = null;
    let drag = null;

    const say = (text) => { status.textContent = text; };
    const fail = (result) => {
      if (result && result.ok === false) {
        say(t(ERROR_KEYS[result.error] ?? 'favorites.manager.error.invalid'));
        return true;
      }
      return false;
    };
    async function act(call) {
      try {
        const result = await call();
        if (!fail(result)) say('');
        await refresh();
        return result;
      } catch (error) {
        showError(error);
        return null;
      }
    }

    const currentNode = () => Model.findFolder(tree, current) ?? tree;
    const visibleChildren = () => currentNode().children;
    const orderKeys = () => visibleChildren().map((child) => child.key);
    const childByKey = (key) => visibleChildren().find((child) => child.key === key);
    const searching = () => search.value.trim() !== '';

    function setCurrent(path) {
      current = path;
      remember(STORE_SELECTED, current);
      for (const crumb of Model.breadcrumb(tree, path).slice(0, -1)) open.add(crumb.path.toLowerCase());
      remember(STORE_OPEN, [...open]);
      selected = new Set();
      anchor = null;
      focusKey = null;
    }

    // ---------- the tree ----------
    function treeRow(node, depth) {
      const row = el('div', 'fav-tree-row');
      const isRoot = node.path === null;
      const kids = node.children.filter((child) => child.kind === 'folder');
      const isOpen = isRoot || open.has(node.path.toLowerCase());
      const isCurrent = (current ?? '').toLowerCase() === (node.path ?? '').toLowerCase();
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
      twisty.hidden = isRoot || !kids.length;
      twisty.setAttribute('aria-hidden', 'true');
      twisty.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleOpen(node.path);
      });
      const glyph = el('span', isRoot ? 'fav-glyph fav-glyph-heart' : 'fav-glyph fav-glyph-folder');
      glyph.setAttribute('aria-hidden', 'true');
      const name = el('span', 'fav-tree-name', isRoot ? t('favorites.manager.all') : node.name);
      if (!isRoot) name.dataset.i18nIgnore = '';
      const count = el('span', 'fav-count', String(countIn(node)));
      row.append(twisty, glyph, name, count);
      row.addEventListener('click', () => { search.value = ''; setCurrent(node.path); render(); focusTree(node.path); });
      row.addEventListener('contextmenu', (event) => {
        if (isRoot || !editable) return;
        event.preventDefault();
        openMenu(row, { kind: 'folder', key: `f:${node.name.toLowerCase()}`, folder: node }, { fromTree: true });
      });
      if (editable) acceptDrops(row, () => node.path);
      if (editable && !isRoot) {
        row.draggable = true;
        row.addEventListener('dragstart', (event) => startDrag(event, { folders: [node.path], ids: [], keys: [] }));
        row.addEventListener('dragend', endDrag);
      }
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
      treeList.replaceChildren(...treeRow(tree, 0));
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
      const move = (to) => { rows[to]?.focus(); };
      if (event.key === 'ArrowDown') { event.preventDefault(); move(Math.min(rows.length - 1, at + 1)); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move(Math.max(0, at - 1)); }
      else if (event.key === 'ArrowRight' && path && row.getAttribute('aria-expanded') === 'false') { event.preventDefault(); toggleOpen(path); focusTree(path); }
      else if (event.key === 'ArrowLeft' && path) {
        event.preventDefault();
        if (row.getAttribute('aria-expanded') === 'true') { toggleOpen(path); focusTree(path); }
        else focusTree(Model.parentOf(path));
      } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); row.click(); }
    });

    // ---------- the folder's contents ----------
    function renderCrumbs() {
      const items = [{ name: t('favorites.manager.all'), path: null }, ...Model.breadcrumb(tree, current)];
      crumbs.replaceChildren();
      items.forEach((crumb, index) => {
        if (index) crumbs.append(el('span', 'fav-crumb-sep', '›'));
        const last = index === items.length - 1;
        const button = el('button', 'fav-crumb', crumb.name);
        button.type = 'button';
        if (index) button.dataset.i18nIgnore = '';
        if (last) button.setAttribute('aria-current', 'location');
        button.addEventListener('click', () => { setCurrent(crumb.path); render(); });
        if (editable) acceptDrops(button, () => crumb.path);
        crumbs.append(button);
      });
      folderSelect.replaceChildren();
      const top = el('option', '', t('favorites.manager.all'));
      top.value = '';
      folderSelect.append(top);
      for (const folder of Model.listFolders(tree)) {
        const option = el('option', '', `${' '.repeat(folder.depth)}${folder.name}`);
        option.value = folder.path;
        option.dataset.i18nIgnore = '';
        folderSelect.append(option);
      }
      folderSelect.value = currentNode().path ?? '';
    }
    folderSelect.addEventListener('change', () => { setCurrent(folderSelect.value || null); render(); });

    function renderSelectionBar() {
      selectionBar.replaceChildren();
      selectionBar.hidden = !editable || selected.size < 2 || searching();
      if (selectionBar.hidden) return;
      selectionBar.append(el('span', 'fav-selection-count', t('favorites.manager.selected', { count: selected.size })));
      const moveBtn = el('button', '', t('favorites.manager.moveTo'));
      moveBtn.type = 'button';
      moveBtn.addEventListener('click', () => openMoveMenu(moveBtn, [...selected]));
      const removeBtn = el('button', 'danger', t('favorites.manager.remove'));
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', () => removeKeys([...selected]));
      const clear = el('button', '', t('favorites.manager.clearSelection'));
      clear.type = 'button';
      clear.addEventListener('click', () => { selected = new Set(); renderList(); });
      selectionBar.append(moveBtn, removeBtn, clear);
    }

    function favoriteRow(item, { path = undefined } = {}) {
      const row = el('div', 'row fav-row');
      row.dataset.key = item.key;
      row.dataset.url = item.url;
      row.setAttribute('role', 'listitem');
      const pin = canPin && isWebPage(item.url) ? pins.state(item.url) : null;
      row.classList.toggle('start-pinned', pin?.pinned === true);

      const main = el('div', 'main');
      main.dataset.i18nIgnore = '';
      const title = el('a', 'title', item.title);
      title.href = item.url;
      title.draggable = false;
      main.append(title, el('div', 'url', item.url));
      const meta = el('div', 'meta');
      if (path === undefined && Number.isFinite(item.addedAt)) {
        // The day it was saved, in the locale's own date format.
        meta.textContent = new Date(item.addedAt).toLocaleDateString(root.blancI18n.formatLocale());
        meta.dataset.i18nIgnore = '';
      }
      if (path !== undefined) {
        const where = el('button', 'fav-path', path ?? t('favorites.manager.all'));
        where.type = 'button';
        if (path !== null) where.dataset.i18nIgnore = '';
        where.addEventListener('click', (event) => {
          event.stopPropagation();
          search.value = '';
          setCurrent(path);
          focusKey = item.key;
          render();
        });
        meta.append(where);
      }
      if (pin?.pinned) {
        const mark = el('span', 'row-pin-mark');
        mark.setAttribute('role', 'img');
        mark.setAttribute('aria-label', t('favorites.row.pinned'));
        mark.title = t('favorites.row.pinned');
        mark.appendChild(root.blancStartPins.glyph(document, 'pin'));
        meta.prepend(mark);
      }

      const actions = el('div', 'actions fav-actions');
      if (pin) {
        const pinBtn = el('button', 'pin-toggle fav-pin', pin.pinned ? t('favorites.row.unpin') : t('favorites.row.pin'));
        pinBtn.type = 'button';
        pinBtn.setAttribute('aria-label', pin.pinned
          ? t('favorites.row.unpinLabel', { title: item.title })
          : t('favorites.row.pinLabel', { title: item.title }));
        if (!pin.pinned && pin.full) {
          pinBtn.disabled = true;
          pinBtn.title = t('favorites.row.pinFull', { count: pin.max });
        }
        pinBtn.addEventListener('click', async (event) => {
          event.stopPropagation();
          try { await pins.toggle(item); await refresh(); } catch (error) { showError(error); }
          list.querySelector(`[data-key="${CSS.escape(item.key)}"] .fav-pin`)?.focus();
        });
        actions.append(pinBtn);
      }
      if (editable) actions.append(moreButton(row, { kind: 'favorite', key: item.key, item }));
      row.append(rowIcon(item.url, item.favicon), main, meta, actions);
      return row;
    }

    function folderRow(child) {
      const node = child.folder;
      const row = el('div', 'row fav-row fav-folder-row');
      row.dataset.key = child.key;
      row.setAttribute('role', 'listitem');
      const glyph = el('span', 'fav-row-folder');
      glyph.setAttribute('aria-hidden', 'true');
      const main = el('div', 'main');
      const name = el('button', 'title fav-folder-open', node.name);
      name.type = 'button';
      name.dataset.i18nIgnore = '';
      name.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.stopPropagation();
        setCurrent(node.path);
        render();
      });
      main.append(name);
      const meta = el('div', 'meta', t('favorites.manager.items', { count: countIn(node) }));
      const actions = el('div', 'actions fav-actions');
      if (editable) actions.append(moreButton(row, child));
      row.append(glyph, main, meta, actions);
      if (editable) acceptDrops(row, () => node.path, { reorder: true });
      return row;
    }

    function moreButton(row, child) {
      const button = el('button', 'fav-more');
      button.type = 'button';
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', t('favorites.manager.more', {
        title: child.kind === 'folder' ? child.folder.name : child.item.title,
      }));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openMenu(button, child);
      });
      return button;
    }

    function wireRow(row, key) {
      row.tabIndex = key === focusKey ? 0 : -1;
      row.classList.toggle('selected', selected.has(key));
      row.addEventListener('click', (event) => {
        const range = event.shiftKey;
        const toggle = event.metaKey || event.ctrlKey;
        if ((range || toggle) && event.target.closest('a')) event.preventDefault();
        if (!range && !toggle && event.target.closest('a, button')) return;
        const next = Model.selectionAfterClick(orderKeys(), selected, key, { toggle, range, anchor });
        selected = next.selected;
        anchor = next.anchor;
        focusKey = key;
        renderList();
      });
      row.addEventListener('dblclick', (event) => {
        const child = childByKey(key);
        if (child?.kind === 'folder' && !event.target.closest('button')) { setCurrent(child.folder.path); render(); }
      });
      row.addEventListener('contextmenu', (event) => {
        const child = childByKey(key);
        if (!editable || !child) return;
        event.preventDefault();
        if (!selected.has(key)) { selected = new Set([key]); anchor = key; renderList(); }
        openMenu(list.querySelector(`[data-key="${CSS.escape(key)}"] .fav-more`) ?? row, childByKey(key));
      });
      if (editable) {
        row.draggable = true;
        row.addEventListener('dragstart', (event) => {
          if (!selected.has(key)) { selected = new Set([key]); anchor = key; row.classList.add('selected'); }
          const children = visibleChildren().filter((child) => selected.has(child.key));
          startDrag(event, {
            keys: children.map((child) => child.key),
            ids: children.filter((child) => child.kind === 'favorite').map((child) => child.item.id),
            folders: children.filter((child) => child.kind === 'folder').map((child) => child.folder.path),
          });
        });
        row.addEventListener('dragend', endDrag);
      }
    }

    list.addEventListener('keydown', (event) => {
      const rows = [...list.querySelectorAll('.fav-row')];
      const at = rows.indexOf(document.activeElement);
      if (at < 0 || searching()) return;
      const key = rows[at].dataset.key;
      const go = (to) => {
        const target = rows[Math.max(0, Math.min(rows.length - 1, to))];
        focusKey = target.dataset.key;
        if (event.shiftKey) {
          const next = Model.selectionAfterClick(orderKeys(), selected, focusKey, { range: true, anchor: anchor ?? key });
          selected = next.selected;
          anchor = next.anchor;
          renderList();
        } else {
          for (const row of rows) row.tabIndex = -1;
          target.tabIndex = 0;
          target.focus();
        }
      };
      if (event.key === 'ArrowDown') { event.preventDefault(); go(at + 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); go(at - 1); }
      else if (event.key === ' ') {
        event.preventDefault();
        const next = Model.selectionAfterClick(orderKeys(), selected, key, { toggle: true, anchor });
        selected = next.selected;
        anchor = next.anchor;
        focusKey = key;
        renderList();
      } else if (event.key === 'Enter') {
        const child = childByKey(key);
        if (child?.kind === 'folder') { event.preventDefault(); setCurrent(child.folder.path); render(); }
        else if (child) rows[at].querySelector('a.title')?.click();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && editable) {
        event.preventDefault();
        removeKeys(selected.size ? [...selected] : [key]);
      } else if ((event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) && editable) {
        event.preventDefault();
        rows[at].querySelector('.fav-more')?.click();
      }
    });

    function emptyState(text) {
      const empty = el('div', 'empty', text);
      empty.setAttribute('role', 'status');
      return empty;
    }

    function renderList() {
      // FLIP: rows that stay slide from where they were.
      const before = new Map([...list.querySelectorAll('.fav-row')].map((row) => [row.dataset.key, row.getBoundingClientRect().top]));
      list.replaceChildren();
      renderSelectionBar();
      pane.classList.toggle('searching', searching());
      if (searching()) {
        list.classList.add('searching');
        const matches = Model.searchFavorites(tree, search.value);
        if (!matches.length) { list.append(emptyState(t('favorites.manager.noResults'))); return; }
        for (const match of matches) list.append(favoriteRow(match.item, { path: match.path }));
        return;
      }
      list.classList.remove('searching');
      if (creating) list.append(nameRow({
        placeholder: t('favorites.manager.newFolderPlaceholder'),
        commit: async (name) => {
          creating = false;
          const result = await act(() => api.createFolder(current, name));
          if (result?.ok) { focusKey = `f:${result.path.split(Model.SEP).pop().toLowerCase()}`; renderList(); focusRow(focusKey); }
        },
        cancel: () => { creating = false; renderList(); },
      }));
      const children = visibleChildren();
      if (!children.length && !creating) {
        list.append(emptyState(tree.children.length ? t('favorites.manager.emptyFolder') : t('favorites.empty')));
        return;
      }
      if (focusKey === null || !children.some((child) => child.key === focusKey)) focusKey = children[0]?.key ?? null;
      for (const child of children) {
        if (renaming === child.key) {
          list.append(nameRow({
            value: child.folder.name,
            commit: async (name) => {
              renaming = null;
              if (name !== child.folder.name) await act(() => api.renameFolder(child.folder.path, name));
              else renderList();
              focusRow(child.key);
            },
            cancel: () => { renaming = null; renderList(); focusRow(child.key); },
          }));
          continue;
        }
        const row = child.kind === 'folder' ? folderRow(child) : favoriteRow(child.item);
        if (child.kind === 'favorite' && editable) acceptDrops(row, () => current, { reorder: true });
        wireRow(row, child.key);
        list.append(row);
      }
      if (editable) acceptDrops(list, () => current, { reorder: true, end: true });
      if (!reducedMotion() && before.size) {
        for (const row of list.querySelectorAll('.fav-row')) {
          const was = before.get(row.dataset.key);
          if (was === undefined) continue;
          const delta = was - row.getBoundingClientRect().top;
          if (Math.abs(delta) < 1) continue;
          row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
        }
      }
    }

    function focusRow(key) {
      list.querySelector(`.fav-row[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: false });
    }

    /** An inline name field: a new folder, or a rename. */
    function nameRow({ value = '', placeholder = '', commit, cancel }) {
      const row = el('div', 'row fav-row fav-name-row');
      const glyph = el('span', 'fav-row-folder');
      glyph.setAttribute('aria-hidden', 'true');
      const input = el('input', 'fav-name-input');
      input.type = 'text';
      input.maxLength = 100;
      input.value = value;
      input.placeholder = placeholder;
      input.setAttribute('aria-label', placeholder || t('favorites.manager.rename'));
      let settled = false;
      const finish = (keep) => {
        if (settled) return;
        settled = true;
        const name = input.value.trim();
        if (keep && name) commit(name); else cancel();
      };
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); finish(true); }
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
      row.append(glyph, input);
      queueMicrotask(() => { input.focus(); input.select(); });
      return row;
    }

    // ---------- drag and drop ----------
    const DRAG_TYPE = 'application/x-blanc-favorites';
    function startDrag(event, payload) {
      drag = { ...payload, from: current };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(DRAG_TYPE, '1');
      host.classList.add('dragging');
    }
    function endDrag() {
      drag = null;
      host.classList.remove('dragging');
      clearMarks();
    }
    function clearMarks() {
      for (const node of host.querySelectorAll('.drop-into, .drop-before, .drop-after')) {
        node.classList.remove('drop-into', 'drop-before', 'drop-after');
      }
    }

    /** Where a drop on `target` lands: into a folder, or before/after a row. */
    function dropPlace(target, event, { reorder }) {
      const folderPath = target.__dropPath();
      const isFolderRow = target.classList.contains('fav-folder-row') || target.classList.contains('fav-tree-row')
        || target.classList.contains('fav-crumb');
      if (!reorder || target === list) {
        if (target === list) return { kind: 'end' };
        return { kind: 'into', path: folderPath };
      }
      const rect = target.getBoundingClientRect();
      const y = (event.clientY - rect.top) / rect.height;
      if (isFolderRow && y > 0.25 && y < 0.75) return { kind: 'into', path: folderPath };
      return { kind: y < 0.5 ? 'before' : 'after', key: target.dataset.key };
    }

    function acceptDrops(target, pathOf, { reorder = false, end = false } = {}) {
      target.__dropPath = pathOf;
      target.addEventListener('dragover', (event) => {
        if (!drag || searching()) return;
        if (end && event.target !== list) return;
        const place = dropPlace(target, event, { reorder });
        if (place.kind === 'into' && !Model.canDropInto(place.path, drag.folders)) return;
        if (place.kind === 'into' && (place.path ?? '').toLowerCase() === (drag.from ?? '').toLowerCase()) return;
        if (place.kind !== 'into' && (drag.from ?? '').toLowerCase() !== (current ?? '').toLowerCase()) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        clearMarks();
        if (place.kind === 'into') target.classList.add('drop-into');
        else if (place.kind === 'before') target.classList.add('drop-before');
        else if (place.kind === 'after') target.classList.add('drop-after');
      });
      target.addEventListener('dragleave', (event) => {
        if (!target.contains(event.relatedTarget)) target.classList.remove('drop-into', 'drop-before', 'drop-after');
      });
      target.addEventListener('drop', async (event) => {
        if (!drag) return;
        if (end && event.target !== list) return;
        event.preventDefault();
        event.stopPropagation();
        const place = dropPlace(target, event, { reorder });
        const moving = drag;
        endDrag();
        if (place.kind === 'into') await moveInto(moving, place.path);
        else {
          const keys = orderKeys();
          let beforeKey = null;
          if (place.kind === 'before') beforeKey = place.key;
          else if (place.kind === 'after') beforeKey = keys[keys.indexOf(place.key) + 1] ?? null;
          const order = Model.orderAfterDrop(keys, moving.keys, beforeKey);
          if (order.join('\n') !== keys.join('\n')) await act(() => api.reorder(current, order));
        }
      });
    }

    async function moveInto(moving, path) {
      let last = null;
      if (moving.ids.length) last = await act(() => api.move(moving.ids, path));
      for (const folder of moving.folders) {
        if (last && last.ok === false) break;
        last = await act(() => api.moveFolder(folder, path));
      }
      selected = new Set();
      renderList();
    }

    // ---------- menus ----------
    let menu = null;
    let menuAnchor = null;
    const surface = root.bowserPages?.surface;
    function closeMenu() {
      if (!menu) return;
      menu.remove();
      menuAnchor?.setAttribute('aria-expanded', 'false');
      menu = null;
      menuAnchor = null;
      surface?.armEscape?.(false);
    }
    surface?.onEscape?.(() => { const back = menuAnchor; closeMenu(); back?.focus?.({ preventScroll: true }); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu) { event.preventDefault(); const back = menuAnchor; closeMenu(); back?.focus?.(); }
    });
    document.addEventListener('pointerdown', (event) => { if (menu && !menu.contains(event.target)) closeMenu(); }, true);
    document.querySelector('.page')?.addEventListener('scroll', closeMenu, { passive: true });
    root.addEventListener('resize', closeMenu);

    function showMenu(anchorEl, label, items) {
      closeMenu();
      menu = el('div', 'fav-menu');
      menu.popover = 'manual';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', label);
      for (const item of items) {
        if (item === 'sep') { menu.append(el('div', 'fav-menu-sep')); continue; }
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
      });
      document.body.append(menu);
      menuAnchor = anchorEl;
      anchorEl.setAttribute('aria-expanded', 'true');
      menu.showPopover();
      const rect = anchorEl.getBoundingClientRect();
      const pad = 8;
      const below = root.innerHeight - rect.bottom - pad;
      const up = menu.offsetHeight > below && rect.top > below;
      menu.style.setProperty('--menu-max', `${Math.max(120, (up ? rect.top : below) - pad)}px`);
      menu.style.left = `${Math.max(pad, Math.min(rect.right - menu.offsetWidth, root.innerWidth - menu.offsetWidth - pad))}px`;
      menu.style.top = `${up ? rect.top - menu.offsetHeight - 4 : rect.bottom + 4}px`;
      surface?.armEscape?.(true);
      // A click opens the menu without a focus box; the keyboard still reaches it.
      menu.querySelector('button:not(:disabled)')?.focus({ focusVisible: false });
    }

    function openMenu(anchorEl, child, { fromTree = false } = {}) {
      const keys = !fromTree && selected.has(child.key) && selected.size > 1 ? [...selected] : null;
      if (keys) {
        showMenu(anchorEl, t('favorites.manager.selected', { count: keys.length }), [
          { label: t('favorites.manager.moveTo'), run: () => openMoveMenu(anchorEl, keys) },
          { label: t('favorites.manager.remove'), danger: true, run: () => removeKeys(keys) },
        ]);
        return;
      }
      const order = orderKeys();
      const at = order.indexOf(child.key);
      const step = (direction) => act(() => api.reorder(current, Model.orderAfterStep(order, child.key, direction)));
      const canStep = !fromTree && !searching() && at >= 0;
      const title = child.kind === 'folder' ? child.folder.name : child.item.title;
      const items = [];
      if (child.kind === 'folder') {
        items.push({ label: t('favorites.manager.open'), run: () => { setCurrent(child.folder.path); render(); } });
        items.push({ label: t('favorites.manager.rename'), run: () => {
          if (fromTree) { setCurrent(Model.parentOf(child.folder.path)); render(); }
          renaming = child.key.startsWith('f:') ? child.key : `f:${child.folder.name.toLowerCase()}`;
          renderList();
        } });
        items.push({ label: t('favorites.manager.newFolderInside'), run: () => { setCurrent(child.folder.path); creating = true; render(); } });
      }
      items.push({ label: t('favorites.manager.moveTo'), run: () => openMoveMenu(anchorEl, [child.key], child) });
      if (canStep) {
        items.push({ label: t('favorites.manager.moveUp'), disabled: at === 0, run: () => step(-1) });
        items.push({ label: t('favorites.manager.moveDown'), disabled: at === order.length - 1, run: () => step(1) });
      }
      items.push('sep');
      items.push(child.kind === 'folder'
        ? { label: t('favorites.manager.deleteFolder'), danger: true, run: () => act(() => api.removeFolder(child.folder.path)) }
        : { label: t('favorites.manager.remove'), danger: true, run: () => removeKeys([child.key]) });
      showMenu(anchorEl, t('favorites.manager.more', { title }), items);
    }

    function openMoveMenu(anchorEl, keys, single = null) {
      const children = single ? [single] : visibleChildren().filter((child) => keys.includes(child.key));
      const moving = {
        keys,
        ids: children.filter((child) => child.kind === 'favorite').map((child) => child.item.id),
        folders: children.filter((child) => child.kind === 'folder').map((child) => child.folder.path),
      };
      const from = single?.kind === 'folder' ? Model.parentOf(single.folder.path) : current;
      const here = (path) => (path ?? '').toLowerCase() === (from ?? '').toLowerCase();
      const items = [{ label: t('favorites.manager.topLevel'), disabled: here(null), run: () => moveInto(moving, null) }];
      for (const folder of Model.listFolders(tree)) {
        items.push({
          label: folder.name,
          indent: folder.depth + 1,
          ignore: true,
          disabled: here(folder.path) || !Model.canDropInto(folder.path, moving.folders),
          run: () => moveInto(moving, folder.path),
        });
      }
      showMenu(anchorEl, t('favorites.manager.moveTo'), items);
    }

    async function removeKeys(keys) {
      const children = visibleChildren().filter((child) => keys.includes(child.key));
      const ids = children.filter((child) => child.kind === 'favorite').map((child) => child.item.id);
      if (ids.length) await act(() => api.removeMany(ids));
      for (const folder of children.filter((child) => child.kind === 'folder')) await act(() => api.removeFolder(folder.folder.path));
      selected = new Set();
      renderList();
    }

    // ---------- toolbar ----------
    newFolderBtn.addEventListener('click', () => {
      search.value = '';
      creating = true;
      renderList();
    });
    search.addEventListener('input', () => { selected = new Set(); renderList(); });
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && search.value) { event.preventDefault(); event.stopPropagation(); search.value = ''; renderList(); }
    });

    function render() {
      closeMenu();
      if (Model.findFolder(tree, current) === null) current = null;
      renderTree();
      renderCrumbs();
      renderList();
    }

    async function refresh() {
      const [next] = await Promise.all([api.tree(), pins.reload()]);
      tree = next;
      render();
    }

    return { refresh };
  }

  root.FavoritesManager = { mount };
})(globalThis);
