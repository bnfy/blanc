// Pure per-window runtime records for the 1.1 architecture (design:
// docs/superpowers/specs/2026-08-08-window-runtime-foundation-design.md).
// M1 instantiates exactly one runtime; M2 adds more. No Electron imports —
// windows and views are opaque references here, which is what keeps the
// lifecycle unit-testable.

const { DEFAULT_PROFILE_ID, validProfileId } = require('./local-profile-model');
const { DEFAULT_GLANCE_RATIO } = require('./glance-layout');

let nextId = 1;
let runtimes = [];
const tabOwner = new Map(); // tabId -> runtime
const surfaceOwner = new Map(); // chrome webContents id -> runtime
// Auxiliary web content owned by a runtime — real window.open popup children,
// which are NOT chrome surfaces and must never gain chrome-IPC trust. Kept in
// its own map so a lookup here can never satisfy runtimeForChromeWebContentsId.
const auxiliaryOwner = new Map(); // web webContents id -> runtime

/** The full per-window inventory, initialized to main.js's current defaults.
 * The spec's state-inventory table is the contract for this shape. */
function createRuntime({ id = null, profileId = DEFAULT_PROFILE_ID } = {}) {
  const resolvedId = id ?? nextId++;
  if (!validProfileId(profileId)) throw new Error(`Invalid local profile id: ${profileId}`);
  if (runtimes.some((runtime) => runtime.id === resolvedId)) {
    throw new Error(`Window runtime already exists: ${resolvedId}`);
  }
  const runtime = {
    id: resolvedId,
    profileId,
    closing: false,
    window: null,
    tabOrder: [],
    activeTabId: null,
    groups: [],
    /** Temporary second visible tab. Glance is deliberately workspace-local
     * and ephemeral: it never crosses windows/profiles or session restore. */
    glanceTabId: null,
    glanceRatio: DEFAULT_GLANCE_RATIO,
    /** Reopen-closed history belongs to this native workspace, not the app
     * process. Entries remain memory-only, matching the pre-M2 behavior, and
     * the newest may hold the closed tab's still-live view (spec §2.1). */
    closedEntries: [],
    // The island's expanded states (command bar, ⌘L palette, find capsule)
    // render in a separate always-on-top WebContentsView so they float OVER
    // the web content instead of growing the strip and shifting content
    // down. It is attached to win.contentView only while something is
    // showing.
    /** @type {WebContentsView | null} */
    overlayView: null,
    /** @type {null | 'panel' | 'palette' | 'find' | 'shield' | 'capture'} */
    overlayMode: null,
    /** Companion to overlayMode, replayed alongside it below if the
     * overlay's first load hadn't finished when showOverlay was called. */
    overlayPrefill: null,
    /** Optional panel intent such as the explicit Glance tab picker. */
    overlayPurpose: null,
    /** Chip right edge (window coords) captured when the shield popover
     * opens; reused if bounds recompute (e.g. window resize) while it's up. */
    shieldAnchorRight: null,
    /** Same, for the capture popover's chip (its only trigger control). */
    captureAnchorRight: null,
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
    /** The floating bottom-center permission-prompt view; attached only
     * while permissionPrompts is non-empty. */
    permissionView: null,
    permissionViewAttached: false,
    tabsWantingAddressBarFocus: new Set(),
    /** Tab ids in activation order, most recent last, one occurrence per id.
     * Closing the active tab returns to the most recent survivor here (see
     * tab-activation.js). Memory-only: never persisted, synced, or exposed
     * over IPC; pruned as tabs close, so bounded by the live tab count. */
    activationHistory: [],
    chromeHeight: 64,
    tabsBroadcastTimer: null,
    themeTintRefreshGeneration: 0,
    lastActiveByCluster: new Map(),
    railActivationSerial: 0,
    permissionPrompts: new Map(),
    addressMenuTicket: 0,
    addressMenuSeq: 0,
    /** The resting pill's box in window coordinates, reported by the chrome
     * renderer. Main needs it to measure how far the cursor is from the pill:
     * the cursor spends most of its life over the page, which is a different
     * view from the one the pill lives in, so the chrome never sees it. */
    islandRect: null,
    /** Last proximity actually sent, so an unchanged value costs no IPC. */
    islandProximity: { k: 0, lean: 0 },
    islandProximitySentAt: 0,
    islandProximityTimer: null,
    islandProximityPending: null,
    /** Pending detach of the overlay view while its panel retracts. */
    overlayExitTimer: null,
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

/** Ownership for real window.open popup children — permission-prompt
 * resolution ONLY. Deliberately disjoint from surfaceOwner: a lookup here
 * can never satisfy runtimeForChromeWebContentsId, so registering a popup
 * can never confer chrome-IPC trust on untrusted web content. */
function registerAuxiliaryContent(runtime, wcId) { auxiliaryOwner.set(wcId, runtime); }
function unregisterAuxiliaryContent(wcId) { auxiliaryOwner.delete(wcId); }
const runtimeForAuxiliaryContent = (wcId) => auxiliaryOwner.get(wcId) ?? null;

function attachWindow(runtime, { window }) { runtime.window = window; }

/** macOS window close: the window, overlay, and sheet die; the workspace
 * (tabs, selection, groups) survives for dock-reopen. Every surface the
 * runtime still holds is unregistered so late IPC from the dying chrome
 * resolves to nothing rather than to a window that no longer exists. */
function detachWindow(runtime) {
  for (const [wcId, owner] of surfaceOwner) {
    if (owner === runtime) surfaceOwner.delete(wcId);
  }
  for (const [wcId, owner] of auxiliaryOwner) {
    if (owner === runtime) auxiliaryOwner.delete(wcId);
  }
  runtime.window = null;
  runtime.overlayView = null;
  runtime.overlayMode = null;
  runtime.overlayPrefill = null;
  runtime.overlayPurpose = null;
  runtime.glanceTabId = null;
  runtime.utilitySheetView = null;
  runtime.utilitySheetUrl = null;
  runtime.permissionView = null;
  runtime.permissionViewAttached = false;
}

/** A user-closed secondary window has no dock-reopen contract. Remove every
 * ownership edge after main.js has released its tabs and native surfaces. */
function discardRuntime(runtime) {
  if (!runtime || !runtimes.includes(runtime)) return null;
  detachWindow(runtime);
  for (const [tabId, owner] of tabOwner) {
    if (owner === runtime) tabOwner.delete(tabId);
  }
  runtimes = runtimes.filter((candidate) => candidate !== runtime);
  return runtime;
}

/** Test isolation only — main.js never resets. */
function resetForTests() {
  nextId = 1;
  runtimes = [];
  tabOwner.clear();
  surfaceOwner.clear();
  auxiliaryOwner.clear();
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
  registerAuxiliaryContent,
  unregisterAuxiliaryContent,
  runtimeForAuxiliaryContent,
  attachWindow,
  detachWindow,
  discardRuntime,
  resetForTests,
};
