'use strict';
// Which Settings section the sidebar marks as current. Served flat to the
// settings page via a <script> tag AND require-able by node tests (same
// dual-environment pattern as settings-verify-model.js).
//
// Each section is scored by how much of ITSELF is inside the view — the box
// of the element that actually scrolls — highest wins. A fixed trigger line
// fails here: Privacy & Security is taller than the short trailing sections
// combined, so near the bottom their headers could never cross it. A positive
// tie goes to the later section so scrolling down keeps advancing; a zero tie
// stays on the first. A deep-linked section keeps the marker while its
// heading is in the upper 45% of the view.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancSettingsNavModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function currentSection(sections, view, anchoredId) {
    const height = view.bottom - view.top;
    const anchored = sections.find((section) => section.id === anchoredId);
    if (anchored && anchored.top >= view.top && anchored.top < view.top + height * 0.45) {
      return { id: anchored.id, anchored: true };
    }
    let best = null;
    let bestRatio = -1;
    for (const section of sections) {
      const size = section.bottom - section.top;
      const visible = Math.max(0, Math.min(section.bottom, view.bottom) - Math.max(section.top, view.top));
      const ratio = size > 0 ? visible / size : 0;
      if (ratio > bestRatio || (ratio > 0 && ratio === bestRatio)) {
        bestRatio = ratio;
        best = section;
      }
    }
    return { id: best?.id ?? null, anchored: false };
  }

  return { currentSection };
});
