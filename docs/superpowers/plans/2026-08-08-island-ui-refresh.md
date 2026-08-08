# Island UI Refresh (1.1.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all ten `PORT-CHECKLIST` items from the Blanc Design System into `src/renderer`, so the shipped island matches the design that was locked ahead of code on 2026-08-08.

**Architecture:** Transcription, not interpretation — the DS supplies 83 CSS rules with final values across 31 classes. Declarations are copied verbatim into the app's *existing* class names (no parallel `.bw-*` namespace). Tokens land in `tokens.json` + CSS + regenerated mobile artifacts together. Verification is geometry-by-measurement against the DS's own numbers, with the runnable acceptance suite as the no-regression net.

**Tech Stack:** Vanilla JS + CSS in `src/renderer` (no framework, direct DOM manipulation), Electron main process for the blocker's copy strings, `node:test` unit tests, Cucumber/Playwright acceptance suite, `tokens/build.mjs` substrate codegen.

**Spec:** `docs/superpowers/specs/2026-08-08-island-ui-refresh-design.md`

## Global Constraints

- **Every token edit touches four places in one commit:** `tokens/tokens.json`, the consuming CSS, and the three regenerated files from `npm run tokens:build` (`tokens/generated/Tokens.swift`, `Tokens.kt`, `tokens.css`). Never hand-edit `tokens/generated/*`. `npm run substrate:check` fails otherwise, and `.github/workflows/parity-guards.yml` runs it on every push.
- **`--font-kbd` exact value, byte-for-byte** (token validation compares the literal string): `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **Keep the app's class names.** Port DS *declarations* into `#pillShield`, `.footer-new`, `.island-row`, etc. Do not introduce `.bw-*`.
- **Blanc Blocker rename is user-visible strings only.** `#pillShield`, `shield-model.js`, `calculateShieldBounds`, the `'shield'` overlay mode, and `@F12` step text all stay.
- **`npm run test:acceptance:dry` must stay at 64 scenarios / 425 steps / 0 undefined** — the runnable gate.
- **The full-config dry run is observational, never a gate.** F1-1/F3-2 have zero desktop bindings and the default profile carries known-undefined scenarios by design.
- Two behaviour changes only: group name leaves the pill, ✕ joins its action cluster. Everything else is visual.
- Work in a dedicated worktree off `origin/main`; never the shared checkout.

---

## File Structure

| File | Responsibility |
|---|---|
| `tokens/tokens.json` | the four token edits (source of truth) |
| `tokens/generated/Tokens.swift`, `Tokens.kt`, `tokens.css` | regenerated, never hand-edited |
| `src/renderer/styles.css` | the bulk of the port |
| `src/renderer/pages/pages.css` | `--font-kbd` for `<kbd>` + `#goAnywhere` |
| `src/renderer/index.html` | pill ✕, group-name removal |
| `src/renderer/overlay.html` | chevron, address input |
| `src/renderer/renderer.js` | pill DOM, blocker markup, downloads fill |
| `src/renderer/overlay.js` | rows, footer, glyphs, `.ghead-kbd` split |
| `src/renderer/pages/newtab.js` | (read-only check — `#goAnywhere` emission site) |
| `src/main/shield-model.js` | Blanc Blocker copy strings |
| `test/unit/shield-model.test.js` | the asserted copy |
| `spec/acceptance/island-and-commands.feature`, `tabs-and-groups.feature` | contract amendment |
| `spec/features.md`, `spec/acceptance/index.md` | contract amendment |
| `CLAUDE.md`, `AGENTS.md` | architecture prose |

**Task order:** tokens (1–2) → contract amendment (3) → structural chrome (4–7) → showpieces and glyphs (8–10) → docs + final gates (11). Tokens first because the shadows and radius change how everything else reads.

---

## Task 1: Shadow tokens + panel radius token

**Files:**
- Modify: `tokens/tokens.json:23-24`, `src/renderer/styles.css:41-42`, `src/renderer/styles.css:1083`
- Regenerate: `tokens/generated/Tokens.swift`, `Tokens.kt`, `tokens.css`

**Interfaces:**
- Produces: `--shadow-pill`, `--shadow-popover` (new specular values), `--island-panel-radius: 18px`.

- [ ] **Step 1: Edit `tokens/tokens.json`**

Replace the two shadow entries (currently at `:23-24`) and add the radius token beside `radius`:

