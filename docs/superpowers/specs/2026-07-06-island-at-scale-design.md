# Blanc — Island at Scale & Action Affordances

**Date:** 2026-07-06
**Status:** Approved design — ready for implementation planning
**Surfaces:** the resting island pill (`src/renderer/renderer.js`, `src/renderer/styles.css`) and a small downloads-activity signal (`src/main/downloads.js`, `src/main/main.js`, `src/main/preload.js`)

---

## 1. Problem

Two gaps, both in the resting island pill:

1. **No overflow handling.** `render()` in [renderer.js:145](../../../src/renderer/renderer.js) draws one `island-dot` per unpinned tab across *every* group cluster, plus every pinned dot in the shelf, with no cap. All pill children are `flex: 0 0 auto` inside `#islandPill { max-width: calc(100vw - 170px) }`. Past a couple dozen tabs the dots shove the favicon → domain → shield off the right edge (clipped by `body { overflow: hidden }`) — the "where am I" block is the first casualty.

2. **Common actions aren't visible.** Back/forward/reload/favorite/downloads are reachable only via keyboard or the ⌘L command bar. Users migrating from other browsers expect these as visible, one-click buttons.

## 2. Principles (the through-line)

1. **Minimal ≠ hidden.** Aggressively collapsing everything behind one affordance is visually minimal but functionally costly. Frequently-used targets stay directly clickable; only the genuinely-distant long tail earns a trip to the ⌘L list.
2. **The pill shows *current context*; scale lives in a list.** The pill is not a map of the whole workspace — that ambition is what produced cognitive overload in exploration. "Large numbers of tabs/groups/pins" get handled the way every app handles large numbers: in the ⌘L panel, which already exists.
3. **Lean on familiar patterns.** Nothing on the pill should be a new symbol a person has to learn to read. The prior direction stacked novel vocabulary (favicon-pin capsules, named group count-capsules, windowed `+k`, `+grps·tabs` aggregate tails) on top of Blanc's already-novel dot language — the density of *unfamiliar concepts* was the overload, not clutter. This design deletes all of it.

## 3. The design

### 3.1 Resting pill, left → right

```
[ ← → ] │ [ current-group dots · cap 8 · +k ] [ ▣ favicon · group · domain ] [ ◈ shield ] │ [ ↺ ♡ ↓* ]
  nav          current context                        identity                status        page tools
```

Everything is standard browser furniture. Below ~a dozen tabs in the active group it looks essentially like today plus the action buttons; the overflow only engages under pressure.

### 3.2 Navigation — back / forward *(new on the pill)*

- Two leading icon buttons.
- Enabled state driven by `activeTab.canGoBack` / `activeTab.canGoForward` (already in the payload — [main.js:228](../../../src/main/main.js), refreshed by `syncNavState()` at [main.js:793](../../../src/main/main.js)). When false, the button is greyed and non-interactive.
- Click → `browserAPI.goBack(activeTabId)` / `browserAPI.goForward(activeTabId)` (existing IPC `tabs:back` / `tabs:forward`, [main.js:1340](../../../src/main/main.js)).

### 3.3 Current-group dots + overflow *(simplified — replaces multi-cluster rendering)*

The pill's dots represent **only the active tab's group**, not the whole workspace.

- **Dot set:** tabs sharing the active tab's `groupId` (a `null` groupId = the ungrouped set), excluding pinned tabs — **but always including the active tab itself**, even if it is pinned (you must see where you are). In pseudocode:
  ```
  const g = activeTab.groupId;
  const dots = tabs.filter(t => (t.groupId ?? null) === (g ?? null)
                                && (!t.pinned || t.id === activeTabId));
  ```
- **Cap = 8.** If `dots.length <= 8`, render them all. Otherwise render an 8-dot window that **always contains the active tab** (slide the window so the active dot stays visible), followed by a single quiet `+k` where `k = dots.length − shown`. No windowing math is exposed to the user — it reads as "your current area, and there's more."
- The active dot is highlighted (`.active`, accent) exactly as today ([renderer.js:129](../../../src/renderer/renderer.js) `tabDot`). Loading and private dot states are unchanged.
- **Clicking a dot** switches to that tab (`browserAPI.switchTab`, unchanged). **Clicking `+k`** (or the pill body) opens the ⌘L panel — the full list.
- No caps-ule, no group name on the cluster, no folded/dim clusters, no pinned shelf. Those concepts are gone from the pill.

### 3.4 Identity block *(unchanged)*

`favicon · active-group-name · domain`, exactly as today ([renderer.js:193](../../../src/renderer/renderer.js)). The active group's name still shows before the domain (`pillGroupName`). Under width pressure the **domain ellipsizes** and the group name hides *before* any nav button, dot, or action button yields (see §3.7). Shield (`◈` count), private chip, and the insecure badge remain as-is — contextual, hidden when not applicable.

### 3.5 Actions — reload/stop · favorite · downloads *(new on the pill)*

Trailing cluster, grouped after the shield behind a hairline divider:

