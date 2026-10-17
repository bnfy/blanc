'use strict';

// Main's authority on a typed bang: the settings (switch, the person's own
// bangs, recents) in, the site URL out. The overlay draws its hint row from
// the same pure module (src/renderer/pages/bangs.js) but never navigates on
// its own: a bang row's Enter sends the typed text to tabs:navigate, and this
// resolves it once more, so the two surfaces cannot disagree. Spec:
// docs/superpowers/specs/2026-10-16-bangs-design.md, "Resolution on Enter".
//
// Pure apart from the settings object it is given; unit-tested in isolation.

function createBangResolver({ settings, catalog, Bangs }) {
  /** The typed text's bang, resolved, or null when bangs are off or the code
   * is unknown. Records the primary code as recently used unless the tab is
   * private — recents are usage data, and private tabs leave no trace. */
  function resolveTyped(text, { private: isPrivate = false } = {}) {
    const current = settings.getSettings();
    if (!current.bangsEnabled) return null;
    const resolved = Bangs.resolveBang(text, catalog, current.customBangs);
    if (!resolved) return null;
    if (!isPrivate) settings.recordRecentBang(resolved.code);
    return resolved;
  }

  /** Whether the text carries a bang-shaped token at either end, known or
   * not, switch on or off. Search suggestions refuse such text outright: the
   * words beside a bang are meant for one site, never for the suggestion
   * service. */
  function hasBangToken(text) {
    return Bangs.parseBang(text) !== null;
  }

  /** What the chrome documents need to draw the hint row and picker. */
  function state() {
    const current = settings.getSettings();
    return {
      enabled: current.bangsEnabled === true,
      custom: current.customBangs.map((b) => ({ code: b.code, name: b.name, template: b.template })),
      recent: [...current.recentBangs],
    };
  }

  return { resolveTyped, hasBangToken, state };
}

module.exports = { createBangResolver };
