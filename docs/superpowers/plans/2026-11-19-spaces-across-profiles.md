# Spaces Across Profiles Implementation Plan (Electron build)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With two or more local profiles, the Spaces menu lists every profile's Spaces, opens another profile's Space in a window of that profile, and can create a Space in another profile. With one profile, nothing changes.

**Architecture:** A new Electron-free module builds the cross-profile part of the Spaces payload from injected readers, so its field allowlist is unit-tested. `main.js` adds it to `workspacesProjection()` as `otherProfiles`, and routes `profileId`-carrying open and create calls through one generalized version of link routing's `openSpaceForRoutedLink`. The overlay's `workspace-ui.js` draws headings and open-only rows, the New Space editor gains a Profile choice, and the Quick Switcher matches other profiles' Spaces.

**Tech Stack:** Electron main process (CommonJS), the overlay renderer (`workspace-ui.js`, `overlay.js`), `node --test` unit tests, Cucumber + Playwright-Electron acceptance (`test/desktop/`).

**Spec:** `docs/superpowers/specs/2026-11-19-spaces-across-profiles-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- One profile, or no other profile with a Space: the menu, editor and Quick Switcher must render exactly as today (spec §4.1). F41-1 to F41-82, F33-1 to F33-3, F60 and `shared-spaces.feature` must keep passing unchanged.
- Only these fields of another profile's Space may cross into a window: `id`, `name`, `color`, `symbol`, `tabCount`, `openElsewhere` (spec §5.2). Never URLs, titles, favicons, groups, `sharedSync` or `resident`.
- Opening or creating in another profile never replaces, closes or prompts about tabs in any window (spec §1 anti-goals, D1).
- A window's `profileId` never changes. Move to Space ▸, Move Group to Space ▸, sending a link to a Space, `/space <name>`, update, remove, move-to, restore, forget and save-as stay this-profile-only and get no `profileId` (spec §4.5, §5.3).
- Mini windows (`runtime.mini`) keep returning `busy`; Shared Spaces marks show only in Personal windows (spec §4.6).
- User-facing name is "Spaces"; US English; every new `copy/messages/en.json` key is added to `de`, `es`, `fr`, `it` and `pt-BR` in the same PR, then `npm run copy:build` and `npm run copy:ack -- <locale> <keys>`. Never `innerHTML` a message.
- `src/main/preload.js` and `browser-api/contract.json` change together, followed by `npm run browser-api:build`; commit the regenerated `browser-api/generated/vectors.json`.
- Commit messages and the PR name no AI model and carry no `Co-Authored-By` model trailer.
- Before the PR: `npm run lint`, `npm run test:unit`, `npm run substrate:check`, `npm run browser-api:check`, `npm run copy:check`. Run desktop acceptance on the Mac Studio, not the laptop.
- No change under `chromium/`; the fork gets its own plan (spec §6).

## Review Focus

1. **The renderer sends this window's own `profileId`.** Expect today's path exactly: switch in place, with the unsaved-tabs prompt when it applies. Test in Task 2.
2. **A profile is deleted (or starts deleting) while the menu is open.** Expect the open or create to be refused with an error line and the menu to stay open, with no window created. Test in Task 2.
3. **Two profiles each have a Space with the same name.** Expect two distinct rows, each opening its own profile's Space, and the editor checking names only against the chosen profile. Tests in Tasks 3 and 4.
4. **Another profile's Space file is unreadable or from a newer version.** Expect its heading plus "Couldn't read this profile's Spaces.", the other profiles still listed, and nothing written to that file beyond the existing repair path. Tests in Tasks 1 and 3.
5. **A profile already at 25 Spaces is chosen in the editor.** Expect that option disabled, and main still refusing with `limit` if a stale renderer sends it. Tests in Tasks 2 and 4.

---

### Task 1: The cross-profile Spaces projection (pure)

**Files:**
- Create: `src/main/spaces-across-profiles.js` (no `require('electron')`)
- Test: `test/unit/spaces-across-profiles.test.js`

**Interfaces:**
- Produces:
  - `otherProfileSpaces({ profiles, currentProfileId, isLive, readProfile }) → Array<{ id, name, status, full, items }>`
    - `profiles`: `[{ id, name }]` in Settings order (as `localProfiles.listLocalProfiles()` returns).
    - `isLive(profileId) → boolean`.
    - `readProfile(profileId) → { status: string, spaces: WorkspaceRecord[], shownIds: Set<string> }`. `shownIds` holds the ids of that profile's Spaces shown in a live, non-resident, non-mini window.
    - Returns `[]` unless at least two live profiles exist. Otherwise it returns one entry per live profile other than `currentProfileId`, in `profiles` order: `status` passed through, `items` empty when `status` is one of `read-failed`, `future-format` or `repair-failed`, and `full` true when the profile's ordinary Spaces (no `sharedId`, `recoveredFrom` or `preservedLocal`) number `MAX_WORKSPACES` (25, from `workspaces-model.js`) or more.
    - Each item is exactly `{ id, name, color, symbol, tabCount: record.urls.length, openElsewhere: shownIds.has(id) }`.
  - `UNREADABLE_STATUSES` (`['read-failed', 'future-format', 'repair-failed']`), exported for Task 3's renderer test fixtures.

- [ ] **Step 1: Write the failing tests** in `test/unit/spaces-across-profiles.test.js`:
  - `returns nothing with one live profile`: profiles `[Personal]` → `[]`; profiles `[Personal, Work]` with Work `isLive` false → `[]`.
  - `lists other live profiles in Settings order, never the current one`: current `default`, profiles `[default, w, s]` → ids `['w', 's']`; current `w` → `['default', 's']`.
  - `an item carries only the allowlisted fields`: a record with `urls`, `meta`, `groups`, `sharedId`, `sharedLink` → `Object.keys(item).sort()` equals `['color','id','name','openElsewhere','symbol','tabCount']`, and `JSON.stringify(result)` contains no URL from `urls`.
  - `openElsewhere follows shownIds`.
  - `an unreadable profile keeps its heading with no items`: `status: 'future-format'` → `{ status: 'future-format', items: [] }`.
  - `full counts ordinary Spaces only`: 25 ordinary → `full: true`; 24 ordinary + 3 with `sharedId` → `full: false`.
  - `keeps empty profiles` (Task 4's picker needs them): Work with no Spaces → `{ id: 'w', items: [] }` present.

- [ ] **Step 2: Run them to see them fail**
  Run: `node --test test/unit/spaces-across-profiles.test.js`
  Expected: FAIL, "Cannot find module '../../src/main/spaces-across-profiles'".

- [ ] **Step 3: Implement `otherProfileSpaces` and `UNREADABLE_STATUSES`** in `src/main/spaces-across-profiles.js`. Import `MAX_WORKSPACES` from `./workspaces-model`.

- [ ] **Step 4: Run the tests to see them pass**
  Run: `node --test test/unit/spaces-across-profiles.test.js`
  Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**
  ```bash
  git add src/main/spaces-across-profiles.js test/unit/spaces-across-profiles.test.js
  git commit -m "Spaces across profiles: the cross-profile list, allowlisted fields only"
  ```

### Task 2: Main: projection, open and create in another profile

**Files:**
- Modify: `src/main/main.js`: `openSpaceForRoutedLink` and `routedExternalRuntime` (~1981–2013); `workspacesProjection` and the comment above `broadcastWorkspacesUpdated` (~11566–11626); the `chrome:workspaces-open` and `chrome:workspaces-create-blank` handlers (~12336–12362).
- Modify: `src/main/preload.js` only if argument shaping drops `profileId` (it passes `opts` through today; check).
- Modify: `browser-api/contract.json`, then regenerate `browser-api/generated/vectors.json`.
- Test: `test/unit/spaces-across-profiles-main.test.js` (source-lifting checks in the style of `shared-spaces-main.test.js`) and `npm run browser-api:check`.

**Interfaces:**
- Consumes: `otherProfileSpaces` (Task 1).
- Produces (later tasks rely on these exact names):
  - The payload of `chrome:workspaces-list`, `chrome:workspaces-updated` and every action result gains `otherProfiles` (Task 1's shape) and `profileName` (this window's profile's name, for its heading), both only when `otherProfiles` is non-empty.
  - `chrome:workspaces-open(id, { profileId?, decision?, newWindow? })`.
  - `chrome:workspaces-create-blank(name, { profileId?, color?, symbol?, decision?, newWindow? })`.
  - Results from another profile: `{ ok: true, action: 'focus', windowId }` or `{ ok: false, error }`, where `error` is one of the existing `ws.error.*` keys (`not-found`, `busy`, `activation-failed`, `storage-failed`, `limit`, `duplicate-name`, `invalid-name`, `saved-not-opened`), or the new `profile-unavailable`.

- [ ] **Step 1: Write the failing tests** in `test/unit/spaces-across-profiles-main.test.js`, lifting function sources from `main.js` the way `switcher-spaces.test.js` lifts from `overlay.js`:
  - `one function opens a Space in another profile`: `openSpaceInProfile` exists; `openSpaceForRoutedLink` no longer exists; `routedExternalRuntime` and both IPC handlers call `openSpaceInProfile`.
  - `this window's own profileId takes today's path`: in the open handler, `profileId === rt().profileId` (or absent) reaches `switchWindowToWorkspace`, not `openSpaceInProfile`.
  - `save-as never reads a profileId`: the `chrome:workspaces-save-as` handler's source has no `profileId`.
  - `a profile that isn't live is refused before any window opens`: `openSpaceInProfile` and `createSpaceInProfile` check `linkRouteLiveness.isLiveProfile` before `workspaceController` and return `{ ok: false, error: 'profile-unavailable' }`.

