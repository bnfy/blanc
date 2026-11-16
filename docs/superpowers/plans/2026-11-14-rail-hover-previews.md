# Rail Hover Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner prefers inline execution). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Chromium fork's vertical tab rail, resting on a tab row shows a picture card beside the rail, and resting on a collapsed group's header shows a list card whose rows show the picture card next to them.

**Architecture:** A pure state machine (`rail-hover.js`, no DOM) decides when cards open, swap and close and what each card shows; `host.js` feeds it pointer, focus and key events from the strip document's rail and draws two plain elements in the host document (`rail-hover-card.js`). Pictures come from Chromium's `ThumbnailTabHelper` through new host requests in `blanc_prototype_ui.cc`, which also adds the list card's rectangle to the Island view's click area.

**Tech Stack:** Plain browser JS in the Island host (WebUI), `node:test` with `vm` contexts, Chromium C++ (`chrome/browser/ui/thumbnails`).

**Spec:** `docs/superpowers/specs/2026-11-14-rail-hover-previews-design.md` (approved by the owner 2026-11-14, layout A, no Settings switch yet).

## Global Constraints

- Work on `chromium/next`; merge `origin/chromium/next` in before pushing; never rebase or force-push; no PR to main.
- No change to the Electron app (`src/`), and no hand edits to generated shipping copies: the `vertical-tabs.js` change goes through `tools/island-renderer.mjs` `EDITS`.
- No build: never run apply.py, gn or build.mjs, and never write under the Mac Studio's `~/Projects/Blanc/src` or `~/Projects/Blanc/repo` (beta.4 was published 2026-11-14 19:02 UTC; the tree sits at 57e3109dd with patches applied). Read-only checks there are allowed.
- No Settings switch and no new strings: card text reuses shipping keys `rail.state.quiet` and `rail.state.private`; titles, hosts and group names are page data (`data-i18n-ignore`).
- Timings: open after 500ms rest (`OPEN_DELAY_MS = 500`); swap instantly while a card is up; 150ms grace leaving the rail (`LEAVE_GRACE_MS = 150`); 300ms thumbnail reply cap (`THUMBNAIL_WAIT_MS = 300`); 120ms fade in, none under Reduce motion, no exit animation.
- Sizes: picture card 280px wide, 16:10 picture; list card 220px wide, at most 12 rows then scroll; 8px gaps from the rail and between cards.
- Privacy: never request, show or keep a private tab's picture; never subscribe to a quiet tab's thumbnail; pictures live only in memory for the card on screen.
- Every new served file goes in `blanc/island-assets.json` `manifest` (SHA-256) and `blanc/island_resources/served.txt`.

## Review Focus

- A tab closing, moving to another window, or becoming private while its card is up: the card must close, and the native watch must end without a dangling subscription.
- A restored tab that has never loaded (not discarded, `NeedsReload()`): hovering must not load it (the `asleep` rule covers it; the native test pins it).
- The pointer crossing the rail quickly toward the page to click: no card may open, and a pending timer must not fire after the pointer has left the rail.
- Theme or private-look change, window resize or rail resize while a card is up: the card closes rather than drawing at a stale spot.
- A group expanded, renamed, emptied or closed while its list card is up: the card closes.

---

### Task 1: Pure hover rules (`rail-hover.js`)

**Files:**
- Create: `chromium/blanc/island/rail-hover.js`
- Test: `chromium/tests/rail-hover.test.mjs`

