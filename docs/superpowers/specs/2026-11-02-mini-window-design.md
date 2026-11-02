# Mini Window (F61, #1138)

**Status:** PR 1 implemented on a candidate branch; not in a public release.
**Asked for:** #1138, from a person moving over from Arc. They wanted to look
something up or open a link from whatever app they're in, without being pulled
back to the Blanc window. Sometimes they keep the page, sometimes it should just
disappear, and sometimes they close it after use.

## What it is

A **mini window** is a small Blanc window (760 × 600, clamped to the display,
never below the ordinary 640 × 480 minimum) opened on the display under the
pointer. It holds a new tab with the Island's search focused. It is an ordinary
Blanc window in every other respect: the same Island, commands, blocking,
private tabs, downloads and permission prompts. It has `runtime.mini` set.

- **Opening one.** File → New Mini Window, and New Mini Window in the macOS
  Dock menu. Optionally, a global shortcut that works in any app while Blanc
  is running: Settings → General → Mini window shortcut. It is off by default,
  because a global shortcut takes its chord away from every other app. The
  choices per platform (`mini-window.js`):
  - macOS: ⌥⌘N, ⌃⌥Space.
  - Windows and Linux: Ctrl+Alt+Space, Ctrl+Shift+Space. No Ctrl+Alt+letter,
    because on many international layouts that is AltGr+letter and types a
    character.

  If the chord can't be registered (another app holds it, or the desktop
  doesn't allow global shortcuts, as on many Wayland sessions), Settings says
  so and suggests choosing another. The setting is device-local
  (`miniWindowShortcut`), because chords differ by platform.
- **Not saved.** A mini window is never written to `session.json`
  (`savesSessionEntry`), keeps no native window placement, and its close writes
  nothing (`windowCloseSessionEffect` → `'mini'`). Its pages stay in History.
- **Never a link's destination.** Links from other apps (`externalWindowRuntime`),
  link rules (`isLiveBrowserRuntime`) and tab handoff (`tabHandoffRuntime`)
  always pick an ordinary window. With only a mini window open, the primary
  window reopens for the link.
- **No Spaces.** A mini window can't save, switch to or create a Space
  (`'busy'`). The Island's Space mark and the panel's Spaces button are
  hidden there.
- **Closes after an hour unused.** Blurring the window starts an hour and
  focusing it cancels it. When the hour is up the window closes, unless a page
  in it is in use (capturing, sharing the screen, playing sound, loading,
  holding a pop-up, mid quiet transition) or has unsaved work
  (`probeTabDirty`). Then it waits another hour.
- **Open in Blanc.** A button that leads the Island in a mini window (in the
  place of the Space mark), and a File menu item there. It keeps the window as
  an ordinary Blanc window: it grows to a new window's size (1280 × 800) on the
  same display, is saved with the session from then on, and no longer closes
  by itself.
- **Quitting.** Mini windows don't count as open windows when the last
  ordinary Windows or Linux window closes. That close still quits Blanc and
  closes the mini windows with it. On macOS, Blanc keeps running with no
  windows as before, and the shortcut still opens a mini window.

## Decisions

- **D1. Reuse the ordinary window.** A mini window is an ordinary window
  runtime with a flag, not a new kind of window. Every tab-level policy
  (blocking, permissions, inherited document policy, downloads, find, capture)
  applies unchanged, and nothing about tabs needed a second implementation.
- **D2. Keep it by converting it.** "Open in Blanc" makes the mini window
  itself an ordinary window rather than moving its tabs into another window.
  The pages never move between windows, so no page state is at risk.
- **D3. No always-on-top.** A mini window behaves like any window: it goes
  behind the app the person clicks back into. Focusing it on macOS brings
  forward only that window, not every Blanc window.
- **D4. Off by default.** The global shortcut is opt-in, like the launch
  Sunrise and in-app link rules.

## Not in PR 1

- Moving a mini window's only tab to a Space (Move to Space ▸ needs another tab
  left behind today). Open in Blanc, then Move to Space, does it.
- Keep on top, a remembered size, a custom chord, and a portal-based global
  shortcut for Wayland.

## Tests

- Unit: `test/unit/mini-window.test.js` (choices, bounds, expiry policy,
  session, routing and Spaces exclusions, Open in Blanc, the shortcut's
  registration and Settings). `dock-menu.test.js` covers the Dock item.
- Acceptance (`spec/acceptance/mini-window.feature`, F61-1 to F61-4):
  - a mini window opens small and isn't saved;
  - the hour's check closes it;
  - Open in Blanc keeps it, and the session saves it;
  - a link from another app lands in an ordinary window;
  - the shortcut is off until chosen, then working or reported unavailable.
