# Glance fixes (PR 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner prefers inline execution) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eight verified Glance bugs plus the five smaller defects the audit found, with no new behaviour and no new copy beyond two announcements, as the first of three Glance PRs.

**Architecture:** Every fix stays inside the existing ownership lines: main (`src/main/main.js`, `tab-view.js`, `glance-layout.js`, `display-capture-admission.js`, `window-runtime-registry.js`) keeps attachment, roles, focus and the wake path; the strip (`renderer.js`, `styles.css`, `index.html`) keeps geometry echo and the divider; the overlay (`overlay.html`, `overlay.js`) keeps the picker. Pure logic that can be pure (divider maths, pane visibility) gets a unit test; everything else gets a desktop acceptance scenario in `spec/acceptance/glance.feature` driven through `src/main/test-hook.js`.

**Tech Stack:** Electron 44 (main process + sandboxed chrome documents), `node --test` unit tests, Cucumber + Playwright-Electron acceptance (`npm run test:acceptance:desktop`), the `copy/` i18n substrate.

**Spec:** `docs/superpowers/specs/2026-10-15-glance-refinement-design.md` — sections *Audio in the reference*, *Lifecycle fixes*, *Layout fixes*, the screen-share bullet under *Commands follow focus*, and *Delivery* item 1. The spec's bug list in *Why* is the checklist this PR closes.

## Global Constraints

- PR 1 adds **no new user-visible behaviour** beyond what the spec's *Lifecycle fixes* and *Layout fixes* name, and exactly two new strings: `glance.status.mainClosed` ("{title} is now the main page. Glance closed.") and `glance.status.cancelled` ("Didn’t open that tab in Glance").
- Every new English string ships with `de`, `es`, `fr`, `pt-BR` and `it` in the same change, acknowledged with `npm run copy:ack -- <locale> <keys>`; never hand-edit generated files (`src/renderer/pages/strings.*.js`, `copy/generated/*`).
- Nothing Glance-related is persisted, synced, or sent over IPC beyond what crosses today (`glanceTabId` and geometry). The new `glanceRequestEpoch` lives on the window-runtime record only.
- `:root { … }` custom properties in `styles.css` are guarded by `npm run tokens:check`; the new `--window-controls-w` is declared on `:root[data-platform="darwin"]` / `:root:not([data-platform="darwin"])`, which that guard does not parse, so `tokens/tokens.json` is untouched.
- After editing `src/main/main.js`, `src/main/tab-view.js`, `src/main/test-hook.js` or any other file listed in `security/audit-surface-inventory.json`: `npm run audit-inventory:write`, and commit the regenerated inventory with the change.
- Keyboard delivered to the overlay or strip in acceptance goes through `webContents.sendInputEvent`, never `page.press`, when the behaviour under test lives in main's `before-input-event` (CDP keys bypass it).
- Session rules for this repo: run the `simplify` and `verify` skills right before every commit that changes code (not for docs-only or tests-only commits); run each `git` command on its own (no `&&` chains around git); check `git branch --show-current` is `claude/glance-refinement-plan-68275b` before committing; do not run the full desktop acceptance suite during iteration — run `npm run test:acceptance:desktop -- --tags @glance` and the unit files named in each task; the owner says when to run the full suite.
- Existing Glance scenarios must stay green after every task; the steps in `test/desktop/steps/glance.steps.js` that assert geometry (`pickerPosition.rightGap`, `data-glance-purpose === 'change'`, the stacking invariant) are contracts, not incidental.

## Review Focus

1. **Cancel, then choose again before the first wake lands.** Escape while a quiet tab wakes, then ⌘⇧G again and pick the same tab: the second request must attach once the (single) wake resolves, because its epoch is current. Pinned by Task 5's scenario, which re-summons and chooses after the cancel.
2. **Close Group when the reference is in the group too.** Both panes close; the neighbour rule applies and `glanceTabId` ends null — no promotion of a closed tab. Pinned by Task 3's second scenario.
3. **Divider grabbed at the grip's edge, dragged past the clamp.** A grab offset of 0 or 12 px and a drag beyond 50 %/78 % must clamp without snapping back. Pinned by Task 6's unit tests (clamp at both ends, null for a malformed point) and its drag scenario.
4. **Page tint while stacked.** With the panes stacked the window controls are not over the header, so the sampled-tint rule must still apply there; the new neutral rule is side-by-side only. Pinned by Task 8's second assertion (stacked + `tint-dark` keeps the tint colour).
5. **Moving the reference tab itself to a new window while the Change picker is open.** `moveTabToNewWindow` already calls `closeGlance` for the reference; after Task 5 that call also dismisses the picker, and focus must not land on the vanished Change control. Pinned by Task 5's orphan scenario (same `closeGlance` path) and the existing "keyboard focus is not stranded" step.

---

## File structure

| File | Responsibility in this PR |
| --- | --- |
| `src/main/tab-view.js` | Treat the reference pane as visible for the autoplay guard (Task 1). |
| `src/main/main.js` | `setGlanceTab` reveal + epoch check (1, 5); `moveTabToNewWindow` promotion (2); `closeGroup` promotion (3); `closeTab` focus + announcement (4); `closeGlance` dismisses the picker, `hideOverlay` / `setActiveTab` bump the epoch (5); `resizeGlanceAt` ignores a malformed point (6); `openGlancePicker` placement + reachable empty state, the View item, the restore trigger (9, 10); screen-share `tabAttached` (12). |
| `src/main/window-runtime-registry.js` | `glanceRequestEpoch` field (5). |
| `src/main/glance-layout.js` | `ratioForGlanceDivider` returns `null` for a malformed point (6). |
| `src/main/display-capture-admission.js` | `isVisiblePane(owner, tab)` (12). |
| `src/renderer/renderer.js` | Divider grab offset (6); stacked centring, `data-glance-direction`, header padding moved to CSS (7). |
| `src/renderer/styles.css` | `--window-controls-w`, header padding, stacked pill width (7); window controls over the header (8). |
| `src/renderer/overlay.html` | `#islandDragLive` out of the picker (11). |
| `src/main/test-hook.js` | `simulateMediaStarted`, `focusedWebContentsId`, `tabBounds`, `audioGuarded` projection (1, 2, 4). |
| `test/desktop/support/fixtures-server.js` | `?hold=<ms>` slow page (5). |
| `copy/messages/*.json` | Two announcement strings (4, 5). |
| `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js` | New scenarios and steps (every task). |
| `test/unit/glance-layout.test.js`, `test/unit/display-capture-admission.test.js` | Pure coverage (6, 12). |

---

### Task 1: Media in the reference pane is audible

**Files:**
- Modify: `src/main/tab-view.js:287-291` (the `media-started-playing` handler)
- Modify: `src/main/main.js:6435-6456` (`setGlanceTab`, after the post-wake liveness check)
- Modify: `src/main/test-hook.js` (tab projection near line 500; new `simulateMediaStarted`)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `noteMediaStarted(tab, isActive)`, `revealTabAudio(tab)`, `effectiveTabMuted(tab)` from `src/main/tab-audio.js` (unchanged); `liveContents(tab)`.
- Produces: test-hook `simulateMediaStarted(id) → boolean` and the `audioGuarded` boolean on every tab in `state().tabs`, used by later scenarios.

- [ ] **Step 1: Add the scenarios**

Append to `spec/acceptance/glance.feature`:

```gherkin
  @F34-1 @F34 @D11
  Scenario: Media started in the reference pane is audible
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And media starts playing in the reference pane
    Then the reference pane is not muted as a background tab

  @F34-1 @F34 @D11
  Scenario: A tab muted as a background tab is unmuted when it opens in Glance
    Given three ordinary tabs with one open in Glance
    When media starts playing in the background replacement tab
    And I choose Change and select the replacement tab
    Then the reference pane is not muted as a background tab
```