**Interfaces:**
- Produces, on `window.BlancRailHover`:
  - `OPEN_DELAY_MS = 500`, `LEAVE_GRACE_MS = 150`.
  - `initialState() -> {phase: 'idle'|'waiting'|'shown'|'leaving', target: Target|null, list: Target|null, row: Target|null}`, frozen.
  - `Target = {kind: 'tab', tabId} | {kind: 'split', splitId} | {kind: 'group', groupId}`; inside the list card a row is `{kind: 'tab', tabId, inList: true}`.
  - `step(state, event) -> {state, effects: Effect[]}`. Events: `{type:'enter', target}`, `{type:'focus', target}`, `{type:'leave-rail'}`, `{type:'enter-list'}`, `{type:'leave-list'}`, `{type:'enter-row', target}` (a list row), `{type:'timer'}`, `{type:'grace'}`, `{type:'row-key'}` (ArrowUp/ArrowDown/Home/End on the rail), `{type:'dismiss', reason}` (click, scroll, other key, drag, blur, resize, tab switch, surface, glance, snapshot change). Effects: `{type:'start-timer', ms}`, `{type:'start-grace', ms}`, `{type:'cancel-timers'}`, `{type:'show', card:'picture'|'list', target}`, `{type:'hide', card:'picture'|'list'|'all'}`.
  - `pictureFor(tab, {activeTabId, visibleTabIds}) -> 'none'|'private'|'quiet'|'live'|'page'`: `'private'` when `tab.private`; `'page'` for `blanc://`/`chrome://` URLs; `'none'` for the active tab or a visible split pane; `'quiet'` when `tab.asleep`; else `'live'`.
  - `groupCardFor(group) -> boolean`: true only when `group.collapsed`.
  - `suppressed({layout, glanceOpen, surfaceOpen, dragging, railHidden}) -> boolean`.

- [ ] **Step 1: Write the failing tests** in `chromium/tests/rail-hover.test.mjs`, loading the file into a `vm` context as `tests/tab-selection.test.mjs` does. Tests:
  - `opens after the rest delay`: `enter` from idle gives `start-timer` with `ms: 500`; `timer` then gives `show` `picture` for that tab.
  - `swaps at once while shown`: from shown, `enter` another tab gives `show` with no `start-timer`.
  - `a new row restarts the wait`: from waiting, `enter` another tab gives `cancel-timers` then `start-timer` 500; a stale `timer` for the first target can't show it (the state's target is the second).
  - `leaving starts the grace, entering the list keeps it`: from shown on a group, `leave-rail` gives `start-grace` 150; `enter-list` cancels it; `grace` from leaving gives `hide` `all`.
  - `leaving before the delay never opens`: waiting, `leave-rail`, then `timer` shows nothing.
  - `group rows`: `enter` a group target shows `list` (after the delay); `enter-row` inside it waits 500 the first time, then swaps instantly.
  - `row keys swap, other dismissals close`: shown + `focus` another target swaps; any `dismiss` gives `hide` `all` and returns to `idle`.
  - `pictureFor` table: private beats asleep; active and visible split panes give `'none'`; `blanc://newtab/` gives `'page'`; asleep gives `'quiet'`; ordinary background gives `'live'`.
  - `groupCardFor`: collapsed true, expanded false.
  - `suppressed`: true for island layout, Glance open, any surface, a drag, or a hidden rail.

- [ ] **Step 2: Run the test to see it fail**
  Run: `node --test chromium/tests/rail-hover.test.mjs`
  Expected: FAIL (cannot read file / `BlancRailHover` undefined).

- [ ] **Step 3: Implement `chromium/blanc/island/rail-hover.js`** as an IIFE that sets `window.BlancRailHover` (or `self` in `vm`), like `hover-panel-leave.js`: frozen states, no DOM, no timers of its own.

- [ ] **Step 4: Run the test to see it pass**
  Run: `node --test chromium/tests/rail-hover.test.mjs`
  Expected: PASS, all tests.

- [ ] **Step 5: Commit**
  `git add chromium/blanc/island/rail-hover.js chromium/tests/rail-hover.test.mjs && git commit -m "Fork: rail hover preview rules"`

### Task 2: Native thumbnails and the list card's click area

**Files:**
- Modify: `chromium/blanc/browser/ui/blanc_prototype_ui.cc` (owner struct near line 1333 `interactive_bounds`; `IslandView::DoesIntersectRect` near 1853; `Handler::Handle` near 9584; tab close cleanup where the owner drops per-tab state)
- Test: `chromium/tests/rail-hover-native.test.mjs`