```json
    { "name": "shadow-popover", "group": "shadow", "consumers": ["chrome"], "values": { "common": "inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -6px 10px -8px rgba(14,14,14,0.12), inset 0 -1px 0 rgba(14,14,14,0.035), 0 10px 44px -4px rgba(14,14,14,0.12)" } },
    { "name": "shadow-pill",    "group": "shadow", "consumers": ["chrome"], "values": { "common": "inset 0 1px 0 rgba(255,255,255,0.65), inset 1px 0 0.5px -0.5px rgba(255,255,255,0.28), inset -1px 0 0.5px -0.5px rgba(255,255,255,0.28), inset 0 -5px 7px -6px rgba(14,14,14,0.16), inset 0 -1px 0 rgba(14,14,14,0.045), 0 3px 18px -2px rgba(14,14,14,0.10)" } },
```

And add after the `radius` entry:

```json
    { "name": "island-panel-radius", "group": "geometry", "consumers": ["chrome"], "values": { "common": "18px" } },
```

- [ ] **Step 2: Mirror into `styles.css`**

Replace lines 41–42:

```css
  --shadow-popover: inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -6px 10px -8px rgba(14,14,14,0.12), inset 0 -1px 0 rgba(14,14,14,0.035), 0 10px 44px -4px rgba(14,14,14,0.12);
  --shadow-pill: inset 0 1px 0 rgba(255,255,255,0.65), inset 1px 0 0.5px -0.5px rgba(255,255,255,0.28), inset -1px 0 0.5px -0.5px rgba(255,255,255,0.28), inset 0 -5px 7px -6px rgba(14,14,14,0.16), inset 0 -1px 0 rgba(14,14,14,0.045), 0 3px 18px -2px rgba(14,14,14,0.10);
  --island-panel-radius: 18px;
```

Then change `#islandPanel`'s hardcoded radius at `styles.css:1083` from `border-radius: 10px;` to:

```css
  border-radius: var(--island-panel-radius);
```

- [ ] **Step 3: Regenerate and verify the substrate**

```bash
npm run tokens:build
npm run substrate:check
```
Expected: `tokens:check OK` plus the other three OK lines. If `tokens:check` fails, the JSON and CSS disagree — fix, don't skip.

Confirm the generated files actually changed:
```bash
git diff --stat tokens/generated/
```
Expected: all three files listed. If empty, `tokens:build` did not run.

- [ ] **Step 4: Verify no visual regression in geometry**

```bash
npm run test:unit
```
Expected: 394 passing (baseline), 0 failing. Shadows and radius have no unit coverage; this confirms nothing else broke.

- [ ] **Step 5: Commit**

```bash
git add tokens/tokens.json tokens/generated src/renderer/styles.css
git commit -m "feat(island): contrast-rim specular shadows and the panel radius token"
```

---

## Task 2: `--font-kbd` across every shortcut-glyph selector

**Files:**
- Modify: `tokens/tokens.json`, `src/renderer/styles.css`, `src/renderer/pages/pages.css`, `src/renderer/overlay.js:408`
- Regenerate: `tokens/generated/*`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `--font-kbd`; a new `.ghead-kbd` class distinct from `.ghead-n`.

**Why this exists:** JetBrains Mono draws ⌘/⇧/⌥/⎋ malformed. Partial adoption leaves visibly broken glyphs.

- [ ] **Step 1: Add the token**

`tokens/tokens.json`, beside `font-mono` (consumers must include **both**):

```json
    { "name": "font-kbd",       "group": "type", "consumers": ["chrome", "pages"], "values": { "common": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif" } },
```

Add the matching declaration to `:root` in **both** `src/renderer/styles.css` (after line 34) and `src/renderer/pages/pages.css` (after line 32):

```css
  --font-kbd: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

- [ ] **Step 2: Split the shared `.ghead-n` class**

`overlay.js:408` uses `.ghead-n` twice in one row — once for a plain tab count, once for the cluster shortcut. Applying `--font-kbd` to the class would restyle the count. Change the second span only:

```js
    row.innerHTML = `${CARET}<span class="ghead-name"></span><span class="ghead-n"></span><span class="ghead-rule"></span><span class="ghead-kbd">${modKey}${clusterIndex + 1}</span>`;