- [ ] **Step 2: Add the steps**

In `test/desktop/steps/glance.steps.js`, before the `When('I narrow the workspace …` step:

```js
When('media starts playing in the reference pane', async function () {
  assert.equal(await this.call('simulateMediaStarted', this.glanceReferenceId), true);
});

When('media starts playing in the background replacement tab', async function () {
  assert.equal(await this.call('simulateMediaStarted', this.glanceReplacementId), true);
  const state = await this.state();
  const replacement = state.tabs.find((tab) => tab.id === this.glanceReplacementId);
  assert.equal(replacement.audioGuarded, true, 'a hidden tab that starts media is guarded');
});

Then('the reference pane is not muted as a background tab', async function () {
  const state = await this.waitForState((candidate) => {
    const reference = candidate.tabs.find((tab) => tab.id === candidate.glanceTabId);
    return reference && reference.audioGuarded === false;
  });
  assert.equal(state.activeTabId, this.glanceOriginalMainId ?? this.glanceMainId);
});
```

- [ ] **Step 3: Add the test-hook surface**

In `src/main/test-hook.js`, in the tab projection (the object literal that has `audible: !!t.audible,`), add directly after `audible`:

```js
          // Projection of the one-time hidden-start autoplay guard; a visible
          // pane must never carry it.
          audioGuarded: !!t.backgroundAutoplayMuted,
```

In the `// ---- tab / group actions ----` block, after `focusTabContents(id) { … }`:

```js
    // Fire the webContents event the autoplay guard listens to, without a
    // media element: the guard's decision is what is under test.
    simulateMediaStarted(id) {
      const wc = liveContents(tabs.get(id));
      if (!wc || wc.isDestroyed()) return false;
      wc.emit('media-started-playing');
      return true;
    },
```

- [ ] **Step 4: Run the two scenarios to verify they fail**

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: the two new scenarios fail — scenario 1 at "not muted" (`audioGuarded` stays `true`), scenario 2 the same after Change.

- [ ] **Step 5: Treat the reference as visible in the guard**

In `src/main/tab-view.js`, replace the `media-started-playing` handler body:

```js
  wc.on('media-started-playing', boundToTab(() => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    // Both visible panes count as foreground: the reference is on screen and
    // the user pressed play there.
    const owner = getOwner();
    const visible = !owner.resident && (id === owner.activeTabId || id === owner.glanceTabId);
    if (noteMediaStarted(tab, visible)) wc.setAudioMuted(true);
  }));
```

In `src/main/main.js` `setGlanceTab`, directly after `if (!liveContents(tab) || !tab.view) return false;`:

```js
  // A reference pane is revealed: lift the hidden-start guard the way
  // setActiveTab does, so media the user started while this tab was hidden
  // becomes audible now that it is on screen.
  if (revealTabAudio(tab)) liveContents(tab)?.setAudioMuted(effectiveTabMuted(tab));
```

(`revealTabAudio` and `effectiveTabMuted` are already required at `main.js:157`.)

- [ ] **Step 6: Run the scenarios to verify they pass**

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: all Glance scenarios pass. Also `node --test test/unit/tab-audio.test.js` passes (unchanged module).

- [ ] **Step 7: Audit inventory, then commit**

```bash
npm run audit-inventory:write
```

Then (each on its own): `git add src/main/tab-view.js src/main/main.js src/main/test-hook.js spec/acceptance/glance.feature test/desktop/steps/glance.steps.js security/audit-surface-inventory.json`, `git commit -m "Keep media audible in the Glance reference pane"`.

---

### Task 2: Moving the main page to a new window promotes the reference

**Files:**
- Modify: `src/main/main.js:9036-9046` (`moveTabToNewWindow`, the `withWindowRuntime(source, …)` block)
- Modify: `src/main/test-hook.js` (new `tabBounds`)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: test-hook `windowRuntimes()` (snapshots with `id`, `tabOrder`, `activeTabId`, `glanceTabId`) and `moveTabToNewWindow(id) → newRuntimeId`.
- Produces: test-hook `tabBounds(id) → {x,y,width,height} | null`.

- [ ] **Step 1: Add the scenario**

```gherkin
  @F34-1 @F34 @F2 @D11
  Scenario: Moving the main page to a new window promotes the reference
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I move the main page to a new window
    Then the reference is the only page of the original window
```

- [ ] **Step 2: Add the steps**

```js
When('I move the main page to a new window', async function () {
  const state = await this.state();
  this.glanceSplitWidth = state.glanceGeometry.primary.width;
  const runtimes = await this.call('windowRuntimes');
  this.glanceSourceRuntimeId = runtimes.find((runtime) => runtime.tabOrder.includes(this.glanceMainId)).id;
  this.glanceNewRuntimeId = await this.call('moveTabToNewWindow', this.glanceMainId);
  assert.ok(this.glanceNewRuntimeId, 'the main page was not adopted by a new window');
  assert.notEqual(this.glanceNewRuntimeId, this.glanceSourceRuntimeId);
});

Then('the reference is the only page of the original window', async function () {
  const source = await waitForValue(
    async () => (await this.call('windowRuntimes')).find((runtime) => runtime.id === this.glanceSourceRuntimeId),
    (runtime) => runtime && runtime.activeTabId === this.glanceReferenceId && runtime.glanceTabId === null,
    'the source window promoted the reference and closed Glance'
  );
  assert.deepEqual(source.tabOrder, [this.glanceReferenceId]);
  const bounds = await this.call('tabBounds', this.glanceReferenceId);
  assert.ok(bounds && bounds.width > this.glanceSplitWidth, `reference still at split width: ${JSON.stringify(bounds)}`);
});
```

Add to the test hook, after `simulateMediaStarted`:

```js
    tabBounds(id) {
      const tab = tabs.get(id);
      return tab?.view ? tab.view.getBounds() : null;
    },
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: the new scenario fails at `glanceTabId === null` (today it dangles at the moved tab's id) or at the width check.

- [ ] **Step 4: Promote before selecting a survivor**

Replace the `withWindowRuntime(source, () => { … })` block in `moveTabToNewWindow` with:

```js
  withWindowRuntime(source, () => {
    cancelPermissionPromptsForTab(id);
    if (rt().glanceTabId === id) closeGlance({ focusContent: false });
    if (rt().activeTabId === id) {
      // Moving the main page away with a reference beside it is the same
      // transition as closing the main page: the reference becomes the sole
      // page and Glance collapses. Clear glanceTabId FIRST so setActiveTab
      // takes its ordinary path — its promote branch would otherwise keep the
      // departing tab as the reference of a window it no longer belongs to.
      const referenceId = rt().glanceTabId && tabs.has(rt().glanceTabId) ? rt().glanceTabId : null;
      if (referenceId) rt().glanceTabId = null;
      const mruId = referenceId ?? previousSurvivor(rt().activationHistory,
        (tid) => tid !== id && tabs.has(tid) && windowRuntimes.runtimeForTab(tid) === rt());
      const survivor = mruId ?? pickSurvivorTabId(source.tabOrder, id);
      if (survivor != null) setActiveTab(survivor, { focusContent: false });
    }
    source.tabOrder = source.tabOrder.filter((tid) => tid !== id);
    source.activationHistory = (source.activationHistory ?? []).filter((tid) => tid !== id);
    rt().tabsWantingAddressBarFocus.delete(id);
    tab.groupId = null; // ungroup BEFORE pruning, or the empty group survives
    pruneEmptyGroups();
    broadcastTabs(); // persists the session as part of the broadcast
  });
