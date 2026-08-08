// Pure per-window runtime records for the 1.1 architecture (design:
// docs/superpowers/specs/2026-08-08-window-runtime-foundation-design.md).
// M1 instantiates exactly one runtime; M2 adds more. No Electron imports —
// windows and views are opaque references here, which is what keeps the
// lifecycle unit-testable.

let nextId = 1;
let runtimes = [];
const tabOwner = new Map(); // tabId -> runtime
const surfaceOwner = new Map(); // chrome webContents id -> runtime

/** The full per-window inventory, initialized to main.js's current defaults.
 * The spec's state-inventory table is the contract for this shape. */
function createRuntime() {
  const runtime = {
    id: nextId++,
    window: null,
    tabOrder: [],
    activeTabId: null,
    groups: [],
    // The island's expanded states (command bar, ⌘L palette, find capsule)
    // render in a separate always-on-top WebContentsView so they float OVER
    // the web content instead of growing the strip and shifting content
    // down. It is attached to win.contentView only while something is
    // showing.
    /** @type {WebContentsView | null} */
    overlayView: null,
    /** @type {null | 'panel' | 'palette' | 'find' | 'shield'} */
    overlayMode: null,
    /** Companion to overlayMode, replayed alongside it below if the
     * overlay's first load hadn't finished when showOverlay was called. */
    overlayPrefill: null,
    /** Chip right edge (window coords) captured when the shield popover
     * opens; reused if bounds recompute (e.g. window resize) while it's up. */
    shieldAnchorRight: null,
    /** The site the open shield popover describes, captured at open time —
     * the tab's live url may already read as the NEW site when
     * did-start-navigation fires, so a live recompute could never detect
     * the site change. */
    shieldPopoverHost: null,
    /** Which control opened the popover: 'shield' | 'insecure' | null.
     * Re-click of the SAME control toggles shut; the other control
     * re-anchors instead. Also rides chrome:island-state so each button's
     * aria-expanded is truthful, and tells the Escape path which control
     * gets focus back. */
    shieldTrigger: null,
    utilitySheetView: null,
    utilitySheetUrl: null,
    tabsWantingAddressBarFocus: new Set(),
    chromeHeight: 64,
    tabsBroadcastTimer: null,
    themeTintRefreshGeneration: 0,
    lastActiveByCluster: new Map(),
    onePasswordFillInFlight: false,
    railActivationSerial: 0,
    permissionPrompts: new Map(),
    addressMenuTicket: 0,
    addressMenuSeq: 0,
  };
  runtimes.push(runtime);
  return runtime;
}

const all = () => [...runtimes];

function attachTab(runtime, tabId) { tabOwner.set(tabId, runtime); }
function detachTab(tabId) { tabOwner.delete(tabId); }
const runtimeForTab = (tabId) => tabOwner.get(tabId) ?? null;

/** A runtime routes IPC from TWO chrome surfaces with different lifecycles:
 * the strip (window-long) and the overlay (created lazily, destroyable).
 * Each creation registers; each destruction unregisters. */
function registerChromeSurface(runtime, wcId) { surfaceOwner.set(wcId, runtime); }
function unregisterChromeSurface(wcId) { surfaceOwner.delete(wcId); }
const runtimeForChromeWebContentsId = (wcId) => surfaceOwner.get(wcId) ?? null;

function attachWindow(runtime, { window }) { runtime.window = window; }

/** macOS window close: the window, overlay, and sheet die; the workspace
 * (tabs, selection, groups) survives for dock-reopen. Every surface the
 * runtime still holds is unregistered so late IPC from the dying chrome
 * resolves to nothing rather than to a window that no longer exists. */
function detachWindow(runtime) {
  for (const [wcId, owner] of surfaceOwner) {
    if (owner === runtime) surfaceOwner.delete(wcId);
  }
  runtime.window = null;
  runtime.overlayView = null;
  runtime.overlayMode = null;
  runtime.overlayPrefill = null;
  runtime.utilitySheetView = null;
  runtime.utilitySheetUrl = null;
}

/** Test isolation only — main.js never resets. */
function resetForTests() {
  nextId = 1;
  runtimes = [];
  tabOwner.clear();
  surfaceOwner.clear();
}

module.exports = {
  createRuntime,
  all,
  attachTab,
  detachTab,
  runtimeForTab,
  registerChromeSurface,
  unregisterChromeSurface,
  runtimeForChromeWebContentsId,
  attachWindow,
  detachWindow,
  resetForTests,
};
