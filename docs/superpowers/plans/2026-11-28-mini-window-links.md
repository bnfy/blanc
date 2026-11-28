# Mini Window: links from other apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With a new device-local setting on, a web link from another app that no link rule claims opens in a mini window. It joins the open mini window of that profile, or opens a new one with the link as its only tab.

**Architecture:**
- The handoff's fallback (`getRuntime` with no destination) in `main.js` returns a mini runtime when the setting is on.
- A pure chooser in `src/main/mini-window.js` picks the mini window a link should join.
- A brand-new mini runtime opens its window without a start tab.

**Tech Stack:** Electron main; `node:test`; Cucumber with Playwright.

**Spec:** `docs/superpowers/specs/2026-11-28-mini-window-links-design.md`

## Global Constraints

- **The setting:**
  - It is `miniWindowForLinks`: a boolean, default `false`, device-local (never in `SYNCED_KEYS`), and written through `settings.setSettings`'s whitelist.
  - In `settings-schema/schema.json` it is listed in `internalDefaults`.
- **Copy, in all six languages:**
  - `settings.general.miniWindowLinks.label`: `Open links from other apps in a mini window`
  - `settings.general.miniWindowLinks.hint`: `Links that match a rule still go where the rule says.`
- **Order stays:** tab handoff first, then link rules (F60), then this fallback. Local HTML files and in-app links are untouched.
- **No empty mini windows:** a mini runtime is created only at the handoff's routed step (`getRuntime` called with a `placement` object), never at `enqueue` (called with no arguments). A link a rule claims must never leave one behind.
- **Profile:** the link's profile is `miniWindowProfileId()`.

## Review Focus

1. **A link that a rule claims while the setting is on.** It goes to the rule's place, and no mini window is created. (F61-13, plus a source test for "only with placement".)
2. **Several links at once** (a Windows or Linux launch with two URLs). Both land in one new mini window, with no blank tab. (Task 2 unit test on the chooser; F61-12 sends two links.)
3. **The setting off.** F61-3 is unchanged: an ordinary window gets the link.
4. **A background open** (`placement.background`). The new mini window opens without focus, as the handoff does for any window. (Source test that `inactive: background` is passed.)
5. **A mini window of another profile is open** while the link's profile has none. A new mini window opens in the link's profile. (Task 2 unit test.)

---

### Task 1: The setting

**Files:**
- Modify: `src/main/settings.js` (`DEFAULTS`, normalize, `setSettings` whitelist); `settings-schema/schema.json`; `src/renderer/pages/settings.html` (a toggle row after the mini window shortcut's row); `src/renderer/pages/settings.js` (wired like `reuseNewTab`); `copy/messages/*.json` and generated strings.
- Test: `test/unit/mini-window.test.js`.

**Interfaces:** Produces `settings.getSettings().miniWindowForLinks: boolean`.

- [ ] **Step 1: Write the failing test** `test('links from other apps can open in a mini window, off by default and device-local (#1734 part 3)')`. Using the module the way `test/unit/settings*.test.js` does, assert:
  - `DEFAULTS.miniWindowForLinks === false`;
  - `setSettings({ miniWindowForLinks: true }).miniWindowForLinks === true`;
  - a non-boolean is ignored;
  - the key isn't in `SYNCED_KEYS`;
  - `settings.html` has `id="miniWindowForLinks"`, with the label's `data-i18n` key.
- [ ] **Step 2: Run** `node --test test/unit/mini-window.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the copy, then run `copy:ack` and `copy:build`.
- [ ] **Step 4: Run** the test file, then `npm run -s substrate:check` and `npm run -s copy:check`. Expected: PASS.
- [ ] **Step 5: Commit** `Mini window links: the setting (#1734)`.

### Task 2: Links land in a mini window

**Files:**
- Modify: `src/main/mini-window.js`; `src/main/main.js` (the `createExternalUrlHandoff` options at about line 1646, and a new `miniLinkRuntime` beside `openMiniWindow`).
- Test: `test/unit/mini-window.test.js`.

**Interfaces:**
- Consumes: `settings.getSettings().miniWindowForLinks` (Task 1).
- Produces:
  - `miniWindow.miniWindowForLink(runtimes, profileId, focusOrder) => runtime | null`. It returns the mini runtime with the highest `focusOrder(r)` among those that are mini, not closing, have a live (not destroyed) window, and belong to `profileId`.
  - `miniLinkRuntime({ create }) => runtime | null` in `main.js`. It returns the chosen mini window. When there is none and `create` is true, it makes a new runtime with `mini = true` and `miniForLink = true` and no window yet. When there is none and `create` is false, it returns `null`.

- [ ] **Step 1: Write the failing tests.**
  - `miniWindowForLink` returns:
    - the most recently focused mini window of the profile, from three runtimes: an ordinary one, a mini one of another profile, and two mini ones of the profile with serials 2 and 5. The answer is serial 5.
    - `null` when the only mini window is closing, or its window is destroyed.
  - Source-shape tests on `main.js`:
    - `getRuntime` without a destination calls `externalFallbackRuntime(preferred, placement)`;
    - it returns `miniLinkRuntime({ create: !!placement })` when `settings.getSettings().miniWindowForLinks` is true, falling back to `resolveExternalRuntime(preferred)` when that is `null`;
    - otherwise it calls `resolveExternalRuntime(preferred)`;
    - `ensureWindow` passes `ensureStartTab: !fresh` and `inactive: background`, where `fresh` is read from `runtime.miniForLink` and then cleared.
- [ ] **Step 2: Run** `node --test test/unit/mini-window.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** The new runtime's window gets the mini window's placement from `createMainWindow`, which already reads `runtime.mini`.
- [ ] **Step 4: Run** the test file and `npm run -s test:unit`. Expected: PASS.
- [ ] **Step 5: Commit** `Mini window links: links from other apps land in a mini window (#1734)`.

### Task 3: Acceptance and docs

**Files:** `spec/acceptance/mini-window.feature`, `test/desktop/steps/mini-window.steps.js`, `test/desktop/cucumber.mjs` (`@F61-12`, `@F61-13`), `spec/features.md`, `spec/acceptance/index.md`, `spec/parity-matrix.md`, `CLAUDE.md` (the Mini Window paragraph), `docs/press/release-notes/unreleased.md`, and the spec's Status line.

- [ ] **Step 1: Add the scenarios.** Links arrive by the same `app.emit('open-url', …)` that F61-3 uses.
  - **F61-12:** with the setting on, when another app opens fixture page A, then a mini window shows A as its only tab. When another app then opens fixture page B, then the same mini window holds A and B, and no other mini window exists.
  - **F61-13:** with the setting on and a link rule sending the fixture's host to the Space "Reading", when another app opens a fixture page, then it lands where the rule says, and no mini window exists.
- [ ] **Step 2: Run** `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F61 or @F60"`. Expected: all pass, including F61-3 unchanged. Positive control: with the fallback branch removed, F61-12 fails.
- [ ] **Step 3: Update the docs.** In the unreleased notes, Added gets "Open links from other apps in a mini window" and "Still open" gets the hand check.
- [ ] **Step 4: Run** `npm run -s lint`, `npm run -s test:unit` and `npm run -s substrate:check`. Expected: all pass.
- [ ] **Step 5: Commit** `Mini window links: acceptance and docs (#1734)`.

## After Part A

The fork port goes on `chromium/next`: the fork's native external-link path (`externalLink` in `blanc_prototype_ui.cc` and `RouteWindow`), with a native check on the Mac Studio. Its plan is written once shipping merges.