```

Update the comment block above it (the "If the tab is the Glance pane, close that; if active, hand focus to the MRU survivor" sentence) to: "If the tab is the Glance pane, close that; if active with a reference beside it, promote the reference (closeTab's rule); otherwise hand focus to the MRU survivor with the right-neighbour as fallback."

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: pass. Also run `npm run test:acceptance:desktop -- --tags @F2` (multi-window scenarios) — expected pass, nothing else in `moveTabToNewWindow` changed.

- [ ] **Step 6: Audit inventory, commit**

`npm run audit-inventory:write`; `git add` the five files; `git commit -m "Promote the Glance reference when the main page moves to a new window"`.

---

### Task 3: Close Group promotes a surviving reference

**Files:**
- Modify: `src/main/main.js:5211-5218` (`closeGroup`, the "One replacement selection" block)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: test-hook `groupTabByName(id, name)`, `closeGroupByName(name)`, `tabBounds(id)` (Task 2).

- [ ] **Step 1: Add the scenarios**

```gherkin
  @F34-1 @F34 @F2 @D11
  Scenario: Closing the main page's group promotes the reference
    Given four ordinary tabs with the third open in Glance
    And the main page and the fourth tab share a group
    When I close that group
    Then the reference is the main page and Glance is closed

  @F34-1 @F34 @F2 @D11
  Scenario: Closing a group that holds both panes leaves no reference behind
    Given three ordinary tabs with one open in Glance
    And the main page and the reference share a group
    When I close that group
    Then the third tab is the main page and Glance is closed
```

- [ ] **Step 2: Add the steps**

```js
// Tab order [main, bystander, reference, fourth]: with the reference NOT the
// first survivor, today's closeGroup activates the bystander at the anchor
// index and leaves Glance open — the scenario fails for the right reason.
Given('four ordinary tabs with the third open in Glance', async function () {
  this.glanceMainId = await this.call('openTab', this.fixtureUrl('glance-main'));
  this.glanceBystanderId = await this.call('openTab', this.fixtureUrl('glance-bystander'));
  this.glanceReferenceId = await this.call('openTab', this.fixtureUrl('glance-reference'));
  this.glanceReplacementId = await this.call('openTab', this.fixtureUrl('glance-replacement'));
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) =>
    ['glance-main', 'glance-bystander', 'glance-reference', 'glance-replacement'].every((title) =>
      state.tabs.some((tab) => tab.title === title && !tab.isLoading)));
  assert.equal(await this.call('setGlance', this.glanceReferenceId), true);
  this.glanceSplitWidth = (await this.state()).glanceGeometry.primary.width;
});

Given('the main page and the fourth tab share a group', async function () {
  await this.call('groupTabByName', this.glanceMainId, 'Research');
  await this.call('groupTabByName', this.glanceReplacementId, 'Research');
  await this.waitForState((state) => state.groups.some((group) => group.name === 'research'));
});

Given('the main page and the reference share a group', async function () {
  await this.call('groupTabByName', this.glanceMainId, 'Research');
  await this.call('groupTabByName', this.glanceReferenceId, 'Research');
  await this.waitForState((state) => state.groups.some((group) => group.name === 'research'));
});

When('I close that group', async function () {
  await this.call('closeGroupByName', 'Research');
});

Then('the reference is the main page and Glance is closed', async function () {
  const state = await this.waitForState((candidate) =>
    candidate.activeTabId === this.glanceReferenceId && candidate.glanceTabId === null);
  assert.deepEqual(state.tabOrder, [this.glanceBystanderId, this.glanceReferenceId]);
  const bounds = await this.call('tabBounds', this.glanceReferenceId);
  assert.ok(bounds.width > this.glanceSplitWidth);
});

Then('the third tab is the main page and Glance is closed', async function () {
  const state = await this.waitForState((candidate) =>
    candidate.activeTabId === this.glanceReplacementId && candidate.glanceTabId === null);
  assert.deepEqual(state.tabOrder, [this.glanceReplacementId]);
});
```

(Group names are stored lowercased by `groupTabByName`'s `lc`, hence `'research'` in the wait.)

- [ ] **Step 3: Run to verify**

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: scenario 1 fails — the bystander is activated at the anchor index and `glanceTabId` keeps pointing at the reference. Scenario 2 passes already; keep it as the Review Focus 2 pin.

- [ ] **Step 4: Prefer the reference**

In `closeGroup`, replace the block starting `// One replacement selection at the end, not one per member.`:

```js
  // One replacement selection at the end, not one per member. If the group
  // took the main page but not the reference, the reference is the only page
  // still on screen: promote it (closeTab's own rule) rather than a neighbour.
  if (!runtime.activeTabId) {
    const referenceId = runtime.glanceTabId && tabs.has(runtime.glanceTabId) ? runtime.glanceTabId : null;
    if (referenceId) {
      runtime.glanceTabId = null;
      setActiveTab(referenceId);
    } else if (runtime.tabOrder.length > 0) {
      setActiveTab(runtime.tabOrder[Math.min(Math.max(anchorIndex, 0), runtime.tabOrder.length - 1)]);
    } else if (hasLiveWindow()) {
      setActiveTab(createTab());
    }
  }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:acceptance:desktop -- --tags @glance`; also `npm run test:acceptance:desktop -- --tags @F2-6` (the atomic group-close scenarios).
Expected: pass.

- [ ] **Step 6: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Promote the Glance reference when Close Group removes the main page"`.

---

### Task 4: Focus and announcements when a pane's tab closes

**Files:**
- Modify: `copy/messages/en.json` (after `glance.status.tabClosed`, line 2626), `de.json`, `es.json`, `fr.json`, `pt-BR.json`, `it.json`
- Regenerate: `npm run copy:build` outputs
- Modify: `src/main/main.js:6700-6702` and `:6779-6790` and `:6811-6817` (`closeTab`)
- Modify: `src/main/test-hook.js` (electron import; new `focusedWebContentsId`)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `displayTitle(tab)` from `./tab-name` (required at `main.js:184`), `chrome:glance-status` (strip sets `#glanceStatus.textContent`, `renderer.js:1050`).
- Produces: strings `glance.status.mainClosed` and `glance.status.cancelled` (Task 5 uses the second); test-hook `focusedWebContentsId() → number | null`.

- [ ] **Step 1: Add both strings in every language**

In `copy/messages/en.json`, directly after the `glance.status.tabClosed` entry:

```json
  "glance.status.mainClosed": {
    "message": "{title} is now the main page. Glance closed.",
    "note": "Screen reader announcement after the main tab closes while Glance is open and the reference takes its place; {title} is the reference's title."
  },
  "glance.status.cancelled": {
    "message": "Didn’t open that tab in Glance",
    "note": "Screen reader announcement when a quiet tab chosen for Glance finishes waking after the person cancelled the picker."
  },
```

In each translation file, directly after its `glance.status.tabClosed` entry, add both keys with a `message` only (the `source` hash is written by `copy:ack`). Match each file's existing wording for "Glance closed" in its `glance.status.closed` entry:

| key | de | es | fr | pt-BR | it |
| --- | --- | --- | --- | --- | --- |
| `glance.status.mainClosed` | `{title} ist jetzt die Hauptseite. Glance geschlossen.` | `{title} es ahora la página principal. Glance cerrado.` | `{title} est maintenant la page principale. Glance fermé.` | `{title} agora é a página principal. Glance fechado.` | `{title} è ora la pagina principale. Glance chiuso.` |
| `glance.status.cancelled` | `Dieser Tab wurde nicht in Glance geöffnet` | `Esa pestaña no se abrió en Glance` | `Cet onglet n’a pas été ouvert dans Glance` | `Essa aba não foi aberta no Glance` | `Quella scheda non è stata aperta in Glance` |

