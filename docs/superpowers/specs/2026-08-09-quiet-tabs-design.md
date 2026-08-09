# Quiet Tabs — design

**Date:** 2026-08-09
**Status:** design approved, not yet planned
**Feature id:** F31 (see §13)

Discard the renderer process of a tab you have not touched in a while, and rebuild
it when you come back. User-facing name **Quiet Tabs**; a tab in that state is
**quiet**. Internals keep the mechanical vocabulary — `tabSleep`, `sleepTab()`,
`wakeTab()`, `tab.asleep` — exactly the Favorites/`bookmarks` split already
documented in CLAUDE.md.

---

## 1. Why, and the measured premise

Every tab is a live `WebContentsView` with its own renderer process
(`main.js:1810`). `setActiveTab` detaches the view and hides it
(`main.js:2242-2247`) but frees nothing. A 30-tab session holds 30 renderer
processes for the whole run.

The premise was measured against this repo's Electron 43.3.0 rather than assumed:

| Measurement | Result |
| --- | --- |
| Backgrounding alone (`removeChildView` + `setVisible(false)`) | ~4% RSS reclaimed over six seconds |
| Discarding the webContents | **~148 MB/tab reclaimed immediately** |
| Dropping the JS reference without observing `destroyed` | **0 bytes reclaimed** |
| `wc.close()` → `destroyed` | asynchronous, ~13 ms |
| Navigation history depth | capped at 50 entries (72 navigations ⇒ 50) |
| Trivial entry, pageState stripped | ~2.4 KB ⇒ ~6 MB retained across 50 tabs |

Backgrounding reclaims a few percent; discard reclaims the page's whole
footprint. Retaining snapshots costs about 6 MB against several GB freed — but
only once pageState is bounded (§6).

Two of those numbers are load-bearing and shape the whole design: **dropping the
reference reclaims nothing** (so destruction must be *observed*, §3), and
**`close()` is async** (so listeners keep firing into a tab that is already
notionally asleep, §4).

---

## 2. Scope

**In:** idle auto-quieting with a settings-controlled delay; a manual `/sleep`
command; the quiet affordance in the pill, the panel, and the rail; lazy session
restore (restored tabs come back quiet).

**Out (deliberately):** memory-pressure-driven quieting; converting a crashed
renderer into a quiet tab; any per-tab "never quiet this one" override; a
two-tier freeze-then-discard ladder. Each is a reasonable follow-up once this
ships and can be measured.

---

## 3. Tab model

A tab is **awake** (`tab.view` set, live webContents), **quiet** (`tab.view`
null), or transiently **waking**. The record keeps everything the chrome draws —
`url`, `title`, `favicon`, `pinned`, `muted`, `groupId`, `private`, `canGoBack`,
`canGoForward` — so a quiet row renders without touching a webContents.

New fields: `asleep`, `sleeping` (teardown in progress), `waking`,
`lastActiveAt`, `adopted`, `openerTabId`, `playingMedia`.

### 3.1 The snapshot lives outside the tab record

`serializeTabs` (`main.js:1126`) strips exactly one key (`view`) and spreads
everything else into a ~10/s broadcast. Any field added to the record ships to
both renderers for free. The snapshot therefore lives in a main-process-only
`Map<tabId, {view, entries, index}>`, never on the tab.

**`serializeTabs` additionally becomes an explicit allowlist.** Without that the
Map is a naming convention, not a boundary — and `lastActiveAt` would ship to
renderers on day one. The leak-proof-by-construction precedents are
`session-snapshot.js:27-35` and `tabsync-model.js:29-38`.

### 3.2 `liveContents` is a two-step check

```js
const liveContents = (tab) => {
  const wc = tab?.view?.webContents;
  return wc && !wc.isDestroyed() ? wc : null;
};
```

After `wc.close()`, `view.webContents` reads back **undefined, not destroyed** —
documented at `main.js:2653-2662`, where this exact dereference already killed
the main process once. Every existing `isDestroyed()` guard (`main.js:2214`,
`:2288`, `:1461`, `:267`) dereferences *before* it tests and must migrate.
`reloadTabAfterSettingsFanout` (`:2650-2661`) and `tabForWebContents`
(`:3486-3492`) are already the right shape and should migrate onto the shared
helper rather than stay one-offs.

### 3.3 Modules

- **`src/main/tab-sleep.js`** — pure, no Electron.
  `sleepCandidates(tabList, { now, thresholdMs, activeTabId })` with an injected
  clock (house precedent: `tabsync-model.js:79`), plus `trimSnapshot`.
  `thresholdMs: null` ⇒ `[]`. A missing or NaN `lastActiveAt` counts as *not yet
  idle* — never epoch 0, which would quiet every tab on the first sweep. The
  async probe is explicitly not part of this module.