```

Add to `styles.css` beside the existing `.island-ghead .ghead-n` rule (`:1239`):

```css
.island-ghead .ghead-kbd { font-family: var(--font-kbd); opacity: 0.7; flex: 0 0 auto; }
```

- [ ] **Step 3: Apply to the four chrome selectors**

Add `font-family: var(--font-kbd);` to each of these existing rules in `styles.css`:
- `.footer-kbd` (`:1502`) — footer launcher hints, `⌘T`/`⌘⇧N`
- `.vertical-tabs-new kbd` (`:641`)
- `#islandHint` (`:1528`) — `⌘L summons`, `⌘1–9 jumps`

**Do NOT touch `.row-kbd` (`:1379`)** — despite the name it renders the literal string `'click to unfold'` (`overlay.js:433-434`) and contains no glyph.

- [ ] **Step 4: Apply to both internal-page selectors**

In `pages/pages.css`:
- `.shortcut-row kbd` (`:752`) — add `font-family: var(--font-kbd);`
- **`#goAnywhere`** — new rule. It renders `⌘L to go anywhere` (`newtab.js:14`) and currently inherits JetBrains Mono from `.ledger-footer`'s `font-family: var(--font-mono)` (`:679`). The surrounding footer text must stay mono, so scope it to the element:

```css
#goAnywhere { font-family: var(--font-kbd); }
```

- [ ] **Step 5: Regenerate, verify, commit**

```bash
npm run tokens:build
npm run substrate:check   # expect 4/4 OK
npm run test:unit         # expect 394 passing
git add tokens/tokens.json tokens/generated src/renderer/styles.css src/renderer/pages/pages.css src/renderer/overlay.js
git commit -m "feat(island): --font-kbd for every shortcut glyph, incl. the start page"
```

---

## Task 3: Group-name contract amendment

**Files:**
- Modify: `spec/acceptance/island-and-commands.feature:10-18`, `spec/acceptance/tabs-and-groups.feature:40-46`, `spec/features.md`, `spec/acceptance/index.md`

**Interfaces:**
- Produces: the written contract that Task 4 implements. Do this task FIRST so the code change is never in contradiction with the spec, even transiently.

**This amendment has no automated pass condition.** F1-1/F3-2 have zero desktop step bindings and are outside `RUNNABLE`. Verification is a source audit plus reading the scenarios.

- [ ] **Step 1: Amend `@F1-1`**

In `spec/acceptance/island-and-commands.feature`, delete this line (`:17`):

```gherkin
    And the island shows the group name "work"
```

Retitle the scenario (`:11`) so "group" no longer implies a pill label:

```gherkin
  Scenario: The resting pill reflects the active tab and its blocking state
```

Its other steps — back/forward controls, 3 group dots, the domain, the shield — stay.

- [ ] **Step 2: Rewrite `@F3-2` with discriminating fixtures**

Replace the whole scenario at `spec/acceptance/tabs-and-groups.feature:40-46`. The current `work: 2` / `play: 2` setup cannot prove which group's dots are shown once the name is gone — a count of 2 is consistent with either. Use distinct sizes and assert the count *changes*:

```gherkin
  @F3-2 @F3 @all
  Scenario: The pill's dots render only the active group
    Given a group "work" with 2 tabs
    And a group "play" with 3 tabs
    When the active tab is in "work"
    Then the island shows 2 group dots
    When the active tab is in "play"
    Then the island shows 3 group dots
```

- [ ] **Step 3: Amend the prose contracts**

In `spec/features.md`, F1's resting-pill description lists the group name among the pill's contents — remove it and state that group identity lives in the ⌘L panel and the dots. Find it with:

```bash
rg -n "group name" spec/features.md
```

In `spec/acceptance/index.md`, update the F1-1 and F3-2 row descriptions to match the new scenario titles.

- [ ] **Step 4: Source audit (this replaces a test)**

```bash
rg -n 'shows the group name' spec/acceptance/
```
Expected: **no matches.** Any hit is a scenario still asserting a removed feature.

```bash
rg -n 'shows the group name' test/desktop/steps/
```
Expected: no matches (verified: this step never had a binding). If a definition exists, delete it as orphaned or justify keeping it in the PR.

- [ ] **Step 5: Confirm the runnable gate is undisturbed**

```bash
npm run test:acceptance:dry
```
Expected: **64 scenarios / 425 steps / 0 undefined** — unchanged. F1-1/F3-2 are outside `RUNNABLE`, so this proves the amendment didn't disturb what executes. It does **not** verify the amendment itself.

- [ ] **Step 6: Commit**

```bash
git add spec/
git commit -m "spec: the resting pill no longer carries the group name"
```

---

## Task 4: Pill — group name out, ✕ in, domain in Inter

