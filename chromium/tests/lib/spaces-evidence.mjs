// The Spaces menu rebuilds its rows whenever its data changes. Windows nights
// (20261124 to 20261127) clicked a Space's edit button and never saw the
// editor (F41-named-workspaces:16, :133, :152, :236), the suspicion being a
// rebuild between press and release, which sends no click. Recording from the
// start of each case leaves the steps' timing as it is; a case that fails on a
// Spaces menu control carries what the menu did.
export const spacesFailure = message => /data-focus-key|#workspaceName|Space editor/.test(String(message));

function install() {
  if (window.__blancSpacesEvidence) return true;
  const menu = document.getElementById('workspaceSwitcher');
  if (!menu) return false;
  const d = window.__blancSpacesEvidence = {started: performance.now(), entries: []};
  const note = text => { d.entries.push(Math.round(performance.now() - d.started) + 'ms ' + text); if (d.entries.length > 40) d.entries.shift(); };
  new MutationObserver(records => {
    for (const r of records) for (const n of r.removedNodes)
      if (n.nodeType === 1 && (n.matches('[data-focus-key^="edit:"]') || n.querySelector('[data-focus-key^="edit:"]'))) { note('rows rebuilt'); return; }
  }).observe(menu, {childList: true, subtree: true});
  new MutationObserver(() => note('view ' + menu.dataset.view + (menu.hidden ? ' (hidden)' : '') + (menu.classList.contains('morphing') ? ' (morphing)' : '')))
    .observe(menu, {attributes: true, attributeFilter: ['data-view', 'hidden', 'class']});
  for (const type of ['pointerdown', 'pointerup', 'click'])
    document.addEventListener(type, e => note(type + ' ' + (e.target.closest?.('[data-focus-key]')?.dataset.focusKey ?? e.target.nodeName) + (e.target.isConnected ? '' : ' (removed)')), true);
  return true;
}
function read() {
  const d = window.__blancSpacesEvidence, menu = document.getElementById('workspaceSwitcher');
  return {recorded: Boolean(d), entries: d?.entries ?? [], view: menu?.dataset.view, hidden: menu?.hidden,
    focus: document.activeElement?.dataset?.focusKey ?? document.activeElement?.nodeName};
}
export async function recordSpacesEvidence(world) {
  await world.app.refresh();
  return (await world.frame('overlay')?.evaluate(install).catch(() => false)) ?? false;
}
export async function spacesEvidence(world) {
  await world.app.refresh().catch(() => {});
  return world.frame('overlay')?.evaluate(read).catch(error => ({unreadable: error.message})) ?? {unreadable: 'no overlay document'};
}