- **`src/main/tab-view.js`** — `createTabView(tab)` and
  `wireTabView(tab, view, { owner, adopted })`, lifted verbatim from
  `main.js:1809-1814` and `:1854-2196`.

The extraction boundary is **everything `createTab` does to the webContents**,
listeners *and* setup calls — `installChromeShortcuts` (`:1854`),
`watchCursorFor` (`:1863`), `setWebRTCIPHandlingPolicy` (`:1883`),
`setAudioMuted` (`:1884`), `applyWindowOpenPolicy` (`:2177`), `attachContextMenu`
(`:2179`) — plus the view construction itself, because `main.js:1809-1814` is the
only place the private-session ternary lives. The initial navigation
(`:2197-2203`) stays with the caller.

Two failures follow from getting this boundary wrong, and **neither is caught by
any existing test**: a woken private tab built with plain `TAB_WEB_PREFERENCES`
joins `session.defaultSession` while the chrome still paints the dashed private
pill — the UI asserting a privacy that no longer exists — and a tab woken without
`applyWindowOpenPolicy` **fails open**, since Electron's default `window.open`
action is allow, so it can spawn an untracked, non-private, policy-free window.

Closure dependencies must be passed explicitly: `id` becomes `tab.id`, `adopted`
is always false on wake, and `boundToTab` is re-derived through
`windowRuntimes.runtimeForTab(tab.id)` — never `currentRuntime()`.

---

## 4. Going quiet

### 4.1 Teardown

`wc.close()` is asynchronous. In the ~13 ms before `destroyed` fires, the tab's
own listeners keep running against a tab that is notionally already quiet:
`did-stop-loading` → `syncNavState()` (`:1885-1890`) clobbers `tab.url` to `''`
or `about:blank`, **poisoning both the wake fallback and the next
`persistSession()`**; `audio-state-changed` (`:1892-1897`) un-zeroes
`tab.audible`; and `render-process-gone` (`:2050-2054`) and `did-fail-load`
(`:2022-2033`) call `loadURL` and **resurrect the renderer the sweep just
discarded**.

The originally-proposed fix — detach the `destroyed` listener that calls
`closeTab` — is **unimplementable**. `bindWindowRuntime` (`:89-91`) returns a
fresh arrow per call and retains no reference, so there is nothing to
`removeListener`. Verified.

Sequence instead:

1. `tab.sleeping = true`
2. `wc.removeAllListeners()` — the authoritative teardown set is *all* listeners
3. `wc.close()`
4. Clear `tab.view` **from inside the `destroyed` handler**, under the `sleeping`
   flag — destruction must be observed, since dropping the reference reclaims
   nothing (§1). The view is held in the sleep record meanwhile, never on the tab.

Every handler in `tab-view.js` additionally opens with
`if (tab.sleeping || tab.view?.webContents !== wc) return;` — belt and braces
against a listener registered outside the extraction.

`sleepTab` zeroes the fields describing the discarded renderer: `blockedCount`
(otherwise a stale count feeds `shieldChipState`, `:1132-1140`), `audible`
(a stale `true` makes the tab permanently ineligible for the next sweep),
`isLoading`, `pageBg`, `themeColor`. It keeps `url`, `title`, `favicon`,
`groupId`, `pinned`, `canGoBack/Forward`.

Quieting produces **no** tab-sync churn — the sync fingerprint is
url/title/groupId/pinned, all preserved.

### 4.2 Eligibility

Never quiet:

- the active tab — and honour `activeTabId` even when `hasLiveWindow()` is false
  (`:2229-2233`), or dock-reopen hits `:2214` on a quiet tab
- `sleeping`, `waking`, `isLoading`, or already `asleep`
- **audible, muted, or playing media.** `tab.audible` is literally
  `isCurrentlyAudible()` (`:1892-1897`), so a paused video, a deliberately muted
  tab, and a muted autoplay stream all pass it — and pageState carries no media
  `currentTime`, so wake lands at 0:00. Track `playingMedia` from
  `media-started-playing`/`media-paused`; treat `muted` as an explicit user
  gesture in the same class as pinned; detect
  `document.pictureInPictureElement !== null` in the probe. Camera/mic capture
  has no main-process signal in Electron 43 — stated as a known limitation.
- pinned
- **adopted `window.open` children.** They are constructed by Chromium wired to
  their opener (`:2142-2154`); rebuilding from a URL severs `window.opener`
  permanently, and an `about:blank` + `document.write` child — the standard
  OAuth/payment pattern — has *no restorable URL*. `adopted` is currently a local
  at `:1809` and must move onto the record. Independently require ≥1 http(s)
  navigation entry before a tab is quietable.
- **tabs with a live opener or live children.** Both window-open paths set
  `outlivesOpener: true` (`:2126`, `:2140`), and a discarded opener leaves the
  child's `window.opener` unusable — waking does not repair it, since it is a
  different object. Record `openerTabId` at adoption and make `sleepCandidates`
  family-aware.
