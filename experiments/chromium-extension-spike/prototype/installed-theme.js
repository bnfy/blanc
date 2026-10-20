'use strict';
// Theme styling is an overlay, never a write to Blanc's wallpaper preferences.
(() => {
  const hex = value => /^#[0-9a-f]{6}$/i.test(value) ? value : null;
  const keys = ['bg', 'surface', 'surface-raised', 'island-resting-surface', 'text', 'text-dim',
    'accent', 'accent-dim', 'border'];
  function apply(doc, theme, start = false) {
    if (!doc?.documentElement) return;
    const root = doc.documentElement;
    const enabled = theme?.id && hex(theme.surface) && hex(theme.text);
    const surface = start ? theme?.background : theme?.surface;
    const text = start ? theme?.backgroundText : theme?.text;
    const values = [surface, surface, surface, surface, text, text,
      start ? theme?.link : text, `${text}18`, `${text}50`];
    keys.forEach((key, i) => {
      for (const name of [`--${key}`, `--sunrise-${key}`]) {
        for (const target of start && doc.body ? [root, doc.body] : [root]) {
          if (enabled) target.style.setProperty(name, values[i]);
          else target.style.removeProperty(name);
        }
      }
    });
    root.toggleAttribute('data-store-theme', !!enabled);
  }
  window.BlancInstalledTheme = { apply };
})();
