# Pinned Homes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pinned tab remembers the URL it was pinned on and reopens there after a clean relaunch, while crash recovery and in-session browsing keep the last page.

**Architecture:** A pure module (`src/main/pinned-home.js`) owns which URLs may be homes and how a saved window entry is rewritten at a clean start. The tab record gains `pinnedHomeUrl`, set by pin/unpin and threaded through every path that already carries F46's `customTitle` (session meta, Spaces, closed tabs, duplicate). Startup captures the crash ledger's verdict once and rewrites pinned URLs to their homes before the existing restore filter runs.

**Tech Stack:** Electron 44 main process, `node --test`, Cucumber + Playwright-Electron acceptance, one direct-launch smoke for crash recovery.

**Spec:** `docs/superpowers/specs/2026-10-17-island-hover-and-pinned-homes-design.md` §5 (Milestone B). Independent of the hover-open plan; ship it in its own PR.

## Global Constraints

- The home lives only in the session `meta` entry as optional `pinnedHomeUrl`; `session.json` `version` stays `2`; the flat rollback mirror is untouched.
- Valid homes: `http:`/`https:`; a local HTML `file:` URL that passes `restorableLocalHtmlUrl()` and came from a tab with `localFile === true`; a `blanc:` page in `KNOWN_PAGES` that is not a utility page and not `blanc://error` (which `persistableUrl()` unwraps first).
- Clean start ⇔ `diagnostics.sessionRecoveryPending()` was false at startup, read once before any `resolveSessionRecovery()`. No new shutdown marker.
- Clean start restores pinned tabs at the home; recovery **restore** keeps the last `url` and the home. Opening a Space keeps the saved current URL and carries the home (the spec makes the reset a relaunch behavior only).
- Private tabs: the home is memory-only and never reaches session, Spaces, closed-tab entries or sync.
- `pinnedHomeUrl` never crosses IPC: not in `serializeTabs`, not in `tabs:updated`, not in the sync snapshot. No `browser-api` contract change.
- History clearing keeps `pinnedHomeUrl` (like `customTitle`) and clears title/favicon.
- Copy, exact: **Return to Pinned Home**, **Make This the Pinned Home** (tab context menu), in all six languages in the same PR (`copy:ack` per locale, `copy:build`).
- Not a public capability until released (spec §7).

## Review Focus

1. **A pinned tab whose last page is a utility or forbidden URL but whose home is fine:** on a clean start it must reopen at the home, not vanish in the restore filter. Pinned by Task 1 `home substitution happens before filtering` and Task 3's ordering step.
2. **Session written by this build, then opened by v1.36.0:** the old build must restore the tabs normally. Pinned by Task 2 `meta entries keep their old keys and order`.
3. **Pinning a quiet (asleep) tab** whose `url` is set but has no live webContents: the home must still be captured from `tab.url`. Pinned by Task 3 acceptance `pinning a quiet tab records its home`.
4. **Make This the Pinned Home on an error page:** the home becomes the unwrapped destination, never `blanc://error`. Pinned by Task 1 `error page unwraps`.
5. **Recovery choice "fresh" after a crash:** nothing restored, and no pinned home leaks into the fresh window. Pinned by Task 5 smoke's fresh branch.

---

### Task 1: Pure home policy

**Files:**
- Create: `src/main/pinned-home.js` (requires only `./session-snapshot`, `./utility-pages`, `./local-html-files`; confirm none pulls in `electron` with `grep -n "require('electron')"` on each)
- Test: `test/unit/pinned-home.test.js`

**Interfaces:**
- Produces:
  - `pinnedHomeFor(url: string|null, { localFile = false } = {}) -> string | null` — the canonical home for a URL, or null when it cannot be one.
  - `applyPinnedHomes(saved: { urls, pinned, meta, localFiles? }, { cleanStart: boolean }) -> same shape` — returns a new entry. For each pinned index with a valid `meta[i].pinnedHomeUrl` (validated with `localFile` true only when it is a `file:` URL), and only when `cleanStart`, replaces `urls[i]` with the home and sets `localFiles[i]` to whether the home is `file:` (creating the `localFiles` column if needed). Invalid homes are deleted from that meta entry. Title and favicon are left as saved. Non-pinned indices pass through unchanged.