- [ ] **Step 2: Run them to see them fail**
  Run: `node --test test/unit/spaces-across-profiles-main.test.js`
  Expected: FAIL, "openSpaceInProfile not found in main.js".

- [ ] **Step 3: Generalize `openSpaceForRoutedLink` into `openSpaceInProfile({ profileId, spaceId }, { background = false } = {}) → { result, runtime }`**
  - Same body as today (a stand-in caller, `withLocalProfile`, `{ newWindow: true }`, `broadcastWorkspacesUpdated`, `createMainWindow(target, { inactive: background })`).
  - Return the controller's `result` unchanged instead of `null`, with `runtime` set only when the target is live and of `profileId`.
  - `routedExternalRuntime`'s `openSpace` maps it back: `(target) => openSpaceInProfile(target, { background }).runtime ?? null`. Link routing's behavior is unchanged.

- [ ] **Step 4: Add `createSpaceInProfile(profileId, name, { color, symbol }) → result`** next to it. It refuses a profile that isn't live with `profile-unavailable`, then runs `workspaceController.create({ id: \`space-create-${++linkRouteSpaceSerial}\`, profileId }, name, { newWindow: true, color, symbol })` inside `withLocalProfile(profileId, …)`, then `broadcastWorkspacesUpdated()` and `noteSpaceCreated()` on success. Add a `profile-unavailable` string in Task 3.

