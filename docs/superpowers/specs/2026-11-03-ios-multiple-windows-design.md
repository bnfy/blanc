# Blanc for iPad: multiple windows — design

**Date:** 2026-11-03
**Status:** Approved by the owner on 2026-11-03, with the four calls in §9
decided as proposed. W1 is being built. The owner skipped the design
questions, so every other choice is Claude's call.
**Builds on:** [the iPad plan](../plans/2026-11-03-ios-ipad.md) (iPad-3),
[the iPhone Duo design](2026-10-21-ios-iphone-duo-design.md) §6 ("Multiple
windows (later)"), `spec/` F32 (Spaces) and D11 (window model), and desktop's
per-window runtime (`src/main/window-runtime-registry.js`,
`workspace-controller.js`, `workspace-residency.js`).

## 1. What this is and why

On an iPad (and on the iPhone Duo's inner display), iPadOS lets an app have
several windows. They can sit side by side, overlap in Stage Manager or the
iPadOS 26 window system, or wait in the app's window list. Today Blanc has one.
Desktop Blanc's model is one independent set of tabs per window, and that's
what people who use Blanc on a computer will expect on an iPad.

**Success:** someone can keep Work in one window and Reading in another, see
both at once, move a tab from one to the other, and find both exactly as they
left them after a relaunch. Nothing about one window changes because of what
happens in the other.

**Anti-goals:**
- An iPhone that behaves differently. An iPhone has one window and must look
  and work exactly as it does now.
- A window that silently loses tabs when it closes.
- Two windows showing the same Space and fighting over it.

## 2. Platform facts

- `UIApplicationSupportsMultipleScenes = YES` (in `UIApplicationSceneManifest`)
  turns it on. SwiftUI's `WindowGroup` then makes a new instance of its root
  view per window. On iPhone the key has no effect: there is only ever one
  window. The Duo gets multiple windows on its inner display only (Duo design
  §2).
- Each window is a scene with a `UISceneSession`, and its
  `persistentIdentifier` survives relaunches. SwiftUI exposes per-window
  storage through `@SceneStorage`. iPadOS can drop a background window's scene
  to free memory and bring it back later from its session.
- **Closing a window is two different things.** Swiping a window away in the
  window list discards its session (`application(_:didDiscardSceneSessions:)`).
  Closing it with the window control in the iPadOS 26 window system can keep
  it in the app's window list. The app is told about the first; the second is
  just a disconnect.
- New windows: `openWindow` (SwiftUI) or
  `UIApplication.requestSceneSessionActivation`. The latter can carry an
  `NSUserActivity`, which is how "open this tab in a new window" and drag and
  drop say what the new window is for.

## 3. The model

### 3.1 Split `TabsManager` in two

Today `TabsManager` (about 2,100 lines) owns both the device's shared things
and one window's tabs. It splits into:

**`BrowserServices` (one per app)**
- **Settings, history and Favorites:** `SettingsStore`, `HistoryStore` and the
  favorites store.
- **Sync:** the `SyncEngine` and Shared Spaces state (`sharedBaselines`,
  `sharedAccepted`, `sharedAccount`, `recoveryNoted`).
- **Content blocking:** the `ContentBlocker`, its compiled rule list and its
  exceptions.
- **Web data:** the site and private `WKWebsiteDataStore`s. Private tabs in
  any window share the private store, as desktop's private tabs share one
  session.
- **Spaces:** the Spaces library: `spaces`, `recentlyDeleted`, the This iPhone
  set (see owner call 3 for its name on iPad), and which window shows which
  set.
- **Recently closed:** `RecentlyClosedStore`, the reopen list and Undo. Undo
  stays per window; the list is the device's.
- **Saving:** the `SessionStore`, which now writes every window (§5).
- **Reader and pages:** Reader preferences, `BlancSchemeHandler` and
  `PagesBridge`.

**`TabsManager` (one per window).** It keeps its name and API, so views
barely change.
- **The window's tabs:** `tabs`, `groups`, `splits`, `glanceTabId`,
  `activeTabId`, quiet-tab state, `shownSetId`, the per-tab callbacks, and
  Undo for this window.
- **The window's surfaces:** the palette, the Spaces menu, sheets and
  `showsWideLayout`.
- **Its services:** it reads and writes the shared things through
  `services`, so `manager.settingsStore` keeps working as a forwarding
  property.

`ContentView(manager:)` is unchanged; `BlancApp` hands each window its own
manager.

### 3.2 Which set a window shows

A window shows one tab set: This iPhone or one Space, as now.
- **A set is shown in at most one window.** Choosing a Space that another
  window shows brings that window forward instead
  (`requestSceneSessionActivation` with its session), as desktop's
  workspace controller does (`openElsewhere`).
- **A new window** shows a new, unsaved set of its own: one Start Page tab,
  like desktop's new window. It isn't a Space until the person saves it as
  one. (Owner call 2, §9.)
- **Private tabs** belong to the window they're in, as now: never saved and
  never synced.

### 3.3 What crosses windows

- **Favorites, history, settings, sync, Spaces, Recently closed:** shared,
  through `BrowserServices`.
- **Moving a tab:** "Move to New Window" (desktop's `menu.newWindow` family;
  the exact string is checked when building) and, later, dragging a tab card
  to another window. The tab's page moves without reloading where WebKit
  allows it: the same `TabModel` and `WKWebView` are handed to the other
  window's manager. Splits and Glance stay with their window; a moved tab
  leaves its split and its Glance.
- **Links from other apps** (`IncomingLinks`) open in the window that was in
  front most recently (desktop's `resolveExternalRuntime`). The pairing code
  question shows in that window too.
- **Sync's "this device's open tabs"** is every window's ordinary tabs
  together, in window order, so other devices see one list for the iPad, as
  they see one list for a desktop with several windows. (To confirm against
  desktop's snapshot when building.)

## 4. Opening and closing windows

- **Opening:**
  - ⌘N and File → New Window (desktop's `menu.newWindow`). The keyboard menu
    from bnfy/blanc#1330 gains it.
  - Move to New Window in a tab's menu.
  - The system's own ways: the app icon's menu, the window list's +.
- **Closing a window** (swipe away, or ⌘W on its last tab):
  - Its ordinary tabs go into Recently closed as one entry, like desktop's
    Close Window. That entry is reopenable for its usual time; Space-backed
    windows also keep their Space as it was. (Owner call 1, §9.)
  - Its private tabs close for good, as now.
  - The last remaining window never closes this way: closing its last tab
    opens a Start Page, as today.
- **A window iPadOS dropped from memory** comes back with its tabs quiet and
  only the selected tab loading, as a relaunch does now.

## 5. Saving and restoring

- `session.json` version 3 adds `windows: [{ id, shown, set, private: false }]`,
  each keyed by the window's `UISceneSession.persistentIdentifier` and holding
  what today's single `state` holds for one window. The flat `urls` /
  `activeIndex` mirror stays: it holds the most recently active window, so a
  rollback to a version-2 build opens that window's tabs.
- **Splits** stay in each window's `SavedSet` (bnfy/blanc#1325). Glance is
  never saved, as now.
- **On launch** each restored scene finds its entry by session id. A session
  iPadOS no longer has (swiped away while Blanc wasn't running) is handled at
  the next launch like a closed window (§4).
- **Migration from version 2:** the existing state becomes the first window's.

## 6. Phases

| Phase | Delivers | Visible change |
|---|---|---|
| **W1** | `BrowserServices` extracted: settings, history, Favorites, sync, content blocking, the web data stores, Reader preferences, Recently closed and the session store. `TabsManager` reads them through it. Still one window. | None. All existing tests pass unchanged. |
| **W2** | The Spaces library and Shared Spaces state move into `BrowserServices` with session v3 (W1 leaves them on `TabsManager`, since v3 rewrites that state anyway). Multiple scenes on: a manager per window, ⌘N and New Window, Move to New Window, a set shown in one window only, links to the front window, sync's union of windows, closing a window into Recently closed. | Multiple windows on iPad and the Duo. |
| **W3** | Drag a tab card or palette row to another window (or out to make one); scene restoration and Stage Manager checks; the window list's titles (the window's Space name or current page). | Polish. |

W1 is the risky refactor and ships alone, behind no flag, with no behavior
change, so any regression shows up before windows exist.

## 7. Tests

- **Unit:**
  - Two managers over one `BrowserServices` keep separate tabs while sharing
    Favorites, history and settings.
  - A set can't be shown in two windows at once.
  - Session v3 round-trips, and v2 migrates.
  - A closed window becomes one Recently closed entry.
  - Sync's tab list is the union of the windows.
  - Moving a tab carries the same `TabModel`.
- **UI** (iPad simulator, iOS 27.2+):
  - Open a second window with ⌘N; both keep their own tabs.
  - Move a tab to a new window.
  - Relaunch restores both windows.
  - An incoming link opens in the front window.
  XCUITest can drive multiple windows on iPad through the window list. If it
  can't on this Xcode, those checks are done by hand and said so.
- **iPhone:** the existing UI suite on an iPhone simulator, unchanged.

## 8. Not doing

- Multiple windows on iPhone (iOS doesn't offer them).
- A window per profile. iOS has no profiles yet.
- Syncing which windows exist to other devices.

## 9. The owner's calls (decided 2026-11-03)

1. **Closing a window** puts its ordinary tabs into Recently closed as one
   entry, like desktop's Close Window. Decided: yes.
2. **A new window starts** with one Start Page in an unsaved set. Decided: yes.
3. **"This iPhone" on an iPad** is renamed "This iPad" in copy on iPad, all
   languages in one PR. Decided: yes.
4. **W1 ships on its own first.** Decided: yes.