**Files:**
- Modify: `src/renderer/index.html:33`, `src/renderer/renderer.js`, `src/renderer/styles.css`

**Interfaces:**
- Consumes: the amended contract from Task 3.
- Produces: `#pillClose` in the action cluster.

- [ ] **Step 1: Remove the group name from markup**

Delete `src/renderer/index.html:33`:

```html
        <span id="pillGroupName" hidden></span>
```

- [ ] **Step 2: Remove its render path**

In `renderer.js`, delete the `pillGroupName` lookup (`:17`) and its render line (`:373`, `pillGroupName.hidden = !activeGroup;` plus any adjacent `textContent` assignment). Find every reference first:

```bash
rg -n 'pillGroupName' src/renderer/
```
Expected after the edit: no matches.

- [ ] **Step 3: Add the pill ✕**

In `renderer.js`, where `pillActions` is assembled (near the `downloadsBtn` block at `:95-101`), insert a close button **after the heart, before downloads**, using the same `pillButton` helper the siblings use:

```js
  const closeBtn = pillButton('close', 'Close tab', () => {
    if (state.activeTabId) window.browserAPI.closeTab(state.activeTabId);
  });
  closeBtn.classList.add('pill-close');
  pillActions.append(closeBtn);
```

Hide it when there are no tabs, in the same render pass that toggles `downloadsBtn.hidden`:

```js
    closeBtn.hidden = !state.tabs.length;
```

- [ ] **Step 4: Style it (DS `.bw-pill-close`)**

Add to `styles.css` beside the other pill-button rules:

```css
.pill-close:hover { background: var(--accent) !important; color: var(--surface-raised) !important; }
```

- [ ] **Step 5: Domain in Inter (DS `.bw-pill-domain`)**

`#pillDomain` currently uses the mono face. Change its `font-family` to:

```css
  font-family: var(--font-ui);
```
Leave its `font-size: calc(12.5px / var(--pill-zoom))` counter-scale alone — that lands the domain on the right optical size inside the zoomed pill.

- [ ] **Step 6: Verify**

```bash
node --check src/renderer/renderer.js
npm run test:unit                  # 394 passing
npm run test:acceptance:desktop    # 64/64, 425/425
```
The acceptance suite is the no-regression net: no runnable scenario asserts the group name or a pill ✕, so it must stay green **unchanged**.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/index.html src/renderer/renderer.js src/renderer/styles.css
git commit -m "feat(island): drop the pill's group name, add a close button, domain in Inter"
```

---

## Task 5: Expanded panel — chevron and capsule address input

**Files:**
- Modify: `src/renderer/overlay.html:29`, `src/renderer/styles.css`

- [ ] **Step 1: ✕ → chevron**

In `overlay.html:29`, the dismiss button currently carries a close glyph. Change its title and glyph to the DS's collapse chevron (`chevronDown` from the icon set, `M4.5 5.75 8 9.25l3.5-3.5`):

```html
          <button id="dismissBtn" class="act-btn" title="Collapse island (Esc)" aria-label="Collapse island">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 5.75 8 9.25l3.5-3.5"/></svg>
          </button>
```

- [ ] **Step 2: Address input becomes a capsule**

Per DS: radius 999px, 12px side padding, Inter, and **no focus border change** (autofocus + select-all is the cue). Find the `#addressInput` rule:

```bash
rg -n '#addressInput' src/renderer/styles.css
```

Set `border-radius: 999px;`, `padding: 0 12px;`, `font-family: var(--font-ui);`, and remove any `:focus` rule that changes `border-color` — the border stays `var(--border)`.

- [ ] **Step 3: Verify**