- [ ] **Step 5: Route the two IPC handlers.** In `chrome:workspaces-open`, a string `opts.profileId` different from `rt().profileId` calls `openSpaceInProfile` and returns its `result` merged with `workspacesProjection()` when ok. `chrome:workspaces-create-blank` does the same with `createSpaceInProfile`. Every other case keeps today's code. Main refuses a mini source window (`rt().mini`) with `busy` before either path.

- [ ] **Step 6: Add `otherProfiles` to `workspacesProjection()`**
  ```js
  const otherProfiles = otherProfileSpaces({
    profiles: localProfiles.listLocalProfiles(),
    currentProfileId: rt().profileId,
    isLive: linkRouteLiveness.isLiveProfile,
    readProfile: (id) => withLocalProfile(id, () => ({
      status: namedWorkspaces.status(),
      spaces: namedWorkspaces.list(),
      shownIds: new Set(windowRuntimes.all()
        .filter((r) => r.profileId === id && isLiveBrowserRuntime(r) && r.workspaceId)
        .map((r) => r.workspaceId)),
    })),
  });
  ```
  Spread `...(otherProfiles.length ? { otherProfiles, profileName: localProfiles.getLocalProfile(rt().profileId)?.name } : {})`. Rewrite the comment above `broadcastWorkspacesUpdated` so it says other profiles' lists cross into each window, limited to Task 1's allowlist.