Then:

```bash
npm run copy:ack -- de glance.status.mainClosed glance.status.cancelled
npm run copy:ack -- es glance.status.mainClosed glance.status.cancelled
npm run copy:ack -- fr glance.status.mainClosed glance.status.cancelled
npm run copy:ack -- pt-BR glance.status.mainClosed glance.status.cancelled
npm run copy:ack -- it glance.status.mainClosed glance.status.cancelled
npm run copy:build
npm run copy:check
```

Expected: `copy:check` passes. If `copy:ack` rejects an entry without `source`, run `npm run copy:status -- de` and match the shape it reports. `src/main/ublock-strings.json` must not change.

- [ ] **Step 2: Add the scenarios**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Closing the reference tab returns focus to the main page
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane holds keyboard focus
    And I close the underlying Glance tab
    Then keyboard focus is on the main page

  @F34-1 @F34 @D11
  Scenario: Closing the main page announces the promoted reference
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I close the main page tab
    Then the strip announces that the reference is now the main page
```

- [ ] **Step 3: Add the steps and the hook**

Add `const { frontChromeWindow } = require('../support/tab-drag');` to the step file's requires (Task 6 uses it too).

```js
// Prove the precondition, so a harness that cannot observe focus fails here
// rather than passing the product assertion vacuously.
When('the reference pane holds keyboard focus', async function () {
  await frontChromeWindow(this);
  assert.equal(await this.call('focusTabContents', this.glanceReferenceId), true);
  const reference = (await this.state()).tabs.find((tab) => tab.id === this.glanceReferenceId);
  await waitForValue(
    () => this.call('focusedWebContentsId'),
    (id) => id === reference.webContentsId,
    'reference pane focused before the close'
  );
});

When('I close the main page tab', async function () {
  const state = await this.state();
  assert.equal(state.activeTabId, this.glanceMainId);
  await this.call('closeTab', this.glanceMainId);
});

Then('keyboard focus is on the main page', async function () {
  const state = await this.waitForState((candidate) => candidate.glanceTabId === null);
  const main = state.tabs.find((tab) => tab.id === this.glanceMainId);
  await waitForValue(
    () => this.call('focusedWebContentsId'),
    (id) => id === main.webContentsId,
    'focus handed to the main page after the reference closed'
  );
});

Then('the strip announces that the reference is now the main page', async function () {
  await this.waitForState((candidate) =>
    candidate.activeTabId === this.glanceReferenceId && candidate.glanceTabId === null);
  const chrome = await mainChromePage();
  await waitForValue(
    () => chrome.locator('#glanceStatus').textContent(),
    (text) => text === 'glance-reference is now the main page. Glance closed.',
    'main-closed announcement'
  );
});
```

In `src/main/test-hook.js` change the electron import to `const { app, Menu, clipboard, nativeImage, webContents } = require('electron');` and add after `tabBounds`:

```js
    focusedWebContentsId() { return webContents.getFocusedWebContents()?.id ?? null; },
```

- [ ] **Step 4: Run to verify both fail**

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: scenario 1 times out on the focus wait (focus is on the strip document); scenario 2 times out — `#glanceStatus` never carries the new text.

- [ ] **Step 5: Hand focus over and announce**

In `closeTab`, directly after `const wasGlance = id === rt().glanceTabId;`:

```js
  // Read before the view is prepared for close: detaching drops focus onto
  // the chrome strip, and the main page should take it instead.
  const referenceHeldFocus = wasGlance && liveContents(tab)?.isFocused() === true;
```

In the `if (survivingGlanceId) { … }` branch, after `setActiveTab(survivingGlanceId);`:

```js
      if (hasLiveWindow()) {
        const promoted = tabs.get(survivingGlanceId);
        rt().window.webContents.send('chrome:glance-status', mainI18n.t('glance.status.mainClosed', {
          title: displayTitle(promoted) || mainI18n.t('tab.untitledShort'),
        }));
      }
```

Replace the trailing `wasGlance` block:

```js
  if (wasGlance && hasLiveWindow()) {
    resizeActiveView();
    // The reference held keyboard focus: hand it to the main page rather than
    // leaving it on the strip where the detached view dropped it.
    if (referenceHeldFocus) liveContents(tabs.get(rt().activeTabId))?.focus();
    rt().window.webContents.send('chrome:glance-status', mainI18n.t('glance.status.tabClosed'));
  }
```

- [ ] **Step 6: Run to verify both pass**

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: pass, including the existing "Cancelling a Change picker after its reference closed" scenario.

- [ ] **Step 7: Audit inventory, commit**

Before committing, `git status` and add every file `copy:build` regenerated. `npm run audit-inventory:write`; `git add`; `git commit -m "Hand focus to the main page and announce promotions when a Glance pane's tab closes"`.

---

### Task 5: Cancelling a wake cancels; closing Glance takes the picker with it

**Files:**
- Modify: `src/main/window-runtime-registry.js:~131` (after `surfaceGeneration: 0,`)
- Modify: `src/main/main.js` — `hideOverlay` (3513), `setActiveTab` (6308), `setGlanceTab` (6435), `closeGlance` (6480)
- Modify: `test/desktop/support/fixtures-server.js` (`start()` handler)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `glance.status.cancelled` (Task 4).
- Produces: `rt().glanceRequestEpoch` (number) and `bumpGlanceRequestEpoch()` in main.

- [ ] **Step 1: Give the fixture server a slow page**

In `test/desktop/support/fixtures-server.js`, inside `http.createServer((req, res) => { … })`, directly after the `redirect-start` block and before the final `res.writeHead(200, …)`:

```js
    // ?hold=<ms>: headers now, body after the hold, so a scenario can act
    // while a quiet tab is still waking (its wake resolves on finish-load).
    const hold = Number(url.searchParams.get('hold'));
    if (Number.isFinite(hold) && hold > 0) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.flushHeaders();
      setTimeout(() => res.end(pageBody(req)), hold);
      return;
    }
```

- [ ] **Step 2: Add the scenarios**

```gherkin
  @F34-1 @F34 @F31 @D11
  Scenario: Cancelling the picker while a quiet tab wakes leaves Glance closed
    Given a quiet background tab that loads slowly
    When I summon Glance from its native keyboard shortcut
    And I choose the slow quiet tab and cancel with Escape before it wakes
    Then Glance stays closed after the tab finishes loading
    When I summon Glance from its native keyboard shortcut
    And I filter the Glance picker and choose the reference tab
    Then the quiet reference wakes into Glance

  @F34-1 @F34 @D11
  Scenario: Closing Glance takes the Change picker with it
    Given three ordinary tabs with one open in Glance
    When I open the Change picker and close Glance from the keyboard shortcut
    Then the picker is dismissed with Glance
    And keyboard focus is not stranded on the chrome strip
```

- [ ] **Step 3: Add the steps**