```bash
npm run test:acceptance:desktop
```
Expected: 64/64. The address input is exercised by many scenarios (address routing, Quick Switcher, slash commands), so this is real coverage.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/overlay.html src/renderer/styles.css
git commit -m "feat(island): collapse chevron and a capsule address input"
```

---

## Task 6: Tab rows — drop the domain column, mask at 48px

**Files:**
- Modify: `src/renderer/overlay.js`, `src/renderer/styles.css`

- [ ] **Step 1: Remove the row domain**

Per DS: "no domain column — favicon + address field carry identity". In `overlay.js`'s row builder, remove the domain/sub span from **tab rows only**. Quick-Switcher and slash-command rows keep their subs — those are load-bearing while matching input. Locate it:

```bash
rg -n "row-dom|\.sub\b" src/renderer/overlay.js
```

- [ ] **Step 2: Title mask at 48px (DS `.bw-island-row .title`)**

In `styles.css`, the tab-row title rule takes:

```css
  -webkit-mask: linear-gradient(to right, #000 calc(100% - 48px), transparent);
  mask: linear-gradient(to right, #000 calc(100% - 48px), transparent);
```

- [ ] **Step 3: Active row's ✕ always visible (DS `.x.stay`)**

The row ✕ is hover-revealed (`opacity: 0`). The active row's stays visible. Add:

```css
.island-row.active .row-x { opacity: 1; }
```
Use the app's actual class for the row close button — find it with `rg -n 'row-x|\.x\b' src/renderer/styles.css` and match the existing name.

- [ ] **Step 4: Verify**

```bash
npm run test:acceptance:desktop
```
Expected: 64/64. Several scenarios drive tab rows (`@F2`, `@F3`, `@F5`).

Then confirm the quiet-rows behaviour is intact — the ⌘L row domain being hover-revealed is deliberate (`9262bff`/#44) and must not regress into always-visible:

```bash
rg -n 'tab-row .tag|opacity: 0' src/renderer/styles.css | head -5
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/overlay.js src/renderer/styles.css
git commit -m "feat(island): tab rows drop the domain column and mask long titles"
```

---

## Task 7: Footer — solid accent "new tab", dashed private

**Files:**
- Modify: `src/renderer/styles.css:1475-1491`

- [ ] **Step 1: Port the DS `.bw-footer-new` declarations**

Replace the `.footer-new` rule (`:1475`) body with the DS values, keeping the app's class name:

```css
.footer-new {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--surface-raised);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  flex: 0 0 auto;
  cursor: pointer;
}
.footer-new:hover { opacity: 0.85; }
.footer-new.private { margin-left: 4px; background: none; color: var(--text-dim); border: 1px dashed var(--text-dim); }
.footer-new.private:hover { opacity: 1; color: var(--text); border-color: var(--text); }
.footer-new svg { width: 13px; height: 13px; }
```

Confirm the private launcher actually carries the `private` class:

```bash
rg -n 'footer-new' src/renderer/overlay.js
```

- [ ] **Step 2: Verify**

```bash
npm run test:acceptance:desktop
```
Expected: 64/64.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat(island): footer launchers as a solid accent pill and dashed ghost"
```

---

## Task 8: Blanc Blocker — B monogram and the renamed copy

**Files:**
- Modify: `src/main/shield-model.js`, `test/unit/shield-model.test.js`, `src/renderer/index.html:41-44`, `src/renderer/styles.css`

**Interfaces:**
- Consumes: nothing.
- Produces: the renamed `title` strings that `renderer.js` forwards into tooltip + aria-label.

**Naming rule:** user-visible strings only. `#pillShield`, `shield-model.js`, and the `@F12` step text stay.

- [ ] **Step 1: Write the failing test**

`test/unit/shield-model.test.js` already asserts the exact `title` strings. Update those assertions to the DS copy first, so the test fails before the model changes:

```js
  assert.match(state.title, /^Blanc Blocker — ads & trackers blocked here/);
```
Find the existing assertions with `rg -n 'title' test/unit/shield-model.test.js` and update each to the new copy:
- count state → `Blanc Blocker — ads & trackers blocked here`
- quiet state → `Blanc Blocker — ads & trackers blocked here`
- off state → `Blanc Blocker off for this site`

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit
```
Expected: FAIL in `shield-model.test.js` — the model still returns the old strings.

- [ ] **Step 3: Update the copy in the model**

In `src/main/shield-model.js`, replace the three `title` values (`:77`, `:87`, `:90`) with the DS strings above. The `mode`/`count` fields and all logic stay exactly as they are.

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit
```
Expected: 394 passing, 0 failing.

- [ ] **Step 5: Swap the shield glyph for the B monogram**

In `index.html:41-44`, `#pillShield` currently holds a shield path. Replace the `<svg>` with the monogram from the DS's `assets/blanc-symbol.svg` — note the non-square viewBox (aspect 0.749, so a 12px-tall glyph is 8.99px wide):

```html
        <button id="pillShield" class="shield" aria-expanded="false" hidden>
          <svg viewBox="0 0 149.21 199.16" width="8.99" height="12" aria-hidden="true"><path fill="currentColor" d="M132.49,99.93c24.35,25.21,21.69,65.88-5.32,88.01-8.6,6.52-18.14,11.22-29.43,11.22H0S.05,0,.05,0l97.73.34c20.2.07,36.1,15.44,41.57,33.81,5.91,21.3-.72,42.38-18.13,56.78,3.89,3.02,7.96,5.58,11.27,9.01ZM123.05,76.28c11.02-13.76,12.6-31.98,4.74-47.57-6.27-10.66-16.79-19.78-29.98-19.81l-89.13-.21.04,134.11c17.74-38.18,51.53-61.94,94.24-58.73,7.99.6,14.76-1.14,20.08-7.79ZM9.18,186.44l95.77-92.67c-20.99-3.85-41.54,1.86-58.47,14.63-24.42,18.43-37.97,47.69-37.31,78.04ZM116.56,184.68c15.98-9.69,24.44-26.82,23.9-45.09s-10.27-34.19-26.36-42.19L17.5,190.42l81.36-.05c6.08,0,12.28-2.41,17.7-5.69Z"/></svg>
          <span id="pillShieldCount"></span>
        </button>
```

- [ ] **Step 6: Port the DS blocker CSS**

Replace the `#pillShield` rules in `styles.css` with the DS's `.bw-shield` declarations, under the app's names:

```css
#pillShield {
  appearance: none;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text);
  flex: 0 0 auto;
  cursor: pointer;
}
#pillShield:hover { background: var(--border); }
#pillShieldCount {
  position: absolute;
  top: -1px;
  right: -4px;
  min-width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--surface-raised);
  font-family: var(--font-mono);
  font-size: 7.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2.5px;
}
#pillShield.shield-quiet { color: var(--text-dim); }
#pillShield.shield-off { color: var(--text-dim); opacity: 0.45; }
```
The existing `shield-quiet`/`shield-off` class toggles in `renderer.js:411-412` are unchanged — only their declarations move.

- [ ] **Step 7: Verify**

```bash
npm run test:acceptance:desktop
```
Expected: 64/64. `@F12-3` through `@F12-9` drive the chip and popover directly, including the `title` string — check whether any step asserts the old copy:

```bash
rg -n 'click for site controls|Blanc blocked' test/desktop/steps/
```
If a step asserts the old text, update it — that is a user-visible-copy assertion, in scope for this rename.

- [ ] **Step 8: Commit**

```bash
git add src/main/shield-model.js test/unit/shield-model.test.js src/renderer/index.html src/renderer/styles.css
git commit -m "feat(island): Blanc Blocker — B monogram, badge count, renamed copy"
```

---

## Task 9: Downloads cistern liquid fill

**Files:**
- Modify: `src/renderer/renderer.js:95-106`, `src/renderer/styles.css`

**Interfaces:**
- Consumes: the existing `downloadsBtn` and its `active` class toggle.
- Produces: `--dl-progress` (0..1) set on the button.

This is the single largest item. All values come from the DS verbatim.

- [ ] **Step 1: Build the vessel markup**

In `renderer.js`, after `downloadsBtn` is created (`:95-101`), append the cistern layers. `WAVE_D` is the DS's 6-period sine (midline y=10, amplitude 10 viewBox units):

Build it with DOM methods, not `innerHTML`/`insertAdjacentHTML`. The content here is
static, so there is no injection today — but this is the **privileged chrome renderer**
(it holds `browserAPI`), and an HTML sink in that document is worth not introducing for
the sake of three lines. Note `document.createElementNS` for the SVG nodes: `createElement`
produces HTML elements that will not render as SVG.

```js
  const WAVE_D = 'M0 10 Q 10 0 20 10 T 40 10 T 60 10 T 80 10 T 100 10 T 120 10 T 140 10 T 160 10 T 180 10 T 200 10 T 220 10 T 240 10 V 21 H 0 Z';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const span = (cls) => {
    const el = document.createElement('span');
    el.className = cls;
    return el;
  };
  const wave = (cls) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', `dl-wave ${cls}`);
    svg.setAttribute('viewBox', '0 0 240 20');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', WAVE_D);
    svg.append(path);
    return svg;
  };

  const fluid = span('dl-fluid');
  fluid.append(wave('w1'), wave('w2'));
  const vessel = span('dl-vessel');
  vessel.append(fluid);
  const under = span('dl-under');
  under.append(pillGlyph('download', 9.5)); // the helper renderer.js already uses for pill icons
  downloadsBtn.append(span('dl-glass'), vessel, under);
```

Check the actual glyph helper's name and signature before writing this — `renderer.js`
builds pill icons somewhere, and the submerged copy must use the same construction:

```bash
rg -n 'function pillButton|ICONS\.' src/renderer/renderer.js | head -5
```
If no reusable helper exists, build the `<svg>`/`<path>` for the download glyph with
`createElementNS` the same way `wave()` does above.

- [ ] **Step 2: Drive the level**

Where `downloadsBtn.classList.toggle('active', active > 0)` runs (`:106`), also set the custom property from aggregate progress (0..1):

```js
    downloadsBtn.style.setProperty('--dl-progress', String(progress));
```
Derive `progress` from the same `chrome:downloads` payload that yields `active`/`hasRecent`. Inspect its shape first:

```bash
rg -n 'downloadsActivity' src/main/downloads.js
```
If the payload carries per-item received/total bytes, use `receivedBytes / totalBytes` summed across active items; if it already exposes a fraction, use it directly. Clamp to `[0, 1]`.

- [ ] **Step 3: Port the DS cistern CSS verbatim**

```css
.pill-download { position: relative; }
.pill-download.active { color: var(--accent); }
.dl-glass { position: absolute; inset: 4.5px; border-radius: 50%; border: 1px solid var(--border); pointer-events: none; }
.dl-vessel { position: absolute; inset: 4.5px; border-radius: 50%; overflow: hidden; pointer-events: none; }
.dl-fluid { position: absolute; left: 0; right: 0; bottom: 0; height: calc(var(--dl-progress, 0) * 100%); background: var(--accent); transition: height 300ms cubic-bezier(0.4, 0, 0.2, 1); }
.dl-wave { position: absolute; left: -100%; width: 300%; height: 2.4px; bottom: calc(100% - 1.2px); fill: var(--accent); animation: dl-drift 2.4s linear infinite; }
.dl-wave.w2 { left: -88%; opacity: 0.5; animation-duration: 3.9s; animation-direction: reverse; }
.pill-download.active > svg, .dl-under svg { width: 9.5px; height: 9.5px; }
.dl-under { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--surface-raised); clip-path: inset(calc(100% - var(--dl-progress, 0) * 100% + 1.2px) 0 0 0); transition: clip-path 300ms cubic-bezier(0.4, 0, 0.2, 1); pointer-events: none; }
@keyframes dl-drift { to { transform: translateX(-16.6667%); } }
@media (prefers-reduced-motion: reduce) { .dl-wave { animation: none; } }
```

- [ ] **Step 4: Measure the rendered geometry**

Write a throwaway measurement script (the pattern used for the shield popover — launch with `BLANC_TEST=1`, drive the real chrome, read computed styles). Assert against the DS numbers:

```js
// vessel inset 4.5px on a 22px button → 13px vessel
// fluid height at --dl-progress: 0.5 → ~6.5px
// active glyph 9.5px
```
Set `--dl-progress` directly via `executeJavaScript` rather than driving a real download — the CSS is what's under test.

- [ ] **Step 5: Verify**

```bash
npm run test:acceptance:desktop
```
Expected: 64/64. `@F9` covers downloads.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/renderer.js src/renderer/styles.css
git commit -m "feat(island): downloads cistern — liquid fill with drifting wave surface"
```

---

## Task 10: Icons — redrawn `mute`, new `bookmark`

**Files:**
- Modify: `src/renderer/overlay.js:113-115`

- [ ] **Step 1: Replace the `mute` glyph**

The app's current cut (`:114`) is superseded by the DS's 2026-08-08 redraw. Replace:

```js
    mute: '<svg viewBox="0 0 16 16"><path d="M2.75 6.25h2.5L9 3.25v9.5l-3.75-3H2.75z" stroke-linejoin="round"/><path d="M11.25 6.5l3 3M14.25 6.5l-3 3"/></svg>',
```

- [ ] **Step 2: Add the `bookmark` glyph**

The DS has it; the app has none. Add beside `mute`:

```js
    bookmark: '<svg viewBox="0 0 16 16"><path d="M4.25 2.75h7.5v10.5L8 10.5l-3.75 2.75z"/></svg>',
```

- [ ] **Step 3: Point the footer's favorites action at it**

Per DS item 9, the heart appears **exactly once** — the header favorite toggle. The footer's favorites quick-action uses the bookmark glyph. Find it:

```bash
rg -n "footerFavorites" src/renderer/overlay.js
```
Swap its inline SVG for `ICONS.bookmark`. Leave `heartBtn` alone.

- [ ] **Step 4: Verify**

```bash
npm run test:acceptance:desktop
```
Expected: 64/64. `@F16` drives the footer's page-opening actions.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/overlay.js
git commit -m "feat(island): redrawn mute glyph and a distinct bookmark for the footer"
```

---

## Task 11: Docs, dark mode, and the full gate run

**Files:**
- Modify: `CLAUDE.md`, `AGENTS.md`

- [ ] **Step 1: Correct the pill description in both instruction documents**

Both say the pill "shows the active group's name before the domain". Find and correct in each:

```bash
rg -n "active group's name" CLAUDE.md AGENTS.md
```
Replace with wording that names the pill's actual contents — favicon, domain, chips, blocker, action cluster including the new close button — and states that group identity lives in the ⌘L panel and the dots.

- [ ] **Step 2: The dark-mode pass**

Playwright pins `colorScheme: light`, so this needs a per-page override. Launch, open the panel, then:

```js
await page.emulateMedia({ colorScheme: 'dark' });
```
Check two things a correct number cannot prove:
1. **The specular rim reads** on the pill and panel — the inset white highlights must be visible against `--surface-raised: #1f1f1f`, not washed out or invisible.
2. **The cistern's submerged glyph** inverts legibly — `.dl-under` is `var(--surface-raised)` over an `--accent` fluid, which in dark mode is near-white fluid under a dark glyph.

Capture a screenshot of each for the PR.

- [ ] **Step 3: Full gate run**

```bash
npm run test:unit                # 394 passing
npm run substrate:check          # 4/4 OK — proves tokens.json, CSS and generated/ agree
npm run test:acceptance:dry      # 64 scenarios / 425 steps / 0 undefined
npm run test:acceptance:desktop  # 64/64 — run TWICE, both clean, no 'F' marks
```

- [ ] **Step 4: Commit and open the PR**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "docs: the resting pill no longer carries the group name"
```

PR body must state: the ten checklist items ported; the two behaviour changes (group name out, ✕ in) as the only user-facing behavioural deltas; that the group-name contract amendment has no automated gate and was verified by source audit; the token/generated-artifact lockstep; and the dark-mode screenshots.

---

## Self-Review

**Spec coverage.** Items 1–2 (shadows) → Task 1. Item 2 (panel radius) → Task 1. Item 3 (`--font-kbd`) → Task 2, including the `.ghead-n` split, the `.row-kbd` exclusion, and `#goAnywhere`. Item 4 (cistern) → Task 9. Item 5 (Blanc Blocker) → Task 8. Item 6 (pill ✕, group name, Inter domain) → Task 4, with its contract amendment in Task 3. Item 7 (chevron, address capsule) → Task 5. Item 8 (rows) → Task 6. Item 9 (footer) → Task 7. Item 10 (glyphs) → Task 10. Docs + dark mode + gates → Task 11. Token/generated lockstep → Global Constraints and every token task's regenerate step.

**Placeholder scan.** None. Every code step carries real code or an exact command. Three steps deliberately begin with an `rg` to locate a selector whose line number would be stale after earlier tasks shift the file — those cite the search, not a guess.

**Type consistency.** `--dl-progress` is named identically in Tasks 9's JS and CSS. `.ghead-kbd` is introduced in Task 2 and used nowhere else. `#pillShieldCount` and the `shield-quiet`/`shield-off` classes in Task 8 match the existing `renderer.js:411-412` toggles. `ICONS.bookmark` and `ICONS.download` in Tasks 9–10 match the `ICONS` object at `overlay.js:109`.

**Risk note for the executor.** Task 9 is the only task where the DS's markup structure differs materially from the app's — the DS builds the vessel inside a React button; the app builds it imperatively with `createElement`/`createElementNS`. The CSS transfers unchanged; the DOM assembly does not. If the fill renders but the glyph never inverts, the cause is almost certainly `.dl-under` sitting outside the button's stacking context rather than a wrong clip value. If the waves do not render at all, check that the SVG nodes were created with `createElementNS` — `createElement('svg')` yields an HTML element that silently does not paint.

**One pre-existing `innerHTML` is left alone deliberately.** `overlay.js:408` (the group-header row, edited in Task 2 only to rename a span's class) interpolates `modKey` (a module constant) and `clusterIndex + 1` (an integer) — no external data, no injection path. Converting that row builder to DOM methods is unrelated refactoring and is out of scope; the minimal class-name edit keeps the diff reviewable.