- [ ] **Step 7: Update the contract.** In `browser-api/contract.json`, `OpenWorkspaceOptions` gains optional `profileId: string`; `WorkspacesPayload` (and every result type that spreads it) gains optional `otherProfiles` with Task 1's shape and optional `profileName: string`. Then run `npm run browser-api:build`.

- [ ] **Step 8: Run the checks**
  Run: `node --test test/unit/spaces-across-profiles-main.test.js test/unit/link-routes.test.js test/unit/link-routes-in-app.test.js && npm run browser-api:check`
  Expected: all PASS; `browser-api:check` reports no drift.

- [ ] **Step 9: Commit**
  ```bash
  git add src/main/main.js src/main/preload.js browser-api/ test/unit/spaces-across-profiles-main.test.js
  git commit -m "Spaces across profiles: open and create a Space in another profile through link routing's path"
  ```

### Task 3: The menu lists other profiles' Spaces (strings included)

**Files:**
- Modify: `src/renderer/workspace-ui.js` (`renderList`, `spaceRow`, the `errors` map, the `data` default)
- Modify: `src/renderer/styles.css` (heading and unreadable-line styles from existing tokens; no inline styles)
- Modify: `copy/messages/{en,de,es,fr,it,pt-BR}.json`; regenerate with `npm run copy:build`
- Test: `test/unit/spaces-menu-profiles.test.js` (uses `test/support/workspace-ui-dom.js`)

**Interfaces:**
- Consumes: `otherProfiles` and the `profileId` open option (Task 2).
- Produces: string keys used by Tasks 4 and 5:
  - `ws.profile.unreadable`: "Couldn't read this profile's Spaces."
  - `ws.row.titleProfile`: "{count, plural, one {{name} · {profile} · {context} · # tab} other {{name} · {profile} · {context} · # tabs}}"
  - `ws.row.openInProfile`: "Opens in a {profile} window"
  - `ws.editor.profile`: "Profile"
  - `ws.editor.helpOtherProfile`: "Tabs stay in their own profile, so a Space in {profile} starts empty."
  - `ws.switcher.profileLabel`: "Space · {profile}"
  - `ws.error.profileUnavailable`: "That profile is no longer available." (mapped from `profile-unavailable`)
  - Headings use the profiles' own names (`otherProfiles[].name` and `profileName`, drawn with `dataEl`, never translated).

- [ ] **Step 1: Write the failing tests** in `test/unit/spaces-menu-profiles.test.js`:
  - `no headings without other profiles`: `harness({}, TWO)` → no node with class `ws-profile-heading`, and the row count and order are the same as `spaces-menu.test.js`'s first test.
  - `no headings when other profiles have no Spaces`: `otherProfiles: [{ id: 'w', name: 'Work', status: 'saved', items: [] }]` → no heading.
  - `headings: this profile first, then others`: `profileName: 'Personal'`, Work with 2 items → headings `['Personal', 'Work']` in order, Work's rows after Personal's.
  - `another profile's row opens only`: a Work row has no `edit:` button; its `pointerdown` and Alt+ArrowDown call no `move`; clicking it calls `openWorkspace('w1', { profileId: 'w' })`; it's never `data-current="true"`.
  - `another profile's row tooltip names the profile`: `main.title` equals `t('ws.row.titleProfile', { name: 'Sprint', profile: 'Work', context: 'Opens in a Work window', count: 5 })`; with `openElsewhere`, the context is `Show window` and the count column reads `Show window`.
  - `same-named Spaces in two profiles stay distinct` (Review Focus 3): Personal "Plan" `p1`, Work "Plan" `w1` → two rows, and clicking each calls `openWorkspace` with its own id and `profileId`.
  - `an unreadable profile shows its heading and one line` (Review Focus 4): Work `status: 'future-format'` (with Personal having one Space) → heading "Work" followed by text "Couldn't read this profile's Spaces."
  - `empty this-profile with another profile's Spaces`: Personal `items: []`, Work 1 item → heading "Personal", the empty hint, heading "Work", the row; there's no `import-arc` button.
  - `keyboard roves across profiles`: ArrowDown from the last Personal row focuses the first Work row.
  - `a refused open keeps the menu open on the list with the error` (Review Focus 2): `openWorkspace` resolves `{ ok: false, error: 'profile-unavailable' }` → the menu is still open and shows "That profile is no longer available."

