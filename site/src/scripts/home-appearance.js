const STORAGE_KEY = 'blanc-home-appearance';
const SYSTEM_DARK = '(prefers-color-scheme: dark)';

// Self-contained: BaseLayout serializes this small function into the home head,
// before paint. Access storage inside try because even its getter can throw.
// An explicit saved choice wins; otherwise the page follows the system theme.
export function restoreHomeAppearance(document, view) {
  let appearance = null;
  try {
    const stored = view.localStorage.getItem('blanc-home-appearance');
    if (stored === 'dark' || stored === 'light') appearance = stored;
  } catch { /* The page still works when local storage is unavailable. */ }
  if (!appearance) {
    try {
      appearance = view.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch { appearance = 'light'; }
  }
  document.documentElement.dataset.homeAppearance = appearance;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', appearance === 'dark' ? '#1b1a18' : '#ffffff');
  return appearance;
}

export function initHomeAppearance({ document = window.document, view = window, onChange = () => {} } = {}) {
  const root = document.documentElement;
  const button = document.getElementById('home-appearance');
  let system = null;
  try { system = view.matchMedia(SYSTEM_DARK); } catch { /* Only the toggle changes the page. */ }
  let followSystem = true;
  try {
    const stored = view.localStorage.getItem(STORAGE_KEY);
    followSystem = stored !== 'dark' && stored !== 'light';
  } catch { /* Without storage, the page follows the system until toggled. */ }
  const apply = ({ manual = false } = {}) => {
    const dark = root.dataset.homeAppearance === 'dark';
    const appearance = dark ? 'dark' : 'light';
    root.dataset.homeAppearance = appearance;
    button.setAttribute('aria-pressed', String(dark));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1a18' : '#ffffff');
    // The hero keeps its light product surface for contrast against both canvases.
    document.querySelectorAll('blanc-glance-island').forEach(model => {
      model.dataset.appearance = appearance;
    });
    if (manual) {
      followSystem = false;
      try { view.localStorage.setItem(STORAGE_KEY, appearance); } catch { /* In-memory toggle remains available. */ }
    }
    return onChange({ manual });
  };
  button.addEventListener('click', () => {
    root.dataset.homeAppearance = root.dataset.homeAppearance === 'dark' ? 'light' : 'dark';
    apply({ manual: true });
  });
  // Until the visitor chooses, a system theme change carries the page with it.
  system?.addEventListener('change', () => {
    if (!followSystem) return;
    root.dataset.homeAppearance = system.matches ? 'dark' : 'light';
    apply();
  });
  button.hidden = false;
  apply();
  // Initial restoration is immediate; only subsequent changes transition.
  view.requestAnimationFrame(() => { root.dataset.homeAppearanceReady = 'true'; });
}
