'use strict';

// Hover previews in the vertical tab rail (fork-only; design
// docs/superpowers/specs/2026-11-14-rail-hover-previews-design.md): what each
// card shows (cardModel), where it goes (place), and its markup (render).
// host.js runs BlancRailHover's rules and asks Chromium for the pictures
// ('tabThumbnail', 'watchThumbnail', 'unwatchThumbnail'); the list card's
// rectangle takes the pointer through 'hoverCardBounds'.
(function (root) {
  const GAP = 8;
  const MARGIN = 8;
  const same = (a, b) => a != null && b != null && String(a) === String(b);

  function hostOf(url) {
    try {
      const parsed = new URL(String(url ?? ''));
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.host : '';
    } catch { return ''; }
  }

  function visibleTabIds(snapshot) {
    const split = (snapshot.splits ?? []).find(s => (s.tabIds ?? []).some(id => same(id, snapshot.activeTabId)));
    return split ? split.tabIds : [];
  }

  function tabModel(snapshot, tab, image) {
    const picture = root.BlancRailHover.pictureFor(tab,
      {activeTabId: snapshot.activeTabId, visibleTabIds: visibleTabIds(snapshot)});
    return {tabId: tab.id, title: String(tab.title || tab.url || ''), host: hostOf(tab.url), picture,
      image: (picture === 'live' || picture === 'quiet') && typeof image === 'string' ? image : null,
      favicon: tab.favicon ?? null, private: !!tab.private, quiet: !!tab.asleep};
  }

  /** What a card shows for a rail target, or null when its tab or group is gone. */
  function cardModel(snapshot, target, {image = null, label = ''} = {}) {
    const tabs = snapshot?.tabs ?? [];
    if (target?.kind === 'tab') {
      const tab = tabs.find(t => same(t.id, target.tabId));
      return tab ? {kind: 'picture', ...tabModel(snapshot, tab, image)} : null;
    }
    if (target?.kind === 'split') {
      const split = (snapshot.splits ?? []).find(s => same(s.id, target.splitId));
      const panes = (split?.tabIds ?? []).map(id => tabs.find(t => same(t.id, id))).filter(Boolean);
      if (!panes.length) return null;
      return {kind: 'picture', title: String(label || panes.map(t => t.title).join(' + ')), host: '',
        picture: 'split', image: null, private: panes.some(t => t.private),
        panes: panes.map(tab => tabModel(snapshot, tab, null))};
    }
    if (target?.kind === 'group') {
      const group = (snapshot.groups ?? []).find(g => same(g.id, target.groupId));
      if (!group) return null;
      return {kind: 'list', name: String(group.name ?? ''), color: group.color ?? null,
        rows: tabs.filter(t => same(t.groupId, group.id))
          .map(t => ({tabId: t.id, title: String(t.title || t.url || ''), favicon: t.favicon ?? null}))};
    }
    return null;
  }

  /** Beside `left` (the rail's or the list card's right edge), clamped inside the window. */
  function place(anchor, size, viewport, {left, align = 'center'}) {
    const x = Math.max(MARGIN, Math.min(left + GAP, viewport.width - size.width - MARGIN));
    const wanted = align === 'top' ? anchor.top : anchor.top + anchor.height / 2 - size.height / 2;
    const y = Math.max(MARGIN, Math.min(wanted, viewport.height - size.height - MARGIN));
    return {left: Math.round(x), top: Math.round(y)};
  }

  // ---- Markup (textContent only: titles, hosts and names are page data).
  function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function favicon(doc, src, className) {
    const icon = el(doc, 'span', className);
    if (typeof src === 'string' && src) {
      const img = doc.createElement('img');
      img.alt = '';
      img.src = src;
      icon.append(img);
    }
    return icon;
  }
  function pictureArea(doc, model) {
    const area = el(doc, 'div', 'rail-card-image');
    area.dataset.tabId = String(model.tabId);
    if (model.image) {
      const img = doc.createElement('img');
      img.alt = '';
      img.src = model.image;
      area.append(img);
    } else {
      area.append(favicon(doc, model.favicon, 'rail-card-placeholder'));
    }
    return area;
  }

  /** Builds a card's contents in `node`; `t` is the strip's blancI18n.t. */
  function render(node, model, t = key => key) {
    const doc = node.ownerDocument;
    node.replaceChildren();
    node.dataset.kind = model.kind;
    node.dataset.private = String(!!model.private);
    if (model.kind === 'list') {
      const head = el(doc, 'div', 'rail-card-name');
      if (/^#[0-9a-f]{6}$/i.test(model.color ?? '')) {
        const dot = el(doc, 'span', 'rail-card-dot');
        dot.style.setProperty('--group-color', model.color);
        head.append(dot);
      }
      head.append(el(doc, 'span', '', model.name));
      const rows = el(doc, 'div', 'rail-card-rows');
      for (const row of model.rows) {
        const line = el(doc, 'div', 'rail-card-row');
        line.dataset.tabId = String(row.tabId);
        line.append(favicon(doc, row.favicon, 'rail-card-favicon'), el(doc, 'span', 'rail-card-row-title', row.title));
        rows.append(line);
      }
      node.append(head, rows);
      return;
    }
    node.append(el(doc, 'div', 'rail-card-title', model.title));
    const state = model.private ? t('rail.state.private') : model.quiet ? t('rail.state.quiet') : '';
    const meta = [model.host, state].filter(Boolean).join(' · ');
    if (meta) node.append(el(doc, 'div', 'rail-card-host', meta));
    if (model.panes) {
      const panes = el(doc, 'div', 'rail-card-panes');
      for (const pane of model.panes) if (pane.picture !== 'private') panes.append(pictureArea(doc, pane));
      if (panes.childElementCount && model.panes.some(pane => pane.picture !== 'none')) node.append(panes);
    } else if (model.picture !== 'none' && model.picture !== 'private') {
      node.append(pictureArea(doc, model));
    }
  }

  /** A picture the watch sent: shown only if the card still shows that tab. */
  function updateImage(node, tabId, image) {
    const area = node.querySelector(`.rail-card-image[data-tab-id="${CSS.escape(String(tabId))}"]`);
    if (!area || typeof image !== 'string' || !image.startsWith('data:image/jpeg;base64,')) return false;
    const img = node.ownerDocument.createElement('img');
    img.alt = '';
    img.src = image;
    area.replaceChildren(img);
    return true;
  }

  root.BlancRailHoverCard = Object.freeze({hostOf, cardModel, place, render, updateImage});
})(typeof self !== 'undefined' ? self : globalThis);
