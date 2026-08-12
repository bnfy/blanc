// The one definition of the quiet (Zzz) glyph, shared by the Island panel row
// (overlay.js) and the vertical rail (vertical-tabs.js). Loaded as a classic
// script before both renderers in index.html and overlay.html. The path is kept
// on a single line: it is the contract, asserted verbatim by the unit tests.
window.QUIET_GLYPH_SVG =
  '<svg class="quiet-glyph" viewBox="0 0 16 16" aria-hidden="true">' +
  '<path d="M1.5 9.75H6.25L1.5 14H6.25M7.75 5.5H11.5L7.75 9H11.5M12.75 1.75H15L12.75 4.25H15"/>' +
  '</svg>';