```js
Given('a quiet background tab that loads slowly', async function () {
  this.glanceMainUrl = this.fixtureUrl('glance-main');
  this.glanceReferenceUrl = `${this.fixtureUrl('glance-reference')}?hold=2500`;
  this.glanceMainId = await this.call('openTab', this.glanceMainUrl);
  this.glanceReferenceId = await this.call('openTab', this.glanceReferenceUrl);
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) => {
    const main = state.tabs.find((tab) => tab.id === this.glanceMainId);
    const reference = state.tabs.find((tab) => tab.id === this.glanceReferenceId);
    return main?.title === 'glance-main' && reference?.title === 'glance-reference'
      && !main.isLoading && !reference.isLoading;
  });
  assert.equal(await this.call('sleepTab', this.glanceReferenceId), true);
  await this.waitForState((candidate) =>
    candidate.tabs.find((tab) => tab.id === this.glanceReferenceId)?.asleep === true);
});

When('I choose the slow quiet tab and cancel with Escape before it wakes', async function () {
  const page = await overlayPage();
  await page.fill('#glancePickerInput', 'reference');
  await page.locator('.glance-picker-option').first().waitFor();
  await page.press('#glancePickerInput', 'Enter');
  await page.locator('#glancePickerInput[aria-busy="true"]').waitFor();
  // The real cancel path is main's before-input-event on the overlay.
  await ctx.app.evaluate(({ webContents }) => {
    const overlay = webContents.getAllWebContents()
      .find((candidate) => candidate.getURL() === 'blanc-chrome://overlay/');
    overlay.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    overlay.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  });
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'picker cancelled mid-wake');
});

Then('Glance stays closed after the tab finishes loading', async function () {
  const state = await this.waitForState((candidate) => {
    const reference = candidate.tabs.find((tab) => tab.id === this.glanceReferenceId);
    return reference && !reference.asleep && !reference.isLoading;
  });
  assert.equal(state.glanceTabId, null, 'a cancelled wake still attached Glance');
  const chrome = await mainChromePage();
  await waitForValue(
    () => chrome.locator('#glanceStatus').textContent(),
    (text) => text === 'Didn’t open that tab in Glance',
    'cancelled-wake announcement'
  );
});

When('I open the Change picker and close Glance from the keyboard shortcut', async function () {
  const chrome = await mainChromePage();
  await chrome.evaluate(() => {
    window.__glanceRestoreTriggerProbe = 'unset';
    window.browserAPI.onIslandState(({ restoreTrigger }) => {
      window.__glanceRestoreTriggerProbe = restoreTrigger;
    });
  });
  await chrome.locator('#glanceChange').click();
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'change picker');
  assert.equal(await this.call('pressGlanceShortcut'), true);
});

Then('the picker is dismissed with Glance', async function () {
  await this.waitForState((state) => state.glanceTabId === null);
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'picker dismissed by Close Glance');
});
```

- [ ] **Step 4: Run to verify both fail**

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: scenario 1 fails at "a cancelled wake still attached Glance"; scenario 2 fails because `overlayMode` stays `'glance'` after the shortcut.

- [ ] **Step 5: Add the epoch**

`src/main/window-runtime-registry.js`, after `surfaceGeneration: 0,`:

```js
    /** Bumped whenever the surface a Glance choice was made from goes away
     * (overlay hide, Glance close, a real tab switch). setGlanceTab captures
     * it before waking a quiet tab and attaches nothing if it moved. */
    glanceRequestEpoch: 0,
```

In `main.js`, next to `bumpSurfaceGeneration`'s definition, add:

```js
function bumpGlanceRequestEpoch() {
  rt().glanceRequestEpoch = (rt().glanceRequestEpoch ?? 0) + 1;
}
```

Call it: in `hideOverlay` directly after `bumpSurfaceGeneration();`; in `setActiveTab` directly after its `bumpSurfaceGeneration();` (the one after the "Re-selecting the active tab is a no-op" return); in `closeGlance` directly after `bumpSurfaceGeneration();`.

In `setGlanceTab`, replace the wake line and the comment above the re-resolve:

```js
  const requestEpoch = rt().glanceRequestEpoch ?? 0;
  if (tab.asleep && !(await wakeTab(id))) return false;
  if ((rt().glanceRequestEpoch ?? 0) !== requestEpoch) {
    // The person dismissed the surface they chose from, switched tabs, or
    // closed Glance while the tab was waking: a late attach would pop a pane
    // open under their next action.
    if (hasLiveWindow()) rt().window.webContents.send('chrome:glance-status', mainI18n.t('glance.status.cancelled'));
    return false;
  }
  // Wake is asynchronous. Re-resolve every ownership/liveness condition so a
  // tab closed, moved, or superseded while loading can never be attached.
```

- [ ] **Step 6: Dismiss the picker from closeGlance**

In `closeGlance`, directly after `rt().glanceTabId = null;` (so `activeGlanceTab()` is already null and the restore trigger falls through to content, never to the vanished Change control):

```js
  // ⌘⇧G or View → Close Glance while the Change picker is up: the picker is
  // about a pane that no longer exists, so it goes with it.
  if (rt().overlayMode === 'glance') hideOverlay({ refocusContent: false, reason: 'cancel' });
```

- [ ] **Step 7: Run to verify both pass**

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: pass. The picker's own success path is unaffected: `chooseGlanceTab` awaits `setGlanceTab` and only then calls `closeOverlay`.

- [ ] **Step 8: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Cancel a Glance choice when its surface goes away, and close the picker with Glance"`.

---

### Task 6: The divider stays under the pointer

**Files:**
- Modify: `src/main/glance-layout.js:115-131` (`ratioForGlanceDivider`)
- Modify: `src/main/main.js:6520-6527` (`resizeGlanceAt`)
- Modify: `src/renderer/renderer.js:939-964` (divider pointer handlers)
- Test: `test/unit/glance-layout.test.js`, `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Produces: `ratioForGlanceDivider(pageBounds, point, direction) → number | null` (was: default ratio for a malformed point).

- [ ] **Step 1: Write the failing unit tests**

In `test/unit/glance-layout.test.js`, inside the existing divider test (the one with `{ x: -500 }` / `{ x: 5000 }` asserts), add:

```js
  assert.equal(ratioForGlanceDivider(page, { x: Number.NaN }, 'horizontal'), null, 'a malformed point is ignored, not reset');
  assert.equal(ratioForGlanceDivider(page, undefined, 'vertical'), null);
```

Run: `node --test test/unit/glance-layout.test.js`
Expected: FAIL — both return `0.62`.

- [ ] **Step 2: Return null for a malformed point**

In `glance-layout.js` change `if (!Number.isFinite(coordinate)) return DEFAULT_GLANCE_RATIO;` to `if (!Number.isFinite(coordinate)) return null;` and update the function's JSDoc to "Convert a renderer-reported divider coordinate back into a safe ratio; `null` when the point carries no usable coordinate."

In `main.js` `resizeGlanceAt`:

```js
function resizeGlanceAt(point) {
  const layout = currentChromeLayout();
  const glance = glanceGeometry(layout);
  if (!glance) return null;
  const ratio = ratioForGlanceDivider(layout.pageBounds, point, glance.direction);
  if (ratio == null) return null;
  rt().glanceRatio = ratio;
  resizeActiveView();
  return rt().glanceRatio;
}
```

Run: `node --test test/unit/glance-layout.test.js` — expected PASS.

- [ ] **Step 3: Add the drag scenario**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Dragging the divider keeps it under the pointer
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I drag the Glance divider 80 pixels to the left from inside its grip
    Then the divider moved 80 pixels
```

Steps (`frontChromeWindow` is already required since Task 4):

