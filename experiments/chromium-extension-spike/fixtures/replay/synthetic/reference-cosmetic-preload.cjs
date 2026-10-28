// Isolated reference correction. Bundled with the reference's own Ghostery
// selector evaluator; no native renderer implementation or fixture selectors.
function startReferenceCosmetics(electron, evaluator) {
  if (window !== window.top || !/^https?:$/.test(location.protocol)) return;
  const result = electron.ipcRenderer.sendSync('blanc/reference-cosmetics/start');
  if (!result?.active) return;
  for (const script of result.scripts) {
    // Electron copies the function into the main world before page scripts run.
    // No page-supplied code, eval in the main world, or CSP relaxation.
    electron.contextBridge.executeInMainWorld({func: new Function(script)});
  }
  const rules = result.extended || [];
  const applied = new Map();
  let pending = false;
  const refresh = () => {
    pending = false;
    if (!document.documentElement) return;
    observer.disconnect();
    // Remove only attributes we installed before matching computed-style rules.
    for (const [attribute, elements] of applied) for (const node of elements) node.removeAttribute(attribute);
    applied.clear();
    for (const rule of rules) {
      try {
        const nodes = evaluator.querySelectorAll(document.documentElement, rule.ast);
        if (rule.attribute) {
          let entries = applied.get(rule.attribute);
          if (!entries) applied.set(rule.attribute, entries = new Set());
          for (const node of nodes) entries.add(node);
        } else if (rule.directive) for (const node of nodes) evaluator.handlePseudoDirective(node, rule.directive);
      } catch (error) { console.error('Reference extended selector failed', rule.id, String(error)); }
    }
    for (const [attribute, nodes] of applied) for (const node of nodes) node.setAttribute(attribute, '');
    observer.observe(document, {subtree:true, childList:true, attributes:true, characterData:true});
  };
  const schedule = () => {if (!pending) {pending = true; queueMicrotask(refresh);}};
  const observer = new MutationObserver(schedule);
  observer.observe(document, {subtree:true, childList:true, attributes:true, characterData:true});
  document.addEventListener('DOMContentLoaded', refresh, {once:true});
  window.addEventListener('resize', schedule);
  document.addEventListener('load', schedule, true);
  window.addEventListener('pagehide', () => observer.disconnect(), {once:true});
  schedule();
}