- [ ] **Step 2: Run them to see them fail**
  Run: `node --test test/unit/spaces-menu-profiles.test.js`
  Expected: FAIL (no `ws-profile-heading`; the open call has no `profileId`).

- [ ] **Step 3: Add the strings** to `en.json` and the five translations, then run `npm run copy:build` and `npm run copy:ack -- <locale> <keys>` for each locale. The translations are written by the implementer and not reviewed by native speakers; say so in the PR.

- [ ] **Step 4: Implement the rendering** in `workspace-ui.js`:
  - Add `otherProfileRow(workspace, profile)`, a sibling of `spaceRow` with the same classes and tile and `focusKey` `open:${profile.id}:${workspace.id}`: no `more` button, no drag, no Alt-arrow handler. Its click calls `openAction({ kind: 'open', id, name, profileId })`.
  - `openAction` passes `{ ...options, profileId: action.profileId }` when present.
  - `renderList` adds headings only when `visibleGroups >= 2`: this profile counts when it has items *or* another group shows, and each other profile counts when it has items or an unreadable status.
  - Headings are `dataEl('p', 'ws-profile-heading', name)`, which isn't a button, so the existing roving skips it.
  - Add `'profile-unavailable': t('ws.error.profileUnavailable')` to `errors`.
  - Show the Arc import row only when this profile *and* every other profile have no items.

- [ ] **Step 5: Run the tests to see them pass, the old ones included**
  Run: `node --test test/unit/spaces-menu-profiles.test.js test/unit/spaces-menu.test.js test/unit/workspaces-ui-copy.test.js test/unit/workspaces-overlay-integration.test.js && npm run copy:check`
  Expected: all PASS.

- [ ] **Step 6: Commit**
  ```bash
  git add src/renderer/workspace-ui.js src/renderer/styles.css copy/ src/renderer/pages/strings.*.js src/main/ublock-strings.json test/unit/spaces-menu-profiles.test.js
  git commit -m "Spaces across profiles: the menu lists every profile's Spaces under their names"
  ```

### Task 4: The New Space editor's Profile choice

**Files:**
- Modify: `src/renderer/workspace-ui.js` (`renderEditor`, `beginNew`, `nameProblem`, `submitNew`, the popup `keydown` handler)
- Modify: `src/renderer/styles.css`
- Test: `test/unit/spaces-editor-profile.test.js`