- **Reload / Stop.** Shows reload normally; while `activeTab.isLoading`, shows a stop (×) glyph. Click → `browserAPI.reload(activeTabId)` or `browserAPI.stop(activeTabId)` (existing `tabs:reload` / `tabs:stop`).
- **Favorite.** A heart that fills when `activeTab.bookmarked` is true (already in the payload). Click → `browserAPI.toggleBookmark()` (existing `tabs:toggle-bookmark`, which acts on the active tab — [main.js:1350](../../../src/main/main.js)). *Naming:* the control is labelled "Favorite" per the design system, but the internal call stays `toggleBookmark` — do not rename the internals (matches the existing Favorites/`bookmarks` split).
- **Downloads (contextual).** Hidden by default. Appears only while there is **active or recent** download activity, with a progress ring while downloading. Click → opens `blanc://downloads` (`browserAPI.openPage('downloads')`, existing) **and acknowledges** the activity (clears the "recent" flag so the button fades). See §4.2 for the new signal that drives visibility.

### 3.6 Removed from the pill

Deleted from `render()` / `clusterTabs()` in renderer.js and their CSS:

- the pinned shelf (`.pinned-shelf`) — pins now live only in ⌘L (already rendered there, §3.8),
- multi-group cluster rendering, folded group capsules (`.pill-cluster.folded`), dimmed non-active clusters (`.pill-cluster.dim`), and the `focusGroup`-on-capsule click,
- `dot-mini` (used only by the folded capsule + pinned shelf).

`renderer.js` no longer needs `clusterTabs()`; it computes just the active group's dot set. `overlay.js` keeps its own `clusterTabs()` for the panel — the two are no longer parallel, so the "keep in sync" note in CLAUDE.md must be updated (§6).

### 3.7 Width behavior — no measured-budget engine

Because the dots are fixed-capped at 8 and the only naturally-variable element is the domain string, we **do not** need the ResizeObserver/greedy-fit "budget" system considered earlier. Width pressure is absorbed with CSS:

- The identity block gets `min-width: 0` and the domain `overflow: hidden; text-overflow: ellipsis` so it shrinks first.
- Nav buttons, dots, shield, and action buttons are `flex: 0 0 auto` and never drop.
- *(Optional polish, not required for v1:)* a single coarse width breakpoint may lower the dot cap (e.g. 8 → 4) on very narrow windows. This is a nicety, not core.

### 3.8 The ⌘L panel — the index *(already exists; no change required)*

The panel ([overlay.js:583](../../../src/renderer/overlay.js) `renderList`) already renders, top to bottom: a **pinned section** (`pinnedHeaderRow` + pinned tab rows, [overlay.js:610-614](../../../src/renderer/overlay.js)), then per-group headers with fold/unfold, then ungrouped tabs, plus the Quick Switcher while typing. This is the familiar list that now holds *everything at scale*. **No panel work is required** for this feature beyond confirming pins render there (they do). It becomes the sole surface for pins and non-active groups.

## 4. Data flow & IPC

### 4.1 Already present — no new plumbing

| Need | Mechanism | Location |
|------|-----------|----------|
| back / forward | `browserAPI.goBack/goForward` → `tabs:back`/`tabs:forward` | preload.js:10-11, main.js:1340-1341 |
| reload / stop | `browserAPI.reload/stop` → `tabs:reload`/`tabs:stop` | preload.js:12-13, main.js:1342-1343 |
| favorite toggle | `browserAPI.toggleBookmark()` → `tabs:toggle-bookmark` | preload.js:20, main.js:1350 |
| nav enabled state | `canGoBack` / `canGoForward` per tab | main.js:228, 793-794 |
| favorited state | `bookmarked` per tab | main.js:228 |
| loading state | `isLoading` per tab | main.js:228 |
| open downloads page | `browserAPI.openPage('downloads')` → `tabs:open-page` | preload.js:24, main.js:1354 |

`serializeTabs()` ([main.js:375](../../../src/main/main.js)) strips only `view` and sends every other tab field, so the renderer already has `canGoBack`, `canGoForward`, `bookmarked`, `isLoading`, `pinned`, `groupId`.

### 4.2 New — downloads activity signal

Today `setupDownloads(ses)` is called with **no** notify callback ([main.js:1787](../../../src/main/main.js)), so the downloads manager's throttled `broadcast()` reaches nothing; download state is pulled only by the `blanc://downloads` page. Add a lightweight push to the chrome renderer:

