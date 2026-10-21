// The homepage's floating Island window (FloatingIslandWindow.astro).

// Scales the app's pill to the box the capture ledger gives it and reveals it
// (float-window.css keeps it hidden until fitted). The component inlines this
// right after the Island so it is fitted during parsing; keep it
// self-contained, because it runs from its source text.
export function fitFloatIsland(stage, view) {
  const model = stage.querySelector('.hero-native-model');
  const pill = model?.shadowRoot?.querySelector('[id$="islandPill"]');
  if (!pill) return;
  const zoom = parseFloat(view.getComputedStyle(pill).getPropertyValue('--pill-zoom'));
  model.style.setProperty('--art-scale', String(model.clientWidth / (pill.offsetWidth * zoom)));
  model.style.setProperty('--art-visibility', 'visible');
}
