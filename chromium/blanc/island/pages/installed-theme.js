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
    if (enabled) {
      const channels = text.slice(1).match(/../g).map(value => parseInt(value, 16));
      const light = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > 128;
      root.style.setProperty('--theme-icon-filter', light ? 'brightness(0) invert(1)' : 'brightness(0)');
    } else root.style.removeProperty('--theme-icon-filter');
    const toolbar = enabled && /^chrome:\/\/blanc-prototype\/theme-toolbar\.png\?[a-p]{32}$/.test(theme.toolbarImage || '');
    if (toolbar) {
      root.style.setProperty('--theme-toolbar-image', `url("${theme.toolbarImage}")`);
      const foreground = hex(theme.toolbarImageText) || theme.text;
      root.style.setProperty('--theme-toolbar-text', foreground);
      const rgb = foreground.slice(1).match(/../g).map(value => parseInt(value, 16));
      root.style.setProperty('--theme-toolbar-icon-filter', rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > 128 ? 'brightness(0) invert(1)' : 'brightness(0)');
    } else {
      root.style.removeProperty('--theme-toolbar-image');
      root.style.removeProperty('--theme-toolbar-text');
      root.style.removeProperty('--theme-toolbar-icon-filter');
    }
    root.toggleAttribute('data-store-toolbar', !!toolbar);
    root.toggleAttribute('data-store-theme', !!enabled);
  }
  window.BlancInstalledTheme = { apply };
})();