```js
When('I drag the Glance divider {int} pixels to the left from inside its grip', async function (distance) {
  await this.call('resetGlanceRatio');
  await this.waitForState((candidate) => Math.round(candidate.glanceGeometry.ratio * 100) === 62);
  await frontChromeWindow(this);
  const chrome = await mainChromePage();
  const box = await chrome.locator('#glanceDivider').boundingBox();
  this.glanceDividerStartX = (await this.state()).glanceGeometry.divider.x;
  // 10px into the 12px grip: without grab-offset compensation the first move
  // snaps the divider's left edge to the pointer, i.e. 10px short.
  const x = box.x + box.width - 2;
  const y = box.y + box.height / 2;
  await chrome.mouse.move(x, y);
  await chrome.mouse.down();
  try {
    await chrome.mouse.move(x - distance / 2, y);
    await chrome.mouse.move(x - distance, y);
  } finally {
    await chrome.mouse.up();
  }
});

Then('the divider moved {int} pixels', async function (distance) {
  await waitForValue(
    () => this.state(),
    (state) => Math.abs((this.glanceDividerStartX - state.glanceGeometry.divider.x) - distance) <= 1,
    `divider ${distance}px left of where it started`
  );
});
```

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: the new scenario fails — the divider moved ~70 px.

- [ ] **Step 4: Compensate the grab offset in the strip**

In `renderer.js`, replace the `pointerdown` handler and add a helper the move/finish handlers use:

```js
  glanceDivider.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !glanceLayout) return;
    event.preventDefault();
    // Main maps the reported point to the divider's leading edge, so report
    // the pointer minus where inside the grip it went down — otherwise the
    // first move jumps the divider by that much.
    const rect = glanceDivider.getBoundingClientRect();
    glanceResizeState = {
      pointerId: event.pointerId,
      grabOffset: glanceLayout.direction === 'horizontal'
        ? event.clientX - rect.left
        : event.clientY - rect.top,
    };
    glanceDivider.setPointerCapture(event.pointerId);
    document.documentElement.dataset.glanceResizing = glanceLayout.direction;
  });
  const glanceDragPoint = (event) => (
    glanceLayout?.direction === 'horizontal'
      ? { x: event.clientX - glanceResizeState.grabOffset, y: event.clientY }
      : { x: event.clientX, y: event.clientY - glanceResizeState.grabOffset }
  );
  glanceDivider.addEventListener('pointermove', (event) => {
    if (!glanceResizeState || glanceResizeState.pointerId !== event.pointerId) return;
    queueGlanceResize(glanceDragPoint(event));
  });
  const finishGlanceResize = (event) => {
    if (!glanceResizeState || glanceResizeState.pointerId !== event.pointerId) return;
    queueGlanceResize(glanceDragPoint(event));
    glanceResizeState = null;
    delete document.documentElement.dataset.glanceResizing;
    if (glanceDivider.hasPointerCapture(event.pointerId)) {
      glanceDivider.releasePointerCapture(event.pointerId);
    }
  };
```

(The `pointerup`, `pointercancel`, `lostpointercapture`, `dblclick` and `keydown` listeners stay as they are.)

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:acceptance:desktop -- --tags @glance` and `node --test test/unit/glance-layout.test.js`
Expected: pass, including the existing keyboard-resize scenario (keyboard resizing goes through `pointForGlanceRatio`, untouched).

- [ ] **Step 6: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Keep the Glance divider under the pointer while dragging"`.

---

### Task 7: Stacked Island centring and the window-control reservation

**Files:**
- Modify: `src/renderer/renderer.js:395-434` (`applyGlanceLayout` — the show and hide paths)
- Modify: `src/renderer/styles.css:197-212` (`#strip.glance-open`, `.glance-header`), `:303-307` (vertical header rules), `:403-405` (vertical-rail pill rule stays)
- Test: `test/desktop/steps/glance.steps.js` (extend the stacked step)

**Interfaces:**
- Produces: `#strip[data-glance-direction="horizontal" | "vertical"]` while Glance is open (Task 8 keys on it); CSS variable `--window-controls-w` (114px off-macOS, 0px on macOS).

- [ ] **Step 1: Extend the stacked step with the failing assertions**

In the `Then('Glance has a labelled stacked header above its reference content'` step, directly after `await header.waitFor();`:

```js
  // Stacked, the main page is the full page width, so the Island is centred
  // over the whole page — not over 68% of it.
  const centring = await chrome.evaluate(() => {
    const strip = document.getElementById('strip');
    const pill = document.getElementById('islandPill').getBoundingClientRect();
    return {
      direction: strip.dataset.glanceDirection,
      primaryRight: parseFloat(getComputedStyle(strip).getPropertyValue('--glance-primary-right')),
      pillCenter: pill.left + pill.width / 2,
      headerPaddingRight: getComputedStyle(document.getElementById('glanceHeader')).paddingRight,
    };
  });
  const { page: pageBounds } = state.glanceGeometry;
  assert.equal(centring.direction, 'vertical');
  assert.equal(centring.primaryRight, pageBounds.x + pageBounds.width);
  const pageCenter = pageBounds.x + pageBounds.width / 2;
  assert.ok(Math.abs(centring.pillCenter - pageCenter) <= 2, `pill centre ${centring.pillCenter}, page centre ${pageCenter}`);
  assert.equal(centring.headerPaddingRight, '12px', 'stacked header keeps the plain 12px inset');
```

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: the stacked scenario fails at `primaryRight` (today `page.x + round(page.width * 0.68)`).

- [ ] **Step 2: Centre over the full width and hand padding to CSS**

In `renderer.js` `applyGlanceLayout`, in the hide path next to `stripEl.style.removeProperty('--glance-primary-width');` add `delete stripEl.dataset.glanceDirection;`. In the show path replace:

```js
    const chromePrimaryRight = direction === 'horizontal'
      ? primary.x + primary.width
      : page.x + Math.round(page.width * 0.68);
```

with:

```js
    // Side by side the Island sits over the main pane; stacked, the main
    // pane is the full page width.
    const chromePrimaryRight = direction === 'horizontal'
      ? primary.x + primary.width
      : page.x + page.width;
    stripEl.dataset.glanceDirection = direction;
```

Delete the line `glanceHeader.style.paddingRight = \`${direction === 'horizontal' && !isMac ? 126 : 12}px\`;`.

In `styles.css`, directly before the `#strip.glance-open {` rule:

```css
/* Width of the custom Windows/Linux window-control cluster (3 × 34px, two
   2px gaps, 8px inset), reserved by the side-by-side Glance header and the
   stacked pill. macOS draws native traffic lights at the left and reserves
   nothing. Declared off :root {} so tokens:check stays desktop-only. */
:root[data-platform="darwin"] { --window-controls-w: 0px; }
:root:not([data-platform="darwin"]) { --window-controls-w: 114px; }
```

After the `#strip.glance-open #islandPill { … }` rule:

```css
/* Stacked: centred over the full page, kept clear of the window controls on
   both sides so the centre line does not move. */
#strip.glance-open[data-glance-direction="vertical"] #islandPill {
  max-width: calc((var(--glance-primary-width) - 2 * var(--window-controls-w) - 24px) / var(--pill-zoom));
}
```

After the `.glance-header[data-direction="vertical"] { … }` rule:

```css
.glance-header[data-direction="horizontal"] {
  padding-right: calc(12px + var(--window-controls-w));
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `npm run test:acceptance:desktop -- --tags @glance`; `npm run substrate:check` (the tokens guard must not see `--window-controls-w`).
Expected: pass. The side-by-side step's `headerFlow.actionsRight <= headerFlow.headerRight` still holds (macOS padding is 12 + 0).

- [ ] **Step 4: Commit**

`git add`; `git commit -m "Centre the Island over the full page when Glance is stacked"`.

---

### Task 8: Window controls over the side-by-side header ignore the page tint

**Files:**
- Modify: `src/renderer/styles.css:369-376` (after the `#strip.tint-dark #windowControls` rules)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `#strip[data-glance-direction]` (Task 7).

