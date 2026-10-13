'use strict';

// The Spaces menu. One action state owns the list, the in-place editor, the
// switch decision and recovery; address/search rendering never owns this
// surface or its errors. Shown from the Island's space mark (overlay mode
// 'spaces') and from the ⌘L footer (inside the panel).
(function (root) {
  // The interface language's translator: the overlay's blancI18n in the app,
  // the English catalog under Node (unit tests drive this module directly).
  const i18n = root.blancI18n || (() => {
    const { createTranslator } = require('./pages/i18n.js');
    const t = createTranslator({ locale: 'en', messages: require('./pages/strings.en.js').messages });
    return { t, formatLocale: () => 'en' };
  })();
  const Identity = root.SpaceIdentity || require('./space-identity.js');
  const Picker = root.SpacePicker || require('./space-picker.js');
  const t = i18n.t;
  const number = new Intl.NumberFormat(i18n.formatLocale());
  // The workspace and deleted-workspace cap: MAX_WORKSPACES in main's
  // workspaces-model.js (a unit test keeps the two equal).
  const WORKSPACE_LIMIT = 25;
  const errors = {
    'duplicate-name': t('ws.error.duplicateName'),
    'invalid-name': t('ws.error.invalidName'),
    'invalid-color': t('ws.error.invalidColor'),
    'invalid-symbol': t('ws.error.invalidSymbol'),
    'limit': t('ws.error.limit', { limit: number.format(WORKSPACE_LIMIT) }),
    'not-found': t('ws.error.notFound'),
    'read-failed': t('ws.error.readFailed'),
    'storage-failed': t('ws.error.storageFailed'),
    'future-format': t('ws.error.futureFormat'),
    'repair-failed': t('ws.error.repairFailed'),
    'busy': t('ws.error.busy'),
    'activation-failed': t('ws.error.activationFailed'),
    'saved-not-opened': t('ws.error.savedNotOpened'),
  };
  const SVG = 'http://www.w3.org/2000/svg';
  // Interface glyphs on Lucide's 24×24 grid, drawn like the symbols.
  const GLYPHS = {
    back: [['path', { d: 'm15 18-6-6 6-6' }]],
    more: [['circle', { cx: 5, cy: 12, r: 1 }], ['circle', { cx: 12, cy: 12, r: 1 }], ['circle', { cx: 19, cy: 12, r: 1 }]],
    plus: [['path', { d: 'M12 5v14M5 12h14' }]],
    recover: [['path', { d: 'M3 12a9 9 0 1 0 3-6.7L3 8' }], ['path', { d: 'M3 3v5h5' }]],
    import: [['path', { d: 'M12 3v12m-4-4 4 4 4-4' }], ['path', { d: 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2' }]],
  };
  const SPACE_NAME_DATA = 'data-i18n-ignore';
  /** An inline SVG from a [tag, attributes] list on a 24×24 grid. */
  function svgFrom(doc, elements, className) {
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', className);
    for (const [tag, attrs] of elements) {
      const node = doc.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      svg.append(node);
    }
    return svg;
  }
  /** Set a space's drawn ink and wash on `node` for the current theme. */
  function paintIdentity(node, color, theme) {
    const painted = Identity.paint(color, theme) ?? Identity.paint(Identity.PRESETS[0].hex, theme);
    node.style.setProperty('--space-ink', painted.ink);
    node.style.setProperty('--space-wash', painted.wash);
  }
  /** A space's symbol on its wash: rows, the editor, Quick Switcher results. */
  function makeTile(doc, identity, theme, className = 'ws-tile') {
    const node = doc.createElement('span'); node.className = className;
    paintIdentity(node, identity.color, theme);
    node.append(svgFrom(doc, Identity.SYMBOLS[Identity.isSymbol(identity.symbol) ? identity.symbol : Identity.SYMBOL_IDS[0]], 'ws-symbol'));
    return node;
  }

  function create({ document: doc, window: win, api, popup, list, commands, trigger, label, feedback, onOpenChange, theme = () => 'light', placement = () => 'anchored' }) {
    let data = { items: [], deleted: [], status: 'saved', windowTabCount: 0 };
    let state = { kind: 'list' };
    let opened = false;
    let generation = 0;
    let undo = null;
    let invoker = trigger;
    let drag = null;
    let suppressClick = false;
    let updateTimer = null;
    let pendingPatch = null;
    // Live edits write in order; each link resolves true when its write saved.
    let saving = Promise.resolve(true);
    const el = (tag, className, text) => {
      const node = doc.createElement(tag); if (className) node.className = className;
      if (text != null) node.textContent = text; return node;
    };
    // Space names are the user's own text, never translated.
    const dataEl = (tag, className, text) => { const node = el(tag, className, text); node.setAttribute(SPACE_NAME_DATA, ''); return node; };
    const glyph = (name) => svgFrom(doc, GLYPHS[name], 'ws-glyph');
    const tile = (identity, className) => makeTile(doc, identity, theme(), className);
    const paint = (node, color) => paintIdentity(node, color, theme());
    // key names the button for focus restoration (and tests), whatever its text.
    const button = (text, key, action, className = 'ws-cmd') => {
      const node = el('button', className, text); node.type = 'button'; node.dataset.focusKey = key;
      node.disabled = !!state.pending; node.addEventListener('click', action); return node;
    };
    const current = () => data.items.find((w) => w.active) ?? null;

    function layout() {
      if (!opened) return;
      popup.style.setProperty('--ws-max-height', `${Math.max(100, win.innerHeight - 16)}px`);
      if (placement() !== 'anchored') return; // the 'spaces' overlay view is sized to the menu; CSS places it
      const anchor = trigger.getBoundingClientRect();
      const h = popup.offsetHeight;
      popup.style.setProperty('--ws-top', `${Math.max(8, Math.min(anchor.top - h - 6, win.innerHeight - h - 8))}px`);
      popup.style.setProperty('--ws-right', `${Math.max(8, Math.min(win.innerWidth - anchor.right, win.innerWidth - popup.offsetWidth - 8))}px`);
    }
    function syncIdentity() {
      const bound = current();
      label.textContent = bound?.name || t('footer.workspaces');
      trigger.title = bound ? t('ws.trigger.current', { name: bound.name }) : t('footer.workspaces');
      trigger.setAttribute('aria-label', trigger.title);
      trigger.setAttribute('aria-expanded', String(opened));
      trigger.classList.toggle('bound', !!bound);
    }
    function open() {
      if (!opened) invoker = doc.activeElement || trigger;
      opened = true; popup.hidden = false; onOpenChange(true); syncIdentity(); render();
      (popup.querySelector('input') || popup.querySelector('[data-current="true"]') || popup.querySelector('button'))?.focus();
    }
    function close({ force = false } = {}) {
      if (!force && (state.pending || state.kind === 'decision' || state.original || state.error || state.saveError)) return false;
      flushUpdate();
      opened = false; popup.hidden = true; onOpenChange(false); syncIdentity();
      if (state.kind !== 'decision' && !state.original) state = { kind: 'list' };
      undo = null;
      (invoker?.isConnected ? invoker : trigger)?.focus();
      return true;
    }
    function toList() { flushUpdate(); state = { kind: 'list' }; render(); popup.querySelector('[data-current="true"]')?.focus(); }

    // ---- editing state ----
    /** New: { kind, draft, start, original? } · Edit: { kind, id, draft }. */
    function beginNew({ name = '', start = null, original = null } = {}) {
      if (state.pending) return;
      generation += 1;
      const identity = Identity.defaultsFor(data.items);
      state = { kind: 'new', draft: { name, ...identity }, start: start ?? (current() ? 'empty' : 'window'), fixedStart: !!original, original, error: '', saveError: '', touched: false, picker: false };
      open();
    }
    function beginEdit(workspace) {
      if (state.pending) return;
      if (!workspace) { state = { kind: 'list', error: errors['not-found'] }; open(); return; }
      generation += 1;
      state = { kind: 'edit', id: workspace.id, draft: { name: workspace.name, color: workspace.color, symbol: workspace.symbol }, error: '', saveError: '', touched: false, picker: false };
      open();
    }
    function nameProblem(name, exceptId = null) {
      const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
      if (!clean) return 'invalid-name';
      if (data.items.some((w) => w.id !== exceptId && w.name.toLowerCase() === clean.toLowerCase())) return 'duplicate-name';
      return null;
    }
    // Edits apply live: a patch waits briefly so typing and dragging write once.
    function queueUpdate(patch, delay = 250) {
      if (state.kind !== 'edit') return;
      pendingPatch = { id: state.id, ...(pendingPatch?.id === state.id ? pendingPatch : {}), ...patch };
      clearTimeout(updateTimer);
      updateTimer = setTimeout(flushUpdate, delay);
    }
    /** Send the waiting edit. Resolves true when it saved. A failed edit is
     * kept (under any newer one) and shown with Try again while its editor is
     * open; once the editor is gone, a storage failure still reaches the
     * menu's status line through the store's own status. */
    function flushUpdate() {
      clearTimeout(updateTimer); updateTimer = null;
      if (!pendingPatch) return saving;
      const { id, ...patch } = pendingPatch; pendingPatch = null;
      const editing = () => state.kind === 'edit' && state.id === id;
      const failed = (message) => {
        if (!editing()) return false;
        pendingPatch = { id, ...patch, ...(pendingPatch?.id === id ? pendingPatch : {}) };
        state.saveError = message; renderEditorError();
        return false;
      };
      saving = saving.then(() => api.updateWorkspace(id, patch)).then((result) => {
        if (result?.items) data = { ...data, ...result };
        if (!result?.ok) return failed(errors[result?.error] || t('ws.error.generic'));
        if (editing() && state.saveError) { state.saveError = ''; renderEditorError(); }
        return true;
      }, () => failed(errors['storage-failed']));
      return saving;
    }
    /** Done, back and Escape: leave the editor once every edit has saved. */
    async function finishEdit() {
      const id = state.id;
      const saved = await flushUpdate();
      if (state.kind !== 'edit' || state.id !== id) return; // already moved on
      if (saved && !pendingPatch && !state.saveError) toList();
    }

    function cancel() {
      if (state.pending) return true;
      if (state.kind === 'decision') api.cancelWorkspaceAction?.();
      if (state.original) { state = state.original; render(); }
      else if (state.kind === 'edit') { finishEdit(); }
      else if (state.kind !== 'list') { toList(); }
      else if (opened) { state.error = ''; close(); }
      else return false;
      return true;
    }
    async function run(operation, success, action = null) {
      if (state.pending) return;
      const stamp = ++generation;
      state.pending = true; state.error = ''; render();
      let result;
      try { result = await operation(); } catch { result = { ok: false, error: 'storage-failed' }; }
      if (stamp !== generation) return;
      state.pending = false;
      if (result?.items) data = { ...data, ...result };
      if (!result?.ok) {
        if (result?.error === 'saved-not-opened') {
          // Creation already committed. Leave the user on the list containing
          // that saved row; keeping the editor alive would turn a retry into a
          // misleading duplicate-name failure.
          state = { kind: 'list', error: errors[result.error] };
          render();
        } else if (['unsaved-scratch', 'protected-pages'].includes(result?.error) && action) {
          state = { kind: 'decision', action, result, error: '' }; open();
        } else {
          state.error = state.kind === 'recovery' && result?.error === 'duplicate-name' ? t('ws.error.recoveryDuplicate') : errors[result?.error] || t('ws.error.generic');
          render();
          const input = popup.querySelector('input');
          if (input) { input.focus(); if (state.editSelection) input.setSelectionRange(...state.editSelection); }
        }
        return;
      }
      state.error = ''; success?.(result); syncIdentity(); render();
    }
    function openAction(action, options = {}) {
      run(() => action.kind === 'open' ? api.openWorkspace(action.id, options) : api.createBlankWorkspace(action.name, { ...options, ...action.identity }), () => {
        state = { kind: 'list' }; close({ force: true }); api.closeOverlay();
      }, action);
    }
    function submitNew() {
      if (state.pending || state.kind !== 'new') return;
      const input = popup.querySelector('#workspaceName');
      if (input) state.editSelection = [input.selectionStart, input.selectionEnd];
      const problem = nameProblem(state.draft.name);
      state.touched = true;
      if (problem) { state.error = errors[problem]; renderEditorError(); popup.querySelector('#workspaceName')?.focus(); return; }
      const name = state.draft.name.trim().replace(/\s+/g, ' ');
      const identity = { color: state.draft.color, symbol: state.draft.symbol };
      if (state.start === 'empty' && !state.fixedStart) { openAction({ kind: 'create', name, identity }); return; }
      const original = state.original;
      run(() => api.saveWorkspaceAs(name, identity), () => {
        if (original) { state = original; openAction(original.action); }
        else { state = { kind: 'list' }; }
      });
    }
    function removeNow(workspace) {
      if (!workspace) return;
      run(() => api.removeWorkspace(workspace.id), () => { undo = { id: workspace.id, name: workspace.name }; state = { kind: 'list' }; });
    }

    // ---- rendering ----
    function spaceRow(workspace, index) {
      const row = el('div', 'workspace-row ws-row'); row.dataset.workspaceId = workspace.id; row.dataset.index = String(index);
      const main = button('', `open:${workspace.id}`, () => {
        if (suppressClick) { suppressClick = false; return; }
        openAction({ kind: 'open', id: workspace.id, name: workspace.name });
      }, 'ws-row-main' + (workspace.active ? ' on' : ''));
      main.dataset.current = String(workspace.active);
      const context = t(workspace.active ? 'ws.row.current' : workspace.openElsewhere ? 'ws.row.showWindow' : workspace.resident ? 'ws.row.retained' : 'ws.row.open');
      main.title = t('ws.row.title', { name: workspace.name, context, count: workspace.tabCount });
      main.setAttribute('aria-label', main.title);
      if (workspace.active) main.setAttribute('aria-current', 'true');
      main.append(tile(workspace), dataEl('span', 'ws-row-name', workspace.name), el('span', 'ws-row-count', workspace.openElsewhere ? t('ws.row.showWindow') : number.format(workspace.tabCount)));
      main.addEventListener('keydown', (event) => {
        if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const target = index + (event.key === 'ArrowUp' ? -1 : 1);
        if (target < 0 || target >= data.items.length) return;
        run(() => api.moveWorkspaceTo(workspace.id, target), () => {});
      });
      main.addEventListener('pointerdown', (event) => startDrag(event, workspace, index, row));
      const more = button('', `edit:${workspace.id}`, () => beginEdit(workspace), 'ws-row-more');
      more.setAttribute('aria-label', t('ws.row.edit', { name: workspace.name }));
      more.append(glyph('more'));
      row.append(main, more);
      return row;
    }
    // Drag to reorder: the row follows the pointer 1:1 from where it was
    // grabbed; past a small threshold it commits to dragging.
    function startDrag(event, workspace, index, row) {
      if (event.button !== 0 || state.pending) return;
      const rect = row.getBoundingClientRect();
      drag = { id: workspace.id, index, startY: event.clientY, rowHeight: rect.height + 3, moved: false, row, target: index };
      row.setPointerCapture?.(event.pointerId);
      const move = (e) => {
        if (!drag) return;
        const dy = e.clientY - drag.startY;
        if (!drag.moved && Math.abs(dy) < 6) return;
        drag.moved = true;
        drag.target = Math.max(0, Math.min(data.items.length - 1, drag.index + Math.round(dy / drag.rowHeight)));
        row.classList.add('dragging');
        row.style.setProperty('--drag-y', `${dy}px`);
      };
      const end = () => {
        row.removeEventListener('pointermove', move);
        row.classList.remove('dragging'); row.style.setProperty('--drag-y', '0px');
        const finished = drag; drag = null;
        if (!finished?.moved) return;
        suppressClick = true; // the click that ends a drag is not a switch
        if (finished.target !== finished.index) run(() => api.moveWorkspaceTo(finished.id, finished.target), () => {});
      };
      row.addEventListener('pointermove', move);
      row.addEventListener('pointerup', end, { once: true });
      row.addEventListener('pointercancel', end, { once: true });
    }
    function renderList() {
      const nodes = [];
      if (!data.items.length) nodes.push(el('p', 'ws-empty', t('ws.list.emptyHint')));
      data.items.forEach((workspace, index) => nodes.push(spaceRow(workspace, index)));
      if (undo && data.deleted?.some((d) => d.id === undo.id)) {
        const row = el('div', 'ws-undo');
        row.append(dataEl('span', 'ws-undo-text', t('ws.undo.deleted', { name: undo.name })),
          button(t('ws.undo.button'), 'undo', () => { const id = undo.id; run(() => api.undoRemoveWorkspace(id), () => { undo = null; }); }, 'ws-pill'));
        nodes.push(row);
      }
      // F45: anyone starting from nothing can bring Spaces over from Arc.
      if (!data.items.length) {
        const arc = button(t('ws.list.importArc'), 'import-arc', () => { close({ force: true }); api.openPage('tab-import'); });
        arc.prepend(glyph('import')); nodes.push(arc);
      }
      return nodes;
    }
    // Pinned below the scrolling list so creating stays one click away
    // however many spaces there are.
    function renderCommands() {
      const nodes = [];
      if (!errors[data.status]) {
        const add = button(t('ws.new'), 'new', () => beginNew()); add.prepend(glyph('plus')); nodes.push(add);
      }
      if (data.deleted?.length) {
        const recent = button(t('ws.list.recentlyDeleted', { count: data.deleted.length }), 'recently-deleted', () => { state = { kind: 'recovery' }; render(); }, 'ws-cmd quiet');
        recent.prepend(glyph('recover')); nodes.push(recent);
      }
      return nodes;
    }
    function guardNote(color) {
      const value = Identity.normalizeHex(color);
      const light = Identity.inkFor(value, 'light'), dark = Identity.inkFor(value, 'dark');
      const changedLight = light !== value, changedDark = dark !== value;
      if (changedLight && changedDark) return t('spaces.guard.both', { light: light.toUpperCase(), dark: dark.toUpperCase() });
      if (changedLight) return t('spaces.guard.light', { hex: light.toUpperCase() });
      if (changedDark) return t('spaces.guard.dark', { hex: dark.toUpperCase() });
      return '';
    }
    function setColor(color, { commit = true } = {}) {
      state.draft.color = color;
      const preview = popup.querySelector('.ws-editor-tile');
      if (preview) paint(preview, color);
      const editor = popup.querySelector('.ws-editor');
      if (editor) paint(editor, color); // the selected symbol takes the space's ink
      for (const sw of popup.querySelectorAll('.ws-swatch')) sw.setAttribute('aria-checked', String(sw.dataset.color ? sw.dataset.color === color : !Identity.presetFor(color)));
      const note = popup.querySelector('.ws-guard'); if (note) note.textContent = guardNote(color);
      if (commit) queueUpdate({ color });
    }
    function renderEditor() {
      const isNew = state.kind === 'new';
      const form = el('form', 'ws-editor'); form.id = 'workspaceEditor';
      paint(form, state.draft.color);
      const head = el('div', 'ws-editor-head');
      const back = button('', 'back', cancel, 'ws-icon-button'); back.setAttribute('aria-label', t('ws.recovery.back')); back.append(glyph('back'));
      head.append(back, el('h2', 'ws-editor-title', t(isNew ? 'ws.editor.newTitle' : 'ws.editor.editTitle')));
      const ident = el('div', 'ws-editor-ident');
      const preview = tile(state.draft, 'ws-tile ws-editor-tile');
      const input = el('input', 'ws-name'); input.id = 'workspaceName'; input.type = 'text'; input.maxLength = 60;
      input.value = state.draft.name; input.readOnly = !!state.pending; input.placeholder = t('ws.editor.name');
      input.setAttribute('aria-label', t('ws.editor.name'));
      input.setAttribute('aria-invalid', String(!!state.error)); input.setAttribute('aria-describedby', 'workspaceEditorError');
      input.addEventListener('input', () => {
        state.draft.name = input.value; state.touched = true;
        const problem = nameProblem(input.value, isNew ? null : state.id);
        state.error = problem ? errors[problem] : '';
        renderEditorError();
        if (!isNew && !problem) queueUpdate({ name: input.value.trim().replace(/\s+/g, ' ') }, 400);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.isComposing) { event.preventDefault(); event.stopPropagation(); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
      });
      ident.append(preview, input);
      const error = el('p', 'ws-error', state.error || state.saveError || ''); error.id = 'workspaceEditorError'; error.setAttribute('role', 'alert');
      const retry = button(t('ws.editor.retry'), 'retry', () => { state.saveError = ''; renderEditorError(); flushUpdate(); }, 'ws-pill');
      retry.hidden = !state.saveError;
      const status = el('div', 'ws-editor-status'); status.append(error, retry);

      const colorLabel = el('p', 'ws-label', t('ws.editor.color'));
      const swatches = el('div', 'ws-swatches'); swatches.setAttribute('role', 'radiogroup'); swatches.setAttribute('aria-label', t('ws.editor.color'));
      for (const preset of Identity.PRESETS) {
        const sw = button('', `color:${preset.id}`, () => { state.picker = false; setColor(preset.hex); picker?.setHex(preset.hex); renderPicker(); }, 'ws-swatch');
        sw.dataset.color = preset.hex; sw.setAttribute('role', 'radio'); sw.setAttribute('aria-label', t(`spaces.color.${preset.id}`));
        sw.setAttribute('aria-checked', String(preset.hex === state.draft.color)); sw.style.setProperty('--swatch', preset.hex);
        swatches.append(sw);
      }
      const custom = button('', 'color:custom', () => { state.picker = !state.picker; renderPicker(); }, 'ws-swatch custom');
      custom.setAttribute('role', 'radio'); custom.setAttribute('aria-label', t('spaces.color.custom'));
      custom.setAttribute('aria-checked', String(!Identity.presetFor(state.draft.color))); custom.setAttribute('aria-expanded', String(!!state.picker));
      swatches.append(custom);
      const pickerSlot = el('div', 'ws-picker-slot');
      let picker = null;
      function renderPicker() {
        custom.setAttribute('aria-expanded', String(!!state.picker));
        pickerSlot.replaceChildren();
        if (!state.picker) { picker = null; return; }
        picker = Picker.create({ document: doc, hex: state.draft.color, t,
          onInput: (hex) => setColor(hex, { commit: false }),
          onCommit: (hex) => setColor(hex) });
        pickerSlot.append(picker.element, el('p', 'ws-guard', guardNote(state.draft.color)));
      }
      renderPicker();

      const symbolLabel = el('p', 'ws-label', t('ws.editor.symbol'));
      const symbols = el('div', 'ws-symbols'); symbols.setAttribute('role', 'radiogroup'); symbols.setAttribute('aria-label', t('ws.editor.symbol'));
      for (const id of Identity.SYMBOL_IDS) {
        const sy = button('', `symbol:${id}`, () => {
          state.draft.symbol = id;
          for (const other of symbols.querySelectorAll('button')) other.setAttribute('aria-checked', String(other === sy));
          preview.replaceChildren(svgFrom(doc, Identity.SYMBOLS[id], 'ws-symbol'));
          queueUpdate({ symbol: id }, 0);
        }, 'ws-symbol-button');
        sy.setAttribute('role', 'radio'); sy.setAttribute('aria-label', t(`spaces.symbol.${id}`)); sy.setAttribute('aria-checked', String(id === state.draft.symbol));
        sy.append(svgFrom(doc, Identity.SYMBOLS[id], 'ws-symbol'));
        symbols.append(sy);
      }
      form.append(head, ident, status, colorLabel, swatches, pickerSlot, symbolLabel, symbols);

      if (isNew && !state.fixedStart) {
        const seg = el('div', 'ws-segmented'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', t('ws.editor.startWith'));
        for (const [value, text] of [['window', t('ws.editor.thisWindow', { count: data.windowTabCount ?? 0 })], ['empty', t('ws.editor.empty')]]) {
          const opt = button(text, `start:${value}`, () => { state.start = value; for (const o of seg.querySelectorAll('button')) o.setAttribute('aria-checked', String(o === opt)); }, 'ws-segment');
          opt.setAttribute('role', 'radio'); opt.setAttribute('aria-checked', String(state.start === value)); seg.append(opt);
        }
        form.append(el('p', 'ws-label', t('ws.editor.startWith')), seg, el('p', 'ws-help', t('ws.editor.help')));
      }
      const actions = el('div', 'ws-editor-actions');
      if (isNew) {
        const submit = button(state.pending ? t('ws.editor.saving') : t('ws.editor.createButton'), 'create', () => {}, 'ws-pill primary'); submit.type = 'submit';
        actions.append(button(t('common.cancel'), 'cancel', cancel, 'ws-pill'), submit);
      } else {
        const workspace = data.items.find((w) => w.id === state.id);
        actions.append(button(t('ws.delete.button'), 'delete', () => removeNow(workspace), 'ws-pill danger-text'), button(t('ws.editor.done'), 'done', finishEdit, 'ws-pill primary'));
      }
      form.append(actions);
      form.addEventListener('submit', (event) => { event.preventDefault(); if (isNew) submitNew(); else finishEdit(); });
      return form;
    }
    /** Create/Done stay disabled while the name is empty or already used. */
    function syncPrimary() {
      const primary = [...popup.querySelectorAll('button')].find((b) => b.dataset.focusKey === 'create' || b.dataset.focusKey === 'done');
      if (primary) primary.disabled = !!state.pending || !!nameProblem(state.draft?.name, state.kind === 'edit' ? state.id : null);
    }
    function renderEditorError() {
      const shown = state.touched ? state.error : '';
      const error = popup.querySelector('#workspaceEditorError'); if (error) error.textContent = shown || state.saveError || '';
      popup.querySelector('#workspaceName')?.setAttribute('aria-invalid', String(!!shown));
      const retry = [...popup.querySelectorAll('button')].find((b) => b.dataset.focusKey === 'retry');
      if (retry) retry.hidden = !state.saveError;
      syncPrimary();
    }
    function renderDecision() {
      const box = el('section', 'ws-decision'); box.setAttribute('aria-label', t('ws.decision.label'));
      const { result, action } = state;
      const protectedPages = result.error === 'protected-pages';
      const target = data.items.find((w) => w.id === action.id) ?? action.identity ?? Identity.defaultsFor(data.items);
      const head = el('div', 'ws-decision-head');
      const text = el('div', 'ws-decision-text');
      text.append(dataEl('h2', 'ws-decision-title', t('ws.decision.title', { name: action.name })),
        el('p', 'ws-switcher-confirm-msg', protectedPages
          ? t(result.reason === 'resident-capacity' ? 'ws.decision.capacity' : 'ws.decision.protected')
          : t(result.privateCount === result.tabCount ? 'ws.decision.closePrivate' : 'ws.decision.closeUnsaved', { count: result.tabCount })));
      head.append(tile(target), text);
      const actions = el('div', 'ws-decision-actions');
      if (!protectedPages && result.tabCount > result.privateCount) actions.append(button(t('ws.decision.saveThenSwitch'), 'save-first', () => beginNew({ start: 'window', original: state }), 'ws-pill primary'));
      actions.append(button(t('ws.decision.newWindow'), 'new-window', () => openAction(action, { newWindow: true }), 'ws-pill'));
      if (!protectedPages) actions.append(button(t('ws.decision.closeAndSwitch'), 'close-and-switch', () => openAction(action, { decision: result.decision }), 'ws-pill danger-text'));
      actions.append(button(t('common.cancel'), 'cancel', cancel, 'ws-pill quiet'));
      box.append(head, actions); return box;
    }
    function renderRecovery() {
      const box = el('section', 'ws-recovery');
      const head = el('div', 'ws-editor-head');
      const back = button('', 'recovery-back', () => { state = { kind: 'list' }; render(); }, 'ws-icon-button'); back.setAttribute('aria-label', t('ws.recovery.back')); back.append(glyph('back'));
      head.append(back, el('h2', 'ws-editor-title', t('ws.list.recentlyDeleted', { count: data.deleted.length })));
      box.append(head, el('p', 'ws-help', t('ws.recovery.help', { limit: number.format(WORKSPACE_LIMIT) })));
      for (const entry of data.deleted || []) {
        const row = el('div', 'ws-recovery-row');
        row.append(dataEl('span', 'ws-row-name', entry.name),
          button(t('ws.recovery.restore'), `restore:${entry.id}`, () => run(() => api.restoreWorkspace(entry.id), () => { if (undo?.id === entry.id) undo = null; }), 'ws-pill'),
          button(t('ws.recovery.forget'), `forget:${entry.id}`, () => { state = { kind: 'forget', id: entry.id, name: entry.name }; render(); }, 'ws-pill danger-text'));
        box.append(row);
      }
      return box;
    }
    function renderForget() {
      const id = state.id;
      const box = el('section', 'ws-decision');
      box.append(el('p', 'ws-switcher-confirm-msg', t('ws.forget.confirm', { name: state.name })));
      const actions = el('div', 'ws-decision-actions');
      actions.append(button(t('ws.forget.button'), 'forget', () => run(() => api.forgetWorkspace(id), () => { state = { kind: 'recovery' }; }), 'ws-pill danger-text'),
        button(t('common.cancel'), 'cancel', () => { state = { kind: 'recovery' }; render(); }, 'ws-pill quiet'));
      box.append(actions); return box;
    }
    function render() {
      syncIdentity();
      const errorText = errors[data.status];
      feedback.replaceChildren(); feedback.hidden = !errorText;
      if (errorText) { feedback.append(el('p', 'ws-error', errorText)); feedback.setAttribute('role', 'status'); }
      if (!opened) return;
      const active = doc.activeElement;
      const focusKey = popup.contains(active) ? active.dataset.focusKey : null;
      const selection = active?.id === 'workspaceName' ? [active.selectionStart, active.selectionEnd] : null;
      const scroll = list.scrollTop;
      const nodes = [];
      const viewChanged = popup.dataset.view !== state.kind;
      const before = popup.offsetHeight;
      popup.dataset.view = state.kind;
      const editing = state.kind === 'new' || state.kind === 'edit';
      if (editing) nodes.push(renderEditor());
      else if (state.kind === 'decision') nodes.push(renderDecision());
      else if (state.kind === 'recovery') nodes.push(renderRecovery());
      else if (state.kind === 'forget') nodes.push(renderForget());
      else nodes.push(...renderList());
      if (state.error && !['new', 'edit'].includes(state.kind)) { const error = el('p', 'ws-error', state.error); error.setAttribute('role', 'alert'); nodes.push(error); }
      list.replaceChildren(...nodes); list.scrollTop = scroll;
      if (editing) renderEditorError();
      const pinned = state.kind === 'list' ? renderCommands() : [];
      commands.replaceChildren(...pinned); commands.hidden = !pinned.length;
      if (viewChanged) morph(before);
      if (selection) { const input = popup.querySelector('#workspaceName'); input?.focus(); input?.setSelectionRange(...selection); }
      else if (focusKey) [...popup.querySelectorAll('button')].find((b) => b.dataset.focusKey === focusKey)?.focus();
      else if (state.kind === 'new' || state.kind === 'edit') popup.querySelector('#workspaceName')?.focus();
      layout();
    }
    // The menu reshapes into the editor (and back) by animating its height
    // from the old view's to the new one's while the contents cross-fade.
    function morph(before) {
      const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const after = popup.scrollHeight;
      if (reduced || !before || !Number.isFinite(after) || before === after) return;
      popup.style.setProperty('--ws-height', `${before}px`);
      popup.classList.add('morphing');
      void popup.offsetHeight; // commit the starting height before the transition target
      popup.style.setProperty('--ws-height', `${after}px`);
      const done = () => { popup.classList.remove('morphing'); popup.removeEventListener('transitionend', done); };
      popup.addEventListener('transitionend', done);
      setTimeout(done, 400);
    }
    popup.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); return; }
      if (event.target.tagName === 'INPUT' || event.target.closest?.('.space-picker')) return;
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']; if (!keys.includes(event.key) || event.altKey) return;
      const buttons = [...popup.querySelectorAll('button')].filter((b) => !b.disabled && !b.hidden && b.getClientRects().length);
      const at = buttons.indexOf(doc.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault(); buttons[next]?.focus();
    });
    win.addEventListener('resize', layout);
    return {
      apply(payload) {
        const same = JSON.stringify(payload) === JSON.stringify(data); data = { windowTabCount: 0, ...payload }; syncIdentity();
        if (!same && !state.pending && !['new', 'edit'].includes(state.kind)) render();
      },
      open, close, cancel, render, layout,
      /** 'new' (optionally { name, start }), 'edit' a workspace, or 'delete' one at once. */
      begin(kind, workspace = null, options = {}) {
        if (kind === 'new') beginNew(options);
        else if (kind === 'edit') beginEdit(workspace);
        else if (kind === 'delete') { open(); removeNow(workspace); }
      },
      toggle() { opened ? close() : open(); },
      switchTo(workspace) { openAction({ kind: 'open', id: workspace.id, name: workspace.name }); },
      command(name) { const existing = data.items.find((w) => w.name.toLowerCase() === name.toLowerCase()); if (existing) this.switchTo(existing); else beginNew({ name }); },
      get opened() { return opened; }, get editing() { return state.kind !== 'list'; },
      reset() { if (!state.pending) { api.cancelWorkspaceAction?.(); flushUpdate(); state = { kind: 'list' }; close({ force: true }); } },
      get state() { return state; },
    };
  }
  const exports = { create, errors, WORKSPACE_LIMIT, makeTile };
  if (typeof module !== 'undefined') module.exports = exports;
  else root.WorkspaceUI = exports;
})(typeof window !== 'undefined' ? window : globalThis);
