'use strict';

// F45 Arc Spaces import on Bring Your Tabs. Main reads Arc's
// StorableSidebar.json (or a file the person chooses) and keeps it; this page
// only ever sees Space names, counts and opaque ids. Each Arc Space the person
// selects becomes one Blanc space.
(() => {
  const api = window.bowserPages?.tabImport;
  const surface = window.bowserPages?.surface;
  const entryEl = document.getElementById('arcImportEntry');
  const previewEl = document.querySelector('[data-arc-panel="preview"]');
  const resultEl = document.querySelector('[data-arc-panel="result"]');
  const statusEl = document.getElementById('tabImportStatus');
  const progressEl = document.getElementById('tabImportStepProgress');
  if (!api?.arcDetect || !entryEl || !previewEl || !resultEl) return;

  const t = (key, params) => window.blancI18n.t(key, params);
  const ERROR_KEYS = {
    missing: 'arcImport.error.missing',
    permission: 'arcImport.error.permission',
    'not-arc': 'arcImport.error.notArc',
    'too-large': 'arcImport.error.tooLarge',
    'too-complex': 'arcImport.error.tooComplex',
    'source-saving': 'arcImport.error.saving',
    empty: 'arcImport.error.empty',
    unreadable: 'arcImport.error.unreadable',
    'nothing-selected': 'arcImport.error.nothingSelected',
    'storage-failed': 'arcImport.error.storage',
    'session-unavailable': 'arcImport.error.session',
  };

  let preview = null;
  let selected = new Set();
  let withFavorites = false;
  let busy = false;
  let savedProgress = null;
  let applyBtn = null;

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(className, text, onClick) {
    const node = make('button', className, text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function errorText(result) {
    if (result?.error === 'no-room' || result?.error === 'limit') {
      return t('arcImport.error.noRoom', { count: Number(result.remainingSlots) || 0 });
    }
    const key = ERROR_KEYS[result?.error];
    return key ? t(key) : t('arcImport.error.generic');
  }

  function setStatus(text = '') { statusEl.textContent = text; }

  // The Bring Your Tabs steps use [data-step-panel]; the Arc panels sit
  // beside them and take over the sheet while shown.
  function showArc(panel) {
    for (const node of document.querySelectorAll('[data-step-panel]')) node.hidden = true;
    previewEl.hidden = panel !== 'preview';
    resultEl.hidden = panel !== 'result';
    if (savedProgress === null) savedProgress = progressEl.textContent;
    progressEl.textContent = t('arcImport.progress');
    (panel === 'preview' ? previewEl : resultEl).querySelector('h2')?.focus();
  }

  function leaveArc() {
    previewEl.hidden = true;
    resultEl.hidden = true;
    const source = document.querySelector('[data-step-panel="source"]');
    if (source) source.hidden = false;
    if (savedProgress !== null) progressEl.textContent = savedProgress;
    savedProgress = null;
    preview = null;
    setStatus();
  }

  async function cancel() {
    const sessionId = preview?.sessionId;
    if (sessionId) await api.arcCancel(sessionId).catch(() => {});
  }

  async function renderEntry() {
    let state = 'unsupported';
    try { state = (await api.arcDetect())?.state ?? 'unsupported'; } catch { /* keep Choose file… */ }
    const hint = state === 'found' ? t('arcImport.entry.found')
      : state === 'missing' ? t('arcImport.entry.missing')
        : state === 'permission' ? t('arcImport.entry.permission')
          : t('arcImport.entry.unsupported');
    const actions = make('div', 'arc-import-entry-actions');
    if (state === 'found') actions.append(button('tab-import-primary', t('arcImport.entry.read'), () => read('arc')));
    actions.append(button('tab-import-secondary', t('arcImport.entry.chooseFile'), () => read('file')));
    entryEl.replaceChildren(
      make('h3', 'tab-import-profile-title', t('arcImport.entry.title')),
      make('p', 'section-hint arc-import-entry-hint', hint),
      actions,
    );
    entryEl.hidden = false;
  }

  async function read(source) {
    if (busy) return;
    busy = true;
    setStatus(t('arcImport.reading'));
    try {
      const result = await api.arcRead(source);
      if (result?.cancelled) { setStatus(); return; }
      if (!result || result.error) { setStatus(errorText(result)); return; }
      preview = result;
      selected = new Set(result.spaces.filter((space) => space.tabCount > 0).map((space) => space.id));
      withFavorites = result.favoritesCount > 0;
      setStatus();
      renderPreview();
      showArc('preview');
    } catch {
      setStatus(t('arcImport.error.generic'));
    } finally {
      busy = false;
      if (applyBtn) updateApply();
    }
  }

  function checkboxRow(checked, disabled, onChange, ...content) {
    const row = make('label', 'arc-import-space');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.disabled = disabled;
    box.addEventListener('change', () => { onChange(box.checked); updateApply(); });
    const copy = make('span', 'arc-import-space-copy');
    copy.append(...content);
    row.append(box, copy);
    return row;
  }

  function renderPreview(message = '') {
    const title = make('h2', 'section-title tab-import-panel-title', t('arcImport.title'));
    title.id = 'arcImportTitle';
    title.tabIndex = -1;
    const nodes = [
      title,
      make('p', 'section-hint', t('arcImport.mode.spaces')),
      make('p', 'section-hint', t('arcImport.room', { count: preview.remainingSlots })),
    ];

    const list = make('div', 'arc-import-space-list');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-labelledby', 'arcImportTitle');
    for (const space of preview.spaces) {
      const meta = [t('arcImport.space.tabs', { count: space.tabCount })];
      if (space.folderCount) meta.push(t('arcImport.space.folders', { count: space.folderCount }));
      const content = [
        make('span', 'arc-import-space-name', space.name),
        make('span', 'arc-import-space-meta', meta.join(' · ')),
      ];
      if (space.separateProfile) content.push(make('span', 'arc-import-space-note', t('arcImport.space.separateProfile')));
      list.append(checkboxRow(selected.has(space.id), space.tabCount === 0, (on) => {
        if (on) selected.add(space.id); else selected.delete(space.id);
      }, ...content));
    }
    if (preview.favoritesCount) {
      list.append(checkboxRow(withFavorites, false, (on) => { withFavorites = on; },
        make('span', 'arc-import-space-name', t('arcImport.favorites', { count: preview.favoritesCount }))));
    }
    nodes.push(list);
    if (preview.skippedCount) nodes.push(make('p', 'section-hint', t('arcImport.skipped', { count: preview.skippedCount })));
    nodes.push(make('p', 'tab-import-final-note', t('arcImport.stays')));

    const alert = make('p', 'arc-import-message', message);
    alert.setAttribute('role', 'alert');
    alert.hidden = !message;
    applyBtn = button('tab-import-primary', '', apply);
    const actions = make('div', 'tab-import-panel-actions');
    actions.append(
      button('tab-import-secondary', t('arcImport.back'), async () => { await cancel(); leaveArc(); }),
      applyBtn,
    );
    previewEl.replaceChildren(...nodes, alert, actions);
    updateApply();
  }

  function updateApply() {
    if (!applyBtn || !preview) return;
    const count = selected.size;
    applyBtn.disabled = busy || (!count && !withFavorites);
    applyBtn.textContent = !count ? t('arcImport.apply.favorites') : t('arcImport.apply.spaces', { count });
  }

  async function apply() {
    if (busy || !preview) return;
    busy = true;
    updateApply();
    setStatus(t('arcImport.applying'));
    let result;
    try {
      result = await api.arcApply(preview.sessionId, { spaceIds: [...selected], favorites: withFavorites });
    } catch {
      result = { error: 'generic' };
    }
    busy = false;
    setStatus();
    if (result?.ok) { renderResult(result); return; }
    if (result?.error === 'session-unavailable') {
      leaveArc();
      setStatus(t('arcImport.error.session'));
      return;
    }
    renderPreview(errorText(result));
  }

  function renderResult(result) {
    preview = null;
    const title = make('h2', 'section-title tab-import-panel-title', t('arcImport.done.title'));
    title.tabIndex = -1;
    const lines = [];
    if (result.created.length) {
      const names = new Intl.ListFormat(window.blancI18n.formatLocale(), { style: 'long', type: 'conjunction' })
        .format(result.created);
      lines.push(t('arcImport.done.spaces', { count: result.created.length, names }));
    }
    if (result.favoritesAdded) lines.push(t('arcImport.done.favorites', { count: result.favoritesAdded }));
    if (result.droppedCount) lines.push(t('arcImport.done.dropped', { count: result.droppedCount }));
    const actions = make('div', 'tab-import-panel-actions');
    actions.append(button('tab-import-primary', t('arcImport.done.close'), () => surface?.close?.()));
    resultEl.replaceChildren(title, ...lines.map((line) => make('p', 'section-hint', line)), actions);
    showArc('result');
  }

  // Closing the sheet needs no cleanup here: main's hideUtilitySheet drops the
  // parsed sidebar, and reopening reloads this page.
  renderEntry();
})();
