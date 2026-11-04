# A1 Island spike (Task 1), November 4, 2026

Plan: `docs/superpowers/plans/2026-11-04-android-a1-island.md`, Task 1. The spike was throwaway code on the build server. It was reverted afterwards, and the checkout rebuilt clean. It ran on the Android 16 Google APIs x86_64 emulator at 1080 × 1920, density 3. Evidence is in the server's `~/blanc-evidence/android/a1-spike/`.

## The seam: decided

| Question | Answer |
| --- | --- |
| Hide Chrome's toolbar without breaking `ToolbarManager`? | **Yes.** One more visibility delegate, `new BrowserControlsVisibilityDelegate(BrowserControlsState.HIDDEN)`, added to the app's `ComposedBrowserControlsVisibilityDelegate` in `TabbedRootUiCoordinator`. Hidden beats every other delegate. The toolbar, location bar and `ToolbarManager` still exist and start normally; nothing of Chrome's draws. |
| Is the page full bleed? | **Yes.** It draws from right under the status bar to the bottom edge, in portrait and in landscape. |
| Where does the Island attach? | **A native view floating over the page.** The spike added it to the window's decor view; Task 3 adds it to the tabbed activity's root so it sits above the compositor and below dialogs. Native views stay, per the design. A floating view showed no drawing problems over the compositor. |
| Does the page report scroll accurately? | **Yes**, through `GestureListenerManager.fromWebContents(wc).addListener(listener, RootScrollOffsetUpdateFrequency.ALL_UPDATES)`. The frequency is required: with the default (`NONE`), offsets stopped updating during a scroll. |
| | Offsets come in physical pixels. Divided by the density, they matched the page's `scrollY`, read over DevTools, within 1 dp: 432 → 144 (`scrollY` 144.3), 865 → 288.3 (288.7), 1298 → 432.7 (433). |
| | The extent is the viewport height (1848 px = 616 dp). The page's full height, needed for the iPhone's "always show near the end" rule, is `RenderCoordinates.fromWebContents(wc).getContentHeightPixInt()`. |
| Does a fling count as scrolling by a person? | **Yes.** The listener gets `onScrollStarted` → `onFlingStartGesture` → `onFlingEndGesture` → `onScrollEnded` around a finger's scroll and its momentum. That matches the iPhone's `isTracking \|\| isDecelerating`. Scrolling the page does itself (script, anchors, `scrollTo`) arrives as offset changes without a scroll start, so it doesn't count. |
| Back, the keyboard, rotation | Back and rotation work. The keyboard: see insets below. |

## Findings Task 3 must handle

- **Insets don't reach a view added to the window.** Chrome's own layout consumes them, so the spike's bar got zero for the system bars, the cutout and the keyboard. It sat over the gesture pill, and the keyboard covered it. Task 3 takes insets from Chrome's `InsetObserver` (from the activity's `WindowAndroid`) instead of `ViewCompat.setOnApplyWindowInsetsListener`.
- **The Island rides above the keyboard, as on the iPhone.** The iPhone's Island overlay respects the keyboard's safe area (`ContentView.swift`: the overlay isn't `ignoresSafeArea`), so a page's text field lifts it. Android includes `WindowInsetsCompat.Type.ime()` in the bottom inset.
- **Width:** in landscape the bar spans the screen. The Island view caps at 600 dp and centers, as the iPhone's does.
- **Logging:** Chromium prefixes Java log tags with `cr_`.

## Not checked here

Split-screen and freeform resizing were left to Task 3's `island-insets.mjs`, which runs three window sizes in both navigation modes.

## Fallback, not needed

Chromium's `BottomControlsStacker` with a `BOTTOM_TOOLBAR` layer would have brought Chromium's proportional scroll-away, which differs from the iPhone, and would have needed a D-row. The floating view makes that unnecessary.