- **`downloads.js`:** it already coalesces changes (~4/s, [downloads.js:21](../../../src/main/downloads.js)) and exposes `activeCount()`. Add:
  - a `hasRecent` notion — set true when a download finishes as `completed`, cleared by a new `acknowledgeDownloads()` (called when the user opens the downloads button). (`interrupted`/`cancelled` don't set it.)
  - a `downloadsActivity()` snapshot returning `{ active: activeCount(), hasRecent, receivedBytes, totalBytes }` (bytes summed over in-flight items, for the progress ring).
- **`main.js`:** pass a `notifyChanged` callback to `setupDownloads(ses, () => broadcastDownloadsActivity())`, which sends `chrome:downloads` with `downloadsActivity()` to `win.webContents` (mirror the `chrome:island-state` pattern at [main.js:338](../../../src/main/main.js)). Also broadcast once when a tab opens the downloads page so acknowledging is reflected. Add a `chrome:downloads-ack` handler that calls `downloads.acknowledgeDownloads()` then re-broadcasts (renderer → main, matching the `chrome:*` strip↔main namespace).
- **`preload.js`:** add `onDownloadsActivity(cb)` (subscribe to `chrome:downloads`) and `acknowledgeDownloads()`.
- **`renderer.js`:** keep a small `downloadsActivity` state; show the downloads button when `active > 0 || hasRecent`; render a progress ring from `receivedBytes/totalBytes` when `active > 0`; on click call `openPage('downloads')` then `acknowledgeDownloads()`.

## 5. Files to change

- **`src/renderer/renderer.js`** — replace the dots/cluster/pinned-shelf block in `render()` with: (a) a leading nav cluster, (b) the active-group dot window + `+k`, (c) a trailing action cluster (reload/stop, favorite, downloads). Remove `clusterTabs`, `tabDot`'s pinned-shelf usage, folded/dim handling. Subscribe to `onDownloadsActivity`. **All nav/action buttons must `stopPropagation` on click** so they fire their action without also opening the panel — matching how `tabDot` guards at [renderer.js:139](../../../src/renderer/renderer.js).
- **`src/renderer/styles.css`** — retire `.pill-cluster.folded`, `.pill-cluster.dim`, `.pinned-shelf`, `.dot-mini`. Add `.pill-nav`, `.pill-actions`, `.pill-btn` (26px round ghost icon buttons; `.disabled` greyed), `.pill-overflow` (`+k`), `.pill-divider`. Give `.island-identity` `min-width:0` and the domain ellipsis. Reuse `.island-dot`.
- **`src/main/downloads.js`** — add `hasRecent` tracking, `acknowledgeDownloads()`, `downloadsActivity()`.
- **`src/main/main.js`** — pass `notifyChanged` to `setupDownloads`; add `broadcastDownloadsActivity()` + `chrome:downloads` send; add the acknowledge IPC handler.
- **`src/main/preload.js`** — add `onDownloadsActivity`, `acknowledgeDownloads`.
- **`src/renderer/overlay.js`** — no functional change (pins already listed). Keep `clusterTabs`.
- **`CLAUDE.md`** — update the pill description (dots now show the active group only; pins/other-groups live in ⌘L; new action cluster) and drop the renderer↔overlay `clusterTabs` "keep in sync" note (§6).

## 6. Edge cases

- **Ungrouped active tab** (`groupId == null`): dots = the ungrouped set; identity shows no group name (just favicon · domain) — matches today.
- **Active tab is pinned:** it's still shown and highlighted among its group's dots (the `|| t.id === activeTabId` clause). Other pins stay off the pill.
- **Single tab / single-tab group:** one dot; `+k` absent.
- **Loading:** reload button shows stop; domain shows "Loading…" as today; nav enabled state refreshes on `did-stop-loading`.
- **Private tab active:** private theme scope + hollow dots unchanged; downloads/favorite/nav behave normally (Chromium session is shared by design).
- **Very narrow window:** domain ellipsizes, group name hides; nav/dots/actions/shield never drop (§3.7).
- **Downloads finishing while the downloads page is already open/focused:** acknowledge on open means the button won't nag; a later new download re-shows it.

## 7. Non-goals

- No redesign of the ⌘L panel (it already holds pins/groups/all-tabs).
- No change to the tab/group/pin **data model** or `session.json` format — pins still persist ([main.js:433](../../../src/main/main.js)); only their *pill rendering* is removed.
- No capsules, count-tails, or windowing notation anywhere — deliberately cut.
- No measured-budget/ResizeObserver fitting engine (§3.7).
- Not touching back/forward gestures or `⌘[`/`⌘]` — the buttons are additive.

## 8. Verification (manual — no test suite in this repo)

Run `npm start` (chrome-level changes require a full relaunch, not `⌘R`):

1. Open ~30 tabs in one group → pill shows 8 dots + `+k`; favicon/domain/shield stay visible; no clipping. Active dot always shown even when it's the 30th.
2. Switch to a tab in another group → dots swap to that group; identity updates.
3. Pin several tabs → they vanish from the pill and appear in the ⌘L pinned section; unpin restores nothing to the pill (correct).
4. Back/forward grey out at history ends; reload↔stop toggles while loading; favorite fills after `⌘D`/click and toggles off.
5. Start a download → downloads button appears with a progress ring; finishes → stays as "recent"; click opens `blanc://downloads` and the button fades.
6. Narrow the window → domain truncates; buttons and dots persist.
7. Private tab active → theme correct, actions functional.
```
