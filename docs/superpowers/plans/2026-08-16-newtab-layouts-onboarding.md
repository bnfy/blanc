# New Tab Layouts + First-Run Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four user-selectable `blanc://newtab` layouts (ledger/billboard/shelf/tally) and the 6-step first-run onboarding dialog, transcribed verbatim from the DS handoff prototype.

**Architecture:** All UI lands in the existing vanilla-JS internal-pages environment (`src/renderer/pages/`, flat files, token CSS). Layout choice is a synced setting (`newtabLayout`); per-day blocked counts extend the existing weekly stats store via a new pure policy module; onboarding replaces the shipped privacy card, reusing the `onboardingVersion` first-run marker and the existing import/default-browser/settings machinery through narrow, sender-validated `pages:*` IPC.

**Tech Stack:** Electron main (CommonJS), vanilla JS renderer pages, `node --test` unit tests, Cucumber acceptance specs, settings-schema substrate.

## Global Constraints

- **Verbatim rule (spec):** pixel values, markup structure, copy, and SVG paths come from `docs/superpowers/specs/references/2026-08-16-newtab-onboarding/NewtabOnboarding.dc.html` exactly. Permitted differences: the spec's four approved deviations, and mechanical adaptation (React template → vanilla; `style-hover` → CSS `:hover`; stub data → real feeds). When transcribing a block, copy each inline `style="…"` value into the named class **unchanged** — do not round, rename, or "fix" values.
- Spec: `docs/superpowers/specs/2026-08-16-newtab-layouts-onboarding-design.md`. Read it before any task.
- Internal pages are flat-served: every new file must sit directly in `src/renderer/pages/`.
- No new remote origins anywhere (CSP per file; the prototype's Google favicon URLs are stubs — never ship them).
- Substrate lockstep: any change to `src/main/settings.js` enums/defaults requires the matching `settings-schema/schema.json` edit + `npm run settings:build` in the same commit; `npm run substrate:check` must pass.
- Chrome-document changes need an app relaunch to see; `blanc://` pages reload with the tab (Cmd+R). After renderer changes, kill and restart the dev instance (`npm start`) and leave it open.
- User-visible strings for slept tabs say "quiet"; user-visible feature name is "Favorites" while internals stay `bookmarks` — never rename internals.
- Every task: run `npm run test:unit` before its commit; commit messages in the repo's plain imperative style, ending with the Claude co-author trailer.

---

### Task 1: Per-day blocked counts (pure policy module)

**Files:**
- Create: `src/main/adblock-stats.js`
- Modify: `src/main/main.js:2135-2151` (store default + rollover), `src/main/main.js:5415` (increment)
- Test: `test/unit/adblock-stats.test.js`

**Interfaces:**
- Produces: `currentWeekStart(now?: Date): number`, `dayIndex(now?: Date): number` (0=Monday … 6=Sunday), `normalizeWeekStats(data): {weekStart, blocked, days}` (repairs legacy `{weekStart, blocked}` shapes by seeding `days: [0×7]`), `rollWeekStats(data, now?): void` (mutates: resets `blocked` and `days` when the week changed), `recordBlocked(data, now?): void` (mutates: `blocked += 1`, `days[dayIndex(now)] += 1`), `barHeights(days: number[]): number[]` (percent heights, all zero when every day is zero — the tally chart's rule, unit-tested here rather than inline in the renderer).
- Consumed by: Task 3's `blockedByDay()` hook, main.js's existing `adblockWeekStats()` / increment site, and Task 5's `renderTally()`.
- Note: renderer pages are flat-served and cannot `require()` main-process modules, so the rule is **not** duplicated in `newtab.js`. Main computes it here and ships the result: `pages:start:data` returns `blockedBarHeights` (percent numbers) alongside raw `blockedByDay` (still needed for the busiest-day caption). One implementation, one test.

- [ ] **Step 1: Write the failing test**

`test/unit/adblock-stats.test.js` (follow the file-header style of `test/unit/` neighbors; `node:test` + `assert`):

```js
const test = require('node:test');
const assert = require('node:assert');
const {
  currentWeekStart, dayIndex, normalizeWeekStats, rollWeekStats, recordBlocked,
} = require('../../src/main/adblock-stats');

// Wed 2026-08-12 15:00 local — week starts Mon 2026-08-10 00:00 local.
const WED = new Date(2026, 7, 12, 15, 0, 0);
const MON = new Date(2026, 7, 10, 0, 0, 0);

test('currentWeekStart is the preceding Monday 00:00 local', () => {
  assert.strictEqual(currentWeekStart(WED), MON.getTime());
  assert.strictEqual(currentWeekStart(MON), MON.getTime());
});

test('dayIndex is Monday-based', () => {
  assert.strictEqual(dayIndex(MON), 0);
  assert.strictEqual(dayIndex(WED), 2);
  assert.strictEqual(dayIndex(new Date(2026, 7, 16)), 6); // Sunday
});

test('normalizeWeekStats seeds legacy shapes with zeroed days', () => {
  const legacy = { weekStart: MON.getTime(), blocked: 41 };
  const fixed = normalizeWeekStats(legacy);
  assert.deepStrictEqual(fixed.days, [0, 0, 0, 0, 0, 0, 0]);
  assert.strictEqual(fixed.blocked, 41);
  // Garbage days arrays are also replaced.
  assert.deepStrictEqual(normalizeWeekStats({ weekStart: 0, blocked: 0, days: [1, 2] }).days,
    [0, 0, 0, 0, 0, 0, 0]);
});

test('rollWeekStats resets blocked and days on a new week, not within one', () => {
  const data = { weekStart: currentWeekStart(MON), blocked: 9, days: [9, 0, 0, 0, 0, 0, 0] };
  rollWeekStats(data, WED);
  assert.strictEqual(data.blocked, 9); // same week — untouched
  const nextMonday = new Date(2026, 7, 17, 8, 0, 0);
  rollWeekStats(data, nextMonday);
  assert.strictEqual(data.weekStart, currentWeekStart(nextMonday));
  assert.strictEqual(data.blocked, 0);
  assert.deepStrictEqual(data.days, [0, 0, 0, 0, 0, 0, 0]);
});

test('recordBlocked bumps the weekly total and today\'s bucket together', () => {
  const data = { weekStart: currentWeekStart(WED), blocked: 0, days: [0, 0, 0, 0, 0, 0, 0] };
  recordBlocked(data, WED);
  recordBlocked(data, WED);
  assert.strictEqual(data.blocked, 2);
  assert.deepStrictEqual(data.days, [0, 0, 2, 0, 0, 0, 0]);
});

test('barHeights normalizes to the busiest day', () => {
  assert.deepStrictEqual(barHeights([0, 5, 10, 0, 0, 0, 0]), [0, 50, 100, 0, 0, 0, 0]);
});

test('barHeights is all zero for a week with nothing blocked', () => {
  // Spec's zero-week rule: the chart tells the truth rather than drawing a
  // full bar for today. (The DS prototype's 100% today-bar is stub data.)
  assert.deepStrictEqual(barHeights([0, 0, 0, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0, 0]);
});
```

Add `barHeights` to the test's `require(...)` destructuring at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/adblock-stats.test.js`
Expected: FAIL — `Cannot find module '../../src/main/adblock-stats'`.

- [ ] **Step 3: Implement `src/main/adblock-stats.js`**

Pure module, no `require('electron')` (same rule as `tab-sleep.js`):

```js
// Rolling ads-blocked stats policy for the start page. Weeks start Monday
// 00:00 local; per-day buckets are Monday-indexed. Pure and unit-tested —
// main.js owns the JsonStore, this module owns the arithmetic.

const WEEK_DAYS = 7;

function currentWeekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function dayIndex(now = new Date()) {
  return (now.getDay() + 6) % 7;
}

const zeroDays = () => new Array(WEEK_DAYS).fill(0);

/** Repair pre-days shapes (and malformed arrays) in place-safe copy-free form. */
function normalizeWeekStats(data) {
  const daysOk = Array.isArray(data.days)
    && data.days.length === WEEK_DAYS
    && data.days.every((n) => Number.isInteger(n) && n >= 0);
  if (!daysOk) data.days = zeroDays();
  if (!Number.isInteger(data.blocked) || data.blocked < 0) data.blocked = 0;
  return data;
}

function rollWeekStats(data, now = new Date()) {
  const week = currentWeekStart(now);
  if (data.weekStart !== week) {
    data.weekStart = week;
    data.blocked = 0;
    data.days = zeroDays();
  }
}

function recordBlocked(data, now = new Date()) {
  data.blocked += 1;
  data.days[dayIndex(now)] += 1;
}

/**
 * Tally chart bar heights, in percent, normalized to the busiest day. A week
 * with nothing blocked draws no bars at all — including today's. The chart
 * reports what happened; a full bar for a zero day would not.
 */
function barHeights(days) {
  const max = Math.max(...days, 0);
  if (!max) return days.map(() => 0);
  return days.map((n) => Math.round((n / max) * 100));
}

module.exports = {
  currentWeekStart, dayIndex, normalizeWeekStats, rollWeekStats, recordBlocked, barHeights,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/adblock-stats.test.js` — Expected: PASS (5 tests).

- [ ] **Step 5: Wire main.js to the module**

At `src/main/main.js:2135-2151`, replace the inline store default, `currentWeekStart`, and `adblockWeekStats` with:

```js
const adblockStatsPolicy = require('./adblock-stats');
let adblockStatsStore = null;
const ensureAdblockStats = () => {
  if (!adblockStatsStore) {
    adblockStatsStore = new JsonStore('adblock-stats',
      { weekStart: 0, blocked: 0, days: [0, 0, 0, 0, 0, 0, 0] });
    adblockStatsPolicy.normalizeWeekStats(adblockStatsStore.data); // legacy {weekStart, blocked}
  }
  return adblockStatsStore;
};

function adblockWeekStats() {
  const s = ensureAdblockStats();
  if (s.data.weekStart !== adblockStatsPolicy.currentWeekStart()) {
    s.update((d) => adblockStatsPolicy.rollWeekStats(d));
  }
  return s;
}
```

(Keep the existing explanatory comment above the store.) At `main.js:5415` replace `adblockWeekStats().update((d) => { d.blocked += 1; });` with `adblockWeekStats().update((d) => adblockStatsPolicy.recordBlocked(d));`. Delete the now-unused local `currentWeekStart` in main.js.

- [ ] **Step 6: Full unit suite + commit**

Run: `npm run test:unit` — Expected: PASS (grep the output for any test that enumerates adblock-stats keys; none is known, but a failure here means a policy guard needs the same-commit update per repo rule).

```bash
git add src/main/adblock-stats.js src/main/main.js test/unit/adblock-stats.test.js
git commit -m "Track per-day blocked counts for the start page"
```

---

### Task 2: `newtabLayout` setting + schema substrate

**Files:**
- Modify: `src/main/settings.js` (enum near line 20, DEFAULTS, sanitize-on-read near line 170, validate-on-write near line 205, `SYNCED_KEYS` line 34, module.exports), `settings-schema/schema.json`
- Generated: `settings-schema/generated/*` via `npm run settings:build`
- Test: `test/unit/settings-newtab-layout.test.js`

**Interfaces:**
- Produces: `NEWTAB_LAYOUTS = ['ledger', 'billboard', 'shelf', 'tally']` (exported from settings.js), `getSettings().newtabLayout`, `setSettings({ newtabLayout })` validation, and `newtabLayout` membership in `SYNCED_KEYS`.

- [ ] **Step 1: Write the failing test**

`test/unit/settings-newtab-layout.test.js` — mirror the loading technique of the nearest existing settings unit test (check `test/unit/` for one that requires settings.js with an electron stub; follow it exactly). Assertions:

```js
// (inside the harness the neighboring settings test uses)
assert.deepStrictEqual(settings.NEWTAB_LAYOUTS, ['ledger', 'billboard', 'shelf', 'tally']);
assert.strictEqual(settings.getSettings().newtabLayout, 'ledger');           // default
settings.setSettings({ newtabLayout: 'billboard' });
assert.strictEqual(settings.getSettings().newtabLayout, 'billboard');        // valid write
settings.setSettings({ newtabLayout: 'marquee' });
assert.strictEqual(settings.getSettings().newtabLayout, 'billboard');        // invalid ignored
assert.ok(settings.SYNCED_KEYS.includes('newtabLayout'));                    // synced
```

If `SYNCED_KEYS` is not currently exported, export it (checking first that no existing test asserts the export list's exact shape — if one does, update it in this same commit).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/settings-newtab-layout.test.js` — Expected: FAIL (`NEWTAB_LAYOUTS` undefined).

- [ ] **Step 3: Implement in settings.js**

Next to `THEMES` (line ~20): `const NEWTAB_LAYOUTS = ['ledger', 'billboard', 'shelf', 'tally'];` with a one-line comment naming the DS handoff. In `DEFAULTS`: `newtabLayout: 'ledger',` (put it beside `theme`). Sanitize-on-read (the block around line 170): `if (!NEWTAB_LAYOUTS.includes(data.newtabLayout)) data.newtabLayout = DEFAULTS.newtabLayout;`. Validate-on-write (beside the `THEMES` check at line ~205): `if (NEWTAB_LAYOUTS.includes(partial.newtabLayout)) clean.newtabLayout = partial.newtabLayout;`. Extend `SYNCED_KEYS` to `['searchEngine', 'adblockEnabled', 'homePage', 'theme', 'adblockExceptions', 'newtabLayout']` and update its comment. Export `NEWTAB_LAYOUTS` (and `SYNCED_KEYS` if not already).

- [ ] **Step 4: Update the schema substrate — JSON *and* `build.mjs`**

JSON alone is inert: `build.mjs` hardcodes every enum it generates and compares, so adding a key to `schema.json` without touching the script means `settings:check` passes while guarding nothing. Edit both.

`settings-schema/schema.json`: add `"newtabLayouts": ["ledger", "billboard", "shelf", "tally"]` after `"themes"`; add `"newtabLayout": "ledger"` to `"defaults"`; add to `"settings"`:

```json
{ "key": "newtabLayout", "type": "enum", "enum": "newtabLayouts", "default": "ledger", "note": "start-page layout (DS: New tab v2 handoff); synced" }
```

`settings-schema/build.mjs` — follow the `tabSleepDelays` precedent line-for-line (it is the closest analogue: a plain string enum plus a default):

- `genSwift()` (near the `BlancTabSleepDelay` emit, line ~48): `out += 'public enum BlancNewtabLayout: String, CaseIterable {\n'; for (const l of spec.newtabLayouts) out += \`    case ${swiftCase(l)}\n\`; out += '}\n\n';` and in the defaults struct (near line 71): `out += \`    public static let newtabLayout: BlancNewtabLayout = .${swiftCase(spec.defaults.newtabLayout)}\n\`;`
- `genKotlin()` (line ~89): `out += \`enum class BlancNewtabLayout(val id: String) { ${spec.newtabLayouts.map((v) => \`${upper(v)}("${v}")\`).join(', ')} }\n\n\`;` and in defaults (line ~103): `out += \`    val newtabLayout = BlancNewtabLayout.${upper(spec.defaults.newtabLayout)}\n\`;`
- `parseSettingsJs()` (line ~129): `const newtabLayoutBlock = (js.match(/const NEWTAB_LAYOUTS = \[([^\]]*)\]/)?.[1] ?? '').replace(/\/\/.*$/gm, ''); const newtabLayouts = [...newtabLayoutBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);` — add `newtabLayout: s(/^\s*newtabLayout:\s*'([^']*)'/m),` to the parsed defaults (line ~146) and `newtabLayouts` to the returned object (line ~153).
- checker: `cmp('newtabLayouts', js.newtabLayouts, spec.newtabLayouts);` (line ~166) and `eq('newtabLayout', jd.newtabLayout, d.newtabLayout);` (line ~194).

- [ ] **Step 5: Prove the guard actually guards (positive control)**

Run: `npm run settings:build` then `npm run settings:check` — Expected: generated files include `BlancNewtabLayout` in both Swift and Kotlin; check exits 0. Then temporarily change `NEWTAB_LAYOUTS` in settings.js (e.g. drop `'tally'`) and re-run `npm run settings:check` — **Expected: FAIL naming newtabLayouts.** Revert the edit and confirm green again. A checker that passes both ways is not wired up.

- [ ] **Step 6: Run tests and commit**

Run: `node --test test/unit/settings-newtab-layout.test.js && npm run test:unit && npm run substrate:check` — Expected: all PASS.

```bash
git add src/main/settings.js settings-schema/schema.json settings-schema/build.mjs settings-schema/generated test/unit/settings-newtab-layout.test.js
git commit -m "Add the synced newtabLayout setting"
```

---

### Task 3: Start-page IPC — layout + day counts + settings-change broadcast

**Files:**
- Modify: `src/main/pages.js` (the `pages:start:*` block near line 226), `src/main/main.js` (startPage hooks near line 5225, `startPageStatus` near line 5167, a `settings.onSettingsChanged` wiring), `src/main/tab-preload.js` (newtab `start` surface, line ~21)

**Interfaces:**
- Consumes: Task 1's `blockedByDay` data (`adblockWeekStats().data.days`), Task 2's `newtabLayout` setting.
- Produces (renderer-visible): `bowserPages.start.data()` now also returns `{ layout: string, blockedByDay: number[7], blockedBarHeights: number[7], onboarding: {adblockEnabled, theme}|null }`; `bowserPages.start.setLayout(name)` → `pages:start:set-layout`; the `pages:start:status` broadcast payload gains `layout` (renderers re-render layout on status pushes).

- [ ] **Step 1: Extend the hooks and status in main.js**

In the `startPage` hooks object (line ~5225) add:

```js
blockedByDay: () => [...adblockWeekStats().data.days],
blockedBarHeights: () => adblockStatsPolicy.barHeights(adblockWeekStats().data.days),
setLayout: (name) => settings.setSettings({ newtabLayout: String(name) }),
// Least-privilege projection for the onboarding dialog (spec: the dialog must
// initialize from REAL current values, never invented ones — a tour replay
// shows what is actually saved).
onboardingState: () => {
  const s = settings.getSettings();
  return { adblockEnabled: s.adblockEnabled, theme: s.theme };
},
```

In `startPageStatus()` (line ~5167) add `layout: current.newtabLayout,` beside `startup`/`privacy`. After the `broadcastStartPageStatus` definition, wire settings changes to it (so a Settings-page select or a synced change re-inks every open newtab):

```js
settings.onSettingsChanged(() => broadcastStartPageStatus());
```

- [ ] **Step 2: Extend pages.js**

In the `pages:start:*` block: add `layout`, `blockedByDay`, `blockedBarHeights`, and `onboarding` to the `pages:start:data` reply object (`layout: hooks.startPage?.status?.().layout`, `blockedByDay: hooks.startPage?.blockedByDay() ?? [0,0,0,0,0,0,0]`, `blockedBarHeights: hooks.startPage?.blockedBarHeights() ?? [0,0,0,0,0,0,0]`, `onboarding: hooks.startPage?.onboardingState?.() ?? null`), and register:

```js
handle('pages:start:set-layout', 'newtab', (name) => {
  hooks.startPage?.setLayout?.(String(name ?? ''));
});
```

(Validation happens in `setSettings` — an invalid name is a no-op, matching the enum rule.)

- [ ] **Step 3: Extend tab-preload.js**

In the newtab `start` surface add `setLayout: (name) => invoke('pages:start:set-layout', name),`.

- [ ] **Step 4: Verify + commit**

Run: `npm run test:unit && npm run test:acceptance:dry` — Expected: PASS (dry run proves no step-definition drift). Manual probe deferred to Task 5's relaunch.

```bash
git add src/main/main.js src/main/pages.js src/main/tab-preload.js
git commit -m "Feed layout choice and day counts to the start page"
```

---

### Task 4: Newtab markup restructure + footer switcher + layout CSS

**Files:**
- Modify: `src/renderer/pages/newtab.html`, `src/renderer/pages/pages.css`
- Reference: `docs/superpowers/specs/references/2026-08-16-newtab-onboarding/NewtabOnboarding.dc.html` (the four `sc-if` layout blocks and the footer row)

**Interfaces:**
- Produces: `<body class="ledger-body" data-layout="ledger">` with four layout roots — the existing `<main class="ledger">` becomes layout `ledger` (unchanged inside); new empty containers `#layoutBillboard.billboard`, `#layoutShelf.shelf`, `#layoutTally.tally` (populated by Tasks 5–6); footer center becomes `#layoutSwitcher`; CSS classes listed below. Visibility rule: `body[data-layout="X"]` shows only layout X's root.

- [ ] **Step 1: Restructure newtab.html**

Keep the entire current `<main class="ledger">…</main>` (startup card included; the privacy card is removed later, in Task 7). Around it add sibling roots and rework the footer:

```html
<body class="ledger-body" data-layout="ledger">
  <main class="ledger" id="layoutLedger"> … existing content … </main>
  <!-- No `hidden` attributes on layout roots: pages.css's `[hidden]` rule is
       !important and would defeat the data-layout selectors. Visibility is
       CSS-only, driven by body[data-layout]. -->
  <main class="billboard" id="layoutBillboard">
    <div id="bbDate" class="bb-date"></div>
    <div class="bb-clock-row"><span id="bbClock" class="bb-clock"></span><span id="bbMeridiem" class="bb-meridiem"></span></div>
    <div id="bbBlocked" class="bb-blocked"></div>
    <div id="bbFavorites" class="bb-favs"></div>
    <div id="bbGroups" class="bb-groups"></div>
  </main>
  <main class="shelf" id="layoutShelf">
    <div class="shelf-head"><span class="shelf-heading">Where to?</span><span id="shDate" class="shelf-date"></span></div>
    <div id="shFavorites" class="shelf-grid"></div>
    <div class="shelf-cards">
      <div class="shelf-card"><div class="shelf-label">pick up where you left off</div><div id="shGroups" class="shelf-chiprow"></div></div>
      <div class="shelf-card"><div class="shelf-label">blocked</div><div class="shelf-stat"><span id="shBlocked" class="shelf-count"></span><span class="shelf-unit">ads this week</span></div></div>
    </div>
  </main>
  <main class="tally" id="layoutTally">
    <div class="tally-left">
      <div id="tlDate" class="ledger-date"></div>
      <h1 class="ledger-heading">Where to?</h1>
      <div class="ledger-label tally-label">favorites</div>
      <div id="tlFavorites" class="ledger-list"></div>
      <div class="ledger-label tally-label">pick up where you left off</div>
      <div id="tlGroups" class="tally-chiprow"></div>
    </div>
    <div class="tally-right">
      <div class="ledger-label">blocked this week</div>
      <div id="tlCount" class="tally-count"></div>
      <div id="tlChart" class="tally-chart"></div>
      <div id="tlDays" class="tally-days"></div>
      <div id="tlCaption" class="tally-caption"></div>
    </div>
  </main>
  <footer class="ledger-footer">
    <span class="footer-left"><span id="footerLeft"></span> <span id="version" class="ledger-version"></span></span>
    <span id="layoutSwitcher" class="layout-switcher">layout:
      <button data-layout-pick="ledger" type="button">ledger</button> ·
      <button data-layout-pick="billboard" type="button">billboard</button> ·
      <button data-layout-pick="shelf" type="button">shelf</button> ·
      <button data-layout-pick="tally" type="button">tally</button>
    </span>
    <span id="goAnywhere"></span>
  </footer>
```

The version moves into the left cluster (the prototype's footer has no version slot — approved as part of deviation 4's footer adoption; note it in the DS push-back list).

- [ ] **Step 2: Transcribe layout CSS into pages.css**

Add a `/* ===== New tab layouts (DS: New tab v2 handoff — values verbatim) ===== */` section. Visibility plumbing:

```css
/* Default: only the ledger renders. The active non-ledger root is re-shown
   with its OWN display value (billboard is a flex column — display:block
   would break its centering). No [hidden] attributes are involved. */
#layoutBillboard, #layoutShelf, #layoutTally { display: none; }
body[data-layout="billboard"] #layoutLedger,
body[data-layout="shelf"] #layoutLedger,
body[data-layout="tally"] #layoutLedger { display: none; }
body[data-layout="billboard"] #layoutBillboard { display: flex; }
body[data-layout="shelf"] #layoutShelf { display: block; }
body[data-layout="tally"] #layoutTally { display: block; }
/* Non-ledger layouts: the prototype's absolute footer (the ledger keeps its
   shipped in-flow footer — 2026-07-22 decision). */
body:not([data-layout="ledger"]) .ledger-footer {
  position: absolute; bottom: 24px; left: 48px; right: 48px;
  margin: 0; padding: 0;
}
.ledger-footer { opacity: 0.8; }
.layout-switcher, .layout-switcher button { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-dim); }
.layout-switcher button { background: none; border: none; padding: 0; cursor: pointer; }
.layout-switcher button.active { color: var(--text); }
```

Then transcribe each prototype block's inline styles into the classes declared in Step 1, value-for-value. Worked example — the billboard clock row, from the prototype's `sc-if value="{{ layBillboard }}"` block:

```css
.billboard { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; user-select: none; }
.bb-date { font-family: var(--font-mono); font-size: 12px; color: var(--text-dim); letter-spacing: 0.18em; }
.bb-clock-row { display: flex; align-items: baseline; gap: 14px; margin-top: 18px; }
.bb-clock { font-family: var(--font-mono); font-size: 148px; font-weight: 700; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
.bb-meridiem { font-family: var(--font-mono); font-size: 24px; color: var(--text-dim); }
.bb-blocked { font-family: var(--font-mono); font-size: 12.5px; color: var(--text-dim); margin-top: 20px; }
.bb-favs { display: flex; gap: 36px; margin-top: 64px; align-items: flex-start; }
.bb-fav { display: flex; flex-direction: column; align-items: center; gap: 10px; cursor: pointer; }
.bb-fav .tile { width: 32px; height: 32px; border-radius: 6px; background: var(--border); overflow: hidden; }
.bb-fav .label { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-dim); }
.bb-groups { display: flex; gap: 14px; margin-top: 38px; }
```

Do the same, exhaustively, for: the group chip (`.group-chip`: inline-flex, gap 10px, 1px `--border`, radius 999px, padding 7px 16px billboard / 6px 14px shelf+tally, dot cluster 6px `--text-dim` gap 3px, mono 12.5px billboard / 12px shelf+tally names, mono 11px dim count on shelf); the shelf block (`.shelf` absolute left/right 110px top 120px; `.shelf-head` flex space-between baseline; `.shelf-heading` 28px/600 -0.015em; `.shelf-grid` 4-col grid gap 14px margin-top 30px; `.shelf-tile` 1px `--border` radius 6px padding 18px 16px 14px column-flex gap 14px, hover border-color `--text-dim`; tile favicon 28px radius 6px; title 13.5px; domain mono 11px dim margin-top 3px; `.shelf-cards` 2-col grid gap 14px margin-top 14px; `.shelf-card` 1px border radius 6px padding 18px 16px; `.shelf-stat` flex baseline gap 10px margin-top 10px; `.shelf-count` mono 34px `--accent` tabular-nums; `.shelf-unit` mono 11px dim); and the tally block (`.tally-left` absolute left 110px top 120px width 460px; `.tally-right` absolute right 110px top 120px width 280px; `.tally-count` mono 64px/700 -0.03em line-height 1 margin-top 14px tabular-nums; `.tally-chart` flex align-end gap 8px height 110px margin-top 26px border-bottom 1px `--border`; `.tally-bar` flex 1, `--accent-dim` bg, 1px `--border` border with border-bottom none; `.tally-bar.today` background `--accent`, border-color `--accent`, height 100%; `.tally-days` flex gap 8px margin-top 8px mono 10px dim with per-cell flex 1 centered; `.tally-caption` mono 11.5px dim margin-top 20px line-height 1.6; `.tally-label` margin-top 44px for favorites / 40px for groups per the prototype; `.tally-chiprow` flex gap 14px margin-top 14px). Every value must trace to an inline style in the reference file — diff-read the block while transcribing.

- [ ] **Step 3: Visual smoke of the static shells**

Relaunch the dev app (`npm start`), open a new tab, and in DevTools on the page set `document.body.dataset.layout = 'billboard'` (then `shelf`, `tally`): each shell shows positioned and empty, footer absolute on non-ledger, ledger unchanged at rest. (Renderer JS lands next task; this checks CSS only.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/newtab.html src/renderer/pages/pages.css
git commit -m "Add start-page layout shells and the footer switcher"
```

---

### Task 5: Layout rendering + switcher wiring in newtab.js

**Files:**
- Modify: `src/renderer/pages/newtab.js`
- Reference: prototype layout blocks (markup + logic class `renderVals()`)

**Interfaces:**
- Consumes: Task 3's `start.data()` fields (`layout`, `blockedByDay`, `blockedBarHeights`, `onboarding`, plus existing `groups`, `blockedThisWeek`), `start.setLayout(name)`, status broadcasts carrying `layout`; Task 4's DOM ids/classes.
- Produces: `applyLayout(name)` — the single place that flips `data-layout`, marks the active switcher button, starts/stops the billboard clock, and lazily renders the newly active layout.

- [ ] **Step 1: Restructure the data flow**

Refactor the tail of newtab.js: keep every existing behavior (favorites render into `#favoritesList`, groups, remote, launch status) and hold the fetched data in module state so layouts can render from it:

```js
const state = { layout: 'ledger', groups: [], blockedThisWeek: 0, blockedByDay: [0,0,0,0,0,0,0],
                blockedBarHeights: [0,0,0,0,0,0,0], favorites: [], onboarding: null };
const rendered = new Set(); // layouts drawn from the CURRENT data
const invalidate = () => rendered.clear(); // any feed change re-draws on next apply
```

**Both feeds must land before the first non-ledger render** — `bookmarks.list()` and `start.data()` resolve independently, and a layout cached from the earlier one would sit permanently empty (nothing re-renders it). So:

```js
const favoritesReady = window.bowserPages.bookmarks.list().then((items) => {
  state.favorites = items;
  renderLedgerFavorites(items);   // the existing ledger render, extracted
  invalidate();
});
const dataReady = window.bowserPages.start.data().then((data) => {
  Object.assign(state, {
    layout: data.layout ?? 'ledger', groups: data.groups, blockedThisWeek: data.blockedThisWeek,
    blockedByDay: data.blockedByDay ?? state.blockedByDay,
    blockedBarHeights: data.blockedBarHeights ?? state.blockedBarHeights,
    onboarding: data.onboarding ?? null,
  });
  renderLedgerRest(data);         // groups/footer/remote/launch-status, as today
  invalidate();
});
Promise.all([favoritesReady, dataReady]).then(() => applyLayout(state.layout));
```

The ledger keeps rendering incrementally exactly as it does today (no regression in its first paint); only the three new layouts wait, and they are not visible until `applyLayout` runs. `onStatus`: alongside `renderLaunchStatus`, if `status.layout && status.layout !== state.layout` call `applyLayout(status.layout)`. Any later feed update (`onRemoteTabs`, a future refresh) calls `invalidate()` before re-applying.

- [ ] **Step 2: Implement applyLayout + per-layout renderers**

```js
const shortLabel = (url, title) => (hostOf(url).split('.')[0] || (title || '').trim().split(/\s+/)[0] || '·').toLowerCase();

function favTile(sizeClass, b) { /* shared tile builder: letter-first, favicon probe
  exactly as the existing ledger tile does (reuse the same probe/clearFavicon code,
  factored into a helper `decorateTile(tile, b)` extracted from the ledger render) */ }

function renderBillboard() { /* date (letter-spacing handled by CSS), clock via updateClock(),
  blocked line `${state.blockedThisWeek.toLocaleString()} ads blocked this week · nothing followed you home`,
  favorites.slice(0, 6) as .bb-fav tiles with shortLabel, groups as .group-chip buttons
  (dot cluster capped at min(count, 5) like the ledger) wired to start.focusGroup(g.id) */ }

function renderShelf() { /* favorites.slice(0, 8) as .shelf-tile anchors (title + full domain),
  groups as chips with trailing count span, `#shBlocked` = toLocaleString() */ }

function renderTally() { /* left column reuses the ledger row/chip builders into #tlFavorites/#tlGroups;
  right column: #tlCount = state.blockedThisWeek.toLocaleString();
  labels rotated so today is last: order i = (todayIdx + 1 + k) % 7 for k in 0..6 with day
  initials ['mo','tu','we','th','fr','sa','su'][i]; bar height = state.blockedBarHeights[i] + '%'
  for EVERY bar including today — computed in main by the unit-tested barHeights() (zero week =
  all bars 0%, per the spec; the prototype's 100% today-bar is stub data). The last bar still
  gets .today for its solid --accent fill: colour marks today, height is data;
  caption line 1 `busiest day ${dayName}.` using the max bucket's full lowercase weekday,
  line 2 `nothing followed you home.` */ }

function applyLayout(name) {
  state.layout = name;
  document.body.dataset.layout = name;
  for (const b of document.querySelectorAll('[data-layout-pick]'))
    b.classList.toggle('active', b.dataset.layoutPick === name);
  stopClock();
  if (name === 'billboard') startClock(); // minute-aligned setInterval; also renders once now
  if (!rendered.has(name)) {
    if (name === 'billboard') renderBillboard();
    if (name === 'shelf') renderShelf();
    if (name === 'tally') renderTally();
    rendered.add(name);
  }
}
```

Clock helpers per the prototype's exact formatting:

```js
let clockTimer = null;
function updateClock() {
  const t = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  document.getElementById('bbClock').textContent = t.replace(/\s?[AP]M$/i, '');
  document.getElementById('bbMeridiem').textContent = (t.match(/[AP]M$/i) || [''])[0].toLowerCase();
}
function startClock() {
  updateClock();
  const msToMinute = 60000 - (Date.now() % 60000);
  clockTimer = setTimeout(function tick() { updateClock(); clockTimer = setTimeout(tick, 60000); }, msToMinute);
}
function stopClock() { if (clockTimer) { clearTimeout(clockTimer); clockTimer = null; } }
```

Switcher wiring: click on `[data-layout-pick]` → `applyLayout(pick)` immediately (instant, per handoff) + `window.bowserPages?.start.setLayout(pick)`. Private tabs: layouts apply as normal; the private footer-left copy stays as shipped.

Fill in the three renderers completely — no stub bodies. Reuse `hostOf`, the tile/favicon probe, and the group-row builders by extracting them into small helpers rather than duplicating. Empty-state rule (spec): when favorites or groups are empty, hide that section/label/chip-row entirely (the ledger already does this for groups) — no new empty-state copy on the three new layouts.

- [ ] **Step 3: Hand-verify in the relaunched dev app**

Relaunch `npm start`. Verify: switcher flips layouts instantly and persists across app restart; billboard clock ticks at the minute boundary; tally bars reflect `adblock-stats.json` (seed a few blocks by browsing an ad-heavy site); dark/light/private re-ink correctly; ledger is pixel-identical to before at rest; 720px-width media query unharmed. Leave the dev instance open.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/newtab.js
git commit -m "Render the billboard, shelf, and tally start-page layouts"
```

---

### Task 6: Settings UI — layout select + welcome tour row

**Files:**
- Modify: `src/renderer/pages/settings.html` (General section, beside the Appearance select at line ~34), `src/renderer/pages/settings.js` (mirror the `theme` select wiring exactly), `src/main/pages.js` + `src/main/main.js` + `src/main/tab-preload.js` (the welcome-tour IPC below)

**Interfaces:**
- Consumes: Task 2's setting through the settings page's existing get/set IPC (same channel the `theme` select uses — copy its pattern verbatim).
- Produces: `<select id="newtabLayout">` with options ledger/billboard/shelf/tally (labels lowercase, matching the switcher's voice); a "Show welcome tour" action row backed by a new settings-sender IPC. **The sheet's `will-navigate` is default-deny for non-utility, non-http(s) URLs (main.js:1917-1934 hands them to `handOffToOs`), so `location.href = 'blanc://newtab/?tour=1'` would be a no-op** — instead:
  - pages.js: `handle('pages:settings:welcome-tour', 'settings', () => hooks.startPage?.openWelcomeTour?.());`
  - main.js startPage hooks: `openWelcomeTour: () => { const id = createTab('blanc://newtab/?tour=1'); if (id) setActiveTab(id); },` — this runs inside `runInPageRuntime`, so the tab lands in the sheet's own window, and `createTab`'s existing dismissal closes the sheet.
  - tab-preload.js settings surface: `welcomeTour: () => invoke('pages:settings:welcome-tour'),`

- [ ] **Step 1: Add the select + row to settings.html**

```html
<div class="setting">
  <div class="label"><span>New tab layout</span><span class="hint">How blanc://newtab arranges itself</span></div>
  <select id="newtabLayout">
    <option value="ledger">ledger</option>
    <option value="billboard">billboard</option>
    <option value="shelf">shelf</option>
    <option value="tally">tally</option>
  </select>
</div>
<div class="setting">
  <div class="label"><span>Welcome tour</span><span class="hint">Replay the first-run walkthrough; saved choices stay put</span></div>
  <button id="showWelcomeTour" type="button" class="quiet">Show welcome tour</button>
</div>
```

(Match the surrounding markup's exact class vocabulary — inspect the neighboring settings rows and copy their structure; the snippet above must be adjusted to whatever the real row classes are.)

- [ ] **Step 2: Wire in settings.js (renderer)**

Clone the `theme` select's load/save wiring for `newtabLayout` (same read on init, same change-handler write). For the tour button: `document.getElementById('showWelcomeTour').addEventListener('click', () => window.bowserPages?.settings.welcomeTour());` (adjust to the settings surface's real namespace in tab-preload.js). This task also carries the main-side handler/hook/preload additions from the Interfaces block above.

- [ ] **Step 3: Verify + commit**

Relaunched dev app: change layout in Settings → every open newtab re-inks to it (Task 3's broadcast); switcher and select stay in agreement; tour button opens a newtab (dialog arrives in Task 7 — for now the param is inert).

```bash
git add src/renderer/pages/settings.html src/renderer/pages/settings.js
git commit -m "Add the new-tab layout select and welcome tour row to Settings"
```

---

### Task 7: Onboarding IPC + dialog shell (replaces the privacy card)

**Files:**
- Modify: `src/main/pages.js` (widen allowlists, one new handler), `src/main/settings.js` (privacy re-save path), `src/main/main.js` (startPage hooks), `src/main/tab-preload.js` (newtab surface), `src/main/test-hook.js` (privacy-card driving surface → dialog equivalents), `src/renderer/pages/newtab.html` (remove the privacy card, add dialog markup), `src/renderer/pages/pages.css` (dialog styles), `test/desktop/packaged-first-run-smoke.mjs` (asserts the card today — rewrite its selectors/flow against the dialog in this same commit)
- Create: `src/renderer/pages/onboarding.js` (+ `<script src="onboarding.js">` before newtab.js)
- Test: extend the settings unit test with the re-save behavior below
- Reference: prototype dialog block (`sc-if value="{{ showDialog }}"`), steps s0–s4

**Interfaces:**
- Consumes: `startPageStatus()` fields (`privacy.required`, `privacy.searchSuggestions`, `privacy.usagePing`, `startup.phase`), existing `bookmarks.browserSources()/importBrowser()/import()`, `start.completePrivacy(choices)`.
- Produces main-side: the existing `pages:default-browser:get`/`pages:default-browser:set` handlers (pages.js:258-272) get their allowlists widened to `['settings', 'newtab']` — **no new default-browser channel, and the `canSet` guard stays** (a dev run must never register the bare Electron binary; Linux has no API — both replies carry `{ isDefault, canSet }` and `set` mutates only when `canSet`); `pages:start:onboarding-set` → accepts `{ theme?, adblockEnabled? }` ONLY (hand-validated before `settings.setSettings`). settings.js: `completeFirstRunPrivacyChoices` gains a re-save path (below). Preload: `start.defaultBrowser()` → `pages:default-browser:get`, `start.setDefaultBrowser()` → `pages:default-browser:set`, `start.onboardingSet(partial)`, and `bookmarks.import: () => invoke('pages:bookmarks:import')` (widening the main allowlist alone does not expose it — the newtab preload surface at tab-preload.js:15-19 must list it).
- Produces renderer-side: `window.blancOnboarding.maybeShow(status)` — called by newtab.js's `renderLaunchStatus` path with each status; shows the dialog when `(status.privacy?.required || TOUR) && status.startup?.phase !== 'initializing' && status.startup?.phase !== 'failed'` where `TOUR = new URLSearchParams(location.search).has('tour')`; never on private tabs.

- [ ] **Step 1: Main-process handlers + the privacy re-save path**

pages.js: widen `pages:default-browser:get` and `pages:default-browser:set` from `'settings'` to `['settings', 'newtab']` — reuse the existing `defaultBrowserStatus()` helper and its `canSet` guard untouched. Widen `pages:bookmarks:import` from `'bookmarks'` to `['bookmarks', 'newtab']`. Add one new handler:

```js
handle('pages:start:onboarding-set', 'newtab', (partial) => {
  const clean = {};
  if (partial && typeof partial.adblockEnabled === 'boolean') clean.adblockEnabled = partial.adblockEnabled;
  if (partial && typeof partial.theme === 'string') clean.theme = partial.theme; // enum-checked by setSettings
  if (Object.keys(clean).length) hooks.startPage?.applySettings?.(clean);
});
```

main.js startPage hooks gain `applySettings: (clean) => settings.setSettings(clean),`. Preload: the four newtab-surface additions from the Interfaces block.

settings.js — `completeFirstRunPrivacyChoices` currently returns `{completed: true}` immediately once first run is complete (line ~270), which silently discards a tour replay's edits. Restructure: validate the two booleans FIRST (invalid → `{completed:false, error:'invalid-choices'}`); then one shared commit block writes `searchSuggestions`, `usagePing`, and `onboardingVersion = FIRST_RUN_VERSION` with the existing flush/rollback + listener notification, whether or not first run was already complete (re-saving the same marker is idempotent). Extend `test/unit/settings-newtab-layout.test.js` (or the nearest settings unit test) with: completed profile + `completeFirstRunPrivacyChoices({searchSuggestions:false, usagePing:false})` → `completed: true` AND both values actually changed.

- [ ] **Step 2: Dialog markup (newtab.html) + CSS (pages.css)**

Delete the whole `#privacyCard` section (lines 25–51) — superseded. Add the dialog after the footer, transcribed from the prototype with the approved deviations:

- Scrim `#onboardScrim` (`position:absolute; inset:0; background:rgba(0,0,0,0.4)`), dialog `#onboardDialog` (centered 460px, `--surface-raised`, 1px `--border`, radius 10px, `--shadow-popover`), both `hidden` by default.
- Header: `#obStepLabel` (mono 11px dim tracking .12em) + `#obSkip` ("skip setup", hover `--text`).
- Content `#obContent` (padding 2px 24px 0; min-height 264px) with SIX step `<section data-step="N">` blocks:
  - Steps 1–4 transcribed verbatim from prototype s0–s3 (vignette SVGs copied path-for-path — the browser-tile glyphs, the stroked blanc mark `viewBox="0 0 153.09 203.01"` with `stroke-width="4"`, the shield with the brand diagonal, the dotted flows), with deviation edits: step 2 h1 = "Bring your bookmarks", key tile removed (heart tile → arrow → blanc tile), and its source list is `<div id="obSources" class="ob-srclist">` (populated at runtime — the file row is present from the start, browser rows only after discovery) preceded by a `<button id="obLook" class="ob-btn-secondary">Look for installed browsers</button>` and an `<span id="obImportStatus" class="ob-status">` line. **F30/D22 requires that Blanc read no other browser's profile directory until the person asks** — the button is that ask, mirroring the shipped card's "Look for other browsers".
  - Step 5 (privacy — new): h1 "Choose what Blanc may send", body copy carried over from the removed card's intro sentence, then two bordered control rows in the step-4 row style (`1px --border, radius 6px, padding 12px 14px`), each label + the prototype's 36×20 toggle: "Search suggestions" (`#obSuggestions`) and "Help improve Blanc" (`#obPing`), with the card's `<small>` explanations as 11.5px dim sublines.
  - Step 6 transcribed verbatim from prototype s4 (theme cards, literal colors intact).
- Footer: Back (`#obBack`, visibility-hidden on step 1), SIX dots, primary `#obNext` ("Continue" / "Start browsing" on step 6).
- All prototype inline styles become `ob-*` classes in pages.css, values verbatim; the state-driven values (`--adb-left`, `--dot-N`, `--back-vis`, `--imp-*`, `--card-light/dark`, default-button colors) stay CSS custom properties set from JS, exactly like the prototype's `sync()`.

- [ ] **Step 3: onboarding.js state machine**

```js
// First-run onboarding dialog (DS: New tab v2 + onboarding handoff, 6-step
// variant per the 2026-08-16 spec). Owns only the dialog; newtab.js calls
// maybeShow(status) on every status render.
(() => {
  const TOUR = new URLSearchParams(location.search).has('tour');
  const isPrivate = new URLSearchParams(location.search).has('private');
  const LABELS = ['default browser', 'import', 'the island', 'ad blocking', 'privacy', 'theme'];
  const state = { step: 0, shown: false, done: false, defaultSet: false,
    importSource: null, sources: [], adblock: true, suggestions: true, ping: true, theme: null };
  // …element lookups…
  function sync() { /* prototype's sync(), extended to 6 dots + import rows built
    from state.sources; sets every CSS custom property listed in Step 2. The
    default-browser CTA renders disabled (secondary style, same label) while
    state.canSetDefault is false — dev runs and Linux can't register. */ }
  async function show(status, onboarding) {
    state.shown = true;
    // REAL current values only (spec + F30): the projection carries what is
    // actually saved; a tour replay must show it faithfully.
    state.adblock = onboarding ? !!onboarding.adblockEnabled : true;
    state.theme = onboarding?.theme ?? null; // 'system' | 'light' | 'dark'; card marked only for light/dark
    state.suggestions = !!status.privacy?.searchSuggestions;
    state.ping = !!status.privacy?.usagePing;
    const def = await window.bowserPages.start.defaultBrowser();
    state.defaultSet = !!def?.isDefault;
    state.canSetDefault = !!def?.canSet;
    // F30/D22: NO browser-profile discovery here. The import step renders a
    // "Look for installed browsers" secondary button (card's voice) plus the
    // always-present "From a bookmarks file (HTML)…" row; browserSources()
    // runs only when the user clicks Look. Nothing is read until they ask.
    state.sources = [{ id: '__file__', label: 'From a bookmarks file (HTML)…' }];
    state.looked = false;
    scrim.hidden = dialog.hidden = false; sync();
  }
  async function lookForBrowsers() {
    const sources = await window.bowserPages.bookmarks.browserSources();
    state.looked = true;
    state.sources = [...(sources ?? []), { id: '__file__', label: 'From a bookmarks file (HTML)…' }];
    sync(); // empty result renders the card's "No other browser profiles found." line
  }
  function maybeShow(status, onboarding) {
    if (isPrivate || state.shown || state.done) return;
    const startupBusy = status?.startup?.phase === 'initializing' || status?.startup?.phase === 'failed';
    if (startupBusy) return;
    if (TOUR || status?.privacy?.required) show(status, onboarding);
  }
  async function persistPrivacy() {
    const result = await window.bowserPages.start.completePrivacy({
      searchSuggestions: state.suggestions, usagePing: state.ping });
    return !!result?.completed;
  }
  async function finish() {
    // Close ONLY on confirmed persistence — a write failure keeps the dialog
    // up and surfaces the card's error copy in the privacy step's #obError
    // line ("Could not save these choices. Check disk access and try again.").
    if (!(await persistPrivacy())) { showPrivacyError(); state.step = 4; sync(); return; }
    state.done = true; scrim.hidden = dialog.hidden = true;
  }
  // next(): on the import step, if state.importSource is a browser id run
  // importBrowser(id) (render the result line in the step body, prototype
  // voice: `imported N favorites…`), '__file__' runs bookmarks.import();
  // then advance. Step 4 toggle → onboardingSet({adblockEnabled}); step 6
  // card → onboardingSet({theme:'light'|'dark'}) live (a 'system' initial
  // value marks neither card until the user picks). Last step's primary
  // (`Start browsing`) and #obSkip both call finish(). Back never wraps.
  window.blancOnboarding = { maybeShow };
})();
```

Write the full implementation (the comment-condensed parts above must be real code in the file). newtab.js: `renderLaunchStatus` drops all privacy-card logic (delete the card's element lookups and the `privacyContinue`/migration listeners wholesale) and instead ends with `window.blancOnboarding?.maybeShow({ startup, privacy }, state.onboarding);` — the same call goes in the `start.data()` initial render (which stores `onboarding` into `state`) and the `onStatus` handler (idempotent via `state.shown`; status pushes pass the cached `state.onboarding`).

Also update `src/main/test-hook.js`: its first-run surface currently drives `#privacyCard`/`#privacyContinue`. Re-point those selectors at the dialog (`#onboardDialog`, `#obSkip`, `#obNext`) keeping the hook's existing function names so F30-3's step definitions keep resolving; if a name no longer fits the dialog's shape, update the step definition in the same commit. Same for `test/desktop/packaged-first-run-smoke.mjs` — rewrite its card assertions against the dialog (it gates releases; a stale selector fails the release runbook, not CI).

- [ ] **Step 4: Hand-verify the full flow on a scratch fresh profile**

Point the dev app at a scratch userData (dev profile relocation notes in repo memory; simplest: temporarily move `~/Library/Application Support/blanc-Dev` aside). Verify: dialog appears over the ledger on first launch; all six steps navigate; **the default-browser CTA renders in its disabled state (dev is unpackaged → `canSet:false`) — this is correct, not a bug; the live OS-prompt path can only be checked in a packaged build (`npm run dist:dir`), so do that check there or defer it to release validation**; the import step reads nothing until "Look for installed browsers" is clicked, then lists real browsers (or the not-found line) alongside the file row, and reports counts; adblock + theme apply live; skip on step 1 saves privacy defaults (check `settings.json`: `onboardingVersion: 1`, both booleans present); relaunch shows no dialog; Settings → Show welcome tour replays it with the real saved values, and changing a choice there re-saves it (verify in `settings.json`). Restore your real dev profile after.

- [ ] **Step 5: Unit + dry acceptance + commit**

Run: `npm run test:unit && npm run test:acceptance:dry` — Expected: PASS.

```bash
git add src/main/pages.js src/main/main.js src/main/tab-preload.js src/renderer/pages/newtab.html src/renderer/pages/newtab.js src/renderer/pages/onboarding.js src/renderer/pages/pages.css
git commit -m "Replace the first-run privacy card with the six-step onboarding dialog"
```

---

### Task 8: Governance — spec/ features, parity matrix, acceptance scenarios

**Files:**
- Modify: `spec/features.md` (the register — highest existing is **F34**, so these are **F35** and **F36**; verify at write time), `spec/parity-matrix.md`, `spec/acceptance/index.md` (the traceability grid — every scenario ID gets a row; the file list table gets the new files)
- Create: `spec/acceptance/newtab-layouts.feature`, `spec/acceptance/onboarding.feature`
- Modify: `test/desktop/cucumber.mjs` (`RUNNABLE` list), `test/desktop/steps/` (definitions for whatever is registered)

**Tag conventions (from `spec/acceptance/browser-migration.feature`, follow exactly):** feature-level `@domain-name @F# [@D#]`; each scenario `@F#-n` (stable id) plus a platform tag (`@all`, or `@desktop`/`@mobile` where the behavior is platform-specific). **There is no `@backlog` tag in this repo.** The `dry`/`runnable` profiles select by the explicit `RUNNABLE` id list in `test/desktop/cucumber.mjs:21` — a scenario not listed there is simply not selected, so `test:acceptance:dry` stays green whether or not it has steps. That means the dry run alone proves nothing about new coverage: **any scenario this task registers in `RUNNABLE` must have real step definitions, and the desktop run must be observed executing it.**

- [ ] **Step 1: Read `spec/README.md` and `spec/features.md`; add F35 and F36**

**F35 — Start page layouts:** four layouts (ledger/billboard/shelf/tally), the synced `newtabLayout` setting, footer switcher + Settings select, per-day blocked stats feeding the tally chart. **F36 — First-run onboarding:** the six-step dialog, gating on the first-run marker, replacing the standalone privacy card, replayable from Settings. Write them in the register's established voice (behavior contract, not implementation). F36 supersedes part of **F30**'s "first-run card" wording — update F30's text so the two don't contradict, and keep F30/D22's explicit-discovery rule intact (the dialog honors it via the Look button). Note the desktop-only surfaces (OS default-browser registration, live browser-profile import) as divergence candidates per the register's conventions.

- [ ] **Step 2: Gherkin scenarios**

`spec/acceptance/newtab-layouts.feature`:

```gherkin
@newtab-layouts @F35
Feature: Start page layouts
  The start page offers four layouts of the same material; the choice is the
  person's, persists across restarts, and travels with their profile.

  @F35-1 @all
  Scenario: The saved layout is the one that renders
    Given a profile whose start page layout is "shelf"
    When I open a new tab
    Then the start page renders the "shelf" layout

  @F35-2 @all
  Scenario: Choosing a layout persists it
    Given a new tab is open
    When I choose the "tally" start page layout
    Then the saved start page layout is "tally"
    And the start page renders the "tally" layout
```

`spec/acceptance/onboarding.feature`:

```gherkin
@onboarding @F36 @F30
Feature: First-run onboarding
  A fresh profile is walked through the choices that shape the browser, once,
  and never reads another browser's data without being asked.

  @F36-1 @all
  Scenario: A fresh profile is offered the walkthrough
    Given a fresh profile
    When I open a new tab
    Then the onboarding walkthrough is shown

  @F36-2 @all
  Scenario: Skipping still records the privacy choices
    Given the onboarding walkthrough is shown
    When I skip the walkthrough
    Then my first-run privacy choices are saved
    And opening a new tab does not show the walkthrough again

  @F36-3 @all
  Scenario: A profile that finished first run is not asked again
    Given a profile that completed first run
    When I open a new tab
    Then the onboarding walkthrough is not shown

  @F36-4 @desktop
  Scenario: The walkthrough reads no other browser profile until asked
    Given the onboarding walkthrough is shown
    When I reach the import step
    Then no other browser profile has been read
```

- [ ] **Step 3: Update `spec/acceptance/index.md`**

Add the two files to the Files table and a traceability row per scenario id (F35-1, F35-2, F36-1…F36-4) with the existing status vocabulary (desktop ✅ once its steps pass, iOS/Android ⬜; `@desktop`-tagged F36-4 gets ➖ on mobile columns).

- [ ] **Step 4: Implement step definitions and register them in RUNNABLE**

Implement all six scenarios against the test hook (`globalThis.__blanc` under `BLANC_TEST=1`; extend `src/main/test-hook.js` — env-gated only — with: read/set the layout setting, read the rendered `document.body.dataset.layout`, dialog visible/dismissed, first-run marker + privacy values, and a "browser sources were read" counter for F36-4). Add `'@F35-1', '@F35-2', '@F36-1', '@F36-2', '@F36-3', '@F36-4'` to `RUNNABLE` in `test/desktop/cucumber.mjs:21`.

If a scenario genuinely cannot be driven, leave it OUT of `RUNNABLE` and say so explicitly in the commit message — an unlisted scenario is invisible to CI, so it must be a stated decision, never a silent omission.

- [ ] **Step 5: Prove they execute (positive control)**

Run: `npm run test:acceptance:dry` — Expected: PASS, and the output lists the new ids. Then `npm run test:acceptance:desktop` — **Expected: the new scenarios appear as executed and passing** (count them in the summary; a green run that never mentions them means the tags didn't select). Then break one deliberately (e.g. flip the expected layout string) and confirm it FAILS before reverting.

- [ ] **Step 6: Commit**

```bash
git add spec/ test/desktop/ src/main/test-hook.js
git commit -m "Spec the start-page layouts and onboarding as platform features"
```

---

### Task 9: Full verification sweep + notes

**Files:**
- Modify: `.design-sync/NOTES.md` (DS push-back list)

- [ ] **Step 1: Full local gates**

Run, in order, expecting every one green:

```bash
npm run test:unit
npm run substrate:check
npm run test:acceptance:dry
npm run test:acceptance:desktop
```

- [ ] **Step 2: Hand-check the checklist**

Relaunched dev app: four layouts × light/dark/private; ledger at rest byte-identical to pre-change (screenshot compare); footer switcher + Settings select agreement across two open newtabs; billboard clock across a minute boundary; tally with real day data and with an all-zero week; onboarding fresh-profile flow end-to-end (scratch profile), tour replay; 1440px pill fit untouched (chrome unchanged, but confirm). Leave the dev instance open.

- [ ] **Step 3: Record the DS push-back list**

Append to `.design-sync/NOTES.md` under the 2026-08-16 section: the shipped deviations to mirror back to the DS handoff/prototype — 6-step dialog with privacy step, bookmarks-only import copy + detected-sources list, footer version placement. (The actual DS push is a separate approved design-sync run, not part of this plan.)

- [ ] **Step 4: Commit**

```bash
git add .design-sync/NOTES.md
git commit -m "Record the DS push-back list for the newtab handoff deviations"
```
