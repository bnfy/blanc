'use strict';

// One action state owns editing, validation, decisions and pending requests.
// Address/search rendering never owns this surface or its errors.
(function (root) {
  const errors = {
    'duplicate-name': 'That name is already in use. Choose another name.',
    'invalid-name': 'Enter a workspace name.',
    'limit': 'You have 25 workspaces. Delete one before adding another.',
    'not-patron': 'Creating workspaces needs Blanc Patron.',
    'not-found': 'That workspace is no longer available.',
    'read-failed': 'Couldn’t read your workspace file. Restart Blanc after checking that the file is accessible.',
    'storage-failed': 'Couldn’t save changes. Check available disk space and try again.',
    'future-format': 'These workspaces need a newer version of Blanc. Your saved file has not been changed.',
    'repair-failed': 'Couldn’t preserve a recovery copy. Your workspace file has not been changed.',
    'busy': 'Another workspace action is still finishing. Try again.',
    'activation-failed': 'Couldn’t open the workspace. Your current pages are still available.',
  };
  function create({ document: doc, window: win, api, popup, list, trigger, label, feedback, onOpenChange }) {
    let data = { items: [], deleted: [], patronActive: false, status: 'saved' };
    let state = { kind: 'list' };
    let opened = false;
    let generation = 0;
    let undoId = null;
    let invoker = trigger;
    const el = (tag, className, text) => {
      const node = doc.createElement(tag); if (className) node.className = className;
      if (text != null) node.textContent = text; return node;
    };
    const button = (text, action, className = 'ws-switcher-mini', key = text) => {
      const node = el('button', className, text); node.type = 'button'; node.dataset.focusKey = key;
      node.disabled = !!state.pending; node.addEventListener('click', action); return node;
    };
    function layout() {
      if (!opened) return;
      popup.style.maxHeight = `${Math.max(100, win.innerHeight - 16)}px`;
      const anchor = trigger.getBoundingClientRect();
      const h = popup.offsetHeight;
      popup.style.top = `${Math.max(8, Math.min(anchor.top - h - 6, win.innerHeight - h - 8))}px`;
      popup.style.right = `${Math.max(8, Math.min(win.innerWidth - anchor.right, win.innerWidth - popup.offsetWidth - 8))}px`;
    }
    function syncIdentity() {
      const current = data.items.find((w) => w.active);
      label.hidden = !current; label.textContent = current?.name || '';
      trigger.title = current ? `Workspace · ${current.name}` : 'Workspaces';
      trigger.setAttribute('aria-label', trigger.title);
      trigger.setAttribute('aria-expanded', String(opened));
      trigger.classList.toggle('ws', !!current);
      trigger.classList.toggle('bound', !!current);
    }
    function open() {
      if (!opened) invoker = doc.activeElement || trigger;
      opened = true; popup.hidden = false; onOpenChange(true); syncIdentity(); render();
      (popup.querySelector('input') || popup.querySelector('[data-current="true"]') || popup.querySelector('button'))?.focus();
    }
    function close({ force = false } = {}) {
      if (!force && (state.pending || state.kind === 'decision' || state.original || state.error)) return;
      opened = false; popup.hidden = true; onOpenChange(false); syncIdentity();
      if (state.kind !== 'decision' && !state.original) state = { kind: 'list' };
      (invoker?.isConnected ? invoker : trigger)?.focus();
    }
    function begin(kind, workspace = null, original = null) {
      if (state.pending) return;
      if (['rename', 'delete', 'manage'].includes(kind) && !workspace) { state = { kind: 'list', error: errors['not-found'] }; open(); return; }
      if (['create', 'save'].includes(kind) && !data.patronActive) { state = { kind: 'list' }; open(); return; }
      generation += 1;
      state = { kind, id: workspace?.id, value: kind === 'rename' ? workspace.name : '', name: workspace?.name, original, error: '' };
      open();
    }
    function cancel() {
      if (state.pending) return true;
      if (state.kind === 'decision') api.cancelWorkspaceAction?.();
      if (state.original) { state = state.original; render(); }
      else if (state.kind !== 'list') { state = { kind: 'list' }; render(); popup.querySelector('button')?.focus(); }
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
      if (result?.items) data = result;
      if (!result?.ok) {
        if (['unsaved-scratch', 'protected-pages'].includes(result?.error) && action) {
          state = { kind: 'decision', action, result, error: '' }; open();
        } else { state.error = state.kind === 'recovery' && result?.error === 'duplicate-name' ? 'An existing workspace uses this name. Rename it before restoring this workspace.' : errors[result?.error] || 'Couldn’t complete that action. Try again.'; render(); }
        return;
      }
      state.error = ''; success?.(result); syncIdentity(); render();
    }
    function openAction(action, options = {}) {
      run(() => action.kind === 'open' ? api.openWorkspace(action.id, options) : api.createBlankWorkspace(action.name, options), () => {
        state = { kind: 'list' }; close(); api.closeOverlay();
      }, action);
    }
    function save() {
      if (state.pending) return;
      const edit = { ...state };
      const action = { kind: 'create', name: edit.value };
      if (edit.kind === 'create') { openAction(action); return; }
      run(() => edit.kind === 'rename' ? api.renameWorkspace(edit.id, edit.value) : api.saveWorkspaceAs(edit.value), () => {
        if (edit.original) { state = edit.original; openAction(edit.original.action); }
        else { state = { kind: 'list' }; render(); }
      });
    }
    function renderEditor() {
      const form = el('form', 'ws-switcher-editor');
      const title = el('label', 'ws-editor-label', state.kind === 'rename' ? 'Rename workspace' : state.kind === 'create' ? 'New empty workspace' : 'Save this window as…');
      title.htmlFor = 'workspaceName';
      const input = el('input', 'ws-switcher-input'); input.id = 'workspaceName'; input.type = 'text'; input.maxLength = 60;
      input.value = state.value || ''; input.readOnly = !!state.pending;
      input.setAttribute('aria-invalid', String(!!state.error)); input.setAttribute('aria-describedby', 'workspaceEditorHelp workspaceEditorError');
      input.addEventListener('input', () => { state.value = input.value; });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.isComposing) { event.preventDefault(); event.stopPropagation(); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
      });
      form.addEventListener('submit', (event) => { event.preventDefault(); save(); });
      const help = el('p', 'ws-help', 'Ordinary tabs save automatically on this device, in this profile. Private pages are excluded. Workspaces share this profile’s sign-ins.'); help.id = 'workspaceEditorHelp';
      const error = el('p', 'ws-error', state.error || ''); error.id = 'workspaceEditorError'; error.setAttribute('role', 'alert');
      const actions = el('div', 'ws-switcher-confirm-acts');
      const submit = button(state.pending ? 'Saving…' : 'Save', () => {}, 'ws-switcher-mini primary'); submit.type = 'submit';
      actions.append(button('Cancel', cancel), submit);
      form.append(title, input, help, error, actions); return form;
    }
    function renderDecision() {
      const box = el('section', 'ws-switcher-confirm'); box.setAttribute('aria-label', 'Workspace switch decision');
      const { result, action } = state;
      const protectedPages = result.error === 'protected-pages';
      const message = protectedPages
        ? (result.reason === 'resident-capacity' ? 'Your retained workspaces are full. Open this workspace in another window to keep your pages available.' : 'This window has pages that need to stay open. Open the workspace in another window, or finish the active page operation and try again.')
        : `${result.tabCount} ${result.privateCount === result.tabCount ? 'private ' : 'unsaved '}tab${result.tabCount === 1 ? '' : 's'} will close. Page drafts are not saved to disk.`;
      box.append(el('p', 'ws-switcher-confirm-msg', message));
      const actions = el('div', 'ws-switcher-confirm-acts');
      actions.append(button('Cancel', cancel), button('Open in another window', () => openAction(action, { newWindow: true })));
      if (!protectedPages) {
        if (result.tabCount > result.privateCount && data.patronActive) actions.append(button('Save this window first…', () => begin('save', null, state)));
        actions.append(button('Close tabs and switch', () => openAction(action, { decision: result.decision }), 'ws-switcher-mini danger'));
      }
      box.append(actions); return box;
    }
    function workspaceRow(workspace, index) {
      const row = el('div', 'workspace-row ws-managed-row'); row.dataset.workspaceId = workspace.id;
      const openButton = button('', () => openAction({ kind: 'open', id: workspace.id, name: workspace.name }), 'ws-switcher-row' + (workspace.active ? ' on' : ''), `open:${workspace.id}`);
      openButton.dataset.current = String(workspace.active);
      const context = workspace.active ? 'Current workspace' : workspace.openElsewhere ? 'Show window' : workspace.resident ? 'Retained in memory' : 'Open workspace';
      openButton.title = `${workspace.name} · ${context} · ${workspace.tabCount} ${workspace.tabCount === 1 ? 'tab' : 'tabs'}`;
      openButton.setAttribute('aria-label', openButton.title);
      if (workspace.active) openButton.setAttribute('aria-current', 'true');
      openButton.append(el('span', 'ws-switcher-tick', workspace.active ? '✓' : ''), el('span', 'ws-switcher-name', workspace.name), el('span', 'ws-switcher-n', workspace.openElsewhere ? 'Show window' : `${workspace.tabCount}`));
      const manage = button('•••', () => { begin('manage', workspace); }, 'ws-manage-button', `manage:${workspace.id}`); manage.setAttribute('aria-label', `Manage ${workspace.name}`);
      row.append(openButton, manage); return row;
    }
    function renderManagement() {
      const box = el('section', 'ws-switcher-editor'); box.append(el('p', 'ws-editor-label', state.name));
      const workspace = data.items.find((w) => w.id === state.id);
      if (!workspace) return el('p', 'ws-help', 'That workspace is no longer available.');
      const index = data.items.indexOf(workspace);
      box.append(button('Back', () => { state = { kind: 'list' }; render(); }), button('Rename', () => begin('rename', workspace)), button('Delete…', () => begin('delete', workspace)));
      for (const direction of ['up', 'down']) {
        const move = button(`Move ${direction}`, () => run(() => api.moveWorkspace(workspace.id, direction), () => {}));
        move.disabled ||= direction === 'up' ? index === 0 : index === data.items.length - 1; box.append(move);
      }
      return box;
    }
    function renderDeletion() {
      const box = el('section', 'ws-switcher-confirm');
      box.append(el('p', 'ws-switcher-confirm-msg', `Delete “${state.name}”? Open tabs stay available. You can restore the saved workspace from Recently Deleted for seven days.`));
      const id = state.id;
      box.append(button('Cancel', cancel), button('Delete workspace', () => run(() => api.removeWorkspace(id), () => { undoId = id; state = { kind: 'list' }; }), 'ws-switcher-mini danger'));
      return box;
    }
    function renderRecovery() {
      const box = el('section', 'ws-recovery'); box.append(button('Back to workspaces', () => { state = { kind: 'list' }; render(); }), el('p', 'ws-help', 'Saved workspaces are recoverable for seven days. Up to 25 deleted workspaces are kept.'));
      for (const entry of data.deleted || []) {
        const row = el('div', 'ws-recovery-row'); row.append(el('span', 'ws-switcher-name', entry.name), button('Restore', () => run(() => api.restoreWorkspace(entry.id), () => { undoId = null; })), button('Delete permanently…', () => { state = { kind: 'forget', id: entry.id, name: entry.name }; render(); })); box.append(row);
      }
      return box;
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
      if (['save', 'create', 'rename'].includes(state.kind)) nodes.push(renderEditor());
      else if (state.kind === 'decision') nodes.push(renderDecision());
      else if (state.kind === 'manage') nodes.push(renderManagement());
      else if (state.kind === 'delete') nodes.push(renderDeletion());
      else if (state.kind === 'recovery') nodes.push(renderRecovery());
      else if (state.kind === 'forget') {
        const id = state.id;
        const confirm = el('section', 'ws-switcher-confirm'); confirm.append(el('p', 'ws-switcher-confirm-msg', `Permanently delete “${state.name}”? This saved workspace cannot be restored.`), button('Cancel', () => { state = { kind: 'recovery' }; render(); }), button('Delete permanently', () => run(() => api.forgetWorkspace(id), () => { state = { kind: 'recovery' }; }), 'ws-switcher-mini danger')); nodes.push(confirm);
      } else {
        nodes.push(...data.items.map(workspaceRow));
        if (!data.items.length) nodes.push(el('p', 'ws-help', 'No saved workspaces yet.'));
        if (undoId && data.deleted?.some((d) => d.id === undoId)) nodes.push(button('Workspace deleted · Undo', () => run(() => api.restoreWorkspace(undoId), () => { undoId = null; })));
        if (data.deleted?.length) nodes.push(button(`Recently Deleted (${data.deleted.length})`, () => { state = { kind: 'recovery' }; render(); }));
        if (!data.patronActive) nodes.push(button('Patron settings', () => { close(); api.openPage('settings', 'patron'); }));
      }
      if (state.error && !['save', 'create', 'rename'].includes(state.kind)) { const error = el('p', 'ws-error', state.error); error.setAttribute('role', 'alert'); nodes.push(error); }
      list.replaceChildren(...nodes); list.scrollTop = scroll;
      const naming = state.kind !== 'list';
      for (const id of ['wsSwitcherSep', 'wsSwitcherNew', 'wsSwitcherSaveAs']) doc.getElementById(id).hidden = naming || !data.patronActive || !!errors[data.status];
      if (selection) { const input = popup.querySelector('input'); input?.focus(); input?.setSelectionRange(...selection); }
      else if (focusKey) [...popup.querySelectorAll('button')].find((b) => b.dataset.focusKey === focusKey)?.focus();
      layout();
    }
    popup.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); return; }
      if (event.target.tagName === 'INPUT') return;
      const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']; if (!keys.includes(event.key)) return;
      const buttons = [...popup.querySelectorAll('button')].filter((b) => !b.disabled && !b.hidden && b.getClientRects().length);
      const current = buttons.indexOf(doc.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault(); buttons[next]?.focus();
    });
    win.addEventListener('resize', layout);
    return {
      apply(payload) { const same = JSON.stringify(payload) === JSON.stringify(data); data = payload; syncIdentity(); if (!same && !state.pending) render(); },
      open, close, cancel, render, layout, begin,
      toggle() { opened ? close() : open(); },
      switchTo(workspace) { openAction({ kind: 'open', id: workspace.id, name: workspace.name }); },
      command(name) { const existing = data.items.find((w) => w.name.toLowerCase() === name.toLowerCase()); if (existing) this.switchTo(existing); else { begin('save'); state.value = name; render(); } },
      get opened() { return opened; }, get editing() { return state.kind !== 'list'; },
      reset() { if (!state.pending) { api.cancelWorkspaceAction?.(); state = { kind: 'list' }; close(); } },
      get state() { return state; },
    };
  }
  const exports = { create, errors };
  if (typeof module !== 'undefined') module.exports = exports;
  else root.WorkspaceUI = exports;
})(typeof window !== 'undefined' ? window : globalThis);
