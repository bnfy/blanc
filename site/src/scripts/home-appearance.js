// Self-contained: BaseLayout serializes this small function into the home head,
// before paint. Access storage inside try because even its getter can throw.
export function restoreHomeAppearance(document, view) {
  let appearance = 'light';
  try {
    if (view.localStorage.getItem('blanc-home-appearance') === 'dark') appearance = 'dark';
  } catch { /* The page still works when local storage is unavailable. */ }
  document.documentElement.dataset.homeAppearance = appearance;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', appearance === 'dark' ? '#1b1a18' : '#ffffff');
  return appearance;
}

export function initHomeAppearance({ document = window.document, view = window, onChange = () => {} } = {}) {
  const root = document.documentElement;
  const button = document.getElementById('hero-appearance');
  const label = button.querySelector('.appearance-label');
  const apply = ({ manual = false } = {}) => {
    const dark = root.dataset.homeAppearance === 'dark';
    const appearance = dark ? 'dark' : 'light';
    root.dataset.homeAppearance = appearance;
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', `Switch page to ${dark ? 'light' : 'dark'} mode`);
    label.textContent = dark ? 'Dark' : 'Light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1a18' : '#ffffff');
    // The hero keeps its light product surface for contrast against both canvases.
    document.querySelectorAll('blanc-glance-island').forEach(model => {
      model.dataset.appearance = appearance;
    });
    if (manual) {
      try { view.localStorage.setItem('blanc-home-appearance', appearance); } catch { /* In-memory toggle remains available. */ }
    }
    return onChange({ manual });
  };
  button.addEventListener('click', () => {
    root.dataset.homeAppearance = root.dataset.homeAppearance === 'dark' ? 'light' : 'dark';
    apply({ manual: true });
  });
  apply();
  // Initial restoration is immediate; only subsequent user changes transition.
  view.requestAnimationFrame(() => { root.dataset.homeAppearanceReady = 'true'; });
}
