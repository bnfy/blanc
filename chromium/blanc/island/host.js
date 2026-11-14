'use strict';
(() => {
  let nextId = 0;
  let snapshot = null;
  let syncedClosed = [];
  let tabSelection = BlancTabSelection.emptySelection();
  let selectionRevision = 0;
  const selectionTabs = () => snapshot?.tabs ?? [];
  function clearSelection(broadcast = true) {
    ++selectionRevision;
    tabSelection = BlancTabSelection.emptySelection();
    if (snapshot) {
      snapshot.selectedTabIds = [];
      snapshot.contextMenuSelection = false;
      if (broadcast) emit('onTabsUpdated', snapshot);
    }
  }
  function retainSelection(ids, anchor = null) {
    ++selectionRevision;
    tabSelection = BlancTabSelection.selectionState(ids, anchor, selectionTabs());
    snapshot.selectedTabIds = [...tabSelection.selectedTabIds];
    snapshot.contextMenuSelection = !!tabSelection.contextMenu;
    emit('onTabsUpdated', snapshot);
  }
  let serialized = '';
  let pillRect = null;
  let opened = false;
  let miniSearchOpened = false;
  let overlayMode = null;
  let overlayDragging = false;
  let overlayClosing = null;
  // When the open surface appeared, and whether its native context menu is up.
  let overlayShownAt = 0;
  let overlayMenuOpen = false;
  // What the open surface was shown for (shipping's overlayPurpose).
  let overlayPurpose = null;
  // The side list's group menu names its group as it closes, so that
  // header forgets its open state (shipping's "group-menu:<id>" trigger).
  const groupMenuClosed = () => overlayMode === 'group-menu' && typeof overlayPurpose?.groupId === 'string'
    ? `group-menu:${overlayPurpose.groupId}` : null;
  let shieldTrigger = null;
  let pendingShieldOpen = null;
  let findTabId = null;
  let findShowEpoch = 0;
  let pendingFindShow = null;
  let refreshQueue = Promise.resolve();
  let extensionsOpened = false;
  let geometry = "";
  // Rail hover previews (set up with the rail hooks below; null until then).
  let railHover = null;
  let blockerRecoveryShown = false;
  let layout = localStorage.getItem('blanc.prototype.tabLayout') === 'vertical' ? 'vertical' : 'island';
  let railWidth = Math.max(200, Math.min(360, Number(localStorage.getItem('blanc.prototype.railWidth')) || 248));
  // Recently closed's place (shipping's closedSlot, closed-slot.js): directly
  // under Pinned until it is moved; then above an item (a group or loose tab),
  // or last (''). It keeps its place when that item goes, as
  // reconcileClosedSlot does, and its index outlives a relaunch, whose tabs and
  // groups get new ids (shipping saves closedIndex in session.json).
  let closedBefore = localStorage.getItem('blanc.prototype.closedBefore');
  let closedIndex = Math.max(0, Number(localStorage.getItem('blanc.prototype.closedIndex')) || 0);
  let closedBelow = null;
  function closedSlotFor(ids) {
    if (closedBefore === null) return 0;
    if (closedBefore === '') return ids.length;
    let slot = ids.indexOf(closedBefore);
    if (slot < 0 && closedBelow) {
      const next = closedBelow.find(id => ids.includes(id));
      slot = next ? ids.indexOf(next) : ids.length;
    }
    if (slot < 0) {
      // A new launch: the saved index, once that many items have come back.
      if (ids.length <= closedIndex) return ids.length;
      slot = closedIndex;
    }
    closedBefore = slot < ids.length ? ids[slot] : '';
    closedBelow = ids.slice(slot);
    if (slot !== closedIndex || localStorage.getItem('blanc.prototype.closedBefore') !== closedBefore) {
      closedIndex = slot;
      localStorage.setItem('blanc.prototype.closedBefore', closedBefore);
      localStorage.setItem('blanc.prototype.closedIndex', String(slot));
    }
    return slot;
  }
  const effectiveRailWidth = () => layout === 'vertical' ? (snapshot?.verticalTabsWidth ?? railWidth) : 0;
  async function applyRail(persist = false) {
    railWidth = await request('rail', [layout === 'vertical', Math.round(railWidth)]);
    strip.style.height = layout === 'vertical' ? '100%' : 'var(--strip-h, 68px)';
    if (persist) {
      localStorage.setItem('blanc.prototype.tabLayout', layout);
      localStorage.setItem('blanc.prototype.railWidth', String(railWidth));
    }
    await refresh();
    emit('onVerticalTabsWidth', snapshot);
    return railWidth;
  }
  const pending = new Map();
  const subscribers = new Map();
  const overlayShowDocuments = new WeakMap();
  const strip = document.getElementById('strip');
  const floatPill = document.getElementById('floatPill');
  const glanceCardFrame = document.getElementById('glanceCardFrame');
  const overlay = document.getElementById('overlay');
  const tooltip = document.createElement('div');
  tooltip.id = 'prototypeTooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);

  const snapshotTimeoutMarker = Symbol('snapshot timeout');
  let snapshotRefreshAttempt = 0;
  let lastNotice = null;
  function notice(message, snapshotTimeoutAttempt = null) {
    lastNotice = { message, snapshotTimeoutAttempt };
    const status = document.getElementById('status');
    status.textContent = message;
    status.hidden = false;
    console.warn(message);
  }

  function pruneOverlayShowSubscribers() {
    const current = overlay.contentDocument;
    const listeners = subscribers.get('onOverlayShow');
    for (const callback of listeners ?? []) {
      if (!current || overlayShowDocuments.get(callback) !== current) listeners.delete(callback);
    }
    return listeners;
  }

  function subscribe(event, callback, ownerDocument = overlay.contentDocument) {
    if (!subscribers.has(event)) subscribers.set(event, new Set());
    if (event === 'onOverlayShow') {
      if (!ownerDocument || ownerDocument !== overlay.contentDocument) return () => {};
      pruneOverlayShowSubscribers();
      overlayShowDocuments.set(callback, ownerDocument);
    }
    subscribers.get(event).add(callback);
    // The renderer can subscribe after a Find request was opened. Deliver the
    // pending handoff once its handler has finished registering.
    if (event === 'onOverlayShow' && pendingFindShow) {
      const epoch = pendingFindShow.epoch;
      queueMicrotask(() => deliverFindShow(epoch));
    }
    if (event === 'onDownloadsActivity') queueMicrotask(() => {
      if (snapshot?.downloadsActivity && subscribers.get(event)?.has(callback)) callback(snapshot.downloadsActivity);
    });
    if (event === 'onPermissionPrompt') queueMicrotask(() => {
      for (const payload of prompts.values())
        if (subscribers.get(event)?.has(callback)) callback(payload);
    });
    if (event === 'onGlanceLayout') queueMicrotask(() => {
      if (subscribers.get(event)?.has(callback)) callback(glancePayload());
    });
    if (event === 'onSplitLayout') queueMicrotask(() => {
      if (subscribers.get(event)?.has(callback)) callback(currentSplitLayout());
    });
    // The floating pill's document can load after its frame was placed.
    if (event === 'onFloatFrame' || event === 'onFloatShown') queueMicrotask(() => {
      if (!subscribers.get(event)?.has(callback)) return;
      if (event === 'onFloatFrame' && floatView.frame) callback(floatView.frame);
      if (event === 'onFloatShown' && floatView.shown) callback(true);
    });
    return () => subscribers.get(event)?.delete(callback);
  }

  function emit(event, value) {
    if (event === 'onOverlayShow') pruneOverlayShowSubscribers();
    for (const callback of subscribers.get(event) ?? []) {
      try { callback(value); } catch (error) { notice(error.message); }
    }
  }

  function typed(method, args) {
    if (!window.BlancBrowserApi) return Promise.reject(new Error('The typed Island interface is unavailable.'));
    return window.BlancBrowserApi.invoke(method, args);
  }

  function request(method, args = []) {
    return new Promise((resolve, reject) => {
      const id = String(++nextId);
      const timeout = ['extensionContextMenu', 'closeSplit', 'closeTab', 'spaceOpenNewWindow', 'importArcRead'].includes(method) ? null : setTimeout(() => {
        pending.delete(id);
        const error = new Error(`Native bridge timed out: ${method}`);
        if (method === 'snapshot') error[snapshotTimeoutMarker] = true;
        reject(error);
      }, 10000);
      pending.set(id, { resolve, reject, timeout, method });
      chrome.send('blancPrototype', [id, method, args]);
    });
  }

  window.blancPrototypeReply = (id, success, value) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timeout);
    (success ? entry.resolve : entry.reject)(success ? value : new Error(value));
  };

  // Island size (#1292): shipping's island-size.js, the strip's height and
  // the pill's zoom at each size; styles.css draws the same table.
  const ISLAND_SIZES = { default: { strip: 68, zoom: 1.15 }, large: { strip: 76, zoom: 1.3 },
    'extra-large': { strip: 84, zoom: 1.45 } };
  const islandSize = () => ISLAND_SIZES[snapshot?.islandSize] || ISLAND_SIZES.default;
  const stripH = () => islandSize().strip;
  // A length drawn inside the zoomed pill, at this size (scaleForIslandSize).
  const scaleForSize = px => Math.ceil(px * islandSize().zoom / ISLAND_SIZES.default.zoom);
  // The Dock icon (F17) follows the setting, and the appearance for the
  // icons with a Dark image, as shipping reapplies it.
  const darkScheme = matchMedia('(prefers-color-scheme: dark)');
  let dockIconKey = '';
  function syncDockIcon() {
    const key = snapshot?.appIcon ? `${snapshot.appIcon}:${darkScheme.matches}` : '';
    if (!key || key === dockIconKey) return;
    dockIconKey = key;
    request('applyAppIcon', [snapshot.appIcon, darkScheme.matches]).catch(() => {});
  }
  darkScheme.addEventListener('change', syncDockIcon);
  function paintHeader() {
    syncDockIcon();
    const active = snapshot?.tabs.find(tab => tab.id === snapshot.activeTabId);
    const theme = active?.private ? null : snapshot?.installedTheme;
    for (const doc of [document, strip.contentDocument, floatPill.contentDocument, overlay.contentDocument])
      window.BlancInstalledTheme.apply(doc, theme);
    const color = active?.private ? '#0a0a0a'
      : theme?.frame ? theme.frame
      : /^#[0-9a-f]{6}$/i.test(active?.pageBg) ? active.pageBg : '';
    document.documentElement.style.setProperty('--page-bg', color);
    document.documentElement.style.setProperty('--strip-h', `${stripH()}px`);
    // The settings sheet's card follows Surface style (S1.7).
    document.getElementById('settingsSheet')?.setAttribute('data-surface',
      snapshot?.surfaceStyle === 'neutral' ? 'neutral' : 'sunrise');
    paintBackdrop();
  }

  // The Island's band continues the Start Page's wallpaper (owner,
  // 2026-11-13). The page sends each layer's computed background (newtab-
  // adapter.js); native adds the band and vertical rail it gave the page.
  // The same layers are laid out here from the window's corner over the
  // page's size plus that band and rail, so the band shows the slice above
  // the page. Only Blanc's own page images and your photo are drawn; the
  // photo is read from the Start Page's storage (this origin's) by its key.
  const backdrops = new Map();
  const bandBackdrop = document.createElement('div');
  bandBackdrop.id = 'bandBackdrop';
  bandBackdrop.hidden = true;
  document.getElementById('headerBackdrop')?.append(bandBackdrop);
  const bandLayers = [0, 1, 2, 3].map(() => bandBackdrop.appendChild(document.createElement('div')));
  const PHOTO = /^blanc-wallpaper:([0-9a-f-]{36})$/;
  const PAGE_IMAGE = /^chrome:\/\/blanc-prototype\/pages\/[\w.-]+$/;
  let photo = { key: null, url: null, loading: null };
  function loadPhoto(key) {
    if (photo.loading === key) return;
    photo.loading = key;
    new Promise((resolve, reject) => {
      const open = indexedDB.open('blanc.prototype.wallpaper.v1', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('images');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const get = db.transaction('images', 'readonly').objectStore('images').get(key);
          get.onsuccess = () => { db.close(); resolve(get.result); };
          get.onerror = () => { db.close(); reject(get.error); };
        } catch (error) { db.close(); reject(error); }
      };
    }).then((blob) => {
      if (photo.loading !== key) return;
      const previous = photo.url;
      // A missing photo is remembered as such, so painting doesn't re-read it.
      photo = { key, url: blob instanceof Blob && blob.type === 'image/jpeg' ? URL.createObjectURL(blob) : null, loading: null };
      if (previous) setTimeout(() => URL.revokeObjectURL(previous), 5000);
      paintBackdrop();
    }, () => { if (photo.loading === key) photo = { key, url: null, loading: null }; });
  }
  // A layer's background-image as this document may draw it, or 'none'.
  function backdropImage(image) {
    if (typeof image !== 'string' || image.length > 4096 || image.includes('\\')) return 'none';
    let key = null;
    for (const [, raw] of image.matchAll(/url\(([^)]*)\)/g)) {
      const href = /^"([^"]*)"$/.exec(raw)?.[1];
      if (href == null) return 'none';
      const match = PHOTO.exec(href);
      if (match) key = match[1];
      else if (!PAGE_IMAGE.test(href)) return 'none';
    }
    if (!key) return image;
    if (photo.key !== key) { loadPhoto(key); return 'none'; }
    return photo.url ? image.replaceAll(`blanc-wallpaper:${key}`, photo.url) : 'none';
  }
  function pageBackdrop(nativeTabId, spec) {
    const id = String(nativeTabId);
    if (spec && typeof spec === 'object' && Array.isArray(spec.layers)) backdrops.set(id, spec);
    else backdrops.delete(id);
    if (snapshot?.activeTabId === id) paintBackdrop();
  }
  function paintBackdrop() {
    const tabs = snapshot?.tabs ?? [];
    for (const id of backdrops.keys()) if (!tabs.some(tab => tab.id === id)) backdrops.delete(id);
    const active = tabs.find(tab => tab.id === snapshot?.activeTabId);
    // An installed browser theme keeps its own frame color over the band
    // (no theme reads as an empty record, as BlancInstalledTheme.apply knows).
    const spec = active && !active.private && /^blanc:\/\/newtab\//.test(active.url ?? '') &&
      !snapshot?.installedTheme?.id ? backdrops.get(active.id) : null;
    const shown = !!spec;
    document.documentElement.toggleAttribute('data-band-backdrop', shown);
    strip.contentDocument?.documentElement?.toggleAttribute('data-band-backdrop', shown);
    bandBackdrop.hidden = !shown;
    if (!shown) return;
    const zoom = Number(spec.zoom) || 1;
    const band = Number(spec.band) || 0;
    const rail = Number(spec.rail) || 0;
    bandBackdrop.style.zoom = String(zoom);
    bandBackdrop.style.width = `${(Number(spec.width) || 0) + rail / zoom}px`;
    bandBackdrop.style.height = `${(Number(spec.height) || 0) + band / zoom}px`;
    bandLayers.forEach((element, index) => {
      const layer = spec.layers[index];
      element.hidden = !layer;
      if (!layer) return;
      element.classList.toggle('fade', layer.fade === true);
      element.style.backgroundColor = typeof layer.color === 'string' ? layer.color : '';
      element.style.backgroundImage = backdropImage(layer.image);
      element.style.backgroundSize = typeof layer.size === 'string' ? layer.size : '';
      element.style.backgroundPosition = typeof layer.position === 'string' ? layer.position : '';
      element.style.backgroundRepeat = typeof layer.repeat === 'string' ? layer.repeat : '';
      element.style.opacity = String(Math.min(1, Math.max(0, Number(layer.opacity) || 0)));
    });
  }

  let splitHeaderKey = '';
  let dividerDrag = null;
  let paneMenu = null;
  const divider = document.createElement('div');
  divider.id = 'splitDivider'; divider.tabIndex = 0; divider.hidden = true;
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-label', 'Resize Split View');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('aria-valuemin', '20'); divider.setAttribute('aria-valuemax', '80');
  divider.append(document.createElement('span'));
  document.body.append(divider);
  function visibleSplit() { return snapshot?.splits?.find(s => s.tabIds.includes(snapshot.activeTabId)); }
  function currentSplitLayout() {
    const split = visibleSplit();
    const geometry = snapshot?.splitGeometry;
    if (!split || !geometry?.frames || geometry.frames.length !== split.tabIds.length) return null;
    const panes = split.tabIds.map((tabId, index) => ({
      tabId,
      frame: { ...geometry.frames[index] },
      focused: tabId === (snapshot.focusedTabId ?? snapshot.activeTabId),
      private: !!snapshot.tabs.find(tab => tab.id === tabId)?.private,
    }));
    const rect = geometry.divider;
    const dividers = geometry.mode === 'columns' && rect?.width > 0 && rect?.height > 0
      ? [{ index: 0, axis: 'x', rect: { ...rect }, saved: true }] : [];
    return { splitId: split.id, panes, dividers };
  }

  // Blanc Spaces (F41). The checked native store keeps each Space's tabs under
  // its id and does the crash-safe swap; names, colors and order are this
  // small list, shipping's WorkspacesPayload. A window in no Space parks its
  // tabs under one reserved id on the way to a saved one.
  const SPACE_SCRATCH = '__scratch__';
  const SPACE_LIMIT = 25;
  let spacesBound = '';
  const spaceList = async () => {
    if (snapshot?.miniWindow) return {meta:{order:[],items:{},deleted:[]},elsewhere:new Set(),held:new Set()};
    const { meta, elsewhere, held } = await request('spaceMeta');
    return { meta: { order: [], items: {}, deleted: [], ...meta }, elsewhere: new Set(elsewhere), held: new Set(held) };
  };
  const savedTabCount = () => snapshot?.tabs.filter(tab => !tab.private).length ?? 0;
  const spaceProjection = ({ meta, elsewhere, held }) => ({
    status: 'saved', tint: 'mark', recoveryNotice: null, windowTabCount: savedTabCount(),
    deleted: meta.deleted.map(id => ({ id, ...meta.items[id] })),
    items: meta.order.filter(id => meta.items[id]).map(id => ({
      id, ...meta.items[id], active: snapshot?.spaceName === id, openElsewhere: elsewhere.has(id),
      // The window showing it knows better than the last switch did.
      ...(snapshot?.spaceName === id && { tabCount: savedTabCount() }),
      resident: held.has(id), revision: 0 })),
  });
  const spacesPayload = async () => spaceProjection(await spaceList());
  async function announceSpaces() {
    try { emit('onWorkspacesUpdated', await spacesPayload()); } catch { /* private windows keep no Spaces */ }
  }
  const spaceResult = async (fields) => ({ ok: true, ...fields, ...(await spacesPayload()) });
  const spaceName = raw => (typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, 60) : '') || null;
  function checkSpaceName(list, raw, except = null) {
    const name = spaceName(raw);
    if (!name) return { error: 'invalid-name' };
    const same = id => id !== except && list.meta.items[id]?.name.toLocaleLowerCase() === name.toLocaleLowerCase();
    if (list.meta.order.some(same)) return { error: 'duplicate-name' };
    return { name };
  }
  function spaceIdentity(list, input) {
    const Identity = window.SpaceIdentity;
    const used = list.meta.order.map(id => list.meta.items[id]);
    const fallback = Identity.PRESETS[used.length % Identity.PRESETS.length].hex;
    return { color: input?.color || fallback, symbol: Identity.isSymbol(input?.symbol) ? input.symbol : Identity.SYMBOL_IDS[0] };
  }
  async function writeSpaces(list) {
    await request('spaceMetaSave', [list.meta]);
    await announceSpaces();
  }
  async function saveSpaceAs(rawName, identity) {
    if (snapshot?.miniWindow) return {ok:false,error:'busy'};
    const list = await spaceList();
    const checked = checkSpaceName(list, rawName);
    if (checked.error) return { ok: false, error: checked.error };
    if (list.meta.order.length >= SPACE_LIMIT) return { ok: false, error: 'limit' };
    const id = crypto.randomUUID();
    try { await request('previewSpaceSave', [id]); } catch { return { ok: false, error: 'storage-failed' }; }
    list.meta.items[id] = { name: checked.name, ...spaceIdentity(list, identity), tabCount: savedTabCount() };
    list.meta.order.push(id);
    await writeSpaces(list);
    await refresh();
    return spaceResult({ workspaceId: id, action: 'swap' });
  }
  async function swapToSpace(id) {
    if (snapshot?.miniWindow) return {ok:false,error:'busy'};
    const current = snapshot?.spaceName || SPACE_SCRATCH;
    try {
      await request('previewSpaceSave', [current]);
      await request('previewSpaceOpen', [id]);
    } catch (e) { return { ok: false, error: /^Session metadata save (?:failed|unavailable|acknowledgement timed out)/.test(e.message) ? 'storage-failed' : 'activation-failed', detail: e.message }; }
    clearSelection();
    const leftCount = savedTabCount();
    await close(false);
    await refresh();
    // Read again: another window may have changed the list during the switch.
    const fresh = await spaceList();
    if (fresh.meta.items[current]) fresh.meta.items[current].tabCount = leftCount;
    await writeSpaces(fresh);
    return spaceResult({ workspaceId: id, action: 'swap' });
  }
  async function openSpace(id, options = {}) {
    const list = await spaceList();
    if (!list.meta.items[id] || list.meta.deleted.includes(id)) return { ok: false, error: 'not-found' };
    await refresh();
    if (snapshot.spaceName === id) return spaceResult({ workspaceId: id, action: 'noop' });
    // Already showing in another window: go there.
    if (list.elsewhere.has(id)) {
      await request('spaceFocus', [id]);
      return spaceResult({ workspaceId: id, action: 'focus' });
    }
    if (options.newWindow) return openSpaceElsewhere(id);
    const guard = await switchGuard(id, options);
    return guard ?? swapToSpace(id);
  }
  // Shipping's authorize(): pages that can't be left stop a switch. Private
  // pages always ask, since a switch closes them, and a window in no Space
  // asks about all its pages. An answer holds for the switch it was asked for.
  let spacesDecision = null;
  async function switchGuard(target, options) {
    const blockingTabs = await request('spaceProtection');
    if (blockingTabs.length) return { ok: false, error: 'protected-pages', reason: 'active-page', blockingTabs };
    await refresh();
    const scratch = !snapshot.spaceName || snapshot.spaceName === SPACE_SCRATCH;
    const real = snapshot.tabs.filter(tab => !/^blanc:\/\/newtab/.test(tab.url));
    const privateCount = real.filter(tab => tab.private).length;
    const tabCount = scratch ? real.length : privateCount;
    if (!tabCount) return null;
    // Shipping's fingerprint: an answer covers the tabs it was asked about.
    const fingerprint = JSON.stringify([snapshot.spaceName, snapshot.tabs.map(tab => [tab.id, tab.url, !!tab.private])]);
    const asked = spacesDecision;
    spacesDecision = null;
    if (options.decision && asked?.token === options.decision && asked.target === target &&
        asked.fingerprint === fingerprint && asked.expires > Date.now()) return null;
    spacesDecision = { token: crypto.randomUUID(), target, fingerprint, expires: Date.now() + 60000 };
    return { ok: false, error: 'unsaved-scratch', tabCount, privateCount, decision: spacesDecision.token };
  }
  async function openSpaceElsewhere(id) {
    // Answered by the new window once it has switched, or not at all if it closed.
    const gaveUp = new Promise((_, refuse) => setTimeout(() => refuse(new Error('The new window did not open the Space.')), 20000));
    try { await Promise.race([request('spaceOpenNewWindow', [id]), gaveUp]); } catch (e) {
      return { ok: false, error: 'activation-failed', detail: e.message };
    }
    return spaceResult({ workspaceId: id, action: 'focus' });
  }
  async function createBlankSpace(rawName, options = {}) {
    const list = await spaceList();
    const checked = checkSpaceName(list, rawName);
    if (checked.error) return { ok: false, error: checked.error };
    if (list.meta.order.length >= SPACE_LIMIT) return { ok: false, error: 'limit' };
    if (!options.newWindow) {
      const guard = await switchGuard(`new:${checked.name}`, options);
      if (guard) return guard;
    }
    const id = crypto.randomUUID();
    try { await request('spaceCreateBlank', [id]); } catch (e) { return { ok: false, error: 'storage-failed', detail: e.message }; }
    list.meta.items[id] = { name: checked.name, ...spaceIdentity(list, options), tabCount: 1 };
    list.meta.order.push(id);
    await request('spaceMetaSave', [list.meta]);
    const opened = options.newWindow ? await openSpaceElsewhere(id) : await swapToSpace(id);
    // The saved Space stays findable, so a retry can't fail as a duplicate.
    return opened.ok ? { ...opened, workspaceId: id } : { ok: false, error: 'saved-not-opened', cause: opened.error, detail: opened.detail, workspaceId: id };
  }
  async function updateSpace(id, patch = {}) {
    const list = await spaceList();
    const item = list.meta.items[id];
    if (!item) return { ok: false, error: 'not-found' };
    if (patch.name !== undefined) {
      const checked = checkSpaceName(list, patch.name, id);
      if (checked.error) return { ok: false, error: checked.error };
      item.name = checked.name;
    }
    if (patch.color !== undefined) item.color = patch.color;
    if (patch.symbol !== undefined) item.symbol = patch.symbol;
    await writeSpaces(list);
    return spaceResult({ workspaceId: id });
  }
  async function moveSpaceTo(id, index) {
    const list = await spaceList();
    const from = list.meta.order.indexOf(id);
    if (from < 0) return { ok: false, error: 'not-found' };
    if (!Number.isInteger(index) || index < 0 || index >= list.meta.order.length) return { ok: false, error: 'invalid-index' };
    list.meta.order.splice(index, 0, ...list.meta.order.splice(from, 1));
    await writeSpaces(list);
    return spaceResult({ workspaceId: id });
  }
  // Deleting keeps the record for Undo and Recently deleted.
  async function removeSpace(id) {
    const list = await spaceList();
    if (!list.meta.items[id]) return { ok: false, error: 'not-found' };
    // Deleting a Space never destroys a page set aside in it: its live pages
    // come out into an ordinary window first.
    if (list.held.has(id)) {
      try { await request('spaceReveal', [id]); } catch (e) { return { ok: false, error: 'activation-failed', detail: e.message }; }
    }
    list.meta.order = list.meta.order.filter(item => item !== id);
    list.meta.deleted.unshift(id);
    list.meta.items[id].deletedAt = Date.now();
    // Every window showing it leaves it, and Undo puts them back.
    await request('spaceUnbind', [id]);
    await writeSpaces(list);
    await refresh();
    return spaceResult({ workspaceId: id });
  }
  async function restoreSpace(id) {
    const list = await spaceList();
    if (!list.meta.deleted.includes(id)) return { ok: false, error: 'not-found' };
    list.meta.deleted = list.meta.deleted.filter(item => item !== id);
    delete list.meta.items[id].deletedAt;
    list.meta.order.push(id);
    await writeSpaces(list);
    await request('spaceRebind', [id]);
    await refresh();
    return spaceResult({ workspaceId: id });
  }
  async function forgetSpace(id) {
    const list = await spaceList();
    if (list.held.has(id)) {
      try { await request('spaceReveal', [id]); } catch (e) { return { ok: false, error: 'activation-failed', detail: e.message }; }
    }
    list.meta.deleted = list.meta.deleted.filter(item => item !== id);
    delete list.meta.items[id];
    await request('spaceForget', [id]);
    await writeSpaces(list);
    return spaceResult({ workspaceId: id });
  }

  // Move to Space ▸ (F41): native writes the target's record first, already
  // holding the tab, then moves the page; a failed write moves nothing. The
  // window stays in its own Space.
  let lastSpaceMove = null;
  let pendingSpaceLink = null, lastSpaceLinkResult = null;
  async function offerSpaceLink(token, title, destination) {
    pendingSpaceLink = {token, title}; lastSpaceLinkResult = null;
    let result;
    if (destination === 'new') {
      await show('', 'spaces', null, {newSpaceLinkTitle:title}); result = true;
    } else {
      const list = await spaceList();
      result = await request('spaceLinkOpen', [token, destination, false]);
      await announceSpaces();
      if (result.ok) pendingSpaceLink = null;
      else await show('', 'spaces', null, {spaceLinkError:{name:list.meta.items[destination]?.name ?? '',error:result.error}});
    }
    lastSpaceLinkResult = {token, result}; return result;
  }
  async function createSpaceWithLink(rawName, identity) {
    const link = pendingSpaceLink;
    if (!link || overlayMode !== 'spaces' || overlayPurpose?.newSpaceLinkTitle == null)
      return {ok:false,error:'not-found',...(await spacesPayload())};
    const list = await spaceList(), checked = checkSpaceName(list, rawName);
    if (checked.error) return {ok:false,error:checked.error,...(await spacesPayload())};
    if (list.meta.order.length >= SPACE_LIMIT) return {ok:false,error:'limit',...(await spacesPayload())};
    const id = crypto.randomUUID();
    const result = await request('spaceLinkOpen',[link.token,id,true]);
    if (!result.ok) return {...result,...(await spacesPayload())};
    list.meta.items[id] = {name:checked.name,...spaceIdentity(list,identity),tabCount:1}; list.meta.order.push(id);
    await writeSpaces(list); pendingSpaceLink = null;
    return spaceResult({workspaceId:id});
  }
  async function moveTabToSpace(tabId, id) {
    const list = await spaceList();
    if (!list.meta.items[id] || list.meta.deleted.includes(id)) return { ok: false, error: 'not-found', moved: false };
    const result = await request('spaceMoveTab', [nativeId(tabId), id, false]);
    await refresh();
    await announceSpaces();
    // The Spaces menu says what failed, as shipping's does.
    if (!result.ok) show('', 'spaces', null, { spaceMoveError: { name: list.meta.items[id].name, error: result.error } });
    return result;
  }
  // New Space… from a tab: one record holding the tab, then its list entry.
  // The Space is saved once its record is, so a failed move after that leaves
  // it findable instead of inviting a retry that can only be a duplicate.
  async function createSpaceWithTab(rawName, identity, tabId) {
    const list = await spaceList();
    const checked = checkSpaceName(list, rawName);
    if (checked.error) return { ok: false, error: checked.error, ...(await spacesPayload()) };
    if (list.meta.order.length >= SPACE_LIMIT) return { ok: false, error: 'limit', ...(await spacesPayload()) };
    const id = crypto.randomUUID();
    const moved = await request('spaceMoveTab', [nativeId(tabId), id, true]);
    if (!moved.ok && moved.error !== 'move-failed') {
      const error = { refused: 'busy' }[moved.error] ?? moved.error;
      return { ok: false, error, ...(await spacesPayload()) };
    }
    list.meta.items[id] = { name: checked.name, ...spaceIdentity(list, identity), tabCount: 1 };
    list.meta.order.push(id);
    await writeSpaces(list);
    await refresh();
    return moved.ok ? spaceResult({ workspaceId: id })
      : { ok: false, error: 'saved-not-moved', workspaceId: id, ...(await spacesPayload()) };
  }
  async function moveTabsToSpace(ids, id) {
    const list = await spaceList();
    if (!list.meta.items[id] || list.meta.deleted.includes(id)) return { ok: false, error: 'not-found', movedCount: 0 };
    const revision = selectionRevision, anchor = tabSelection.selectionAnchorId;
    const result = await request('spaceMoveTabs', [ids.map(nativeId), id, false]);
    await refresh();
    if (selectionRevision === revision) {
      if (result.ok) clearSelection(); else retainSelection(ids, anchor);
    }
    await announceSpaces();
    if (!result.ok) show('', 'spaces', null, { spaceMoveError: { name: list.meta.items[id].name, error: result.error, movedCount: result.movedCount } });
    return result;
  }
  async function createSpaceWithTabs(rawName, identity, ids) {
    const list = await spaceList();
    const checked = checkSpaceName(list, rawName);
    if (checked.error) return { ok: false, error: checked.error, ...(await spacesPayload()) };
    if (list.meta.order.length >= SPACE_LIMIT) return { ok: false, error: 'limit', ...(await spacesPayload()) };
    const id = crypto.randomUUID();
    const revision = selectionRevision, anchor = tabSelection.selectionAnchorId;
    const groupId = overlayMode === 'spaces' ? overlayPurpose?.newSpaceGroupId : null;
    const result = await request('spaceMoveTabs', [ids.map(nativeId), id, true, ...(groupId ? [groupId] : [])]);
    await refresh();
    if (selectionRevision === revision) {
      if (result.ok) clearSelection(); else retainSelection(ids, anchor);
    }
    if (!result.saved) return { ...result, error: ({ refused: 'busy', 'prepare-failed': 'activation-failed' }[result.error] ?? result.error), ...(await spacesPayload()) };
    list.meta.items[id] = { name: checked.name, ...spaceIdentity(list, identity), tabCount: result.tabCount };
    list.meta.order.push(id);
    await writeSpaces(list);
    return result.ok ? spaceResult({ workspaceId: id })
      : { ...result, ok: false, error: 'saved-not-moved', workspaceId: id, ...(await spacesPayload()) };
  }

  // Floating Glance (F34), shipping's glance-card-controller.js: the one place
  // the card's frame changes. Every move, resize and reset carries the open
  // card's generation, so a message from a card that has gone is refused. The
  // save is debounced and a close flushes it.
  const GlanceCard = window.BlancGlanceCard;
  const glance = { ready: false, loadEpoch: 0, tabId: null, nativeTabId: null, nativeMainId: null, generation: 0, pending: undefined, timer: null, key: '', requestEpoch: 0 };
  // A Glance over a split (F53-29) reports its own page area; a Glance pair
  // reports it as its split geometry.
  const glanceArea = () => snapshot?.glanceArea ?? (snapshot?.splitGeometry?.mode === 'glance' ? snapshot.splitGeometry.pageArea : null);
  const glanceFractions = () => (glance.pending !== undefined ? glance.pending : snapshot?.glanceFrame ?? null);
  const glanceCardFrameNow = () => GlanceCard.fractionsToFrame(glanceFractions(), glanceArea());
  function glancePayload() {
    const area = glanceArea();
    if (snapshot?.glanceTabId == null || !area) return null;
    return { card: GlanceCard.cardGeometry(glanceCardFrameNow(), area), generation: glance.generation,
      focusedPane: snapshot.focusedTabId === snapshot.glanceTabId ? 'glance' : 'main' };
  }
  const glanceSay = (key, params) => emit('onGlanceStatus', strip.contentWindow.blancI18n.t(key, params));
  const glanceTitle = id => snapshot?.tabs.find(tab => String(tab.id) === String(id))?.title || strip.contentWindow.blancI18n.t('tab.untitledShort');
  function flushGlanceSave() {
    clearTimeout(glance.timer); glance.timer = null;
    if (glance.pending === undefined) return;
    const value = glance.pending;
    glance.pending = undefined;
    if (snapshot) snapshot.glanceFrame = value;
    request('glanceSaveFrame', [value]).catch(error => notice(error.message));
  }
  async function focusGlanceCard() {
    await request('focusIsland');
    glanceCardFrame.contentWindow.focus();
  }
  function publishGlance() {
    // A newly-created card document must paint before its page is exposed.
    // Keep the native page rectangle empty until both can appear together.
    if (!glance.ready) { glanceCardFrame.hidden = true; return; }
    const payload = glancePayload();
    const key = JSON.stringify(payload);
    if (key === glance.key) return;
    glance.key = key;
    if (payload) {
      const { chrome, page } = payload.card;
      Object.assign(glanceCardFrame.style, { left: `${chrome.x}px`, top: `${chrome.y}px`, width: `${chrome.width}px`, height: `${chrome.height}px` });
      // The card's chrome floats above the pages here, so it leaves a hole for
      // the Glance page, with the page's rounded corners.
      const x = page.x - chrome.x, y = page.y - chrome.y, r = GlanceCard.CARD_PAGE_RADIUS;
      glanceCardFrame.style.clipPath = `path(evenodd, 'M0 0H${chrome.width}V${chrome.height}H0Z`
        + `M${x + r} ${y}H${x + page.width - r}A${r} ${r} 0 0 1 ${x + page.width} ${y + r}V${y + page.height - r}`
        + `A${r} ${r} 0 0 1 ${x + page.width - r} ${y + page.height}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + page.height - r}`
        + `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z')`;
      glanceCardFrame.hidden = false;
      request('glanceFrame', [page.x, page.y, page.width, page.height, chrome.x, chrome.y, chrome.width, chrome.height])
        .catch(error => notice(error.message));
    } else {
      glanceCardFrame.hidden = true;
    }
    emit('onGlanceLayout', payload);
    // The split's frames are cut where the card now is.
    paintSplitHeaders();
  }
  function syncGlance() {
    const id = snapshot?.glanceTabId ?? null;
    // Native ownership can change before the first card layout. Remember it
    // independently of the visual identity so an immediate close still
    // announces which page survived.
    if (id !== glance.nativeTabId) {
      const open = tabId => snapshot.tabs.some(tab => String(tab.id) === String(tabId));
      if (id == null && glance.nativeTabId != null && !glance.closing) {
        if (!open(glance.nativeTabId)) glanceSay('glance.status.tabClosed');
        else if (!open(glance.nativeMainId)) glanceSay('glance.status.mainClosed', { title: glanceTitle(glance.nativeTabId) });
      }
      glance.nativeTabId = id;
    }
    if (id != null) glance.nativeMainId = snapshot.activeTabId;
    // A replacement keeps the old card while its page area is pending; the
    // first card stays hidden until native layout and the renderer are ready.
    if (id != null && !glanceArea()) { setTimeout(refresh, 50); return; }
    if (id !== glance.tabId) {
      flushGlanceSave(); glance.tabId = id; glance.generation += 1;
    }
    if (id != null) glance.mainId = snapshot.activeTabId;
    publishGlance();
  }
  function changeGlanceCard(input, next) {
    if (snapshot?.glanceTabId == null || Number(input?.generation) !== glance.generation) return null;
    const area = glanceArea();
    glance.pending = GlanceCard.frameToFractions(next(glanceCardFrameNow(), area), area);
    clearTimeout(glance.timer);
    glance.timer = setTimeout(flushGlanceSave, 250);
    publishGlance();
    return glanceCardFrameNow();
  }
  const finiteOr0 = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

  let resizeQueue = Promise.resolve();
  function resizeSplit(pair, ratio) {
    ratio = Math.max(.2, Math.min(.8, ratio));
    resizeQueue = resizeQueue.then(async () => {
      if (!await request('resizeSplit', [...pair.map(nativeId), ratio])) throw Error('Split View changed; resize cancelled.');
      await refresh();
    }).catch(e => notice(e.message));
    return resizeQueue;
  }
  divider.addEventListener('pointerdown', event => {
    const split = visibleSplit(); if (event.button !== 0 || !split) return;
    event.preventDefault(); divider.focus();
    dividerDrag = { id: event.pointerId, pair: [...split.tabIds] };
    divider.setPointerCapture(event.pointerId);
  });
  divider.addEventListener('pointermove', event => {
    if (!dividerDrag || event.pointerId !== dividerDrag.id) return;
    const geometry = snapshot?.splitGeometry;
    if (geometry?.mode === 'columns') resizeSplit(dividerDrag.pair, (event.clientX - geometry.originX) / geometry.usableWidth);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) divider.addEventListener(type, event => {
    if (!dividerDrag || event.pointerId !== dividerDrag.id) return;
    dividerDrag = null;
    if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
  });
  divider.addEventListener('dblclick', () => { const split = visibleSplit(); if (split) resizeSplit(split.tabIds, .5); });
  divider.addEventListener('keydown', event => {
    const split = visibleSplit(); if (!split) return;
    const delta = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    let ratio = split.layout.widths[0];
    if (delta) ratio += delta * (event.shiftKey ? .05 : .02);
    else if (['Enter', ' '].includes(event.key)) ratio = .5;
    else if (event.key === 'Home') ratio = .2;
    else if (event.key === 'End') ratio = .8;
    else return;
    event.preventDefault(); resizeSplit(split.tabIds, ratio);
  });
  async function dismissPaneMenu(returnFocus = false) {
    if (!paneMenu) return;
    const id = paneMenu.dataset.tabId; paneMenu.remove(); paneMenu = null;
    await restHeight(); reportGeometry();
    if (returnFocus) [...document.querySelectorAll(`[data-pane-menu="${id}"]`)].find(button => !button.hidden)?.focus();
  }
  async function openPaneMenu(tab, anchor) {
    railDismiss('surface');
    const pair = [...(visibleSplit()?.tabIds ?? [])];
    await close(false);
    await dismissPaneMenu();
    const menu = document.createElement('div'); menu.id = 'splitPaneMenu';
    menu.dataset.tabId = tab.id; menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Actions for ${tab.title || 'pane'}`);
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(innerWidth - 240, rect.right - 240))}px`;
    menu.dataset.private = String(tab.private);
    menu.style.top = `${Math.max(stripH(), Math.min(rect.bottom, innerHeight - 220))}px`;
    for (const [label, method] of [
      ['Reload', 'reload'], [tab.muted ? 'Unmute tab' : 'Mute tab', 'toggleMuted'],
      ['Pin tab', 'togglePinned'], ['Remove from Split View', 'removeFromSplit'], ['Close tab', 'closeTab'], ['Close Split View', 'closeSplit'],
    ]) {
      const button = document.createElement('button'); button.textContent = label; button.setAttribute('role', 'menuitem');
      button.addEventListener('click', async () => {
        // Recheck the original visible pair before dispatching a stale menu action.
        await refresh();
        const split = visibleSplit();
        await dismissPaneMenu();
        if (!split || JSON.stringify(split.tabIds) !== JSON.stringify(pair)) return;
        try { await request(method, [nativeId(tab.id)]); await refresh(); } catch (e) { notice(e.message); }
      }); menu.append(button);
    }
    menu.addEventListener('keydown', event => {
      const buttons = [...menu.querySelectorAll('button')];
      if (event.key === 'Escape') { event.preventDefault(); dismissPaneMenu(true); }
      else if (event.key === 'Tab') dismissPaneMenu();
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const i = buttons.indexOf(document.activeElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
          (i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
      }
    });
    paneMenu = menu; document.body.append(menu); await request('height', [Math.ceil(rect.bottom + 220)]); reportGeometry();
    menu.querySelector('button').focus();
  }
  document.addEventListener('pointerdown', event => {
    if (paneMenu && !paneMenu.contains(event.target)) dismissPaneMenu();
  });
  window.addEventListener('blur', () => { if (paneMenu) dismissPaneMenu(); });
  const splitCornerWidths = [240, 240];
  document.fonts.ready.then(() => { splitHeaderKey = ''; refresh(); });
  function paintSplitHeaders() {
    const box = document.getElementById('splitHeaders');
    const split = snapshot?.splits?.find(s => s.tabIds.includes(snapshot.activeTabId));
    const tabs = split?.tabIds.map(id => snapshot.tabs.find(t => t.id === id)) ?? [];
    const geometry = snapshot?.splitGeometry;
    // A Glance floating over the split (F53-29) covers what lies under its
    // card: the pane frames, corner tabs and divider are drawn here, above
    // the pages, so they are cut away where the card is.
    const card = snapshot?.glanceArea ? glancePayload()?.card.chrome : null;
    const key = JSON.stringify([split, tabs, snapshot?.activeTabId, layout, railWidth, geometry, card]);
    const cut = card ? `path(evenodd, 'M-10000 -10000H20000V20000H-10000Z M${card.x} ${card.y}h${card.width}v${card.height}h${-card.width}Z')` : '';
    box.style.clipPath = cut; divider.style.clipPath = cut;
    divider.hidden = !split || geometry?.mode !== 'columns';
    if (split && geometry?.divider) {
      const r = geometry.divider;
      Object.assign(divider.style, {left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
      divider.setAttribute('aria-valuenow', String(Math.round(split.layout.widths[0] * 100)));
      divider.setAttribute('aria-valuetext', `${Math.round(split.layout.widths[0] * 100)} percent saved left pane`);
    }
    if (paneMenu && !split?.tabIds.includes(paneMenu.dataset.tabId)) dismissPaneMenu();
    if (key === splitHeaderKey) return;
    splitHeaderKey = key;
    box.hidden = !split;
    box.dataset.private = String(tabs.some(t => t?.private));
    box.replaceChildren();
    box.dataset.mode = geometry?.mode || '';
    if (!split) return;
    box.style.left = '0';
    const frames = (geometry?.frames || []).filter(r => r.width > 0 && r.height > 0);
    if (frames.length) {
      const left = Math.min(...frames.map(r => r.x)) - 8, top = Math.min(...frames.map(r => r.y)) - 8;
      const right = Math.max(...frames.map(r => r.x + r.width)) + 8;
      const bottom = Math.max(...frames.map(r => r.y + r.height)) + 8;
      const surround = document.createElement('div'); surround.className = 'split-card-surround';
      surround.setAttribute('aria-hidden', 'true');
      Object.assign(surround.style, {left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
      box.append(surround);
      const gutter = geometry.divider;
      if (gutter?.width && gutter?.height) {
        const gap = document.createElement('div'); gap.className = 'split-card-gap'; gap.setAttribute('aria-hidden', 'true');
        Object.assign(gap.style, {left:gutter.x+'px',top:gutter.y+'px',width:gutter.width+'px',height:gutter.height+'px'});
        box.append(gap);
      }
    }
    for (const [index, tab] of tabs.entries()) {
      const frameRect = geometry?.frames?.[index];
      const r = geometry?.headers?.[index];
      if (!r?.width || !r?.height || !frameRect?.width) continue;
      const active = tab.id === snapshot.activeTabId;
      const frame = document.createElement('div'); frame.className = 'split-pane-frame';
      frame.dataset.active = String(active); frame.setAttribute('aria-hidden', 'true');
      Object.assign(frame.style, {left:frameRect.x+'px',top:frameRect.y+'px',width:frameRect.width+'px',height:frameRect.height+'px'});
      box.append(frame);
      const pane = document.createElement('div'); pane.className = 'split-pane-header';
      Object.assign(pane.style, {left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
      pane.dataset.active = String(active);
      for (const edge of ['top', 'left']) {
        const fillet = document.createElement('span'); fillet.className = 'split-corner-fillet '+edge;
        fillet.setAttribute('aria-hidden', 'true'); pane.append(fillet);
      }
      const corner = document.createElement('div'); corner.className = 'split-corner-tab';
      let site = tab.title || tab.url || 'New Tab';
      try { const url = new URL(tab.url); if (['http:', 'https:'].includes(url.protocol)) site = url.host; } catch { /* title fallback */ }
      const focus = document.createElement('button'); focus.className = 'split-pane-title';
      focus.setAttribute('aria-label', `Focus ${tab.title || site}; pane actions with Shift+F10`);
      focus.title = `${tab.title || site} — right-click for pane actions`;
      let icon;
      if (tab.favicon?.startsWith('data:image/')) {
        icon = document.createElement('img'); icon.alt = ''; icon.src = tab.favicon;
      } else {
        icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 16 16'); icon.setAttribute('aria-hidden', 'true');
        const circle = document.createElementNS(icon.namespaceURI, 'circle');
        for (const [k,v] of Object.entries({cx:8,cy:8,r:6})) circle.setAttribute(k,v);
        const path = document.createElementNS(icon.namespaceURI, 'path');
        path.setAttribute('d', 'M2 8h12M8 2c1.7 1.6 2.5 3.6 2.5 6S9.7 12.4 8 14C6.3 12.4 5.5 10.4 5.5 8S6.3 3.6 8 2z');
        icon.append(circle,path);
      }
      const label = document.createElement('span'); label.textContent = site;
      focus.append(icon, label); focus.hidden = active;
      focus.addEventListener('click', () => request('switchTab', [nativeId(tab.id)]).then(refresh).catch(e => notice(e.message)));
      const closeButton = document.createElement('button'); closeButton.className = 'split-corner-close';
      const closeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      closeIcon.setAttribute('viewBox', '0 0 16 16'); closeIcon.setAttribute('aria-hidden', 'true');
      const cross = document.createElementNS(closeIcon.namespaceURI, 'path');
      cross.setAttribute('d', 'M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5');
      closeIcon.append(cross); closeButton.append(closeIcon);
      closeButton.setAttribute('aria-label', `Remove ${tab.title || site} from Split View`);
      closeButton.title = 'Remove from Split View';
      closeButton.addEventListener('click', () => request('removeFromSplit', [nativeId(tab.id)]).then(refresh).catch(e => notice(e.message)));
      corner.append(focus, closeButton); pane.append(corner); box.append(pane);
      // Context actions retain the same validated native commands without a toolbar.
      for (const button of [focus, closeButton]) {
        button.dataset.paneMenu = tab.id;
        button.setAttribute('aria-haspopup', 'menu');
        button.addEventListener('keydown', event => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault(); openPaneMenu(tab, button).catch(e => notice(e.message));
          }
        });
      }
      corner.addEventListener('contextmenu', event => {
        event.preventDefault(); openPaneMenu(tab, active ? closeButton : focus).catch(e => notice(e.message));
      });
      pane.classList.add('measuring');
      splitCornerWidths[index] = Math.max(36, Math.min(240, Math.ceil(corner.getBoundingClientRect().width + 7)));
      pane.classList.remove('measuring');
    }
  }

  function pageTint(nativeTabId, color) {
    const id = String(nativeTabId);
    if (snapshot?.activeTabId !== id || (color && !/^#[0-9a-f]{6}$/i.test(color))) return;
    const tab = snapshot.tabs.find(tab => tab.id === id);
    if (!tab || tab.private) return;
    tab.pageBg = color;
    paintHeader();
    if (color) emit('onPageTint', { id, color });
    else emit('onTabsUpdated', snapshot);
  }

  function refresh() {
    // Each caller awaits a snapshot requested after its preceding mutation.
    // Returning early during a polling refresh exposed stale selection state.
    refreshQueue = refreshQueue.then(refreshNow, refreshNow);
    return refreshQueue;
  }

  // A page inside an extension goes by the extension's name in the Island,
  // not the 32-letter id in its address.
  const extensionNames = new Map();
  let extensionNamesLoading = false;
  const extensionIdOf = tab => /^chrome-extension:\/\/([^/]+)/.exec(tab.url ?? '')?.[1] ?? null;
  function nameExtensionTabs(tabs) {
    let unknown = false;
    for (const tab of tabs) {
      const id = extensionIdOf(tab);
      if (!id) continue;
      if (extensionNames.has(id)) tab.extensionName = extensionNames.get(id);
      else unknown = true;
    }
    if (!unknown || extensionNamesLoading) return;
    extensionNamesLoading = true;
    request('extensions').then(({ items }) => {
      for (const tab of snapshot?.tabs ?? []) {
        const id = extensionIdOf(tab);
        if (id && !extensionNames.has(id)) extensionNames.set(id, items.find(item => item.id === id)?.name ?? null);
      }
      if (!snapshot) return;
      nameExtensionTabs(snapshot.tabs);
      emit('onTabsUpdated', snapshot);
    }).catch(() => {}).finally(() => { extensionNamesLoading = false; });
  }

  let downloadsActivityKey = null;
  async function refreshNow() {
    const attempt = ++snapshotRefreshAttempt;
    try {
      snapshot = await request('snapshot');
      if (snapshot.miniWindow && !miniSearchOpened) {
        miniSearchOpened = true;
        setTimeout(() => window.BlancPrototypeHost.open(true), 50);
      }
      const activityKey = JSON.stringify(snapshot.downloadsActivity);
      if (activityKey !== downloadsActivityKey) {
        downloadsActivityKey = activityKey;
        emit('onDownloadsActivity', snapshot.downloadsActivity);
      }
      // Shipping's tab records name their split; the panel draws one row from it.
      nameExtensionTabs(snapshot.tabs);
      for (const tab of snapshot.tabs) tab.splitId = snapshot.splits?.find(split => split.tabIds.includes(tab.id))?.id ?? null;
      syncGlance();
      if ((snapshot.spaceName || '') !== spacesBound) {
        ++selectionRevision;
        tabSelection = BlancTabSelection.emptySelection();
        spacesBound = snapshot.spaceName || ''; announceSpaces();
      }
      settleHover();
      syncAutoHide();
      const pill = strip.contentDocument?.getElementById('islandPill');
      let recovery = strip.contentDocument?.getElementById('blockerRecovery');
      if (pill && !recovery) {
        recovery = strip.contentDocument.createElement('button');
        recovery.id = 'blockerRecovery';
        recovery.type = 'button';
        recovery.textContent = 'Blocking unavailable';
        recovery.setAttribute('aria-label', 'Blocking unavailable. Open recovery options');
        recovery.style.cssText = 'color:inherit;background:transparent;border:1px solid currentColor;border-radius:6px;padding:4px 8px;font:inherit;white-space:nowrap';
        recovery.addEventListener('click', event => {
          event.stopPropagation();
          request('blockerRecovery').catch(error => notice(error.message));
        });
        recovery.addEventListener('keydown', event => event.stopPropagation());
        pill.append(recovery);
      }
      if (recovery) recovery.hidden = snapshot.blockerHealth !== 'unavailable';
      if (pill && snapshot.blockerHealth === 'unavailable' && !blockerRecoveryShown) {
        blockerRecoveryShown = true;
        // Do not reopen a failed dialog request on every 300ms snapshot.
        // The visible button remains available for an explicit retry.
        request('blockerRecovery').catch(error => notice(error.message));
      }

      // The contract's TabId is an opaque string, and the copied renderers
      // round-trip ids through DOM datasets (drag intents, keyboard moves,
      // context rows), so native integer ids become strings here and go
      // back through nativeId() on every call.
      for (const tab of snapshot.tabs) tab.id = String(tab.id);
      for (const split of snapshot.splits ?? []) {
        split.tabIds = split.tabIds.map(String);
        if (split.focusedTabId != null) split.focusedTabId = String(split.focusedTabId);
      }
      if (snapshot.activeTabId != null) snapshot.activeTabId = String(snapshot.activeTabId);
      for (const key of ['focusedTabId', 'glanceTabId']) {
        if (snapshot[key] != null) snapshot[key] = String(snapshot[key]);
      }
      const enabled = snapshot.adblockEnabled;
      const health = snapshot.blockerHealth;
      const blockerStatus = !enabled ? 'Blanc Blocker is not enabled'
        : health === 'ready' ? 'Blanc Blocker is active'
        : health === 'unavailable' ? 'Blanc Blocker needs attention; requests remain blocked'
        : 'Blanc Blocker is starting; requests are held';
      const t = (key, values) => strip.contentWindow?.blancI18n?.t(key, values) ?? blockerStatus;
      for (const tab of snapshot.tabs) {
        tab.connection = BlancShieldModel.connectionFor({ url: tab.committedUrl, isLoading: tab.isLoading });
        // Shipping's projection: the committed page's security state, which
        // the strip's warning badge and site controls read. Chromium's
        // certificate warning and continue decisions (V8) stand in for
        // shipping's certificate page and exceptions.
        const certificate = tab.certificate;
        tab.siteInfo = BlancSiteSecurity.buildSiteInfo(tab.committedUrl ?? '', {
          blockedCount: tab.blockedCount, t,
          certificateError: certificate?.state === 'error' ? { url: tab.committedUrl, error: certificate.error } : null,
          certificateException: certificate?.state === 'exception' ? {} : null,
        });
        tab.shield = BlancShieldModel.shieldChipState({
          url: tab.url, blockedCount: tab.blockedCount, excepted: tab.adblockExcepted === true,
          adblockEnabled: enabled, t,
        });
        // Native fail-closed health must never look like ready protection.
        if (tab.shield.mode !== 'hidden' && enabled && health !== 'ready') {
          tab.shield = { mode: health === 'unavailable' ? 'off' : 'restarting',
            count: 0, title: blockerStatus };
        }
      }
      const shieldTab = snapshot.tabs.find(tab => tab.id === snapshot.activeTabId);
      const shippingShield = shieldTab ? BlancShieldModel.shieldPopoverModel({
        url: shieldTab.url, blockedCount: shieldTab.blockedCount, excepted: shieldTab.adblockExcepted === true,
        adblockEnabled: enabled, connection: shieldTab.connection, t,
      }) : null;
      snapshot.shieldPopover = shippingShield ? {
        ...shippingShield, route: snapshot.linkRoute,
        // Keep the shipping site/global distinction; unhealthy protection, or
        // a navigation still on its way to another page, has recovery
        // semantics rather than an apparently active site switch. A page
        // loading its own resources keeps its switch, as in shipping.
        variant: (shieldTab.isLoading && shieldTab.url !== shieldTab.committedUrl) || (enabled && health !== 'ready')
          ? 'recovery' : shippingShield.variant,
        on: shippingShield.on && health === 'ready', connection: shippingShield.connection,
        countLine: enabled && health !== 'ready' ? blockerStatus : shippingShield.countLine,
        controls: { active: 'blanc', choice: 'blanc', disabled: true, hidden: true,
          restartPending: false, ublockAvailable: false, canOpenUblock: false,
          activeLabel: 'Active', detail: blockerStatus, availability: '',
          scope: shieldTab.private ? 'Private window' : '' },
      } : null;
      tabSelection = BlancTabSelection.pruneSelection(tabSelection, selectionTabs());
      snapshot.selectedTabIds = [...tabSelection.selectedTabIds];
      snapshot.contextMenuSelection = !!tabSelection.contextMenu;
      const items = strip.contentWindow?.TabSections?.itemsOf(snapshot.tabs) ?? [];
      const localClosed = snapshot.closed ?? [];
      const remoteById = new Map(syncedClosed.map(row => [row.id, row]));
      snapshot.closed = localClosed.map(row => {
        const remote = remoteById.get(row.sharedTabId);
        if (!remote) return row;
        remoteById.delete(row.sharedTabId);
        return {...row, fromName: remote.fromName, syncId: remote.id};
      });
      for (const remote of remoteById.values()) snapshot.closed.push({...remote,
        id: `sync:${remote.id}`, sharedTabId: remote.id, syncId: remote.id, tabCount: 1});
      snapshot.closed.sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
      snapshot.closedSlot = closedSlotFor(items.map(item => item.id));
      strip.contentDocument?.documentElement?.toggleAttribute('data-extensions-page',
        snapshot.tabs.find(t => t.id === snapshot.activeTabId)?.url === 'chrome://extensions/');
      if (sheet.tabs && (snapshot.activeTabId !== sheet.tabs.active || snapshot.tabs.length > sheet.tabs.count))
        hideSheet(false).catch(error => notice(error.message));
      else if (sheet.tabs) sheet.tabs.count = snapshot.tabs.length;
      paintHeader();
      paintSplitHeaders();
      const slot = strip.contentDocument?.getElementById('nativeExtensions');
      if (slot) slot.style.width = `${snapshot.extensionsWidth / 1.15}px`;
      reportGeometry();
      syncRailHover();
      const next = JSON.stringify(snapshot);
      if (next !== serialized) {
        serialized = next;
        emit('onTabsUpdated', snapshot);
        emit('onSplitLayout', currentSplitLayout());
      }
      if (opened && overlayMode === 'capture' && !snapshot.capturePopover?.rows.length)
        await close(false);
      // A newer fully processed snapshot can retire only its own older timeout.
      // Preserve any later unrelated notice and wait while any snapshot is pending.
      const status = document.getElementById('status');
      if (lastNotice?.snapshotTimeoutAttempt != null &&
          lastNotice.snapshotTimeoutAttempt < attempt &&
          ![...pending.values()].some(entry => entry.method === 'snapshot') &&
          !status.hidden && status.textContent === lastNotice.message) {
        status.textContent = '';
        status.hidden = true;
        lastNotice = null;
      }
    } catch (error) {
      notice(error.message, error?.[snapshotTimeoutMarker] ? attempt : null);
    }
  }

  // Shipping's calculateSpacesBounds: the 300px menu's left edge under the
  // mark, kept in the window, in a view reaching 44px past its sides and 16px
  // above it for its shadow. CSS places the menu at (44, 16) in that view.
  // It never hangs below the strip, except with vertical tabs (shipping's
  // spacesAnchorLimit): the mark then sits in the rail's header, which on
  // macOS runs below the strip.
  function positionSpaces() {
    const rect = strip.contentDocument?.getElementById('pillSpace')?.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    const wanted = rect ? stripRect.x + rect.x : (innerWidth - 300) / 2;
    const pill = strip.contentDocument?.getElementById('islandPill')?.getBoundingClientRect();
    const bottom = stripRect.y + Math.max(rect?.bottom ?? 0, pill?.bottom ?? 0);
    const below = rect ? Math.min(bottom, layout === 'vertical' ? innerHeight : stripH()) : stripH();
    const x = Math.round(Math.max(0, Math.min(wanted, innerWidth - 300))) - 44;
    const y = Math.max(0, Math.round(below + 6 - 16));
    Object.assign(overlay.style, {left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto',
      width: '388px', height: Math.max(0, Math.min(640, innerHeight - y)) + 'px'});
  }

  // Shipping chrome-layout.js: 404px view, 380px card, centered on the
  // measured trigger and clamped inside the window. CSS paints the card.
  function positionShield() {
    if (overlayClosing === 'spaces') return;
    if (opened && overlayMode === 'spaces') { positionSpaces(); return; }
    if (opened && overlayMode === 'find' && findTabId === snapshot?.glanceTabId) {
      const page = glancePayload()?.card.page;
      if (page) {
        Object.assign(overlay.style, {left: page.x + 'px', top: page.y + 'px',
          width: page.width + 'px', height: Math.min(160, page.height) + 'px', right: 'auto', bottom: 'auto'});
        return;
      }
    }
    if (!opened || !['shield', 'capture'].includes(overlayMode)) {
      for (const key of ['left', 'top', 'width', 'height', 'right', 'bottom']) overlay.style[key] = '';
      if (layout === 'vertical') {
        const left = effectiveRailWidth();
        overlay.style.left = `${left}px`;
        overlay.style.width = `${Math.max(0, innerWidth - left)}px`;
      }
      return;
    }
    const trigger = strip.contentDocument?.getElementById(overlayMode === 'capture' ? 'pillCapture' : shieldTrigger === 'insecure' ? 'pillInsecure' : 'pillShield');
    const rect = trigger?.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    const width = Math.min(404, Math.max(0, innerWidth - 24));
    const center = rect ? stripRect.x + rect.x + rect.width / 2 : innerWidth / 2;
    const x = Math.max(12, Math.min(Math.round(center + width / 2) - width, innerWidth - width - 12));
    const y = rect ? Math.ceil(Math.max(0, Math.min(stripRect.y + rect.bottom, stripH()))) : stripH();
    Object.assign(overlay.style, {left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto',
      width: width + 'px', height: Math.min(580, Math.max(0, innerHeight - y)) + 'px'});
    emit('onShieldAnchor', {x: Math.max(32, Math.min(width - 32, center - x)), connected: !!rect});
  }

  function reportGeometry() {
    positionShield();
    const slot = strip.contentDocument?.getElementById('nativeExtensions');
    const panel = paneMenu ?? (extensionsOpened ? document.getElementById('extensionsPanel')
      : !opened && !sheet.page && prompts.size ? permissionFrame
      : opened ? overlay.contentDocument?.getElementById(overlayMode === 'find' ? 'findBar' : overlayMode === 'shield' ? 'shieldPop' : overlayMode === 'capture' ? 'capturePop'
        : overlayMode === 'group-menu' ? 'groupMenu' : overlayMode === 'spaces' ? 'workspaceSwitcher' : 'islandPanel')
      : strip.contentDocument?.getElementById('islandPill'));
    if (!slot || !panel) return;
    const pill = strip.contentDocument.getElementById('islandPill');
    const a = pill ? restingRect(pill, slot) : slot.getBoundingClientRect();
    // The palette scrim, and the group menu's transparent layer (a click
    // beside the menu closes it), own outside clicks across the viewport.
    const b = (opened && (overlayMode === 'palette' || overlayMode === 'group-menu')) || (sheet.page && !opened)
      ? { x: 0, y: 0, width: innerWidth, height: innerHeight }
      : panel.getBoundingClientRect();
    const overlayRect = opened ? overlay.getBoundingClientRect() : {x: 0, y: 0};
    const offsetY = opened && overlayMode !== 'palette' ? overlayRect.y : 0;
    const offsetX = opened && overlayMode !== 'palette' ? overlayRect.x : 0;
    const values = [a.x, a.y, a.width, a.height, b.x + offsetX, b.y + offsetY, b.width, b.height, ...splitCornerWidths].map(Math.round);
    const next = JSON.stringify(values);
    if (next !== geometry) {
      geometry = next;
      request('geometry', values).catch(error => notice(error.message));
    }
  }

  async function show(prefill, mode = 'panel', trigger = null, purpose = undefined) {
    railDismiss('surface');
    overlayDragging = false;
    if (mode === 'panel' || mode === 'palette') request('syncSurface', ['refreshSession', []]).catch(() => {});
    // Every open ends a hover dwell, as shipping's showOverlay does.
    hoverStepWith({ type: 'ineligible' });
    await hideSheet(false);
    invalidateFindShow(mode === 'shield');
    const epoch = findShowEpoch;
    overlayClosing = null;
    overlay.style.pointerEvents = '';
    if (overlayMode === 'find') emit('onOverlayHide', {});
    findTabId = null;
    overlay.dataset.mode = mode;
    tooltip.hidden = true;
    extensionsOpened = false;
    extensionsPanel.hide();
    strip.style.visibility = '';
    await refresh();
    if (epoch !== findShowEpoch) return;
    // The palette's scrim and the side list's group menu cover the window.
    await request('height', [mode === 'palette' || mode === 'group-menu' ? 10000 : mode === 'shield' ? 648 : 640]);
    if (epoch !== findShowEpoch) return;
    // Another surface replacing the side list's group menu closes it too.
    const replacedMenu = mode !== 'group-menu' ? groupMenuClosed() : null;
    if (replacedMenu) emit('onIslandState', { mode: null, trigger: replacedMenu, restoreTrigger: null });
    overlayMode = mode;
    overlayPurpose = purpose ?? null;
    shieldTrigger = mode === 'shield' ? trigger : null;
    opened = true;
    overlayShownAt = performance.now();
    overlayMenuOpen = false;
    overlay.hidden = false;
    emit('onIslandState', { mode, trigger: shieldTrigger, restoreTrigger: null });
    // Opening resolves only after the renderer has received its purpose and
    // prefill. Otherwise the next action can type into the visible input and
    // have that text overwritten by this deferred initialization.
    await new Promise(resolve => requestAnimationFrame(() => {
      if (epoch !== findShowEpoch || !opened || overlayMode !== mode) { resolve(); return; }
      // Search priority results (S1.7) is read where the panel opens, as
      // shipping's overlay:show carries it.
      emit('onOverlayShow', { mode, prefill, pillRect, ...(purpose ? { purpose } : {}),
        searchPriorityResults: snapshot?.searchPriorityResults === true });
      reportGeometry();
      if (prefill !== undefined) {
        const input = overlay.contentDocument.getElementById('addressInput');
        input.value = prefill;
        input.dispatchEvent(new overlay.contentWindow.Event('input', { bubbles: true }));
      }
      overlay.contentWindow.focus();
      resolve();
    }));
  }

  // A backgrounded host can stop receiving animation frames. The timer also
  // attempts the handoff, while a late listener retries it at registration.
  // Epochs prevent a delayed callback from reopening a closed/replaced view.
  function invalidateFindShow(preserveShield = false) {
    if (!preserveShield) pendingShieldOpen = null;
    ++findShowEpoch;
    pendingFindShow?.resolve();
    pendingFindShow = null;
  }

  function deliverFindShow(epoch) {
    const pending = pendingFindShow;
    if (!pending || pending.epoch !== epoch || epoch !== findShowEpoch ||
        !opened || overlayMode !== 'find' || findTabId !== pending.tabId ||
        !pruneOverlayShowSubscribers()?.size) return;
    pendingFindShow = null;
    try {
      emit('onOverlayShow', { mode: 'find', purpose: { findTabId: pending.tabId } });
      // A callback may synchronously close or replace the overlay.
      if (epoch !== findShowEpoch || !opened || overlayMode !== 'find') return;
      overlay.contentWindow.focus();
      reportGeometry();
    } finally {
      pending.resolve();
    }
  }

  async function openFindBar() {
    await hideSheet(false);
    invalidateFindShow();
    overlayClosing = null;
    overlay.style.pointerEvents = '';
    const epoch = findShowEpoch;
    await refresh();
    if (epoch !== findShowEpoch || !snapshot?.activeTabId) return;
    if (overlayMode !== 'find') emit('onOverlayHide', {});
    extensionsOpened = false;
    extensionsPanel.hide();
    strip.style.visibility = '';
    findTabId = snapshot.focusedTabId ?? snapshot.activeTabId;
    // Find can open before the copied panel renderer applies its theme.
    const findRoot = overlay.contentDocument?.documentElement;
    if (findRoot) {
      if (snapshot.tabs.find(tab => tab.id === findTabId)?.private)
        findRoot.dataset.theme = 'private';
      else delete findRoot.dataset.theme;
    }
    overlayMode = 'find';
    overlay.dataset.mode = 'find';
    await request('height', [228]);
    if (epoch !== findShowEpoch) return;
    opened = true;
    overlay.hidden = false;
    emit('onIslandState', { mode: 'find' });
    // A caller may type as soon as opening resolves. Wait until the current
    // renderer has received the initialization that clears its previous query.
    await new Promise(resolve => {
      pendingFindShow = { epoch, tabId: findTabId, resolve };
      requestAnimationFrame(() => deliverFindShow(epoch));
      setTimeout(() => deliverFindShow(epoch), 250);
    });
  }

  async function close(focus = true, restoreTrigger = null) {
    overlayDragging = false;
    invalidateFindShow();
    const epoch = findShowEpoch;
    await dismissPaneMenu();
    if (epoch !== findShowEpoch) return;
    const leaving = overlayMode;
    overlayClosing = leaving === 'spaces' || leaving === 'glance' ? leaving : null;
    tooltip.hidden = true;
    extensionsOpened = false;
    extensionsPanel.hide();
    strip.style.visibility = '';
    emit('onOverlayHide', {});
    if (restoreTrigger) strip.contentWindow.focus();
    emit('onIslandState', { mode: null, trigger: groupMenuClosed(), restoreTrigger });
    opened = false;
    overlayMode = null;
    overlayPurpose = null;
    shieldTrigger = null;
    findTabId = null;
    overlay.dataset.mode = '';
    // Keep the closing pixels at their original position, but release input
    // and logical state immediately. A later open owns the view and cancels
    // this epoch's delayed detach.
    overlay.style.pointerEvents = 'none';
    if (!overlayClosing) overlay.hidden = true;
    if (focus && !restoreTrigger) await request('focusPage');
    if (overlayClosing) await new Promise(resolve => setTimeout(resolve, 200));
    if (epoch !== findShowEpoch) return;
    overlayClosing = null;
    overlay.hidden = true;
    // An open sheet keeps the window's height; hideSheet gives it back.
    if (!sheet.page) await restHeight();
    if (epoch !== findShowEpoch) return;
    // Escape and outside clicks return focus to the page (Electron's
    // hideOverlay does the same); extension activation passes false so the
    // native popup takes focus instead.
    if (restoreTrigger) strip.contentWindow.focus();
    else if (focus) await request('focusPage');
    if (epoch !== findShowEpoch) return;
    reportGeometry();
    // The resting pointer is sampled where it is now, as shipping's
    // hideOverlay does: still over the address it disarms hover-open instead
    // of reopening, and anywhere off the Island (no point) it re-arms it.
    const cursor = await request('sampleIslandCursor');
    if (epoch !== findShowEpoch) return;
    const stripBounds = strip.getBoundingClientRect();
    const point = cursor && { x: cursor.x - stripBounds.x, y: cursor.y - stripBounds.y };
    hover.lastPoint = point;
    wakeProximity(point);
    updateHover(point, { sampled: true });
  }

  const extensionsPanel = new window.BlancExtensions({
    request, close, refreshGeometry: reportGeometry, back: () => show(),
  });
  async function showExtensions() {
    railDismiss('surface');
    await hideSheet(false);
    invalidateFindShow();
    const epoch = findShowEpoch;
    if (extensionsOpened) return close();
    emit('onOverlayHide', {});
    emit('onIslandState', { mode: null, trigger: groupMenuClosed(), restoreTrigger: null });
    opened = false;
    overlayMode = null;
    overlayPurpose = null;
    shieldTrigger = null;
    findTabId = null;
    overlay.dataset.mode = '';
    overlay.hidden = true;
    extensionsOpened = true;
    strip.style.visibility = 'hidden';
    await request('height', [640]);
    if (epoch !== findShowEpoch) return;
    await extensionsPanel.show();
    if (epoch !== findShowEpoch) return;
    reportGeometry();
  }
  document.addEventListener('pointerdown', event => {
    if (extensionsOpened && !extensionsPanel.contextMenuOpen &&
        !extensionsPanel.panel.contains(event.target)) close();
  });
  window.addEventListener('blur', () => {
    setTimeout(() => { if (extensionsOpened && !extensionsPanel.contextMenuOpen && !document.hasFocus()) close(); }, 0);
  });
  setInterval(() => extensionsPanel.update(), 1000);

  // Clicking the page, another window or another app closes the open Island,
  // as shipping's overlay blur does. Find stays open between matches and the
  // display-share dialog is its own decision. A new tab's page can briefly
  // take focus as the panel opens, so the first moments never dismiss.
  const dismissOnFocusLoss = () => {
    setTimeout(() => {
      if (!opened || !overlayMode || overlayMode === 'find' || overlayMode === 'display-share' ||
          overlayDragging || overlayMenuOpen || document.hasFocus() || performance.now() - overlayShownAt < 400) return;
      close(false);
    }, 0);
  };
  // Focus inside the overlay frame leaves the host window with nothing to
  // blur, so the frame's own window reports the loss too.
  const watchOverlay = () => {
    overlayDragging = false;
    const win = overlay.contentWindow;
    win.addEventListener('blur', dismissOnFocusLoss);
    // Focus coming back is the native menu closing.
    win.addEventListener('focus', () => { overlayMenuOpen = false; });
    win.document.addEventListener('contextmenu', () => { overlayMenuOpen = true; }, true);
    for (const type of ['pointerdown', 'keydown']) {
      win.document.addEventListener(type, event => {
        if (type === 'pointerdown' && event.button === 2) return;
        overlayMenuOpen = false;
      }, true);
    }
  };
  overlay.addEventListener('load', watchOverlay);
  if (overlay.contentDocument?.readyState === 'complete') watchOverlay();
  window.addEventListener('blur', dismissOnFocusLoss);

  // ---- Permission prompts (F13; shipping's permission view). Native
  // (permission_prompt.inc) sends each request shipping would ask about;
  // shipping's own permission.html shows them one at a time, bottom-centre
  // over the page, and answers through respondPermission. It never takes
  // focus: a keystroke meant for the page must not answer a prompt.
  const permissionFrame = document.getElementById('permission');
  const prompts = new Map();
  function placePermission() {
    // Until native has grown the host from the strip to the window there is
    // no room below the Island: shown then, the prompt would flash over the
    // Island and take the pointer there. The resize places and shows it.
    const room = innerHeight >= stripH() + 84;
    permissionFrame.hidden = !room;
    if (!room) return;
    const width = Math.min(560, Math.max(0, innerWidth - 24));
    Object.assign(permissionFrame.style, { left: `${Math.round((innerWidth - width) / 2)}px`,
      top: `${Math.max(0, innerHeight - 84)}px`, width: `${width}px`, height: '84px' });
  }
  // The Island's resting height: the strip, or, while a prompt is pending,
  // the window, so the prompt can draw over the page.
  function restHeight() {
    return request('height', prompts.size ? [10000, false] : [stripH()]);
  }
  async function syncPermission() {
    if (!prompts.size) permissionFrame.hidden = true;
    if (!opened && !extensionsOpened && !sheet.page && !paneMenu) await restHeight();
    if (prompts.size) placePermission();
    reportGeometry();
  }
  function permissionPrompt(payload) {
    if (!Number.isInteger(payload?.id) || prompts.has(payload.id)) return;
    prompts.set(payload.id, payload);
    emit('onPermissionPrompt', payload);
    syncPermission().catch(error => notice(error.message));
  }
  // A request ended without this frame's answer (its tab switched or closed,
  // or it navigated): shipping's renderer has no way to drop one, so the
  // document reloads and the rest are replayed as on its first load.
  function permissionGone(id) {
    if (!prompts.delete(id)) return;
    if (prompts.size) permissionFrame.src = permissionFrame.dataset.src;
    syncPermission().catch(error => notice(error.message));
  }
  async function respondPermission(id, allow) {
    const answered = prompts.get(Number(id));
    if (!answered) return false;
    prompts.delete(answered.id);
    const result = await request('respondPermission', [answered.id, allow === true]);
    await syncPermission();
    return result;
  }
  window.addEventListener('resize', () => { if (prompts.size) placePermission(); });

  // ---- The utility sheet (S1.5, F16; shipping's showUtilityPage and
  // hideUtilitySheet). Favorites, History and Downloads open in one frame
  // over the page, never as tabs. The frame claims the window as the palette
  // does, its page draws its own scrim and card, and the host answers its
  // window.bowserPages (pages/sheet-adapter.js) from Chromium's models.
  const SHEET_PAGES = ['bookmarks', 'history', 'downloads', 'tab-import'];
  // Settings sections a typed blanc://settings/<section> may name (the
  // browser's SettingsSheetURL accepts the same names).
  const SETTINGS_SECTIONS = new Set(['general', 'blocking', 'search', 'sync', 'appearance', 'privacy', 'security',
    'content', 'clearBrowserData', 'downloads', 'languages', 'defaultBrowser', 'help', 'profiles', 'people']);
  const sheet = { frame: null, page: null, contents: 0, epoch: 0, tabs: null,
    escapeArmed: false, escapeListeners: new Set() };
  const sheetCurrent = (win, page) => !!sheet.frame && sheet.frame.contentWindow === win && sheet.page === page;
  // Settings (S1.7, owner 2026-11-03): Chromium's chrome://settings in a
  // native view over the card's body. The host draws shipping's scrim, card
  // and close button; the sheet's rules (one layer at a time, a tab switch or
  // a new tab ends it) apply as to the other pages.
  const settingsSheet = document.getElementById('settingsSheet');
  const settingsBody = document.getElementById('settingsSheetBody');
  const settingsRect = () => {
    const r = settingsBody.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  };
  function placeSettingsSheet() {
    const top = stripH(), left = effectiveRailWidth();
    Object.assign(settingsSheet.style, { top: `${top}px`, left: `${left}px`,
      width: `calc(100% - ${left}px)`, height: `calc(100% - ${top}px)` });
  }
  function syncSettingsSheet() {
    if (sheet.page !== 'settings' || settingsSheet.hidden) return;
    placeSettingsSheet();
    request('settingsSheet', ['bounds', ...settingsRect()]).catch(error => notice(error.message));
  }
  settingsSheet.addEventListener('click', event => { if (event.target === settingsSheet) hideSheet(); });
  document.getElementById('settingsSheetClose').addEventListener('click', () => hideSheet());
  // Shipping's header tabs: the other three pages swap in the sheet's place.
  document.getElementById('settingsSheetTabs').addEventListener('click', event => {
    const page = event.target.closest('[data-sheet]')?.dataset.sheet;
    if (page) showSheet(page).catch(error => notice(error.message));
  });
  window.addEventListener('resize', syncSettingsSheet);
  const grownViewport = () => new Promise(resolve => {
    if (settingsBody.getBoundingClientRect().height > 0) return resolve();
    const done = () => { clearTimeout(timer); window.removeEventListener('resize', grown); resolve(); };
    const grown = () => { if (settingsBody.getBoundingClientRect().height > 0) done(); };
    const timer = setTimeout(done, 1000);
    window.addEventListener('resize', grown);
  });
  async function showSettingsSheet(section) {
    railDismiss('surface');
    // Re-invoking Settings closes it, as shipping's showUtilityPage toggles.
    if (sheet.page === 'settings') return hideSheet();
    const epoch = ++sheet.epoch;
    if (opened || extensionsOpened || paneMenu) await close(false);
    if (epoch !== sheet.epoch) return;
    hoverStepWith({ type: 'ineligible' });
    if (sheet.frame) { sheet.frame.hidden = true; sheet.frame.src = 'about:blank'; }
    sheet.page = 'settings';
    sheet.escapeArmed = false;
    sheet.escapeListeners.clear();
    const label = strip.contentWindow?.blancI18n?.t;
    if (label) {
      settingsSheet.querySelector('[role="dialog"]').setAttribute('aria-label', label('settings.page.heading'));
      document.getElementById('settingsSheetClose').setAttribute('aria-label', label('sheet.close'));
      for (const tab of document.querySelectorAll('#settingsSheetTabs [data-label]')) tab.textContent = label(tab.dataset.label);
    }
    placeSettingsSheet();
    settingsSheet.hidden = false;
    await request('height', [10000]);
    if (epoch !== sheet.epoch) return;
    // The host grows after the request returns; measure the card once it has
    // (the resize listener corrects the bounds if no frame comes in time).
    await grownViewport();
    if (epoch !== sheet.epoch) return;
    await request('settingsSheet', ['show', typeof section === 'string' ? section : '', ...settingsRect()]);
    if (epoch !== sheet.epoch) return;
    await refresh();
    if (epoch !== sheet.epoch) return;
    sheet.tabs = { active: snapshot?.activeTabId ?? null, count: snapshot?.tabs.length ?? 0 };
    reportGeometry();
  }
  function sheetReady() {
    if (sheet.page === 'settings') return !settingsSheet.hidden;
    const doc = sheet.frame?.contentDocument;
    return !!sheet.page && doc?.readyState === 'complete' &&
      sheet.frame.contentWindow.location.pathname === `/pages/${sheet.page}.html`;
  }
  // The page's place: below the strip, or beside the vertical rail.
  function placeSheet() {
    const top = stripH(), left = effectiveRailWidth();
    Object.assign(sheet.frame.style, { top: `${top}px`, left: `${left}px`,
      width: `calc(100% - ${left}px)`, height: `calc(100% - ${top}px)` });
  }
  function createSheetFrame() {
    const frame = document.createElement('iframe');
    frame.id = 'sheet';
    frame.title = 'Blanc utility sheet';
    frame.dataset.contents = String(++sheet.contents);
    // A document the bridge didn't open (a page setting its own address)
    // ends the sheet, as shipping's will-navigate refuses it.
    frame.addEventListener('load', () => {
      // Switching to native Settings blanks this iframe. Its ensuing load
      // is not navigation of the separate Settings WebContents and must not
      // dismiss the sheet we just opened.
      if (sheet.frame === frame && sheet.page && sheet.page !== 'settings' &&
          frame.contentWindow.location.pathname !== `/pages/${sheet.page}.html`) hideSheet();
    });
    // Under the floating pill and the overlay, as shipping stacks its views.
    floatPill.before(frame);
    return frame;
  }
  async function showSheet(name, section) {
    railDismiss('surface');
    if (name === 'settings') return showSettingsSheet(section);
    if (!SHEET_PAGES.includes(name)) throw new Error(`No utility sheet page named ${name}.`);
    // Re-invoking the shown page closes it; while it loads, a repeat is the
    // same request (shipping's showUtilityPage toggle).
    if (sheet.page === name && sheet.frame && (name !== 'history' || (section === 'archived') === (new URLSearchParams(sheet.frame.contentWindow.location.search).get('view') === 'archived'))) {
      if (sheetReady()) return hideSheet();
      sheet.frame.contentWindow.focus();
      return;
    }
    const epoch = ++sheet.epoch;
    // One floating layer at a time, in both directions.
    if (opened || extensionsOpened || paneMenu) await close(false);
    if (epoch !== sheet.epoch) return;
    hoverStepWith({ type: 'ineligible' });
    sheet.frame ??= createSheetFrame();
    sheet.page = name;
    sheet.escapeArmed = false;
    sheet.escapeListeners.clear();
    if (!settingsSheet.hidden) {
      settingsSheet.hidden = true;
      await request('settingsSheet', ['hide']).catch(() => {});
    }
    placeSheet();
    sheet.frame.src = `pages/${name}.html${name === 'history' && section === 'archived' ? '?view=archived' : ''}`;
    sheet.frame.hidden = false;
    await request('height', [10000]);
    if (epoch !== sheet.epoch) return;
    await refresh();
    if (epoch !== sheet.epoch) return;
    // A tab switch or a new tab dismisses the sheet (refreshNow).
    sheet.tabs = { active: snapshot?.activeTabId ?? null, count: snapshot?.tabs.length ?? 0 };
    reportGeometry();
    sheet.frame.contentWindow.focus();
  }
  async function hideSheet(focus = true) {
    if (!sheet.page) return;
    const importing = sheet.page === 'tab-import';
    const epoch = ++sheet.epoch;
    sheet.page = null;
    if (importing) await request('importDiscard').catch(() => {});
    sheet.tabs = null;
    sheet.escapeArmed = false;
    sheet.escapeListeners.clear();
    if (!settingsSheet.hidden) {
      settingsSheet.hidden = true;
      await request('settingsSheet', ['hide']).catch(() => {});
    }
    if (sheet.frame) {
      sheet.frame.hidden = true;
      // A hidden frame still reports itself visible; a blank one does nothing.
      sheet.frame.src = 'about:blank';
    }
    if (opened || extensionsOpened) return;
    await restHeight();
    if (epoch !== sheet.epoch) return;
    if (focus) await request('focusPage');
    reportGeometry();
  }
  // Where a click in the sheet goes (shipping's createUtilitySheet
  // will-navigate): a utility page changes the sheet, a web page opens a
  // tab, Settings opens Blanc's Settings, anything else goes nowhere.
  async function sheetLink(win, href) {
    if (!sheet.frame || sheet.frame.contentWindow !== win || !sheet.page) return;
    let url;
    try { url = new URL(href); } catch { return; }
    if (url.protocol === 'blanc:' && SHEET_PAGES.includes(url.hostname)) {
      if (url.hostname === sheet.page) { sheet.frame.contentWindow.location.reload(); return; }
      return showSheet(url.hostname);
    }
    if (url.protocol === 'blanc:' && url.hostname === 'settings') {
      await hideSheet(false);
      return implemented.openPage('settings');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    await hideSheet(false);
    await request('createTab', [url.href]);
    await refresh();
  }
  // Escape closes the sheet unless its page asked for it first (a picker).
  function sheetEscape(win) {
    if (!sheet.frame || sheet.frame.contentWindow !== win || !sheet.page) return;
    if (sheet.escapeArmed) for (const callback of [...sheet.escapeListeners]) callback();
    else hideSheet();
  }
  // shipping's tab preload's API for one sheet page, answered by native ops.
  function sheetBridge(win, page) {
    const call = (method, args = []) => sheetCurrent(win, page) ? request(method, args)
      : Promise.reject(new Error('This page is no longer shown.'));
    const unavailable = async () => { throw new Error('Importing Favorites is not available yet.'); };
    const surface = {
      close: async () => { if (sheetCurrent(win, page)) await hideSheet(); },
      armEscape: async (armed) => { if (sheetCurrent(win, page)) sheet.escapeArmed = !!armed; },
      onEscape: (callback) => {
        if (!sheetCurrent(win, page)) return () => {};
        sheet.escapeListeners.add(callback);
        return () => sheet.escapeListeners.delete(callback);
      },
    };
    if (page === 'tab-import') return { surface, tabImport: {
      sources: () => call('importSources'),
      openSource: (id, options = {}) => call('importOpenSource', [String(id), options]),
      project: id => call('importProject', [String(id)]),
      setSelection: (id, selection) => call('importSelection', [String(id), selection]),
      suggestSourceGroups: id => call('importSuggest', [String(id)]),
      cancel: id => call('importCancel', [String(id)]),
      apply: async (id, request) => {
        const result = await call('importApply', [String(id), request]);
        if (result?.ok) { await hideSheet(false); await refresh(); }
        return result;
      },
      arcDetect: () => call('importArcDetect'),
      arcRead: source => call('importArcRead', [String(source)]),
      arcApply: async (id, request) => {
        const result = await call('importArcApply', [String(id), request]);
        if (result?.ok) await announceSpaces();
        return result;
      },
      arcCancel: id => call('importArcCancel', [String(id)]),
    }};
    if (page === 'bookmarks') return { surface,
      bookmarks: {
        capabilities: async () => ({ editable: true, import: true }),
        list: () => call('listFavorites'),
        remove: (id) => call('sheetFavoriteRemove', [String(id)]),
        clearFavicon: async () => {},
        // Favorites import (F30). The file is chosen and parsed here; native
        // merges it, as it does a detected browser's Favorites.
        import: async () => {
          const picked = await window.BlancBookmarkFile.pick();
          return picked.entries ? call('sheetImportEntries', [picked.entries]) : picked;
        },
        browserSources: () => call('sheetBrowserSources'),
        importBrowser: (id) => call('sheetImportBrowser', [String(id ?? '')]),
        setFolder: (id, folder) => call('sheetFavoriteFolder', [String(id), typeof folder === 'string' ? folder : '']),
        renameFolder: (oldName, newName) => call('sheetFolderRename', [String(oldName), String(newName)]),
        removeFolder: (name) => call('sheetFolderRemove', [String(name)]),
      },
      pins: {
        list: () => call('sheetPins'),
        pin: (url, title) => call('sheetPin', [String(url), typeof title === 'string' ? title : '']),
        unpin: (url) => call('sheetUnpin', [String(url)]),
        // The page redraws after its own pin changes; others reach it on reopen.
        onChanged: () => () => {},
      },
    };
    if (page === 'history') return { surface,
      history: {
        // Shipping's listHistory({query, limit}): substring matches on the
        // address or title, newest visit first.
        list: async (options = {}) => {
          const query = String(options?.query ?? '').trim().toLowerCase();
          const limit = Number.isInteger(options?.limit) ? Math.max(0, options.limit) : 500;
          const visits = await call('sheetHistory');
          return (query ? visits.filter(visit => visit.url.toLowerCase().includes(query) ||
            visit.title.toLowerCase().includes(query)) : visits).slice(0, limit);
        },
        remove: (url, visitedAt) => call('sheetHistoryRemove', [String(url), Number(visitedAt)]),
        clear: () => call('clearHistory'),
      },
      archive: {
        list: async (options = {}) => {
          const query = String(options?.query ?? '').trim().toLowerCase();
          const rows = await call('archiveList');
          return query ? rows.filter(row => row.title.toLowerCase().includes(query) || row.url.toLowerCase().includes(query)) : rows;
        },
        restore: async id => { const result = await call('archiveRestore', [String(id)]); await refresh(); return result; },
        forget: id => call('archiveForget', [String(id)]),
        clear: () => call('archiveClear'),
      },
    };
    if (page === 'downloads') return { surface,
      downloads: {
        list: () => call('sheetDownloads'),
        ...Object.fromEntries(['cancel', 'resume', 'retry', 'open', 'show'].map(action =>
          [action, (id) => call('sheetDownload', [String(id), action])])),
        clearFinished: () => call('sheetDownloadsClear'),
      },
    };
    return null;
  }

  // Native handlers take the integer SessionID; anything else fails their
  // "real tab ID" check instead of matching by accident.
  function nativeId(id) {
    const n = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
    return Number.isInteger(n) ? n : -1;
  }

  // The stored bang settings as last read or pushed (Settings, a bang used,
  // history cleared), so a typed bang resolves in the same turn as Enter.
  let bangState = null;
  const loadBangs = () => typed('bangs', []).then(state => (bangState = state));
  // A typed bang goes to its site, resolved here once more from the stored
  // settings so the hint row and Enter cannot disagree (shipping's
  // bang-resolution.js resolveTyped). A private tab leaves no recent. Null
  // when bangs are off or the text has no known bang.
  function openTypedBang(id, text) {
    const bang = bangState?.enabled && window.Bangs && window.BangsCatalog
      ? window.Bangs.resolveBang(String(text ?? ''), window.BangsCatalog, bangState.custom) : null;
    if (!bang) return null;
    const tab = snapshot?.tabs.find(t => String(t.id) === String(id));
    if (tab && !tab.private) request('recordRecentBang', [bang.code]).catch(() => {});
    return typed('navigate', [String(nativeId(id)), bang.url]).then(async (result) => {
      await refresh();
      return result;
    });
  }

  let railActivationSerial = 0;
  const implemented = {
    platform: 'darwin',
    startPinMenuState: id => request('startPinMenuState', [nativeId(id)]),
    toggleStartPin: (id, expectedUrl) => request('toggleStartPin', [nativeId(id), expectedUrl]),
    toggleAdblock: async () => { const tab = snapshot?.tabs.find(t => t.id === snapshot.activeTabId); const value = await request('toggleAdblock', [tab?.committedUrl ?? '']); await refresh(); return value; },
    allowAdsOnActiveSite: async () => { const tab = snapshot?.tabs.find(t => t.id === snapshot.activeTabId); const value = await request('allowAdsOnActiveSite', [tab?.committedUrl ?? '']); await refresh(); return value; },
    openCapturePopover: async () => {
      if (opened && overlayMode === 'capture') return close(false);
      await refresh();
      if (!snapshot?.capturePopover?.rows.length) return false;
      await show(undefined, 'capture', 'capture');
      return true;
    },
    captureStop: async id => { await request('captureStop', [nativeId(id)]); await refresh(); },
    captureFocus: async id => {
      await request('switchTab', [nativeId(id)]); await close(false);
      await request('focusPage'); await refresh();
    },
    openShieldPopover: async anchor => {
      const trigger = anchor?.trigger === 'insecure' ? 'insecure' : 'shield';
      if (pendingShieldOpen) {
        const same = pendingShieldOpen.trigger === trigger;
        invalidateFindShow();
        if (same) return;
      }
      if (opened && overlayMode === 'shield') {
        if (shieldTrigger === trigger) return close(false);
        shieldTrigger = trigger;
        emit('onIslandState', { mode: 'shield', trigger });
        reportGeometry();
        return;
      }
      invalidateFindShow();
      const token = { trigger, epoch: findShowEpoch };
      pendingShieldOpen = token;
      try {
        await refresh();
        if (pendingShieldOpen !== token || token.epoch !== findShowEpoch ||
            !snapshot?.shieldPopover) return;
        await show(undefined, 'shield', trigger);
      } finally {
        if (pendingShieldOpen === token) pendingShieldOpen = null;
      }
    },
    setTabLayout: async value => { layout = value === 'vertical' ? 'vertical' : 'island'; await applyRail(true); return layout; },
    setVerticalTabsWidth: async width => { railWidth = Number(width) || 248; return applyRail(true); },
    previewVerticalTabsWidth: async width => { railWidth = Number(width) || 248; return applyRail(); },
    activateTabFromRail: async id => {
      railActivationSerial++; clearSelection();
      await close(false); await hideSheet(false);
      await request('switchTab', [nativeId(id)]); await request('focusPage'); await refresh();
    },
    toggleSiteMute: async id => { const result = await request('toggleSiteMute', [nativeId(id)]); await refresh(); return result; },
    moveClosedSection: async before => { closedBefore = before == null ? '' : String(before); closedBelow = null; localStorage.setItem('blanc.prototype.closedBefore', closedBefore); await refresh(); return true; },
    showTooltip: ({ text, anchor, privateTheme }) => {
      if (opened || extensionsOpened || !anchor || !Number.isFinite(anchor.x)) return;
      tooltip.textContent = String(text).slice(0, 180);
      tooltip.hidden = false;
      tooltip.dataset.private = String(privateTheme === true);
      const width = tooltip.getBoundingClientRect().width;
      tooltip.style.left = `${Math.max(4, Math.min(innerWidth - width - 4, anchor.x + anchor.width / 2 - width / 2))}px`;
      tooltip.style.top = `${Math.max(0, Math.min(innerHeight - tooltip.offsetHeight, anchor.y + anchor.height + 4))}px`;
    },
    hideTooltip: () => { tooltip.hidden = true; },
    bangs: loadBangs,
    bangIcons: hosts => typed('bangIcons', [Array.isArray(hosts) ? hosts.map(String) : []]),
    getAllTabs: async () => snapshot ?? request('snapshot'),
    keepMiniWindow: async () => {const kept = await request('keepMiniWindow'); await refresh(); await announceSpaces(); return kept;},
    createTab: async (url, options) => {
      // As in shipping, the address is loaded as given (the browser refuses
      // what a tab may not open); typed text goes through navigate instead.
      // A private tab (/private, ⌘⇧N) opens in this window on the private
      // profile (D1).
      await request('createTab', [url ? String(url) : 'chrome://newtab/', options?.private === true]);
      await refresh();
      if (options?.focusAddress) await show('');
    },
    // The navigation group runs on the typed interface (browser-api.js).
    // Typed text is an address, a search or an OS hand-off, decided as in
    // shipping (address-input.js); the profile's engine runs searches.
    navigate: async (id, value) => {
      const bang = openTypedBang(id, value);
      if (bang) return bang;
      // Shipping's utility pages by their blanc:// names (isUtilityUrl) open
      // in the sheet, never in the tab: blanc://settings[/section],
      // blanc://downloads, blanc://bookmarks (Favorites), blanc://history.
      const utility = /^blanc:\/\/(settings|downloads|bookmarks|favorites|history)(?:\/([a-z-]*))?\/?$/i.exec(String(value).trim());
      if (utility) {
        const page = utility[1].toLowerCase() === 'favorites' ? 'bookmarks' : utility[1].toLowerCase();
        const section = page === 'settings' && SETTINGS_SECTIONS.has(utility[2] ?? '') ? utility[2] : undefined;
        await showSheet(page, section);
        return { status: 'sheet' };
      }
      // A shared Mahjong deal (blanc://mahjong/?deal=...) opens the game.
      const deal = /^blanc:\/\/mahjong\/(\?[^#\s]*)?$/i.exec(String(value).trim());
      if (deal) {
        const result = await typed('navigate', [String(nativeId(id)), `chrome://blanc-prototype/pages/mahjong.html${deal[1] ?? ''}`]);
        await refresh();
        return result;
      }
      const meaning = window.BlancAddressInput.interpret(value);
      // A hand-off goes to the browser as typed; it classifies the text again
      // and opens the app itself (V9). Nothing loads in the tab.
      if (meaning.kind === 'handoff') return typed('navigate', [String(nativeId(id)), meaning.url]);
      const result = meaning.kind === 'search'
        ? await typed('search', [String(nativeId(id)), meaning.query])
        : await typed('navigate', [String(nativeId(id)), meaning.url]);
      await refresh();
      return meaning.kind === 'search' ? undefined : result;
    },
    search: async (id, query) => {
      // A search row's text can carry a bang too, as in shipping.
      const bang = openTypedBang(id, query);
      if (bang) return bang.then(() => undefined);
      const result = await typed('search', [String(nativeId(id)), query]);
      await refresh();
      return result;
    },
    openPage: async (name, section) => {
      // Settings opens in the sheet (S1.7): Chromium's chrome://settings,
      // at the section asked for (shipping's Settings and Shield's Blocking).
      if (name === 'settings') return showSheet('settings', section);
      // Electron names Favorites `bookmarks` internally. Utility pages open
      // in the sheet; Extensions is Chromium's own page.
      if (SHEET_PAGES.includes(name)) return showSheet(name, section);
      if (name !== 'extensions') throw new Error('Use Chromium’s native controls for this page in the prototype.');
      await request('createTab', ['chrome://extensions/']);
    },
    // Favorites and history are Chromium's own BookmarkModel and
    // HistoryService, shaped like Electron's records; see contract.json.
    // The copied hearts enable on any http(s) page without checking
    // `private`; like Electron's main, a private tab is a silent no-op here
    // (prototype.css also hides them under the private theme). The native
    // guard stays as defense in depth.
    toggleBookmark: async (id = snapshot?.activeTabId) => {
      const tab = snapshot?.tabs.find(tab => tab.id === String(id));
      if (!tab || tab.private) return;
      try {
        const result = await request('toggleBookmark', [nativeId(tab.id)]);
        await refresh();
        return result;
      } catch (error) {
        notice(error.message);
        throw error;
      }
    },
    saveFavorite: async (folder) => {
      const tab = snapshot?.tabs.find(tab => tab.id === snapshot.activeTabId);
      if (!tab || tab.private) return;
      try {
        const result = await request('saveFavorite', [nativeId(tab.id), typeof folder === 'string' ? folder : '']);
        await refresh();
        return result;
      } catch (error) {
        notice(error.message);
        throw error;
      }
    },
    // Pin, mute and reorder are TabStripModel operations; the snapshot's
    // pinned/muted/audible fields feed the copied rows and pill unchanged.
    toggleTabPinned: async (id) => {
      const pinned = await request('togglePinned', [nativeId(id)]);
      await refresh();
      return pinned;
    },
    toggleTabMuted: async (id) => {
      const muted = await request('toggleMuted', [nativeId(id)]);
      await refresh();
      return muted;
    },
    moveTab: async (id, target) => {
      // Drag intents carry DOM dataset strings for both tab ids; group ids are
      // Chromium's TabGroupId strings straight from the snapshot.
      const groupId = typeof target?.groupId === 'string' ? target.groupId : null;
      const beforeId = target?.beforeId == null ? null : nativeId(target.beforeId);
      const moved = await request('moveTab', [nativeId(id), groupId, beforeId]);
      await refresh();
      return moved === true;
    },
    // Named groups are Chromium tab groups (TabStripModel), shaped as Blanc's
    // {id, name, collapsed}; names are lowercase labels and colour is unused.
    groupTabByName: async (id, name) => {
      await request('groupTabByName', [nativeId(id), String(name ?? '')]);
      await refresh();
    },
    // A selection's "New Group…": each selected tab joins the named group.
    groupTabsByName: async (ids, name) => {
      const revision = selectionRevision;
      const result = await request('batchTabsAction', [(ids ?? []).map(nativeId), 'group-name', String(name ?? '')]);
      if (result && selectionRevision === revision) clearSelection(false);
      if (!result) glanceSay('tabsSelection.failed');
      await refresh();
      return result;
    },
    // ---- Slash commands (F7) on the fork's native operations ----
    // /rename: Blanc's tab name (an empty name hands back the page title).
    renameTab: async (id, name) => {
      const renamed = await request('renameTab', [nativeId(id), String(name ?? '')]);
      await refresh();
      return renamed;
    },
    // Groups (F3), as shipping's: Rename Group… opens the command bar on the
    // group's name as a name prompt; New group on "/group " bound to the
    // selected tabs, else the active one; the side list's group menu is the
    // overlay's 'group-menu' mode at the header it names.
    beginRenameGroup: async (groupId) => {
      const group = snapshot?.groups?.find(item => item.id === groupId);
      if (group) await show(group.name, 'panel', null, { renameGroupId: group.id });
    },
    beginNewGroupForTab: async id => {
      if (!snapshot?.tabs.some(tab => String(tab.id) === String(id))) return;
      await show('/group ', 'panel', null, { beginGroupTabId: String(id) });
    },
    beginNewGroup: async () => {
      const ids = [...tabSelection.selectedTabIds];
      await show('/group ', 'panel', null, ids.length > 1 ? { beginGroupTabIds: ids } : { beginGroupTabId: snapshot?.activeTabId });
    },
    openGroupMenu: async (groupId, anchor) => {
      const inside = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;
      if (!snapshot?.groups?.some(item => item.id === groupId) || !anchor ||
          !inside(anchor.right, innerWidth) || !inside(anchor.top, innerHeight) || !inside(anchor.bottom, innerHeight)) return;
      await show(undefined, 'group-menu', null, { groupId, anchor: { right: anchor.right, top: anchor.top, bottom: anchor.bottom } });
    },
    // Duplicate (F2): native copies the tab and its history, and refuses a
    // page-opened tab whose opener's sandbox a copy could not carry.
    setPinnedHome: id => request('setPinnedHome', [nativeId(id)]),
    returnPinnedHome: id => request('returnPinnedHome', [nativeId(id)]),
    duplicateTab: async (id) => {
      const copied = await request('duplicateTab', [nativeId(id)]);
      await refresh();
      return copied;
    },
    // The tab menu's Rename Tab…: the command bar opens on "/rename <label>"
    // bound to that tab, as shipping's beginRenameTab.
    beginRenameTab: async (id) => {
      const tab = snapshot?.tabs.find(item => String(item.id) === String(id));
      if (tab) await show(`/rename ${tab.title || ''}`, 'panel', null, { renameTabId: tab.id });
    },
    quietTab: id => request('quietTab', [nativeId(id)]),
    // /sleep: quiet every eligible background tab of this window now, as
    // shipping's sleepBackgroundTabsNow. Native's safety check decides each.
    sleepBackgroundTabs: async () => {
      const visibleSplit = (snapshot?.splits ?? []).find(split => split.tabIds.includes(snapshot.activeTabId));
      const visible = new Set([snapshot?.activeTabId, snapshot?.glanceTabId, ...(visibleSplit?.tabIds ?? [])]
        .filter(id => id != null).map(String));
      const quieted = [];
      for (const tab of snapshot?.tabs ?? []) {
        if (visible.has(String(tab.id)) || tab.asleep) continue;
        if (await request('quietCandidate', [nativeId(tab.id)]).catch(() => false) === true) quieted.push(tab.id);
      }
      if (quieted.length) await refresh();
      return quieted;
    },
    // /copy and /copy clean: the current page's address (cleaned by
    // shipping's clean-link.js), then the pill's "copied" notice. Web and
    // file pages only, as shipping's isCopyable.
    copyActiveLink: async (clean) => {
      const tab = snapshot?.tabs.find(item => item.id === snapshot.activeTabId);
      if (!tab || !/^(https?|file):/i.test(tab.url ?? '')) return false;
      const text = clean === true ? window.BlancCleanLink.cleanLinkForCopy(tab.url) : tab.url;
      const copied = await request('copyTabLink', [nativeId(tab.id), tab.url, text]).catch(() => false);
      if (copied === true) emit('onPillNotice', clean === true ? 'clean-link-copied' : 'link-copied');
      return copied === true;
    },
    // /reader: Chromium's Reading Mode, toggled for this window (owner,
    // 2026-11-02), not shipping's in-page reader.
    toggleReaderMode: () => request('previewPageCommand', ['readingMode']),
    // /invite: shipping's prefilled email (invite-friend.js) in the person's
    // mail app, or, with none, the invite on the clipboard ('copied').
    inviteFriend: async () => {
      const t = strip.contentWindow?.blancI18n?.t;
      if (!t) throw new Error('The Island strings are not loaded yet.');
      const message = window.BlancInviteFriend.inviteMessage(t);
      return request('inviteFriend', [window.BlancInviteFriend.inviteMailto(message), `${message.subject}\n\n${message.body}`]);
    },
    sendTabToDevice: (id, to) => request('sendTabToDevice', [nativeId(id), String(to)]),
    setTabGroup: async (id, groupId) => {
      await request('setTabGroup', [nativeId(id), typeof groupId === 'string' ? groupId : null]);
      await refresh();
    },
    reorderGroup: async (groupId, beforeGroupId) => {
      const moved = await request('reorderGroup',
        [String(groupId), typeof beforeGroupId === 'string' ? beforeGroupId : null]);
      await refresh();
      return moved === true;
    },
    moveTabToNewWindow: async (id) => {
      const runtime = await request('moveTabToNewWindow', [nativeId(id)]);
      await refresh();
      return runtime;
    },
    ...Object.fromEntries(['focusGroup', 'toggleGroupCollapsed', 'closeGroup', 'newTabInGroup', 'ungroupGroup', 'moveGroupToNewWindow'].map((method) =>
      [method, async (groupId) => { await request(method, [String(groupId)]); await refresh(); }])),
    ...Object.fromEntries(['renameGroup', 'setGroupColor'].map(method =>
      [method, async (groupId, value) => {
        const result = await request(method, [String(groupId), value ?? null]);
        await refresh();
        return result;
      }])),
    // Destructive and history-only, like Electron's /clear; main refuses it
    // from a private window. Test on a disposable profile only.
    clearHistory: () => request('clearHistory'),
    listFavorites: () => request('listFavorites'),
    listHistory: (options) => {
      const limit = Number.isInteger(options?.limit) ? options.limit : 300;
      return request('listHistory', [Math.min(300, Math.max(1, limit))]);
    },
    listRemoteTabs: () => request('syncSurface', ['listRemoteDevices', []]),
    beginRenameDevice: async id => {
      const devices = await request('syncSurface', ['listRemoteDevices', []]);
      const device = devices.find(d => d.deviceId === id);
      if (device) await show(device.name, 'panel', null, {renameDeviceId: id});
    },
    renameDevice: async (id, name) => {
      const result = await request('syncSurface', ['renameRemoteDevice', [String(id), String(name ?? '')]]);
      await refreshSyncSurfaces(); return result;
    },
    // Internal migration probes; no user-facing Glance acceptance yet.
    createSplit: async (first, second) => {
      const result = await request('createSplit', [nativeId(first), nativeId(second)]);
      if (!result) throw new Error('These tabs can no longer be split.');
      await close(); await refresh(); return result;
    },
    resizeSplit: async (target, indexOrRatio, axis, point) => {
      // Preserve the existing pair API while accepting the shipping renderer's
      // divider coordinates. Resolve identity against a fresh native snapshot.
      if (Array.isArray(target)) return request('resizeSplit', [...target.map(nativeId), indexOrRatio]);
      await refresh();
      const split = visibleSplit();
      const geometry = snapshot?.splitGeometry;
      if (!split || split.id !== target || split.tabIds.length !== 2 ||
          geometry?.mode !== 'columns' || indexOrRatio !== 0 || axis !== 'x' ||
          !Number.isFinite(point?.x) || !Number.isFinite(point?.y) ||
          !Number.isFinite(geometry.originX) || !(geometry.usableWidth > 0)) return false;
      const ratio = (point.x - geometry.originX) / geometry.usableWidth;
      const result = await request('resizeSplit', [...split.tabIds.map(nativeId), ratio]);
      await refresh();
      return result;
    },
    resetSplit: async (splitId) => {
      await refresh();
      const split = visibleSplit();
      if (!split || split.id !== splitId || split.tabIds.length !== 2 || snapshot.splitGeometry?.mode !== 'columns') return false;
      const result = await request('resizeSplit', [...split.tabIds.map(nativeId), 0.5]);
      await refresh();
      return result;
    },
    removeFromSplit: async id => { await request('removeFromSplit', [nativeId(id)]); await refresh(); },
    previewSplitPair: (main, reference) => request('previewSplitPair', [nativeId(main), nativeId(reference)]),
    selectedTabsMenuState: ids => request('batchTabsMenuState', [ids.map(nativeId)]),
    prepareTabMenu: async id => {
      await refresh();
      if (!snapshot?.tabs.some(tab => tab.id === id)) return false;
      if (!tabSelection.selectedTabIds.includes(id)) {
        ++selectionRevision;
        tabSelection = { ...BlancTabSelection.selectionState([id], id, selectionTabs()), contextMenu: true };
        snapshot.contextMenuSelection = true;
        snapshot.selectedTabIds = [...tabSelection.selectedTabIds];
        emit('onTabsUpdated', snapshot);
      }
      return true;
    },
    selectTab: async (id, mode) => {
      await refresh();
      if (!snapshot) return null;
      const { focusId, ...next } = BlancTabSelection.selectTabs(tabSelection, selectionTabs(), snapshot.groups ?? [], snapshot.activeTabId, id, mode);
      ++selectionRevision;
      tabSelection = next;
      snapshot.selectedTabIds = [...next.selectedTabIds];
      snapshot.contextMenuSelection = false;
      emit('onTabsUpdated', snapshot);
      return focusId;
    },
    runSelectedTabsAction: async (action, options = {}) => {
      await refresh();
      const ids = [...(options.selectedTabIds ?? tabSelection.selectedTabIds)];
      if (!ids.length || ids.length !== tabSelection.selectedTabIds.length ||
          ids.some(id => !tabSelection.selectedTabIds.includes(id))) {
        glanceSay('tabsSelection.failed');
        return false;
      }
      const revision = selectionRevision;
      if (action === 'batch-group-new' || action === 'batch-space-new') {
        const rules = await request('batchTabsMenuState', [ids.map(nativeId)]);
        if (!(action === 'batch-group-new' ? rules.canGroup : rules.canPlace)) { glanceSay('tabsSelection.failed'); return false; }
        if (selectionRevision !== revision) { glanceSay('tabsSelection.failed'); return false; }
        if (action === 'batch-group-new') await show('/group ', 'panel', null, { beginGroupTabIds: ids });
        else await show('', 'spaces', null, { newSpaceTabIds: ids });
        return true;
      }
      if (action === 'batch-space-move') return moveTabsToSpace(ids, options.workspaceId);
      if (action === 'batch-quiet' || action === 'batch-reload') {
        const done = [];
        for (const id of ids) {
          try {
            if (action === 'batch-quiet') {
              if (await request('quietCandidate', [nativeId(id)]) === true) done.push(id);
            } else {
              const tab = snapshot.tabs.find(tab => tab.id === id);
              if (!tab) continue;
              const result = tab.asleep ? await request('wakeTab', [nativeId(id)]) : await typed('reload', [id]);
              if (result !== false) done.push(id);
            }
          } catch (error) { notice(error.message); }
        }
        await refresh();
        if (selectionRevision === revision) retainSelection(ids.filter(id => !done.includes(id)));
        glanceSay(action === 'batch-quiet' ? 'tabsSelection.quieted' : 'tabsSelection.reloaded', { count: done.length, total: ids.length });
        return done.length === ids.length;
      }
      const nativeAction = { 'batch-close': 'close', 'batch-new-window': 'new-window', 'batch-copy': 'copy', 'batch-pin': 'pin', 'batch-mute': 'mute', 'batch-group-move': 'group-move', 'batch-group-none': 'group-none' }[action];
      if (!nativeAction) throw new Error(`Batch action is not implemented: ${action}`);
      const nativeResult = await request('batchTabsAction', [ids.map(nativeId), nativeAction, options.groupId ?? null]);
      // Close acknowledges durable history with a void success; failures reject.
      const result = nativeAction === 'close' ? nativeResult !== false : nativeResult;
      if (result && selectionRevision === revision) clearSelection(false);
      if (!result) glanceSay('tabsSelection.failed');
      await refresh();
      return result;
    },
    keepGlanceAsSplit: async () => {
      const [main, reference] = [glanceTitle(glance.mainId), glanceTitle(snapshot?.glanceTabId)];
      glance.closing = true;
      const result = await request('keepGlanceAsSplit');
      await refresh();
      glance.closing = false;
      if (result) {
        glanceSay('split.made', { first: main, second: reference });
        if (result.movedIntoGroup) glanceSay('split.groupMoveInto', { title: reference, group: result.movedIntoGroup });
      }
      return result;
    },
    previewGlancePair: (main, reference) => request('previewGlancePair', [nativeId(main), nativeId(reference)]),
    setGlanceTab: async id => {
      await refresh();
      // A quiet tab loads first; a dismissal or a newer choice ends the wait.
      const epoch = ++glance.requestEpoch;
      if (snapshot?.tabs.find(tab => tab.id === String(id))?.asleep) {
        await request('wakeTab', [nativeId(id)]);
        for (let i = 0; i < 300 && epoch === glance.requestEpoch; i++) {
          await new Promise(resolve => setTimeout(resolve, 50));
          await refresh();
          const tab = snapshot?.tabs.find(item => item.id === String(id));
          if (!tab) return false;
          if (!tab.asleep && !tab.isLoading) break;
        }
        if (epoch !== glance.requestEpoch) {
          if (snapshot?.glanceTabId !== String(id)) glanceSay('glance.status.cancelled');
          return false;
        }
      }
      // A pane of the shown two-pane split leaves it and floats over the other
      // pane, as shipping's openTabMenuGlance does (F53); a larger split's
      // panes can't.
      const shown = snapshot?.splits?.find(s => s.tabIds.includes(snapshot.activeTabId));
      if (shown?.tabIds.includes(String(id))) {
        if (shown.tabIds.length !== 2) return false;
        const other = shown.tabIds.find(tabId => tabId !== String(id));
        await request('removeFromSplit', [nativeId(id)]); await request('switchTab', [nativeId(other)]); await refresh();
      }
      const opened = await request('previewGlancePair', [nativeId(snapshot.activeTabId), nativeId(id)]);
      await close(); await refresh();
      if (opened === true) glanceSay('glance.status.opened', { title: glanceTitle(String(id)) });
      return opened === true;
    },
    closeGlance: async () => {
      if (overlayMode === 'glance') await close();
      glance.closing = true;
      await request('closeGlance'); await refresh();
      glance.closing = false;
      glanceSay('glance.status.closed');
    },
    // Open Link in Glance: the link becomes a background tab, then the Glance.
    openLinkInGlance: async url => {
      const open = snapshot.glanceTabId != null;
      const main = open ? glance.mainId : snapshot.activeTabId;
      const isPrivate = !!snapshot.tabs.find(tab => tab.id === main)?.private;
      if (open) { glance.closing = true; await request('closeGlance'); glance.closing = false; }
      const created = await request('createTab', [String(url), isPrivate]);
      if (created?.tabId == null) return false;
      await request('switchTab', [nativeId(main)]);
      return api.setGlanceTab(String(created.tabId));
    },
    openGlanceAsTab: async () => {
      const title = glanceTitle(snapshot?.glanceTabId);
      glance.closing = true;
      await request('openGlanceAsTab'); await refresh();
      glance.closing = false;
      glanceSay('glance.status.openedAsTab', { title });
    },
    openGlancePicker: async text => show(text ?? '', 'glance', null, snapshot?.glanceTabId != null ? 'change' : 'open'),
    focusGlancePane: async id => { const moved = await request('focusGlancePane', [nativeId(id)]); await refresh(); return moved; },
    moveGlanceCard: async input => changeGlanceCard(input, (frame, area) =>
      GlanceCard.moveCardFrame(frame, finiteOr0(input.dx), finiteOr0(input.dy), area)),
    resizeGlanceCard: async input => changeGlanceCard(input, (frame, area) => (GlanceCard.EDGES.includes(input.edge)
      ? GlanceCard.resizeCardFrame(frame, input.edge, finiteOr0(input.dx), finiteOr0(input.dy), area) : frame)),
    resetGlanceCard: async input => {
      if (snapshot?.glanceTabId == null || Number(input?.generation) !== glance.generation) return null;
      clearTimeout(glance.timer); glance.timer = null; glance.pending = undefined;
      snapshot.glanceFrame = null;
      await request('glanceSaveFrame', [null]);
      publishGlance();
      return glanceCardFrameNow();
    },
    previewGlanceClose: id => request('previewGlanceClose', [nativeId(id)]),
    previewPageCommand: command => request('previewPageCommand', [command]),
    previewSpaceRecover: () => request('previewSpaceRecover'),
    previewSpaceSave: name => request('previewSpaceSave', [name]),
    previewSpaceList: () => request('previewSpaceList'),
    previewSpaceOpen: name => request('previewSpaceOpen', [name]),
    listWorkspaces: async () => { await refresh(); return spacesPayload(); },
    saveWorkspaceAs: (name, identity) => saveSpaceAs(name, identity),
    openWorkspace: (id, options) => openSpace(id, options),
    createBlankWorkspace: (name, options) => createBlankSpace(name, options),
    updateWorkspace: (id, patch) => updateSpace(id, patch),
    moveWorkspaceTo: (id, index) => moveSpaceTo(id, index),
    removeWorkspace: id => removeSpace(id),
    undoRemoveWorkspace: id => restoreSpace(id),
    restoreWorkspace: id => restoreSpace(id),
    forgetWorkspace: id => forgetSpace(id),
    moveTabToSpace: (tabId, id) => (lastSpaceMove = moveTabToSpace(tabId, id)),
    // The last menu move's result, for the harness (shipping returns it from the click).
    lastSpaceMove: () => lastSpaceMove,
    createSpaceWithLink,
    createSpaceWithTab: (name, identity, tabId) => createSpaceWithTab(name, identity, tabId),
    createSpaceWithTabs: (name, identity, ids) => createSpaceWithTabs(name, identity, ids),
    beginNewSpaceForGroup: groupId => {
      const group = snapshot.groups.find(group => group.id === groupId);
      if (!group) return false;
      const ids = snapshot.tabs.filter(tab => tab.groupId === group.id).map(tab => String(tab.id));
      if (!ids.length) return false;
      show('', 'spaces', null, { newSpaceTabIds: ids, newSpaceGroupId: group.id, newSpaceGroupName: group.name });
      return true;
    },
    beginNewSpaceForTab: tabId => show('', 'spaces', null, { newSpaceTabId: String(tabId) }),
    openSpacesMenu: anchor => {
      if (overlayMode === 'spaces') { close(false); return; }
      if (anchor?.closing === true) return;
      show('', 'spaces');
    },
    archiveList: () => request('archiveList'),
    archiveNotice: () => request('archiveNotice'),
    archiveRestore: async id => { const result = await request('archiveRestore', [String(id)]); await close(); await refresh(); return result; },
    archiveForget: id => request('archiveForget', [String(id)]),
    archiveClear: () => request('archiveClear'),
    archiveNoticeDone: async action => {
      const result = await request('archiveNoticeDone');
      if (action === 'view') await showSheet('history', 'archived');
      return result;
    },
    listSentToThisDevice: () => request('syncSurface', ['listSentToThisDevice', []]),
    listSendTargets: () => request('syncSurface', ['listSendTargets', []]),
    dismissSentItem: async id => {
      const item = await request('syncSurface', ['hideSentItem', [String(id)]]);
      await refreshSyncSurfaces(); return !!item;
    },
    openSentItem: async id => {
      const item = await request('syncSurface', ['hideSentItem', [String(id)]]);
      if (!item || !/^https?:\/\//i.test(item.url)) return false;
      await request('createTab', [item.url]); await close(); await refresh();
      await refreshSyncSurfaces(); return true;
    },
    searchSuggestions: query => typed('searchSuggestions', [String(query)]),
    cycleTheme: theme => typed('cycleTheme', [typeof theme === 'string' ? theme : null]),
    routeActiveSite: async mode => {
      const result = await typed('routeActiveSite', [String(mode)]);
      emit('onPillNotice', result.ok ? (result.on ? 'route-on' : 'route-off') : result.error === 'limit' ? 'route-limit' : 'route-unavailable');
      await refresh(); return result;
    },
    openFindBar,
    findInPage: (id, query, options = {}) => request('find',
      [nativeId(id), String(query), options.forward !== false, options.findNext !== false]),
    // Teardown can race navigation/tab closure; never search a replacement tab.
    stopFindInPage: async (id) => {
      emit('onFindResult', { activeMatchOrdinal: 0, matches: 0 });
      return request('stopFind', [nativeId(id)]).catch(() => false);
    },
    openIsland: () => show(),
    openIslandTyping: (character) => show(character),
    openIslandCommands: () => show('/'),
    // Cancelling the Change picker hands focus back to its control on the card.
    closeOverlay: async reason => {
      if (reason === 'escape' && overlayDragging) return false;
      if (overlayMode === 'spaces' && (reason === 'escape' || reason === 'cancel'))
        return close(false, 'spaces');
      if (overlayMode === 'glance' && reason !== 'selected') {
        glance.requestEpoch += 1;
        const epoch = findShowEpoch;
        // The reference can close behind this picker before the next poll.
        // Only a current native pair can own the Change control's focus.
        await refresh();
        if (epoch !== findShowEpoch || overlayMode !== 'glance') return;
        if (overlayPurpose === 'change' && snapshot?.glanceTabId != null) {
          await close(false);
          emit('onIslandState', { mode: null, trigger: null, restoreTrigger: 'glance-change' });
          await focusGlanceCard();
          glanceCardFrame.contentDocument.getElementById('glanceChange')?.focus();
          return;
        }
      }
      return close(reason);
    },
    reportIslandRect: (rect) => { pillRect = rect; reportGeometry(); syncFloat(); },
    reportChromeLayout: () => {},
    reportPanelDrawn: () => emit('onIslandCovered'),
    // Shared panel cleanup runs even though this prototype has no workspace actions.
    cancelWorkspaceAction: () => { spacesDecision = null; },
    setWorkspaceSwitcherOpen: () => {},
    // Only apiForDocument grants this to the current overlay document.
    setOverlayDragState: () => false,
    acknowledgeDownloads: () => request('acknowledgeDownloads').then(refresh),
    respondPermission,
    // Site controls' Stop allowing on a page loaded past a certificate warning.
    siteInfoForgetCertificateException: async () => {
      const result = await request('forgetCertificateException', [nativeId(snapshot?.activeTabId)]);
      await refresh();
      return result;
    },
    // The same for a named tab, with or without its reload (test hooks).
    forgetCertificateExceptionInTab: async (id, reload = true) => {
      const result = await request('forgetCertificateException', [nativeId(id), reload !== false]);
      await refresh();
      return result;
    },
  };

  for (const method of ['reopenClosedTab', 'reopenClosedEntry', 'forgetClosedEntry', 'clearClosedEntries']) {
    implemented[method] = async (...args) => {
      const entry = method === 'reopenClosedTab' ? snapshot?.closed?.at(-1)
        : snapshot?.closed?.find(row => row.id === String(args[0]));
      let result;
      if (entry?.id.startsWith('sync:') && method !== 'clearClosedEntries') {
        const item = await request('syncSurface', ['hideClosedFromSync', [entry.syncId]]);
        result = !!item;
        if (item && method !== 'forgetClosedEntry' && /^https?:\/\//i.test(item.url))
          await request('createTab', [item.url]);
      } else {
        result = await request(method, args.map(String));
        if (result && entry?.syncId) await request('syncSurface', ['hideClosedFromSync', [entry.syncId]]);
      }
      if (method === 'clearClosedEntries') await request('syncSurface', ['clearClosedFromSync', []]);
      if (entry?.syncId || method === 'clearClosedEntries') await refreshSyncSurfaces();
      await refresh();
      return result;
    };
  }

  for (const method of ['switchTab', 'closeTab', 'closeSplit', 'goBack', 'goForward', 'reload', 'stop', 'newTabBelow', 'closeAbove', 'closeBelow']) {
    implemented[method] = async (id) => {
      if (method === 'switchTab') clearSelection();
      const pageCommand = ['goBack', 'goForward', 'reload', 'stop'].includes(method);
      const routed = pageCommand && String(id) === snapshot?.activeTabId
        ? snapshot.focusedTabId ?? id : id;
      const result = pageCommand
        ? await typed(method, [String(nativeId(routed))])
        : await request(method, [nativeId(routed)]);
      await refresh();
      return pageCommand ? result : undefined;
    };
  }

  // Shipping members the Chromium builds leave to extensions (owner,
  // 2026-11-02): absent, so the Island offers neither /dark-site nor
  // /1password, as shipping does where a member is missing.
  const ABSENT = new Set(['toggleDarkSiteOnActiveSite', 'fillLoginFromOnePassword']);
  const api = new Proxy(implemented, {
    get(target, property) {
      if (property in target) return target[property];
      if (ABSENT.has(property)) return undefined;
      if (String(property).startsWith('on')) return (callback) => subscribe(property, callback);
      return () => {
        const error = new Error(`Prototype does not implement ${String(property)}. Use Chromium’s native controls.`);
        notice(error.message);
        return Promise.reject(error);
      };
    },
  });

  // Capture the iframe Document when its adapter starts. A callback from an
  // obsolete realm must not register itself as the new overlay document.
  function acceptOverlayDragState(ownerDocument, value) {
    if (typeof value !== 'boolean' || ownerDocument !== overlay.contentDocument) return false;
    if (value && (!opened || (overlayMode !== 'panel' && overlayMode !== 'palette'))) return false;
    overlayDragging = value;
    return true;
  }
  function apiForDocument(ownerDocument) {
    return new Proxy(api, {
      get(target, property) {
        if (property === 'setOverlayDragState') return value => acceptOverlayDragState(ownerDocument, value);
        if (property === 'showTooltip') return payload => {
          const frame = ownerDocument.defaultView?.frameElement;
          const rect = frame?.getBoundingClientRect();
          const stage = ownerDocument.getElementById('chrome')?.getBoundingClientRect();
          if (!rect || !payload?.anchor) return;
          return target.showTooltip({...payload, anchor: {...payload.anchor,
            x: payload.anchor.x + rect.x + (stage?.x ?? 0),
            y: payload.anchor.y + rect.y + (stage?.y ?? 0)}});
        };
        if (property === 'onOverlayShow')
          return callback => subscribe(property, callback, ownerDocument);
        return target[property];
      },
    });
  }

  // ---- Hover-open (F1-3…F1-21): shipping's state machine (generated
  // island-hover-open.js) over the strip's own pointer events. Shipping's
  // main process holds this state; in the fork the host does, as it holds the
  // overlay. Points are in the strip document, where hoverRect is measured.
  const HoverOpen = window.BlancIslandHoverOpen;
  const hover = { state: HoverOpen.initialHoverState(), timer: null, point: null, lastPoint: null };
  const hoverHooked = new WeakSet();
  function hoverEligible() {
    return snapshot?.islandHoverOpen === true && pillRect?.hoverCapable === true && !!pillRect?.hoverRect &&
      snapshot?.windowActive !== false && document.visibilityState === 'visible' &&
      !opened && !extensionsOpened && !paneMenu && !snapshot?.glanceTabId &&
      // A pending permission prompt blocks it (shipping's permissionViewAttached).
      !prompts.size;
  }
  function clearHoverTimer() { if (hover.timer) clearTimeout(hover.timer); hover.timer = null; }
  function hoverStepWith(event) {
    const next = HoverOpen.hoverStep(hover.state, event);
    hover.state = next.state;
    if (next.effect === 'cancel') clearHoverTimer();
    if (next.effect === 'start') {
      clearHoverTimer();
      hover.timer = setTimeout(() => {
        hover.timer = null;
        if (!hoverEligible() || !HoverOpen.pointInRect(hover.point, pillRect?.hoverRect)) {
          hoverStepWith({ type: 'ineligible' });
          return;
        }
        const fired = HoverOpen.hoverStep(hover.state, { type: 'fired' });
        hover.state = fired.state;
        // Marked so the overlay closes it again once the pointer leaves it
        // (hover-panel-leave.js).
        if (fired.effect === 'open') show(undefined, 'panel', null, { hoverOpened: true });
      }, HoverOpen.HOVER_OPEN_DWELL_MS);
    }
    return next;
  }
  function updateHover(point, { buttonsDown = false, sampled = false } = {}) {
    hover.point = point;
    return hoverStepWith({ type: 'move', inside: HoverOpen.pointInRect(point, pillRect?.hoverRect),
      eligible: hoverEligible(), buttonsDown, sampled });
  }
  // Shipping watches the strip and every page beneath it, so a move anywhere in
  // the window places the pointer. The host sees the strip, the overlay and its
  // own document (each move given in strip coordinates); a move over the page
  // reaches none of them, so the pointer leaving the host is the move outside.
  // Counting moves over an open panel changes nothing shipping would do: the
  // open Island is ineligible, and closing it samples the pointer as shipping
  // does.
  function hookHover(doc, frame) {
    if (!doc || hoverHooked.has(doc)) return;
    hoverHooked.add(doc);
    let last = null;
    doc.addEventListener('mousemove', (event) => {
      // Blink repeats a document's last pointer position as a move whenever
      // what lies under it changes (the Island swelling, a panel closing).
      // Shipping's main process sees only real input, so neither hover-open
      // nor the swell may take that repeat for a move: it would re-arm a
      // disarmed hover-open from a stale spot. A real move always moves.
      const at = `${event.screenX},${event.screenY}`;
      if (at === last) return;
      last = at;
      const from = frame?.getBoundingClientRect() ?? { x: 0, y: 0 };
      const to = strip.getBoundingClientRect();
      hover.lastPoint = { x: event.clientX + from.x - to.x, y: event.clientY + from.y - to.y };
      updateProximity(hover.lastPoint);
      updateHover(hover.lastPoint, { buttonsDown: event.buttons !== 0 });
    }, true);
    // A subframe's mouseleave does not bubble, and the root it targets may not
    // exist yet when the document is hooked, so the capture listener on the
    // document picks out its root.
    if (!frame) doc.addEventListener('mouseleave', (event) => {
      if (event.target !== doc.documentElement) return;
      hover.lastPoint = null;
      updateHover(null);
      // Native forwards page moves only near the Island; the pointer may land
      // anywhere, so the next page move must reach the swell wherever it is.
      armPagePointer();
    }, true);
  }
  hookHover(document, null);

  // ---- Island proximity: the resting pill swells as the cursor approaches
  // (shipping's renderer.js "Island proximity" over main.js
  // updateIslandProximity and the generated island-proximity.js). Shipping's
  // main process measures, because the cursor is usually over the page; here
  // native forwards the page's moves near the Island (blancIslandPointer, in
  // host coordinates, at most one a frame) and the host sees its own
  // documents' moves (hookHover). As in shipping, the strip and the floating
  // pill hear one number, only when it changes, and ease toward it themselves.
  const Proximity = window.BlancIslandProximity;
  let proximityK = 0;
  // Asleep whenever the pill isn't what you're looking at (shipping's
  // `awake`): another window is in front, or something is open over it.
  function proximityAwake() {
    return snapshot?.windowActive !== false && !opened && !extensionsOpened && !paneMenu;
  }
  function updateProximity(point) {
    const k = proximityAwake() && point && pillRect ? Proximity.closeness(point, pillRect) : 0;
    // Three decimals, as shipping: finer than the effect can render.
    const next = Number(k.toFixed(3));
    if (next === proximityK) return;
    proximityK = next;
    emit('onIslandProximity', { k: next });
  }
  window.blancIslandPointer = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const s = strip.getBoundingClientRect();
    updateProximity({ x: x - s.x, y: y - s.y });
  };
  // An open surface rested the pill (renderer.js restIsland), so the value it
  // last heard is no longer what it shows: the next one is always sent.
  function wakeProximity(point) {
    proximityK = null;
    updateProximity(point);
    armPagePointer();
  }
  // Native forwards page moves only near the Island and remembers only those.
  // Whenever the swell changes from anywhere else (the Island's own moves, a
  // sampled cursor), its next page move is sent wherever it lands, so a
  // swollen pill always hears that the cursor has gone.
  function armPagePointer() {
    request('armIslandPointer').catch(error => notice(error.message));
  }

  // Chromium's extension buttons are native views over the pill's slot, so
  // they cannot take its CSS transform. Native keeps them at the slot's
  // resting place (reportGeometry) and draws the swell as a transform of its
  // own: the slot's move and growth, measured each frame the pill changes.
  function restingRect(pill, element) {
    if (!pill.classList.contains('proximity-active')) return element.getBoundingClientRect();
    pill.classList.remove('proximity-active');
    const rect = element.getBoundingClientRect();
    pill.classList.add('proximity-active');
    return rect;
  }
  let swellSent = '1,0,0';
  function syncExtensionsSwell() {
    const pill = strip.contentDocument?.getElementById('islandPill');
    const slot = strip.contentDocument?.getElementById('nativeExtensions');
    if (!pill || !slot) return;
    let swell = [1, 0, 0];
    if (snapshot?.extensionsWidth > 0 && pill.classList.contains('proximity-active')) {
      const rest = restingRect(pill, slot), now = slot.getBoundingClientRect();
      if (rest.width > 0) swell = [now.width / rest.width, now.x - rest.x, now.y - rest.y];
    }
    swell = swell.map(value => Math.round(value * 1000) / 1000);
    const next = swell.join(',');
    if (next === swellSent) return;
    swellSent = next;
    request('extensionsSwell', swell).catch(error => notice(error.message));
  }
  // The renderer paints the swell on the pill's style and class each display
  // frame; the native buttons, and the pill's clickable area, follow.
  const swellWatched = new WeakSet();
  function watchSwell(doc) {
    const pill = doc?.getElementById('islandPill');
    if (!pill || swellWatched.has(pill)) return;
    swellWatched.add(pill);
    const observer = new doc.defaultView.MutationObserver(() => {
      reportGeometry();
      syncExtensionsSwell();
      // Measuring the resting slot toggles the class; those records are ours.
      observer.takeRecords();
    });
    observer.observe(pill, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  // ---- Rail hover previews (fork; docs/superpowers/specs/2026-11-14-rail-hover-previews-design.md).
  // Resting on a rail row shows a picture card beside the rail; resting on a
  // collapsed group's header shows a list card whose rows show the picture
  // card beside it. BlancRailHover decides; this section feeds it events,
  // runs its timers and draws the cards. Pictures stay in memory only while
  // their card shows.
  railHover = { state: BlancRailHover.initialState(), timer: null, grace: null, anchors: new Map(),
    shown: { picture: null, list: null }, drawn: { picture: null, list: null }, serial: 0, watched: null,
    activeTabId: null, lastKeyAt: null, cardsUp: false };
  const railCards = document.getElementById('railHoverCards');
  const railList = Object.assign(document.createElement('div'), { className: 'rail-card rail-card-list', hidden: true });
  const railPicture = Object.assign(document.createElement('div'), { className: 'rail-card rail-card-picture', hidden: true });
  railCards.append(railList, railPicture);
  const railKey = target => JSON.stringify([target.kind, String(target.tabId ?? target.splitId ?? target.groupId), !!target.inList]);
  const railDoc = () => strip.contentDocument;
  const railElement = () => railDoc()?.getElementById('verticalTabsRail');
  const railT = (key) => { try { return strip.contentWindow?.blancI18n?.t(key) ?? key; } catch { return key; } };
  function railSuppressed() {
    const rail = railElement();
    return BlancRailHover.suppressed({ layout, glanceOpen: snapshot?.glanceTabId != null,
      surfaceOpen: opened || extensionsOpened || !!sheet.page || !settingsSheet.hidden || !!paneMenu,
      dragging: false, railHidden: !rail || rail.hidden });
  }
  function railStep(event) {
    const next = BlancRailHover.step(railHover.state, event);
    railHover.state = next.state;
    for (const effect of next.effects) {
      if (effect.type === 'cancel-timers') {
        clearTimeout(railHover.timer); clearTimeout(railHover.grace);
        railHover.timer = railHover.grace = null;
      } else if (effect.type === 'start-timer') {
        railHover.timer = setTimeout(() => railStep({ type: 'timer' }), effect.ms);
      } else if (effect.type === 'start-grace') {
        railHover.grace = setTimeout(() => railStep({ type: 'grace' }), effect.ms);
      } else if (effect.type === 'show') {
        showRailCard(effect.card, effect.target);
      } else if (effect.type === 'hide') {
        hideRailCard(effect.card);
      }
    }
  }
  function railDismiss(reason) {
    if (!railHover || railHover.state.phase === 'idle') return;
    railStep({ type: 'dismiss', reason });
  }
  // Host coordinates of an element in the strip document.
  function railRect(element) {
    const r = element.getBoundingClientRect();
    const frame = strip.getBoundingClientRect();
    return { left: r.left + frame.left, top: r.top + frame.top, right: r.right + frame.left, height: r.height };
  }
  // The rail row an element belongs to, as BlancRailHover's target.
  function railTargetOf(element) {
    if (!element?.closest?.('#verticalTabsRail')) return null;
    const split = element.closest('.vertical-split-row[data-split-id]');
    if (split) return { target: { kind: 'split', splitId: split.dataset.splitId }, row: split };
    const header = element.closest('[data-drag-header][data-group-id]');
    if (header) {
      const group = snapshot?.groups?.find(g => String(g.id) === header.dataset.groupId);
      return BlancRailHover.groupCardFor(group) ? { target: { kind: 'group', groupId: header.dataset.groupId }, row: header } : null;
    }
    const primary = element.closest('.vertical-tab-primary[data-tab-id]');
    if (primary?.dataset.tabId) return { target: { kind: 'tab', tabId: primary.dataset.tabId }, row: primary.closest('.vertical-tab-row') ?? primary };
    return null;
  }
  function railEnter(type, element) {
    if (railSuppressed()) { railDismiss('surface'); return; }
    const found = railTargetOf(element);
    // Off a row (the rail's edges, its buttons, an open group's header): no wait, and a card up goes after the grace.
    if (!found) { if (type === 'enter') railStep({ type: 'leave-row' }); return; }
    railHover.anchors.set(railKey(found.target), railRect(found.row));
    // The split row's own label, not its icons' fallback letters.
    if (found.target.kind === 'split') railHover.anchors.set('label:' + found.target.splitId,
      found.row.querySelector('.vertical-tab-title-text')?.textContent.trim() ?? '');
    railStep({ type, target: found.target });
  }
  const railHooked = new WeakSet();
  function hookRailHover(doc) {
    const rail = doc?.getElementById('verticalTabsRail');
    if (!rail || railHooked.has(doc)) return;
    railHooked.add(doc);
    doc.documentElement.dataset.railPreviews = layout === 'vertical' ? 'on' : '';
    rail.addEventListener('pointerover', (event) => {
      // A button held down is a drag or a press, never a rest.
      if (event.buttons !== 0) return;
      railEnter('enter', event.target);
    });
    rail.addEventListener('pointerleave', () => railStep({ type: 'leave-rail' }));
    rail.addEventListener('focusin', (event) => {
      // Rows also take focus back after a redraw; only keyboard moves count.
      if (BlancRailHover.keyboardFocus(railHover.lastKeyAt, performance.now()) && event.target?.matches?.(':focus-visible'))
        railEnter('focus', event.target);
    });
    doc.addEventListener('pointerdown', () => railDismiss('click'), true);
    doc.addEventListener('wheel', () => railDismiss('scroll'), { capture: true, passive: true });
    doc.addEventListener('keydown', (event) => {
      railHover.lastKeyAt = performance.now();
      if (railHover.state.phase === 'idle') return;
      const action = BlancRailHover.keyAction(event.key, {
        onRow: !!event.target?.closest?.('#verticalTabsRail .vertical-tab-primary, #verticalTabsRail [data-drag-header]'),
        cardUp: railHover.state.phase === 'shown' || railHover.state.phase === 'leaving' });
      if (action === 'keep') return;
      if (action === 'swallow') { event.preventDefault(); event.stopPropagation(); }
      railDismiss('key');
    }, true);
    doc.defaultView?.addEventListener('blur', () => railDismiss('blur'));
  }
  addEventListener('blur', () => railDismiss('blur'));
  addEventListener('resize', () => railDismiss('resize'));
  railList.addEventListener('pointerenter', () => railStep({ type: 'enter-list' }));
  railList.addEventListener('pointerleave', () => railStep({ type: 'leave-list' }));
  railList.addEventListener('pointerover', (event) => {
    const row = event.target?.closest?.('.rail-card-row[data-tab-id]');
    if (!row) return;
    const target = { kind: 'tab', tabId: row.dataset.tabId, inList: true };
    const r = row.getBoundingClientRect();
    railHover.anchors.set(railKey(target), { left: r.left, top: r.top, right: r.right, height: r.height });
    railStep({ type: 'enter-row', target });
  });
  railList.addEventListener('click', async (event) => {
    const row = event.target?.closest?.('.rail-card-row[data-tab-id]');
    const groupId = railHover.shown.list?.groupId;
    railDismiss('click');
    if (!row) return;
    try {
      // The group opens first, as ⌘1–9 does, so the tab isn't hidden behind it.
      const group = snapshot?.groups?.find(g => String(g.id) === String(groupId));
      if (group?.collapsed) await request('toggleGroupCollapsed', [String(group.id)]);
      await api.activateTabFromRail(row.dataset.tabId);
    } catch (error) { notice(error.message); }
  });

  function placeRailCard(node, anchor, left, align) {
    node.style.left = '0px'; node.style.top = '0px';
    const size = node.getBoundingClientRect();
    const at = BlancRailHoverCard.place(anchor ?? { top: 0, height: 0 }, { width: size.width, height: size.height },
      { width: innerWidth, height: innerHeight }, { left, align });
    node.style.left = `${at.left}px`; node.style.top = `${at.top}px`;
    return { x: at.left, y: at.top, width: size.width, height: size.height };
  }
  function revealRailCard(node) {
    node.hidden = false;
    if (node.classList.contains('shown')) return;
    requestAnimationFrame(() => { if (!node.hidden) node.classList.add('shown'); });
  }
  function showRailCard(card, target) {
    const label = target.kind === 'split' ? railHover.anchors.get('label:' + target.splitId) : '';
    const model = BlancRailHoverCard.cardModel(snapshot, target, { label });
    if (!model) { railDismiss('snapshot'); return; }
    const anchor = railHover.anchors.get(railKey(target));
    const rail = railElement();
    const railRight = rail ? railRect(rail).right : effectiveRailWidth();
    railHover.activeTabId = snapshot?.activeTabId ?? null;
    railHover.drawn[card] = model;
    // Native closes the cards on a key or click in the page (OnInputEvent).
    if (!railHover.cardsUp) { railHover.cardsUp = true; request('railCardsShown', [true]).catch(() => {}); }
    if (card === 'list') {
      railHover.shown.list = target;
      BlancRailHoverCard.render(railList, model, railT);
      railList.hidden = false;
      const at = placeRailCard(railList, anchor, railRight, 'top');
      revealRailCard(railList);
      request('hoverCardBounds', [at.x, at.y, at.width, at.height].map(Math.round)).catch(error => notice(error.message));
      return;
    }
    const serial = ++railHover.serial;
    railHover.shown.picture = target;
    BlancRailHoverCard.render(railPicture, model, railT);
    railPicture.hidden = false;
    const left = target.inList && !railList.hidden ? railList.getBoundingClientRect().right : railRight;
    placeRailCard(railPicture, anchor, left, 'center');
    revealRailCard(railPicture);
    for (const tab of model.panes ?? [model]) {
      if (tab.picture !== 'live' && tab.picture !== 'quiet') continue;
      request('tabThumbnail', [nativeId(tab.tabId)]).then((reply) => {
        if (serial === railHover.serial && reply?.image) BlancRailHoverCard.updateImage(railPicture, tab.tabId, reply.image);
      }).catch(() => {});
    }
    // One tab at a time follows Chromium's newer pictures while its card shows.
    const follow = !model.panes && model.picture === 'live' ? String(model.tabId) : null;
    if (follow !== railHover.watched) {
      railHover.watched = follow;
      request(follow ? 'watchThumbnail' : 'unwatchThumbnail', follow ? [nativeId(follow)] : []).catch(() => {});
    }
  }
  function hideRailCard(card) {
    if (card === 'list' || card === 'all') {
      if (railHover.shown.list) request('hoverCardBounds', [0, 0, 0, 0]).catch(error => notice(error.message));
      railHover.shown.list = null;
      railList.hidden = true; railList.classList.remove('shown'); railList.replaceChildren();
    }
    if (card === 'picture' || card === 'all') {
      ++railHover.serial;
      railHover.shown.picture = null;
      railPicture.hidden = true; railPicture.classList.remove('shown'); railPicture.replaceChildren();
      if (railHover.watched) { railHover.watched = null; request('unwatchThumbnail').catch(() => {}); }
    }
    if (card === 'list' || card === 'all') railHover.drawn.list = null;
    if (card === 'picture' || card === 'all') railHover.drawn.picture = null;
    if (card === 'all') railHover.anchors.clear();
    if (railHover.cardsUp && !railHover.shown.list && !railHover.shown.picture) {
      railHover.cardsUp = false;
      request('railCardsShown', [false]).catch(() => {});
    }
  }
  function railThumbnail(id, image) {
    if (railHover?.watched == null || String(id) !== railHover.watched) return;
    BlancRailHoverCard.updateImage(railPicture, railHover.shown.picture?.tabId, image);
  }
  // After each snapshot: a card whose tab or group changed under it closes.
  function syncRailHover() {
    const doc = railDoc();
    if (doc?.documentElement) doc.documentElement.dataset.railPreviews = layout === 'vertical' ? 'on' : '';
    // Rows drawn before previews were on still carry the system tooltip.
    if (layout === 'vertical') for (const row of doc?.querySelectorAll('#verticalTabsRail .vertical-tab-primary[title]') ?? []) row.removeAttribute('title');
    if (!railHover || railHover.state.phase === 'idle') return;
    if (railSuppressed()) { railDismiss('surface'); return; }
    if ((snapshot?.activeTabId ?? null) !== railHover.activeTabId && railHover.state.phase !== 'waiting') {
      railDismiss('tab-switch'); return;
    }
    // A card whose tab or group changed under it (renamed, recolored, a tab
    // added, gone, made private, an open group) closes rather than show stale rows.
    for (const card of ['list', 'picture']) {
      const target = railHover.shown[card];
      if (!target) continue;
      const label = target.kind === 'split' ? railHover.anchors.get('label:' + target.splitId) : '';
      const model = BlancRailHoverCard.cardModel(snapshot, target, { label });
      const group = model?.kind === 'list' ? snapshot.groups.find(g => String(g.id) === String(target.groupId)) : null;
      if (!BlancRailHoverCard.sameCard(railHover.drawn[card], model) ||
          (model.kind === 'list' && !BlancRailHover.groupCardFor(group))) { railDismiss('snapshot'); return; }
    }
  }

  // A setting turned off, or anything else that ends eligibility, ends a dwell.
  function settleHover() {
    hookHover(strip.contentDocument, strip);
    hookRailHover(strip.contentDocument);
    watchSwell(strip.contentDocument);
    hookHover(floatPill.contentDocument, floatPill);
    hookHover(overlay.contentDocument, overlay);
    if (hover.state.dwelling && !hoverEligible()) hoverStepWith({ type: 'ineligible' });
  }
  window.blancPrototypeEvent = (kind) => {
    if (kind === 'settings') refresh().then(settleHover, settleHover);
    // Native revealed or hid the Island (island_autohide_controller.inc).
    if (kind === 'autohide') refresh().catch(() => {});
  };

  // ---- Auto-hide (F1-15…): native lays the window out and decides when the
  // Island shows (island_autohide_controller.inc). The strip draws its
  // covered state, and while turning it on holds the Island up the host shows
  // shipping's how-to tip under the pill, with room asked for below the strip.
  let stripHiddenSent = null;
  let introTip = false;
  function syncAutoHide() {
    const state = snapshot?.islandAutoHide;
    // The Glance host stays window-fixed. Slide only the strip; the card
    // and its page must not inherit the strip's native push offset.
    const pushedGlance = snapshot?.glanceTabId != null && layout !== 'vertical' && !state?.floating;
    const duration = state?.stripHidden ? AutoHide.SLIDE_OUT_MS : AutoHide.SLIDE_IN_MS;
    strip.style.transition = pushedGlance && !matchMedia('(prefers-reduced-motion: reduce)').matches
      ? `transform ${duration}ms cubic-bezier(.33,1,.68,1)` : '';
    strip.style.transform = pushedGlance && state?.stripHidden ? `translateY(-${stripH() + 30}px)` : '';
    // Shipping's stripCovered: hidden, or floating under its pill.
    const hidden = state?.stripHidden === true || state?.floating === true;
    if (hidden !== stripHiddenSent) { stripHiddenSent = hidden; emit('onStripHidden', hidden); }
    syncFloat();
    const intro = state?.introducing === true && !opened && !extensionsOpened && !paneMenu;
    if (intro === introTip) return;
    introTip = intro;
    if (!intro) {
      tooltip.classList.remove('intro');
      tooltip.hidden = true;
      if (!sheet.page) restHeight().catch(() => {});
      return;
    }
    const t = strip.contentWindow?.blancI18n?.t;
    if (!t || !pillRect) { introTip = false; return; }
    request('height', [stripH() + 64, false]).catch(() => {});
    tooltip.textContent = t('island.autoHide.intro', { shortcut: /Mac/.test(navigator.platform) ? '⌘L' : 'Ctrl+L' });
    tooltip.classList.add('intro');
    tooltip.dataset.private = 'false';
    tooltip.hidden = false;
    const width = tooltip.getBoundingClientRect().width;
    tooltip.style.left = `${Math.max(4, Math.min(innerWidth - width - 4, pillRect.x + pillRect.width / 2 - width / 2))}px`;
    tooltip.style.top = `${pillRect.y + pillRect.height + 6}px`;
  }

  // The float style draws the revealed Island as a copy of the strip in its
  // own frame over the page, as shipping's float view: shipping's own policy
  // (island-autohide.js) places it and decides when it shows, the document
  // slides the pill in and out (renderer.js, styles.css), and native claims
  // clicks only inside the frame while it shows. macOS has no float views for
  // the window controls or the menu button.
  const AutoHide = window.BlancIslandAutoHide;
  const floatPlatform = /Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux';
  const floatView = { shown: false, frame: null, frameKey: '', claimKey: '', hideTimer: null };
  function setFloatShown(shown, now = false) {
    const changed = floatView.shown !== shown;
    floatView.shown = shown;
    clearTimeout(floatView.hideTimer);
    floatView.hideTimer = null;
    if (shown) {
      floatPill.classList.add('shown');
      if (changed) emit('onFloatShown', true);
      return;
    }
    if (changed) emit('onFloatShown', false);
    // The frame stays visible until its pill has slid out (shipping's
    // setIslandFloatShown).
    const hide = () => { floatView.hideTimer = null; if (!floatView.shown) floatPill.classList.remove('shown'); };
    if (now || matchMedia('(prefers-reduced-motion: reduce)').matches) hide();
    else floatView.hideTimer = setTimeout(hide, AutoHide.SLIDE_OUT_MS + 32);
  }
  function claimFloat() {
    const frame = floatPill.dataset.wanted === 'true' && floatView.frame;
    const args = frame ? [floatView.shown, frame.x, frame.y, frame.width, frame.height] : [false, 0, 0, 0, 0];
    const key = JSON.stringify(args);
    if (key === floatView.claimKey) return;
    floatView.claimKey = key;
    request('floatFrame', args).catch(error => notice(error.message));
  }
  function syncFloat() {
    const state = snapshot?.islandAutoHide;
    const root = document.documentElement;
    root.toggleAttribute('data-strip-covered', state?.floating === true || (layout === 'vertical' && state?.stripHidden === true));
    root.style.setProperty('--rail-w', layout === 'vertical' ? `${effectiveRailWidth()}px` : '0px');
    const wanted = AutoHide.floatViewsWanted({ autoHide: state?.enabled === true, style: state?.style, platform: floatPlatform }).pill;
    floatPill.dataset.wanted = String(wanted);
    if (!wanted) {
      setFloatShown(false, true);
      claimFloat();
      return;
    }
    const bounds = AutoHide.floatViewBounds(pillRect, { windowWidth: innerWidth, windowHeight: state.windowHeight || innerHeight,
      side: scaleForSize(AutoHide.FLOAT_SIDE_PX), bottom: scaleForSize(AutoHide.FLOAT_BOTTOM_PX) });
    if (bounds) {
      const frame = { role: 'pill', x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, stageWidth: innerWidth };
      const key = JSON.stringify(frame);
      if (key !== floatView.frameKey) {
        floatView.frameKey = key;
        floatView.frame = frame;
        Object.assign(floatPill.style, { left: `${frame.x}px`, top: `${frame.y}px`, width: `${frame.width}px`, height: `${frame.height}px` });
        emit('onFloatFrame', frame);
      }
    }
    setFloatShown(AutoHide.floatViewsShown({ floating: state.floating === true, islandVisible: state.stripHidden !== true,
      platform: floatPlatform }).pill && !!bounds);
    claimFloat();
  }

  const routedTokens = new Set();
  window.BlancPrototypeHost = {
    api,
    offerSpaceLink,
    routeExternalLink: async (token, id) => {
      if (routedTokens.has(token)) return;
      routedTokens.add(token);
      if (routedTokens.size > 100) routedTokens.delete(routedTokens.values().next().value);
      let result; try { result = await swapToSpace(id); } catch { result = {ok:false}; }
      await request('linkRouteDone', [token, !!result.ok]);
    },
    spaceLinkResult: () => lastSpaceLinkResult,
    // A newer picture of the tab the rail's hover card shows (watchThumbnail).
    tabThumbnail: (id, image) => railThumbnail(id, image),
    // A key or click in the page closes the rail's hover cards (native OnInputEvent).
    railDismiss: (reason) => railDismiss(String(reason)),
    toggleGlance: () => (snapshot?.glanceTabId != null ? api.closeGlance() : api.openGlancePicker()),
    focusGlanceCard,
    spaceHeldState: () => request('spaceMeta'),
    spacesChanged: () => announceSpaces(),
    // Undo of a delete: this window's tabs go back to saving into the Space.
    // A page may be loading, so it tries for a while.
    spaceRebind: async id => {
      for (let i = 0; i < 60 && !snapshot?.spaceName; i++) {
        try { await request('previewSpaceSave', [id]); } catch { await new Promise(done => setTimeout(done, 500)); }
        await refresh();
      }
      await announceSpaces();
    },
    reloadGlanceCard: () => {
      glance.ready = false; glance.loadEpoch += 1; glance.key = '';
      glanceCardFrame.hidden = true;
      glanceCardFrame.src = glanceCardFrame.dataset.src;
    },
    glanceState: () => ({ layout: glancePayload(), shown: !glanceCardFrame.hidden, generation: glance.generation }),
    findState: () => ({ tabId: findTabId }),
    apiForDocument,
    overlayDragging: () => overlayDragging,
    refreshSyncSurfaces,
    railActivationSerial: () => railActivationSerial,
    toggleTabLayout: () => implemented.setTabLayout(layout === 'vertical' ? 'island' : 'vertical'),
    hoverState: () => ({ ...hover.state }),
    // Whether the how-to tip is on screen (shipping's introTipShown).
    autoHideIntroShown: () => introTip && !tooltip.hidden,
    // The floating pill's frame as shipping's floatViewState reports its
    // view: null unless the float style wants one.
    floatViewState: () => floatPill.dataset.wanted !== 'true' ? null : {
      attached: true, shown: floatView.shown, visible: floatPill.classList.contains('shown'),
      bounds: floatView.frame && { x: floatView.frame.x, y: floatView.frame.y, width: floatView.frame.width, height: floatView.frame.height },
    },
    // Where the pointer last rested over the strip, which closing the panel
    // samples (shipping's sampledWindowCursor); the harness sets it.
    setLastPointer: (point) => { hover.lastPoint = point && { x: Number(point.x), y: Number(point.y) }; return true; },
    notice,
    open: (newTab = false, text = '') => {
      if (!newTab && opened && overlayMode !== 'find') { emit('onOverlayToggle'); return; }
      return show(newTab ? text : undefined, newTab ? 'panel' : 'palette');
    },
    extensions: showExtensions,
    // The address menu's Paste and Go (F19, shipping's pasteAndGo): the active
    // tab goes to the text as typed in the command bar, then the Island closes.
    pasteAndGo: async (text) => {
      const id = snapshot?.activeTabId;
      if (id == null || typeof text !== 'string' || !text.trim()) return false;
      await implemented.navigate(id, text.trim());
      await close();
      return true;
    },
    escape: () => !overlayDragging && (opened || extensionsOpened) ? close() : undefined,
    // The utility sheet: its pages' bridge and links (pages/sheet-adapter.js),
    // native commands (History, Downloads, Favorites) and its state.
    sheetBridge, sheetLink, sheetEscape,
    // Native's permission requests (permission_prompt.inc).
    permissionPrompt, permissionGone,
    openSheet: (name, section) => showSheet(name, section),
    closeSheet: () => hideSheet(),
    sheetState: () => ({ visible: sheet.page === 'settings' ? !settingsSheet.hidden
        : !!sheet.page && !!sheet.frame && !sheet.frame.hidden, ready: sheetReady(),
      url: sheet.page ? `blanc://${sheet.page}/` : null, contentsId: sheet.frame?.dataset.contents ?? null }),
    // The frame goes away as a crashed sheet's contents do; the next open
    // creates new ones (shipping's destroyed-contents recovery, F16-8).
    discardSheetContents: () => {
      if (!sheet.frame) return false;
      const frame = sheet.frame;
      sheet.frame = null;
      frame.remove();
      hideSheet().catch(error => notice(error.message));
      return true;
    },
    refresh,
    pageTint,
    pageBackdrop,
    findResult: (id, activeMatchOrdinal, matches, finalUpdate) => {
      if (overlayMode === 'find' && String(id) === findTabId)
        emit('onFindResult', { activeMatchOrdinal, matches, finalUpdate });
    },
    findStep: (forward) => {
      if (overlayMode !== 'find') return openFindBar();
      const query = overlay.contentDocument.getElementById('findInput').value;
      if (query && findTabId) return implemented.findInPage(findTabId, query,
        { forward, findNext: false });
    },
    findReset: () => { if (overlayMode === 'find') close(false); },
  };
  // The strip and overlay adapters read parent.BlancPrototypeHost as they
  // load, so the frames start only once it exists. A src in the markup let a
  // fast relaunch load the overlay first and leave its bridge undefined.
  strip.src = strip.dataset.src;
  floatPill.src = floatPill.dataset.src;
  glanceCardFrame.src = glanceCardFrame.dataset.src;
  // Escape closes a Glance only from the card's own chrome (F34).
  glanceCardFrame.addEventListener('load', () => {
    const epoch = glance.loadEpoch;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (epoch !== glance.loadEpoch) return;
      glance.ready = true; glance.key = ''; publishGlance();
    }));
    glanceCardFrame.contentDocument.addEventListener('keydown', event => {
      if (event.key === 'Escape' && snapshot?.glanceTabId != null) window.BlancPrototypeHost.api.closeGlance();
    });
  });
  overlay.src = overlay.dataset.src;
  permissionFrame.src = permissionFrame.dataset.src;

  window.addEventListener('unhandledrejection', (event) => {
    notice(event.reason?.message ?? String(event.reason));
  });
  window.addEventListener('keydown', event => {
    if (event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey && event.code === 'KeyV') {
      event.preventDefault();
      window.BlancPrototypeHost.toggleTabLayout();
    }
  });
  window.addEventListener('resize', reportGeometry);
  window.addEventListener('resize', () => syncFloat());
  // Events from the typed interface (browser-api.js), only the ones it sends.
  window.addEventListener('blanc-browser-api', (event) => {
    if (event.detail?.event === 'onBangIconsChanged') emit('onBangIconsChanged', event.detail.payload);
    if (event.detail?.event === 'onThemeAppearance') emit('onThemeAppearance', event.detail.payload);
    if (event.detail?.event === 'onPageTint') emit('onPageTint', event.detail.payload);
    if (event.detail?.event !== 'onBangsChanged') return;
    bangState = event.detail.payload;
    emit('onBangsChanged', bangState);
  });
  loadBangs().catch(() => {});
  // What's New (F51): shipping's maybeOpenWhatsNew, on shipping's own rules.
  // Native answers only in a release build, once per launch.
  async function maybeWhatsNew() {
    const launch = await request('whatsNewLaunch');
    if (!launch?.version) return;
    const rules = window.BlancWhatsNew, { version, firstRunComplete } = launch, now = Date.now();
    let state = launch.state;
    const patch = rules.whatsNewOnLaunch(state, { version, now, firstRunComplete });
    if (patch) { state = { ...state, ...patch }; await request('whatsNewSave', [patch]); }
    if (!rules.whatsNewCheckDue(state, { version, now })) return;
    const found = await request('whatsNewCheck', [rules.whatsNewPageUrl(version)]);
    const after = rules.whatsNewAfterCheck(state, { version, found, canOpen: !sheet.page });
    if (after.patch) await request('whatsNewSave', [after.patch]);
    if (after.openUrl) await request('createTab', [after.openUrl]);
  }
  maybeWhatsNew().catch(() => {});
  // A Space opened in a new window: this window exists to show it. Capture
  // waits for its first tab, and a failure leaves no blank window behind.
  async function openPendingSpace() {
    const id = await request('spacePendingOpen');
    if (!id) return;
    for (let i = 0; i < 100; i++) {
      await refresh();
      if (snapshot?.tabs.length && !snapshot.tabs.some(tab => tab.isLoading)) break;
      await new Promise(done => setTimeout(done, 50));
    }
    let result;
    try { result = await swapToSpace(id); } catch (e) { result = { ok: false, detail: e.message }; }
    await request('spacePendingDone', [!!result.ok, result.detail ?? result.error ?? '']);
    if (!result.ok) await request('previewPageCommand', ['closeWindow']);
  }
  openPendingSpace().catch(error => notice(error.message));
  let syncReading = false;
  async function refreshSyncSurfaces() {
    if (syncReading) return;
    syncReading = true;
    try {
      const devices = await request('syncSurface', ['listRemoteDevices', []]);
      const sent = await request('syncSurface', ['listSentToThisDevice', []]);
      syncedClosed = await request('syncSurface', ['listClosedFromSync', []]);
      emit('onRemoteTabsUpdated', devices);
      emit('onSentToThisDeviceUpdated', sent);
    } catch { /* A runner failure is not an empty remote inventory. */ }
    finally { syncReading = false; }
  }
  setInterval(refreshSyncSurfaces, 5000);
  setInterval(refresh, 300);
  applyRail().catch(error => notice(error.message));
})();