- [ ] **Step 1: Write the failing tests**
  - `https home` — `pinnedHomeFor('https://mail.example/inbox')` → same href.
  - `error page unwraps` — `pinnedHomeFor('blanc://error/?url=https%3A%2F%2Fa.example%2F')` → `'https://a.example/'`.
  - `utility and transient pages are refused` — `blanc://settings/`, `blanc://history/`, `blanc://error/` with no `url`, `chrome-extension://x/`, `javascript:1`, `data:text/html,x` → null.
  - `known start page allowed` — `blanc://newtab/` → `'blanc://newtab/'`.
  - `file needs a local-file tab` — a temp `.html` file's URL → null without `localFile`, its canonical href with `localFile: true`.
  - `clean start swaps to the home` — `{urls:['https://b.example/'], pinned:[true], meta:[{title:'B',favicon:null,pinnedHomeUrl:'https://a.example/'}]}` → `urls[0] === 'https://a.example/'`, `meta[0].title === 'B'`.
  - `recovery keeps the last page` — same input, `cleanStart: false` → `urls[0] === 'https://b.example/'`, `meta[0].pinnedHomeUrl === 'https://a.example/'`.
  - `invalid stored home falls back` — `pinnedHomeUrl: 'blanc://settings/'` → url unchanged and `pinnedHomeUrl` removed.
  - `legacy pinned entry passes through` — `pinned:[true]`, `meta:[{title:'B',favicon:null}]`, clean → url unchanged (the home is derived later by `createTab`, Task 3).
  - `unpinned entries ignore a stray home` — `pinned:[false]` with a home → unchanged.
  - `home substitution happens before filtering` — `urls:['blanc://settings/']`, pinned, home `https://a.example/`, clean → `urls[0] === 'https://a.example/'`, and `filterRestoredSession` (from `session-restore.js`, with main's drop predicate reproduced as `isUtilityUrl`) keeps it.
  - `file home creates the grant column` — clean, home is a temp file URL, no `localFiles` → `localFiles` equals `[true]`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/pinned-home.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `pinnedHomeFor` and `applyPinnedHomes`.** `pinnedHomeFor` runs `persistableUrl` first, parses with `new URL`, and returns `parsed.href` for accepted cases.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/unit/pinned-home.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/pinned-home.js test/unit/pinned-home.test.js
git commit -m "Add the pinned-home policy"
```

### Task 2: Persisted metadata (session, history clear, closed tabs)

**Files:**
- Modify: `src/main/session-snapshot.js` `sessionTabMeta` (:39) and `metaAfterHistoryClear` (:56)
- Modify: `src/main/closed-tabs.js` `buildTabEntry` (:76) and the member projections in `buildGroupEntry` / `buildBatchEntry` (beside `customTitle` at :138 and :167)
- Test: extend `test/unit/session-snapshot.test.js` and `test/unit/closed-tabs.test.js`

**Interfaces:**
- Consumes: Task 1 `pinnedHomeFor`.
- Produces: meta entries and closed-tab entries/members carry `pinnedHomeUrl: string` only when the tab is pinned, not private, and the home is valid (`pinnedHomeFor(tab.pinnedHomeUrl, { localFile: tab.pinnedHomeUrl?.startsWith('file:') })`).

- [ ] **Step 1: Write the failing tests**
  - `pinned tab meta carries its home` — `sessionTabMeta({pinned:true, url:'https://b.example/', title:'B', pinnedHomeUrl:'https://a.example/'})` has `pinnedHomeUrl: 'https://a.example/'`.
  - `unpinned or private tab meta has no home key` — `Object.hasOwn(meta, 'pinnedHomeUrl') === false` for `pinned:false`, and for `pinned:true, private:true`.
  - `meta entries keep their old keys and order` — for a pinned tab the keys are exactly `['title','favicon','pinnedHomeUrl']` (and `customTitle` inserted before `pinnedHomeUrl` when present), so older readers see the same `title`/`favicon`.
  - `history clear keeps homes` — `metaAfterHistoryClear([{title:'B',favicon:'x',pinnedHomeUrl:'https://a.example/'}])` → `[{title:'',favicon:null,pinnedHomeUrl:'https://a.example/'}]`; a column with neither `customTitle` nor `pinnedHomeUrl` still returns `null`.
  - `sync snapshot never carries homes` — `syncSnapshot([{...pinned tab with home}], [])` contains no `pinnedHomeUrl` anywhere (`JSON.stringify` check).
  - `closed tab entry keeps the home` — `buildTabEntry({pinned:true, url:'https://b.example/', pinnedHomeUrl:'https://a.example/'}, null).pinnedHomeUrl === 'https://a.example/'`; group and batch members likewise.

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/session-snapshot.test.js test/unit/closed-tabs.test.js`
Expected: the new cases fail.

- [ ] **Step 3: Implement** the four edits.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/unit/session-snapshot.test.js test/unit/closed-tabs.test.js`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/session-snapshot.js src/main/closed-tabs.js test/unit/session-snapshot.test.js test/unit/closed-tabs.test.js
git commit -m "Persist pinned homes in session and closed-tab metadata"
```

### Task 3: Tab record, pin/unpin, restore paths and clean-start selection

**Files:**
- Modify: `src/main/main.js`:
  - `createTab` (:6372): option `pinnedHomeUrl = null`; record field `pinnedHomeUrl`
  - `toggleTabPinned` (:6131)
  - `duplicateTab` (:6153): pass `pinnedHomeUrl: source.pinnedHomeUrl`
  - closed-tab capture record (:5520): `pinnedHomeUrl`
  - `reopenEntry` `common` (:7331), `reopenGroupEntry` (:7045), batch reopen (:7076): pass `member.pinnedHomeUrl` / `entry.pinnedHomeUrl`
  - Space restore `createTab` (:6059): `pinnedHomeUrl: cleaned.meta?.[index]?.pinnedHomeUrl ?? null`
  - startup (:11637): `const cleanStart = !diagnostics.sessionRecoveryPending();` before `savedWindows`; map each `saved` through `applyPinnedHomes(saved, { cleanStart })` before `filterRestoredSession`; session restore `createTab` (:11885): `pinnedHomeUrl: saved.meta?.[index]?.pinnedHomeUrl ?? null`
  - `src/main/test-hook.js`: `pinnedHome(tabId) -> string | null`
- Test: `test/unit/pinned-home-wiring.test.js` (source-text guards, as other `main.js` wiring tests do, since `main.js` cannot load under `node --test`)

**Interfaces:**
- Consumes: Task 1 `pinnedHomeFor`, `applyPinnedHomes`; Task 2 metadata.
- Produces: `tab.pinnedHomeUrl: string | null`, invariant: `null` whenever `!tab.pinned`.
  - `createTab`: when `pinned`, `pinnedHomeUrl` is `pinnedHomeFor(option)` (file homes validated with `localFile: true`), else `pinnedHomeFor(url, { localFile: allowLocalFile })` — this second branch is the lazy migration for old sessions (spec §5.4).
  - `toggleTabPinned`: pinning sets `pinnedHomeFor(tab.url, { localFile: tab.localFile === true })`; unpinning sets `null`.

- [ ] **Step 1: Write the failing wiring test**
  - `main.js` reads `sessionRecoveryPending()` into `cleanStart` before the first `filterRestoredSession(` in the startup block, and that block calls `applyPinnedHomes(` before `filterRestoredSession(`.
  - every `createTab(` call in `main.js` that passes `customTitle:` also passes `pinnedHomeUrl:` (regex over the source), and `duplicateTab` passes `pinnedHomeUrl: source.pinnedHomeUrl`.
  - `serializeTabs` source does not mention `pinnedHomeUrl`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/pinned-home-wiring.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the edits listed under Files. `cleanStart` must be read before anything calls `diagnostics.resolveSessionRecovery()`.

- [ ] **Step 4: Run unit suite and lint**

Run: `npm run test:unit && npm run lint`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js src/main/test-hook.js test/unit/pinned-home-wiring.test.js
git commit -m "Record pinned homes and reopen pinned tabs there after a clean relaunch"
```

### Task 4: Context-menu commands and copy

**Files:**
- Modify: `src/main/tab-context-menu-model.js` (after `toggle-pin` at :61)
- Modify: `src/main/tab-context-menu.js` (action switch at :22)
- Modify: `src/main/main.js` `tabContextData` (:9154) and `menuContextActions` (:9186)
- Modify: `copy/messages/en.json` + five translations: `tabMenu.returnPinnedHome`, `tabMenu.setPinnedHome`
- Test: extend `test/unit/tab-context-menu-model.test.js`, `test/unit/tab-context-menu-runner.test.js`

**Interfaces:**
- Consumes: Task 1 `pinnedHomeFor`; Task 3 `tab.pinnedHomeUrl`.
- Produces:
  - `tabContextData(...).tab.pinnedHome = { canReturn: boolean, canSet: boolean }` computed in main (the URL itself is not handed to the model): `canReturn = pinned && !!home && persistableUrl(url) !== home`; `canSet = pinned && candidate !== null && candidate !== home` where `candidate = pinnedHomeFor(url, { localFile })`.
  - Menu items (only when `tab.pinned`): `{ id: 'return-pinned-home', label: t('tabMenu.returnPinnedHome'), enabled: canReturn }`, `{ id: 'set-pinned-home', label: t('tabMenu.setPinnedHome'), enabled: canSet }`.
  - Actions: `returnPinnedHome(id)` → `navigateTabToAddress(id, tab.pinnedHomeUrl)` (the typed-navigation policy path); `setPinnedHome(id)` → set `tab.pinnedHomeUrl = candidate`, then `persistSession()`.

- [ ] **Step 1: Write the failing tests**
  - model: an unpinned tab has neither id; a pinned tab lists both directly after `toggle-pin`, with `enabled` mirroring `pinnedHome.canReturn` / `canSet`;
  - runner: `return-pinned-home` calls `actions.returnPinnedHome(tab.id)`; `set-pinned-home` calls `actions.setPinnedHome(tab.id)`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/tab-context-menu-model.test.js test/unit/tab-context-menu-runner.test.js`
Expected: new cases fail.

- [ ] **Step 3: Implement** model items, runner cases, the main data/actions, and the copy (English with `note: "Tab context menu command."`, five translations, `copy:ack` per locale, `copy:build`).

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/unit/tab-context-menu-model.test.js test/unit/tab-context-menu-runner.test.js && npm run copy:check && npm run substrate:check`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/main copy test/unit
git commit -m "Add Return to Pinned Home and Make This the Pinned Home"
```

### Task 5: Desktop acceptance and crash-recovery smoke

**Files:**
- Modify: `spec/acceptance/tabs-and-groups.feature` (scenarios tagged `@pinned-home` plus a new F-id for the feature)
- Create: `test/desktop/steps/pinned-home.steps.js`
- Create: `test/desktop/pinned-home-recovery-smoke.mjs`, and an npm script `test:pinned-home-recovery:desktop`; add it to the CI job that runs `test:tab-view-drawing:desktop`
- Modify: `src/main/test-hook.js`: `chooseSessionRecovery(choice)` exposing the existing recovery-choice handler (main.js :11785)
- Modify: `spec/features` + `spec/parity-matrix.md`: new F-row "Pinned homes", desktop only

**Interfaces:**
- Consumes: Task 3 `pinnedHome(tabId)` hook; existing `I relaunch Blanc` step (clean quit, `ctx.relaunch`).

- [ ] **Step 1: Write the scenarios** (spec §5.7 1, 2, 4–6, 8–11):
  - pin on A, navigate to B, switch tabs and back → still B, Back reaches A;
  - pin on A, navigate to B, `I relaunch Blanc` → the pinned tab's URL is A and its first paint shows B's saved title;
  - unpin clears (`pinnedHome` null); re-pin on B records B;
  - Make This the Pinned Home on B, relaunch → B;
  - Return to Pinned Home from B → A;
  - pinning a quiet tab records its home;
  - private pinned tab: session file has neither its URL nor a home;
  - duplicate, reopen closed, move to new window, save and open a Space → `pinnedHome` unchanged on the resulting tab;
  - clear history, relaunch → still opens at A.
- [ ] **Step 2: Write the smoke** (spec §5.7 3 and the recovery branch): launch with a temp profile and `BLANC_TEST=1`; pin on A, navigate to B, wait for the session write; SIGKILL the Electron process; relaunch; `chooseSessionRecovery('restore')`; assert the pinned tab is at B with home A; quit cleanly; relaunch; assert A. Second branch: crash, `chooseSessionRecovery('fresh')`, assert no tab carries a home.
- [ ] **Step 3: Confirm the steps resolve**

Run: `npm run test:acceptance:dry`
Expected: no undefined steps.

- [ ] **Step 4: Run the new checks**

Run: `npm run test:acceptance:desktop -- --tags "@pinned-home" && npm run test:pinned-home-recovery:desktop` (prefix `xvfb-run -a` on Linux)
Expected: pass.

- [ ] **Step 5: Full gates**

Run: `npm run test:unit && npm run substrate:check && npm run browser-api:check && npm run lint && npm run test:acceptance:desktop`
Expected: pass; compare unrelated failures against `main`.

- [ ] **Step 6: Restart Now check (spec §5.3).** Read `src/main/update-restart.js` and confirm `quitAndInstall` reaches `will-quit` on each platform; if not, call the crash ledger's `endSession()` there before `quitAndInstall` and add a unit test for it. Record the packaged updater confirmation (spec §5.7 14) as pending for release, not as passed.

- [ ] **Step 7: Commit**

```bash
git add spec test/desktop src/main/test-hook.js package.json .github/workflows
git commit -m "Cover pinned homes in desktop acceptance and a crash-recovery smoke"
```
