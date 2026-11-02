'use strict';

// Mini Window (#1138, F61): a small Blanc window opened over whatever the
// person is doing, from any app with an opt-in global shortcut. It isn't
// saved with the session, links from other apps never land in it, and one
// left unused for an hour closes by itself. "Open in Blanc" makes it an
// ordinary window. Pure, so the rules are unit-tested without Electron; main
// owns the window. Spec: docs/superpowers/specs/2026-11-02-mini-window-design.md

/** The size it opens at, clamped to the display; never below the ordinary
 * window's own minimum (640 × 480), which the strip's layout assumes. */
const MINI_WINDOW_SIZE = Object.freeze({ width: 760, height: 600 });
const MINI_WINDOW_MIN_SIZE = Object.freeze({ width: 640, height: 480 });
/** The size "Open in Blanc" gives it: a new ordinary window's. */
const ORDINARY_WINDOW_SIZE = Object.freeze({ width: 1280, height: 800 });
/** A mini window not focused for this long closes by itself. */
const MINI_WINDOW_IDLE_MS = 60 * 60 * 1000;
/** Margin kept between the window and the display's work area edges. */
const EDGE_MARGIN_PX = 16;

/** The global shortcut choices per platform. Every one avoids Blanc's own
 * shortcuts; the Windows and Linux ones avoid AltGr letters (Ctrl+Alt+letter
 * types a character on many international layouts). */
const MINI_WINDOW_SHORTCUTS = Object.freeze({
  'alt-cmd-n': Object.freeze({ accelerator: 'Alt+Command+N', platforms: ['darwin'] }),
  'ctrl-alt-space': Object.freeze({ accelerator: 'Control+Alt+Space', platforms: ['darwin', 'win32', 'linux'] }),
  'ctrl-shift-space': Object.freeze({ accelerator: 'Control+Shift+Space', platforms: ['win32', 'linux'] }),
});
const MINI_WINDOW_SHORTCUT_IDS = Object.freeze(['off', ...Object.keys(MINI_WINDOW_SHORTCUTS)]);

/** The shortcut ids Settings offers on `platform`, in order. */
function miniWindowShortcutChoices(platform) {
  return Object.keys(MINI_WINDOW_SHORTCUTS).filter((id) => MINI_WINDOW_SHORTCUTS[id].platforms.includes(platform));
}

/** The accelerator to register for a saved choice, or null (off, or a
 * choice this platform doesn't offer, as from a settings file copied over). */
function miniWindowAccelerator(id, platform) {
  const choice = Object.hasOwn(MINI_WINDOW_SHORTCUTS, id) ? MINI_WINDOW_SHORTCUTS[id] : null;
  return choice && choice.platforms.includes(platform) ? choice.accelerator : null;
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/** Bounds of `size` inside `workArea` (the display under the pointer):
 * clamped to it, centred across, and a little above centre, where a
 * launcher-style window is expected. */
function centredBounds(workArea, size, min = MINI_WINDOW_MIN_SIZE) {
  const area = workArea && ['x', 'y', 'width', 'height'].every((key) => finite(workArea[key]))
    ? workArea : { x: 0, y: 0, width: size.width + EDGE_MARGIN_PX * 2, height: size.height + EDGE_MARGIN_PX * 2 };
  const width = Math.round(Math.max(min.width, Math.min(size.width, area.width - EDGE_MARGIN_PX * 2)));
  const height = Math.round(Math.max(min.height, Math.min(size.height, area.height - EDGE_MARGIN_PX * 2)));
  const x = Math.round(area.x + (area.width - width) / 2);
  const y = Math.round(area.y + Math.max(0, (area.height - height) * 0.4));
  return { x, y, width, height };
}

/** Where a new mini window opens. */
function miniWindowBounds(workArea) {
  return centredBounds(workArea, MINI_WINDOW_SIZE);
}

/** Where "Open in Blanc" puts it: an ordinary window's size, on the same
 * display, centred. */
function ordinaryWindowBounds(workArea) {
  return centredBounds(workArea, ORDINARY_WINDOW_SIZE);
}

/** Whether a mini window may close by itself now. Never while a page in it
 * is in use: capturing, sharing the screen, playing sound, loading, holding
 * a pop-up, or mid quiet transition. Main also asks each page whether it has
 * unsaved work (probeTabDirty) before it closes. */
function miniWindowMayExpire(tabs) {
  return tabs.every((tab) => !!tab && !tab.capturing && !tab.displayShareBlocking && !tab.audible
    && !tab.isLoading && !tab.sleeping && !tab.waking && !(tab.popupChildren > 0));
}

module.exports = {
  MINI_WINDOW_SIZE,
  MINI_WINDOW_MIN_SIZE,
  ORDINARY_WINDOW_SIZE,
  MINI_WINDOW_IDLE_MS,
  MINI_WINDOW_SHORTCUTS,
  MINI_WINDOW_SHORTCUT_IDS,
  miniWindowShortcutChoices,
  miniWindowAccelerator,
  miniWindowBounds,
  ordinaryWindowBounds,
  miniWindowMayExpire,
};