**Interfaces:**
- Consumes: `otherProfiles[].full`, `profileName`, the `createBlankWorkspace(name, { profileId, color, symbol })` option (Task 2), and the strings from Task 3.
- Produces: `state.draft.profileId` (`null` means this window's profile).

- [ ] **Step 1: Write the failing tests** in `test/unit/spaces-editor-profile.test.js`:
  - `no Profile row with one profile`: `ui.begin('new')` → no `#workspaceProfile`.
  - `no Profile row in the editors from a tab, tabs, a group or a link`: `beginNew({ start: 'tab', tabId: 't1' })` with `otherProfiles` present → no `#workspaceProfile`.
  - `the Profile row defaults to this window's profile`: with Work in `otherProfiles` → a `select#workspaceProfile` whose options read `['Personal', 'Work']` and whose value is `''`.
  - `choosing another profile forces an empty start`: change the select to `w` → `start:window` is `disabled`, `start:empty` has `aria-checked="true"`, and the help text equals `t('ws.editor.helpOtherProfile', { profile: 'Work' })`; changing back re-enables `start:window` and restores `ws.editor.help`.
  - `names are checked against the chosen profile` (Review Focus 3): Personal has "Plan", Work doesn't → with Work chosen, the name "Plan" enables Create; with Personal chosen, it shows the duplicate-name error.
  - `a full profile can't be chosen` (Review Focus 5): Work `full: true` → its `<option>` is `disabled`.
  - `Create in another profile calls create-blank with profileId, never save-as`: submit → `createBlankWorkspace('Hiring', { color, symbol, profileId: 'w' })` is called, and `saveWorkspaceAs` is not.
  - `arrow keys in the select aren't stolen by the menu's roving`: `keydown` ArrowDown with `target` the select → focus is unchanged.

- [ ] **Step 2: Run them to see them fail**
  Run: `node --test test/unit/spaces-editor-profile.test.js`
  Expected: FAIL (no `#workspaceProfile`).

- [ ] **Step 3: Implement.**
  - In `renderEditor`, when `isNew && !state.fixedStart && data.otherProfiles?.length`, add a `ws-label` "Profile" and a native `<select id="workspaceProfile" class="ws-select">` (an option per profile: this one first with value `''`, then `otherProfiles` in order, `disabled` when `full`). Put it above **Start with**.
  - Its `change` handler sets `state.draft.profileId`, forces `state.start = 'empty'` for another profile, and re-renders the segment and the help line.
  - `nameProblem` checks against the chosen profile's `items` names when `state.draft.profileId` is set.
  - `submitNew` with a `profileId` always goes through `openAction({ kind: 'create', name, identity, profileId })`.
  - The popup `keydown` handler also returns early for `event.target.tagName === 'SELECT'`.

- [ ] **Step 4: Run the tests to see them pass**
  Run: `node --test test/unit/spaces-editor-profile.test.js test/unit/spaces-menu.test.js test/unit/workspaces-editor-focus.test.js`
  Expected: all PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/renderer/workspace-ui.js src/renderer/styles.css test/unit/spaces-editor-profile.test.js
  git commit -m "Spaces across profiles: create a Space in another profile from the New Space editor"
  ```

### Task 5: The Quick Switcher finds other profiles' Spaces

**Files:**
- Modify: `src/renderer/overlay.js` (where `wsWorkspaces` is set ~1238, `switcherResults` ~1868, `pickResult` ~2010)
- Modify: `src/renderer/workspace-ui.js` (`switchTo` passes `profileId`)
- Test: `test/unit/switcher-spaces.test.js` (extend its sandbox with `wsOtherProfiles`)

**Interfaces:**
- Consumes: `otherProfiles` (Task 2), `ws.switcher.profileLabel` (Task 3), and `openAction`'s `profileId` (Task 3).
- Produces: a result `{ kind: 'space', workspace: { ...item, profileId, profileName }, sub: 'Space · Work' }`.

- [ ] **Step 1: Write the failing tests** in `switcher-spaces.test.js`:
  - `another profile's Space matches with its profile named`: `wsOtherProfiles = [{ id: 'w', name: 'Work', items: [{ id: 'w1', name: 'Sprint', tabCount: 5 }] }]`, typing "spr" → one `space` result whose `sub` is `ws.switcher.profileLabel` with `{ profile: 'Work' }`.
  - `this profile's Spaces rank above another profile's of equal match`: "Reading" in both → this profile's first.
  - `picking it opens in its profile`: `pickResult` → `calls` contains `['switch', 'w1']`, and the workspace passed carries `profileId: 'w'`.
  - `nothing extra without other profiles`: the existing tests pass unchanged.

- [ ] **Step 2: Run them to see them fail**
  Run: `node --test test/unit/switcher-spaces.test.js`
  Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - Keep `wsOtherProfiles = Array.isArray(payload?.otherProfiles) ? payload.otherProfiles : []` beside `wsWorkspaces`.
  - In `switcherResults`, loop over every other profile's items with the same `matchScore` and score `s + 0.2` (this profile's stay `s + 0.3`), `sub: blancI18n.t('ws.switcher.profileLabel', { profile: p.name })`.
  - `workspaceUI.switchTo(w)` passes `profileId: w.profileId` into `openAction`.
  - `resultKey` keys these as `space:${profileId}:${id}` so they never collide with this profile's.