**Interfaces:**
- Consumes: `ThumbnailTabHelper::From(tabs::TabInterface*)` (`chrome/browser/ui/thumbnails/thumbnail_tab_helper.h`), `tabs::TabInterface::MaybeGetFromContents`, `ThumbnailImage::Subscribe()`, `Subscription::SetCompressedImageCallback(base::RepeatingCallback<void(ThumbnailImage::CompressedThumbnailData)>)`, `ThumbnailImage::RequestCompressedThumbnailData()`, `blanc::private_tabs::IsPrivateTab`.
- Produces (host requests):
  - `tabThumbnail [tabId:int] -> {image: string|null}`. `image` is `"data:image/jpeg;base64,…"`.
  - `watchThumbnail [tabId:int] -> true|false` and `unwatchThumbnail [] -> true`. While watched, new data arrives as `window.BlancPrototypeHost?.tabThumbnail(tabId, dataUrl)`.
  - `hoverCardBounds [x:int, y:int, w:int, h:int] -> true` (host coordinates; `0,0,0,0` clears).
- Owner fields: `gfx::Rect hover_card_bounds;`, `std::unique_ptr<ThumbnailImage::Subscription> thumbnail_watch;`, `int thumbnail_watch_tab = -1;`.

- [ ] **Step 1: Write the failing test** `chromium/tests/rail-hover-native.test.mjs`. It reads `blanc_prototype_ui.cc` as text and checks the rules that would cost most if lost:
  - `private check precedes the thumbnail`: inside the `tabThumbnail` and `watchThumbnail` handlers, `IsPrivateTab` appears before `ThumbnailTabHelper::From`.
  - `quiet tabs never subscribe`: in `tabThumbnail`, the asleep branch (the same `DISCARDED`/`NeedsReload()` test the snapshot's `asleep` uses) returns before any `Subscribe()`; `watchThumbnail` refuses asleep tabs.
  - `hit area`: `hover_card_bounds.Intersects(rect)` appears in both branches of `IslandView::DoesIntersectRect`.
  - `host and native agree`: every request name used by `rail-hover-card.js`/`host.js` for this feature (`tabThumbnail`, `watchThumbnail`, `unwatchThumbnail`, `hoverCardBounds`) has a `method == "<name>"` handler.

- [ ] **Step 2: Run it to see it fail**
  Run: `node --test chromium/tests/rail-hover-native.test.mjs`
  Expected: FAIL on each check.

- [ ] **Step 3: Implement the handlers** in `Handler::Handle`, finding the tab by `sessions::SessionTabHelper::IdForTab` as `switchTab` does.
  - Asleep tabs: read existing compressed data only if `ThumbnailImage` exposes it without subscribing (check `thumbnail_image.h` in the tree); otherwise reply `{image: null}`.
  - Awake tabs: subscribe, `RequestCompressedThumbnailData()`, reply on the first callback or after `THUMBNAIL_WAIT_MS` (300) with null, whichever comes first, through a `WeakPtr` so a closed host is safe; drop the one-off subscription after replying.
  - `watchThumbnail` replaces any earlier watch; it ends on `unwatchThumbnail`, on that tab's close or detach, and on the host's teardown.
  - Encode with `base::Base64Encode` into a `data:image/jpeg;base64,` URL.
  - Change no BUILD.gn: the file compiles inside `chrome/browser/ui/views/frame` (`blanc_ui`), whose target already reaches the thumbnails code through Chromium's own hover card. A BUILD.gn change would need a `gn gen` run, which writes to the build folder and needs the owner's approval.

- [ ] **Step 4: Run the test to see it pass**
  Run: `node --test chromium/tests/rail-hover-native.test.mjs`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git add chromium/blanc/browser/ui/blanc_prototype_ui.cc chromium/tests/rail-hover-native.test.mjs && git commit -m "Fork: tab thumbnails and hover card click area for the rail"`

### Task 3: The cards in the host

**Files:**
- Create: `chromium/blanc/island/rail-hover-card.js`
- Modify: `chromium/blanc/island/host.html` (load `rail-hover.js` and `rail-hover-card.js` before `host.js`; add `<div id="railHoverCards" aria-hidden="true"></div>`), `chromium/blanc/island/host.css`, `chromium/blanc/island/host.js`, `chromium/blanc/island-assets.json`, `chromium/blanc/island_resources/served.txt`
- Test: `chromium/tests/rail-hover-card.test.mjs`

**Interfaces:**
- Consumes: `BlancRailHover` (Task 1); host requests from Task 2; existing `request('switchTab', [nativeId(id)])` and `request('toggleGroupCollapsed', [groupId])`.
- Produces, on `window.BlancRailHoverCard`:
  - `cardModel(snapshot, target, {image}) -> {kind:'picture'|'list', title, host, picture:'none'|'private'|'quiet'|'live'|'page', image: string|null, favicon, panes?: [...], rows?: [{tabId, title, favicon}], name?, color?}` (pure; splits give `panes`, one entry per pane with its own `picture` rule).
  - `place(anchor, card, viewport, {railRight}) -> {left, top}`: 8px right of `railRight` (or of the list card), vertically centered on the anchor for pictures, top-aligned for lists, clamped inside `viewport`.
  - `render(root, model, position)` / `clear(root)`: builds DOM with `textContent` only.

- [ ] **Step 1: Write the failing tests** in `chromium/tests/rail-hover-card.test.mjs` for the pure parts (`cardModel`, `place`), loading `rail-hover.js` then `rail-hover-card.js` into a `vm` context:
  - `host from url`: `https://mail.example.com/x` gives `mail.example.com`; a private tab's model has `picture: 'private'` and `image: null` even if an image is passed.
  - `list rows`: a collapsed group of 14 tabs gives 14 rows in tab order (the 12-row cap is a CSS height, not data).
  - `split panes`: a split row gives two panes in order, the visible ones `picture: 'none'`.
  - `placement`: anchored at y=700 in a 760px viewport, a 220px-tall card is clamped to top 532; `left` is `railRight + 8`.

- [ ] **Step 2: Run to see it fail**
  Run: `node --test chromium/tests/rail-hover-card.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Implement `rail-hover-card.js`**, and the host wiring in `host.js`:
  - Extend the strip-document hook (beside `hookHover`, ~line 2591) with `pointerover`/`pointerout` on `.vertical-tab-primary`, `.vertical-split-row`, `.vertical-tabs-group[data-collapsed="true"]` headers, `focusin` on rail buttons, and `keydown`, mapping each to a `BlancRailHover.step` event; run its effects with host `setTimeout`s.
  - Feed `dismiss` from: any `mousedown`/`wheel` in the strip, `blur`, `resize`, every `refresh()` whose snapshot changes the shown target (tab gone, private flipped, group expanded or gone), `show()`/`showSheet()`/`showSettingsSheet()`/`showExtensions()`/pane menu/permission prompt, `syncGlance()` with a Glance open, and tab drags (`tab-drag.js` sets `dragging` on the strip root, or the rail's `drag-active` class; use whichever the strip already exposes).
  - Picture card: `request('tabThumbnail', [id])` when `picture === 'live'|'quiet'`; then `watchThumbnail` while it shows a live tab; `unwatchThumbnail` on hide or retarget. `BlancPrototypeHost.tabThumbnail(id, url)` updates the image only if `id` is still the card's tab.
  - List card: on show, send its rect with `hoverCardBounds`; clear with zeros on hide. A row click: `toggleGroupCollapsed` when the group is still collapsed, then `switchTab`, then dismiss.
  - Escape: if a card is up, `preventDefault`, dismiss, nothing else.
  - `host.css`: `#railHoverCards` cards with the Island panel's values (light `#ffffff` bg, `#dedede` border, `#0e0e0e` text, `#6b6b6b` dim; dark `#1f1f1f`, `#2e2e2e`, `#f5f5f5`, `#9c9c9c`; private `:root[data-theme="private"]` values from `styles.css`), 18px radius, the panel shadow, Instrument Sans width 98 +0.01em; `pointer-events: none` on the picture card; 120ms opacity fade in, none under `prefers-reduced-motion: reduce`.
  - Add both new files to `served.txt` and their SHA-256 to `island-assets.json` `manifest`; update `host.js`/`host.html`/`host.css` hashes.

- [ ] **Step 4: Run tests and the asset check**
  Run: `node --test chromium/tests/rail-hover-card.test.mjs chromium/tests/rail-hover.test.mjs && node chromium/tools/assets.mjs --check`
  Expected: PASS; the asset check prints no problems.

- [ ] **Step 5: Commit**
  `git add chromium/blanc/island chromium/blanc/island-assets.json chromium/blanc/island_resources/served.txt chromium/tests/rail-hover-card.test.mjs && git commit -m "Fork: rail hover preview cards"`

### Task 4: Rail rows drop the system tooltip while previews are on

**Files:**
- Modify: `chromium/tools/island-renderer.mjs` (`EDITS['vertical-tabs.js']`), regenerated `chromium/blanc/island/vertical-tabs.js`, its hash in `chromium/blanc/island-assets.json`
- Test: `chromium/tools/island-renderer.test.mjs` (existing; extend)

**Interfaces:**
- Consumes: the host sets `document.documentElement.dataset.railPreviews = 'on'` on the strip document when the vertical layout is active (Task 3 wiring).
- Produces: two declared edits, each anchored once: `primary.title = tab.pageTitle || title;` and `primary.title = viewport.textContent;` become guarded by `document.documentElement.dataset.railPreviews !== 'on'`.

- [ ] **Step 1: Add the failing assertion** to `island-renderer.test.mjs`: the generated `vertical-tabs.js` contains both guarded forms and neither unguarded assignment.
- [ ] **Step 2: Run to see it fail:** `node --test chromium/tools/island-renderer.test.mjs` → FAIL.
- [ ] **Step 3: Add the two edits** to `EDITS['vertical-tabs.js']` and regenerate: `node chromium/tools/island-renderer.mjs --write --ref $(node -p "require('./chromium/blanc/island-renderer.json').ref")` (same ref, so only these edits change); update the file's manifest hash.
- [ ] **Step 4: Verify:** `node --test chromium/tools/island-renderer.test.mjs && node chromium/tools/island-renderer.mjs --check && node chromium/tools/assets.mjs --check` → all pass.
- [ ] **Step 5: Commit:** `git commit -am "Fork: rail rows leave tooltips to the hover card"`

### Task 5: Verify, record, push

**Files:**
- Modify: `chromium/STATUS.md` (a dated entry at the top of Current work: what shipped on the branch, what was checked, what waits for beta.4)

- [ ] **Step 1: Fork unit suite:** `node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs` → all pass (record the count).
- [ ] **Step 2: Patch check:** `python3 chromium/tools/check-patches.py` → passes (no patch changes expected).
- [ ] **Step 3: Syntax-only compile** of `blanc_prototype_ui.cc` on the Mac Studio (`ssh -i ~/.ssh/id_ed25519_macmini -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local`), reading the tree only:
  - First `pgrep -fl "siso|ninja|build.mjs|apply.py|release.mjs"` prints nothing.
  - The file must be based on 57e3109dd (merge nothing newer into it before this check, or compare against what the tree holds).
  - `scp` it to `/tmp/hover-check/blanc_prototype_ui.cc`; in `~/Projects/Blanc/src/out/BlancBeta`, take `defines`, `include_dirs`, `cflags`, `cflags_cc` from `obj/chrome/browser/ui/views/frame/blanc_ui.ninja` and run `../../third_party/llvm-build/Release+Asserts/bin/clang++ -fsyntax-only $defines $include_dirs -iquote ../../blanc/browser/ui $cflags $cflags_cc /tmp/hover-check/blanc_prototype_ui.cc` → no errors.
  - Delete `/tmp/hover-check`.
- [ ] **Step 4: STATUS.md entry**, then `git fetch origin chromium/next && git merge origin/chromium/next` (if it moved), rerun Step 1 if the merge brought changes, and `git push origin chromium/next`.