- **tabs whose committed navigation was non-GET, or whose `historyEligible` is
  false.** A POST result — a checkout receipt, a transfer confirmation — either
  silently re-submits or fails into `blanc://error/`; Blanc has no "Confirm Form
  Resubmission" interstitial. The hook exists: the per-session
  `onBeforeSendHeaders` listener (`:3456-3473`) already carries `details.method`,
  `resourceType === 'mainFrame'`, and `webContentsId`, and its own comment
  invites composing inside it. `historyEligible === false` (`:1938-1945`) already
  marks the ≥400 and dead one-shot OAuth pages whose re-fetch is worthless.
- **tabs with a pending permission prompt.** `runtime.permissionPrompts`
  (`:3496-3515`) is keyed by `promptId` with no tab association, and
  `tabForWebContents` resolves null once the view is gone — so answering a quiet
  tab's prompt calls back into a destroyed frame *and* persists a decision to
  `site-permissions.json` (`permissions.js:88-93`) for an origin the user can no
  longer see. Store `{resolve, tabId}` and exclude those ids.
- **deep-scrolled pages** (`window.scrollY > 3 * innerHeight`) — see §7.
- tabs with unsaved input (§4.4)

Always quietable without probing: a crashed renderer, and a tab committed to
`blanc://error/`. The fail-safe-to-dirty rule would otherwise exclude exactly the
tabs the feature exists to reclaim.

### 4.3 The sweep

One 30-second `setInterval`, wrapped in `bindWindowRuntime(primaryRuntime, ...)`
at registration — an unbound `setInterval` is an AsyncLocalStorage boundary, and
the sweep touches `rt().activeTabId`, `rt().window.contentView`, and
`broadcastTabs()` (precedents: `:3128-3132`, `:3523-3526`, `:3661-3664`). `tabs`
is process-wide; `tabOrder`/`activeTabId` are per-runtime.

Suspended while `isQuitting`, `sessionPersistenceSuspended`, or
`startupNavigationGateActive`, and while `net.isOnline()` is false.

**Clock-jump reset.** Wall-clock `lastActiveAt` means closing a laptop lid at 6 pm
discards every tab at 9 am — all at once, firing a dozen simultaneous probes into
just-unthrottled renderers, at the moment the network is least reliable. On
`powerMonitor` `resume`, and whenever a sweep observes a gap greater than 2× the
interval, re-stamp `lastActiveAt` on every background tab and skip that sweep.