- [ ] **Step 1: Add the scenario and step**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Window controls stay legible over the Glance header
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    Then window controls over the side-by-side header ignore the page tint
    When I narrow the workspace below the side-by-side threshold
    Then window controls follow the page tint while Glance is stacked
```

The controls are only populated off-macOS, so both steps probe the stylesheet with a throwaway button inside `#windowControls` and read what the cascade gives it:

```js
async function windowControlColours(chrome) {
  return chrome.evaluate(() => {
    const strip = document.getElementById('strip');
    const button = document.createElement('button');
    document.getElementById('windowControls').append(button);
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim();
    document.body.append(probe);
    const hadTint = strip.classList.contains('tint-dark');
    strip.classList.add('tint-dark');
    const tinted = getComputedStyle(button).color;
    strip.classList.remove('tint-dark');
    const plain = getComputedStyle(button).color;
    if (hadTint) strip.classList.add('tint-dark');
    const result = { tinted, plain, dim: getComputedStyle(probe).color, direction: strip.dataset.glanceDirection };
    button.remove();
    probe.remove();
    return result;
  });
}

Then('window controls over the side-by-side header ignore the page tint', async function () {
  const chrome = await mainChromePage();
  const colours = await windowControlColours(chrome);
  assert.equal(colours.direction, 'horizontal');
  assert.equal(colours.tinted, colours.dim, 'a dark page tint turned the controls white over the neutral header');
  assert.equal(colours.plain, colours.dim);
});

Then('window controls follow the page tint while Glance is stacked', async function () {
  await this.waitForState((candidate) => candidate.glanceGeometry?.direction === 'vertical');
  const chrome = await mainChromePage();
  const colours = await windowControlColours(chrome);
  assert.equal(colours.direction, 'vertical');
  assert.equal(colours.tinted, 'rgba(245, 245, 245, 0.75)', 'stacked, the controls are over the page again and keep the tint rule');
  await this.call('setWindowContentSize', 1200, 800);
});
```

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: the first Then fails (`tinted` is the white).

- [ ] **Step 2: Add the rules**

In `styles.css`, directly after the `#strip.tint-dark #mainMenuButton:hover` rule block:

```css
/* Side-by-side Glance: the controls sit on the header's neutral surface, not
   the sampled page tint — take the theme's ink and a fill the header lacks.
   Stacked, the header is below the page and the tint rules above apply. */
#strip.glance-open[data-glance-direction="horizontal"] #windowControls button,
#strip.tint-dark.glance-open[data-glance-direction="horizontal"] #windowControls button { color: var(--text-dim); }
#strip.glance-open[data-glance-direction="horizontal"] #windowControls button:hover,
#strip.tint-dark.glance-open[data-glance-direction="horizontal"] #windowControls button:hover {
  background: var(--accent-dim);
  color: var(--text);
}
#strip.glance-open[data-glance-direction="horizontal"] #windowControls button.close-btn:hover,
#strip.tint-dark.glance-open[data-glance-direction="horizontal"] #windowControls button.close-btn:hover {
  background: var(--danger);
  color: var(--on-danger);
}
```

- [ ] **Step 3: Run to verify it passes**

Run: `npm run test:acceptance:desktop -- --tags @glance` — expected pass.

- [ ] **Step 4: Commit**

`git add`; `git commit -m "Keep Windows and Linux window controls legible over the Glance header"`.

---

### Task 9: The Change picker is usable when Glance is stacked

**Files:**
- Modify: `src/main/main.js:6507-6512` (`openGlancePicker`), `:3576` (restore trigger)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Produces: overlay purpose literal `'change-stacked'` beside `'open'` and `'change'` (the contract types `purpose` as `unknown`, so no contract edit). `body[data-glance-purpose="change"]` CSS now applies only side by side.

- [ ] **Step 1: Add the scenario and steps**

```gherkin
  @F34-1 @F34 @D11
  Scenario: The Change picker stays usable when Glance is stacked
    Given three ordinary tabs with one open in Glance
    When I shrink the workspace to a small stacked window
    And I open the Change picker
    Then the Change picker is centred over the page with a visible list
```

```js
When('I shrink the workspace to a small stacked window', async function () {
  await this.call('setWindowContentSize', 700, 520);
  await this.waitForState((candidate) => candidate.glanceGeometry?.direction === 'vertical');
});

When('I open the Change picker', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceChange').click();
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'change picker');
});

Then('the Change picker is centred over the page with a visible list', async function () {
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
  assert.equal(await page.locator('body').getAttribute('data-glance-purpose'), 'change-stacked');
  await page.locator('.glance-picker-option').first().waitFor();
  const layout = await page.locator('#glancePicker').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const list = element.querySelector('#glancePickerList').getBoundingClientRect();
    const row = element.querySelector('.glance-picker-option').getBoundingClientRect();
    return { center: rect.left + rect.width / 2, viewport: window.innerWidth, listHeight: list.height, rowHeight: row.height, top: rect.top };
  });
  assert.ok(Math.abs(layout.center - layout.viewport / 2) <= 2, `picker centre ${layout.center} vs ${layout.viewport / 2}`);
  assert.ok(layout.listHeight >= 52 && layout.rowHeight >= 52, `list ${layout.listHeight}px, row ${layout.rowHeight}px`);
  assert.ok(layout.top >= 50, `picker not below the strip: ${layout.top}px`);
  await page.locator('#glancePickerInput').press('Escape');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'picker dismissed');
  await this.call('setWindowContentSize', 1200, 800);
});
```

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: fails at `data-glance-purpose` (`'change'`) or at the list height (the overlay is ~195 px tall and the list collapses).

- [ ] **Step 2: Choose the placement in main**

Replace `openGlancePicker`:

```js
function openGlancePicker() {
  if (!hasLiveWindow()) return false;
  rt().window.focus();
  const glance = glanceGeometry();
  // Side by side, the Change picker hangs from the header's Change control.
  // Stacked, that header sits low in the window with no room beneath it, so
  // the picker takes the open picker's centred, page-wide placement.
  const purpose = !glance ? 'open' : glance.direction === 'vertical' ? 'change-stacked' : 'change';
  showOverlay('glance', { purpose });
  return true;
}
```

(`overlayBounds` already gives `'change-stacked'` the generic page-wide bounds because it only special-cases `=== 'change'`.) In `hideOverlay`'s restore-trigger expression change `closingPurpose === 'change'` to `(closingPurpose === 'change' || closingPurpose === 'change-stacked')`, so Escape still returns focus to the stacked header's Change control.

Note the `rt().tabOrder.length < 2` guard is gone here on purpose — Task 10 relies on that.

- [ ] **Step 3: Run to verify it passes**

Run: `npm run test:acceptance:desktop -- --tags @glance` — expected pass, including the side-by-side "I choose Change and select the replacement tab" step (`data-glance-purpose === 'change'`, right gap 23–25).

- [ ] **Step 4: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Centre the Glance Change picker when the panes are stacked"`.

---

### Task 10: The single-tab picker explains itself

**Files:**
- Modify: `src/main/main.js:8397-8403` (the `toggle-glance` View item)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `openGlancePicker` without the two-tab guard (Task 9).

- [ ] **Step 1: Add the scenario and steps**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Glance explains itself with a single tab
    Given a single ordinary tab for Glance
    When I summon Glance from its native keyboard shortcut
    Then the picker says to open another tab
```

```js
Given('a single ordinary tab for Glance', async function () {
  this.glanceMainId = await this.call('openTab', this.fixtureUrl('glance-main'));
  const state = await this.state();
  for (const id of state.tabOrder) if (id !== this.glanceMainId) await this.call('closeTab', id);
  await this.waitForState((candidate) =>
    candidate.tabOrder.length === 1 && candidate.activeTabId === this.glanceMainId);
});