- [ ] **Step 4: Run the tests to see them pass**
  Run: `node --test test/unit/switcher-spaces.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/renderer/overlay.js src/renderer/workspace-ui.js test/unit/switcher-spaces.test.js
  git commit -m "Spaces across profiles: the Quick Switcher finds Spaces in other profiles"
  ```

### Task 6: Acceptance scenarios and spec records

**Files:**
- Modify: `spec/acceptance/F41-named-workspaces.feature` (F41-83 to F41-92, tagged `@F41 @F33 @desktop`)
- Create: `test/desktop/steps/spaces-across-profiles.steps.js`
- Modify: `test/desktop/cucumber.mjs` (add `'@F41-83'` … `'@F41-92'` to the runnable list)
- Modify: `spec/features.md` (F41 and F33 bullets, spec §8), `spec/parity-matrix.md` (F41 desktop row; phones N/A, D25)
- Modify: `docs/press/release-notes/unreleased.md` (the release-note line from spec §7)

**Interfaces:**
- Consumes: everything above. Test hook calls: `createProfileWindow('Work')` (returns `{ ok, profile, runtimeId }`), `workspaceActionInWindow(runtimeId, …)` to save a Space in a given window, `windowRuntimes()`, `openTabInWindow`, plus the overlay's DOM through `test/desktop/support/overlay.js`'s `overlayPage()`.

- [ ] **Step 1: Write the ten scenarios** from spec §8, each with Given/When/Then lines that name what a person sees. Example for F41-85:
  ```gherkin
  @F41-85 @F41 @F33 @desktop
  Scenario: A Work Space that is open nowhere opens in a new Work window
    Given a Work profile with a saved Space named "Sprint" that no window shows
    And this Personal window shows a web page
    When I choose "Sprint" under "Work" in the Spaces menu
    Then a new Work window shows "Sprint"
    And this Personal window still shows its web page, with no prompt shown
  ```
  F41-87 uses the set-aside setup from `spaces-redesign.steps.js` inside the Work window. F41-92 reuses the Given steps of `shared-spaces.feature` that turn on Spaces sync in Personal.

- [ ] **Step 2: Run the dry run**
  Run: `npm run test:acceptance:dry`
  Expected: the ten new scenarios show as undefined steps.

- [ ] **Step 3: Write the step definitions** in `spaces-across-profiles.steps.js`. Open the menu the way a person does (`I open the Spaces menu from the space mark`'s binding, or ⌘L and the footer button) and click rows by their visible name under their heading. Assert window state through `windowRuntimes()` (`profileId`, `workspaceId`, `tabOrder`, focus).

- [ ] **Step 4: Run them**
  Run (on the Mac Studio): `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F41-83 or @F41-84 or @F41-85 or @F41-86 or @F41-87 or @F41-88 or @F41-89 or @F41-90 or @F41-91 or @F41-92'`
  Expected: 10 scenarios passed.

- [ ] **Step 5: Run the old Spaces and profile scenarios to show nothing changed**
  Run (on the Mac Studio): `npm run test:workspaces:desktop && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F33 or @F60'`
  Expected: all passed.

- [ ] **Step 6: Update the spec records and the release note**; run `npm run test:unit` and `npm run substrate:check`. Expected: PASS.

- [ ] **Step 7: Commit**
  ```bash
  git add spec/ test/desktop/ docs/press/release-notes/unreleased.md
  git commit -m "Spaces across profiles: acceptance scenarios F41-83 to F41-92 and spec records"
  ```

### After the last task

Hand-check a packaged build with three profiles before release (spec §9):
- A site signed in only in Work shows as signed in after opening a Work Space from a Personal window.
- The Quick Switcher result opens the right Space.
- The menu still works at the smallest window with many Spaces.

Record the result in the PR. The fork's plan is written separately after this ships (spec §6).