**Never quiet or wake from inside the settings fan-out.** `setSettings()` runs
`onSettingsChanged` synchronously, and webContents lifecycle work in that turn is
a documented reproducible main-process crash (`:2640-2650`: "EXC_BREAKPOINT on
CrBrowserMain … roughly a third of attempts"). Defer with `setImmediate`, exactly
like `reloadTabAfterSettingsFanout` (`:2653-2663`).

**Broadcast only on actual transitions**, or the rail's `list.replaceChildren`
(`vertical-tabs.js:600`) churns every 30 seconds.

### 4.4 The unsaved-input probe

`executeJavaScript` is top-frame only, so every cross-origin payment or SSO
iframe is structurally invisible. Run over `wc.mainFrame.framesInSubtree` with a
250 ms budget for the whole set.

**Dirty** iff any `input`/`textarea` has `value !== defaultValue`, or any
`input[type=password]` is non-empty, or any `[contenteditable]`/`designMode`
region has text, or `sessionStorage.length > 0`, or **any frame failed to
answer**. Never key it on interaction events — a 1Password fill is programmatic.

A hostile page can pin itself awake by making the probe throw. That is an
accepted non-goal, not a hole to plug.

*Optional second signal, strictly better fidelity:* temporarily swap the modal
`will-prevent-unload` handler (`:2058-2068`) for a silent no-op and call
`close({ waitForBeforeUnload: true })`. A page that prevents the unload aborts
the close with no dialog — Chromium's own unsaved-work verdict. Restore the modal
handler afterwards, and guard the swap with a flag so a concurrent user-initiated
`closeTab` still gets its dialog. (Bare `close()` does **not** run beforeunload —
verified by measurement, not just docs.)

### 4.5 Re-validate immediately before the discard

The probe's 250 ms and the `setImmediate` that §4.3 requires both let the user
activate the candidate. `setActiveTab` is fully synchronous once entered, so a
naive continuation would discard the **visible active tab**, leave a dead view
inside `contentView`, and make `resizeActiveView` (`:1283`) throw on the next
resize.

One synchronous block, verbatim, immediately before teardown:

```js
if (!tabs.has(id) || id === rt().activeTabId || tab.navEpoch !== epochAtProbe
    || tab.isLoading || tab.sleeping || !liveContents(tab)) return;
```

`navEpoch` (`:1847`, bumped at `:1971-1972`) is the existing TOCTOU pattern the
1Password flow already uses at `:1712`.

Never overwrite a good snapshot with an empty one: refuse to discard when
`getAllEntries().length === 0`.

---

## 5. Waking

`wakeTab(id, { navigateTo, atIndex } = {})`:

1. `createTabView(tab)` — the same construction path as `createTab`, so the
   private-session ternary applies (§3.3)
2. `wireTabView(tab, view, { owner, adopted: false })`
3. Re-apply `setAudioMuted(tab.muted)` and **re-read the WebRTC policy from live
   settings**. Blanc's default is `default_public_interface_only`
   (`network-privacy.js:11-14`), which is *not* Chromium's default — a woken tab
   without it leaks local and multi-homed interface addresses for every user, not
   just strict ones, while Settings still reads "Standard". Read at wake time,
   never replay a value captured at sleep time.
4. Navigate — see below
5. Clear `asleep` **on commit** (`did-finish-load`/`did-navigate`), never
   optimistically, so the UI cannot claim a blank tab is awake
6. Stamp `lastActiveAt`, clear `waking`, delete the Map entry **after** commit

**`setActiveTab` is the single wake choke point**, and must wake *before its first
guard*: `:2208-2214` dereferences `next.view.webContents.isDestroyed()` ahead of
everything else, and every activation path in the app funnels through it.

`wakeTab` must assign `tab.view` **synchronously** — downstream code re-reads the
record in the same turn (e.g. `openInternalPage`'s `tab.view.webContents.reload()`
at `:2440`).

`wakeTab` must **not** re-run `createTab`'s record initialization. `createTab`
hardcodes `title: 'New Tab'` (`:1820`), and `broadcastTabs()` drives both
`persistSession()` and `tabsync.noteTabsChanged()` (`:1242-1244`) — so a wake that
reinitializes produces two spurious sync PUTs plus two session rewrites, and a
quit mid-wake persists "New Tab".

**`restore()` and navigation are mutually exclusive.** `restore()` must be the
tab's first navigation (`:2197-2202`). When the caller is going to navigate
anyway — `openInternalPage` (`:2440`), `navigateTabToAddress` (`:1103`) — skip
`restore()`, `loadURL` directly, and discard the snapshot. `atIndex` lets
back/forward on a quiet tab restore at `index ± 1` in a single navigation instead
of waking and then navigating.

**Suppress history recording on wake.** `restore()` fires `did-navigate` →
`history.addVisit` (`:1926-1945`), and `addVisit` dedupes only against
`entries[0]` (`history.js:16-22`), so every wake would unshift a phantom row
timestamped *now*. A one-shot `tab.wakingFromSleep`, consumed in `did-navigate`,
covering `updateTitle` too — same shape as the existing `historyEligible` gate.

`wakeTab` is **forbidden while `startupNavigationGateActive`**. The gate cancels
the request and replays it with a plain `loadURL` keyed by webContents id
(`:237-240`, `:268`), discarding the restored `{entries, index}` and leaving the
tab permanently blank with no error page. Queue the wake instead. Restore itself
runs *inside* `releaseStartup` after the gate release (`:3778-3786`), so no
restored tab is ever gated.

### 5.1 Wake failure

Wake is a **network re-fetch**, and a failed one currently destroys the tab:
`restore()` rejects into `did-fail-load`, which replaces the page with
`blanc://error/` (`:2022-2043`) whose only recovery is a plain re-navigation
(`pages/error.js:17-19`).

- The sweep skips entirely while offline.
- The snapshot is **retained until the restore commits**, so a retry re-restores.
- `restore(...).catch(() => wc.loadURL(tab.url).catch(() => {}))`.
- The wake-failure error page carries the tab's stored title.

Quieting, by contrast, is always best-effort: a throwing probe or a wedged
`getAllEntries()` leaves the tab awake for the next sweep. It never surfaces an
error.

---

## 6. Snapshot shaping

`getAllEntries()` returns pageState per entry, and **back entries carry the
verbatim POST body of past form submissions** (measured:
`POSTPASS at entry 3/4, urlencodedBody=true`) plus stale form values from pages
already navigated away from — which the probe, seeing only the current document,
cannot detect. Per-entry pageState is unbounded: a 200 KB textarea produced a
535,728-character entry.

```js
snapshot = { index, entries: all.map((e, i) => i === index ? e : { url: e.url, title: e.title }) }
```

- If the surviving `pageState` exceeds **512 KB**, drop it — wake falls back to
  `loadURL`.
- If it exceeds the ceiling entirely, do not quiet the tab at all.
- Cap total retained snapshots at 50.

Verified end-to-end: with back-entry pageState stripped, `restore()` resolves,
`scrollY` and text-field contents return, and `canGoBack`/`goBack()` still work.

**Private tabs store no `pageState` at all** — `{entries: entries.map(({url, title}) => ({url, title})), index}`.
The private chip is documented as a *quick exit*; today one click destroys the
only copy of what was typed. A snapshot would move that into the long-lived main
heap with a weaker lifetime than the memory-only session itself. Stated trade: **a
private tab comes back where it was, not how it was.**

**A correction worth recording:** the original rationale for the Map was that
pageState contains typed passwords. Measured on Electron 43.3.0, Chromium
**excludes** `<input type=password>` values from form-control state
(`textInput=true password=false textarea=true`), so a 1Password-filled,
unsubmitted login page does not carry its password into the snapshot. The
conclusion stands, for a different payload: POST bodies and text/textarea values.

### 6.1 Snapshot lifetime is an invariant

Delete the Map entry in `closeTab` (as its first statement — `:2312-2349` has no
auxiliary-map hook today), on wake after commit, in the window `closed` handler,
on `before-quit`, and whenever the setting is switched to Off.

`closeTab`'s `const wc = tab.view.webContents` (`:2331`) becomes
`tab.view?.webContents` — it is reachable with a background id from the rail ✕
(`vertical-tabs.js:235`), the panel ✕ and middle-click (`overlay.js:317,377`),
and `closeGroup` (`:1591-1594`).

**Process-boundary trade, stated explicitly:** form values move from a sandboxed
renderer into the main heap that also holds the 1Password SDK handle and the
derived sync key, and which macOS captures on a main-process crash. No
`crashReporter.start()` exists today; one must not be introduced while the Map
exists without scrubbing it. `sleepState()` returns
`{id, asleep, hasSnapshot, entryCount}` — never `entries`.

---

## 7. What wake actually promises

pageState is applied against a document rebuilt from the initial response. On any
infinite-scroll or virtualized feed a 40,000 px offset clamps to the bottom of
page one — worse than page top, which is why deep-scrolled pages are excluded
from auto-quieting (§4.2). It carries **no** sessionStorage, JS heap, or
contenteditable content.

Every user-visible string says **"reload when you come back to them"**, never
"resume". The acceptance scenario asserts identity, address, and back-history —
not exact scroll.

---

## 8. Chrome

**Both renderer re-render gates are hand-written field lists**, so `asleep` is a
silent no-op until they are edited: `dotsSignature()` (`renderer.js:344-363`,
consumed at `:420-424`) and `railSignature()` (`vertical-tabs.js:53-70`,
early-returning at `:560-562`).

**Express quiet by size, not opacity.** Opacity is spoken for — `.island-dot.loading`
pulses via `island-pulse` (`styles.css:812`), and reduced motion kills the pulse
entirely (`:1876-1878`) — and there is no contrast headroom: the idle dot is
`--border` on `--surface-raised`, ≈1.3:1 light, ≈1.2:1 dark, ≈1.4:1 private.

- **Pill:** `.island-dot.asleep { background: transparent }` plus
  `::after { inset: 1.25px; background: var(--border) }` — a 3.5 px core in the
  same 6 px slot, so the 10 px flex gap never reflows. `::before` is taken by the
  hit halo (`:806-810`). **Private dots get no quiet treatment at all** — they
  stay hollow at full weight.
- **Panel:** a `row-asleep` span styled off `.row-private` (`overlay.js:262-267`,
  `styles.css:1558-1566`) — never `.row-tag`, which is hover-only on `.tab-row`
  (`:1302-1310`). The row is a bare `<div>` with no role or aria, so its visible
  text *is* its accessible name.
- **Rail:** add `tab.asleep && 'asleep'` to the `states` array
  (`vertical-tabs.js:355-365`) plus a `makeMarker(...)`, and dim the **favicon**,
  not the title — `.loading` already dims the title (`styles.css:516-518`), and
  the title span is `aria-hidden` with the favicon as the primary scan target
  (`:369-377`).
- **Quick Switcher:** its rows are not `.tab-row`, so `.row-tag` is visible at
  rest and prints the literal kind (`overlay.js:781-811`). Append `· asleep` to
  `sub`. Picking the row goes through `wakeTab`.

No new `:root` custom property: expressing quiet with existing `--border` and
`--text-dim` on non-`:root` selectors keeps `tokens:check` green with no
substrate work. A `--sleep-dim` token would need a light/dark/private triple for
no benefit.

**Deliberately unmarked** (state it, so nobody "fixes" them): the native Window
menu (`:2971-2999`, model fields only) and the start page (`newtab.js:280-299`
has no `tabs:updated` subscription).

`connection` degrades to no security claim for quiet rows, because
`committedUrlOf(view)` returns null by design (`:1143-1146`,
`shield-model.js:50-58`). Fall back to `tab.url` when `asleep` — a quiet tab has
a committed URL by construction. Do **not** "fix" `committedUrlOf` to a non-null
default.

---

## 9. Controls

**Setting** — one row under General: *Quiet inactive tabs*, values
`off | 30m | 1h | 6h`, key `tabSleep`, default `1h`.

Route B of the substrate work (honest, not desktop-only): a named enum const in
`settings.js`, a parsed `sleepDelays` array plus `cmp`/`eq` clauses in
`settings-schema/build.mjs`, and emission in `genSwift`/`genKotlin` — all
hardcoded per-key at `:117`, `:150-155`, `:171-180`, `:55-64`, `:85-94`. Route A
(`internalDefaults`) is one line and green CI but declares the feature
desktop-only, contradicting F14's "same keys, defaults, and validation".

`sanitize()` (`settings.js:185-221`) needs a clause or the row silently does
nothing. The key stays **out of `SYNCED_KEYS`** (`:30`) — memory policy is
device-local, like `tabLayout`. The settings row needs its own `id` on the
`.setting` wrapper and a `supports('tabSleep')` guard with remove-on-unsupported
(`pages/settings.js:13-14`, `:43-50` precedent). No `clientSettings` change.

**Command** — `/sleep`, `keepOverlay: true`:

```js
{ cmd: '/sleep', hint: 'Free memory — sleep the tabs you are not using', keepOverlay: true }
```

Every command runs on `state.activeTabId` (`overlay.js:533-540`), and the active
tab can never be quiet, so `/sleep` means *quiet every eligible background tab*.
Blanc has **no toast or banner surface anywhere**, and a command that closes the
panel (`:554-560`) would have zero receipt — so the panel stays open and the rows
that just went dim are the receipt (the `/find` precedent, `:545`).

`copy/build.mjs:54-66` diffs **positionally** across four files:
`copy/slash-commands.json`, `overlay.js`'s `COMMANDS`, `pages/shortcuts.js`'s
`SLASH_COMMANDS`, and `main.js:3081-3100`'s `SLASH_COMMANDS`. Insert at the
identical index in all four, next to `/pin`/`/mute`. The overlay parser
(`build.mjs:44`) demands single quotes, `cmd` and `hint` on the entry's first
line, and no apostrophe in the hint.

### 9.1 Disposition of the arbitrary-id IPC handlers

All eleven use `?.view.webContents` — an optional chain that stops at the tab, not
at the view. `activateTabFromRail` and `toggleTabMuted` are demonstrably reached
with a background id today (`vertical-tabs.js:239`; the panel renders a mute
button whenever `tab.audible || tab.muted`, `overlay.js:280-291`).

| Handler | Disposition |
| --- | --- |
| `activateTabFromRail` (`:2288`), `navigateTabToAddress` (`:1103`), `tabs:search` (`:2759`) | **wake** |
| `tabs:back`/`forward` (`:2761-2762`) | wake with `atIndex` — one navigation |
| `tabs:reload`/`stop` (`:2763-2764`), `tabs:find`/`find-stop` (`:2793-2794`) | wake or no-op, never throw |
| `toggleTabMuted` (`:1609`) | update `tab.muted`, apply via `liveContents(tab)?.setAudioMuted(...)`; wake re-applies at `:1884` |
| `duplicateTab` (`:1619`) | read `{entries, index}` straight from the Map when the source is quiet — better than today, and avoids a spurious wake |

---

## 10. Lazy restore

Restored tabs are born quiet with `snapshot: null` and `url` set; only the active
one wakes. `createTab` has no `title`/`asleep` option, constructs a view eagerly,
and can return `null` for utility URLs (`:1786`, `:1793`, `:1810-1814`) — the
restore loop at `:3783-3794` must tolerate nulls in `restoredIds` before indexing
the active target.

### 10.1 The session.json metadata column

Without persisted titles and favicons, every relaunch renders an unscannable
rail: `setFavicon` renders purely from `tab.favicon` (`overlay.js:197-208`), and
the rail's title span is `aria-hidden` with the favicon as the primary scan
target.

**Three plausible spellings each break session.json permanently and quietly:**

- A bare `titles` key is stripped — `entryFrom` rebuilds a five-key object
  literal (`session-workspace.js:9-15`) and `buildSaveShape` calls it before
  writing (`:108-118`), so it never reaches disk.
- Adding it to the nested entry only makes `deepEqual(nested, entryFrom(data))`
  (`:90-97`) false on **every** launch ⇒ the "legacy writer won" branch fires ⇒
  the nested workspace is dropped forever.
- Adding it to the mirror means a 1.0.x rollback rewrites the five keys and
  leaves a stale array that zips onto different URLs.

Specified shape: a single optional `meta: [{title, favicon}]` parallel to `urls`,
written **only** into `windows[0]`, never into the flat mirror. `hasMirror` stays
at five keys — adding `meta` to it would make every file written by 1.0.x/1.1.0
fail the mirror-validity test, so a genuine rollback's tab edits would lose to the
stale nested workspace, which is the exact data loss the mirror exists to
prevent. The divergence check compares a five-key projection. `entryFrom` accepts
`meta` only when `Array.isArray(meta) && meta.length === urls.length`, else `[]`,
so a rollback's stale array self-drops. **`version` stays `1`** — shipped 1.1.x
treats `version > 1` as read-only and stops persisting entirely
(`session-workspace.js:69-71`, `main.js:1197`).

Thread `meta` through `filterRestoredSession` (`session-restore.js:11,15,24-27`)
and the copy-back at `main.js:3739-3743`, or a dropped utility URL misaligns every
entry by one. Persist an **empty** title when `persistableUrl` unwrapped a
`blanc://error/` URL (`session-snapshot.js:13-23`) — `tab.title` there is the
Blanc error page's. Skip `data:` favicons over ~4 KB (fallback glyph). CSP already
permits remote favicons (`index.html:5`).

`clearHistory()` (`history.js:49-51`) does not touch session.json, so persisted
titles would outlive a history clear — add a `meta` clear to both handlers
(`pages.js:157`, `main.js:2927`).

Tab-icon capture silently stops for quiet tabs (`tabicons.js:421-426` derives the
session from the view); pass `tab.private ? getPrivateBrowsingSession() : session.defaultSession`
explicitly. The fetch is already `credentials: 'omit'`.

---

## 11. Falsifiability

Nothing in the repo reads process metrics (`grep -rn getAppMetrics src/ test/` →
nothing), so a regression that closes the view but fails to release the process
is **indistinguishable from success** in every test and in the UI.

Behind `acceptanceTestMode` (`:73-75`): quieting N tabs must drop
`app.getAppMetrics().filter(p => p.type === 'Tab').length` by N. Without this
assertion the feature has no test that proves it does anything.

---

## 12. Testing

**Unit**

- `test/unit/tab-sleep.test.js` — threshold boundary; active excluded;
  audible/muted/pinned/playingMedia/adopted/non-GET/permission-pending/opener-family
  excluded; `thresholdMs: null` ⇒ `[]`; NaN `lastActiveAt` ⇒ not idle;
  deterministic ordering; `trimSnapshot` strips non-active pageState and honours
  the byte ceiling; private snapshots carry no pageState.
- `test/unit/tab-sleep-snapshot-isolation.test.js` — source-lifted `serializeTabs`
  (precedent: `test/unit/settings-fanout-reload.test.js:8-19`) asserting a record
  carrying `sleepSnapshot`/`pageState` serializes without it; plus a lifted
  `wireTabView` assertion that its source contains `applyWindowOpenPolicy`.
- Extend `session-workspace.test.js` (meta survives `entryFrom`/`buildSaveShape`;
  mirror divergence unaffected; length mismatch self-drops; rollback →
  re-upgrade), `session-restore.test.js` (meta column in the zipped-alignment and
  missing-array cases), `session-snapshot.test.js` (error URL ⇒ empty title;
  leave the 4-key shape guard at `:56` untouched), `shield-model.test.js`
  (`committedUrlOf(null)` ⇒ null), and a `SYNCED_KEYS` exclusion assertion.
- Leave `tabsync-model.test.js:71` untouched — it is the anti-leak net.

**Test hook** (all `if (!acceptanceTestMode) return;`): `sleepTab`, `wakeTab`,
`sleepState()`, `setTabIdleSince(id, msAgo)`, `runSleepSweep()` (`toggleAdblock`
precedent at `test-hook.js:240-243`), `setSleepThresholdOverride(ms)`,
`persistedSessionData()`, `serializedTabsPayload()`.

`test-hook.js` must land its sleep-awareness **before any sleep code**. `state()`
dereferences `t.view.webContents.id`, `t.view.getBounds()`, and
`t.view.webContents.session` unguarded for every tab (`:148-151`) while its
neighbours at `:89-98` are already try/caught — one quiet tab throws inside
`electronApp.evaluate()` and fails **every** scenario, including unrelated ones.
Also fix `:125`, `:198`, `:223`, `:566/573/578/589`. `reset()` (`:752-781`) must
wake every tab, clear the Map, clear the threshold override, and add the new
settings key.

**Acceptance** (`spec/acceptance/quiet-tabs.feature`, `@F31-1`…`@F31-10`):
sleep/wake identity; active never sleeps; the exclusion outline
(audio/pinned/muted/dirty-input/adopted/POST); `/sleep` with the panel open; the
quiet affordance and accessible name, asserting dots are not the private
treatment; the settings outline; lazy restore (via the existing `ctx.relaunch` in
`test/desktop/support/hooks.js` — seed and persist *before* relaunch, since
`Before` calls `reset()`); private sleep→wake asserting `sessionKind === 'private'`;
no pageState in session.json, the sync snapshot, or `tabs:updated`; and the
`getAppMetrics` process-count drop.

Extending `@F28-7`'s literal expected map
(`test/desktop/steps/vertical-tabs.steps.js:945-960`) is part of the UI commit.

---

## 13. Spec and substrate obligations

**`spec/`** (not covered by `substrate:check` — a manual obligation that
`spec/README.md` makes non-optional):

- `spec/features.md`: new **F31 — Quiet Tabs**, ending in an `Acceptance:` line;
  fix F2's third bullet (`:51-53`); F18 names the session `meta` array.
- `spec/divergence-register.md`: rewrite **D8**'s Desktop bullet (`:189-205`),
  which currently asserts verbatim "Desktop: every tab's view stays alive;
  switching is attach/detach" — this feature *converges* desktop toward mobile,
  the rarer edit and worth naming. Keep D8's parity contract verbatim. Add **D23**
  for the *control surface* only: desktop and Android configurable, iOS
  OS-governed (`WKWebView` suspension is not app-schedulable), contract = "a
  backgrounded tab may lose its renderer on any platform and returns with
  identity, title, and scroll intact; only the control over when is
  platform-dependent." Behaviour scenarios tag `@D8`, control scenarios `@D23`.
  **The inherited "scroll intact" clause is scoped to static documents** — §7
  explains why it cannot hold on virtualized feeds, and the deep-scroll exclusion
  in §4.2 exists precisely so auto-quieting never puts the contract in a position
  it cannot honour. Say so in D23 rather than silently widening D8's promise.
  F29/D21 look free but `spec/README.md` forbids id reuse and their provenance is
  unrecorded — use F31 and D23.
- `spec/parity-matrix.md`: new F31 row; amend the F2 and F18 divergence cells.
- `spec/acceptance/index.md`: file row, ~10 grid rows, updated coverage paragraph.

**Commands, in order:**

```bash
npm run copy:build && npm run copy:check
npm run settings:build && npm run settings:check
npm run substrate:check
npm run test:unit
npm run test:acceptance:dry
npm run test:acceptance:desktop
```

`test/desktop/cucumber.mjs`'s `RUNNABLE` gains `@F31-1`…`@F31-10` — the dry run
fails if an id is listed without a step definition. No `tokens:build` should be
needed. Never hand-edit `*/generated/`.

**CLAUDE.md and AGENTS.md** (hand-mirrored, no automated guard): the claim
"switching tabs is remove-one/add-another rather than destroying anything" is now
false. Add a Quiet Tabs paragraph naming `tab-sleep.js`, `tab-view.js`,
`liveContents`, the snapshot-Map rule, and the session.json `meta` addition.
Check `site/` copy against `test/unit/public-truth.test.js` for any "tabs are
never discarded" claim.

---

## 14. Implementation sequence

1. **Extraction + null-safety, a pure no-op.** `tab-view.js`
   (`createTabView` + `wireTabView`); `liveContents`; the six unattended whole-map
   iterations — `onRequestBlocked` (`:3652-3654`, fires tens of times per second;
   replace the linear scan with a maintained `wcId → tabId` index),
   `applyWebrtcPolicyToAllTabs` (`:3381-3382`, runs on every settings write),
   `broadcastStartPageStatus` (`:3545-3547`), `pushRemoteDevices` (`:3700-3702`),
   the `did-create-window` opener scan (`:2160-2161`), and
   `releaseStartupNavigationGate` (`:263-266`, which throws out of
   `Array.prototype.find` and would strand the browser behind the startup gate);
   every deref reached from a `setTimeout`/`setImmediate`/awaited continuation,
   of which `samplePageTint` (`:1461`, reached from a bare 150 ms timer at
   `:1485-1487`) is the live one; `serializeTabs` as an allowlist;
   `test-hook.js` sleep-awareness. **No sleep code.** Ships and is verified alone.
2. **Policy + plumbing.** `tab-sleep.js`, `sleepTab`/`wakeTab`, the sweep, the
   snapshot Map and its lifetime, `getAppMetrics` falsifiability.
3. **Chrome.** `asleep` through both signature gates and the four surfaces.
4. **Lazy restore.** The `meta` column and the restore path.
5. **Controls + substrate.** Setting, `/sleep`, regeneration, spec files, docs.

---

## 15. Non-goals, stated so they are not mistaken for oversights

- A hostile page can pin itself awake by making the probe throw.
- Camera and microphone capture have no main-process signal in Electron 43;
  a capturing tab is protected only by `playingMedia`/`audible`.
- Quiet state is not marked in the native Window menu or on the start page.
- Zoom survives a discard for http(s) (per-origin, per-session); origin-less
  pages (`blanc://`, `file:`, `data:`) reset. No zoom field is needed — say so, so
  nobody adds a redundant one.
- Per-*tab* memory claims are misleading: adopted `window.open` children **share
  their opener's OS process** (measured: same `getOSProcessId()`; closing the
  child left the renderer count at 2 and reclaimed 0% of process overhead). Frame
  all savings per *renderer process*.
