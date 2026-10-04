// Shows one Everyday-tools demo at a time. Without this script both demos stay
// visible and the switch stays hidden.
export function initToolDemos(root, { document = window.document, view = window } = {}) {
  const controls = root?.querySelector('[data-tool-switch]');
  if (!controls) return;
  const buttons = [...root.querySelectorAll('[data-tool-switch] button')];
  const show = id => buttons.forEach(button => {
    const target = button.getAttribute('aria-controls');
    button.setAttribute('aria-pressed', String(target === id));
    document.getElementById(target).hidden = target !== id;
  });
  buttons.forEach(button => button.addEventListener('click', () => show(button.getAttribute('aria-controls'))));
  const linked = buttons.find(button => `#${button.getAttribute('aria-controls')}` === view.location.hash);
  show((linked || buttons[0]).getAttribute('aria-controls'));
  controls.hidden = false;
}