Then('the picker says to open another tab', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'glance', 'picker with one tab');
  const page = await overlayPage();
  await page.locator('#glancePicker:not([hidden])').waitFor();
  assert.equal(await page.locator('.glance-picker-option').count(), 0);
  await page.locator('#glancePickerState:not([hidden])').waitFor();
  assert.equal(await page.locator('#glancePickerState').textContent(), 'Open another tab to use Glance');
  await page.locator('#glancePickerInput').press('Escape');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'picker dismissed');
});
```

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: the existing "summon" step's `glanceShortcutEnabled` wait times out (the item is disabled with one tab).

- [ ] **Step 2: Always enable the View item**

In the `toggle-glance` menu item, delete the line `enabled: !!activeGlanceTab() || rt().tabOrder.length > 1,`.

- [ ] **Step 3: Run to verify it passes**

Run: `npm run test:acceptance:desktop -- --tags @glance` — expected pass.

- [ ] **Step 4: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Open the Glance picker with one tab so it can say what to do"`.

---

### Task 11: Reorder announcements leave the hidden picker

**Files:**
- Modify: `src/renderer/overlay.html:148` (`#islandDragLive`)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

- [ ] **Step 1: Add the scenario and step**

```gherkin
  @F34-1 @F34 @F3 @D11
  Scenario: Tab reorder announcements are not trapped in the hidden picker
    Given two ordinary tabs in one workspace for Glance
    When I open the Island panel
    Then the drag live region is rendered while the panel is open
```

```js
When('I open the Island panel', async function () {
  await this.call('openPanel');
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'panel', 'island panel');
});

Then('the drag live region is rendered while the panel is open', async function () {
  const page = await overlayPage();
  const rendered = await page.locator('#islandDragLive').evaluate((element) => {
    let node = element;
    while (node) {
      if (getComputedStyle(node).display === 'none') return false;
      node = node.parentElement;
    }
    return true;
  });
  assert.equal(rendered, true, '#islandDragLive sits inside a display:none ancestor, so reorder announcements are never spoken');
  await this.call('closeOverlay');
});
```

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: fails — `#glancePicker[hidden]` is an ancestor.

- [ ] **Step 2: Move the live region**

In `overlay.html`, cut the line `<div id="islandDragLive" class="sr-only" aria-live="polite" aria-atomic="true"></div>` from inside `<section id="glancePicker" …>` and paste it directly after that section's closing `</section>`, before `<div id="findBar" hidden>`.

- [ ] **Step 3: Run to verify it passes**

Run: `npm run test:acceptance:desktop -- --tags @glance`; also `npm run test:acceptance:desktop -- --tags @F3` (tab drag scenarios) — expected pass.

- [ ] **Step 4: Commit**

`git add`; `git commit -m "Move the tab-reorder live region out of the hidden Glance picker"`.

---

### Task 12: Screen sharing from the reference pane is admitted

**Files:**
- Modify: `src/main/display-capture-admission.js`
- Modify: `src/main/main.js:9922` (`readTrustedFacts`)
- Test: `test/unit/display-capture-admission.test.js`

**Interfaces:**
- Produces: `isVisiblePane(owner, tab) → boolean` exported from `display-capture-admission.js`.

- [ ] **Step 1: Confirm the refusal before changing anything**

Run the app (`npm start`), open two http(s) pages, put one in Glance, focus the reference and in its DevTools console run `navigator.mediaDevices.getDisplayMedia({ video: true })`. Expected today: rejection with the `visible` reason (no picker). If Electron cannot launch in this session (sandbox `Mach rendezvous failed`), write that in the PR and give the owner these exact steps; do not claim the confirmation.

- [ ] **Step 2: Write the failing unit test**

Append to `test/unit/display-capture-admission.test.js` (add `isVisiblePane` to the require):

```js
test('a tab is a visible pane as the main page or the Glance reference, never otherwise', () => {
  const view = {};
  const owner = { activeTabId: 'a', glanceTabId: 'b' };
  assert.equal(isVisiblePane(owner, { id: 'a', view }), true);
  assert.equal(isVisiblePane(owner, { id: 'b', view }), true);
  assert.equal(isVisiblePane(owner, { id: 'c', view }), false);
  assert.equal(isVisiblePane(owner, { id: 'b', view: null }), false, 'a viewless tab is not on screen');
  assert.equal(isVisiblePane(null, { id: 'a', view }), false);
  assert.equal(isVisiblePane(owner, null), false);
});
```

Run: `node --test test/unit/display-capture-admission.test.js` — expected FAIL (`isVisiblePane` is not a function).

- [ ] **Step 3: Implement and use it**

In `display-capture-admission.js`, before `module.exports`:

```js
/** A tab is on screen when it is the window's main page or its Glance
 *  reference and still owns a view. Both panes are user-visible surfaces. */
function isVisiblePane(owner, tab) {
  return !!(tab && owner && tab.view && (owner.activeTabId === tab.id || owner.glanceTabId === tab.id));
}

module.exports = { evaluateAdmission, evaluateDocumentVisible, isVisiblePane };
```

In `main.js`, add `isVisiblePane` to the `require('./display-capture-admission')` destructuring and replace the `tabAttached` line in `readTrustedFacts` with `const tabAttached = isVisiblePane(owner, tab);`.

- [ ] **Step 4: Run to verify**

Run: `node --test test/unit/display-capture-admission.test.js` — expected PASS. Repeat Step 1 (or hand it to the owner): the picker now appears from the reference.

- [ ] **Step 5: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Admit screen sharing from the Glance reference pane"`.

---

### Task 13: Whole-PR checks, captures and the PR

**Files:**
- Read: everything above; `docs/superpowers/specs/2026-10-15-glance-refinement-design.md`

- [ ] **Step 1: Full local gates**

```bash
npm run lint
npm run substrate:check
npm run browser-api:check
npm run test:unit
```

Expected: all pass. Then, when the owner says go: `npm run test:acceptance:desktop` (full), reporting any failure with its output before rerunning anything.

- [ ] **Step 2: Before/after captures**

Using the acceptance harness launch (see `test/desktop/support/` and the `driving-blanc-with-playwright` notes), capture the strip's `webContents.capturePage()` at 700 × 800 in stacked Glance from `main` and from this branch, crop both to the strip band at full resolution, stack before above after with a thin divider, and name the difference (pill centre). Do the same for the side-by-side header with `tint-dark` forced on a non-mac `data-platform` (set `document.documentElement.dataset.platform = 'win32'` in the strip before populating a probe button) to show the control colour. Put both images in the PR body with a numbered "where to look" list.

- [ ] **Step 3: Windows VM check**

In the Windows VM (`blanc-windows-vm-normal-install`), with a private validation build from this branch (`gh workflow run release-windows-linux.yml --ref <branch> -f mode=validation -f platform=windows`): open Glance side by side on a dark page and confirm the minimise/maximise/close glyphs are readable and hover shows a fill; drag the divider by its grip and confirm it stays under the pointer (the open item from #139). Record both results in the PR; if either cannot be run, say so and ask the owner rather than marking it done.

- [ ] **Step 4: Open the PR**

Title: "Glance fixes: audio, lifecycle, layout and the picker (1 of 3)". Body: the spec link, the thirteen fixes as a checklist mapped to the spec's bug list, the captures, the Windows VM record, and the note that `/glance`, Open Link in Glance and the follow-focus commands are PRs 2 and 3. End with the attribution line from the session reminder.
